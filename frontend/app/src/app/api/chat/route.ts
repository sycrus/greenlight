/**
 * Next.js API route — chat proxy.
 *
 * Two modes controlled by PARLANT_ENABLED env var (default: true):
 *
 * Parlant mode (PARLANT_ENABLED=true):
 *   Browser → POST /api/chat
 *     → Parlant REST API (session + events)
 *       → Parlant evaluates guidelines, calls domain tools
 *     → stream Parlant reply events to browser as AG-UI SSE
 *
 * Direct mode (PARLANT_ENABLED=false — local dev without Docker):
 *   Browser → POST /api/chat
 *     → Agent server POST /chat
 *     → proxy AG-UI SSE stream straight through to browser
 *
 * Session mapping: our sessionId → Parlant session ID (in-process Map).
 * Agent ID: auto-discovered from GET /agents on first request.
 */

import { type NextRequest } from "next/server"
import { enrichMessage } from "@/lib/signals/intent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PARLANT_URL = process.env["PARLANT_URL"] ?? "http://localhost:8800"
const AGENT_URL = process.env["AGENT_URL"] ?? "http://localhost:8000"
const PARLANT_ENABLED = process.env["PARLANT_ENABLED"] !== "false"

// In-process caches — reset on server restart (acceptable for dev/MVP)
const parlantSessions = new Map<string, string>()   // sessionId → parlantSessionId
const parlantCustomers = new Map<string, string>()  // userId → parlantCustomerId
let cachedAgentId: string | null = null

// ── Parlant helpers ───────────────────────────────────────────────────────────

async function getAgentId(): Promise<string> {
  if (cachedAgentId) return cachedAgentId

  const res = await fetch(`${PARLANT_URL}/agents`)
  if (!res.ok) throw new Error(`Parlant /agents failed: ${res.status}`)

  const agents = await res.json() as Array<{ id: string; name: string }>
  const agent = agents[0]
  if (!agent) throw new Error("No agents registered in Parlant")

  cachedAgentId = agent.id
  return cachedAgentId
}

async function getOrCreateCustomer(userId: string): Promise<string> {
  const existing = parlantCustomers.get(userId)
  if (existing) {
    const verify = await fetch(`${PARLANT_URL}/customers/${encodeURIComponent(userId)}`)
    if (verify.ok) { console.log(`[chat/route] customer verified: ${userId}`); return existing }
    console.log(`[chat/route] customer cache stale, re-registering: ${userId}`)
    parlantCustomers.delete(userId)
  }

  const check = await fetch(`${PARLANT_URL}/customers/${encodeURIComponent(userId)}`)
  if (check.ok) {
    console.log(`[chat/route] customer exists in Parlant: ${userId}`)
    parlantCustomers.set(userId, userId)
    return userId
  }

  console.log(`[chat/route] creating Parlant customer: ${userId}`)
  const res = await fetch(`${PARLANT_URL}/customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: userId, name: userId }),
  })

  if (!res.ok) {
    const verify = await fetch(`${PARLANT_URL}/customers/${encodeURIComponent(userId)}`)
    if (!verify.ok) throw new Error(`Parlant /customers failed: ${res.status}`)
    console.log(`[chat/route] customer race-created: ${userId}`)
  } else {
    console.log(`[chat/route] customer created: ${userId}`)
  }

  parlantCustomers.set(userId, userId)
  return userId
}

async function getOrCreateSession(sessionId: string, agentId: string, userId: string): Promise<string> {
  const existing = parlantSessions.get(sessionId)
  if (existing) return existing

  const parlantCustomerId = await getOrCreateCustomer(userId)

  const res = await fetch(`${PARLANT_URL}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: agentId, customer_id: parlantCustomerId }),
  })
  if (!res.ok) throw new Error(`Parlant /sessions failed: ${res.status}`)

  const session = await res.json() as { id: string }
  parlantSessions.set(sessionId, session.id)
  return session.id
}

