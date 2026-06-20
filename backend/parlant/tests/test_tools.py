"""
Tests for the Parlant tool functions and the shared _call_agent SSE helper.

Covers:
  _call_agent   — SSE streaming, delta accumulation, error handling
  save_memory   — fire-and-forget Mem0 write, background error handling
  rag_agent     — delegates to _call_agent("rag", ...)
  memory_retriever — Mem0 search, memory formatting, graceful failure
"""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import entrypoint as ep


# ── Helpers ────────────────────────────────────────────────────────────────────

def sse_line(event_type: str, data: dict) -> str:
    return f'data: {json.dumps({"type": event_type, "data": data})}'


def make_retriever_context(user_id="user-1", last_message="test query"):
    ctx = MagicMock()
    ctx.customer.id = user_id
    msg = MagicMock()
    msg.content = last_message
    ctx.interaction.last_customer_message = msg
    return ctx


# ── _call_agent ────────────────────────────────────────────────────────────────

class TestCallAgent:
    @pytest.mark.asyncio
    async def test_accumulates_text_message_content_deltas(self, mock_tool_context):
        stream_lines = [
            sse_line("RUN_STARTED", {}),
            sse_line("TEXT_MESSAGE_CONTENT", {"delta": "Hello "}),
            sse_line("TEXT_MESSAGE_CONTENT", {"delta": "world"}),
            sse_line("RUN_FINISHED", {}),
        ]
        client_cm, _ = __import__("tests.conftest", fromlist=["make_httpx_client"]) and None or (None, None)

        # Build mock inline to avoid import dance
        async def _aiter():
            for line in stream_lines:
                yield line

        stream_resp = AsyncMock()
        stream_resp.raise_for_status = MagicMock()
        stream_resp.aiter_lines = _aiter

        stream_cm = AsyncMock()
        stream_cm.__aenter__ = AsyncMock(return_value=stream_resp)
        stream_cm.__aexit__ = AsyncMock(return_value=False)

        client = AsyncMock()
        client.stream = MagicMock(return_value=stream_cm)

        outer_cm = AsyncMock()
        outer_cm.__aenter__ = AsyncMock(return_value=client)
        outer_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=outer_cm):
            result = await ep._call_agent("rag", "what can Endava do?", "u1", "s1")

        assert result == "Hello world"

    @pytest.mark.asyncio
    async def test_ignores_non_data_lines(self):
        stream_lines = [
            "",
            ": keep-alive",
            sse_line("TEXT_MESSAGE_CONTENT", {"delta": "Result"}),
        ]

        async def _aiter():
            for line in stream_lines:
                yield line

        stream_resp = AsyncMock()
        stream_resp.raise_for_status = MagicMock()
        stream_resp.aiter_lines = _aiter

        stream_cm = AsyncMock()
        stream_cm.__aenter__ = AsyncMock(return_value=stream_resp)
        stream_cm.__aexit__ = AsyncMock(return_value=False)

        client = AsyncMock()
        client.stream = MagicMock(return_value=stream_cm)

        outer_cm = AsyncMock()
        outer_cm.__aenter__ = AsyncMock(return_value=client)
        outer_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=outer_cm):
            result = await ep._call_agent("rag", "query", "u1", "s1")

        assert result == "Result"

    @pytest.mark.asyncio
    async def test_returns_fallback_when_no_content_events(self):
        stream_lines = [
            sse_line("RUN_STARTED", {}),
            sse_line("RUN_FINISHED", {}),
        ]

        async def _aiter():
            for line in stream_lines:
                yield line

        stream_resp = AsyncMock()
        stream_resp.raise_for_status = MagicMock()
        stream_resp.aiter_lines = _aiter

        stream_cm = AsyncMock()
        stream_cm.__aenter__ = AsyncMock(return_value=stream_resp)
        stream_cm.__aexit__ = AsyncMock(return_value=False)

        client = AsyncMock()
        client.stream = MagicMock(return_value=stream_cm)

        outer_cm = AsyncMock()
        outer_cm.__aenter__ = AsyncMock(return_value=client)
        outer_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=outer_cm):
            result = await ep._call_agent("rag", "query", "u1", "s1")

        assert result == "[no response from agent]"

    @pytest.mark.asyncio
    async def test_posts_to_correct_agent_url(self):
        async def _aiter():
            yield sse_line("TEXT_MESSAGE_CONTENT", {"delta": "ok"})

        stream_resp = AsyncMock()
        stream_resp.raise_for_status = MagicMock()
        stream_resp.aiter_lines = _aiter

        stream_cm = AsyncMock()
        stream_cm.__aenter__ = AsyncMock(return_value=stream_resp)
        stream_cm.__aexit__ = AsyncMock(return_value=False)

        client = AsyncMock()
        client.stream = MagicMock(return_value=stream_cm)

        outer_cm = AsyncMock()
        outer_cm.__aenter__ = AsyncMock(return_value=client)
        outer_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=outer_cm):
            await ep._call_agent("rag", "query", "u-1", "s-1")

        call = client.stream.call_args
        assert call.args[0] == "POST"
        assert call.args[1] == f"{ep.AGENT_URL}/chat"

    @pytest.mark.asyncio
    async def test_sends_correct_payload(self):
        async def _aiter():
            yield sse_line("TEXT_MESSAGE_CONTENT", {"delta": "ok"})

        stream_resp = AsyncMock()
        stream_resp.raise_for_status = MagicMock()
        stream_resp.aiter_lines = _aiter

        stream_cm = AsyncMock()
        stream_cm.__aenter__ = AsyncMock(return_value=stream_resp)
        stream_cm.__aexit__ = AsyncMock(return_value=False)

        client = AsyncMock()
        client.stream = MagicMock(return_value=stream_cm)

        outer_cm = AsyncMock()
        outer_cm.__aenter__ = AsyncMock(return_value=client)
        outer_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=outer_cm):
            await ep._call_agent("rag", "find case studies", "user-99", "sess-42")

        payload = client.stream.call_args.kwargs["json"]
        assert payload["agent"] == "rag"
        assert payload["message"] == "find case studies"
        assert payload["userId"] == "user-99"
        assert payload["sessionId"] == "sess-42"

    @pytest.mark.asyncio
    async def test_skips_malformed_json_lines(self):
        async def _aiter():
            yield "data: not-valid-json"
            yield sse_line("TEXT_MESSAGE_CONTENT", {"delta": "valid"})

        stream_resp = AsyncMock()
        stream_resp.raise_for_status = MagicMock()
        stream_resp.aiter_lines = _aiter

        stream_cm = AsyncMock()
        stream_cm.__aenter__ = AsyncMock(return_value=stream_resp)
        stream_cm.__aexit__ = AsyncMock(return_value=False)

        client = AsyncMock()
        client.stream = MagicMock(return_value=stream_cm)

        outer_cm = AsyncMock()
        outer_cm.__aenter__ = AsyncMock(return_value=client)
        outer_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=outer_cm):
            result = await ep._call_agent("rag", "query", "u", "s")

        assert result == "valid"


