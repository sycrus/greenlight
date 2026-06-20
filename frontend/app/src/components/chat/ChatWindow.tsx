/**
 * ChatWindow — the main chat UI component.
 *
 * Manages the conversation state and connects to the agent server
 * via the AG-UI SSE client through the /api/chat Next.js proxy.
 *
 * CopilotKit integration:
 *   This component uses the raw AG-UI client for now. In phase 2,
 *   swap this for CopilotKit hooks (useCopilotChat from @copilotkit/react-core)
 *   which provide the full AG-UI protocol, action registration, and
 *   generative UI rendering out of the box.
 *
 * Component rendering:
 *   TOOL_CALL_START → renders skeleton via ComponentRenderer (loading=true)
 *   TOOL_CALL_END   → swaps to full component via ComponentRenderer (loading=false)
 */

"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { createAGUIClient } from "@/lib/ag-ui/client"
import { MessageBubble } from "./MessageBubble"
import { Button } from "@gen-ux/design-system"
import { Input } from "@gen-ux/design-system"
import { Send } from "lucide-react"
import type { ChatMessage, ComponentSpec } from "@/types"

const agentClient = createAGUIClient({
  agentUrl: "/api/chat",  // proxied through Next.js API route
})


interface ChatWindowProps {
  sessionId: string
}

export function ChatWindow({ sessionId }: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      content: "Hi, I'm Endava InsightsDeck, an AI powered presentation maker. What topic are you interested in?",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [statusLabel, setStatusLabel] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const appendToLastAssistantMessage = useCallback((chunk: string) => {
    setMessages((prev) => {
      const last = prev.at(-1)
      if (!last || last.role !== "assistant") return prev
      return [
        ...prev.slice(0, -1),
        { ...last, content: last.content + chunk },
      ]
    })
  }, [])

  const setComponentOnLastMessage = useCallback((spec: ComponentSpec) => {
    setMessages((prev) => {
      const last = prev.at(-1)
      if (!last || last.role !== "assistant") return prev
      return [...prev.slice(0, -1), { ...last, componentSpec: spec }]
    })
  }, [])

  async function sendMessage() {
    const text = input.trim()
    if (!text || isLoading) return

    setInput("")
    setIsLoading(true)

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])

    await agentClient.send(
      { message: text, sessionId },
      {
        onTextStart: () => {
          setMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), role: "assistant", content: "", timestamp: new Date() },
          ])
        },
        onTextChunk: (chunk) => appendToLastAssistantMessage(chunk),
        onToolCallEnd: (event) => {
          const spec = event.data?.["spec"] as ComponentSpec | undefined
          if (spec) setComponentOnLastMessage(spec)
        },
        onStatusUpdate: (label) => setStatusLabel(label),
        onFinished: () => { setIsLoading(false); setStatusLabel(null) },
        onError: (err) => {
          console.error("[chat] Error:", err)
          appendToLastAssistantMessage("\n\n[Error: could not reach agent]")
          setIsLoading(false)
          setStatusLabel(null)
        },
      }
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Status indicator */}
      {statusLabel && (
        <div className="flex items-center gap-2 px-4 pb-2 text-xs text-muted-foreground">
          <span>{statusLabel}</span>
          <span className="inline-flex items-center gap-0.5">
            <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce" />
          </span>
        </div>
      )}

      {/* Input */}
      <div className="border-t p-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); void sendMessage() }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading || !input.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}
