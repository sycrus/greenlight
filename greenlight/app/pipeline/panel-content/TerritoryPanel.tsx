"use client"
import { useState } from "react"
import type { CanvasNodeData } from "../types"

interface Props { runId: string; nodeData: CanvasNodeData; onRefresh: () => void; onAdvance?: () => void; error: string | null; setError: (e: string | null) => void }

interface TerritoryData {
  id: string; name: string; creative_proposition: string; visual_language: string
  tone: string; emotional_arc: string; scene_count_suggestion: number
  flow_prompt_style: string; negative_constraints: string[]; risk_flag: string | null
}

export default function TerritoryPanel({ runId, nodeData, onRefresh, onAdvance, error, setError }: Props) {
  const [generating, setGenerating] = useState(false)
  const [encoding, setEncoding] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const territories = nodeData.stageData?.["territories"] as TerritoryData[] | undefined
  const single = !territories ? nodeData.stageData as unknown as TerritoryData | null : null
  // Track edits for controlled inputs
  const [edits, setEdits] = useState<Record<string, Partial<TerritoryData>>>({})

  async function handleRegenerate() {
    if (generating) return; setGenerating(true); setError(null)
    try {
      const res = await fetch("/api/territories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId }) })
      if (!res.ok) throw new Error((await res.json()).error)
      onRefresh()
    } catch (err) { setError(err instanceof Error ? err.message : "Generation failed") }
    finally { setGenerating(false) }
  }

  async function handleEncodeOne(territory: TerritoryData) {
    if (encoding) return; setEncoding(true); setError(null)
    try {
      const res = await fetch("/api/visual-dna", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId, territory }) })
      if (!res.ok) throw new Error((await res.json()).error ?? "VDNA failed")
      onRefresh()
      onAdvance?.()
    } catch (err) { setError(err instanceof Error ? err.message : "Encoding failed") }
    finally { setEncoding(false) }
  }

  async function handleEncodeAll() {
    if (encoding) return; setEncoding(true); setError(null)
    try {
      const r = await fetch(`/api/run/${runId}`); const d = await r.json()
      const ter = d.stages?.territory_generation?.territories as TerritoryData[] | undefined
      if (!ter?.length) throw new Error("No territories")
      for (const t of ter) {
        const res = await fetch("/api/visual-dna", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId, territory: t }) })
        if (!res.ok) throw new Error((await res.json()).error ?? "VDNA failed")
      }
      onRefresh()
      onAdvance?.()
    } catch (err) { setError(err instanceof Error ? err.message : "Encoding failed") }
    finally { setEncoding(false) }
  }

  async function handleSave(territoryId: string, _index: number) {
    const fields = edits[territoryId]
    if (!fields || saving) return
    setSaving(territoryId); setError(null)
    try {
      const res = await fetch("/api/territories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, territoryId, fields }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed")
      onRefresh()
    } catch (err) { setError(err instanceof Error ? err.message : "Save failed") }
    finally { setSaving(null) }
  }

  async function handleDelete(territoryId: string) {
    if (!confirm("Delete this territory? This cannot be undone.") || saving) return
    setSaving(territoryId); setError(null)
    try {
      const res = await fetch("/api/territories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, territoryId }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Delete failed")
      onRefresh()
    } catch (err) { setError(err instanceof Error ? err.message : "Delete failed") }
    finally { setSaving(null) }
  }

  function update(t: TerritoryData, key: string, value: string | number) {
    setEdits(prev => ({ ...prev, [t.id]: { ...prev[t.id], [key]: value } }))
  }

  function val(t: TerritoryData, key: keyof TerritoryData, fallback: string): string {
    const e = edits[t.id]?.[key] as string | number | string[] | undefined
    return String(e ?? fallback)
  }

  function renderTerritory(t: TerritoryData, index: number) {
    const isDirty = !!edits[t.id]
    const autoRows = (text: string, min: number) => Math.max(min, Math.ceil(text.length / 50))
    return (
      <div key={t.id ?? index} className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-3 space-y-2">
        <input type="text" value={String(val(t, "name", t.name))}
          onChange={(e) => update(t, "name", e.target.value)}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm font-medium text-zinc-200 focus:border-zinc-500 focus:outline-none"
        />
        <textarea value={String(val(t, "creative_proposition", t.creative_proposition))}
          rows={autoRows(String(val(t, "creative_proposition", t.creative_proposition)), 2)}
          onChange={(e) => update(t, "creative_proposition", e.target.value)}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-400 focus:border-zinc-500 focus:outline-none"
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] text-zinc-500">Tone</p>
            <input type="text" value={String(val(t, "tone", t.tone))}
              onChange={(e) => update(t, "tone", e.target.value)}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <div>
            <p className="text-[10px] text-zinc-500">Scenes</p>
            <input type="number" value={edits[t.id]?.scene_count_suggestion ?? t.scene_count_suggestion}
              onChange={(e) => update(t, "scene_count_suggestion", parseInt(e.target.value) || 1)}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 focus:border-zinc-500 focus:outline-none"
            />
          </div>
        </div>
        <textarea value={String(val(t, "emotional_arc", t.emotional_arc))}
          rows={autoRows(String(val(t, "emotional_arc", t.emotional_arc)), 1)}
          onChange={(e) => update(t, "emotional_arc", e.target.value)}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-500 focus:border-zinc-500 focus:outline-none"
          placeholder="Emotional arc…"
        />
        {t.risk_flag && (
          <div className="rounded bg-amber-950/30 px-2 py-1 text-[10px] text-amber-400 border border-amber-800/50">⚠ {t.risk_flag}</div>
        )}
        <div className="flex gap-2">
          {isDirty && (
            <button onClick={() => handleSave(t.id, index)} disabled={saving === t.id}
              className="flex-1 rounded bg-green-800 px-2 py-1 text-xs text-green-200 hover:bg-green-700 transition-colors disabled:opacity-40">
              {saving === t.id ? "Saving…" : "💾 Save"}
            </button>
          )}
          <button onClick={() => handleDelete(t.id)} disabled={saving === t.id}
            className="rounded bg-red-900/50 px-2 py-1 text-xs text-red-400 hover:bg-red-800/50 hover:text-red-300 transition-colors disabled:opacity-40">
            🗑
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-300">{single ? "Territory" : "Creative Territories"}</h3>
        <button onClick={handleRegenerate} disabled={generating}
          className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-40">
          {generating ? "Regenerating…" : "🔄 Regenerate"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}

      {single ? (
        <>
          {renderTerritory(single, 0)}
          <button onClick={() => handleEncodeOne(single)} disabled={encoding}
            className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-40 transition-colors">
            {encoding ? "Encoding…" : "🧬 Generate Visual DNA for this territory"}
          </button>
        </>
      ) : territories?.length ? (
        <div className="space-y-3">
          {territories.map((t, i) => renderTerritory(t, i))}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-zinc-500">No territories yet.</p>
          <button onClick={handleRegenerate} disabled={generating}
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-40 transition-colors">
            {generating ? "Generating…" : "🎨 Generate Territories"}
          </button>
        </div>
      )}

      {territories?.length && (
        <button onClick={handleEncodeAll} disabled={encoding}
          className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-40 transition-colors">
          {encoding ? "Encoding…" : "🧬 Generate Visual DNA for all territories"}
        </button>
      )}
    </div>
  )
}
