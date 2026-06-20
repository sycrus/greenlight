"""
Tests for the Discovery Onboarding Journey structure.

These tests verify that create_discovery_journey() builds the correct state
graph — states, conditions, tools, and transitions — without spinning up a
real Parlant server or making LLM calls.

What is tested:
  - Journey entry conditions (cold start + explicit restart)
  - Journey-scoped memory guideline (save_memory wired, covers all discovery slots)
  - discover_state: direct from initial_state (welcome is hardcoded in the frontend)
  - discover → search: fires when BOTH required slots are present
  - discover → search: wired to rag_agent tool
  - discover → clarify: fires when EITHER required slot is missing
  - clarify → search: exits when slots are known OR after 2 clarifying turns
  - clarify → search: targets the *same* search_state (merge point, not a new state)
  - search → present: direct transition, chat state

What is NOT tested here (requires a live Parlant + LLM):
  - Actual LLM evaluation of transition conditions
  - Full end-to-end conversation flow
"""

import pytest
import entrypoint as ep


# ── Journey creation ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_journey_is_created_on_agent(mock_journey_agent):
    agent = mock_journey_agent["agent"]
    await ep.create_discovery_journey(agent)
    agent.create_journey.assert_called_once()


@pytest.mark.asyncio
async def test_journey_title(mock_journey_agent):
    agent = mock_journey_agent["agent"]
    await ep.create_discovery_journey(agent)
    kwargs = agent.create_journey.call_args.kwargs
    assert "Discovery" in kwargs["title"]


@pytest.mark.asyncio
async def test_journey_has_two_entry_conditions(mock_journey_agent):
    agent = mock_journey_agent["agent"]
    await ep.create_discovery_journey(agent)
    conditions = agent.create_journey.call_args.kwargs["conditions"]
    assert len(conditions) == 2


@pytest.mark.asyncio
async def test_cold_start_condition_present(mock_journey_agent):
    agent = mock_journey_agent["agent"]
    await ep.create_discovery_journey(agent)
    conditions = agent.create_journey.call_args.kwargs["conditions"]
    assert any("first message" in c.lower() for c in conditions)


@pytest.mark.asyncio
async def test_restart_condition_present(mock_journey_agent):
    agent = mock_journey_agent["agent"]
    await ep.create_discovery_journey(agent)
    conditions = agent.create_journey.call_args.kwargs["conditions"]
    assert any(
        any(kw in c.lower() for kw in ("restart", "new search", "different"))
        for c in conditions
    )


# ── Journey-scoped memory guideline ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_journey_scoped_memory_guideline_is_registered(mock_journey_agent):
    agent, journey = mock_journey_agent["agent"], mock_journey_agent["journey"]
    await ep.create_discovery_journey(agent)
    journey.create_guideline.assert_called_once()


@pytest.mark.asyncio
async def test_memory_guideline_wired_to_save_memory_tool(mock_journey_agent):
    agent, journey = mock_journey_agent["agent"], mock_journey_agent["journey"]
    await ep.create_discovery_journey(agent)
    kwargs = journey.create_guideline.call_args.kwargs
    assert ep.save_memory in kwargs["tools"]


@pytest.mark.asyncio
async def test_memory_guideline_condition_covers_discovery_slots(mock_journey_agent):
    agent, journey = mock_journey_agent["agent"], mock_journey_agent["journey"]
    await ep.create_discovery_journey(agent)
    condition = journey.create_guideline.call_args.kwargs["condition"].lower()
    assert "industry" in condition or "vertical" in condition
    assert "challenge" in condition or "pain point" in condition
    assert "role" in condition
    assert "company" in condition


# ── discover_state ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_initial_transitions_to_discover_directly(mock_journey_agent):
    """Welcome is hardcoded in the frontend; journey starts at discover_state."""
    agent = mock_journey_agent["agent"]
    initial_state = mock_journey_agent["initial_state"]
    await ep.create_discovery_journey(agent)

    call = initial_state.transition_to.call_args
    assert call.kwargs.get("condition") is None  # direct — no condition
    assert "chat_state" in call.kwargs


@pytest.mark.asyncio
async def test_discover_asks_for_vertical_and_challenge(mock_journey_agent):
    agent = mock_journey_agent["agent"]
    initial_state = mock_journey_agent["initial_state"]
    await ep.create_discovery_journey(agent)

    action = initial_state.transition_to.call_args.kwargs["chat_state"].lower()
    assert "industry" in action or "vertical" in action
    assert "challenge" in action or "objective" in action


# ── discover → search (happy path) ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_discover_has_exactly_two_outgoing_transitions(mock_journey_agent):
    agent = mock_journey_agent["agent"]
    discover_state = mock_journey_agent["discover_state"]
    await ep.create_discovery_journey(agent)

    assert discover_state.transition_to.call_count == 2


@pytest.mark.asyncio
async def test_discover_to_search_requires_both_slots(mock_journey_agent):
    agent = mock_journey_agent["agent"]
    discover_state = mock_journey_agent["discover_state"]
    await ep.create_discovery_journey(agent)

    # First transition_to call from discover is the search path
    condition = discover_state.transition_to.call_args_list[0].kwargs["condition"].lower()
    assert "and" in condition  # both slots must be present
    assert "industry" in condition or "vertical" in condition
    assert "challenge" in condition or "objective" in condition


@pytest.mark.asyncio
async def test_discover_to_search_uses_rag_agent_tool(mock_journey_agent):
    agent = mock_journey_agent["agent"]
    discover_state = mock_journey_agent["discover_state"]
    await ep.create_discovery_journey(agent)

    first_call = discover_state.transition_to.call_args_list[0].kwargs
    assert first_call.get("tool_state") is ep.rag_agent


