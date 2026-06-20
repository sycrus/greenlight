# Gen UX — Agentic AI Platform

Generative UI platform for **EA Sports Madden Ultimate Team**, powered by LangGraph, Parlant, and Anthropic Claude. User messages flow through Parlant (brand guardrails) to specialist LangGraph agents that handle player card lookups, team-building advice, and knowledge-base retrieval (RAG); responses stream back as AG-UI events that render branded React components in real time. Long-term user memory is handled by a self-hosted Mem0 OSS service backed by pgvector on Cloud SQL.

---

## Quick start

```bash
cp .env.example .env        # fill in ANTHROPIC_API_KEY and OPENAI_API_KEY at minimum
pnpm install

# 1. Build Docker images (required on first run and after changes to agent, parlant, or llama-rag source)
docker compose build agent parlant llama-rag

# 2. Start backing services
docker compose up postgres mem0 agent parlant llama-rag langfuse-db langfuse -d

# 3. Start the frontend (hot-reload)
pnpm --filter @gen-ux/frontend dev   # frontend :3000

# 4. (Optional) LangGraph Studio — live graph debugger
pnpm --filter @gen-ux/agent studio   # starts langgraph dev on :2024
# Open: https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024
```

> **Rebuilding after code changes:**
> - `backend/agent/` changed → `docker compose build agent && docker compose up -d agent`
> - `backend/parlant/entrypoint.py` changed → `docker compose build parlant && docker compose up -d parlant`
> - `backend/parlant/config/guidelines.yaml` changed → `docker compose up -d --force-recreate parlant` (bind-mounted, no rebuild needed)
> - `backend/llama-rag/` changed → `docker compose build llama-rag && docker compose up -d llama-rag`

Without `MEM0_BASE_URL` the agent falls back to an in-memory store with no persistence.

> **RAG — ingest content after first start:**
> ```bash
> # Local (llama-rag running in docker compose)
> python scripts/ingest_local.py \
>   --pages-dir ~/Downloads/mut-scrape/mut-pages \
>   --index     ~/Downloads/mut-scrape/mut-pages-index.json
>
> # Against Cloud Run (token expires hourly)
> LLAMA_RAG_URL=https://llama-rag-xxx.run.app \
> LLAMA_RAG_AUTH_TOKEN=$(gcloud auth print-identity-token) \
> python scripts/ingest_local.py --pages-dir ... --index ...
> ```
> See [docs/rag.md](docs/rag.md) for GCP provisioning and continuous ingestion.

---

## Repo structure

```
gen-ux/
├── frontend/
│   ├── app/                Next.js App Router (port 3000)
│   └── design-system/      Component library + registry.json
├── backend/
│   ├── agent/              TypeScript · Express · LangGraph (port 8000)
│   ├── parlant/            Behavioural control layer (Python · Docker, port 8800)
│   ├── mem0/               Self-hosted Mem0 OSS memory server (Python · Docker, port 8080)
│   ├── llama-rag/          RAG retrieval microservice (Python · Docker, port 8001)
│   └── skills/             SKILL.md behavioural specs (prompts, not code)
├── scripts/
│   ├── setup-gcp.sh        Idempotent GCP provisioning (Cloud SQL, SA, Secret Manager)
│   ├── setup-rag-gcp.sh    RAG GCP provisioning (GCS bucket, Artifact Registry, Cloud Run)
│   ├── deploy-mem0.sh      Deploy mem0 service to Cloud Run
│   ├── ingest_local.py     Ingest local scraped content into llama-rag
│   └── init-db.sql         pgvector schema for Cloud SQL
└── logs/                   Timestamped test output (gitignored)
```

---

## Architecture

```
Browser
  ↓ POST /api/chat
Next.js API route
  ↓ REST (session + events)
Parlant  :8800          ← brand guidelines enforced here
  ↓ tool call (when routing guideline fires)
Agent server  :8000     ← LangGraph graph
  ├── player_agent        → PlayerCard component
  ├── rag_agent           → CitationsCard component
  │     ↓ retrieveContext()
  │   llama-rag  :8001   ← LlamaIndex + pgvector
  └── team_builder_agent
  ↓ AG-UI SSE events (proxied back through Parlant → Next.js)
ChatWindow  →  ComponentRenderer  →  PlayerCard / CitationsCard / text

Memory layer (cross-session):
Parlant  ↔  Mem0 OSS  :8080  ↔  pgvector (Cloud SQL / local Docker)
Agent    ↗               ↑ distillation: Claude Haiku + OpenAI embeddings
```

