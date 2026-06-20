---
skill: parlant
version: 0.1
owner: platform-team
source: https://www.parlant.io/docs/concepts/
---

## What Parlant Is

Parlant is a **conversational control layer** — it decides what the agent says, when, and why.
It does not replace LangGraph. LangGraph handles data workflows; Parlant handles brand, compliance, memory, and routing decisions.

```
User message → Parlant (evaluates guidelines) → tool call (optional) → LangGraph agent → Parlant wraps in brand voice → User
```

---

## Core Entities

### Agent
The single AI personality users talk to. One agent is correct — Parlant recommends against splitting by topic (research shows coordination overhead outweighs specialisation benefits). Split only for distinct *personas or audiences*, never for different intents.

Key properties:
- `description` — always in context; sets baseline persona. Keep it short and purposeful.
- `max_engine_iterations` — how many tool calls per turn. Default is unlimited; use `3` as a safe cap.
- `output_mode` — `BLOCK` (default, full response at once) or `STREAM` (token-by-token, needs `FLUID` composition mode).

```python
agent = await server.create_agent(
    name="concierge",
    description="A warm, brand-consistent customer concierge.",
    max_engine_iterations=3,
)
```

### Customer
Anyone interacting with an agent. Registering customers enables personalisation; unregistered users run in guest mode.

- Use custom IDs to map to your own user system: `id="usr_12345"`
- Attach metadata for context: `metadata={"plan": "enterprise", "location": "AU"}`
- Bind mid-session after auth: `sessions.update(session_id=..., customer_id=...)`
- Segment via tags for group-specific guidelines: e.g. `tags=["vip"]`

### Session
A continuous conversation between an agent and a customer. Automatically carries full chat history — no separate memory config needed for within-session context.

- Events are a sequential timeline (offset-based). Each event has: type, data, timestamp, trace_id.
- `source` field distinguishes: `ai_agent`, `customer`, `human_agent`, `system`
- Labels propagate from matched guidelines — use for analytics and routing
- Session metadata (key-value) can be written from tools for stateful workflows
- Storage: in-memory (dev) → file-based (local) → MongoDB (prod)

---

## Customisation Mechanisms

### Guidelines (primary mechanism)
The core behavioural primitive. A guideline = `condition` + `action`, evaluated per turn via NLP.

```python
await agent.create_guideline(
    condition="The user expresses frustration",
    action="Acknowledge the frustration before offering a solution.",
)
```

**Duration is inferred automatically from phrasing:**
- "When X, do Y" → one-off (fires once, deactivates)
- "When X, do Y until W" → persistent (stays active until resolved)
- "As long as X, do Y" → continuous

**Tool attachment** — tools only enter context when their guideline fires:
```python
await agent.create_guideline(
    condition="The user asks about weather",
    action="Use the langgraph_agent tool to get real-time data.",
    tools=[langgraph_agent],
)
```

**Key constraints:**
- Conditions must be observable from the conversation — the agent can't evaluate internal state it hasn't seen
- Predictive conditions ("when the agent is about to...") have false positive/negative risk — keep conditions grounded in customer behaviour
- `track=True` (default) prevents a guideline re-applying in the same conversation to avoid context pollution

**Always-on guidelines** — use `p.MATCH_ALWAYS` sparingly (e.g. brand tone). Every always-on guideline adds to every turn's context.

**Tags** — group guidelines for batch relationship management:
```python
await agent.create_guideline(..., tags=["compliance"])
```

---

### Tools
On-demand actions triggered when a guideline fires. Tools only enter the agent's context when their associated guideline matches — this prevents false-positive invocations.

```python
@p.tool
async def my_tool(context: p.ToolContext, param: str) -> p.ToolResult:
    """Description the agent reads to understand when/how to use this tool."""
    result = await do_something(param)
    return p.ToolResult(data=result)
```

**ToolContext always provides:**
- `context.customer_id` — current customer ID (no hasattr check needed)
- `context.session_id` — current session ID
- `context.agent_id` — current agent ID
- `context.emit_message(msg)` — send a progress update mid-tool

**ToolResult:**
- `data` — required, JSON-serialisable
- `metadata` — optional dict for frontend data (sources, chart data) without polluting LLM context
- `control.lifespan` — `"session"` (default, persists) or `"response"` (single-turn)

**Consequential flag** — for tools with irreversible side effects:
```python
@p.tool(consequential=True)
async def process_payment(...) -> p.ToolResult: ...
```

---

### Retrievers
Passive background context — run in parallel with guideline matching, not triggered by specific events. Use when the agent should *know* something, not *do* something.

```python
async def my_retriever(context: p.RetrieverContext) -> p.RetrieverResult:
    last_msg = context.interaction.last_customer_message
    if last_msg:
        docs = await knowledge_base.search(last_msg.content)
        return p.RetrieverResult(data=docs)

await agent.attach_retriever(my_retriever, id="kb-retriever")
```

