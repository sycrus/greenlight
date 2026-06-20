# End-to-end testing guide

This guide walks through running the full stack locally and verifying each layer works — from the browser down to memory persistence.

**What you need:**
- Docker Desktop running
- `.env` at the repo root with `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` set
- `pnpm install` already run

---

## Start the stack

```bash
# Step 1 — data layer (if not already running)
docker compose up postgres mem0 -d

# Step 2 — agent + Parlant (builds images on first run, ~2 min)
docker compose up agent parlant -d

# Step 3 — check everything is healthy
docker compose ps
```

All four services should show `healthy` or `running`. If something is stuck, check logs:

```bash
docker compose logs agent parlant --tail=30
```

Wait for:
- Agent: `Server listening on port 8000`
- Parlant: `Application startup complete`

```bash
# Step 4 — frontend (separate terminal)
pnpm --filter @gen-ux/frontend dev
```

Open `http://localhost:3000`.

---

## Test scenarios

Run these in order. Each one exercises a different layer of the stack.

### 1. Weather query — routing + generative component

> **Send:** "What's the weather in Sydney?"

**Expected:**
- Parlant fires the routing guideline and delegates to the LangGraph agent
- The orchestrator routes to the weather agent
- A `WeatherCard` component renders in the chat (not plain text)
- Live temperature and conditions from OpenWeatherMap

**Verify in Parlant sandbox** (`http://localhost:8800`): the `langgraph_agent` tool call should appear in the trace.

---

### 2. Customer service — plain streaming response

> **Send:** "I want to return my order"

**Expected:**
- Parlant's escalation guideline fires
- Response comes directly from Parlant (no agent tool call)
- Streaming text reply, no component rendered

**Verify:** the Parlant sandbox should show no tool call for this turn.

---

### 3. Brand guardrail — Parlant deflection

> **Send:** "How do you compare to your competitors?"

**Expected:**
- Parlant's competitor-deflection guideline fires
- Response comes directly from Parlant without calling the agent
- Polite deflection, no product comparisons

---

### 4. Memory — write then recall across sessions

**Turn 1** — add a fact:
> **Send:** "Just so you know, I prefer dark mode and I'm based in Sydney"

**Turn 2** — refresh the page (new session), then ask:
> **Send:** "What do you know about my preferences?"

**Expected:** the agent recalls dark mode and Sydney from the previous session.

**Watch mem0 logs** while you send the first message:
```bash
docker compose logs mem0 -f
```
You should see `POST /v1/memories/` calls as Mem0 distils the fact into structured entries.

---

### 5. Memory — contradiction resolution

**Turn 1:**
> **Send:** "My favourite design tool is Figma"

**Turn 2** (same or new session):
> **Send:** "I've switched to Framer, it fits my workflow better"

**Turn 3:**
> **Send:** "What design tool do I use?"

**Expected:** Framer is the answer — the Figma preference should be superseded, not both returned.

---

## Spot-check the memory store directly

```bash
# See what's been stored for a user (replace USER_ID with the actual value from agent logs)
curl "http://localhost:8080/v1/memories/?user_id=USER_ID"

# Search
curl -X POST http://localhost:8080/v1/memories/search/ \
  -H "Content-Type: application/json" \
  -d '{"query": "design tool preference", "user_id": "USER_ID", "limit": 5}'
```

The `user_id` is logged by the agent on each request — look for `[memory]` lines in `docker compose logs agent`.

---

## Automated tests

The integration test suite covers the same scenarios above programmatically:

```bash
# Requires docker compose up postgres mem0 -d
pnpm --filter @gen-ux/agent test
```

Logs are written to `logs/test-YYYYMMDD-HHMMSS.log`.

To run the memory suite only:
```bash
pnpm --filter @gen-ux/agent exec vitest run tests/memory/
```

---

## Troubleshooting

**Parlant won't start**
- Check `OPENAI_API_KEY` is set in `.env` — Parlant uses it for guideline embedding
- Check `AGENT_URL=http://localhost:8000` is reachable (agent must be up first)

**Weather card not rendering**
- Check `WEATHER_API_KEY` in `.env` — without it the agent returns mock data, which may not trigger component rendering
- Check the browser console for `ComponentRenderer` errors

**Memory not persisting across sessions**
- Check `MEM0_BASE_URL=http://localhost:8080` is set in `.env`
- Verify mem0 is running: `curl http://localhost:8080/health`
- The `user_id` must be consistent across sessions — check how the frontend sets it in `frontend/app/src/app/api/chat/route.ts`

**`mem0` shows `unhealthy` in `docker compose ps`**
- Usually a timing issue from startup — if `curl http://localhost:8080/health` returns `{"status":"ok"}` it is working fine

**Slow first response**
- Normal — Claude Haiku cold start + Parlant guideline scoring adds ~2–3 s on the first turn
