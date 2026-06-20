# Memory — deployment guide

This doc covers how to run the memory stack locally and deploy it to GCP (Cloud Run + Cloud SQL). The memory layer is a self-hosted Mem0 OSS server that provides long-term, per-user memory with automatic distillation (dedup, contradiction resolution, entity linking) backed by pgvector.

---

## How it works

```
TypeScript agent
  ↕  mem0ai npm client (REST)
Mem0 OSS server  (backend/mem0/server.py)
  ↕  mem0 Python library
  ├── Claude Haiku  ← distillation (dedup, contradiction resolution)
  ├── OpenAI text-embedding-3-small  ← 1536d embeddings
  └── pgvector (Postgres)  ← vector + metadata storage
```

The agent's `createMemoryStore()` factory auto-selects the backend:

| Env var set | Adapter used |
|---|---|
| `MEM0_BASE_URL` | `Mem0Adapter` → self-hosted server |
| `MEM0_API_KEY` | `Mem0Adapter` → Mem0 cloud (managed) |
| `VERTEX_PROJECT` | `VertexMemoryAdapter` → Vertex AI + Cloud SQL directly |
| none | `PlaceholderMemoryStore` → in-memory, no persistence |

---

## Local development

**Prerequisites:** Docker Desktop running.

```bash
# Start Postgres (pgvector) and Mem0 server
docker compose up postgres mem0 -d

# Verify both are healthy
docker compose ps
curl http://localhost:8080/health   # → {"status":"ok"}
```

The `.env` file already has `MEM0_BASE_URL=http://localhost:8080` — no changes needed for local dev.

**Tear down:**
```bash
docker compose down
docker compose down -v   # also wipe the postgres volume
```

**Rebuild after changing server.py:**
```bash
docker compose build mem0
docker compose up mem0 -d
```

---

## Production — GCP (Cloud Run + Cloud SQL)

### Prerequisites

- `gcloud` CLI installed: `brew install google-cloud-sdk`
- Logged in: `gcloud auth login && gcloud auth application-default login`
- Project access: you need `Editor` or the specific roles granted by `setup-gcp.sh`

### Step 1 — provision GCP resources (one-time)

```bash
./scripts/setup-gcp.sh
```

This script is idempotent — safe to re-run. It provisions:

| Resource | Details |
|---|---|
| Cloud SQL instance | PostgreSQL 18, `gen-ux-memory`, Sydney (`australia-southeast1`), 2 vCPU / 8 GB, 10 GB storage auto-grow |
| Database | `agent_memory` |
| DB user | `agent` (password auto-generated, stored in Secret Manager) |
| Secret Manager | `gen-ux-db-password`, plus placeholders for API keys |
| Service account | `gen-ux-agent@PROJECT.iam.gserviceaccount.com` |
| IAM roles | `aiplatform.user`, `cloudsql.client`, `secretmanager.secretAccessor` |

At the end, the script prints `.env` values — copy them:

```
VERTEX_PROJECT=aip-generative-exp-n0005168
VERTEX_LOCATION=australia-southeast1
CLOUD_SQL_CONNECTION_NAME=aip-generative-exp-n0005168:australia-southeast1:gen-ux-memory
```

### Step 2 — bootstrap the database schema (one-time)

Run `init-db.sql` against the new Cloud SQL instance:

```bash
# Option A: Cloud SQL Proxy (recommended for CI / scripts)
gcloud components install cloud-sql-proxy
cloud-sql-proxy aip-generative-exp-n0005168:australia-southeast1:gen-ux-memory &
PGPASSWORD="$(gcloud secrets versions access latest --secret=gen-ux-db-password)" \
  psql -h 127.0.0.1 -U agent -d agent_memory -f scripts/init-db.sql

# Option B: interactive Cloud SQL shell
gcloud sql connect gen-ux-memory --user=agent --database=agent_memory
# then paste or \i scripts/init-db.sql
```

`init-db.sql` creates:
- `vector` and `uuid-ossp` extensions
- `memories` table (uuid, user_id, content, embedding vector(768), metadata JSONB, created_at)
- `memories_user_id_idx` — fast exact lookup
- `memories_embedding_idx` — ivfflat cosine ANN index (`lists=100`)

> **Note:** Mem0 OSS also creates its own `mem0_memories` table via `pgvector` provider on first startup. The `memories` table in `init-db.sql` is used by the `VertexMemoryAdapter` only. Both tables can coexist.

### Step 3 — deploy Mem0 OSS to Cloud Run

```bash
./scripts/deploy-mem0.sh
```

This script:
1. Enables Cloud Run, Cloud Build, and Artifact Registry APIs
2. Stores `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` from `.env` into Secret Manager
3. Grants the service account access to those secrets
4. Builds and deploys `backend/mem0` via `gcloud run deploy --source` (Cloud Build)
5. Prints the service URL

