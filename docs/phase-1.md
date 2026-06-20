# Phase 1 — What's Included

## Goal
A working end-to-end spine: user sends a message, it flows through Parlant's brand guardrails, the right LangGraph agent handles it, the response streams back to the UI. Everything else is stubbed with clear handoff points for Phase 2.

---

## What's Built

### Parlant (`backend/parlant`)
- **Docker container** — Python, self-hosted, port 8800
- **OpenAI NLP service** — guideline embedding/relevance scoring only; all conversation LLM calls go through Claude
- **10 guidelines** loaded from `config/guidelines.yaml`: brand tone, empathy, competitor deflection, refund escalation, terminology enforcement, memory save/recall, weather routing, RAG routing, customer service routing
- **Five tools** registered: `weather_agent`, `rag_agent`, `customer_service_agent`, `save_memory`, `recall_memories`
- **Sandbox UI** at `http://localhost:8800` — conversations, guideline matches, tool calls, full reasoning trace per turn

### Backend (`backend/agent`)
- **Express server** — HTTP/SSE on port 8000. Endpoints: `POST /chat`, `GET /health`
- **LangGraph graph** — stateful graph with `MemorySaver` checkpointer (in-process)
- **Weather agent** — calls OpenWeatherMap, returns structured weather data + `WeatherCard`
- **RAG agent** — unconditional retrieval via `llama-rag`, generates grounded response with `claude-sonnet-4-6`, returns `CitationsCard`
- **Customer service agent** — handles everything else, streams a response
- **Anthropic adapter** — wraps `@anthropic-ai/sdk` directly; default `claude-haiku-4-5-20251001`, RAG agent uses `claude-sonnet-4-6`
- **`MemoryStore` interface** — auto-selects Mem0Adapter or PlaceholderMemoryStore from env vars
- **OTel instrumentation** — all nodes wrapped in spans; exports to console (Langfuse v2 OTLP not supported — use LangSmith)

### RAG (`backend/llama-rag`)
- **LlamaIndex FastAPI microservice** — port 8001; endpoints: `/retrieve`, `/ingest`, `/health`
- **Chunking** — `SentenceSplitter(chunk_size=512, chunk_overlap=50)` applied before embedding
- **Embeddings** — `text-embedding-3-small` (OpenAI, 1536d) stored in pgvector `rag_documents` table
- **`retrieveContext()` shared tool** — any LangGraph agent node can call it; auto-fetches GCP identity tokens
- **GCP deployment** — Cloud Run (private, IAM auth), Artifact Registry, GCS bucket — provisioned via `setup-rag-gcp.sh`
- **933 Endava pages → 5,600+ chunks** ingested via `scripts/ingest_local.py`
- See [docs/rag.md](rag.md) for full details

### Frontend (`frontend/app`)
- **Next.js app** — App Router, Tailwind CSS, Shadcn primitives
- **ChatWindow** — message list, input, loading state
- **AG-UI SSE client** — raw fetch-based event stream parser (`lib/ag-ui/client.ts`)
- **Next.js API route** (`/api/chat`) — manages Parlant sessions, sends messages, polls for `ai_agent` reply, converts to AG-UI SSE stream for the browser
- **Component registry** — validates AG-UI specs against `registry.json` before render
- **ComponentRenderer** — maps validated specs to React components; renders skeletons on `TOOL_CALL_START`
- **WeatherCard** + **CitationsCard** — generative UI components with skeletons

### Design system (`frontend/design-system`)
- **Shadcn primitives** — `Button`, `Input`
- **WeatherCard + WeatherCardSkeleton** — weather generative UI component
- **CitationsCard + CitationsCardSkeleton** — RAG source citations component
- **`registry.json`** — manually maintained; CI-generated from Storybook in Phase 2
- **`tokens/tokens.css`** — DTCG 3-layer token structure placeholder

### Skills (`backend/skills/`)
- `brand-response.md` — tone rules, banned/approved terms, structural rules
- `component-selection.md` — when to render a component vs plain text, spec format, self-correction
- `memory-distillation.md` — extraction rules and LLM-as-judge scoring (placeholder — Phase 2)
- `rag-query-construction.md` — query decomposition and reranking rules (placeholder — Phase 2)

