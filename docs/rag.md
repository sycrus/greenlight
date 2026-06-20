# RAG — retrieval-augmented generation

This doc covers the RAG pipeline: how content is ingested, how retrieval works, and how to deploy and operate the `llama-rag` microservice on GCP.

---

## How it works

```
User message
  → Parlant (guideline: "answerable from knowledge base")
    → rag_agent tool → POST agent:8000/chat { agent: "rag" }
      → LangGraph graph → ragAgentNode
        → retrieveContext() → POST llama-rag:8001/retrieve
          → pgvector semantic search (cosine similarity)
        → callClaude(sonnet-4-6, context injected into system prompt)
        → CitationsCard component spec { sources: [...] }
```

Retrieval is **unconditional** — `ragAgentNode` always calls `/retrieve` first. There is no classification step inside the agent. Parlant owns the routing decision.

---

## Components

### `backend/llama-rag/` — Python FastAPI microservice (port 8001)

Exposes three endpoints:

| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | GET | Liveness probe |
| `/retrieve` | POST | Semantic search — returns top-k chunks + source URLs |
| `/ingest` | POST | Chunk, embed, and upsert documents into pgvector |

**Chunking:** `SentenceSplitter(chunk_size=512, chunk_overlap=50)` — applied before embedding so retrieval is precise rather than returning whole pages.

**Embeddings:** `text-embedding-3-small` (OpenAI, 1536 dims) — consistent with Mem0's embedding model so both share the same pgvector instance without dimension conflicts.

**Vector store:** `rag_documents` table in the shared `agent_memory` Cloud SQL database.

### `backend/agent/src/agents/rag.ts` — LangGraph node

- Always retrieves first (`retrieveContext(userText)`)
- Injects retrieved chunks as numbered context blocks into the Claude system prompt
- Uses `claude-sonnet-4-6` (not the default haiku) for higher accuracy on knowledge-base questions
- Returns `CitationsCard` component spec when sources are found

### `backend/agent/src/tools/retrieve.ts` — shared HTTP client

Any agent node can call `retrieveContext(query, topK?)`. Returns a `ToolResult<RetrieveData>` — falls back gracefully to empty results on failure, never throws.

Auth: reads `LLAMA_RAG_AUTH_TOKEN` from env for local dev against Cloud Run. When `LLAMA_RAG_URL` is `https://`, it auto-fetches a GCP identity token via `google-auth-library` (ADC locally, metadata server on Cloud Run).

### `frontend/design-system/src/components/CitationsCard.tsx`

Renders source URLs as clickable links below the RAG response. Registered in `registry.json` with `requiredProps: ["sources"]`. Includes a skeleton state for the `TOOL_CALL_START` phase.

---

## Parlant routing

Guideline in `backend/parlant/config/guidelines.yaml`:

```yaml
condition: "The user asks a question that can be answered from product documentation, website content, or the knowledge base"
action: "Use the rag_agent tool to retrieve relevant information and answer the question accurately and completely."
tags: [routing, rag]
```

The `rag_agent` tool in `entrypoint.py` calls `_call_agent("rag", ...)` which POSTs to `agent:8000/chat` with `{ agent: "rag" }`. The LangGraph router picks this up and routes to `ragAgentNode`.

---

## Local development

```bash
# Start llama-rag + postgres
docker compose up postgres llama-rag -d

# Verify healthy
curl http://localhost:8001/health   # → {"status":"ok"}

# Ingest endava content
python scripts/ingest_local.py \
  --pages-dir ~/Downloads/endava-scrape/endava-pages \
  --index     ~/Downloads/endava-scrape/endava-pages-index.json

# Dry run (no POST, just stats)
python scripts/ingest_local.py --pages-dir ... --dry-run
```

**Ingest script options:**

| Flag | Description |
|---|---|
| `--pages-dir DIR` | Directory of `.md` files (endava-pages or similar) |
| `--index FILE` | `endava-pages-index.json` — adds URL/title metadata |
| `--json-dir DIR` | Alternative: directory of `.json` files with `{url, title, content}` |
| `--dry-run` | Print stats without POSTing |

`INGEST_BATCH_SIZE` env var controls batch size (default 25). `LLAMA_RAG_URL` overrides the service URL.

**Rebuilding after changing `main.py`:**

```bash
docker compose build llama-rag && docker compose up -d llama-rag
```

---

## Production — GCP (Cloud Run + Cloud SQL)

### Prerequisites

- `setup-gcp.sh` already run (Cloud SQL instance + service account exist)
- `gcloud auth login && gcloud auth application-default login`
- Docker running (for local image build)

### Step 1 — provision RAG GCP resources (one-time)

```bash
OPENAI_API_KEY=sk-... ./scripts/setup-rag-gcp.sh
```

This script is idempotent — safe to re-run. It provisions:

| Resource | Details |
|---|---|
| GCS bucket | `PROJECT-rag-content`, Sydney, 365-day lifecycle |
| Secret Manager | `gen-ux-openai-key` (OPENAI_API_KEY) |
| IAM roles | `storage.objectViewer/Creator`, `artifactregistry.writer`, `run.invoker`, `secretmanager.secretAccessor` |
| Artifact Registry | `gen-ux` Docker repo |
| Cloud Run service | `llama-rag`, private (`--no-allow-unauthenticated`), Cloud SQL socket attached |

