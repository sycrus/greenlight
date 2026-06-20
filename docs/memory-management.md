# Memory Management

Reference for all memory features in gen-ux. Use this doc when adding new memory capabilities.

---

## Architecture overview

```
User message
  ↓
Parlant  ──→  recall_memories tool  ──→  Mem0 OSS  ──→  pgvector
  ↓                                         ↑
  ↓           save_memory tool  ────────────┘   (hot-path: explicit preferences)
  ↓
LangGraph agent
  ↓
server.ts  ──→  memoryStore.search()  ──→  Mem0  (hydrate state.memories before graph)
  ↓
graph.invoke()  →  state.memories injected into agent system prompt
  ↓
server.ts  ──→  memoryStore.add()  ──→  Mem0  (write after response, if non-ephemeral)
```

**Two write paths:**
- **Parlant hot-path** — `save_memory` tool fires when a guideline detects an explicit user preference or correction. Immediate write, no scoring.
- **Agent post-response** — `server.ts` writes the user message after graph completion. Skips ephemeral routes.

**One read path:**
- `server.ts` calls `memoryStore.search()` before the graph runs. Results land in `state.memories` as `string[]`, injected into the customer-service agent's system prompt.

---

## Memory types (target — partially implemented)

| Type | Backend | Written when | Status |
|---|---|---|---|
| Semantic | pgvector | User states preference, fact, or account detail | Implemented — default type on all writes |
| Episodic | pgvector | Complaint resolved, workflow completed, escalation | Implemented — `classifyEpisodicEvent()` classifier fires after each customer-service response |
| Procedural | Postgres JSONB | Routing pattern repeats across sessions | Not implemented |

`type` is stored in `MemoryEntry` and persisted in Mem0 metadata. All current writes default to `"semantic"`. Episodic writes will be added when agent-response memory is implemented. Procedural is phase 2 (LLM-as-judge pattern detection).

`toMemoryType()` in `mem0.adapter.ts` reads the type back from metadata on retrieval, defaulting unknown values to `"semantic"`.

---

## What gets written (write rules)

### Agent post-response (`server.ts`)

| Condition | Write? | Reason |
|---|---|---|
| `route.agent === "weather"` | No | Ephemeral — no long-term value |
| `route.agent === "customer_service"` | Yes | Preferences, account details, intent |
| Any future agent | Default No | New agents must explicitly opt-in |

Metadata stored with each write: `{ sessionId, agentRoute }`.

### Parlant hot-path (`entrypoint.py`)

`save_memory` fires on the `[memory, save]` guideline. Writes immediately when the user explicitly states a preference or corrects the agent. See `config/guidelines.yaml` for trigger conditions.

### What is never written

- Weather queries and responses
- Routine Q&A with no signal value (enforced by Mem0 distillation scoring)
- Content already in memory without meaningful update (Mem0 dedup)

---

## What gets read (read rules)

Two retrieval paths — different triggers:

### Parlant retrieval — conditional

`recall_memories` fires only when a matching guideline evaluates as true (e.g. a personalisation or recall guideline). Parlant decides whether context is needed based on the message. Most messages don't trigger it.

See `config/guidelines.yaml` for the conditions that trigger recall.

### Agent retrieval — job-dependent

`server.ts` currently calls `memoryStore.search()` **before every graph invocation**, before routing is known. This is a gap — weather queries don't need user context, but they pay the search cost anyway.

Target behaviour: retrieval should be opt-in per agent node. Agents that require user context (customer-service) should call `memoryStore.search()` themselves. Agents that don't (weather, lookup) should skip it entirely.

Each agent node that needs memory context calls `memoryStore.search()` itself at the start of its node. Agents that don't need context (weather, lookup) never touch memory on the read path.

```ts
// customer-service.ts — search runs only when this agent is invoked
const lastMessage = state.messages.at(-1)
const query = typeof lastMessage?.content === "string" ? lastMessage.content : ""
const recalled = query ? await memoryStore.search(state.userId, query, 5) : []
const memoryContext = recalled.length > 0
  ? `\n\nWhat you know about this user:\n${recalled.map((m) => `- ${m.content}`).join("\n")}`
  : ""
```