Parlant handles every message. Simple Q&A and brand/compliance rules are enforced directly by Parlant. Requests needing real data or multi-step workflows are delegated to the LangGraph agent as a tool call. RAG queries always retrieve first — no secondary classification step inside the agent.

---

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude — all LLM calls in the agent server and Mem0 distillation |
| `OPENAI_API_KEY` | Yes | Parlant guideline embedding + Mem0/llama-rag embeddings (text-embedding-3-small) |
| `DEFAULT_MODEL` | No | Default: `claude-haiku-4-5-20251001` — rag_agent always uses sonnet |
| `MEM0_BASE_URL` | No | Self-hosted Mem0 URL — `http://localhost:8080` locally, Cloud Run URL in prod |
| `MEM0_API_KEY` | No | Mem0 cloud key — only needed if using managed Mem0 instead of self-hosted |
| `VERTEX_PROJECT` | No | GCP project ID — enables Vertex AI + Cloud SQL memory adapter |
| `PARLANT_URL` | No | Default: `http://localhost:8800` |
| `AGENT_URL` | No | Default: `http://localhost:8000` |
| `LLAMA_RAG_URL` | No | Default: `http://localhost:8001` — set to Cloud Run URL in prod |
| `RAG_GCS_BUCKET` | No | GCS bucket for raw scraped content (ingest_job.py / Cloud Scheduler) |
| `RAG_GCS_PREFIX` | No | Default: `scraped/` |

Memory adapter priority: `MEM0_BASE_URL` → `MEM0_API_KEY` → `VERTEX_PROJECT` → in-memory placeholder.

---

## Services

| Service | Port | Start |
|---|---|---|
| Frontend (Next.js) | 3000 | `pnpm --filter @gen-ux/frontend dev` |
| Agent (LangGraph) | 8000 | `docker compose up agent` |
| Parlant | 8800 | `docker compose up parlant` |
| Mem0 OSS | 8080 | `docker compose up mem0` |
| llama-rag (RAG) | 8001 | `docker compose up llama-rag` |
| Postgres + pgvector | 5432 | `docker compose up postgres` |
| Langfuse (traces UI) | 3002 | `docker compose up langfuse-db langfuse` |

Parlant sandbox UI (conversations, guideline traces, tool calls): `http://localhost:8800`

---

## Observability & Tooling

### Langfuse — LLM trace dashboard

> **Note:** Langfuse v2 (pinned in docker-compose) does not support the OTLP endpoint. Agent traces go to console. Use LangSmith as the primary dashboard. See `CLAUDE.md` for details before upgrading Langfuse.

```bash
docker compose up langfuse-db langfuse -d
# Open: http://localhost:3002  (login: admin@gen-ux.local / localdev)
```

