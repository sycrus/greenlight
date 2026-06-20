# CLAUDE.md — Flame Game

Guidance for Claude Code working in this monorepo.

---

## Project context — read this first

This repo is mid-pivot. Two distinct products coexist:

- **Current code (predecessor):** an Endava lead-gen chatbot that generates prospect-specific slide decks. Stack: Parlant + LangGraph (TypeScript) + Anthropic Claude SDK + Mem0 OSS + llama-rag + AG-UI SSE + pgvector + Langfuse + Next.js. The code in `backend/` and `frontend/` is this product. The patterns below describe how to work in it.
- **Target product (canonical):** **Flame Game — Pre-Production Intelligence Agent v0.1**, a governed pre-production pipeline for short-form branded video that outputs a Google Slides deck + a portable creative package (Flow-ready) with two approval gates. Target stack: Vertex AI (Agent Engine, Pipelines, Gemini 2.5 Flash, Imagen 3, Firestore, GCS, Cloud Functions) + Google Slides/Drive APIs. **The authoritative spec is [`PRD.md`](./PRD.md)** at the repo root.

The component-by-component migration map from current code → Vertex AI target is in [PRD.md §7](./PRD.md). Five components are in-scope for the port; four are deliberately dropped (Mem0, llama-rag, AG-UI, the Endava-specific agents); one (Parlant) is folded into the parsed-brief and Visual DNA data model rather than run as a service.

**Before starting any non-trivial work, ask:** am I touching the predecessor code (use the patterns below) or building Flame Game v0.1 (consult PRD.md first, expect Vertex AI services, no LangGraph/Parlant/Mem0/llama-rag)?

The original Endava-platform PRD has been archived at [`docs/archive/prd-v0.2-superseded-2026-06.md`](./docs/archive/prd-v0.2-superseded-2026-06.md) — consult it only for historical context on why the predecessor code looks the way it does.

---

## Monorepo structure

```
gen-ux/
├── frontend/
│   ├── app/           Next.js App Router (port 3000 / 3001)
│   └── design-system/ component library + registry.json
└── backend/
    ├── agent/         TypeScript Express + LangGraph (port 8000)
    ├── parlant/       Python behavioural guardrails (port 8800)
    └── skills/        SKILL.md behavioural specs (not code — prompts for agents)
```

Package manager: **pnpm workspaces** (`pnpm-workspace.yaml`). Never use npm or yarn.

---

## Dev commands

```bash
# Start everything
pnpm dev                        # runs all apps/** in parallel

# Per-package
pnpm --filter @gen-ux/agent dev
pnpm --filter @gen-ux/frontend dev

# Tests
pnpm test                       # all packages
pnpm --filter @gen-ux/agent test

# TypeScript check
pnpm --filter @gen-ux/agent lint   # runs tsc --noEmit

# Docker
docker compose up -d            # all services
docker compose build agent      # rebuild agent image only
```

Environment: copy `.env.example` → `.env` at the repo root. The agent dev script loads it via `tsx watch --env-file ../../.env`.

---

## TypeScript rules (strict — enforce these)

`tsconfig.base.json` enables `strict`, `exactOptionalPropertyTypes`, and `noUncheckedIndexedAccess`. This means:

- **Never assign `undefined` to an optional property directly.** Use a conditional spread:
  ```typescript
  // WRONG
  const obj = { key: maybeUndefined }
  // RIGHT
  const obj = { ...(maybeUndefined !== undefined && { key: maybeUndefined }) }
  ```
- **Always check array index access** — `arr[0]` is `T | undefined` under `noUncheckedIndexedAccess`.
- **Unused parameters** that must exist for a signature: prefix with `_` (e.g., `_userId`).
- **Module imports** inside `backend/agent` use `.js` extensions (ESM, `"type": "module"`). Imports inside `frontend/design-system` do **not** — Next.js `transpilePackages` resolves TypeScript source directly.

---

## LangGraph 1.x patterns

LangGraph `@langchain/langgraph@^1.2.0` requires `value` (not `reducer`) for scalar state fields:

```typescript
// CORRECT for scalars in LangGraph 1.x
userId: Annotation<string>({ value: (_, update) => update, default: () => "" }),

// WRONG — "reducer" only works for array merge reducers
userId: Annotation<string>({ reducer: (_, u) => u }),
```

Message arrays use `reducer`:
```typescript
messages: Annotation<BaseMessage[]>({
  reducer: (existing, update) => [...existing, ...update],
  default: () => [],
}),
```

---

## Anthropic adapter

`backend/agent/src/providers/anthropic.adapter.ts` is the only file that calls the Anthropic SDK. Everything else calls `callClaude()` or `streamClaude()`. Do not import `@anthropic-ai/sdk` elsewhere.

- Default model: `claude-haiku-4-5-20251001` (configurable via `DEFAULT_MODEL` env var)
- Orchestrator gets a smarter model — pass `model: "claude-sonnet-4-6"` in options
- `client.messages.stream()` is **synchronous** (returns a stream object, not a promise) — do not `await` it

---

## Memory

`backend/agent/src/memory/mem0.adapter.ts` exports `createMemoryStore()` which auto-selects:
- **Mem0Adapter** — if `MEM0_API_KEY` or `MEM0_BASE_URL` is set
- **PlaceholderMemoryStore** — in-memory fallback (no persistence; used in tests and local dev)

All agent code uses the `MemoryStore` interface from `./types.js`. Never import `Mem0Adapter` directly outside this file.

---

## AG-UI SSE protocol

The agent streams Server-Sent Events in this order:

```
RUN_STARTED
TEXT_MESSAGE_START   { role: "assistant" }
TEXT_MESSAGE_CONTENT { delta: "..." }   (one or more)
TEXT_MESSAGE_END
RUN_FINISHED         { agentNode: "..." }
```

On error: `RUN_ERROR { message: "..." }` replaces the above.

Each event is JSON on a `data:` line: `data: {...}\n\n`.

The frontend client is at `frontend/app/src/lib/ag-ui/client.ts`. It calls the Next.js API proxy at `/api/chat`, which forwards to the agent at `AGENT_URL` (default `http://localhost:8000`).

---

## Component registry

`frontend/design-system/registry.json` is the authoritative list of renderable components. The agent embeds a `component_spec` JSON block in its response text. `ComponentRenderer` at `frontend/app/src/components/registry/ComponentRenderer.tsx` parses it, validates it against the registry, and renders the component (real or skeleton).

To add a new component:
1. Build the component in `frontend/design-system/src/components/`
2. Export it from `frontend/design-system/src/index.ts`
3. Register it in `frontend/design-system/registry.json`
4. Add a case to `frontend/app/src/lib/registry/index.ts`

---

## Parlant (primary orchestrator + behavioural guardrails)

`backend/parlant/` is a **Python** service — do not add TypeScript to it. It runs as a separate Docker container on port 8800.

**NLP service:** `NLPServices.openai` — OpenAI GPT-4.1 handles guideline evaluation/response generation; text-embedding-3-small handles guideline embeddings. Both require `OPENAI_API_KEY`. Note: switching to `NLPServices.anthropic` pulls in JinaAI BERT (needs `torch`, ~2GB) — not worth it given GPT-4.1's cost/perf.

**Architecture: Parlant is the primary orchestrator.** LangGraph agents are subagents called as tools.

**How it works:**
- Every user message goes to Parlant first
- Parlant evaluates which of the 10 guidelines in `config/guidelines.yaml` apply
- Brand/tone/compliance rules are enforced directly in Parlant's own response
- Memory guidelines fire `save_memory` or `recall_memories` tools (call Mem0 directly)
- Routing guidelines fire the `langgraph_agent` tool (`POST agent:8000/chat`) for tasks needing real data or multi-step workflows
- Tool parameters: `message` only — `session_id` and `customer_id` come from `p.ToolContext`

**Three tool types registered in `entrypoint.py`:**
- `langgraph_agent` — delegates actionable requests to the LangGraph agent server
- `save_memory` — stores a user detail in Mem0 (`POST mem0:8080/v1/memories/`)
- `recall_memories` — retrieves relevant user memories from Mem0 (`POST mem0:8080/v1/memories/search/`)

