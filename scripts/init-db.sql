-- init-db.sql — one-time schema bootstrap for the agent memory store
--
-- Run after setup-gcp.sh:
--   gcloud sql connect <instance> --user=agent --database=agent_memory < scripts/init-db.sql
--
-- Requires pgvector extension (available on Cloud SQL for PostgreSQL 15+).
-- Vertex AI text-embedding-004 outputs 768 dimensions by default.

-- ── Extensions ──────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Memories table ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memories (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     TEXT        NOT NULL,
  content     TEXT        NOT NULL,
  embedding   vector(768) NOT NULL,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────────

-- Fast exact lookup by user
CREATE INDEX IF NOT EXISTS memories_user_id_idx
  ON memories (user_id);

-- ANN index for cosine similarity search (ivfflat — low memory, good for <1M rows)
-- lists=100 is a reasonable default; tune upward if recall degrades at scale.
CREATE INDEX IF NOT EXISTS memories_embedding_idx
  ON memories USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
