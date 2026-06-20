import type { BaseMessage } from "@langchain/core/messages"

// ── Agent routing ─────────────────────────────────────────────────────────────

export type AgentName = "weather" | "customer_service" | "rag" | "slide_deck"

export interface AgentRoute {
  agent: AgentName
  reason: string
}

// ── Graph state ───────────────────────────────────────────────────────────────
// This is the shared state that flows through all LangGraph nodes.

export interface GraphState {
  messages: BaseMessage[]
  userId: string
  sessionId: string
  /** Set by orchestrator to indicate which specialist agent should run next */
  route: AgentRoute | null
  /** Final response text, set by whichever agent handles the request */
  response: string | null
  /** Optional UI component to render alongside the response */
  componentSpec: ComponentSpec | null
  /** Per-card messages: each item renders as a separate chat message with insight text + card */
  componentSpecItems: ComponentSpecItem[] | null
  /** Recalled memories injected before graph.invoke — available to all agent nodes */
  memories: string[]
}

// ── Component spec ────────────────────────────────────────────────────────────
// Matches the frontend registry.json shape — validated by ComponentRenderer.

export interface ComponentSpec {
  component: string
  props: Record<string, unknown>
  variant?: string
}

/** One rendered message: a short insight text paired with a single component card. */
export interface ComponentSpecItem {
  insight: string
  spec: ComponentSpec
}

// ── AG-UI event types ─────────────────────────────────────────────────────────
// These mirror the AG-UI / CopilotKit streaming event protocol.
// Emitted by the agent server SSE endpoint.

export type AGUIEventType =
  | "RUN_STARTED"
  | "TOOL_CALL_START"
  | "TOOL_CALL_END"
  | "TEXT_MESSAGE_START"
  | "TEXT_MESSAGE_CONTENT"
  | "TEXT_MESSAGE_END"
  | "STATE_SNAPSHOT"
  | "RUN_FINISHED"
  | "RUN_ERROR"

export interface AGUIEvent {
  type: AGUIEventType
  timestamp: string
  runId: string
  data?: Record<string, unknown>
}

// ── Chat request / response ───────────────────────────────────────────────────

export interface ChatRequest {
  message: string
  userId: string
  sessionId: string
  /** When set by Parlant, bypasses the orchestrator and routes directly to this agent. */
  agent?: AgentName
}

// ── Tool result ───────────────────────────────────────────────────────────────

export interface ToolResult<T = unknown> {
  toolName: string
  success: boolean
  data?: T
  error?: string
}
