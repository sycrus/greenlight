"use client"
import { useState, useRef } from "react"
import type { CanvasNodeData } from "../types"

interface Props { runId: string; nodeData: CanvasNodeData; onRefresh: () => void; onAdvance?: () => void; error: string | null; setError: (e: string | null) => void }

interface VisualDNAData {
  territory_id: string; version: string
  palette: { primary: string[]; accent: string[]; forbidden: string[] }
  ingredients: Array<{ ingredient_id: string; type: string; description: string; generated_reference_uri: string | null; reference_image_uri: string | null; flow_ingredient_prompt: string }>
  cinematography: { style: string; preferred_shot_types: string[]; camera_movement: string; lighting: string; color_grade: string }
  brand_rules_as_prompts: string[]; negative_prompt_list: string[]; flow_scene_brief: string
}

export default function VisualDnaPanelContent({ runId, nodeData, onRefresh, onAdvance, error, setError }: Props) {
  const [encoding, setEncoding] = useState(false)
  const [genRefs, setGenRefs] = useState(false)
  const genBusy = useRef(false)
  const territories = nodeData.stageData?.["territories"] as Record<string, VisualDNAData> | undefined
  // Single VD node
  const single = !territories ? nodeData.stageData as unknown as VisualDNAData | null : null
  const entries = territories ? Object.entries(territories) : (single ? [[single.territory_id ?? "vd", single] as const] : [])

  async function handleEncode() {
    if (encoding) return; setEncoding(true); setError(null)
    try {
      const r = await fetch(`/api/run/${runId}`); const d = await r.json()
      const ter = d.stages?.territory_generation?.territories as Array<Record<string, unknown>> | undefined
      if (!ter?.length) throw new Error("No territories")
      for (const t of ter) {
        const res = await fetch("/api/visual-dna", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId, territory: t }) })
        if (!res.ok) throw new Error((await res.json()).error)
      }
      onRefresh()
    } catch (err) { setError(err instanceof Error ? err.message : "Encoding failed") }
    finally { setEncoding(false) }
  }

  async function handleGenerateRefs() {
    if (genBusy.current) return
    genBusy.current = true; setGenRefs(true); setError(null)
    try {
      const tid = single?.territory_id ?? nodeData.territoryId
      if (tid) {
        // Generate for a single territory — include all non-brand-asset ingredients
        const allIngIds = single?.ingredients?.filter(i => i.type !== "brand_asset").map(i => i.ingredient_id) ?? []
        if (!allIngIds.length) throw new Error("No ingredients to generate images for")
        const res = await fetch("/api/generate-references", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId, territoryId: tid, ingredientIds: allIngIds, source: "comfyui", workflow: "image_ideogram4_t2i" }) })
        if (!res.ok) throw new Error((await res.json()).error)
      } else {
        // Generate for all territories
        const r = await fetch(`/api/run/${runId}`); const d = await r.json()
        const vd = d.stages?.visual_dna?.territories as Record<string, Record<string, unknown>> | undefined
        if (!vd) throw new Error("No Visual DNA found")
        for (const [tId, v] of Object.entries(vd)) {
          const ings = v["ingredients"] as Array<{ ingredient_id: string; type: string; generated_reference_uri?: string | null }> | undefined
          const ids = ings?.filter(i => i.type !== "brand_asset").map(i => i.ingredient_id) ?? []
          if (ids.length) {
            const res = await fetch("/api/generate-references", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId, territoryId: tId, ingredientIds: ids, source: "comfyui", workflow: "image_ideogram4_t2i" }) })
            if (!res.ok) throw new Error((await res.json()).error)
          }
        }
      }
      onRefresh()
      onAdvance?.()
    } catch (err) { setError(err instanceof Error ? err.message : "Reference gen failed") }
    finally { genBusy.current = false; setGenRefs(false) }
  }

  async function handleDelete(tid: string) {
    if (!confirm(`Delete Visual DNA for ${tid}?`) || encoding) return
    setEncoding(true); setError(null)
    try {
      // Read current VD data, remove the territory entry, write back
      const r = await fetch(`/api/run/${runId}`); const d = await r.json()
      const allVd = d.stages?.visual_dna?.territories as Record<string, unknown> | undefined
      if (!allVd?.[tid]) throw new Error("Not found")
      delete allVd[tid]
      // Write back via the visual-dna stage
      const res = await fetch("/api/visual-dna", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId, territoryId: tid }) })
      if (!res.ok) throw new Error((await res.json()).error)
      onRefresh()
    } catch (err) { setError(err instanceof Error ? err.message : "Delete failed") }
    finally { setEncoding(false) }
  }

  function renderVd(vd: VisualDNAData) {
    const pending = vd.ingredients.filter(i => i.type !== "brand_asset" && !i.generated_reference_uri).length
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-3 space-y-3">
        <h4 className="text-xs font-medium text-zinc-400">{vd.territory_id}</h4>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          {(["style", "camera_movement", "lighting", "color_grade"] as const).map((key) => (
            <div key={key}>
              <p className="text-zinc-500 capitalize">{key.replace("_", " ")}</p>
              <input type="text" defaultValue={vd.cinematography[key]}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300 focus:border-zinc-500 focus:outline-none" />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {vd.palette.primary.map(hex => (
            <span key={hex} className="inline-flex items-center gap-1 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: hex }} />{hex}
            </span>
          ))}
        </div>
        <p className="text-[10px] text-zinc-500">{vd.ingredients.length} ingredients · {pending} need images</p>
        <button onClick={() => handleDelete(vd.territory_id)} disabled={encoding}
          className="rounded bg-red-900/50 px-2 py-1 text-[10px] text-red-400 hover:bg-red-800/50 transition-colors disabled:opacity-40">
          🗑 Delete
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-300">Visual DNA</h3>
        <button onClick={handleEncode} disabled={encoding}
          className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-40">
          {encoding ? "Encoding…" : "🔄 Regenerate"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}

      {entries.map(([tid, vd]) => (
        <div key={tid}>{renderVd(vd)}</div>
      ))}

      <button onClick={handleGenerateRefs} disabled={genRefs}
        className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-40 transition-colors">
        {genRefs ? "Generating…" : "🎨 Generate Reference Images"}
      </button>
    </div>
  )
}
