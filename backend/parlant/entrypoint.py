"""
Parlant entrypoint — Parlant as primary orchestrator.

Architecture:
    User message
      ↓
    Parlant  (this service, port 8800)
      - evaluates brand/compliance guidelines per turn
      - memory_retriever runs passively each turn (background context from Mem0)
      - handles simple responses directly in brand voice
      - calls save_memory tool for personalisation
      - calls weather_agent, rag_agent, or customer_service_agent tools for domain tasks
      ↓
    LangGraph agent server  (apps/agent, AGENT_URL)
      - agent type is specified in the request body — no second routing pass
      - returns structured data + componentSpec via AG-UI SSE stream
      ↓
    Parlant wraps data in brand tone → User

NLP service: OpenAI — GPT-4.1-mini for guideline evaluation/generation,
             text-embedding-3-small for guideline embeddings.
Memory: Mem0 OSS (MEM0_BASE_URL) — passive retriever every turn + save tool.

Guidelines: loaded from config/guidelines.yaml at startup.
TODO (phase 2): replace static YAML load with Contentful webhook sync.
"""

import asyncio
import json
import os

import httpx
import parlant.sdk as p
import yaml
from parlant.adapters.nlp.openai_service import (
    OpenAIService,
    OpenAIStreamingTextGenerator,
)


class GPT_4_1_Mini_Streaming(OpenAIStreamingTextGenerator):
    def __init__(self, logger: p.Logger, tracer: p.Tracer, meter: p.Meter) -> None:
        super().__init__(
            model_name="gpt-4.1-mini",
            logger=logger,
            tracer=tracer,
            meter=meter,
        )


class OpenAIMiniService(OpenAIService):
    async def get_streaming_text_generator(self, hints: dict = {}) -> GPT_4_1_Mini_Streaming:
        return GPT_4_1_Mini_Streaming(self._logger, self._tracer, self._meter)


def load_openai_mini(container: p.Container) -> OpenAIMiniService:
    return OpenAIMiniService(container[p.Logger], container[p.Tracer], container[p.Meter])

AGENT_URL = os.getenv("AGENT_URL", "http://localhost:8000")
MEM0_URL = os.getenv("MEM0_BASE_URL", "http://localhost:8080")
PORT = int(os.getenv("PARLANT_PORT", "8800"))

# ── Load guidelines config ─────────────────────────────────────────────────────

with open("config/guidelines.yaml") as f:
    config = yaml.safe_load(f)

BRAND_GUIDELINES: list[dict] = config.get("guidelines", [])
TERMINOLOGY: dict = config.get("terminology", {})

# ── Shared agent call helper ───────────────────────────────────────────────────

# Generous read timeout — slide_deck_agent runs RAG + Sonnet JSON generation
# which can take 20–40s. Connect timeout stays tight; read timeout covers the
# gap between RUN_STARTED and the first TEXT_MESSAGE_CONTENT chunk.
_AGENT_TIMEOUT = httpx.Timeout(connect=5.0, read=120.0, write=10.0, pool=5.0)

