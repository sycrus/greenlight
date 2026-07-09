"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"

// ── Types ──────────────────────────────────────────────────────────────────────

interface StageData {
  _meta?: {
    stage: string
    runId: string
    tokenCost: number | null
    updatedAt: unknown
  }
  [key: string]: unknown
}

interface GateData {
  gate: string
  runId: string
  approvalStatus: string
  territorySelected: string
  notes: string | null
  approverName: string
  approverEmail: string
  revisionCycles: number
  approvedAt: unknown
}

interface TerritoryData {
  id: string
  name: string
  creative_proposition: string
  visual_language: string
  tone: string
  emotional_arc: string
  scene_count_suggestion: number
  flow_prompt_style: string
  negative_constraints: string[]
  risk_flag: string | null
}

interface VisualDNAData {
  territory_id: string
  version: string
  palette: { primary: string[]; accent: string[]; forbidden: string[] }
  ingredients: {
    ingredient_id: string
    type: string
    description: string
    reference_image_uri: string | null
    generated_reference_uri: string | null
    flow_ingredient_prompt: string
  }[]
  cinematography: {
    style: string
    preferred_shot_types: string[]
    camera_movement: string
    lighting: string
    color_grade: string
  }
  brand_rules_as_prompts: string[]
  negative_prompt_list: string[]
  flow_scene_brief: string
}

interface RunStatus {
  runId: string
  stages: {
    brief_parsing: StageData | null
    territory_generation: StageData | null
    visual_dna: StageData | null
    output_generation: StageData | null
  }
  gates: {
    ecd_approval: GateData | null
    client_approval: GateData | null
  }
  summary: Record<string, unknown> | null
  gitTrace: string[]
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { key: "brief_parsing" as const, label: "Brief Parsing", icon: "📋" },
  { key: "territory_generation" as const, label: "Territory Generation", icon: "🎨" },
  { key: "visual_dna" as const, label: "Visual DNA Encoding", icon: "🧬" },
  { key: "output_generation" as const, label: "Dual Output Generation", icon: "📦" },
] as const

const PIPELINE_GATES = [
  { key: "ecd_approval" as const, label: "ECD Approval", icon: "✅" },
  { key: "client_approval" as const, label: "Client Approval", icon: "🔒" },
] as const

// ── Helpers ────────────────────────────────────────────────────────────────────

function stageStatus(stage: StageData | null): "complete" | "pending" {
  return stage ? "complete" : "pending"
}

function gateLabel(status: string | undefined): string {
  if (!status) return "Awaiting"
  switch (status) {
    case "APPROVED":
      return "Approved"
    case "APPROVED_WITH_NOTES":
      return "Approved with notes"
    case "APPROVED_WITH_REVISIONS":
      return "Approved with revisions"
    case "REVISIONS_REQUIRED":
      return "Revisions required"
    default:
      return status
  }
}