At the end it prints:
```
==> Mem0 server live at: https://mem0-server-xxxx-ts.a.run.app

==> Add to your .env:
    MEM0_BASE_URL=https://mem0-server-xxxx-ts.a.run.app
```

Set `MEM0_BASE_URL` in your production agent's environment (Cloud Run env var or Secret Manager) to this URL.

### Step 4 — point the agent at the Cloud Run service

**If the agent also runs on Cloud Run:**
```bash
gcloud run services update gen-ux-agent \
  --region=australia-southeast1 \
  --set-env-vars="MEM0_BASE_URL=https://mem0-server-xxxx-ts.a.run.app"
```

**If running the agent locally against the Cloud Run mem0:**
```bash
# .env
MEM0_BASE_URL=https://mem0-server-xxxx-ts.a.run.app
```

---

## Cloud Run service configuration

The `deploy-mem0.sh` deploys with these defaults:

| Setting | Value |
|---|---|
| Memory | 512 Mi |
| CPU | 1 vCPU |
| Min instances | 0 (cold start on first request ~3–5 s) |
| Max instances | 5 |
| Auth | `--allow-unauthenticated` (restrict if needed — see below) |
| Cloud SQL | attached via socket (`/cloudsql/CONNECTION_NAME`) |

**To add authentication** (restrict to your agent SA only):

```bash
# Remove --allow-unauthenticated and add invoker binding
gcloud run services remove-iam-policy-binding mem0-server \
  --region=australia-southeast1 \
  --member=allUsers --role=roles/run.invoker

gcloud run services add-iam-policy-binding mem0-server \
  --region=australia-southeast1 \
  --member="serviceAccount:gen-ux-agent@PROJECT.iam.gserviceaccount.com" \
  --role=roles/run.invoker
```

The agent will then need to attach an identity token to its requests (the `mem0ai` client doesn't do this by default — you'd need a custom fetch wrapper).

---

## Distillation models

Configured via env vars on the Mem0 server:

| Env var | Default | Notes |
|---|---|---|
| `DISTILLATION_MODEL` | `claude-haiku-4-5-20251001` | Anthropic model for dedup/contradiction/entity extraction |
| (embedder) | `text-embedding-3-small` | Hardcoded in `server.py` — change there if needed |

Haiku is the right default — distillation calls are fast single-turn classification tasks, not generation. Upgrade to Sonnet only if distillation quality is poor for your domain.

---

## Updating the server

After changing `backend/mem0/server.py` or `requirements.txt`:

**Local:**
```bash
docker compose build mem0 && docker compose up mem0 -d
```

**Production:**
```bash
./scripts/deploy-mem0.sh   # re-runs gcloud run deploy --source, rebuilds image
```

Cloud Run handles zero-downtime rollover automatically.

---

## Running the memory integration tests

```bash
# Start local stack
docker compose up postgres mem0 -d

# Run all tests (memory suite auto-activates when MEM0_BASE_URL is set)
pnpm --filter @gen-ux/agent test

# Run memory tests only
pnpm --filter @gen-ux/agent exec vitest run tests/memory/
```

Logs are written to `logs/test-YYYYMMDD-HHMMSS.log`.

The memory suite covers:
- **User memory** — cross-session persistence, multi-fact retrieval
- **Distillation** — dedup, contradiction resolution, near-duplicate merging
- **Temporal reasoning** — preference change tracking, ADD-only architecture
- **Entity linking** — related facts co-surface in search, user isolation
- **Erasure** — `deleteAll` removes all memories, scoped per user

---

## Troubleshooting

**`mem0` container exits immediately**

```bash
docker compose logs mem0
```

Common causes:
- Missing `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in `.env`
- `postgres` not healthy yet — `mem0` depends on `postgres` healthcheck

**500 errors from the server**

Check `docker compose logs mem0` for the Python traceback. The `mem0ai` Python library API changed in 2.x — `get_all()` and `search()` use `filters={"user_id": ...}` while `add()` and `delete_all()` still use `user_id=` directly.

**`results.map is not a function` in TypeScript**

The server returns `{"results": [...]}` — the `Mem0Adapter` unwraps this envelope. If you see this error after a library upgrade, check the response shape in `backend/agent/src/memory/mem0.adapter.ts`.

**Cloud SQL connection refused**

- Check the Cloud SQL Proxy is running (for local → Cloud SQL)
- Verify `CLOUD_SQL_CONNECTION_NAME` matches `PROJECT:REGION:INSTANCE`
- Check the SA has `roles/cloudsql.client`

**Cold start latency**

With `min-instances=0`, the first request after idle takes ~3–5 s. Set `--min-instances=1` in `deploy-mem0.sh` to keep one instance warm (adds ~$15/month).