The orchestrator does **not** currently use memories for routing. See Phase 2 gap below.

---

## Storage backend

**Local dev:** Docker Compose (`postgres` + `mem0` services)
- pgvector on Postgres 18 (`agent_memory` database, `mem0_memories` table)
- Mem0 OSS FastAPI server at `http://localhost:8080`

**Production:** Cloud Run + Cloud SQL
- Deploy: `./scripts/deploy-mem0.sh`
- Provision: `./scripts/setup-gcp.sh`
- Set `MEM0_BASE_URL` to the Cloud Run URL in the agent's env

**Adapter selection** (priority order in `mem0.adapter.ts`):
1. `MEM0_BASE_URL` set → `Mem0Adapter` (self-hosted OSS)
2. `MEM0_API_KEY` set → `Mem0Adapter` (managed cloud)
3. `VERTEX_PROJECT` set → `VertexMemoryAdapter`
4. None → `PlaceholderMemoryStore` (in-memory, no persistence)

---

## Interface contract

All agent code uses `MemoryStore` from `backend/agent/src/memory/types.ts`. Never import `Mem0Adapter` directly outside `mem0.adapter.ts`.

```ts
interface MemoryStore {
  add(userId: string, content: string, metadata?: Record<string, unknown>): Promise<string>
  search(userId: string, query: string, topK?: number): Promise<MemoryEntry[]>
  getAll(userId: string): Promise<MemoryEntry[]>
  delete(userId: string, memoryId: string): Promise<void>
  deleteAll(userId: string): Promise<void>  // GDPR erasure
}
```

---

## Adding a new agent — memory checklist

**Rule: memory is opt-in, not automatic.** A new agent does nothing with memory by default. Explicitly decide each of the following:

### Read (retrieval)
- Does this agent need user context to do its job? If **no** (weather, lookup, calculation) — do nothing. Memory search is never called.
- If **yes** — add a `memoryStore.search()` call at the top of the agent node, using the last user message as the query. Inject results into the system prompt. Follow the pattern in `customer-service.ts`.
- Never rely on `state.memories` being pre-populated — that field starts empty. The agent is responsible for its own retrieval.

### Write (storage)
- Is the user's intent worth remembering across sessions? If **no** — update the ephemeral filter in `server.ts` to exclude the new route name.
- If **yes** — the post-response write in `server.ts` handles it automatically once the route is not excluded.
- If the agent surfaces **hot-path signals** (user states a preference, corrects the agent, confirms account details) — call `memoryStore.add()` inline inside the node, don't wait for the post-response write.

### Document it
- Add the new agent's write rule to the table in the "What gets written" section above.

---

## Phase 2 gaps

| Gap | Location | Description |
|---|---|---|
| LLM-as-judge scoring | `server.ts` | Score candidate memories before writing (importance / recency / specificity ≥ 3/5). See `backend/skills/memory-distillation.md` for the prompt shape |
| Session-end distillation job | New file | Batch job that scores the full conversation transcript at session end and writes episodic memories |
| Memory types | `types.ts`, `server.ts` | Add `type: "semantic" \| "episodic" \| "procedural"` to `MemoryEntry` and route writes accordingly |
| Route-aware retrieval | `server.ts:82` | Move `memoryStore.search()` inside agent nodes that need it; remove pre-graph blanket search |
| Orchestrator memory context | `orchestrator.ts:46` | Hydrate memories before routing to inform agent selection |
| Postgres checkpointer | `graph/index.ts:50` | Replace `MemorySaver` with `PostgresSaver` for durable cross-session LangGraph state |
| GDPR erasure endpoint | `server.ts` | Expose `DELETE /users/:userId/memories` that calls `memoryStore.deleteAll()` |
| Agent response writes | `server.ts` | Write agent response (not just user message) for episodic events — complaint resolutions, confirmed details |
