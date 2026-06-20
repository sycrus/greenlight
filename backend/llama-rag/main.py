"""
llama-rag — LlamaIndex retrieval microservice.

Exposes two endpoints:
  POST /retrieve  — semantic search over the pgvector index
  POST /ingest    — chunk, embed, and upsert documents into pgvector
  GET  /health

Used by the LangGraph rag_agent node (TypeScript) and the ingest_job Cloud Run job.
All agents can call /retrieve directly via the shared retrieve.ts tool.

Vector store: pgvector on Cloud SQL (or local postgres via docker-compose).
Embeddings:   text-embedding-3-small (OpenAI, 1536 dims) — consistent with Mem0.
LLM:          None — response generation stays in the TypeScript agent layer.
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from llama_index.core import Document, Settings, StorageContext, VectorStoreIndex
from llama_index.core.node_parser import SentenceSplitter
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.vector_stores.postgres import PGVectorStore
from pydantic import BaseModel

# ── LlamaIndex global settings ────────────────────────────────────────────────
# No LLM — retrieval only. Response generation is the TypeScript agent's job.

Settings.embed_model = OpenAIEmbedding(
    model="text-embedding-3-small",
    api_key=os.environ["OPENAI_API_KEY"],
)
Settings.llm = None  # type: ignore[assignment]

# ── State ─────────────────────────────────────────────────────────────────────

_vector_store: PGVectorStore | None = None
_index: VectorStoreIndex | None = None

# 512-token chunks with 50-token overlap — good balance for text-embedding-3-small
_splitter = SentenceSplitter(chunk_size=512, chunk_overlap=50)


def _make_vector_store() -> PGVectorStore:
    connection_name = os.getenv("CLOUD_SQL_CONNECTION_NAME")
    if connection_name:
        # Cloud Run: connect via Unix socket injected by --add-cloudsql-instances
        socket_path = f"/cloudsql/{connection_name}"
        user = os.getenv("DB_USER", "agent")
        password = os.getenv("DB_PASSWORD", "")
        db_name = os.getenv("DB_NAME", "agent_memory")
        return PGVectorStore(
            connection_string=f"postgresql+psycopg2://{user}:{password}@/{db_name}?host={socket_path}",
            async_connection_string=f"postgresql+asyncpg://{user}:{password}@/{db_name}?host={socket_path}",
            table_name="rag_documents",
            embed_dim=1536,
        )
    return PGVectorStore.from_params(
        host=os.getenv("DB_HOST", "postgres"),
        port=int(os.getenv("DB_PORT", "5432")),
        database=os.getenv("DB_NAME", "agent_memory"),
        user=os.getenv("DB_USER", "agent"),
        password=os.getenv("DB_PASSWORD", "localdev"),
        table_name="rag_documents",
        embed_dim=1536,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _vector_store, _index
    _vector_store = _make_vector_store()
    storage_context = StorageContext.from_defaults(vector_store=_vector_store)
    _index = VectorStoreIndex.from_vector_store(
        vector_store=_vector_store,
        storage_context=storage_context,
    )
    print(f"[llama-rag] Ready — pgvector at {os.getenv('DB_HOST', 'postgres')}:{os.getenv('DB_PORT', '5432')}")
    yield


app = FastAPI(title="llama-rag", lifespan=lifespan)

# ── Request / response models ─────────────────────────────────────────────────


class DocumentInput(BaseModel):
    text: str
    metadata: dict = {}


class IngestRequest(BaseModel):
    documents: list[DocumentInput]


class RetrieveRequest(BaseModel):
    query: str
    top_k: int = 5


class RetrievedChunk(BaseModel):
    text: str
    source: str
    score: float


class RetrieveResponse(BaseModel):
    chunks: list[RetrievedChunk]
    sources: list[str]


# ── Endpoints ─────────────────────────────────────────────────────────────────


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/retrieve", response_model=RetrieveResponse)
async def retrieve(body: RetrieveRequest) -> RetrieveResponse:
    if _index is None:
        raise HTTPException(status_code=503, detail="Index not initialised")

    retriever = _index.as_retriever(similarity_top_k=body.top_k)
    nodes = await retriever.aretrieve(body.query)

    chunks = [
        RetrievedChunk(
            text=n.node.text,
            source=n.node.metadata.get("url", ""),
            score=n.score if n.score is not None else 0.0,
        )
        for n in nodes
    ]

    # Deduplicate sources while preserving relevance order
    seen: set[str] = set()
    sources: list[str] = []
    for c in chunks:
        if c.source and c.source not in seen:
            seen.add(c.source)
            sources.append(c.source)

    return RetrieveResponse(chunks=chunks, sources=sources)


@app.post("/ingest")
async def ingest(body: IngestRequest) -> dict:
    if _index is None:
        raise HTTPException(status_code=503, detail="Index not initialised")

    documents = [
        Document(text=doc.text, metadata=doc.metadata)
        for doc in body.documents
        if doc.text.strip()
    ]

    if not documents:
        return {"documents": 0, "chunks": 0}

    # Chunk each document before embedding — whole pages produce poor retrieval
    # TODO (phase 2): upsert dedup via VectorStoreIndex.refresh_ref_docs()
    nodes = _splitter.get_nodes_from_documents(documents)
    _index.insert_nodes(nodes)

    return {"documents": len(documents), "chunks": len(nodes)}
