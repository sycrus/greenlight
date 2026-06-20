"""
Tests for the llama-rag FastAPI service.

Unit tests mock the LlamaIndex index/retriever so no real DB or OpenAI key
is needed. Integration tests are gated on DB_HOST + OPENAI_API_KEY being real.

Run unit tests:
    cd backend/llama-rag && pip install -r requirements.txt pytest httpx
    pytest tests/ -v

Run with integration tests (requires docker compose up postgres llama-rag):
    DB_HOST=localhost OPENAI_API_KEY=sk-... pytest tests/ -v
"""
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# ── Fixtures ───────────────────────────────────────────────────────────────────


def make_node(text: str, url: str = "", score: float = 0.9) -> MagicMock:
    """Build a mock NodeWithScore matching LlamaIndex's return shape."""
    node = MagicMock()
    node.node.text = text
    node.node.metadata = {"url": url, "title": ""}
    node.score = score
    return node


@pytest.fixture
def mock_index() -> MagicMock:
    index = MagicMock()
    retriever = MagicMock()
    retriever.aretrieve = AsyncMock(return_value=[])
    index.as_retriever = MagicMock(return_value=retriever)
    index.insert_nodes = MagicMock()
    return index


@pytest.fixture
def client(mock_index: MagicMock) -> TestClient:
    """TestClient with _index and _vector_store pre-patched to avoid lifespan DB calls."""
    import main
    with patch.object(main, "_index", mock_index), \
         patch.object(main, "_vector_store", MagicMock()):
        yield TestClient(main.app)


# ── /health ────────────────────────────────────────────────────────────────────


def test_health(client: TestClient) -> None:
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


# ── /retrieve ──────────────────────────────────────────────────────────────────


def test_retrieve_503_when_index_not_initialised() -> None:
    import main
    with patch.object(main, "_index", None):
        c = TestClient(main.app, raise_server_exceptions=False)
        res = c.post("/retrieve", json={"query": "test"})
    assert res.status_code == 503


def test_retrieve_empty_results(client: TestClient, mock_index: MagicMock) -> None:
    mock_index.as_retriever.return_value.aretrieve = AsyncMock(return_value=[])
    res = client.post("/retrieve", json={"query": "nonexistent topic"})
    assert res.status_code == 200
    body = res.json()
    assert body["chunks"] == []
    assert body["sources"] == []


def test_retrieve_returns_chunks_and_sources(client: TestClient, mock_index: MagicMock) -> None:
    mock_index.as_retriever.return_value.aretrieve = AsyncMock(
        return_value=[make_node("Product X comes in blue and red.", "https://example.com/products", 0.92)]
    )
    res = client.post("/retrieve", json={"query": "product colours"})
    assert res.status_code == 200
    body = res.json()
    assert len(body["chunks"]) == 1
    assert body["chunks"][0]["text"] == "Product X comes in blue and red."
    assert body["chunks"][0]["source"] == "https://example.com/products"
    assert abs(body["chunks"][0]["score"] - 0.92) < 0.001
    assert body["sources"] == ["https://example.com/products"]


def test_retrieve_deduplicates_sources(client: TestClient, mock_index: MagicMock) -> None:
    nodes = [
        make_node("Fact A.", "https://example.com/page1", 0.9),
        make_node("Fact B.", "https://example.com/page1", 0.85),  # same source
        make_node("Fact C.", "https://example.com/page2", 0.8),
    ]
    mock_index.as_retriever.return_value.aretrieve = AsyncMock(return_value=nodes)
    res = client.post("/retrieve", json={"query": "anything"})
    body = res.json()
    assert len(body["chunks"]) == 3
    assert body["sources"] == ["https://example.com/page1", "https://example.com/page2"]


def test_retrieve_preserves_source_relevance_order(client: TestClient, mock_index: MagicMock) -> None:
    nodes = [
        make_node("High relevance.", "https://example.com/a", 0.95),
        make_node("Medium relevance.", "https://example.com/b", 0.80),
    ]
    mock_index.as_retriever.return_value.aretrieve = AsyncMock(return_value=nodes)
    res = client.post("/retrieve", json={"query": "q"})
    body = res.json()
    assert body["sources"][0] == "https://example.com/a"
    assert body["sources"][1] == "https://example.com/b"


def test_retrieve_respects_top_k(client: TestClient, mock_index: MagicMock) -> None:
    mock_index.as_retriever.return_value.aretrieve = AsyncMock(return_value=[])
    client.post("/retrieve", json={"query": "q", "top_k": 3})
    mock_index.as_retriever.assert_called_with(similarity_top_k=3)


def test_retrieve_defaults_top_k_to_5(client: TestClient, mock_index: MagicMock) -> None:
    mock_index.as_retriever.return_value.aretrieve = AsyncMock(return_value=[])
    client.post("/retrieve", json={"query": "q"})
    mock_index.as_retriever.assert_called_with(similarity_top_k=5)