**Guideline tags** (in `config/guidelines.yaml`) control which tool(s) get associated:
- `[routing]` → `langgraph_agent`
- `[memory, save]` → `save_memory`
- `[memory, recall]` → `recall_memories`
- no tool tag → Parlant responds directly

**Sandbox UI:** `http://localhost:8800` — shows guideline matches, tool calls, reasoning trace per turn.

**Frontend integration:** `frontend/app/src/app/api/chat/route.ts` manages Parlant sessions and polls `GET /sessions/{id}/events` for replies. Agent reply events have `source: "ai_agent"`, `kind: "message"`. Processing is complete when a `kind: "status"` event has `data.status: "ready"` and `data.data.stage: "completed"`.

**Rebuilding:** `entrypoint.py` is baked into the Docker image (`COPY`) — requires `docker compose build parlant`. `config/guidelines.yaml` is bind-mounted — only needs `--force-recreate`.

---

## Docker

Both services build from the **monorepo root** as context (required for `pnpm-lock.yaml` and workspace resolution):

```yaml
# docker-compose.yml
agent:
  build:
    context: .
    dockerfile: backend/agent/Dockerfile
```

The agent Dockerfile uses a multi-stage build: `deps` → `build` (tsc + pnpm deploy) → `runner`. The `pnpm deploy` step runs inside the `build` stage so workspace root files are present.

---

## Testing approach

- Tests are **integration-first** — they hit real dependencies where possible, not mocks
- Vitest for backend; Playwright for frontend E2E
- Test files live in `backend/agent/tests/` (not co-located with source)
- Run `pnpm --filter @gen-ux/agent test` before committing agent changes

---

## Pre-port Endava TODOs (deprecated — do not action)

These `TODO (phase 2)` markers were written for the Endava product's Phase 2 roadmap. That roadmap is no longer active (see Project context above). The stubs remain in the codebase but will not be completed — the underlying components are dropped or replaced in the Flame Game port (see [PRD.md §7.1](./PRD.md) for the per-component decision).

| Location | Was going to become | Status under Flame Game |
|---|---|---|
| `backend/agent/src/graph/index.ts` | `MemorySaver` → Postgres checkpointer | Dropped — LangGraph agent server is replaced by Vertex AI Pipelines DAG |
| `backend/agent/src/memory/mem0.adapter.ts` | PlaceholderMemoryStore → real Mem0/pgvector | Dropped — Mem0 is deferred (PRD §7.1, §11) |
| `backend/agent/src/agents/*.ts` | RAG retrieval tool calls | Dropped — llama-rag is deferred (PRD §7.1, §11) |
| `backend/agent/src/observability/otel.ts` | ConsoleSpanExporter → OTLPTraceExporter | Dropped — Langfuse is replaced by Vertex AI Pipelines dashboard + Cloud Logging |
| `backend/parlant/config/guidelines.yaml` | Static YAML → Contentful sync job | Dropped — Endava-specific; brand rules folded into Flame Game's parsed brief + Visual DNA |

If you encounter these markers, leave them in place unless you are actively removing the containing file as part of the Flame Game port.

---

## Known infrastructure constraints

### Langfuse: stay on v2, do NOT upgrade to v3

`docker-compose.yml` pins `langfuse/langfuse:2`. **Do not bump this to v3.**

Langfuse v3 requires ClickHouse as a second database — it will refuse to start without `CLICKHOUSE_URL` set. The OTel OTLP endpoint (`/api/public/otel/v1/traces`) does not exist in v2, so agent traces currently go to the console instead. Fixing this requires either:
- Adding a ClickHouse container to docker-compose (heavy — ~500 MB image, significant compose changes), or
- Replacing the OTel exporter in `otel.ts` with the Langfuse Node.js SDK (direct API calls, no ClickHouse needed)

Until that work is done, use **LangSmith** (`http://smith.langchain.com`) as the primary tracing dashboard.
