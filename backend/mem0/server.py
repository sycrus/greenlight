"""
Mem0 OSS server — FastAPI wrapper around the mem0 Memory class.

Exposes the same REST API as the Mem0 managed service so the existing
Mem0Adapter (TypeScript) can point to this service without any code changes.

Config via environment variables:
  DB_HOST           — Cloud SQL socket (/cloudsql/...) or TCP host
  DB_PORT           — default 5432
  DB_NAME           — default agent_memory
  DB_USER           — database user
  DB_PASSWORD       — database password (injected via Secret Manager on Cloud Run)
  ANTHROPIC_API_KEY — used by Mem0 for memory distillation (dedup, contradiction resolution)
  OPENAI_API_KEY    — used by Mem0 for embeddings (text-embedding-3-small, 1536d)
  DISTILLATION_MODEL — default claude-haiku-4-5-20251001
"""

from contextlib import asynccontextmanager
from typing import Any
from fastapi import FastAPI
from pydantic import BaseModel
from mem0 import Memory
import os


def _build_config() -> dict:
    return {
        "vector_store": {
            "provider": "pgvector",
            "config": {
                "host": os.environ["DB_HOST"],
                "port": int(os.getenv("DB_PORT", "5432")),
                "dbname": os.getenv("DB_NAME", "agent_memory"),
                "user": os.environ["DB_USER"],
                "password": os.environ["DB_PASSWORD"],
                "collection_name": "mem0_memories",
                "embedding_model_dims": 1536,
            },
        },
        "llm": {
            "provider": "anthropic",
            "config": {
                "model": os.getenv("DISTILLATION_MODEL", "claude-haiku-4-5-20251001"),
                "api_key": os.environ["ANTHROPIC_API_KEY"],
                "max_tokens": 2000,
            },
        },
        "embedder": {
            "provider": "openai",
            "config": {
                "model": os.getenv("EMBEDDING_MODEL", "text-embedding-3-small"),
                "api_key": os.environ["OPENAI_API_KEY"],
            },
        },
    }


_memory: Memory | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _memory
    _memory = Memory.from_config(_build_config())
    yield


app = FastAPI(title="Mem0 OSS Server", lifespan=lifespan)


# ── Request models ─────────────────────────────────────────────────────────────

class AddRequest(BaseModel):
    messages: list[dict[str, Any]]
    user_id: str
    metadata: dict[str, Any] | None = None


class SearchRequest(BaseModel):
    query: str
    user_id: str
    limit: int = 5


# ── Endpoints — mirrors the Mem0 managed API so MemoryClient works unchanged ───

@app.post("/v1/memories/")
def add_memory(req: AddRequest):
    assert _memory is not None
    return _memory.add(req.messages, user_id=req.user_id, metadata=req.metadata or {})


@app.post("/v1/memories/search/")
def search_memories(req: SearchRequest):
    assert _memory is not None
    return _memory.search(req.query, filters={"user_id": req.user_id}, limit=req.limit)


@app.get("/v1/memories/")
def get_all(user_id: str):
    assert _memory is not None
    return _memory.get_all(filters={"user_id": user_id})


@app.delete("/v1/memories/{memory_id}/")
def delete_memory(memory_id: str):
    assert _memory is not None
    _memory.delete(memory_id)
    return {"message": "deleted"}


@app.delete("/v1/memories/")
def delete_all(user_id: str):
    assert _memory is not None
    _memory.delete_all(user_id=user_id)
    return {"message": "deleted"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/v1/ping/")
def ping():
    return {"status": "ok"}
