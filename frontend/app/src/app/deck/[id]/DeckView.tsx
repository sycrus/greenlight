"use client"

import { useRouter } from "next/navigation"
import { SlideDeckOverlay } from "@/components/landing/SlideDeckOverlay"
import type { Slide } from "@gen-ux/design-system"

export function DeckView({ title, slides, shareUrl }: { title: string; slides: Slide[]; shareUrl: string }) {
  const router = useRouter()
  return (
    <SlideDeckOverlay
      title={title}
      slides={slides}
      shareUrl={shareUrl}
      onClose={() => router.push("/")}
    />
  )
}