# ── save_memory ────────────────────────────────────────────────────────────────

class TestSaveMemory:
    @pytest.mark.asyncio
    async def test_returns_memory_noted_immediately(self, mock_tool_context):
        client_cm = AsyncMock()
        client_cm.__aenter__ = AsyncMock(return_value=AsyncMock())
        client_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=client_cm):
            result = await ep.save_memory(mock_tool_context, "I work in fintech")

        assert result.data == "Memory noted."

    @pytest.mark.asyncio
    async def test_posts_content_to_mem0(self, mock_tool_context):
        posted = []

        inner_client = AsyncMock()

        async def mock_post(url, **kwargs):
            posted.append((url, kwargs))
            r = MagicMock()
            r.status_code = 200
            return r

        inner_client.post = mock_post

        client_cm = AsyncMock()
        client_cm.__aenter__ = AsyncMock(return_value=inner_client)
        client_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=client_cm):
            await ep.save_memory(mock_tool_context, "I work in fintech")
            await asyncio.sleep(0)  # let background task run

        assert len(posted) == 1
        url, kwargs = posted[0]
        assert ep.MEM0_URL in url
        assert "memories" in url

    @pytest.mark.asyncio
    async def test_associates_memory_with_correct_user(self, mock_tool_context):
        posted = []

        inner_client = AsyncMock()

        async def mock_post(url, **kwargs):
            posted.append(kwargs)
            r = MagicMock()
            r.status_code = 200
            return r

        inner_client.post = mock_post

        client_cm = AsyncMock()
        client_cm.__aenter__ = AsyncMock(return_value=inner_client)
        client_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=client_cm):
            await ep.save_memory(mock_tool_context, "I work in fintech")
            await asyncio.sleep(0)

        payload = posted[0]["json"]
        assert payload["user_id"] == str(mock_tool_context.customer_id)
        assert payload["messages"][0]["role"] == "user"
        assert "fintech" in payload["messages"][0]["content"]

    @pytest.mark.asyncio
    async def test_background_error_does_not_raise(self, mock_tool_context):
        """A Mem0 write failure must not surface to the caller."""
        inner_client = AsyncMock()
        inner_client.post = AsyncMock(side_effect=Exception("Mem0 down"))

        client_cm = AsyncMock()
        client_cm.__aenter__ = AsyncMock(return_value=inner_client)
        client_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=client_cm):
            result = await ep.save_memory(mock_tool_context, "some detail")
            await asyncio.sleep(0)

        assert result.data == "Memory noted."


# ── rag_agent ─────────────────────────────────────────────────────────────────

