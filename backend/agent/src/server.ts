/**
 * Agent HTTP server.
 *
 * Exposes two endpoints:
 *
 *   POST /chat          — accepts a message, returns SSE stream of AG-UI events.
 *                         Frontend connects here via the Next.js API proxy.
 *                         Parlant also calls this endpoint as a "tool" when
 *                         it decides an actionable workflow is needed.
 *
 *   GET  /health        — liveness probe for Docker / Cloud Run.
 *
 * AG-UI event stream format (SSE):
 *   Each line: `data: <JSON>\n\n`
 *   Events: RUN_STARTED, TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT,
 *           TEXT_MESSAGE_END, TOOL_CALL_START, TOOL_CALL_END, RUN_FINISHED
 *
 * Parlant integration:
 *   Parlant is configured to treat POST /chat as a callable tool.
 *   It sends the user message here after evaluating brand guidelines.
 *   For dev, the frontend can also call /chat directly (bypassing Parlant).
 *   See services/parlant/config/guidelines.yaml for Parlant tool config.
 */

import express from "express"
import cors from "cors"
import { HumanMessage } from "@langchain/core/messages"
import { graph } from "./graph/index.js"
import { memoryStore } from "./memory/store.js"
import { classifyEpisodicEvent } from "./memory/episodic.classifier.js"
import { initTelemetry, shutdownTelemetry } from "./observability/otel.js"
import type { ChatRequest, AGUIEvent } from "./types/index.js"

initTelemetry()

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env["PORT"] ?? 8000

// ── Component spec store — latest spec per session ────────────────────────────
// Lets the Next.js route retrieve the spec after Parlant strips it from the text.
interface SpecEntry {
  spec: Record<string, unknown> | null
  items: Array<{ insight: string; spec: Record<string, unknown> }> | null
}
const componentSpecBySession = new Map<string, SpecEntry>()

// ── Health check ──────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gen-ux-agent" })
})

// ── Chat endpoint (SSE) ───────────────────────────────────────────────────────