### LangSmith — LangGraph Studio + cloud tracing
Requires a free account at [smith.langchain.com](https://smith.langchain.com). Add your API key to `.env`:

```bash
LANGSMITH_API_KEY=lsv2_...
LANGSMITH_TRACING=true
LANGSMITH_PROJECT=aip-gen-ux
```

**Studio** (live graph debugger — inspect state at each node, replay runs):
```bash
pnpm --filter @gen-ux/agent studio   # starts langgraph dev on :2024
# Open: https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024
```

---

## Memory

Long-term user memory is handled by `backend/mem0`. See [docs/deploy-memory.md](docs/deploy-memory.md) for full deployment details.

**Local dev:**
```bash
docker compose up postgres mem0 -d
# MEM0_BASE_URL=http://localhost:8080 is set by default in .env
```

**Production (Cloud Run):**
```bash
./scripts/setup-gcp.sh      # provision Cloud SQL + SA + secrets (idempotent)
./scripts/deploy-mem0.sh    # build + deploy mem0 to Cloud Run, output service URL
```

---

## RAG

Knowledge-base retrieval is handled by `backend/llama-rag` — a LlamaIndex FastAPI microservice. See [docs/rag.md](docs/rag.md) for full details.

**Local dev:**
```bash
docker compose up postgres llama-rag -d
python scripts/ingest_local.py \
  --pages-dir ~/Downloads/mut-scrape/mut-pages \
  --index     ~/Downloads/mut-scrape/mut-pages-index.json
```

**Production (Cloud Run):**
```bash
OPENAI_API_KEY=sk-... ./scripts/setup-rag-gcp.sh   # provision + deploy (idempotent)
# Then ingest with LLAMA_RAG_URL pointing at Cloud Run URL
```

---

## GCP infrastructure

| Resource | Script | Details |
|---|---|---|
| Cloud SQL | `setup-gcp.sh` | PostgreSQL 18, Sydney (`australia-southeast1`), shared by Mem0 + RAG |
| Mem0 Cloud Run | `deploy-mem0.sh` | Self-hosted Mem0 OSS |
| llama-rag Cloud Run | `setup-rag-gcp.sh` | LlamaIndex RAG service, private (IAM auth) |
| GCS bucket | `setup-rag-gcp.sh` | Raw scraped content for re-index jobs |
| Service account | `setup-gcp.sh` | `gen-ux-agent@PROJECT.iam.gserviceaccount.com` |
| Secret Manager | both scripts | DB password, OPENAI_API_KEY |

Auth uses Application Default Credentials (`gcloud auth application-default login`) — no JSON key file needed.

---

## Testing

```bash
pnpm --filter @gen-ux/agent test        # TypeScript agent tests
cd backend/llama-rag && pytest tests/ -v  # Python RAG service tests
```

| File | What it covers |
|---|---|
| `tests/tools/weather.test.ts` | Schema validation, mock fallback, live API |
| `tests/tools/retrieve.test.ts` | RAG retrieval tool — success shape, error handling, auth header |
| `tests/agents/rag.test.ts` | ragAgentNode — retrieval, context injection, CitationsCard, fallback |
| `tests/agents/orchestrator.test.ts` | Routing unit tests + intent classification |
| `tests/memory/memory-store.test.ts` | `PlaceholderMemoryStore` unit tests |
| `tests/memory/user-flows.test.ts` | Mem0 integration (skipped without `MEM0_BASE_URL`) |
| `backend/llama-rag/tests/test_main.py` | `/health`, `/retrieve`, `/ingest` — 18 tests, fully mocked |

---

## Adding a new agent

1. Create `backend/agent/src/agents/my-agent.ts` — export an async node function matching the `GraphState` signature
2. Register the node in `backend/agent/src/graph/index.ts`
3. Add a routing guideline in `backend/parlant/config/guidelines.yaml` with appropriate tags
4. Register the tool in `backend/parlant/entrypoint.py`
5. Write a Vitest test in `backend/agent/tests/agents/`
6. Rebuild: `docker compose build agent parlant && docker compose up -d agent parlant`

## Adding a new UI component

1. Create the component in `frontend/design-system/src/components/`
2. Export it from `frontend/design-system/src/index.ts`
3. Add an entry to `frontend/design-system/registry.json` with `requiredProps`, `variants`, `useWhen`, `skeletonComponent`
4. Import and register it in `frontend/app/src/components/registry/ComponentRenderer.tsx`

---

## Key files

| File | What it does |
|---|---|
| `backend/parlant/entrypoint.py` | Parlant startup — agent, guidelines, tools: `player_agent`, `rag_agent`, `team_builder_agent`, `save_memory`, `recall_memories` |
| `backend/parlant/config/guidelines.yaml` | Brand/tone/compliance/routing rules |
| `backend/llama-rag/main.py` | LlamaIndex RAG service — `/retrieve`, `/ingest`, `/health` |
| `backend/llama-rag/ingest_job.py` | Cloud Run Job — reads from GCS, calls `/ingest` |
| `backend/mem0/server.py` | Mem0 OSS FastAPI server |
| `backend/agent/src/graph/index.ts` | LangGraph graph topology |
| `backend/agent/src/agents/rag.ts` | RAG agent node — retrieves then generates |
| `backend/agent/src/tools/retrieve.ts` | Shared retrieval HTTP client (any agent can import) |
| `backend/agent/src/providers/anthropic.adapter.ts` | Claude provider |
| `backend/agent/src/memory/mem0.adapter.ts` | `MemoryStore` factory |
| `frontend/app/src/app/api/chat/route.ts` | Parlant session management + SSE conversion |
| `frontend/app/src/components/registry/ComponentRenderer.tsx` | Spec → React component |
| `frontend/design-system/registry.json` | Component registry |
| `scripts/setup-gcp.sh` | Cloud SQL + SA provisioning |
| `scripts/setup-rag-gcp.sh` | RAG GCP provisioning (GCS, Artifact Registry, Cloud Run) |
| `scripts/ingest_local.py` | Local ingest — MUT pages or JSON dir |

---

## Phase 1 — what's done

### RAG (`backend/llama-rag`)
- LlamaIndex FastAPI microservice — `/retrieve`, `/ingest`, `/health`
- `SentenceSplitter(chunk_size=512, chunk_overlap=50)` — chunking before embedding
- `text-embedding-3-small` (OpenAI, 1536d) in pgvector `rag_documents` table
- `rag_agent` LangGraph node — unconditional retrieval, sonnet-4-6, `CitationsCard` component
- `retrieveContext()` shared tool — any agent can import it
- Auto-fetches GCP identity tokens via `google-auth-library` for Cloud Run auth
- 18 Python unit tests (fully mocked) + 11+15 TypeScript unit tests
- GCP: Cloud Run (`llama-rag`), GCS bucket, Artifact Registry — provisioned via `setup-rag-gcp.sh`
- MUT knowledge base ingested via `ingest_local.py`
- `CitationsCard` + `CitationsCardSkeleton` design system components

### Memory (`backend/mem0`)
- Self-hosted Mem0 OSS on FastAPI — compatible with `mem0ai` npm client REST API
- Distillation: dedup, contradiction resolution, entity extraction via Claude Haiku
- Embeddings: OpenAI `text-embedding-3-small` (1536d) stored in pgvector
- Local: Docker Compose (`postgres` + `mem0` services)
- Production: Cloud Run + Cloud SQL, provisioned via `scripts/`
- 12 integration user-flow tests

### Parlant (`backend/parlant`)
- Python Docker container on port 8800
- 10 guidelines loaded from `config/guidelines.yaml` (brand, compliance, memory, routing)
- Five tools: `player_agent`, `rag_agent`, `team_builder_agent`, `save_memory`, `recall_memories`
- Sandbox UI at `http://localhost:8800`

### Backend (`backend/agent`)
- Express HTTP/SSE server — `POST /chat`, `GET /health`
- LangGraph stateful graph: `player_agent`, `rag_agent`, `team_builder_agent` nodes
- Anthropic SDK adapter — `claude-haiku-4-5-20251001` default, `claude-sonnet-4-6` for RAG
- OTel instrumentation — all nodes traced

### Frontend + Design system
- `PlayerCard`, `CitationsCard` — generative UI components with skeletons
- `ComponentRenderer` — validates specs against `registry.json`, renders skeletons on `TOOL_CALL_START`

---

## Phase 2 — next up

| Location | What to do |
|---|---|
| `backend/agent/src/graph/index.ts` | Swap `MemorySaver` → Postgres checkpointer |
| `backend/agent/src/agents/*.ts` | Activate memory read stubs for context hydration |
| `backend/llama-rag/main.py` | Upsert dedup via `VectorStoreIndex.refresh_ref_docs()` |
| `backend/parlant/config/guidelines.yaml` | Replace static YAML with Contentful sync job |
| `frontend/app` | Replace `AGUIClient` with `useCopilotChat` from `@copilotkit/react-core` |
| Observability | Add ClickHouse to docker-compose → upgrade Langfuse v2 → v3 for OTLP support |