class TestRagAgent:
    @pytest.mark.asyncio
    async def test_delegates_to_rag_agent_type(self, mock_tool_context):
        with patch.object(ep, "_call_agent", new=AsyncMock(return_value="rag result")) as mock_call:
            result = await ep.rag_agent(mock_tool_context, "find case studies in fintech")

        mock_call.assert_awaited_once()
        args = mock_call.call_args.args
        assert args[0] == "rag"
        assert args[1] == "find case studies in fintech"

    @pytest.mark.asyncio
    async def test_passes_customer_and_session_ids(self, mock_tool_context):
        with patch.object(ep, "_call_agent", new=AsyncMock(return_value="ok")) as mock_call:
            await ep.rag_agent(mock_tool_context, "query")

        args = mock_call.call_args.args
        assert args[2] == str(mock_tool_context.customer_id)
        assert args[3] == str(mock_tool_context.session_id)

    @pytest.mark.asyncio
    async def test_returns_agent_response_as_tool_result(self, mock_tool_context):
        with patch.object(ep, "_call_agent", new=AsyncMock(return_value="Here are results")):
            result = await ep.rag_agent(mock_tool_context, "query")

        assert result.data == "Here are results"


# ── memory_retriever ──────────────────────────────────────────────────────────

class TestMemoryRetriever:
    @pytest.mark.asyncio
    async def test_returns_formatted_memories(self):
        ctx = make_retriever_context(user_id="u-1", last_message="fintech challenges")
        mem0_response = [
            {"memory": "Works in fintech"},
            {"memory": "VP of Engineering"},
        ]

        inner_client = AsyncMock()
        resp = AsyncMock()
        resp.status_code = 200
        resp.json = MagicMock(return_value=mem0_response)
        inner_client.post = AsyncMock(return_value=resp)

        client_cm = AsyncMock()
        client_cm.__aenter__ = AsyncMock(return_value=inner_client)
        client_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=client_cm):
            result = await ep.memory_retriever(ctx)

        assert "Works in fintech" in result.data
        assert "VP of Engineering" in result.data

    @pytest.mark.asyncio
    async def test_returns_empty_string_when_no_memories(self):
        ctx = make_retriever_context()

        inner_client = AsyncMock()
        resp = AsyncMock()
        resp.status_code = 200
        resp.json = MagicMock(return_value=[])
        inner_client.post = AsyncMock(return_value=resp)

        client_cm = AsyncMock()
        client_cm.__aenter__ = AsyncMock(return_value=inner_client)
        client_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=client_cm):
            result = await ep.memory_retriever(ctx)

        assert result.data == ""

    @pytest.mark.asyncio
    async def test_returns_empty_string_on_mem0_error_status(self):
        ctx = make_retriever_context()

        inner_client = AsyncMock()
        resp = AsyncMock()
        resp.status_code = 500
        inner_client.post = AsyncMock(return_value=resp)

        client_cm = AsyncMock()
        client_cm.__aenter__ = AsyncMock(return_value=inner_client)
        client_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=client_cm):
            result = await ep.memory_retriever(ctx)

        assert result.data == ""

    @pytest.mark.asyncio
    async def test_returns_empty_string_on_network_failure(self):
        ctx = make_retriever_context()

        inner_client = AsyncMock()
        inner_client.post = AsyncMock(side_effect=Exception("connection refused"))

        client_cm = AsyncMock()
        client_cm.__aenter__ = AsyncMock(return_value=inner_client)
        client_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=client_cm):
            result = await ep.memory_retriever(ctx)

        assert result.data == ""

    @pytest.mark.asyncio
    async def test_returns_empty_string_when_no_last_message(self):
        ctx = MagicMock()
        ctx.customer.id = "u-1"
        ctx.interaction.last_customer_message = None

        result = await ep.memory_retriever(ctx)
        assert result.data == ""

    @pytest.mark.asyncio
    async def test_queries_mem0_with_last_message_content(self):
        ctx = make_retriever_context(user_id="u-42", last_message="fintech pain points")

        inner_client = AsyncMock()
        resp = AsyncMock()
        resp.status_code = 200
        resp.json = MagicMock(return_value=[{"memory": "something"}])
        inner_client.post = AsyncMock(return_value=resp)

        client_cm = AsyncMock()
        client_cm.__aenter__ = AsyncMock(return_value=inner_client)
        client_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=client_cm):
            await ep.memory_retriever(ctx)

        payload = inner_client.post.call_args.kwargs["json"]
        assert payload["query"] == "fintech pain points"
        assert payload["user_id"] == "u-42"

    @pytest.mark.asyncio
    async def test_handles_results_key_response_shape(self):
        """Mem0 may return {"results": [...]} instead of a bare list."""
        ctx = make_retriever_context()
        mem0_response = {"results": [{"memory": "Banking sector"}]}

        inner_client = AsyncMock()
        resp = AsyncMock()
        resp.status_code = 200
        resp.json = MagicMock(return_value=mem0_response)
        inner_client.post = AsyncMock(return_value=resp)

        client_cm = AsyncMock()
        client_cm.__aenter__ = AsyncMock(return_value=inner_client)
        client_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=client_cm):
            result = await ep.memory_retriever(ctx)

        assert "Banking sector" in result.data
