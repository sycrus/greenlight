"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import Image from "next/image"
import type { Slide } from "@gen-ux/design-system"

interface Props {
  title: string
  slides: Slide[]
  shareUrl?: string
  onClose: () => void
}

const TAG_COLOR: Record<Slide["tag"], string> = {
  "Problem":     "#f59e0b",
  "Agitate":     "#ef4444",
  "Proof Point": "#3b82f6",
  "Solution":    "#8b5cf6",
  "Next Step":   "#10b981",
}

// ── Stat components ───────────────────────────────────────────────────────────
// StatCallout: single prominent figure for Problem (dark=true) and Agitate (dark=false)
// StatPills: horizontal row of 2-3 outcome figures for Solution
// Thumbnail variants use fixed px; full-view variants use clamp() + vw

function StatCallout({ stat, dark = false }: { stat: { value: string; label: string }; dark?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35em", margin: "5% 0" }}>
      <span style={{ fontSize: "clamp(52px, 6vw, 88px)", fontWeight: 700, color: dark ? "white" : "#e94e1b", lineHeight: 1 }}>
        {stat.value}
      </span>
      <span style={{ fontSize: "clamp(12px, 1.1vw, 15px)", color: dark ? "#e94e1b" : "#2c414c", lineHeight: 1.4 }}>
        {stat.label}
      </span>
    </div>
  )
}

function StatCalloutThumb({ stat, dark = false }: { stat: { value: string; label: string }; dark?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "28px 0" }}>
      <span style={{ fontSize: 56, fontWeight: 700, color: dark ? "white" : "#e94e1b", lineHeight: 1 }}>
        {stat.value}
      </span>
      <span style={{ fontSize: 14, color: dark ? "#e94e1b" : "#2c414c", lineHeight: 1.4 }}>
        {stat.label}
      </span>
    </div>
  )
}

function StatPills({ stats }: { stats: { value: string; label: string }[] }) {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: "3%", flexShrink: 0 }}>
      {stats.map((s, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "14px 20px", border: "1px solid rgba(44,65,76,0.15)", borderRadius: 8, width: "calc(50% - 6px)", boxSizing: "border-box" }}>
          <span style={{ fontSize: "clamp(22px, 2.4vw, 36px)", fontWeight: 700, color: "#e94e1b", lineHeight: 1 }}>{s.value}</span>
          <span style={{ fontSize: "clamp(11px, 1vw, 13px)", color: "#2c414c", lineHeight: 1.4 }}>{s.label}</span>
        </div>
      ))}
    </div>
  )
}