def test_retrieve_node_with_none_score_defaults_to_zero(client: TestClient, mock_index: MagicMock) -> None:
    node = make_node("Content.", "https://example.com", score=0.0)
    node.score = None  # override to None
    mock_index.as_retriever.return_value.aretrieve = AsyncMock(return_value=[node])
    res = client.post("/retrieve", json={"query": "q"})
    assert res.status_code == 200
    assert res.json()["chunks"][0]["score"] == 0.0


def test_retrieve_node_with_empty_url_excluded_from_sources(client: TestClient, mock_index: MagicMock) -> None:
    mock_index.as_retriever.return_value.aretrieve = AsyncMock(
        return_value=[make_node("Content with no source.", url="", score=0.9)]
    )
    res = client.post("/retrieve", json={"query": "q"})
    body = res.json()
    assert body["sources"] == []
    assert body["chunks"][0]["source"] == ""


# ── /ingest ────────────────────────────────────────────────────────────────────


def test_ingest_503_when_index_not_initialised() -> None:
    import main
    with patch.object(main, "_index", None):
        c = TestClient(main.app, raise_server_exceptions=False)
        res = c.post("/ingest", json={"documents": [{"text": "hello"}]})
    assert res.status_code == 503


def test_ingest_returns_document_and_chunk_counts(client: TestClient, mock_index: MagicMock) -> None:
    res = client.post("/ingest", json={
        "documents": [
            {"text": "Document one.", "metadata": {"url": "https://example.com/1"}},
            {"text": "Document two.", "metadata": {"url": "https://example.com/2"}},
        ]
    })
    assert res.status_code == 200
    body = res.json()
    assert body["documents"] == 2
    assert body["chunks"] >= 2  # short texts → 1 chunk each


def test_ingest_skips_whitespace_only_documents(client: TestClient, mock_index: MagicMock) -> None:
    res = client.post("/ingest", json={
        "documents": [
            {"text": "   "},
            {"text": ""},
            {"text": "Valid document."},
        ]
    })
    assert res.status_code == 200
    body = res.json()
    assert body["documents"] == 1
    assert body["chunks"] >= 1
    inserted = mock_index.insert_nodes.call_args[0][0]
    assert inserted[0].text == "Valid document."


def test_ingest_empty_list_returns_zero(client: TestClient, mock_index: MagicMock) -> None:
    res = client.post("/ingest", json={"documents": []})
    assert res.status_code == 200
    body = res.json()
    assert body["documents"] == 0
    assert body["chunks"] == 0
    mock_index.insert_nodes.assert_not_called()


def test_ingest_passes_text_and_metadata_to_nodes(client: TestClient, mock_index: MagicMock) -> None:
    client.post("/ingest", json={
        "documents": [{"text": "Some content.", "metadata": {"url": "https://x.com", "title": "X"}}]
    })
    mock_index.insert_nodes.assert_called_once()
    nodes = mock_index.insert_nodes.call_args[0][0]
    assert len(nodes) == 1
    assert nodes[0].text == "Some content."
    assert nodes[0].metadata["url"] == "https://x.com"
    assert nodes[0].metadata["title"] == "X"


def test_ingest_calls_insert_nodes_once_per_batch(client: TestClient, mock_index: MagicMock) -> None:
    docs = [{"text": f"Document {i}."} for i in range(5)]
    client.post("/ingest", json={"documents": docs})
    mock_index.insert_nodes.assert_called_once()
    assert len(mock_index.insert_nodes.call_args[0][0]) == 5


# ── Integration (skipped without real pgvector + OpenAI key) ──────────────────

_HAS_REAL_DEPS = (
    os.getenv("OPENAI_API_KEY", "").startswith("sk-")
    and not os.getenv("OPENAI_API_KEY", "").startswith("sk-test")
    and bool(os.getenv("DB_HOST"))
)


@pytest.mark.skipif(not _HAS_REAL_DEPS, reason="requires real pgvector DB + OPENAI_API_KEY")
def test_integration_ingest_then_retrieve() -> None:
    """End-to-end: ingest a canary document then retrieve it by semantic query."""
    import main
    canary = f"The quick brown fox canary document {os.urandom(4).hex()}."

    with TestClient(main.app) as c:
        ingest_res = c.post("/ingest", json={
            "documents": [{"text": canary, "metadata": {"url": "https://test.example.com/canary"}}]
        })
        assert ingest_res.status_code == 200
        assert ingest_res.json()["ingested"] == 1

        retrieve_res = c.post("/retrieve", json={"query": "canary document", "top_k": 5})
        assert retrieve_res.status_code == 200
        texts = [c["text"] for c in retrieve_res.json()["chunks"]]
        assert any("canary" in t.lower() for t in texts), f"Canary not found in: {texts}"
