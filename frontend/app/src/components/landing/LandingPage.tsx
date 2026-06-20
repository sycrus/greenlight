"use client"

import { useState, useCallback, useRef, useEffect, useMemo, type KeyboardEvent } from "react"
import Image from "next/image"
import { createAGUIClient } from "@/lib/ag-ui/client"
import { ComponentRenderer } from "@/components/registry/ComponentRenderer"
import { SlideDeckOverlay } from "@/components/landing/SlideDeckOverlay"
import type { Slide } from "@gen-ux/design-system"
import type { ChatMessage, ComponentSpec } from "@/types"

const agentClient = createAGUIClient({ agentUrl: "/api/chat" })

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Hi, I'm Endava InsightsDeck, an AI powered presentation maker. What topic are you interested in?",
  timestamp: new Date(),
}


export function LandingPage({ sessionId }: { sessionId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [statusLabel, setStatusLabel] = useState<string | null>(null)
  const [deckSpec, setDeckSpec] = useState<{ title: string; slides: Slide[] } | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const latestMsgRef = useRef<HTMLParagraphElement>(null)
  const [scrollRatio, setScrollRatio] = useState(0)

  useEffect(() => {
    const el = heroRef.current
    if (!el) return
    function onScroll() {
      const max = el!.scrollHeight - el!.clientHeight
      setScrollRatio(max > 0 ? el!.scrollTop / max : 0)
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [])

  const contactUrl = useMemo(() => {
    let message = "I'd like to learn more about partnering with Endava."
    if (deckSpec) {
      const find = (tag: string) => deckSpec.slides.find((s) => s.tag === tag)
      const problem  = find("Problem")
      const solution = find("Solution")
      const next     = find("Next Step")
      const parts: string[] = []
      if (problem)  parts.push(`Challenge: ${problem.headline}`)
      if (solution) parts.push(`Interested in: ${solution.headline}`)
      if (next)     parts.push(next.body)
      if (parts.length > 0) message = parts.join("\n\n")
    }
    const params = new URLSearchParams({
      select_reasons_of_inquiry: "Interested in our services",
      message,
    })
    return `https://www.endava.com/contact?${params.toString()}`
  }, [deckSpec])

  const latestAssistantIdx = [...messages].map((m, i) => ({ m, i })).reverse().find(({ m }) => m.role === "assistant")?.i ?? -1
  const latestAssistant = latestAssistantIdx >= 0 ? messages[latestAssistantIdx] : undefined

  // While waiting for the agent to respond, the last message is the user's
  const lastMessage = messages.at(-1)
  const isAwaitingResponse = isLoading && lastMessage?.role === "user"

  // Hero: show user's message while awaiting, otherwise latest assistant message
  const heroMessage = isAwaitingResponse ? lastMessage : latestAssistant
  const heroIsUser = isAwaitingResponse

  // Previous messages: everything before the hero message
  const heroIdx = isAwaitingResponse ? messages.length - 1 : latestAssistantIdx
  const previousMessages = heroIdx > 0 ? messages.slice(0, heroIdx) : []

  function snapToHero() {
    const container = heroRef.current
    const msg = latestMsgRef.current
    if (!container || !msg) return
    const containerRect = container.getBoundingClientRect()
    const msgRect = msg.getBoundingClientRect()
    container.scrollTop += msgRect.top - containerRect.top
  }

  // Auto-open slide deck overlay when a SlideDeck component spec arrives
  useEffect(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg?.componentSpec?.component === "SlideDeck") {
        const { title, slides } = msg.componentSpec.props as { title: string; slides: Slide[] }
        setDeckSpec({ title, slides })
        break
      }
    }
  }, [messages])

  // Persist deck and generate a shareable URL whenever a new deck arrives
  useEffect(() => {
    if (!deckSpec) return
    setShareUrl(null)
    fetch("/api/deck", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deckSpec),
    })
      .then((r) => r.json() as Promise<{ id: string }>)
      .then(({ id }) => setShareUrl(`${window.location.origin}/deck/${id}`))
      .catch(console.error)
  }, [deckSpec])

  // Snap hero message to top using getBoundingClientRect (viewport-relative, no offsetParent dependency)
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        snapToHero()
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroIdx])

  const appendToLastAssistantMessage = useCallback((chunk: string) => {
    setMessages((prev) => {
      const last = prev.at(-1)
      if (!last || last.role !== "assistant") return prev
      return [...prev.slice(0, -1), { ...last, content: last.content + chunk }]
    })
  }, [])

  const setComponentOnLastMessage = useCallback((spec: ComponentSpec) => {
    setMessages((prev) => {
      const last = prev.at(-1)
      if (!last || last.role !== "assistant") return prev
      return [...prev.slice(0, -1), { ...last, componentSpec: spec }]
    })
  }, [])

  async function send() {
    const text = input.trim()
    if (!text || isLoading) return
    setInput("")
    setIsLoading(true)

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMsg])

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
        onFinished: () => {
          setIsLoading(false)
          setStatusLabel(null)
        },
        onError: (err) => {
          console.error("[landing] error:", err)
          appendToLastAssistantMessage("\n\n[Error: could not reach agent]")
          setIsLoading(false)
          setStatusLabel(null)
        },
      }
    )
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }


  return (
    <>
    {deckSpec && (
      <SlideDeckOverlay
        title={deckSpec.title}
        slides={deckSpec.slides}
        {...(shareUrl !== null && { shareUrl })}
        onClose={() => setDeckSpec(null)}
      />
    )}
    <div
      className="h-screen w-full overflow-hidden flex flex-col"
      style={{ backgroundColor: "#122d38", fontFamily: "var(--font-poppins, Poppins, sans-serif)" }}
    >
      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <nav className="flex items-start justify-between px-[68px] pt-[9px] pb-0 shrink-0">
        {/* Left: logo + breadcrumb */}
        <div className="flex flex-col">
          <div className="flex items-center gap-3">
            <Image src="/brand/icon-menu.svg" alt="Menu" width={19} height={14} className="mt-1" unoptimized />
            <Image src="/brand/logo.png" alt="Endava" width={149} height={38} priority />
          </div>
          <div className="flex items-center gap-2 mt-[10px]">
            <Image src="/brand/icon-home.svg" alt="" width={19} height={22} unoptimized />
            <span className="text-white text-[16px] font-medium">Home</span>
            <Image src="/brand/icon-breadcrumb.svg" alt="›" width={7} height={12} unoptimized />
            <span className="text-white text-[16px] font-medium">Insights</span>
          </div>
        </div>

        {/* Right: search + CTA */}
        <div className="flex items-center gap-4 pt-[11px]">
          <Image src="/brand/icon-search.svg" alt="Search" width={48} height={48} unoptimized />
          <button
            onClick={() => window.open(contactUrl, "_blank", "noopener,noreferrer")}
            className="border-2 border-white rounded-full px-6 py-2 text-white text-[16px] font-medium whitespace-nowrap hover:bg-white/10 transition-colors"
          >
            Let&apos;s connect
          </button>
        </div>
      </nav>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      {/*
        Figma (1440px canvas):
          Agent text:  left=68,  right=781  (w=713)
          Scrollbar:   left=791, right=802  (w=11)
          Underline:   left=68,  right=802  (spans text + gap + scrollbar)
          Send button: left=738, right=802  (right-aligned to scrollbar right)
          Right image: left=870             (68px gap after scrollbar)
        → Left panel = 802/1440 = 55.7% of viewport width
        → Gap before image = 68px
      */}
      <main className="flex flex-1 overflow-hidden pt-[40px]">

        {/* Left panel — 55.7% wide; scrollbar sits at its right edge absolutely */}
        <div className="relative flex flex-col shrink-0" style={{ width: "55.7%" }}>

          {/* Hero text: right padding = 10px gap + 11px scrollbar = 21px */}
          <div
            ref={heroRef}
            className="relative overflow-y-auto scrollbar-hide pb-6"
            style={{
              paddingLeft: 68,
              paddingRight: 56,
              height: "clamp(300px, 52vh, 560px)",
            }}
          >
            {/* Previous messages — smaller, dimmed, hidden above the fold */}
            {previousMessages.length > 0 && (
              <div className="flex flex-col gap-3 mb-8">
                {previousMessages.map((msg) => (
                  <p
                    key={msg.id}
                    style={{
                      fontSize: "clamp(14px, 1.25vw, 18px)",
                      fontWeight: 300,
                      paddingRight: msg.role === "assistant" ? 48 : 0,
                      paddingLeft: msg.role === "user" ? 48 : 0,
                      textAlign: msg.role === "user" ? "right" : "left",
                    }}
                    className={msg.role === "user" ? "text-white/40" : "text-white/50"}
                  >
                    {msg.content}
                  </p>
                ))}
              </div>
            )}

            {/* Hero message — user's while awaiting, assistant's while responding */}
            {heroMessage && (
              <>
                <p
                  ref={latestMsgRef}
                  className="leading-tight"
                  style={{
                    fontSize: "clamp(28px, 3.33vw, 48px)",
                    fontWeight: heroIsUser ? 400 : 500,
                    color: heroIsUser ? "rgba(255,255,255,0.7)" : "white",
                    textAlign: heroIsUser ? "right" : "left",
                    paddingLeft: heroIsUser ? 48 : 0,
                  }}
                >
                  {heroMessage.content}
                </p>
                {isLoading && (
                  <div className="flex items-center gap-2 mt-6 text-white/40" style={{ fontSize: "clamp(14px, 1.25vw, 18px)", fontWeight: 300 }}>
                    <span>{statusLabel ?? "Thinking…"}</span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" />
                    </span>
                  </div>
                )}
                {!heroIsUser && heroMessage.componentSpec && heroMessage.componentSpec.component !== "SlideDeck" && (
                  <div className="mt-6">
                    <ComponentRenderer spec={heroMessage.componentSpec} loading={false} />
                  </div>
                )}
              </>
            )}
            {/* Spacer ensures scrollHeight > clientHeight so we can always scroll hero to top */}
            <div aria-hidden style={{ height: "clamp(300px, 52vh, 560px)" }} />
          </div>

          {/* Scrollbar — only shown after first user message */}
          <div className="absolute right-0" style={{ top: 0, width: 11, height: 480, opacity: messages.length > 1 ? 1 : 0, transition: "opacity 0.3s" }}>
            <div className="absolute inset-0 rounded-full" style={{ backgroundColor: "#7b878f" }} />
            <div
              className="absolute left-0 w-full rounded-full transition-[top] duration-100"
              style={{
                height: 49,
                top: Math.round(scrollRatio * (480 - 49)),
                backgroundColor: "white",
              }}
            />
          </div>

          {/* Input: mt-auto pushes it to the bottom; pl=68 aligns with text */}
          <div className="mt-auto pb-[72px]" style={{ paddingLeft: 68 }}>
            <div className="flex items-center gap-4">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your answer"
                disabled={isLoading}
                autoComplete="off"
                className="flex-1 min-w-0 bg-transparent outline-none font-medium text-white placeholder-[#2c414c] disabled:opacity-60 transition-opacity"
                style={{
                  fontSize: "clamp(28px, 2vw, 48px)",
                  fontWeight: 400,
                  caretColor: "white",
                }}
              />
              {/* Right edge of button = right edge of panel = scrollbar right edge */}
              <button
                onClick={() => void send()}
                disabled={isLoading || !input.trim()}
                aria-label="Send"
                className="shrink-0 disabled:opacity-30 transition-all hover:scale-105 active:scale-95"
              >
                <Image src="/brand/icon-send.svg" alt="" width={64} height={64} unoptimized />
              </button>
            </div>
            {/* Underline: full width from pl-68 to panel right = same span as above */}
            <div className="h-px mt-6" style={{ backgroundColor: "rgba(255,255,255,0.3)" }} />
          </div>
        </div>

        {/* Gap between left panel and right image: 870 - 802 = 68px */}
        <div className="shrink-0" style={{ width: 68 }} />

        {/* Right column: decorative brand image */}
        <div className="flex-1 relative overflow-hidden">
          <Image
            src="/brand/endava-Image.png"
            alt=""
            fill
            className="object-cover object-left-top"
            priority
          />
        </div>
      </main>
    </div>
    </>
  )
}