async function sendMessage(parlantSessionId: string, message: string): Promise<number> {
  const res = await fetch(`${PARLANT_URL}/sessions/${parlantSessionId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "customer", kind: "message", message }),
  })
  if (!res.ok) throw new Error(`Parlant send message failed: ${res.status}:${parlantSessionId}`)
  const event = await res.json() as ParlantEvent
  return event.offset
}

type ParlantEvent = {
  id: string
  source: string
  kind: string
  offset: number
  data?: {
    message?: string
    status?: string
    data?: { stage?: string }
    tags?: string[]
    tool_calls?: Array<{ tool_id: string; arguments?: Record<string, unknown>; result?: unknown }>
  }
}

// ── Component spec side-channel ───────────────────────────────────────────────

interface SpecEntry {
  spec: Record<string, unknown> | null
  items: Array<{ insight: string; spec: Record<string, unknown> }> | null
}

async function fetchComponentSpec(sessionId: string): Promise<SpecEntry> {
  try {
    const res = await fetch(`${AGENT_URL}/sessions/${sessionId}/component-spec`)
    if (!res.ok) return { spec: null, items: null }
    return await res.json() as SpecEntry
  } catch {
    return { spec: null, items: null }
  }
}

// ── Streaming Parlant reply → AG-UI SSE ───────────────────────────────────────
//
// Waits for Parlant to complete, then decides what to emit:
//   - If agent produced per-card items: emit one message block per card
//     (insight text + single CaseStudyCard). Parlant's rewritten text is
//     discarded — the insights are the messages.
//   - If agent produced a single component spec: emit TOOL_CALL + Parlant text.
//   - Otherwise: emit Parlant text only.

async function streamParlantReply(
  parlantSessionId: string,
  afterOffset: number,
  controller: ReadableStreamDefaultController<Uint8Array>,
  emit: (type: string, data?: Record<string, unknown>) => Uint8Array,
  timeoutMs = 120_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  const pollIntervalMs = 300
  const seenOffsets = new Set<number>()
  const emittedStatuses = new Set<string>()
  const parlantTextParts: string[] = []

  const stageLabels: Record<string, string> = {
    "Interpreting": "Thinking",
    "Considering tools": "Selecting approach",
  }

  const toolLabels: Record<string, string> = {
    "rag_agent": "Searching knowledge base",
    "customer_service_agent": "Looking up records",
    "slide_deck_agent": "Building your brief",
  }

  function emitStatus(label: string): void {
    if (emittedStatuses.has(label)) return
    emittedStatuses.add(label)
    controller.enqueue(emit("STATUS_UPDATE", { label }))
  }

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs))

    const res = await fetch(`${PARLANT_URL}/sessions/${parlantSessionId}/events`)
    if (!res.ok) continue

    const events = await res.json() as ParlantEvent[]
    const newEvents = events.filter((e) => e.offset >= afterOffset)

    for (const e of newEvents) {
      if (seenOffsets.has(e.offset)) continue
      seenOffsets.add(e.offset)

      if (e.source === "ai_agent" && e.kind === "status" && e.data?.status === "processing") {
        const stage = e.data.data?.stage ?? ""
        const label = stageLabels[stage]
        if (label) emitStatus(label)
      }

      if (e.source === "ai_agent" && e.kind === "status" && e.data?.status === "typing") {
        emitStatus("Writing response")
      }

      if (e.source === "ai_agent" && e.kind === "tool") {
        const toolCalls = e.data?.tool_calls as Array<{ tool_id: string }> | undefined
        for (const call of toolCalls ?? []) {
          const toolName = call.tool_id.replace(/^built-in:/, "")
          const label = toolLabels[toolName]
          if (label) emitStatus(label)
        }
      }

      if (
        e.source === "ai_agent" &&
        e.kind === "message" &&
        !(e.data?.tags ?? []).includes("__preamble__") &&
        e.data?.message
      ) {
        parlantTextParts.push(e.data.message)
      }
    }

    const completed = newEvents.find(
      (e) =>
        e.source === "ai_agent" &&
        e.kind === "status" &&
        e.data?.status === "ready" &&
        e.data?.data?.stage === "completed"
    )

    if (!completed) continue

    // Parlant is done — fetch whatever the agent stored in the side-channel
    const entry = await fetchComponentSpec(parlantSessionId)
    const chunkSize = 20

    // If Parlant errored (rate limit, etc.) and produced no content, emit a graceful fallback
    const hasError = newEvents.some((e) => e.source === "ai_agent" && e.kind === "status" && e.data?.status === "error")
    if (hasError && parlantTextParts.length === 0 && !entry.items?.length && !entry.spec) {
      const fallback = "I hit a processing issue on that one — please try again in a moment."
      controller.enqueue(emit("TEXT_MESSAGE_START", { role: "assistant" }))
      controller.enqueue(emit("TEXT_MESSAGE_CONTENT", { delta: fallback }))
      controller.enqueue(emit("TEXT_MESSAGE_END"))
      controller.enqueue(emit("RUN_FINISHED"))
      return
    }

    if (entry.items && entry.items.length > 0) {
      // Per-card mode: one message per item, then any Parlant follow-up text
      for (const item of entry.items) {
        controller.enqueue(emit("TEXT_MESSAGE_START", { role: "assistant" }))
        for (let i = 0; i < item.insight.length; i += chunkSize) {
          controller.enqueue(emit("TEXT_MESSAGE_CONTENT", { delta: item.insight.slice(i, i + chunkSize) }))
        }
        controller.enqueue(emit("TEXT_MESSAGE_END"))
        controller.enqueue(emit("TOOL_CALL_START", { toolName: (entry.items[0]?.spec as Record<string, unknown>)?.["component"] ?? "" }))
        controller.enqueue(emit("TOOL_CALL_END", { spec: item.spec }))
      }
      // Emit the last Parlant message separately — typically a follow-up question
      const followUp = parlantTextParts.at(-1)
      if (followUp) {
        controller.enqueue(emit("TEXT_MESSAGE_START", { role: "assistant" }))
        for (let i = 0; i < followUp.length; i += chunkSize) {
          controller.enqueue(emit("TEXT_MESSAGE_CONTENT", { delta: followUp.slice(i, i + chunkSize) }))
        }
        controller.enqueue(emit("TEXT_MESSAGE_END"))
      }
    } else {
      // Open the assistant message slot first so TOOL_CALL_END can attach
      // the component spec to it. TOOL_CALL_END fires before TEXT_MESSAGE_START
      // in the old order, which means setComponentOnLastMessage finds no
      // assistant message and silently drops the spec.
      controller.enqueue(emit("TEXT_MESSAGE_START", { role: "assistant" }))
      if (entry.spec) {
        controller.enqueue(emit("TOOL_CALL_START", { toolName: entry.spec["component"] }))
        controller.enqueue(emit("TOOL_CALL_END", { spec: entry.spec }))
      }
      const parlantText = parlantTextParts.join("\n\n")
      for (let i = 0; i < parlantText.length; i += chunkSize) {
        controller.enqueue(emit("TEXT_MESSAGE_CONTENT", { delta: parlantText.slice(i, i + chunkSize) }))
      }
      controller.enqueue(emit("TEXT_MESSAGE_END"))
    }

    controller.enqueue(emit("RUN_FINISHED"))
    return
  }

  throw new Error("Parlant reply timed out after 60s")
}

// ── Direct agent proxy (PARLANT_ENABLED=false) ───────────────────────────────
// Proxies the agent's AG-UI SSE stream straight through — no session management.

async function streamAgentDirect(
  message: string,
  userId: string,
  sessionId: string,
): Promise<Response> {
  const agentRes = await fetch(`${AGENT_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, userId, sessionId }),
  })

  if (!agentRes.ok || !agentRes.body) {
    const encoder = new TextEncoder()
    const event = JSON.stringify({ type: "RUN_ERROR", data: { message: `Agent error: ${agentRes.status}` } })
    return new Response(encoder.encode(`data: ${event}\n\n`), {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    })
  }

  return new Response(agentRes.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

// ── User identity ─────────────────────────────────────────────────────────────
// userId is derived server-side from an HttpOnly cookie — never trusted from
// the request body. On first visit a UUID is generated and stamped. When OAuth
// is wired up, swap this for session.user.sub from NextAuth/Auth0.

const UID_COOKIE = "gen-ux-uid"
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365  // 1 year

function getUserId(req: NextRequest): { userId: string; isNew: boolean } {
  // TODO (auth): replace cookie stub with verified session identity.
  //
  // When OAuth / Auth0 is wired up:
  //   1. Install NextAuth: `pnpm add next-auth` and configure a provider
  //      (Google, GitHub, Auth0, etc.) in `src/app/api/auth/[...nextauth]/route.ts`.
  //   2. Replace the cookie read below with:
  //        import { getServerSession } from "next-auth"
  //        import { authOptions } from "@/lib/auth"
  //        const session = await getServerSession(authOptions)
  //        if (!session?.user?.id) throw new Response("Unauthorized", { status: 401 })
  //        return { userId: session.user.id, isNew: false }
  //   3. Delete UID_COOKIE, COOKIE_MAX_AGE, and withUidCookie — no longer needed.
  //   4. Stamp Parlant customer tags from JWT claims in getOrCreateCustomer():
  //        body: JSON.stringify({ id: userId, name: session.user.name, tags: [`role:${session.user.role}`] })
  //
  // The rest of the pipeline (Parlant, agent server, Mem0) reads userId as an
  // opaque string — no other files need to change.
  const existing = req.cookies.get(UID_COOKIE)?.value
  return existing
    ? { userId: existing, isNew: false }
    : { userId: crypto.randomUUID(), isNew: true }
}

function withUidCookie(headers: Headers, userId: string): void {
  headers.set(
    "Set-Cookie",
    `${UID_COOKIE}=${userId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`
  )
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  const body = await req.json() as { message?: string; sessionId?: string }

  if (!body.message || !body.sessionId) {
    return new Response(
      JSON.stringify({ error: "message and sessionId are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    )
  }

  const { userId, isNew } = getUserId(req)

  if (!PARLANT_ENABLED) {
    const res = await streamAgentDirect(body.message, userId, body.sessionId)
    if (isNew) withUidCookie(res.headers, userId)
    return res
  }

  const encoder = new TextEncoder()
  const runId = crypto.randomUUID()
  const ts = () => new Date().toISOString()

  const emit = (type: string, data?: Record<string, unknown>): Uint8Array => {
    const event = { type, timestamp: ts(), runId, ...(data !== undefined && { data }) }
    return encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
  }

  try {
    const agentId = await getAgentId()
    let parlantSessionId = await getOrCreateSession(body.sessionId, agentId, userId)

    const enrichedMessage = enrichMessage(body.message)

    let customerOffset: number
    try {
      customerOffset = await sendMessage(parlantSessionId, enrichedMessage)
    } catch (err) {
      if (err instanceof Error && err.message.includes("404")) {
        parlantSessions.delete(body.sessionId)
        parlantCustomers.delete(userId)
        parlantSessionId = await getOrCreateSession(body.sessionId, agentId, userId)
        customerOffset = await sendMessage(parlantSessionId, enrichedMessage)
      } else {
        throw err
      }
    }

    const afterOffset = customerOffset + 1
    const capturedParlantSessionId = parlantSessionId

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          controller.enqueue(emit("RUN_STARTED"))
          await streamParlantReply(capturedParlantSessionId, afterOffset, controller, emit)
        } catch (err) {
          console.error("[chat/route] Error:", err)
          const errorEvent = {
            type: "RUN_ERROR",
            timestamp: new Date().toISOString(),
            runId,
            data: { message: err instanceof Error ? err.message : "Unknown error" },
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`))
        } finally {
          controller.close()
        }
      },
    })

    const streamHeaders = new Headers({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    })
    if (isNew) withUidCookie(streamHeaders, userId)
    return new Response(stream, { headers: streamHeaders })
  } catch (err) {
    console.error("[chat/route] Setup error:", err)
    const errorEvent = {
      type: "RUN_ERROR",
      timestamp: new Date().toISOString(),
      runId,
      data: { message: err instanceof Error ? err.message : "Unknown error" },
    }
    return new Response(
      encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`),
      { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } }
    )
  }
}
