"use client"

import { memo, useCallback, useEffect, useRef, useState } from "react"
import { Handle, Position, useStoreApi, type NodeProps } from "@xyflow/react"
import type { CanvasNodeData } from "../types"

// ── NodeSummary ──────────────────────────────────────────────────────────────

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
      return <p className="text-zinc-500">{typeof raw === "string" ? raw : "—"}</p>
    }
    case "brief_parsing":
    case "brief_parsed": {
      const brand = stageData?.["brand"]
      const score = stageData?.["confidence_score"] as number | undefined
      return <div className="space-y-0.5">{brand ? <p>{String(brand)}</p> : null}{score != null && <p className="text-zinc-500">Confidence: {(score * 100).toFixed(0)}%</p>}</div>
    }
    case "territory_generation": {
      const territories = stageData?.["territories"] as Array<{ name: string }> | undefined
      return <div className="space-y-0.5">{territories?.map((t, i) => <p key={i}>{t.name}</p>) ?? <span className="text-zinc-600">—</span>}</div>
    }
    case "territory": {
      const name = stageData?.["name"]
      const prop = stageData?.["creative_proposition"]
      return <div className="space-y-0.5"><p className="font-medium">{typeof name === "string" ? name : "—"}</p>{prop ? <p className="text-zinc-500">{String(prop)}</p> : null}</div>
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
      if (imgSrc) return <div className="space-y-1"><p>{String(desc ?? "")}</p><p className="text-green-500 text-[10px]">✓ Image</p></div>
      if (desc) return <div className="space-y-0.5"><p>{String(desc)}</p><p className="text-zinc-500">—</p></div>
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

// ── Constants ────────────────────────────────────────────────────────────────

const BORDER_COLORS: Record<string, string> = { complete: "border-green-800", ready: "border-blue-800", running: "border-amber-800", pending: "border-zinc-700", stale: "border-amber-700", error: "border-red-800" }
const STATUS_BADGES: Record<string, { label: string; className: string }> = { complete: { label: "Done", className: "bg-green-950/50 text-green-400 border-green-800" }, ready: { label: "Ready", className: "bg-blue-950/50 text-blue-400 border-blue-800" }, running: { label: "Running", className: "bg-amber-950/50 text-amber-400 border-amber-800" }, pending: { label: "Pending", className: "bg-zinc-800 text-zinc-500 border-zinc-700" }, stale: { label: "Stale", className: "bg-amber-950/50 text-amber-400 border-amber-800" }, error: { label: "Error", className: "bg-red-950/50 text-red-400 border-red-800" } }

const MIN_W = 220
const MAX_W = 700
const MIN_H = 80
const MAX_H = 600
const EDGE = 6 // px — thickness of resize hit zones at edges

type ResizeDir = "e" | "s" | "se" | null

// ── PipelineNode ─────────────────────────────────────────────────────────────

function PipelineNode({ data, selected }: NodeProps) {
  const d = data as unknown as CanvasNodeData
  const status = (d.status as string) ?? "pending"
  const border = BORDER_COLORS[status] ?? "border-zinc-700"
  const badge = STATUS_BADGES[status] ?? STATUS_BADGES["pending"]!

  const store = useStoreApi()
  const ref = useRef<HTMLDivElement>(null)
  const [resizing, setResizing] = useState<ResizeDir>(null)
  const [w, setW] = useState(260)       // current node width
  const [h, setH] = useState<number | null>(null) // null = auto height
  const anchor = useRef({ mx: 0, my: 0, w: 0, h: 0 })

  const begin = useCallback((dir: ResizeDir) => (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    anchor.current = { mx: e.clientX, my: e.clientY, w: r.width, h: r.height }
    setResizing(dir)
  }, [])

  useEffect(() => {
    if (!resizing) return
    const onMove = (e: MouseEvent) => {
      const z = store.getState().transform[2] // zoom
      const dx = (e.clientX - anchor.current.mx) / z
      const dy = (e.clientY - anchor.current.my) / z
      if (resizing === "e" || resizing === "se") setW(clamp(anchor.current.w + dx, MIN_W, MAX_W))
      if (resizing === "s" || resizing === "se") setH(clamp(anchor.current.h + dy, MIN_H, MAX_H))
    }
    const onUp = () => setResizing(null)
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
  }, [resizing, store])

  const cursor = resizing ? (resizing === "e" ? "ew-resize" : resizing === "s" ? "ns-resize" : "nwse-resize") : undefined

  return (
    <div
      ref={ref}
      className={`rounded-lg border bg-zinc-900/50 p-1.5 shadow-lg relative overflow-hidden ${resizing ? "nodrag" : ""} ${border} ${status === "ready" ? "animate-pulse" : ""} ${selected ? "ring-1 ring-white/20" : ""}`}
      style={{ width: w, minWidth: MIN_W, maxWidth: MAX_W, minHeight: MIN_H, maxHeight: MAX_H, ...(h !== null && { height: h }), ...(cursor !== undefined && { cursor }) }}
    >
      <Handle type="target" position={Position.Left} className="!bg-zinc-600" />

      {/* Resize hit zones — always present on node edges. nodrag prevents React Flow from moving the node. */}
      {!resizing && (
        <>
          <div className="nodrag absolute top-0 right-0 bottom-0 z-20 cursor-ew-resize" style={{ width: EDGE }} onMouseDown={begin("e")} />
          <div className="nodrag absolute bottom-0 left-0 right-0 z-20 cursor-ns-resize" style={{ height: EDGE }} onMouseDown={begin("s")} />
          <div className="nodrag absolute bottom-0 right-0 z-20 cursor-nwse-resize" style={{ width: EDGE + 4, height: EDGE + 4 }} onMouseDown={begin("se")} />
        </>
      )}

      <div className="flex items-center gap-1 mb-1">
        <span className="text-xs shrink-0">{d.icon as string}</span>
        <span className="text-[11px] font-medium text-zinc-200 flex-1">{d.label as string}</span>
        <span className={`rounded-full px-1 py-0 text-[8px] border shrink-0 ${badge.className}`}>{badge.label}</span>
      </div>
      <div className="text-[10px] text-zinc-400 leading-relaxed whitespace-normal break-words">
        <NodeSummary type={d.type as string} stageData={d.stageData as Record<string, unknown> | null} gateData={d.gateData as Record<string, unknown> | null} />
      </div>
      {(d.isStale as boolean) && <div className="mt-2 rounded bg-amber-950/30 px-2 py-1 text-[10px] text-amber-400 border border-amber-800/50">⚠ Stale — upstream changed</div>}
      <Handle type="source" position={Position.Right} className="!bg-zinc-600" />
    </div>
  )
}

function clamp(v: number, lo: number, hi: number) { return v < lo ? lo : v > hi ? hi : v }

export default memo(PipelineNode)