function gateVariant(status: string | undefined): string {
  if (!status) return "zinc"
  if (status === "APPROVED" || status === "APPROVED_WITH_NOTES") return "green"
  if (status === "REVISIONS_REQUIRED") return "amber"
  return "zinc"
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StageRow({
  label,
  icon,
  status,
  data,
  defaultOpen,
}: {
  label: string
  icon: string
  status: "complete" | "pending"
  data: StageData | null
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
      <button
        type="button"
        onClick={() => data && setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="text-lg">{icon}</span>
        <span className="flex-1 text-sm font-medium text-zinc-200">{label}</span>
        {status === "complete" ? (
          <span className="rounded-full bg-green-950/50 px-2 py-0.5 text-xs text-green-400 border border-green-800">
            Complete
          </span>
        ) : (
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500 border border-zinc-700">
            Pending
          </span>
        )}
      </button>

      {open && data && (
        <div className="border-t border-zinc-800 px-4 py-3">
          <pre className="overflow-x-auto text-xs text-zinc-400 whitespace-pre-wrap">
            {JSON.stringify(data, null, 2)}
          </pre>
          {data._meta?.tokenCost != null && (
            <p className="mt-2 text-xs text-zinc-500">
              Token cost: ${data._meta.tokenCost.toFixed(6)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function GateRow({
  label,
  icon,
  data,
  locked,
}: {
  label: string
  icon: string
  data: GateData | null
  locked: boolean
}) {
  const variant = gateVariant(data?.approvalStatus)

  const statusColors: Record<string, string> = {
    zinc: "bg-zinc-800 text-zinc-500 border-zinc-700",
    green: "bg-green-950/50 text-green-400 border-green-800",
    amber: "bg-amber-950/50 text-amber-400 border-amber-800",
  }

  return (
    <div
      className={`rounded-lg border bg-zinc-900/50 ${
        locked ? "border-zinc-800 opacity-50" : "border-zinc-700"
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-lg">{icon}</span>
        <span className="flex-1 text-sm font-medium text-zinc-200">{label}</span>
        {locked ? (
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-600 border border-zinc-700">
            Locked
          </span>
        ) : data ? (
          <span
            className={`rounded-full px-2 py-0.5 text-xs border ${statusColors[variant]}`}
          >
            {gateLabel(data.approvalStatus)}
          </span>
        ) : (
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500 border border-zinc-700">
            Awaiting
          </span>
        )}
      </div>

      {data && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-1 text-xs text-zinc-400">
          <p>
            <span className="text-zinc-500">Territory:</span>{" "}
            {data.territorySelected}
          </p>
          <p>
            <span className="text-zinc-500">Approver:</span>{" "}
            {data.approverName}{" "}
            <span className="text-zinc-600">({data.approverEmail})</span>
          </p>
          {data.notes && (
            <p>
              <span className="text-zinc-500">Notes:</span> {data.notes}
            </p>
          )}
          <p>
            <span className="text-zinc-500">Revision cycles:</span>{" "}
            {data.revisionCycles}
          </p>
        </div>
      )}
    </div>
  )
}

function TerritoryCard({ territory }: { territory: TerritoryData }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="flex-1">
          <span className="text-sm font-medium text-zinc-200">
            {territory.name}
          </span>
          <span className="ml-2 text-xs text-zinc-500">{territory.id}</span>
        </span>
        {territory.risk_flag ? (
          <span className="rounded-full bg-amber-950/50 px-2 py-0.5 text-xs text-amber-400 border border-amber-800">
            ⚠ Risk flagged
          </span>
        ) : (
          <span className="rounded-full bg-green-950/50 px-2 py-0.5 text-xs text-green-400 border border-green-800">
            Clean
          </span>
        )}
      </button>

      <div className="border-t border-zinc-800 px-4 py-3 space-y-2">
        <p className="text-xs text-zinc-400">
          <span className="text-zinc-500">Proposition:</span>{" "}
          {territory.creative_proposition}
        </p>
        <p className="text-xs text-zinc-400">
          <span className="text-zinc-500">Tone:</span> {territory.tone}
        </p>
        <p className="text-xs text-zinc-500">
          Visual: {territory.visual_language}
        </p>
        <p className="text-xs text-zinc-500">
          Arc: {territory.emotional_arc} &middot; Scenes:{" "}
          {territory.scene_count_suggestion}
        </p>
        {territory.risk_flag && (
          <div className="rounded border border-amber-800 bg-amber-950/30 px-3 py-2">
            <p className="text-xs font-medium text-amber-400">Risk Flag</p>
            <p className="text-xs text-amber-300">{territory.risk_flag}</p>
          </div>
        )}

        {open && (
          <div className="mt-2 border-t border-zinc-800 pt-2">
            <pre className="overflow-x-auto text-xs text-zinc-500 whitespace-pre-wrap">
              {JSON.stringify(territory, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

function VisualDNAPanel({
  vd,
  runId,
  territoryId,
  onRefresh,
}: {
  vd: VisualDNAData
  runId: string
  territoryId: string
  onRefresh: () => void
}) {
  const [generating, setGenerating] = useState<string | null>(null)
  const [genError, setGenError] = useState<string | null>(null)

  async function handleGenerate(ingredientId: string) {
    setGenerating(ingredientId)
    setGenError(null)
    try {
      const res = await fetch("/api/generate-references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, territoryId, ingredientIds: [ingredientId] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Generation failed")
      if (data.errors?.length > 0) {
        throw new Error(data.errors[0].error)
      }
      onRefresh()
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setGenerating(null)
    }
  }

  function imgUrl(uri: string | null): string | null {
    if (!uri) return null
    if (uri.startsWith("https://")) return uri
    if (uri.startsWith("gs://")) {
      const m = uri.match(/^gs:\/\/([^\/]+)\/(.+)$/)
      if (m) return `https://storage.googleapis.com/${m[1]}/${m[2]}`
    }
    return uri
  }
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 px-4 py-3 space-y-4">
      {/* Palette swatches */}
      <div>
        <h4 className="text-xs font-semibold text-zinc-400 mb-2">Palette</h4>
        <div className="space-y-1.5">
          {(["primary", "accent", "forbidden"] as const).map((key) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 w-16 capitalize">{key}</span>
              <div className="flex gap-1">
                {vd.palette[key].map((hex: string) => (
                  <span
                    key={hex}
                    className="inline-flex items-center gap-1.5 rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300"
                  >
                    <span
                      className="inline-block w-3 h-3 rounded-sm border border-zinc-600"
                      style={{ backgroundColor: hex }}
                    />
                    {hex}
                  </span>
                ))}
                {vd.palette[key].length === 0 && (
                  <span className="text-xs text-zinc-600">none</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cinematography */}
      <div>
        <h4 className="text-xs font-semibold text-zinc-400 mb-1.5">
          Cinematography
        </h4>
        <div className="space-y-1 text-xs text-zinc-400">
          <p><span className="text-zinc-500">Style:</span> {vd.cinematography.style}</p>
          <p><span className="text-zinc-500">Movement:</span> {vd.cinematography.camera_movement}</p>
          <p><span className="text-zinc-500">Lighting:</span> {vd.cinematography.lighting}</p>
          <p><span className="text-zinc-500">Grade:</span> {vd.cinematography.color_grade}</p>
          <div>
            <span className="text-zinc-500">Shot types:</span>{" "}
            {vd.cinematography.preferred_shot_types.join(", ")}
          </div>
        </div>
      </div>

      {/* Ingredients */}
      <div>
        <h4 className="text-xs font-semibold text-zinc-400 mb-1.5">
          Ingredients ({vd.ingredients.length})
        </h4>
        {genError && (
          <div className="mb-2 rounded border border-red-800 bg-red-950/30 px-3 py-1.5 text-xs text-red-400">
            {genError}
            <button
              type="button"
              onClick={() => setGenError(null)}
              className="ml-2 text-zinc-500 hover:text-zinc-300"
            >
              ✕
            </button>
          </div>
        )}
        <div className="space-y-2">
          {vd.ingredients.map((ing) => (
            <div
              key={ing.ingredient_id}
              className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-zinc-300">
                  {ing.ingredient_id}
                </span>
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500">
                  {ing.type}
                </span>
                {ing.generated_reference_uri && (
                  <span className="rounded-full bg-green-950/50 px-1.5 py-0.5 text-xs text-green-400 border border-green-800">
                    ✓ Image
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mb-2">{ing.description}</p>

              {/* Reference image thumbnail */}
              {imgUrl(ing.generated_reference_uri) ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imgUrl(ing.generated_reference_uri)!}
                    alt={ing.description}
                    className="w-full rounded border border-zinc-700 object-cover"
                    style={{ maxHeight: "240px" }}
                  />
                </div>
              ) : ing.type !== "brand_asset" ? (
                <button
                  type="button"
                  onClick={() => handleGenerate(ing.ingredient_id)}
                  disabled={generating === ing.ingredient_id}
                  className="mt-1 rounded border border-zinc-600 bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:border-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {generating === ing.ingredient_id ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                      Generating…
                    </span>
                  ) : (
                    "🎨 Generate Image"
                  )}
                </button>
              ) : (
                <p className="text-xs text-zinc-600 italic">
                  Brand asset — uses uploaded logo, not AI generation
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Brand rules as prompts */}
      {vd.brand_rules_as_prompts.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-zinc-400 mb-1.5">
            Brand Prompts
          </h4>
          <ul className="list-inside list-disc space-y-0.5">
            {vd.brand_rules_as_prompts.map((p, i) => (
              <li key={i} className="text-xs text-zinc-400">{p}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function RunStatusPage() {
  const params = useParams<{ runId: string }>()
  const runId = params?.runId ?? ""

  const [data, setData] = useState<RunStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generatingTerritories, setGeneratingTerritories] = useState(false)
  const [generatingVisualDna, setGeneratingVisualDna] = useState(false)
  const [generatingDeck, setGeneratingDeck] = useState(false)
  const [reparsingBrief, setReparsingBrief] = useState(false)
  const [editBriefOpen, setEditBriefOpen] = useState(false)
  const [editBriefText, setEditBriefText] = useState("")

  const fetchStatus = useCallback(async () => {
    if (!runId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/run/${runId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to fetch run status")
      setData(json as RunStatus)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [runId])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Re-parse brief handler
  async function handleReparseBrief() {
    setReparsingBrief(true)
    setError(null)
    try {
      const brandRules = stagesData?.brief_parsing?.["_brandRules"] as Record<string, string> | undefined
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: editBriefText, brandRules, runId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Re-parse failed")
      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-parse failed")
    } finally {
      setReparsingBrief(false)
    }
  }

  // Generate Territories handler
  async function handleGenerateTerritories() {
    setGeneratingTerritories(true)
    setError(null)
    try {
      const res = await fetch("/api/territories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Territory generation failed")
      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Territory generation failed")
    } finally {
      setGeneratingTerritories(false)
    }
  }

  // Encode Visual DNA handler — calls API once per territory
  async function handleGenerateVisualDna() {
    setGeneratingVisualDna(true)
    setError(null)
    try {
      const territoriesData = data?.stages?.territory_generation?.["territories"] as TerritoryData[] | undefined
      if (!territoriesData || territoriesData.length === 0) {
        throw new Error("No territories found — run Stage 2 first")
      }
      for (const territory of territoriesData) {
        const res = await fetch("/api/visual-dna", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId, territory }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? `Visual DNA failed for ${territory.id}`)
      }
      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Visual DNA encoding failed")
    } finally {
      setGeneratingVisualDna(false)
    }
  }

  // Generate Deck handler
  async function handleGenerateDeck() {
    setGeneratingDeck(true)
    setError(null)
    try {
      const res = await fetch("/api/generate-deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Deck generation failed")
      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deck generation failed")
    } finally {
      setGeneratingDeck(false)
    }
  }

  // Auto-refresh every 10 seconds while pipeline is running
  useEffect(() => {
    const allComplete =
      data &&
      PIPELINE_STAGES.every((s) => stageStatus(data.stages[s.key]) === "complete") &&
      PIPELINE_GATES.every((g) => data.gates[g.key] != null)

    if (allComplete) return // Stop polling when everything is done

    const interval = setInterval(fetchStatus, 10_000)
    return () => clearInterval(interval)
  }, [data, fetchStatus])

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 rounded bg-zinc-800" />
          <div className="h-4 w-96 rounded bg-zinc-800" />
          <div className="space-y-2 pt-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-zinc-800" />
            ))}
          </div>
        </div>
      </main>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  if (error && !data) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
        <Link
          href="/"
          className="mt-4 inline-block text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          ← Back to brief input
        </Link>
      </main>
    )
  }

  // ── Empty (no runId) ──────────────────────────────────────────────────────

  if (!runId) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-zinc-400">No run ID provided.</p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          ← Back to brief input
        </Link>
      </main>
    )
  }

  const stagesData = data?.stages
  const gatesData = data?.gates
  const summary = data?.summary

  // Gates are locked until all stages complete
  const stagesComplete = stagesData
    ? PIPELINE_STAGES.every((s) => stageStatus(stagesData[s.key]) === "complete")
    : false
  const ecdPassed = gatesData?.ecd_approval != null
  const clientPassed = gatesData?.client_approval != null

  // Initialize edit brief text from stored raw brief when data loads
  useEffect(() => {
    const rawBrief = stagesData?.brief_parsing?.["_rawBrief"] as string | undefined
    if (rawBrief && !editBriefText) {
      setEditBriefText(rawBrief)
    }
  }, [stagesData, editBriefText])

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/"
          className="mb-3 inline-block text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          ← Back to brief input
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline Status</h1>
        <p className="mt-1 font-mono text-xs text-zinc-500">
          Run: {runId}
        </p>
        {summary && (
          <div className="mt-3 rounded-lg border border-green-800 bg-green-950/30 px-4 py-2">
            <p className="text-sm font-medium text-green-400">
              🚀 Pipeline complete — Flow package released
            </p>
          </div>
        )}
      </div>

      {/* Edit Brief panel */}
      {(stagesData?.brief_parsing?.["_rawBrief"] as string | undefined) && (
        <section className="mb-8">
          <button
            type="button"
            onClick={() => setEditBriefOpen(!editBriefOpen)}
            className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors mb-2"
          >
            <span>{editBriefOpen ? "▼" : "▶"}</span>
            Edit Brief
          </button>
          {editBriefOpen && (
            <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4 space-y-3">
              <textarea
                value={editBriefText}
                onChange={(e) => setEditBriefText(e.target.value)}
                rows={6}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none font-mono"
              />
              <button
                type="button"
                onClick={handleReparseBrief}
                disabled={reparsingBrief || !editBriefText.trim()}
                className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {reparsingBrief ? "Re-parsing…" : "Re-parse Brief"}
              </button>
            </div>
          )}
        </section>
      )}

      {/* Stages */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Stages
        </h2>
        <div className="space-y-2">
          {PIPELINE_STAGES.map((stage) => (
            <StageRow
              key={stage.key}
              label={stage.label}
              icon={stage.icon}
              status={
                stagesData
                  ? stageStatus(stagesData[stage.key])
                  : "pending"
              }
              data={stagesData?.[stage.key] ?? null}
              defaultOpen={false}
            />
          ))}
        </div>
      </section>

      {/* Pipeline triggers — buttons to advance each stage */}

      {/* Stage 2 trigger: Generate / Regenerate Territories */}
      {stagesData && stageStatus(stagesData["brief_parsing"]) === "complete" && (
        <section className="mb-8">
          <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 px-4 py-4">
            <p className="text-sm text-zinc-300 mb-3">
              {stageStatus(stagesData["territory_generation"]) === "complete"
                ? "Territories generated. Regenerate if you've edited the brief or want new variations."
                : "Brief parsed. Generate 3 creative territories to explore."}
            </p>
            <button
              type="button"
              onClick={handleGenerateTerritories}
              disabled={generatingTerritories}
              className="rounded-lg bg-zinc-100 px-6 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {generatingTerritories ? (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block w-3 h-3 border-2 border-zinc-600 border-t-transparent rounded-full animate-spin" />
                  Generating Territories…
                </span>
              ) : stageStatus(stagesData["territory_generation"]) === "complete" ? (
                "🔄 Regenerate Territories"
              ) : (
                "🎨 Generate Territories"
              )}
            </button>
          </div>
        </section>
      )}

      {/* Stage 3 trigger: Encode / Regenerate Visual DNA */}
      {stagesData && stageStatus(stagesData["territory_generation"]) === "complete" && (
        <section className="mb-8">
          <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 px-4 py-4">
            <p className="text-sm text-zinc-300 mb-3">
              {stageStatus(stagesData["visual_dna"]) === "complete"
                ? "Visual DNA encoded. Regenerate if you've edited territories or want refined results."
                : "3 territories generated. Encode Visual DNA for each territory (calls Gemini once per territory — 3 calls)."}
            </p>
            <button
              type="button"
              onClick={handleGenerateVisualDna}
              disabled={generatingVisualDna}
              className="rounded-lg bg-zinc-100 px-6 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {generatingVisualDna ? (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block w-3 h-3 border-2 border-zinc-600 border-t-transparent rounded-full animate-spin" />
                  Encoding Visual DNA…
                </span>
              ) : stageStatus(stagesData["visual_dna"]) === "complete" ? (
                "🔄 Regenerate Visual DNA"
              ) : (
                "🧬 Encode Visual DNA"
              )}
            </button>
          </div>
        </section>
      )}

      {/* Stage 4 trigger: Generate Deck — button + links */}
      {stagesData && stageStatus(stagesData["brief_parsing"]) === "complete" &&
        stageStatus(stagesData["territory_generation"]) === "complete" &&
        stageStatus(stagesData["visual_dna"]) === "complete" && (
        <section className="mb-8">
          {stageStatus(stagesData["output_generation"]) === "pending" ? (
            <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 px-4 py-4">
              <p className="text-sm text-zinc-300 mb-3">
                All prior stages complete. Generate the pre-production deck + Flow package.
              </p>
              <button
                type="button"
                onClick={handleGenerateDeck}
                disabled={generatingDeck}
                className="rounded-lg bg-zinc-100 px-6 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {generatingDeck ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block w-3 h-3 border-2 border-zinc-600 border-t-transparent rounded-full animate-spin" />
                    Generating Deck…
                  </span>
                ) : (
                  "📦 Generate Deck"
                )}
              </button>
            </div>
          ) : stagesData["output_generation"]?.["ecd_deck_url"] ? (
            <div className="rounded-lg border border-green-800 bg-green-950/30 px-4 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-green-400">Pre-Production Deck Ready</p>
                <button
                  type="button"
                  onClick={handleGenerateDeck}
                  disabled={generatingDeck}
                  className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-40"
                >
                  {generatingDeck ? "Regenerating…" : "🔄 Regenerate Deck"}
                </button>
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href={stagesData["output_generation"]["ecd_deck_url"] as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded bg-zinc-800 px-4 py-2 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors"
                >
                  📋 ECD Deck (Internal)
                </a>
                <a
                  href={stagesData["output_generation"]["client_deck_url"] as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded bg-zinc-800 px-4 py-2 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors"
                >
                  👁 Client Deck
                </a>
              </div>
              {(stagesData["output_generation"]["flow_package_public_url"] as string | null) && (
                <div>
                  <p className="text-xs text-zinc-400 mb-1">Flow Package</p>
                  <a
                    href={stagesData["output_generation"]["flow_package_public_url"] as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded bg-zinc-800 px-4 py-2 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors"
                  >
                    📦 Download Flow Package
                  </a>
                </div>
              )}
            </div>
          ) : null}
        </section>
      )}

      {/* Territory Cards (Stage 2 output) */}
      {stagesData?.territory_generation?.["territories"] != null && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Creative Territories
          </h2>
          <div className="space-y-3">
            {(
              stagesData.territory_generation["territories"] as TerritoryData[]
            ).map((t) => (
              <TerritoryCard key={t.id} territory={t} />
            ))}
          </div>
          {stagesData.territory_generation["divergenceWarnings"] != null &&
            (stagesData.territory_generation["divergenceWarnings"] as string[]).length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-800 bg-amber-950/30 px-4 py-2">
                <p className="text-xs font-medium text-amber-400">
                  ⚠ Divergence Warnings
                </p>
                <ul className="mt-1 list-inside list-disc text-xs text-amber-300">
                  {(stagesData.territory_generation["divergenceWarnings"] as string[]).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
        </section>
      )}

      {/* Visual DNA Panels (Stage 3 output) */}
      {stagesData?.visual_dna?.["territories"] != null && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Visual DNA
          </h2>
          <div className="space-y-6">
            {Object.entries(
              stagesData.visual_dna["territories"] as Record<string, VisualDNAData>
            ).map(([territoryId, vd]) => (
              <div key={territoryId}>
                <h3 className="mb-2 text-sm font-medium text-zinc-300">
                  {territoryId}
                </h3>
                <VisualDNAPanel vd={vd} runId={runId} territoryId={territoryId} onRefresh={fetchStatus} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Gates */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Approval Gates
        </h2>
        <div className="space-y-2">
          <GateRow
            label={PIPELINE_GATES[0].label}
            icon={PIPELINE_GATES[0].icon}
            data={gatesData?.ecd_approval ?? null}
            locked={false}
          />
          <GateRow
            label={PIPELINE_GATES[1].label}
            icon={PIPELINE_GATES[1].icon}
            data={gatesData?.client_approval ?? null}
            locked={!ecdPassed}
          />
        </div>

        {/* Approval form links */}
        {stagesData && stageStatus(stagesData["output_generation"]) === "complete" && (
          <div className="mt-3 flex flex-wrap gap-3">
            {!ecdPassed ? (
              <Link
                href={`/run/${runId}/approve/ecd`}
                className="rounded bg-zinc-800 px-4 py-2 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors"
              >
                ✅ ECD Approval Form
              </Link>
            ) : !clientPassed ? (
              <Link
                href={`/run/${runId}/approve/client`}
                className="rounded bg-zinc-800 px-4 py-2 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors"
              >
                🔒 Client Approval Form
              </Link>
            ) : null}
          </div>
        )}
      </section>

      {/* Git trace */}
      {data?.gitTrace && data.gitTrace.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Audit Trail
          </h2>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <pre className="overflow-x-auto font-mono text-xs text-zinc-400 whitespace-pre-wrap">
              {data.gitTrace.join("\n")}
            </pre>
          </div>
        </section>
      )}

      {/* Summary */}
      {summary && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Run Summary
          </h2>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <pre className="overflow-x-auto font-mono text-xs text-zinc-400 whitespace-pre-wrap">
              {JSON.stringify(summary, null, 2)}
            </pre>
          </div>
        </section>
      )}

      {/* Refresh button */}
      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          onClick={fetchStatus}
          disabled={loading}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-1.5 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors disabled:opacity-40"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
        <span className="text-xs text-zinc-600">
          {summary
            ? "Pipeline complete"
            : "Auto-refreshes every 10s while pipeline is running"}
        </span>
      </div>
    </main>
  )
}