function StatPillsThumb({ stats }: { stats: { value: string; label: string }[] }) {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
      {stats.map((s, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "12px 16px", border: "1px solid rgba(44,65,76,0.15)", borderRadius: 8, width: "calc(50% - 6px)", boxSizing: "border-box" }}>
          <span style={{ fontSize: 24, fontWeight: 700, color: "#e94e1b", lineHeight: 1 }}>{s.value}</span>
          <span style={{ fontSize: 12, color: "#2c414c", lineHeight: 1.4 }}>{s.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Cover slide ───────────────────────────────────────────────────────────────

function CoverSlide({ title }: { title: string }) {
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  return (
    <div style={{ width: "100%", height: "100%", backgroundColor: "#122d38", display: "flex", boxSizing: "border-box", overflow: "hidden" }}>
      {/* Left: title + date */}
      <div style={{ flex: "0 0 55%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "8% 8% 8% 12%", boxSizing: "border-box" }}>
        <h1 style={{ fontSize: "clamp(32px, 4vw, 64px)", fontWeight: 700, color: "white", lineHeight: 1.15, margin: "0 0 6% 0" }}>
          {title}
        </h1>
        <span style={{ fontSize: "clamp(14px, 1.3vw, 18px)", color: "#e94e1b", fontWeight: 600 }}>
          {date}
        </span>
      </div>
      {/* Right: brand illustration */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/endava-Image.png"
          alt=""
          style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", height: "90%", width: "auto", objectFit: "cover", objectPosition: "right center" }}
        />
      </div>
    </div>
  )
}

function CoverSlideThumb({ title }: { title: string }) {
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  return (
    <div style={{ width: "100%", height: "100%", backgroundColor: "#122d38", display: "flex", boxSizing: "border-box", overflow: "hidden" }}>
      <div style={{ flex: "0 0 55%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "60px 60px 60px 96px", boxSizing: "border-box" }}>
        <h1 style={{ fontSize: 52, fontWeight: 700, color: "white", lineHeight: 1.15, margin: "0 0 32px 0" }}>
          {title}
        </h1>
        <span style={{ fontSize: 18, color: "#e94e1b", fontWeight: 600 }}>
          {date}
        </span>
      </div>
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/endava-Image.png"
          alt=""
          style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", height: "90%", width: "auto", objectFit: "cover", objectPosition: "right center" }}
        />
      </div>
    </div>
  )
}

// ── Full-view templates (responsive, fills the slide container) ───────────────

function SlideTemplate({ slide, ogImages = {} }: { slide: Slide; ogImages?: Record<string, string> }) {
  const ogSrc = slide.caseStudy ? ogImages[slide.caseStudy.url] : undefined
  if (slide.tag === "Problem") {
    return (
      <div style={{ width: "100%", height: "100%", backgroundColor: "#122d38", display: "flex", alignItems: "center", justifyContent: "center", padding: "8% 12%", boxSizing: "border-box" }}>
        <div style={{ textAlign: "center", maxWidth: 720 }}>
          <h2 style={{ fontSize: "clamp(28px, 3.5vw, 56px)", fontWeight: 700, color: "white", lineHeight: 1.2, margin: 0 }}>
            {slide.headline}
          </h2>
          {slide.stat && <StatCallout stat={slide.stat} dark />}
          <p style={{ fontSize: "clamp(14px, 1.3vw, 18px)", color: "#e94e1b", lineHeight: 1.65, margin: 0 }}>
            {slide.body}
          </p>
        </div>
      </div>
    )
  }

  if (slide.tag === "Agitate") {
    return (
      <div style={{ width: "100%", height: "100%", backgroundColor: "white", display: "flex", alignItems: "center", padding: "8% 12%", boxSizing: "border-box" }}>
        <div style={{ maxWidth: "68%" }}>
          <h2 style={{ fontSize: "clamp(28px, 3.5vw, 56px)", fontWeight: 700, color: "#122d38", lineHeight: 1.2, margin: 0 }}>
            {slide.headline}
          </h2>
          {slide.stat && <StatCallout stat={slide.stat} />}
          <p style={{ fontSize: "clamp(14px, 1.3vw, 18px)", color: "#e94e1b", lineHeight: 1.65, margin: 0 }}>
            {slide.body}
          </p>
        </div>
      </div>
    )
  }

  if (slide.tag === "Proof Point") {
    return (
      <div style={{ width: "100%", height: "100%", backgroundColor: "white", display: "flex", boxSizing: "border-box" }}>
        <div style={{ flex: "0 0 45%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "8% 5% 8% 10%", boxSizing: "border-box" }}>
          <div style={{ alignSelf: "flex-start", backgroundColor: TAG_COLOR["Proof Point"], color: "white", fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 2, marginBottom: "6%", letterSpacing: 1 }}>
            PROOF POINT
          </div>
          <h2 style={{ fontSize: "clamp(20px, 2.2vw, 34px)", fontWeight: 700, color: "#122d38", lineHeight: 1.25, margin: "0 0 5% 0" }}>
            {slide.headline}
          </h2>
          <p style={{ fontSize: "clamp(13px, 1.2vw, 16px)", color: "#2c414c", lineHeight: 1.65, margin: 0 }}>
            {slide.body}
          </p>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "8% 10% 8% 0", boxSizing: "border-box" }}>
          {slide.caseStudy ? (
            <a
              href={slide.caseStudy.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "flex", flexDirection: "column", borderRadius: 10, border: "1px solid rgba(44,65,76,0.15)", overflow: "hidden", width: "100%", textDecoration: "none", backgroundColor: "#fafafa" }}
            >
              {ogSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ogSrc} alt="" style={{ width: "100%", aspectRatio: "1200/630", objectFit: "cover", display: "block" }} />
              )}
              <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: "clamp(12px, 1.1vw, 15px)", fontWeight: 600, color: "#122d38" }}>{slide.caseStudy.title}</span>
                <span style={{ fontSize: "clamp(11px, 1vw, 14px)", color: "#2c414c", lineHeight: 1.55 }}>{slide.caseStudy.preamble}</span>
                <span style={{ fontSize: "clamp(11px, 1vw, 13px)", color: "#e94e1b", fontWeight: 600, marginTop: 4 }}>Read case study →</span>
              </div>
            </a>
          ) : (
            <div style={{ width: "100%", height: "60%", backgroundColor: "#f0f0f0", borderRadius: 10 }} />
          )}
        </div>
      </div>
    )
  }

  if (slide.tag === "Solution") {
    return (
      <div style={{ width: "100%", height: "100%", backgroundColor: "white", display: "flex", flexDirection: "column", padding: "6% 10%", boxSizing: "border-box" }}>
        <div style={{ alignSelf: "flex-start", backgroundColor: TAG_COLOR["Solution"], color: "white", fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 2, marginBottom: "2%", letterSpacing: 1, flexShrink: 0 }}>
          SOLUTION
        </div>
        <h2 style={{ fontSize: "clamp(22px, 2.4vw, 38px)", fontWeight: 700, color: "#122d38", lineHeight: 1.2, margin: "0 0 2% 0", flexShrink: 0 }}>
          {slide.headline}
        </h2>
        <div style={{ width: 48, height: 3, backgroundColor: "#e94e1b", marginBottom: "2%", flexShrink: 0 }} />
        <p style={{ fontSize: "clamp(13px, 1.2vw, 16px)", color: "#2c414c", lineHeight: 1.6, margin: 0, flexShrink: 1, overflow: "hidden" }}>
          {slide.body}
        </p>
        {slide.stats && slide.stats.length > 0 && <StatPills stats={slide.stats} />}
      </div>
    )
  }

  // Next Step — Template 5: white, fully centered
  return (
    <div style={{ width: "100%", height: "100%", backgroundColor: "white", display: "flex", alignItems: "center", justifyContent: "center", padding: "8% 15%", boxSizing: "border-box" }}>
      <div style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(28px, 3.5vw, 56px)", fontWeight: 700, color: "#122d38", lineHeight: 1.25, margin: "0 0 5% 0" }}>
          {slide.headline}
        </h2>
        <p style={{ fontSize: "clamp(14px, 1.3vw, 18px)", color: "#e94e1b", lineHeight: 1.65, margin: 0 }}>
          {slide.body}
        </p>
      </div>
    </div>
  )
}

// ── Thumbnail templates (fixed px for 1011×570 canvas, gets transform:scale'd) ─

function SlideTemplateThumbnail({ slide, ogImages = {} }: { slide: Slide; ogImages?: Record<string, string> }) {
  const ogSrc = slide.caseStudy ? ogImages[slide.caseStudy.url] : undefined
  if (slide.tag === "Problem") {
    return (
      <div style={{ width: "100%", height: "100%", backgroundColor: "#122d38", display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 96px", boxSizing: "border-box" }}>
        <div style={{ textAlign: "center", maxWidth: 720 }}>
          <h2 style={{ fontSize: 48, fontWeight: 700, color: "white", lineHeight: 1.2, margin: 0 }}>
            {slide.headline}
          </h2>
          {slide.stat && <StatCalloutThumb stat={slide.stat} dark />}
          <p style={{ fontSize: 18, color: "#e94e1b", lineHeight: 1.65, margin: 0 }}>
            {slide.body}
          </p>
        </div>
      </div>
    )
  }

  if (slide.tag === "Agitate") {
    return (
      <div style={{ width: "100%", height: "100%", backgroundColor: "white", display: "flex", alignItems: "center", padding: "80px 96px", boxSizing: "border-box" }}>
        <div style={{ maxWidth: 620 }}>
          <h2 style={{ fontSize: 48, fontWeight: 700, color: "#122d38", lineHeight: 1.2, margin: 0 }}>
            {slide.headline}
          </h2>
          {slide.stat && <StatCalloutThumb stat={slide.stat} />}
          <p style={{ fontSize: 18, color: "#e94e1b", lineHeight: 1.65, margin: 0 }}>
            {slide.body}
          </p>
        </div>
      </div>
    )
  }

  if (slide.tag === "Proof Point") {
    return (
      <div style={{ width: "100%", height: "100%", backgroundColor: "white", display: "flex", boxSizing: "border-box" }}>
        <div style={{ flex: "0 0 45%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "64px 40px 64px 80px", boxSizing: "border-box" }}>
          <div style={{ alignSelf: "flex-start", backgroundColor: TAG_COLOR["Proof Point"], color: "white", fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 2, marginBottom: 28, letterSpacing: 1 }}>
            PROOF POINT
          </div>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: "#122d38", lineHeight: 1.25, margin: "0 0 20px 0" }}>
            {slide.headline}
          </h2>
          <p style={{ fontSize: 16, color: "#2c414c", lineHeight: 1.65, margin: 0 }}>
            {slide.body}
          </p>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "64px 80px 64px 0", boxSizing: "border-box" }}>
          {slide.caseStudy ? (
            <div style={{ display: "flex", flexDirection: "column", borderRadius: 10, border: "1px solid rgba(44,65,76,0.15)", overflow: "hidden", width: "100%", backgroundColor: "#fafafa" }}>
              {ogSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ogSrc} alt="" style={{ width: "100%", aspectRatio: "1200/630", objectFit: "cover", display: "block" }} />
              )}
              <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#122d38" }}>{slide.caseStudy.title}</span>
                <span style={{ fontSize: 14, color: "#2c414c", lineHeight: 1.55 }}>{slide.caseStudy.preamble}</span>
                <span style={{ fontSize: 13, color: "#e94e1b", fontWeight: 600 }}>Read case study →</span>
              </div>
            </div>
          ) : (
            <div style={{ width: "100%", height: "60%", backgroundColor: "#f0f0f0", borderRadius: 10 }} />
          )}
        </div>
      </div>
    )
  }

  if (slide.tag === "Solution") {
    return (
      <div style={{ width: "100%", height: "100%", backgroundColor: "white", display: "flex", flexDirection: "column", padding: "80px 96px", boxSizing: "border-box" }}>
        <div style={{ alignSelf: "flex-start", backgroundColor: TAG_COLOR["Solution"], color: "white", fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 2, marginBottom: 32, letterSpacing: 1 }}>
          SOLUTION
        </div>
        <h2 style={{ fontSize: 42, fontWeight: 700, color: "#122d38", lineHeight: 1.25, margin: "0 0 24px 0" }}>
          {slide.headline}
        </h2>
        <div style={{ width: 48, height: 3, backgroundColor: "#e94e1b", marginBottom: 28, flexShrink: 0 }} />
        <p style={{ fontSize: 18, color: "#2c414c", lineHeight: 1.7, margin: 0 }}>
          {slide.body}
        </p>
        {slide.stats && slide.stats.length > 0 && <StatPillsThumb stats={slide.stats} />}
      </div>
    )
  }

  // Next Step
  return (
    <div style={{ width: "100%", height: "100%", backgroundColor: "white", display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 120px", boxSizing: "border-box" }}>
      <div style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: 48, fontWeight: 700, color: "#122d38", lineHeight: 1.25, margin: "0 0 28px 0" }}>
          {slide.headline}
        </h2>
        <p style={{ fontSize: 18, color: "#e94e1b", lineHeight: 1.65, margin: 0 }}>
          {slide.body}
        </p>
      </div>
    </div>
  )
}

// ── Overlay component ─────────────────────────────────────────────────────────

export function SlideDeckOverlay({ title, slides, shareUrl, onClose }: Props) {
  const [view, setView]               = useState<"slides" | "pages">("slides")
  const [currentIdx, setCurrentIdx]   = useState(0)
  const [pdfState, setPdfState]       = useState<"loading" | "ready" | "error">("loading")
  const [copied, setCopied]           = useState(false)
  const [pdfUrl, setPdfUrl]           = useState<string | null>(null)
  const [scrollRatio, setScrollRatio] = useState(0)
  const [colWidth, setColWidth]       = useState(370)
  const [slideW, setSlideW]           = useState(0)
  const [slideH, setSlideH]           = useState(0)
  const [slideHPad, setSlideHPad]     = useState(0)
  const scrollRef      = useRef<HTMLDivElement>(null)
  const pendingIdxRef  = useRef<number | null>(null)

  const contactUrl = useMemo(() => {
    const find = (tag: string) => slides.find((s) => s.tag === tag)
    const problem  = find("Problem")
    const solution = find("Solution")
    const next     = find("Next Step")
    const parts: string[] = []
    if (problem)  parts.push(`Challenge: ${problem.headline}`)
    if (solution) parts.push(`Interested in: ${solution.headline}`)
    if (next)     parts.push(next.body)
    const message = parts.length > 0
      ? parts.join("\n\n")
      : "I'd like to learn more about partnering with Endava."
    const params = new URLSearchParams({ select_reasons_of_inquiry: "Interested in our services", message })
    return `https://www.endava.com/contact?${params.toString()}`
  }, [slides])

  // Build og:image proxy URLs for all case study links (lazy — browser fetches on render)
  const ogImages: Record<string, string> = {}
  for (const slide of slides) {
    if (slide.caseStudy?.url) {
      ogImages[slide.caseStudy.url] = `/api/og-image?url=${encodeURIComponent(slide.caseStudy.url)}`
    }
  }

  useEffect(() => {
    function compute() {
      setColWidth((window.innerWidth - 214 - 215 - 32) / 3)
      const el = scrollRef.current
      if (!el) return
      const ch = el.clientHeight
      const cw = el.clientWidth
      if (ch === 0 || cw === 0) return
      const RATIO = 16 / 9
      let sw: number, sh: number
      if (ch * RATIO <= cw) {
        sh = ch
        sw = Math.round(ch * RATIO)
      } else {
        sw = cw
        sh = Math.round(cw / RATIO)
      }
      setSlideH(sh)
      setSlideW(sw)
      setSlideHPad(Math.max(0, Math.round((cw - sw) / 2)))
    }
    compute()
    window.addEventListener("resize", compute)
    return () => window.removeEventListener("resize", compute)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function generate() {
      try {
        const res = await fetch("/api/deck-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, slides }),
        })
        if (cancelled) return
        if (!res.ok) { setPdfState("error"); return }
        const blob = await res.blob()
        if (cancelled) return
        setPdfUrl(URL.createObjectURL(blob))
        setPdfState("ready")
      } catch {
        if (!cancelled) setPdfState("error")
      }
    }
    void generate()
    return () => { cancelled = true }
  }, [title, slides])

  useEffect(() => {
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl) }
  }, [pdfUrl])

  useEffect(() => {
    if (view === "slides" && pendingIdxRef.current !== null) {
      const idx = pendingIdxRef.current
      pendingIdxRef.current = null
      requestAnimationFrame(() => scrollToSlide(idx))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  function handleDownload() {
    if (!pdfUrl) return
    const a = document.createElement("a")
    a.href = pdfUrl
    a.download = `${title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf`
    a.click()
  }

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setScrollRatio(max > 0 ? el.scrollLeft / max : 0)
    if (el.clientWidth > 0) {
      setCurrentIdx(Math.min(slides.length, Math.round(el.scrollLeft / el.clientWidth)))
    }
  }

  function scrollToSlide(idx: number) {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" })
  }

  function handleScrollbarClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    const total = slides.length + 1
    const idx = Math.min(total - 1, Math.floor(ratio * total))
    scrollToSlide(idx)
  }

  function openSlide(idx: number) {
    pendingIdxRef.current = idx
    setCurrentIdx(idx)
    setView("slides")
  }

  const totalSlides = slides.length + 1
  const handlePct   = Math.round(100 / totalSlides)
  const handleLeft  = Math.round(scrollRatio * (100 - handlePct))

  // ── Shared sidebar ────────────────────────────────────────────────────────
  const sidebar = (
    <div className="shrink-0 flex flex-col items-center" style={{ width: 214, gap: 15 }}>
      <button
        onClick={() => setView("slides")}
        className="flex flex-col items-center transition-opacity hover:opacity-80"
        style={{ gap: 8 }}
      >
        <div
          className="border-2"
          style={{ width: 56, height: 56, borderColor: view === "slides" ? "white" : "#2c414c" }}
        />
        <span className="text-[12px] font-medium" style={{ color: view === "slides" ? "white" : "#2c414c" }}>
          Slides
        </span>
      </button>

      <button
        onClick={() => setView("pages")}
        className="flex flex-col items-center transition-opacity hover:opacity-80"
        style={{ gap: 8 }}
      >
        <div
          className="border-2 relative"
          style={{ width: 56, height: 56, borderColor: view === "pages" ? "white" : "#2c414c" }}
        >
          <div className="absolute inset-[6px] grid grid-cols-2 grid-rows-2 gap-[3px]">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ backgroundColor: view === "pages" ? "white" : "#2c414c" }} />
            ))}
          </div>
        </div>
        <span className="text-[12px] font-medium" style={{ color: view === "pages" ? "white" : "#2c414c" }}>
          Pages
        </span>
      </button>
    </div>
  )

  const handleCopy = useCallback(() => {
    if (!shareUrl) return
    void navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [shareUrl])

  // ── Download button ───────────────────────────────────────────────────────
  const downloadBtn = (
    <button
      onClick={handleDownload}
      disabled={pdfState !== "ready"}
      aria-label={pdfState === "loading" ? "Preparing PDF…" : "Download deck"}
      title={pdfState === "loading" ? "Preparing PDF…" : pdfState === "error" ? "PDF unavailable" : "Download PDF"}
      className="flex items-center justify-center rounded-full transition-opacity disabled:opacity-50"
      style={{ width: 48, height: 48, backgroundColor: "#e94e1b", flexShrink: 0 }}
    >
      {pdfState === "loading" ? (
        <svg className="animate-spin" width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" stroke="white" strokeWidth="2.5" strokeOpacity="0.3" />
          <path d="M10 2a8 8 0 018 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 3v10M6 9l4 4 4-4M3 17h14" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )

  const shareBtn = shareUrl ? (
    <button
      onClick={handleCopy}
      aria-label={copied ? "Link copied!" : "Copy shareable link"}
      title={copied ? "Copied!" : "Copy link"}
      className="flex items-center justify-center rounded-full transition-colors"
      style={{ width: 48, height: 48, backgroundColor: "#e94e1b", flexShrink: 0 }}
    >
      {copied ? (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M3 10l5 5 9-9" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 13V4M6 8l4-4 4 4M3 14v1a2 2 0 002 2h10a2 2 0 002-2v-1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  ) : null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ backgroundColor: "#122d38", fontFamily: "var(--font-poppins, Poppins, sans-serif)" }}
    >
      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav className="flex items-start justify-between px-[68px] pt-[9px] pb-0 shrink-0">
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
        {currentIdx > 0 && (
          <div className="flex items-center gap-4 pt-[11px]">
            <Image src="/brand/icon-search.svg" alt="Search" width={48} height={48} unoptimized />
            <button
              onClick={() => window.open(contactUrl, "_blank", "noopener,noreferrer")}
              className="border-2 border-white rounded-full px-6 py-2 text-white text-[16px] font-medium whitespace-nowrap hover:bg-white/10 transition-colors"
            >
              Let&apos;s connect
            </button>
          </div>
        )}
      </nav>

      {view === "slides" ? (
        <>
          {/* ── Slides view ──────────────────────────────────────────────── */}
          <div className="flex flex-1 overflow-hidden" style={{ paddingTop: 71 }}>
            {sidebar}

            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 flex overflow-x-auto scrollbar-hide"
              style={{ scrollSnapType: "x mandatory" }}
            >
              {/* Cover slide — index 0 */}
              <div
                className="shrink-0 flex items-center justify-center"
                style={{ width: "100%", height: "100%", scrollSnapAlign: "start" }}
              >
                {slideW > 0 && (
                  <div className="scrollbar-hide" style={{ width: slideW, height: slideH, overflowX: "hidden", overflowY: "auto" }}>
                    <CoverSlide title={title} />
                  </div>
                )}
              </div>
              {slides.map((slide, i) => (
                <div
                  key={i}
                  className="shrink-0 flex items-center justify-center"
                  style={{ width: "100%", height: "100%", scrollSnapAlign: "start" }}
                >
                  {slideW > 0 && (
                    <div className="scrollbar-hide" style={{ width: slideW, height: slideH, overflowX: "hidden", overflowY: "auto", outline: "1.5px solid rgba(255,255,255,0.1)" }}>
                      <SlideTemplate slide={slide} ogImages={ogImages} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── Slides bottom bar ────────────────────────────────────────── */}
          <div className="shrink-0 flex flex-col" style={{ paddingBottom: 44, paddingTop: 20 }}>
            <div className="flex items-center">
              <button
                onClick={onClose}
                className="shrink-0 flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors"
                style={{ width: 214, fontSize: 12, fontWeight: 500, justifyContent: "center" }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Start again
              </button>
              <div style={{ width: slideHPad, flexShrink: 0 }} />
              <div
                className="relative rounded-full cursor-pointer flex-1"
                style={{ height: 24, backgroundColor: "#2c414c" }}
                onClick={handleScrollbarClick}
              >
                <div
                  className="absolute top-0 rounded-full transition-[left] duration-100"
                  style={{ height: 24, width: `${handlePct}%`, left: `${handleLeft}%`, backgroundColor: "white" }}
                />
              </div>
              <div style={{ width: slideHPad, flexShrink: 0 }} />
            </div>
            <div className="flex items-center justify-between" style={{ marginTop: 20, paddingLeft: 214 + slideHPad, paddingRight: slideHPad }}>
              <span className="font-medium text-white" style={{ fontSize: 20 }}>
                {currentIdx + 1} of {totalSlides}
              </span>
              <div className="flex items-center gap-3">
                {shareBtn}
                {downloadBtn}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* ── Pages view ───────────────────────────────────────────────── */}
          <div className="flex flex-1 overflow-hidden" style={{ paddingTop: 71 }}>
            {sidebar}

            <div className="flex-1 overflow-y-auto scrollbar-hide" style={{ paddingTop: 36, paddingRight: 215, paddingBottom: 40 }}>
              <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: "48px 16px" }}>
                {[null, ...slides].map((slide, i) => {
                  const SLIDE_W = 1011
                  const scale   = colWidth / SLIDE_W
                  const isCover = i === 0
                  return (
                    <button
                      key={i}
                      onClick={() => openSlide(i)}
                      className="flex flex-col text-left group min-w-0 w-full"
                    >
                      {/* Thumbnail header */}
                      <div
                        className="flex items-center justify-between shrink-0"
                        style={{ height: 40, backgroundColor: "#2c414c", paddingLeft: 12, paddingRight: 8 }}
                      >
                        <span className="font-medium" style={{ fontSize: 12, color: "white" }}>
                          {isCover ? "Cover" : slide!.tag}
                        </span>
                        {!isCover && (
                          <div
                            className="flex items-center justify-center rounded-full"
                            style={{ width: 24, height: 24, backgroundColor: "#e94e1b" }}
                          >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M2 2l6 6M8 2l-6 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Scaled thumbnail */}
                      <div
                        className="overflow-hidden group-hover:opacity-90 transition-opacity relative w-full"
                        style={{ height: 208 }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: SLIDE_W,
                            height: 570,
                            transformOrigin: "top left",
                            transform: `scale(${scale})`,
                            pointerEvents: "none",
                          }}
                        >
                          {isCover
                            ? <CoverSlideThumb title={title} />
                            : <SlideTemplateThumbnail slide={slide!} ogImages={ogImages} />
                          }
                        </div>
                      </div>

                      <span className="font-medium text-white mt-3" style={{ fontSize: 20 }}>
                        {isCover ? "Cover" : `Slide ${i}`}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Pages bottom bar ─────────────────────────────────────────── */}
          <div
            className="shrink-0 flex items-center"
            style={{ paddingRight: 215, paddingBottom: 44, paddingTop: 20 }}
          >
            <button
              onClick={onClose}
              className="shrink-0 flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors"
              style={{ width: 214, fontSize: 12, fontWeight: 500, justifyContent: "center" }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Start again
            </button>
            <span className="font-medium text-white flex-1" style={{ fontSize: 20 }}>
              {totalSlides} of {totalSlides}
            </span>
            <div className="flex items-center gap-3">
              {shareBtn}
              {downloadBtn}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
