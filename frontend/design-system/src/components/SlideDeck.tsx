"use client"

import { useState } from "react"
import { cn } from "./utils"

export interface Slide {
  tag: "Problem" | "Agitate" | "Proof Point" | "Solution" | "Next Step"
  headline: string
  body: string
  stat?: { value: string; label: string }
  stats?: { value: string; label: string }[]
  caseStudy?: {
    url: string
    title: string
    preamble: string
  }
}

export interface SlideDeckProps {
  title: string
  slides: Slide[]
  className?: string
}

const TAG_STYLES: Record<Slide["tag"], string> = {
  "Problem":      "bg-amber-100 text-amber-800",
  "Agitate":      "bg-red-100 text-red-800",
  "Proof Point":  "bg-blue-100 text-blue-800",
  "Solution":     "bg-violet-100 text-violet-800",
  "Next Step":    "bg-emerald-100 text-emerald-800",
}

export function SlideDeck({ title, slides, className }: SlideDeckProps) {
  const [current, setCurrent] = useState(0)

  if (slides.length === 0) return null

  const slide = slides[current]
  if (!slide) return null

  const prev = () => setCurrent((i) => Math.max(0, i - 1))
  const next = () => setCurrent((i) => Math.min(slides.length - 1, i + 1))

  return (
    <div className={cn("flex flex-col gap-3 w-full max-w-lg", className)}>
      {/* Deck header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </p>
        <p className="text-xs text-muted-foreground">
          {current + 1} / {slides.length}
        </p>
      </div>

      {/* Slide card */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {/* Tag strip */}
        <div className={cn("px-4 py-2 flex items-center", TAG_STYLES[slide.tag])}>
          <span className="text-xs font-semibold tracking-wide">{slide.tag}</span>
        </div>

        {/* Slide body */}
        <div className="px-4 py-5 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground leading-snug">
            {slide.headline}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {slide.body}
          </p>

          {slide.caseStudy && (
            <a
              href={slide.caseStudy.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 rounded-lg border bg-muted/40 p-3 hover:bg-muted/70 transition-colors mt-1"
            >
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground line-clamp-1">
                  {slide.caseStudy.title}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {slide.caseStudy.preamble}
                </p>
                <span className="text-xs text-primary group-hover:underline mt-0.5">
                  Read case study →
                </span>
              </div>
            </a>
          )}
        </div>

        {/* Navigation */}
        <div className="border-t px-4 py-3 flex items-center justify-between bg-muted/20">
          <button
            onClick={prev}
            disabled={current === 0}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-2 py-1 rounded"
          >
            ← Prev
          </button>

          {/* Dot indicators */}
          <div className="flex gap-1.5 items-center">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === current
                    ? "w-4 bg-primary"
                    : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                )}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>

          <button
            onClick={next}
            disabled={current === slides.length - 1}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-2 py-1 rounded"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}

export function SlideDeckSkeleton() {
  return (
    <div className="flex flex-col gap-3 w-full max-w-lg">
      <div className="flex items-center justify-between">
        <div className="h-3 w-40 rounded bg-muted animate-pulse" />
        <div className="h-3 w-8 rounded bg-muted animate-pulse" />
      </div>
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-4 py-2 bg-muted animate-pulse h-8" />
        <div className="px-4 py-5 flex flex-col gap-3">
          <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
          <div className="space-y-2">
            <div className="h-3 w-full rounded bg-muted animate-pulse" />
            <div className="h-3 w-5/6 rounded bg-muted animate-pulse" />
            <div className="h-3 w-4/6 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-16 rounded-lg bg-muted animate-pulse mt-1" />
        </div>
        <div className="border-t px-4 py-3 bg-muted/20 flex justify-between items-center">
          <div className="h-3 w-10 rounded bg-muted animate-pulse" />
          <div className="flex gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-1.5 w-1.5 rounded-full bg-muted animate-pulse" />
            ))}
          </div>
          <div className="h-3 w-10 rounded bg-muted animate-pulse" />
        </div>
      </div>
    </div>
  )
}
