# Discovery Onboarding Journey

Defined in: `backend/parlant/entrypoint.py` → `create_discovery_journey()`

---

## Purpose

Guides a user through structured context collection before triggering a RAG search. The goal is to gather enough information about the user's industry, challenge, and situation to construct a meaningful search query — rather than firing RAG on a vague opening message.

---

## Entry Conditions

The journey activates when **either** of the following is true:

1. **Cold start** — this is the very first message in a new conversation session.
2. **Explicit restart** — the user asks to start a new search, look for something different, or restart the conversation.

Vague openers (e.g. "tell me about Endava") are caught by condition 1 and naturally enter the journey without a pushy redirect.

---

## Slot Collection

The journey collects two **required** slots and three **optional hints**:

| Slot | Type | Used for |
|---|---|---|
| `industry` / `vertical` | Required | RAG query construction |
| `primary_challenge` | Required | RAG query construction |
| `role` | Optional hint | Query refinement |
| `company_size` | Optional hint | Query refinement |
| `timeline` | Optional hint | Query refinement |

A journey-scoped guideline fires `save_memory` whenever any of these details are mentioned, persisting them to Mem0 for future sessions.

---

## State Diagram

```
initial_state
    │
    │ (direct)
    ▼
welcome_state           ← chat state
    │
    │ (direct)
    ▼
discover_state          ← chat state
    │                │
    │ vertical AND   │ vertical OR
    │ challenge      │ challenge
    │ known          │ missing
    ▼                ▼
search_state    clarify_state   ← chat state
(tool)              │
    ▲               │ vertical AND challenge known
    │               │   OR 2+ clarifying turns asked
    └───────────────┘
    │
    │ (direct)
    ▼
present_state           ← chat state
```

---

## States

### `initial_state`

The implicit entry point created by Parlant for every journey. Has no action of its own. Transitions directly to `welcome_state`.

---

### `welcome_state`

**Type:** chat  
**Variable:** `welcome_state = t.target` (from `journey.initial_state.transition_to(...)`)

Delivers a scripted, persona-establishing opener. Introduces what the advisor does in 2–3 sentences: surfacing Endava case studies, proof points, and capability examples tailored to the user's situation. Does **not** ask a question. Ends with a natural opening that invites the user to share their context.

**Transition out:** direct → `discover_state`

---

### `discover_state`

**Type:** chat  
**Variable:** `discover_state = t.target` (from `welcome_state.transition_to(...)`)

Asks the user one open-ended question to gather context. The agent needs two things in this turn: the user's industry or vertical, and their primary business challenge or objective. Optional hints (role, company size, timeline) are noted if offered but not demanded.

The question is framed as peer curiosity — one focused sentence, not a form.

**Transitions out (both conditional, evaluated on the user's reply):**

| Condition | Target |
|---|---|
| Industry/vertical **and** primary challenge are both clear | `search_state` |
| Industry/vertical **or** primary challenge is not yet clear | `clarify_state` |

---

### `clarify_state`

**Type:** chat  
**Variable:** `clarify_state = t_clarify.target` (from `discover_state.transition_to(...)`)

Asks exactly one targeted follow-up question per turn. Priority: industry/vertical first, then primary challenge. The agent does not ask multiple questions at once and frames each question as genuine peer curiosity, not an intake checklist.

The agent remains in this state across multiple turns until an exit condition fires. On each user message, Parlant re-evaluates the transition condition.

**Max turns:** 2. If 2 or more clarifying questions have already been asked, the journey proceeds to `search_state` regardless of whether all slots are filled.

**Transition out (conditional):**

| Condition | Target |
|---|---|
| Industry/vertical and challenge are now known, **or** 2+ clarifying questions have been asked | `search_state` |

---

### `search_state`

**Type:** tool (fires `rag_agent`)  
**Variable:** `search_state = t_search.target` (from `discover_state.transition_to(tool_state=rag_agent, ...)`)

A non-message-producing state that constructs a targeted RAG query from all collected context and calls `rag_agent`. The query synthesises everything known — industry, challenge, role, company size, timeline — into a single focused natural-language string.

Example synthesised query:
> `retail company facing checkout abandonment, VP Engineering, mid-market, Q3 evaluation`

This state is the **merge point** for both paths out of `discover_state` (happy path) and `clarify_state` (exit path). Both transitions target the same `search_state` object by ID.

**Transition out:** direct → `present_state`

---

### `present_state`

**Type:** chat  
**Variable:** implicit target (from `search_state.transition_to(chat_state=...)`)

Presents the RAG results in a peer-expert, executive-summary tone. Writes in confident, flowing prose — no bullet lists, no "here are your results" preamble. Selects the 1–2 most relevant results if multiple are returned. Cites sources naturally within the narrative. Keeps to 3 short paragraphs maximum.

The state is written for senior leaders with limited time: every sentence must earn its place.

**Transition out:** none — the journey ends here and control returns to the normal global guidelines flow (e.g. CTA routing, compliance rules).

---

## Journey-Scoped Guideline

A single guideline is registered on the journey itself (not globally):

**Condition:** The user mentions their industry, vertical, company name, role, company size, primary challenge, pain point, or timeline during this discovery conversation.

**Action:** Save this specific detail to memory using `save_memory` so it can personalise future sessions. Acknowledge it naturally in the response without repeating it verbatim.

**Tool:** `save_memory`

This fires on any turn within the journey where a discovery slot is shared — including in `welcome_state`, `discover_state`, and `clarify_state`. It supplements (not replaces) the global memory guideline in `guidelines.yaml`.

---

## Memory Persistence

| Event | What is saved |
|---|---|
| User shares vertical/industry | Saved via journey-scoped guideline → `save_memory` |
| User shares challenge/pain point | Saved via journey-scoped guideline → `save_memory` |
| User shares role, company size, or timeline | Saved via journey-scoped guideline → `save_memory` |

Memories are written to Mem0 (fire-and-forget) and retrieved passively on subsequent turns via `memory_retriever`. A returning user with prior context can therefore skip parts of the discovery flow if the memory retriever injects enough context.

---

## Rebuild Note

`entrypoint.py` is `COPY`'d into the Docker image. Any change to this file requires a full image rebuild:

```bash
docker compose build parlant && docker compose up -d parlant
```

`config/guidelines.yaml` is bind-mounted and only needs `--force-recreate`.

---

## Visualise

Once the service is running, the Mermaid diagram for this journey is available at:

```
http://localhost:8800/journeys/<JOURNEY_ID>/mermaid
```

The journey ID is assigned at startup and logged to stdout.
