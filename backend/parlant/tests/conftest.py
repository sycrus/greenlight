"""
Shared fixtures and setup for parlant tests.

entrypoint.py opens config/guidelines.yaml at module level, so the working
directory must be backend/parlant/ before the module is imported.
This conftest runs before collection and fixes that.
"""

import os
import sys

# Must happen before entrypoint is imported anywhere in the test session.
_parlant_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
os.chdir(_parlant_dir)
sys.path.insert(0, _parlant_dir)

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest


# ── Parlant SDK mock helpers ───────────────────────────────────────────────────

def make_transition(target):
    """Return a mock JourneyTransition whose .target is the given state."""
    t = MagicMock()
    t.target = target
    return t


def make_chat_state(name="state"):
    """Return a mock ChatJourneyState."""
    s = AsyncMock(name=name)
    s.transition_to = AsyncMock()
    return s


def make_tool_state(name="tool_state"):
    """Return a mock ToolJourneyState."""
    s = AsyncMock(name=name)
    s.transition_to = AsyncMock()
    return s


@pytest.fixture
def mock_journey_agent():
    """
    A mock p.Agent pre-wired with the full chain that create_discovery_journey
    walks through:

        initial_state → welcome → discover → (search | clarify) → present
                                                       ↑                ↑
                                              clarify ─┘ (merge)       │
                                                                 (direct)

    Exposes named states so individual tests can assert on specific calls.
    """
    discover_state = make_chat_state("discover")
    search_state = make_tool_state("search")
    clarify_state = make_chat_state("clarify")

    # initial → discover (direct — welcome is hardcoded in the frontend)
    initial_state = AsyncMock(name="initial")
    initial_state.transition_to = AsyncMock(
        return_value=make_transition(discover_state)
    )

    # discover: first call → search (tool_state=rag_agent), second call → clarify (chat_state)
    search_transition = make_transition(search_state)
    clarify_transition = make_transition(clarify_state)
    discover_state.transition_to = AsyncMock(
        side_effect=[search_transition, clarify_transition]
    )

    # clarify → search (targeting existing search_state)
    clarify_state.transition_to = AsyncMock(return_value=MagicMock())

    # search → present
    search_state.transition_to = AsyncMock(return_value=MagicMock())

    journey = AsyncMock(name="journey")
    journey.initial_state = initial_state
    journey.create_guideline = AsyncMock()

    agent = AsyncMock(name="agent")
    agent.create_journey = AsyncMock(return_value=journey)

    return {
        "agent": agent,
        "journey": journey,
        "initial_state": initial_state,
        "discover_state": discover_state,
        "search_state": search_state,
        "clarify_state": clarify_state,
    }


# ── ToolContext mock ───────────────────────────────────────────────────────────

@pytest.fixture
def mock_tool_context():
    ctx = MagicMock()
    ctx.customer_id = "user-test-123"
    ctx.session_id = "session-test-abc"
    return ctx


# ── httpx mock helpers ────────────────────────────────────────────────────────

def make_httpx_client(*, post_status=200, post_json=None, stream_lines=None):
    """
    Build a mock httpx.AsyncClient that:
      - responds to .post() with post_status / post_json
      - responds to .stream() with the given SSE lines
    """
    # POST response
    post_response = AsyncMock()
    post_response.status_code = post_status
    post_response.json = MagicMock(return_value=post_json or {})

    # Stream response
    async def _aiter_lines():
        for line in (stream_lines or []):
            yield line

    stream_response = AsyncMock()
    stream_response.raise_for_status = MagicMock()
    stream_response.aiter_lines = _aiter_lines

    stream_cm = AsyncMock()
    stream_cm.__aenter__ = AsyncMock(return_value=stream_response)
    stream_cm.__aexit__ = AsyncMock(return_value=False)

    client = AsyncMock()
    client.post = AsyncMock(return_value=post_response)
    client.stream = MagicMock(return_value=stream_cm)

    client_cm = AsyncMock()
    client_cm.__aenter__ = AsyncMock(return_value=client)
    client_cm.__aexit__ = AsyncMock(return_value=False)

    return client_cm, client