async def _call_agent(agent_name: str, message: str, user_id: str, session_id: str) -> str:
    """POST to the LangGraph agent server with a specific agent type."""
    full_response = ""
    async with httpx.AsyncClient(timeout=_AGENT_TIMEOUT) as client:
        async with client.stream(
            "POST",
            f"{AGENT_URL}/chat",
            json={
                "message": message,
                "userId": user_id,
                "sessionId": session_id,
                "agent": agent_name,
            },
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                try:
                    event = json.loads(line[6:])
                    if event.get("type") == "TEXT_MESSAGE_CONTENT":
                        full_response += event.get("data", {}).get("delta", "")
                except json.JSONDecodeError:
                    continue
    return full_response or "[no response from agent]"

# ── Tool: weather domain agent ────────────────────────────────────────────────

@p.tool
async def weather_agent(
    context: p.ToolContext,
    message: str,
) -> p.ToolResult:
    """Get real-time weather data for a location. Use when the user asks about weather, temperature, or forecast."""
    result = await _call_agent("weather", message, str(context.customer_id), str(context.session_id))
    return p.ToolResult(data=result)

# ── Tool: RAG knowledge base agent ───────────────────────────────────────────

@p.tool
async def rag_agent(
    context: p.ToolContext,
    message: str,
) -> p.ToolResult:
    """Retrieve information from the knowledge base and answer questions grounded in documented content. Use when the user asks about product documentation, website content, or any question answerable from the knowledge base."""
    result = await _call_agent("rag", message, str(context.customer_id), str(context.session_id))
    return p.ToolResult(data=result)

# ── Tool: customer service domain agent ───────────────────────────────────────

@p.tool
async def customer_service_agent(
    context: p.ToolContext,
    message: str,
) -> p.ToolResult:
    """Handle order lookups, account queries, and multi-step service workflows."""
    result = await _call_agent("customer_service", message, str(context.customer_id), str(context.session_id))
    return p.ToolResult(data=result)

# ── Tool: slide deck agent ─────────────────────────────────────────────────────

@p.tool
async def slide_deck_agent(
    context: p.ToolContext,
    message: str = "",
) -> p.ToolResult:
    """Build a navigable slide deck customised to the prospect's challenge, industry, and timeline. Use when the prospect asks for a summary, brief, deck, or presentation of the proof points discussed. The message parameter is optional — the agent will retrieve context from memory when not provided."""
    result = await _call_agent("slide_deck", message, str(context.customer_id), str(context.session_id))
    return p.ToolResult(data=result)

# ── Tool: save memory to Mem0 ─────────────────────────────────────────────────

@p.tool
async def save_memory(
    context: p.ToolContext,
    content: str,
) -> p.ToolResult:
    """Save something the user has shared about themselves."""
    user_id = str(context.customer_id)

    print(f"[parlant] save_memory fired — user_id={user_id!r} content={content!r}")

    async def _write() -> None:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    f"{MEM0_URL}/v1/memories/",
                    json={
                        "messages": [{"role": "user", "content": content}],
                        "user_id": user_id,
                    },
                )
                print(f"[parlant] save_memory stored — user_id={user_id!r} status={res.status_code}")
        except Exception as e:
            print(f"[parlant] save_memory background error: {e}")

    asyncio.create_task(_write())
    return p.ToolResult(data="Memory noted.")

# ── Retriever: user memory context (passive, runs every turn) ─────────────────
# Replaces the explicit recall_memories tool+guideline. Memories are injected
# as background context before any guideline fires — no tool call needed.

async def memory_retriever(context: p.RetrieverContext) -> p.RetrieverResult:
    user_id = str(context.customer.id)
    last_msg = context.interaction.last_customer_message
    query = last_msg.content if last_msg else ""

    if not query:
        return p.RetrieverResult(data="")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(
                f"{MEM0_URL}/v1/memories/search/",
                json={"query": query, "user_id": user_id, "limit": 5},
            )
            if res.status_code != 200:
                return p.RetrieverResult(data="")
            data = res.json()
            memories = data if isinstance(data, list) else data.get("results", [])
            if not memories:
                return p.RetrieverResult(data="")
            formatted = "\n".join(f"- {m['memory']}" for m in memories)
            print(f"[parlant] memory_retriever — user_id={user_id!r} found={len(memories)}: {[m['memory'] for m in memories]}")
            return p.RetrieverResult(data=f"What I know about this user:\n{formatted}")
    except Exception:
        return p.RetrieverResult(data="")

# ── Journey: Discovery Onboarding ─────────────────────────────────────────────

