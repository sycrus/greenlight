"use client"
import { useState } from "react"
import type { CanvasNodeData } from "../types"

interface Props { runId: string; nodeData: CanvasNodeData; onRefresh: () => void; onAdvance?: () => void; error: string | null; setError: (e: string | null) => void }

export default function DeckPanel({ runId, nodeData, onRefresh, onAdvance, error, setError }: Props) {
  const [generating, setGenerating] = useState(false)
  const d = nodeData.stageData
  const hasDeck = !!d?.["ecd_deck_url"]

  async function handleDelete() {
    if (!confirm("Delete the deck and flow package?") || generating) return
    setGenerating(true); setError(null)
    try {
      const res = await fetch("/api/generate-deck", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId }) })
      if (!res.ok) throw new Error((await res.json()).error)
      onRefresh()
    } catch (err) { setError(err instanceof Error ? err.message : "Delete failed") }
    finally { setGenerating(false) }
  }

  async function handleGenerate() {
    if (generating) return; setGenerating(true)
    setError(null)
    try {
      const res = await fetch("/api/generate-deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Deck generation failed")
      onRefresh()
      onAdvance?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deck generation failed")
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-300">Deck & Flow Package</h3>
        <button onClick={handleGenerate} disabled={generating}
          className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-40">
          {generating ? "Generating…" : "🔄 Regenerate Deck"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}

      {!hasDeck ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-500">No deck generated yet.</p>
          <button onClick={handleGenerate} disabled={generating}
            className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-40 transition-colors">
            {generating ? "Generating…" : "📦 Generate Deck"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-green-800 bg-green-950/30 px-3 py-2">
            <p className="text-sm font-medium text-green-400">Deck Ready</p>
          </div>
          <div className="flex flex-col gap-2">
            <a href={d?.["ecd_deck_url"] as string} target="_blank" rel="noopener noreferrer"
              className="rounded bg-zinc-800 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors text-center">
              📋 View ECD Deck (Internal)
            </a>
            <a href={d?.["client_deck_url"] as string} target="_blank" rel="noopener noreferrer"
              className="rounded bg-zinc-800 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors text-center">
              👁 View Client Deck
            </a>
            {(d?.["flow_package_public_url"] as string | undefined) && (
              <a href={d?.["flow_package_public_url"] as string} target="_blank" rel="noopener noreferrer"
                className="rounded bg-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-600 transition-colors text-center">
                📦 Download Flow Package
              </a>
            )}
          </div>
          <button onClick={handleDelete} disabled={generating}
            className="w-full rounded bg-red-900/50 px-3 py-1.5 text-xs text-red-400 hover:bg-red-800/50 transition-colors disabled:opacity-40">
            🗑 Delete Deck & Flow Package
          </button>
        </div>
      )}
    </div>
  )
}
