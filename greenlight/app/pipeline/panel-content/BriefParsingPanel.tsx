"use client"
import { useState } from "react"
import type { CanvasNodeData } from "../types"

interface Props { runId: string; nodeData: CanvasNodeData; onRefresh: () => void; onAdvance?: () => void; error: string | null; setError: (e: string | null) => void }

export default function BriefParsingPanel({ runId, nodeData, onRefresh, onAdvance, error, setError }: Props) {
  const d = nodeData.stageData
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState(false)

  if (!d) return <p className="text-sm text-zinc-500">No parsed brief data.</p>

  const fields = [
    ["Brand", "brand"],
    ["Objective", "campaign_objective"],
    ["Key Message", "key_message"],
    ["Audience (Primary)", "target_audience.primary"],
    ["Duration (sec)", "format.duration_seconds"],
    ["Platform", "format.platform"],
    ["Aspect Ratio", "format.aspect_ratio"],
  ] as const

  function getVal(key: string): string {
    if (edits[key] !== undefined) return edits[key]
    if (key.includes(".")) {
      const [parent, child] = key.split(".")
      const obj = d?.[parent ?? ""] as Record<string, unknown> | undefined
      return String(obj?.[child ?? ""] ?? "—")
    }
    const val = d?.[key ?? ""]
    if (typeof val === "number") return `${(val * 100).toFixed(0)}%`
    return String(val ?? "—")
  }

  async function handleGenerate() {
    if (generating) return; setGenerating(true)
    setError(null)
    try {
      const res = await fetch("/api/territories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed")
      onRefresh()
      onAdvance?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed")
    } finally { setGenerating(false) }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-zinc-300">Parsed Brief</h3>
      <div className="space-y-2">
        {fields.map(([label, key]) => (
          <div key={key}>
            <p className="text-[10px] text-zinc-500">{label}</p>
            <input
              type="text"
              value={getVal(key!)}
              onChange={(e) => setEdits(prev => ({ ...prev, [key!]: e.target.value }))}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus:border-zinc-500 focus:outline-none"
            />
          </div>
        ))}
      </div>
      {Array.isArray(d["brief_gaps"]) && (d["brief_gaps"] as string[]).length > 0 && (
        <div>
          <p className="text-xs font-medium text-amber-400 mb-1">Gaps</p>
          <ul className="list-disc list-inside text-xs text-amber-300 space-y-0.5">
            {(d["brief_gaps"] as string[]).map((g, i) => <li key={i}>{g}</li>)}
          </ul>
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button onClick={handleGenerate} disabled={generating}
        className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-40 transition-colors">
        {generating ? "Generating…" : "🎨 Generate Territories"}
      </button>
    </div>
  )
}
