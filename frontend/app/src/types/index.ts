// ── AG-UI event types (mirrors apps/agent/src/types) ─────────────────────────
// Keep in sync with the server-side definition.

export type AGUIEventType =
  | "RUN_STARTED"
  | "TOOL_CALL_START"
  | "TOOL_CALL_END"
  | "TEXT_MESSAGE_START"
  | "TEXT_MESSAGE_CONTENT"
  | "TEXT_MESSAGE_END"
  | "STATE_SNAPSHOT"
  | "STATUS_UPDATE"
  | "RUN_FINISHED"
  | "RUN_ERROR"

export interface AGUIEvent {
  type: AGUIEventType
  timestamp: string
  runId: string
  data?: Record<string, unknown>
}

// ── Component registry ────────────────────────────────────────────────────────

export interface ComponentSpec {
  component: string
  variant?: string
  props: Record<string, unknown>
}

export interface RegistryEntry {
  variants: string[]
  requiredProps: string[]
  neverCombineWith: string[]
  useWhen: string
  neverUseWhen?: string
  skeletonComponent?: string
}

export type ComponentRegistry = Record<string, RegistryEntry>

// ── Chat ──────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  componentSpec?: ComponentSpec  // set when agent renders a UI component
  timestamp: Date
}
