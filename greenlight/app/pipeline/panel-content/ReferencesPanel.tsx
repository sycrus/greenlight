"use client"
import { useState, useRef, useEffect } from "react"
import type { CanvasNodeData } from "../types"

const DEFAULT_WORKFLOW = "image_krea2_turbo_t2i_int8"

interface Props { runId: string; nodeData: CanvasNodeData; onRefresh: () => void; onAdvance?: () => void; error: string | null; setError: (e: string | null) => void }

export default function ReferencesPanel({ runId, nodeData, onRefresh, onAdvance, error, setError }: Props) {
  const [generating, setGenerating] = useState<Record<string, boolean>>({})
  const [workflows, setWorkflows] = useState<string[]>([])
  const [selectedWorkflow, setSelectedWorkflow] = useState(DEFAULT_WORKFLOW)
  const genBusy = useRef(false)

  useEffect(() => {
    fetch("/api/comfyui-workflows")
      .then(r => r.json())
      .then(d => {
        if (d.workflows?.length) {
          setWorkflows(d.workflows)
          if (!d.workflows.includes(selectedWorkflow)) {
            setSelectedWorkflow(d.workflows[0])
          }
        }
      })
      .catch(() => {})
  }, [])
  const territories = nodeData.stageData?.["territories"] as Record<string, { ingredients: Array<{ ingredient_id: string; type: string; description: string; generated_reference_uri: string | null; reference_image_uri: string | null }> }> | undefined
  // Single ingredient node (from reference node click)
  const singleIng = !territories ? nodeData.stageData as { ingredient_id: string; type: string; description: string; generated_reference_uri: string | null; reference_image_uri: string | null } | null : null

  function imgUrl(uri: string | null): string | null {
    if (!uri) return null
    if (uri.startsWith("https://") || uri.startsWith("/")) return uri
    if (uri.startsWith("gs://")) {
      const m = uri.match(/^gs:\/\/([^\/]+)\/(.+)$/)
      if (m) return `https://storage.googleapis.com/${m[1]}/${m[2]}`
    }
    return uri
  }

  async function handleGenerate(territoryId: string, ingredientId: string) {
    const key = `${territoryId}/${ingredientId}`
    if (genBusy.current || generating[key]) return
    genBusy.current = true
    setGenerating((prev) => ({ ...prev, [key]: true }))
    setError(null)
    try {
      const res = await fetch("/api/generate-references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, territoryId, ingredientIds: [ingredientId], source: "comfyui", workflow: selectedWorkflow }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Generation failed")
      if (data.errors?.length) throw new Error(data.errors[0].error)
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed")
    } finally {
      genBusy.current = false
      setGenerating((prev) => ({ ...prev, [key]: false }))
    }
  }

  if (singleIng) {
    const url = imgUrl(singleIng.generated_reference_uri ?? singleIng.reference_image_uri)
    const busy = generating[singleIng.ingredient_id]
    const tid = nodeData.territoryId ?? ""
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-zinc-300">{singleIng.ingredient_id}</h3>
        <p className="text-xs text-zinc-500">{singleIng.description}</p>
        <p className="text-[10px] text-zinc-600">Type: {singleIng.type}</p>
        {workflows.length > 0 && (
          <select value={selectedWorkflow} onChange={e => setSelectedWorkflow(e.target.value)}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 focus:border-zinc-500 focus:outline-none">
            {workflows.map(w => (
              <option key={w} value={w}>{w.replace(/^image_/, "").replace(/_/g, " ")}</option>
            ))}
          </select>
        )}
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={singleIng.description} className="w-full rounded border border-zinc-700" />
        ) : (
          <p className="text-xs text-zinc-600">No image yet</p>
        )}
        <div className="flex gap-2">
          <button onClick={() => handleGenerate(tid, singleIng.ingredient_id)} disabled={busy}
            className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-40 transition-colors">
            {busy ? "Generating…" : url ? "🔄 Regenerate" : "🎨 Generate"}
          </button>
          {url && (
            <button onClick={() => handleDeleteImage(tid, singleIng.ingredient_id, singleIng.generated_reference_uri ?? undefined)} disabled={busy}
              className="rounded-lg bg-red-900/50 px-3 py-2.5 text-sm text-red-400 hover:bg-red-800/50 transition-colors disabled:opacity-40">
              🗑
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    )
  }

  if (!territories) {
    return <p className="text-sm text-zinc-500">No Visual DNA data to generate references from.</p>
  }

  let totalIngs = 0
  let generatedIngs = 0
  const entries = Object.entries(territories)

  // Collect all ingredients for the generate-all button
  const allNeedingGen: Array<{ tid: string; iid: string }> = []
  for (const [tid, vd] of entries) {
    for (const ing of vd.ingredients) {
      totalIngs++
      if (ing.generated_reference_uri) generatedIngs++
      else if (ing.type !== "brand_asset") allNeedingGen.push({ tid, iid: ing.ingredient_id })
    }
  }

  async function handleDeleteImage(territoryId: string, ingredientId: string, uriToDelete?: string) {
    if (!confirm(`Delete image for ${ingredientId}?`) || generating[ingredientId]) return
    setGenerating(prev => ({ ...prev, [ingredientId]: true })); setError(null)
    try {
      const r = await fetch(`/api/run/${runId}`); const d = await r.json()
      const vd = d.stages?.visual_dna?.territories as Record<string, Record<string, unknown>> | undefined
      const ter = vd?.[territoryId]
      if (!ter) throw new Error("Territory not found")
      const ings = ter["ingredients"] as Array<Record<string, unknown>>
      const ing = ings.find(i => i["ingredient_id"] === ingredientId)
      if (!ing) throw new Error("Ingredient not found")
      if (uriToDelete) {
        // Remove specific URI from history
        const uris = ((ing["generated_reference_uris"] as string[]) ?? []).filter(u => u !== uriToDelete)
        ing["generated_reference_uris"] = uris
        ing["generated_reference_uri"] = uris.length > 0 ? uris[uris.length - 1] : null
      } else {
        // Clear all
        ing["generated_reference_uri"] = null
        ing["generated_reference_uris"] = []
      }
      await fetch("/api/visual-dna", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId, territoryId, ingredients: ings }) })
      onRefresh()
    } catch (err) { setError(err instanceof Error ? err.message : "Delete failed") }
    finally { setGenerating(prev => ({ ...prev, [ingredientId]: false })) }
  }

  async function handleGenerateAll() {
    if (Object.values(generating).some(Boolean)) return
    for (const { tid, iid } of allNeedingGen) {
      await handleGenerate(tid, iid)
    }
    onAdvance?.()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-300">Reference Images</h3>
        {allNeedingGen.length > 0 && (
          <button onClick={handleGenerateAll}
            className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors">
            🎨 Generate All ({allNeedingGen.length})
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {workflows.length > 0 && (
        <select value={selectedWorkflow} onChange={e => setSelectedWorkflow(e.target.value)}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 focus:border-zinc-500 focus:outline-none">
          {workflows.map(w => (
            <option key={w} value={w}>{w.replace(/^image_/, "").replace(/_/g, " ")}</option>
          ))}
        </select>
      )}
      <p className="text-xs text-zinc-500">{generatedIngs}/{totalIngs} images generated</p>
      {entries.map(([tid, vd]) => (
        <div key={tid} className="space-y-2">
          <h4 className="text-xs font-medium text-zinc-400">{tid}</h4>
          {vd.ingredients.map((ing) => {
            const key = `${tid}/${ing.ingredient_id}`
            const busy = generating[key]
            const url = imgUrl(ing.generated_reference_uri ?? ing.reference_image_uri)
            return (
              <div key={ing.ingredient_id} className="rounded border border-zinc-800 bg-zinc-900 p-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-zinc-300 flex-1">{ing.ingredient_id}</span>
                  <span className="text-[10px] text-zinc-500">{ing.type}</span>
                  {url ? (
                    <span className="text-green-400 text-xs">✓</span>
                  ) : ing.type !== "brand_asset" ? (
                    <button onClick={() => handleGenerate(tid, ing.ingredient_id)} disabled={busy}
                      className="rounded bg-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-600 disabled:opacity-40">
                      {busy ? "…" : "Generate"}
                    </button>
                  ) : null}
                </div>
                {url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={ing.description} className="mt-1.5 w-full rounded border border-zinc-700 object-cover" style={{ maxHeight: 120 }} />
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
