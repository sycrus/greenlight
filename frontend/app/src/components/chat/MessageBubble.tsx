"use client"

import { cn } from "@/lib/utils"
import { ComponentRenderer } from "@/components/registry/ComponentRenderer"
import { SlideDeckDownloadButton } from "./SlideDeckDownloadButton"
import type { ChatMessage } from "@/types"
import type { Slide } from "@gen-ux/design-system"

interface MessageBubbleProps {
  message: ChatMessage
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user"

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm"
        )}
      >
        {/* Text content */}
        {message.content && (
          <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        )}

        {/* Generative UI component (if agent rendered one) */}
        {message.componentSpec && (
          <div className="mt-2">
            <ComponentRenderer spec={message.componentSpec} />
            {message.componentSpec.component === "SlideDeck" && (
              <SlideDeckDownloadButton
                title={message.componentSpec.props["title"] as string}
                slides={message.componentSpec.props["slides"] as Slide[]}
              />
            )}
          </div>
        )}

        <span className="mt-1 block text-right text-[10px] opacity-50">
          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  )
}
