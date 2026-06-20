"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import type { Slide } from "@gen-ux/design-system"

interface SlideDeckDownloadButtonProps {
  title: string
  slides: Slide[]
}

export function SlideDeckDownloadButton({ title, slides }: SlideDeckDownloadButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    setLoading(true)
    try {
      const res = await fetch("/api/deck-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, slides }),
      })

      if (!res.ok) throw new Error(`PDF generation failed: ${res.status}`)

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("[SlideDeckDownload]", err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      <Download className="h-3 w-3" />
      {loading ? "Generating PDF…" : "Download as PDF"}
    </button>
  )
}