At the end it prints `LLAMA_RAG_URL` — add it to `.env`.

### Step 2 — ingest content to GCP

```bash
LLAMA_RAG_URL=https://llama-rag-xxx.run.app \
LLAMA_RAG_AUTH_TOKEN=$(gcloud auth print-identity-token) \
python scripts/ingest_local.py \
  --pages-dir ~/Downloads/endava-scrape/endava-pages \
  --index     ~/Downloads/endava-scrape/endava-pages-index.json
```

The identity token expires after 1 hour. For large ingests, re-run with a fresh token if needed.

### Step 3 — point the agent at Cloud Run

The agent reads `LLAMA_RAG_URL` from env. When this is an `https://` URL, `retrieve.ts` auto-fetches GCP identity tokens — no manual token needed in production.

```bash
# .env
LLAMA_RAG_URL=https://llama-rag-xxx.run.app
```

When the agent is also on Cloud Run, it fetches tokens from the GCP metadata server automatically using the `gen-ux-agent` service account.

### Redeploying after code changes

```bash
REGION=australia-southeast1
PROJECT=aip-generative-exp-n0005168
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/gen-ux/llama-rag"

docker build --platform linux/amd64 -t "${IMAGE}:latest" backend/llama-rag
docker push "${IMAGE}:latest"
gcloud run deploy llama-rag --image="${IMAGE}:latest" --region=$REGION --project=$PROJECT --quiet
```

---

## Cloud SQL connection

`_make_vector_store()` in `main.py` auto-detects the environment:

| `CLOUD_SQL_CONNECTION_NAME` set? | Connection method |
|---|---|
| Yes (Cloud Run) | Unix socket: `/cloudsql/PROJECT:REGION:INSTANCE` via `psycopg2` + `asyncpg` |
| No (local docker-compose) | TCP: `DB_HOST:DB_PORT` via `PGVectorStore.from_params()` |

---

## Continuous ingestion (Cloud Scheduler / Eventarc)

`backend/llama-rag/ingest_job.py` is a standalone script for Cloud Run Jobs:

- **Full re-index:** scans all `.json` files in `gs://BUCKET/PREFIX` and calls `/ingest` in batches
- **Incremental (Eventarc):** pass a GCS blob path as `argv[1]` to ingest a single file

To trigger a full re-index manually:

```bash
# Upload raw scrape to GCS
gsutil -m cp ~/Downloads/endava-scrape/endava-pages/*.md gs://PROJECT-rag-content/scraped/

# Run ingest_job.py against GCS (requires ADC)
RAG_GCS_BUCKET=PROJECT-rag-content \
LLAMA_RAG_URL=https://llama-rag-xxx.run.app \
python backend/llama-rag/ingest_job.py
```

Eventarc trigger setup is documented in the output of `setup-rag-gcp.sh`.

---

## Testing

### Python unit tests (no DB or API key needed)

```bash
cd backend/llama-rag
pip install -r requirements.txt pytest httpx
pytest tests/ -v
```

18 tests covering `/health`, `/retrieve`, `/ingest` — all endpoints mocked via `patch.object(main, "_index", mock_index)`.

### Integration test (requires real pgvector + OpenAI key)

```bash
DB_HOST=localhost OPENAI_API_KEY=sk-... pytest tests/ -v
```

Ingests a canary document then retrieves it by semantic query — fails if the chunk isn't returned.

### TypeScript unit tests

```bash
pnpm --filter @gen-ux/agent test
```

Covers `retrieve.ts` (11 tests) and `rag.ts` (15 tests) — both fully mocked, no live services needed.

---

## Troubleshooting

**500 on `/ingest` after deploy**

Check Cloud Run logs:
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=llama-rag AND severity>=ERROR" \
  --project=PROJECT --limit=20 --freshness=10m
```

Common causes:
- `ValueError: invalid literal for int() with base 10: 'None'` — wrong `PGVectorStore` constructor call. Must use `PGVectorStore(connection_string=..., async_connection_string=...)` directly (not `from_params`) for Unix socket connections.
- `DB_PASSWORD` secret not attached — check `--set-secrets` in the deploy command.
- Cloud SQL socket not mounted — check `--add-cloudsql-instances` flag.

**Agent routes to `customer_service` instead of `rag`**

Most likely cause: the Docker agent image is stale and doesn't have `ragAgentNode`. Rebuild:
```bash
docker compose build agent && docker compose up -d --force-recreate agent
```

Confirm routing by checking Parlant sandbox at `http://localhost:8800` — it shows which tool was called per turn.

**Retrieval returns training-data answers (not indexed content)**

The pgvector index may be empty. Run the ingest script. To confirm data is present:
```bash
TOKEN=$(gcloud auth print-identity-token)
curl -s -X POST https://llama-rag-xxx.run.app/retrieve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "Endava industries", "top_k": 3}' | python3 -m json.tool
```

If `chunks` is empty, the index is empty — re-run ingest.

**Langfuse doesn't show `rag_agent` traces**

Langfuse v2 doesn't support the OTLP endpoint. Traces are logged to console instead. Use LangSmith as the primary trace dashboard. See the known infrastructure constraint in `CLAUDE.md`.
