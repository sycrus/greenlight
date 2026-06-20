/**
 * AG-UI SSE client.
 *
 * Connects to the agent server's /chat endpoint and parses the
 * AG-UI event stream. Calls handlers for each event type.
 *
 * In production this will be replaced/augmented by CopilotKit hooks
 * (@copilotkit/react-core) which implement the full AG-UI protocol.
 * This client is a thin wrapper for direct integration and testing.
 *
 * Usage:
 *   const client = createAGUIClient({ agentUrl: "/api/chat" })
 *   await client.send({ message, sessionId }, {
 *     onTextChunk: (chunk) => appendToMessage(chunk),
 *     onToolCallStart: (data) => renderSkeleton(data),
 *     onToolCallEnd: (data) => renderComponent(data),
 *     onFinished: () => setLoading(false),
 *   })
 */

import type { AGUIEvent, AGUIEventType } from "@/types"

export interface AGUISendOptions {
  message: string
  sessionId: string
}

export interface AGUIHandlers {
  onRunStarted?: (event: AGUIEvent) => void
  onTextStart?: (event: AGUIEvent) => void
  onTextChunk?: (chunk: string, event: AGUIEvent) => void
  onTextEnd?: (event: AGUIEvent) => void
  onToolCallStart?: (event: AGUIEvent) => void
  onToolCallEnd?: (event: AGUIEvent) => void
  onStateSnapshot?: (event: AGUIEvent) => void
  onStatusUpdate?: (label: string, event: AGUIEvent) => void
  onFinished?: (event: AGUIEvent) => void
  onError?: (event: AGUIEvent | Error) => void
}

export interface AGUIClient {
  send(options: AGUISendOptions, handlers: AGUIHandlers): Promise<void>
}

export function createAGUIClient(config: { agentUrl: string }): AGUIClient {
  return {
    async send(options, handlers) {
      const res = await fetch(config.agentUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      })

      if (!res.ok || !res.body) {
        const err = new Error(`Agent request failed: ${res.status}`)
        handlers.onError?.(err)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const event = JSON.parse(line.slice(6)) as AGUIEvent
            dispatchEvent(event, handlers)
          } catch {
            console.warn("[ag-ui] Failed to parse event:", line)
          }
        }
      }
    },
  }
}

function dispatchEvent(event: AGUIEvent, handlers: AGUIHandlers): void {
  const handlerMap: Record<AGUIEventType, (() => void) | undefined> = {
    RUN_STARTED: () => handlers.onRunStarted?.(event),
    TEXT_MESSAGE_START: () => handlers.onTextStart?.(event),
    TEXT_MESSAGE_CONTENT: () => handlers.onTextChunk?.(
      (event.data?.["delta"] as string | undefined) ?? "", event
    ),
    TEXT_MESSAGE_END: () => handlers.onTextEnd?.(event),
    TOOL_CALL_START: () => handlers.onToolCallStart?.(event),
    TOOL_CALL_END: () => handlers.onToolCallEnd?.(event),
    STATE_SNAPSHOT: () => handlers.onStateSnapshot?.(event),
    STATUS_UPDATE: () => handlers.onStatusUpdate?.(
      (event.data?.["label"] as string | undefined) ?? "", event
    ),
    RUN_FINISHED: () => handlers.onFinished?.(event),
    RUN_ERROR: () => handlers.onError?.(event),
  }

  handlerMap[event.type]?.()
}