app.post("/chat", async (req, res) => {
  const { message, userId, sessionId, agent } = req.body as ChatRequest

  if (!userId || !sessionId) {
    res.status(400).json({ error: "userId and sessionId are required" })
    return
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no")  // nginx: disable buffering

  const runId = crypto.randomUUID()

  function emit(event: AGUIEvent): void {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  function emitEvent(type: AGUIEvent["type"], data?: Record<string, unknown>): void {
    const event: AGUIEvent = { type, timestamp: new Date().toISOString(), runId }
    if (data !== undefined) event.data = data
    emit(event)
  }

  try {
    emitEvent("RUN_STARTED")

    // slide_deck_agent can be called with empty message — it uses stored memories.
    // Claude requires non-empty content, so substitute a minimal prompt.
    const effectiveMessage = message || "Build a slide deck from my context."

    // Recall stored memories for context-sensitive agents (skip weather — ephemeral)
    let memories: string[] = []
    if (agent !== "weather") {
      try {
        const entries = await memoryStore.search(userId, effectiveMessage, 5)
        memories = entries.map((e) => e.content)
        console.log(`[server] memory recall — userId=${userId} agent=${agent ?? "customer_service"} found=${memories.length}`, memories)
      } catch (err) {
        console.warn("[server] memory recall failed:", err)
      }
    }

    // SSE keepalive — prevents Parlant's httpx read timeout (120s) from firing
    // during long LLM calls (RAG + Sonnet JSON generation can take 20–40s).
    const keepalive = setInterval(() => { res.write(": keep-alive\n\n") }, 15_000)

    let result: Awaited<ReturnType<typeof graph.invoke>>
    try {
      result = await graph.invoke(
        {
          messages: [new HumanMessage(effectiveMessage)],
          userId,
          sessionId,
          route: { agent: agent ?? "customer_service", reason: "parlant-routed" },
          response: null,
          componentSpec: null,
          componentSpecItems: null,
          memories,
        },
        {
          configurable: { thread_id: sessionId },
        }
      )
    } finally {
      clearInterval(keepalive)
    }

    // Fire-and-forget — skip ephemeral routes (weather has no long-term value)
    if (result.route?.agent !== "weather") {
      void memoryStore.add(userId, message, { sessionId, agentRoute: result.route?.agent ?? "unknown", type: "semantic" })
    }

    const responseText = result.response ?? ""

    // Fire-and-forget — classify agent response for episodic events (resolutions, confirmations)
    if (result.route?.agent === "customer_service" && responseText) {
      void classifyEpisodicEvent(message, responseText).then((summary) => {
        if (summary) {
          void memoryStore.add(userId, summary, { sessionId, agentRoute: "customer_service", type: "episodic" })
        }
      })
    }
    const componentSpec = result.componentSpec ?? null
    const componentSpecItems = result.componentSpecItems ?? null
    console.log(`[server] result agent=${agent ?? "unknown"} componentSpec=${componentSpec?.component ?? "null"} items=${componentSpecItems?.length ?? 0} response="${responseText.slice(0, 80)}"`)

    // Store spec/items so the Next.js route can retrieve via GET /sessions/:id/component-spec
    // SlideDeck takes priority: don't overwrite an existing single-spec entry (SlideDeck)
    // with CaseStudyCards items when both agents run in the same Parlant turn.
    if (componentSpecItems && componentSpecItems.length > 0) {
      const existing = componentSpecBySession.get(sessionId)
      if (!existing?.spec) {
        console.log(`[server] storing CaseStudyCards for session=${sessionId} (existing=${JSON.stringify(existing?.spec ?? null)})`)
        componentSpecBySession.set(sessionId, {
          spec: null,
          items: componentSpecItems as unknown as Array<{ insight: string; spec: Record<string, unknown> }>,
        })
      } else {
        console.log(`[server] skipping CaseStudyCards overwrite — SlideDeck already stored for session=${sessionId}`)
      }
      const chunkSize = 20
      for (const item of componentSpecItems) {
        emitEvent("TEXT_MESSAGE_START", { role: "assistant" })
        for (let i = 0; i < item.insight.length; i += chunkSize) {
          emitEvent("TEXT_MESSAGE_CONTENT", { delta: item.insight.slice(i, i + chunkSize) })
        }
        emitEvent("TEXT_MESSAGE_END")
        emitEvent("TOOL_CALL_START", { toolName: item.spec.component })
        emitEvent("TOOL_CALL_END", { spec: item.spec })
      }
    } else if (componentSpec) {
      console.log(`[server] storing SlideDeck for session=${sessionId}`)
      componentSpecBySession.set(sessionId, {
        spec: componentSpec as unknown as Record<string, unknown>,
        items: null,
      })
      emitEvent("TOOL_CALL_START", { toolName: componentSpec.component })
      emitEvent("TOOL_CALL_END", { spec: componentSpec })
      emitEvent("TEXT_MESSAGE_START", { role: "assistant" })
      const chunkSize = 20
      for (let i = 0; i < responseText.length; i += chunkSize) {
        emitEvent("TEXT_MESSAGE_CONTENT", { delta: responseText.slice(i, i + chunkSize) })
      }
      emitEvent("TEXT_MESSAGE_END")
    } else {
      emitEvent("TEXT_MESSAGE_START", { role: "assistant" })
      const chunkSize = 20
      for (let i = 0; i < responseText.length; i += chunkSize) {
        emitEvent("TEXT_MESSAGE_CONTENT", { delta: responseText.slice(i, i + chunkSize) })
      }
      emitEvent("TEXT_MESSAGE_END")
    }

    emitEvent("RUN_FINISHED", {
      agentNode: result.route?.agent ?? "unknown",
    })
  } catch (err) {
    console.error("[server] Error during graph invocation:", err)
    emitEvent("RUN_ERROR", {
      message: err instanceof Error ? err.message : "Unknown error",
    })
  } finally {
    res.end()
  }
})

// ── Component spec side-channel ───────────────────────────────────────────────
// Parlant discards TOOL_CALL_END when it regenerates the response in brand voice.
// The Next.js route calls this after getting the Parlant reply to retrieve the spec.

app.get("/sessions/:sessionId/component-spec", (req, res) => {
  const sid = req.params["sessionId"] ?? ""
  const entry = componentSpecBySession.get(sid)
  if (entry) {
    componentSpecBySession.delete(sid)
    res.json(entry)
  } else {
    res.json({ spec: null, items: null })
  }
})

// ── Start ─────────────────────────────────────────────────────────────────────

export const server = app.listen(PORT, () => {
  console.log(`[server] Agent server running on http://localhost:${PORT}`)
  console.log(`[server] POST /chat  — SSE stream`)
  console.log(`[server] GET  /health`)
})

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(): Promise<void> {
  console.log("[server] Shutting down...")
  server.close()
  await shutdownTelemetry()
  process.exit(0)
}

process.on("SIGTERM", () => void shutdown())
process.on("SIGINT", () => void shutdown())