@pytest.mark.asyncio
async def test_discover_to_search_instruction_mentions_synthesis(mock_journey_agent):
    agent = mock_journey_agent["agent"]
    discover_state = mock_journey_agent["discover_state"]
    await ep.create_discovery_journey(agent)

    instruction = discover_state.transition_to.call_args_list[0].kwargs.get(
        "tool_instruction", ""
    ).lower()
    # Should tell the agent to combine slots into one query
    assert "query" in instruction
    assert "rag_agent" in instruction or "rag" in instruction


# ── discover → clarify ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_discover_to_clarify_fires_when_either_slot_missing(mock_journey_agent):
    agent = mock_journey_agent["agent"]
    discover_state = mock_journey_agent["discover_state"]
    await ep.create_discovery_journey(agent)

    # Second transition_to call from discover is the clarify path
    condition = discover_state.transition_to.call_args_list[1].kwargs["condition"].lower()
    assert "or" in condition  # either slot missing is enough
    assert "not" in condition or "missing" in condition or "clear" in condition or "yet" in condition


@pytest.mark.asyncio
async def test_discover_to_clarify_is_a_chat_state(mock_journey_agent):
    agent = mock_journey_agent["agent"]
    discover_state = mock_journey_agent["discover_state"]
    await ep.create_discovery_journey(agent)

    second_call = discover_state.transition_to.call_args_list[1].kwargs
    assert "chat_state" in second_call


@pytest.mark.asyncio
async def test_discover_to_clarify_asks_one_question(mock_journey_agent):
    agent = mock_journey_agent["agent"]
    discover_state = mock_journey_agent["discover_state"]
    await ep.create_discovery_journey(agent)

    action = discover_state.transition_to.call_args_list[1].kwargs["chat_state"].lower()
    assert "one" in action or "exactly one" in action or "single" in action


# ── clarify_state ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_clarify_has_exactly_one_outgoing_transition(mock_journey_agent):
    agent = mock_journey_agent["agent"]
    clarify_state = mock_journey_agent["clarify_state"]
    await ep.create_discovery_journey(agent)

    assert clarify_state.transition_to.call_count == 1


@pytest.mark.asyncio
async def test_clarify_exit_condition_covers_slots_known(mock_journey_agent):
    agent = mock_journey_agent["agent"]
    clarify_state = mock_journey_agent["clarify_state"]
    await ep.create_discovery_journey(agent)

    condition = clarify_state.transition_to.call_args.kwargs["condition"].lower()
    assert "industry" in condition or "vertical" in condition
    assert "challenge" in condition


@pytest.mark.asyncio
async def test_clarify_exit_condition_caps_at_two_turns(mock_journey_agent):
    agent = mock_journey_agent["agent"]
    clarify_state = mock_journey_agent["clarify_state"]
    await ep.create_discovery_journey(agent)

    condition = clarify_state.transition_to.call_args.kwargs["condition"].lower()
    assert "2" in condition
    assert any(kw in condition for kw in ("clarif", "question", "turn", "asked"))


@pytest.mark.asyncio
async def test_clarify_merges_into_existing_search_state(mock_journey_agent):
    """
    clarify → search must target the *same* state object that was created for
    the discover → search path. This is the merge point in the graph.
    Using state= (not tool_state=) means no new state is created.
    """
    agent = mock_journey_agent["agent"]
    clarify_state = mock_journey_agent["clarify_state"]
    search_state = mock_journey_agent["search_state"]
    await ep.create_discovery_journey(agent)

    call = clarify_state.transition_to.call_args.kwargs
    assert call.get("state") is search_state
    assert "tool_state" not in call  # must reuse, not create a new tool state


# ── search → present ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_search_transitions_to_present_directly(mock_journey_agent):
    agent = mock_journey_agent["agent"]
    search_state = mock_journey_agent["search_state"]
    await ep.create_discovery_journey(agent)

    call = search_state.transition_to.call_args.kwargs
    assert call.get("condition") is None  # direct — no condition
    assert "chat_state" in call


@pytest.mark.asyncio
async def test_present_action_prohibits_bullet_lists(mock_journey_agent):
    agent = mock_journey_agent["agent"]
    search_state = mock_journey_agent["search_state"]
    await ep.create_discovery_journey(agent)

    action = search_state.transition_to.call_args.kwargs["chat_state"].lower()
    assert "bullet" in action or "no bullet" in action


@pytest.mark.asyncio
async def test_present_action_mentions_executive_audience(mock_journey_agent):
    agent = mock_journey_agent["agent"]
    search_state = mock_journey_agent["search_state"]
    await ep.create_discovery_journey(agent)

    action = search_state.transition_to.call_args.kwargs["chat_state"].lower()
    assert any(kw in action for kw in ("executive", "senior", "leader"))


# ── Full graph — call ordering sanity check ────────────────────────────────────

@pytest.mark.asyncio
async def test_state_creation_order(mock_journey_agent):
    """
    Verify that states are created in the correct dependency order:
    initial → discover → (search, clarify) → present
    The first discover transition must be search (tool_state) so that
    search_state exists before clarify can reference it via state=.
    """
    agent = mock_journey_agent["agent"]
    discover_state = mock_journey_agent["discover_state"]
    clarify_state = mock_journey_agent["clarify_state"]
    search_state = mock_journey_agent["search_state"]

    await ep.create_discovery_journey(agent)

    discover_calls = discover_state.transition_to.call_args_list
    # Search (tool_state) must come before clarify (chat_state)
    assert "tool_state" in discover_calls[0].kwargs
    assert "chat_state" in discover_calls[1].kwargs

    # clarify must reference the search_state that was created by the first discover call
    clarify_call = clarify_state.transition_to.call_args.kwargs
    assert clarify_call.get("state") is search_state