async def create_discovery_journey(agent: p.Agent) -> p.Journey:
    """
    Onboarding journey: welcome → discover → clarify (max 2 turns) → RAG search → present.

    Entry conditions:
      - Cold start (first message of a new session)
      - User explicitly asks to restart or search for something different

    Slot collection targets:
      Required: industry/vertical, primary challenge
      Optional hints: role, company size, timeline
    """
    journey = await agent.create_journey(
        title="Discovery Onboarding Journey",
        description=(
            "Guides users through structured discovery — learning their industry and "
            "challenge — before surfacing the most relevant Endava case studies and "
            "proof points via RAG. Activates on session start or explicit restart."
        ),
        conditions=[
            "This is the very first message in a new conversation session AND the user's message does NOT request a deck, brief, slides, presentation, or structured summary",
            "The user explicitly asks to start a new search, look for something different, or restart the conversation",
        ],
    )

    # Journey-scoped: save discovery slots to memory as they are shared
    await journey.create_guideline(
        condition=(
            "The user mentions their industry, vertical, company name, role, company size, "
            "primary challenge, pain point, or timeline during this discovery conversation"
        ),
        action=(
            "Save this specific detail to memory using save_memory so it can personalise "
            "future sessions. Acknowledge it naturally in your response without repeating it verbatim."
        ),
        tools=[save_memory],
    )

    # initial → discover (direct — welcome is hardcoded in the frontend)
    t = await journey.initial_state.transition_to(
        chat_state=(
            "Ask the user one open-ended question to understand their context. "
            "You need: their industry or vertical, and their primary business challenge "
            "or objective. If they volunteer role, company size, or timeline, note those too. "
            "Ask as a knowledgeable peer — one focused sentence. "
            "Example: 'What challenge or capability are you exploring, and what industry are you in?'"
        )
    )
    discover_state = t.target

    # discover → clarify (slots still missing after first reply)
    t_clarify = await discover_state.transition_to(
        condition=(
            "The user's industry or vertical OR their primary business challenge "
            "is not yet clear from the conversation"
        ),
        chat_state=(
            "Ask exactly one targeted follow-up question to fill the single most "
            "critical missing gap. Priority: industry or vertical first, then primary challenge. "
            "One sentence. Genuine peer curiosity, not a checklist."
        ),
    )
    clarify_state = t_clarify.target

    _deck_instruction = (
        "Call slide_deck_agent immediately. Synthesise all context gathered into a "
        "compact natural-language summary as the message argument: industry, challenge, "
        "and any available role, company size, or timeline. "
        "Example: 'mid-size bank, ~3000 employees, core banking modernisation without "
        "service disruption, 12-month deadline, VP Engineering'. "
        "Never omit the call because context seems incomplete — the agent retrieves "
        "from stored memories automatically."
    )

    _deck_confirm = (
        "Confirm in one short sentence the deck covers their context. "
        "Offer to go deeper on any specific slide. Do not repeat deck content."
    )

    # discover → deck (happy path: both slots known — build immediately)
    t_deck = await discover_state.transition_to(
        condition=(
            "The user's industry or vertical AND their primary business challenge or "
            "objective are both clear from the conversation"
        ),
        tool_state=slide_deck_agent,
        tool_instruction=_deck_instruction,
    )
    await t_deck.target.transition_to(chat_state=_deck_confirm)

    # clarify → deck (slots now filled, or max clarifying turns reached)
    t_clarify_deck = await clarify_state.transition_to(
        condition=(
            "The user's industry or vertical and primary challenge are now both known, "
            "OR 2 or more clarifying questions have already been asked in this session"
        ),
        tool_state=slide_deck_agent,
        tool_instruction=_deck_instruction,
    )
    await t_clarify_deck.target.transition_to(chat_state=_deck_confirm)

    return journey


# ── Journey: Slide Deck Generation ────────────────────────────────────────────