**Scoped retrievers** — attach to a guideline so they only fire when relevant, reducing context pollution:
```python
await agent.create_guideline(..., retrievers=[my_retriever])
```

**Retrievers vs Tools:**
| | Retriever | Tool |
|---|---|---|
| Trigger | Every turn (or scoped to guideline) | Only when guideline fires |
| Purpose | Background grounding | Explicit action / data fetch |
| Result lifespan | Current response only | Session (default) |
| Use for | RAG, user profile context | API calls, workflows, memory |

---

### Journeys
Multi-turn structured flows (booking, onboarding, troubleshooting). Unlike state machines — adaptive, can skip/revisit states.

```python
journey = await agent.create_journey(
    title="Return flow",
    description="Guide customer through initiating a return",
    conditions=["Customer wants to return an item"],
)
```

**State types:**
- `chat` — agent converses, may stay multiple turns
- `tool` — calls a tool silently, must be followed by a chat state
- `fork` — routing node, no message generated

**Guidelines vs Journeys:**
- Guidelines define *rules* — always evaluated, agent-scoped
- Journeys define *flows* — sequential, activate on condition, then self-direct
- Guidelines take precedence over journey states when both apply
- Use journey-scoped guidelines for behaviour that only applies within the flow

---

### Relationships
Control how guidelines interact — prevent conflicts and enforce dependencies.

```python
await frustrated_customer.exclude(upsell_guidelines)  # don't upsell when upset
await premium_features.depend_on(enterprise_tag)       # only show if enterprise
await routing_guideline.entail(recall_memories)        # always recall before routing
```

**Four types:**
- `exclude` — when source fires, target is suppressed
- `depend_on` — source only fires if target also fires
- `entail` — source firing guarantees target fires (solves timing/chaining issues)
- `disambiguation` — prompts user to choose when multiple targets would fire

**Scale with tags:**
```python
await upset_observation.exclude(all_upsell_tag)  # applies to every tagged guideline at once
```

---

### Glossary
Domain vocabulary so the agent understands business-specific terms and synonyms.

```python
await agent.create_term(
    name="The Suite",
    description="Our premium enterprise product tier",
    synonyms=["enterprise plan", "pro tier", "suite plan"],
)
```

Use for: product names, internal terminology, abbreviations, banned/approved words.
Not for: dynamic data (use tools/retrievers), behavioural rules (use guidelines).

---

### Variables
Customer-specific context injected automatically into every turn. More structured than session metadata.

```python
plan_var = await agent.create_variable(
    name="subscription_plan",
    description="The customer's current subscription tier",
)
await plan_var.set_value_for_customer(customer=customer, value="enterprise")
# or bulk-set by tag:
await plan_var.set_value_for_tag(tag="enterprise", value="enterprise")
```

Variables can be tool-driven (auto-update from tool output) with optional freshness rules (cron).

---

### Canned Responses
Pre-approved message templates for precise output control. Agents draft a response, then select the best matching template.

```
Composition modes:
  FLUID     — prefer templates, generate freely if no match
  COMPOSITED — mimic template style when generating
  STRICT    — only output from templates; silence if no match
```

Templates support `{{std.customer.name}}`, generative fields, tool/retriever fields, and Jinja2 logic.

---

## Implementation Patterns for this Project

### Tool registration from YAML
```python
for g in BRAND_GUIDELINES:
    tags = g.get("tags", [])
    tools = []
    if "routing" in tags:
        tools = [langgraph_agent]
    elif "memory" in tags and "save" in tags:
        tools = [save_memory]
    elif "memory" in tags and "recall" in tags:
        tools = [recall_memories]
    await agent.create_guideline(
        condition=g["condition"],
        action=g["action"],
        tools=tools or None,
    )
```

### Session/customer IDs in tools
ToolContext always has these — no hasattr checks:
```python
user_id = str(context.customer_id)
session_id = str(context.session_id)
```

### Fire-and-forget tool calls (non-blocking)
```python
asyncio.create_task(_write())          # correct — don't await side-effect writes
return p.ToolResult(data="Noted.")     # return immediately
```

### Retrievers for RAG (phase 2)
Attach a scoped retriever to the routing guideline so knowledge base context only loads when the agent is about to delegate to LangGraph:
```python
await routing_guideline.attach_retriever(kb_retriever)
```

---

## What Stays in Code (Not Contentful)
- `@p.tool` function bodies — Python logic
- `get_instructions` callable in preamble_config
- Agent `description` (fetch from Contentful at startup if needed)
- Relationship definitions (`exclude`, `depend_on`, `entail`)

## What Should Move to Contentful (Phase 2)
- Guideline conditions and actions → `GuidelineEntry` content type
- Terminology (banned/approved words) → `TerminologyEntry`
- Preamble examples → `PreambleConfig`
- Journey definitions → `JourneyEntry`
- Variable default values → `VariableConfig`