### Tests
- `tests/tools/weather.test.ts` — input validation, mock fallback, live API
- `tests/tools/retrieve.test.ts` — RAG retrieval tool: success shape, error handling, auth header, defaults
- `tests/agents/rag.test.ts` — ragAgentNode: always retrieves, context injection, sonnet model, CitationsCard, fallback
- `tests/agents/orchestrator.test.ts` — routing logic (unit), intent classification (integration)
- `backend/llama-rag/tests/test_main.py` — 18 Python tests: all endpoints, fully mocked

### Repo
- pnpm monorepo with `pnpm-workspace.yaml`
- `docker-compose.yml` — Postgres, Mem0, Agent, Parlant, llama-rag, Langfuse
- `.env.example` — all env vars documented with fallback notes

---

## Request flow

```
1. Browser sends POST /api/chat { message, userId, sessionId }
2. Next.js route gets/creates a Parlant session for the sessionId
3. Message sent to Parlant: POST /sessions/{id}/events { source: "customer", kind: "message" }
4. Parlant evaluates guidelines:
   a. Brand/tone/compliance rules → applied directly to Parlant's response
   b. Routing guideline fires → Parlant calls weather_agent / rag_agent / customer_service_agent tool
5. Tool call: POST agent:8000/chat { agent: "rag" | "weather" | "customer_service" }
   → LangGraph graph routes to the correct node
   → RAG node: calls llama-rag /retrieve → injects chunks into Claude system prompt → CitationsCard
   → Weather node: calls OpenWeatherMap → WeatherCard
   → Customer service node: streams response
6. Next.js polls GET /sessions/{id}/events until status=ready + stage=completed
7. Agent reply (source=ai_agent, kind=message) extracted and converted to AG-UI SSE
8. Browser AG-UI client receives SSE, ChatWindow renders response + optional component
```

---

## What's Stubbed (Phase 2 handoff points)

Every stub is marked `TODO (phase 2)` in the code.

| Stub | File | What connects here |
|---|---|---|
| Memory reads at session start | `customer-service.ts` | Mem0 / MemoryStore hydration |
| Memory writes (hot path + distillation) | `weather.ts`, `customer-service.ts` | Mem0 / MemoryStore writes |
| Contentful guideline sync | `parlant/entrypoint.py` | Replace static YAML with Contentful webhook |
| CopilotKit hooks | `ChatWindow.tsx` | Replace raw AG-UI client with `useCopilotChat` |
| RAG upsert dedup | `llama-rag/main.py` | `VectorStoreIndex.refresh_ref_docs()` |
| OTel → Langfuse | `observability/otel.ts` | Requires Langfuse v3 + ClickHouse (see CLAUDE.md) |
| Postgres checkpointer | `graph/index.ts` | Swap `MemorySaver` for `PostgresSaver` |
| MCP server | — | Phase 2 — gateway prereqs must be in place first |

---

## Running Phase 1

```bash
cp .env.example .env
# Required: ANTHROPIC_API_KEY, OPENAI_API_KEY
# Optional: WEATHER_API_KEY (mock data if unset)

pnpm install
docker compose build agent parlant llama-rag
docker compose up postgres mem0 agent parlant llama-rag langfuse-db langfuse -d
pnpm --filter @gen-ux/frontend dev   # frontend :3000

# Ingest content into RAG (local)
python scripts/ingest_local.py \
  --pages-dir ~/Downloads/endava-scrape/endava-pages \
  --index     ~/Downloads/endava-scrape/endava-pages-index.json
```

### Verify Parlant is wired

```bash
# Check agent is registered
curl http://localhost:8800/agents

# Test guideline deflection (Parlant handles directly, no agent call)
curl -X POST http://localhost:8800/sessions \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "<ID_FROM_ABOVE>"}'

curl -X POST http://localhost:8800/sessions/<SESSION_ID>/events \
  -H "Content-Type: application/json" \
  -d '{"source": "customer", "kind": "message", "message": "How do you compare to competitors?"}'

curl http://localhost:8800/sessions/<SESSION_ID>/events
```

**Prompt examples by agent:**
- `"What is the weather in London?"` → `weather_agent` → WeatherCard
- `"What industries does Endava work with?"` → `rag_agent` → CitationsCard
- `"I need help with my order"` → `customer_service_agent`
- `"How does this compare to competitors?"` → Parlant responds directly (deflection guideline)

### Parlant sandbox UI

Open `http://localhost:8800` to see conversations, guideline matches, tool calls, and the full reasoning trace per turn.