async def create_deck_journey(agent: p.Agent) -> p.Journey:
    """
    Deck journey: fires when the user asks for a deck/brief/slides.

    Uses tool_instruction (not action) so Parlant's LLM receives an explicit
    directive at call time — guaranteeing context is synthesised into the
    message argument rather than inferred from the action description.

    Entry conditions match both natural language and the deck_request intent
    signal injected by the Next.js intent classifier.
    """
    journey = await agent.create_journey(
        title="Slide Deck Generation Journey",
        description=(
            "Generates a navigable, prospect-specific slide deck when the user asks "
            "for a deck, brief, slides, or presentation. Uses all context gathered in "
            "the conversation to build a targeted brief without asking for clarification."
        ),
        conditions=[
            "The user's CURRENT message explicitly requests a deck, brief, slides, "
            "presentation, or structured summary to be built or generated — for example: "
            "'build me a deck', 'give me a brief', 'put this together', 'make me slides', "
            "'summarise what you have into a deck'. The request must be in the user's "
            "most recent message, not in background context or prior conversation history.",
            "The intent_signals block in the user's CURRENT message shows "
            "category: deck_request",
        ],
    )

    t = await journey.initial_state.transition_to(
        tool_state=slide_deck_agent,
        tool_instruction=(
            "Call slide_deck_agent immediately. Do NOT ask for clarification. "
            "The message parameter is OPTIONAL. If context about the prospect's "
            "industry, challenge, timeline, or role is available in the conversation "
            "or retrieved memories, synthesise it into a compact natural-language "
            "string. Example: 'mid-size bank, ~3000 employees, core banking "
            "modernisation without service disruption, 12-month CTO deadline, "
            "VP Engineering, needs proof of successful bank migrations'. "
            "If no context is available, pass an empty string. "
            "The agent retrieves context from stored memories automatically. "
            "NEVER omit the tool call because context is incomplete."
        ),
    )

    await t.target.transition_to(
        chat_state=(
            "The deck is ready. Confirm in one short sentence it covers their context. "
            "Offer to go deeper on any slide. Do not repeat deck content."
        )
    )

    return journey


# ── Main ───────────────────────────────────────────────────────────────────────

async def main() -> None:
    try:
        async with p.Server(port=PORT, nlp_service=load_openai_mini) as server:
            agent = await server.create_agent(
                name="endava-advisor",
                description=(
                    "An expert advisor representing Endava — a global technology delivery partner. "
                    "The user is a technology leader (CTO, VP Engineering, or digital transformation "
                    "owner) self-qualifying Endava as a potential partner for a specific capability gap. "
                    "Respond as a knowledgeable peer: direct, specific, and evidence-led. "
                    "Never use sales language. Surface proof points over claims."
                ),
                max_engine_iterations=2,
            )

            # ── Global memory retriever — passive context every turn ───────────
            await agent.attach_retriever(memory_retriever, id="memory-retriever")

            # ── Approved brand terminology ─────────────────────────────────────
            for term in TERMINOLOGY.get("approved", []):
                await agent.create_term(
                    name=term,
                    description=f'Preferred brand language. Use "{term}" when describing our service.',
                    synonyms=[],
                )

            # ── Register guidelines ────────────────────────────────────────────
            for g in BRAND_GUIDELINES:
                tags = g.get("tags", [])

                if "routing" in tags:
                    if "weather" in tags:
                        tool = weather_agent
                    elif "deck" in tags:
                        continue  # handled by deck journey — skip guideline registration
                    elif "rag" in tags:
                        tool = rag_agent
                    else:
                        tool = customer_service_agent
                    await agent.create_guideline(
                        condition=g["condition"],
                        action=g["action"],
                        tools=[tool],
                    )

                elif "memory" in tags and "save" in tags:
                    await agent.create_guideline(
                        condition=g["condition"],
                        action=g["action"],
                        tools=[save_memory],
                    )

                else:
                    await agent.create_guideline(
                        condition=g["condition"],
                        action=g["action"],
                    )

            # ── Journey: Discovery Onboarding ─────────────────────────────────
            await create_discovery_journey(agent)

            # ── Journey: Slide Deck Generation ────────────────────────────────
            await create_deck_journey(agent)

            print(f"[parlant] Listening on port {PORT}")
            print(f"[parlant] LangGraph agent URL: {AGENT_URL}")
            print(f"[parlant] Mem0 URL: {MEM0_URL}")
            print(f"[parlant] Guidelines registered: {len(BRAND_GUIDELINES)}")
            print(f"[parlant] Agent ID: {agent.id}")

    except Exception as e:
        import traceback
        print(f"[parlant] STARTUP ERROR: {e}", flush=True)
        traceback.print_exc()
        raise


if __name__ == "__main__":
    asyncio.run(main())
