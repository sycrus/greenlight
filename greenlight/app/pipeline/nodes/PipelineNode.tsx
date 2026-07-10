"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import type { CanvasNodeData } from "../types"

function NodeSummary({ type, stageData, gateData }: {
  type: string
  stageData: Record<string, unknown> | null
  gateData: Record<string, unknown> | null
}) {
  if (!stageData && !gateData) {
    return <span className="text-zinc-600">No data yet</span>
  }
  switch (type) {
    case "brief_input": {
      const raw = stageData?.["_rawBrief"]
      return <p className="text-zinc-500 truncate">{typeof raw === "string" ? raw.slice(0, 60) + "…" : "—"}</p>
    }
    case "brief_parsing":
    case "brief_parsed": {
      const brand = stageData?.["brand"]
      const score = stageData?.["confidence_score"] as number | undefined
      return <div className="space-y-0.5">{brand ? <p>{String(brand)}</p> : null}{score != null && <p className="text-zinc-500">Confidence: {(score * 100).toFixed(0)}%</p>}</div>
    }
    case "territory_generation": {
      const territories = stageData?.["territories"] as Array<{ name: string }> | undefined
      return <div className="space-y-0.5">{territories?.map((t, i) => <p key={i} className="truncate">{t.name}</p>) ?? <span className="text-zinc-600">—</span>}</div>
    }
    case "territory": {
      const name = stageData?.["name"]
      const prop = stageData?.["creative_proposition"]
      return <div className="space-y-0.5"><p className="font-medium">{typeof name === "string" ? name : "—"}</p>{prop ? <p className="text-zinc-500 truncate">{String(prop).slice(0, 50)}</p> : null}</div>
    }
    case "visual_dna": {
      const palette = stageData?.["palette"] as { primary: string[]; accent: string[] } | undefined
      if (palette) {
        return <div className="space-y-0.5"><p className="text-zinc-500">{stageData?.["territory_id"] as string}</p><div className="flex gap-0.5">{palette.primary.slice(0, 3).map((h: string) => <span key={h} className="inline-block w-3 h-3 rounded-sm" style={{ background: h }} />)}</div></div>
      }
      const td = stageData?.["territories"] as Record<string, unknown> | undefined
      return <p>{td ? Object.keys(td).length : 0} Visual DNAs</p>
    }
    case "reference_images":
    case "reference": {
      const uri = stageData?.["generated_reference_uri"] as string | undefined | null
      const refUri = stageData?.["reference_image_uri"] as string | undefined | null
      const imgSrc = imgNodeUrl(uri ?? refUri)
      const isImageNode = stageData?.["imageNode"] === true
      const desc = stageData?.["description"] as string | undefined
      if (imgSrc && isImageNode) {
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgSrc} alt={desc ?? ""} className="w-full rounded border border-zinc-700 object-cover" style={{ maxHeight: 100 }} />
        )
      }
      if (imgSrc) return <div className="space-y-1"><p className="truncate">{String(desc ?? "").slice(0, 40)}</p><p className="text-green-500 text-[10px]">✓ Image</p></div>
      if (desc) return <div className="space-y-0.5"><p className="truncate">{String(desc).slice(0, 50)}</p><p className="text-zinc-500">—</p></div>
      return <p>Reference</p>
    }
    case "deck_generation":
    case "deck": {
      return <p>{stageData?.["ecd_deck_url"] ? "Deck ready" : "Not generated"}</p>
    }
    case "ecd_gate":
    case "client_gate": {
      const status = gateData?.["approvalStatus"] as string | undefined
      const territory = gateData?.["territorySelected"] as string | undefined
      return <div className="space-y-0.5">{status ? <p className="font-medium">{statusLabel(status)}</p> : <span className="text-zinc-600">Awaiting</span>}{territory && <p className="text-zinc-500">Territory: {territory}</p>}</div>
    }
    case "flow_release": return <p className="text-green-400">Pipeline complete</p>
    default: return null
  }
}

function statusLabel(status: string): string {
  switch (status) { case "APPROVED": return "Approved"; case "APPROVED_WITH_NOTES": return "Approved w/ notes"; case "APPROVED_WITH_REVISIONS": return "Approved w/ revisions"; case "REVISIONS_REQUIRED": return "Revisions required"; default: return status }
}

function imgNodeUrl(uri: string | null | undefined): string | null {
  if (!uri) return null
  if (uri.startsWith("https://") || uri.startsWith("http://") || uri.startsWith("/")) return uri
  if (uri.startsWith("gs://")) { const m = uri.match(/^gs:\/\/([^\/]+)\/(.+)$/); if (m) return `https://storage.googleapis.com/${m[1]}/${m[2]}` }
  return uri
}

const BORDER_COLORS: Record<string, string> = { complete: "border-green-800", ready: "border-blue-800", running: "border-amber-800", pending: "border-zinc-700", stale: "border-amber-700", error: "border-red-800" }
const STATUS_BADGES: Record<string, { label: string; className: string }> = { complete: { label: "Done", className: "bg-green-950/50 text-green-400 border-green-800" }, ready: { label: "Ready", className: "bg-blue-950/50 text-blue-400 border-blue-800" }, running: { label: "Running", className: "bg-amber-950/50 text-amber-400 border-amber-800" }, pending: { label: "Pending", className: "bg-zinc-800 text-zinc-500 border-zinc-700" }, stale: { label: "Stale", className: "bg-amber-950/50 text-amber-400 border-amber-800" }, error: { label: "Error", className: "bg-red-950/50 text-red-400 border-red-800" } }

function PipelineNode({ data, selected }: NodeProps) {
  const d = data as unknown as CanvasNodeData
  const status = (d.status as string) ?? "pending"
  const border = BORDER_COLORS[status] ?? "border-zinc-700"
  const badge = STATUS_BADGES[status] ?? STATUS_BADGES["pending"]!
  return <div className={`rounded-lg border bg-zinc-900/50 p-1.5 min-w-[160px] max-w-[400px] shadow-lg resize overflow-auto ${border} ${status === "ready" ? "animate-pulse" : ""} ${selected ? "ring-1 ring-white/20" : ""}`}>
    <Handle type="target" position={Position.Left} className="!bg-zinc-600" />
    <div className="flex items-center gap-1 mb-1">
      <span className="text-xs">{d.icon as string}</span>
      <span className="text-[11px] font-medium text-zinc-200 truncate flex-1">{d.label as string}</span>
      <span className={`rounded-full px-1 py-0 text-[8px] border shrink-0 ${badge.className}`}>{badge.label}</span>
    </div>
    <div className="text-[10px] text-zinc-400 leading-tight min-h-[12px]">
      <NodeSummary type={d.type as string} stageData={d.stageData as Record<string, unknown> | null} gateData={d.gateData as Record<string, unknown> | null} />
    </div>
    {(d.isStale as boolean) && <div className="mt-2 rounded bg-amber-950/30 px-2 py-1 text-[10px] text-amber-400 border border-amber-800/50">⚠ Stale — upstream changed</div>}
    <Handle type="source" position={Position.Right} className="!bg-zinc-600" />
  </div>
}

export default memo(PipelineNode)
