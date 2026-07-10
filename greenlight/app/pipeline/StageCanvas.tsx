"use client"

import { useCallback, useState, useEffect, useMemo, useRef } from "react"
import {
  ReactFlow, Background, Controls, useNodesState, useEdgesState,
  type Node, type Edge, type NodeTypes, MarkerType,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import PipelineNode from "./nodes/PipelineNode"
import SidePanel from "./SidePanel"
import type { CanvasNodeData, RunStatus } from "./types"

const nodeTypes: NodeTypes = { pipelineNode: PipelineNode }
const NW = 200; const NH = 90; const GX = 50; const GY = 36; const IMG_OFFSET = 160

function mk(id: string, label: string, icon: string, status: string, x: number, y: number, extra: Partial<CanvasNodeData> = {}): Node {
  return { id, type: "pipelineNode", position: { x, y }, data: { type: id, label, icon, status, stageData: null, gateData: null, generationCount: 0, isStale: false, runId: "", ...extra } as unknown as Record<string, unknown> }
}
function ce(source: string, target: string, color = "#52525b"): Edge {
  return { id: `e-${source}-${target}`, source, target, type: "smoothstep", animated: false, style: { stroke: color, strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color } }
}

// ── Reference image nodes (per-ingredient) ──────────────────────────────────

function buildReferenceNodes(runData: RunStatus, runId: string, layer3X: number): { nodes: Node[]; edges: Edge[] } {
  const vd = runData.stages.visual_dna?.["territories"] as Record<string, Record<string, unknown>> | undefined
  if (!vd) return { nodes: [], edges: [] }

  const nodes: Node[] = []; const edges: Edge[] = []
  const L_ING = layer3X         // Ingredient nodes
  let idx = 0
  for (const [tid, d] of Object.entries(vd)) {
    const ings = d["ingredients"] as Array<Record<string, unknown>> | undefined
    if (!ings) continue
    for (const ing of ings) {
      const iid = ing["ingredient_id"] as string
      const uris = (ing["generated_reference_uris"] as string[]) ?? []
      const y = 100 + idx * (NH + GY)

      // Ingredient node (char-1, loc-1, etc.)
      const ingId = `ing-${tid}-${iid}`
      nodes.push(mk(ingId, iid, ingTypeIcon(ing["type"] as string), "complete", L_ING, y,
        { stageData: ing as Record<string, unknown>, runId, type: "reference", territoryId: tid }))
      edges.push(ce(`vd-${tid}`, ingId, "#16a34a"))

      // Image nodes — offset from parent ingredient node
      uris.forEach((uri, imgIdx) => {
        const imgId = `img-${tid}-${iid}-${imgIdx}`
        const imgX = L_ING + IMG_OFFSET + imgIdx * IMG_OFFSET
        nodes.push(mk(imgId, "", "🖼", "complete", imgX, y,
          { stageData: { ...ing, generated_reference_uri: uri, imageNode: true } as Record<string, unknown>, runId, type: "reference", territoryId: tid }))
        edges.push(ce(ingId, imgId, "#16a34a"))
      })
      idx++
    }
  }
  return { nodes, edges }
}

function ingTypeIcon(type: string): string {
  switch (type) { case "character": return "👤"; case "location": return "📍"; case "object": return "📦"; case "brand_asset": return "🏷"; default: return "📎" }
}

// ── Tree layout: left-to-right with branching ───────────────────────────────

function buildGraph(runData: RunStatus | null, runId: string, triggered: Set<string>): { nodes: Node[]; edges: Edge[] } {
  if (!runData) return { nodes: [], edges: [] }
  const st = runData.stages; const nodes: Node[] = []; const edges: Edge[] = []
  const briefData = st.brief_parsing
  const terData = st.territory_generation
  const vdData = st.visual_dna
  const outData = st.output_generation
  const ecdGate = runData.gates.ecd_approval
  const clientGate = runData.gates.client_approval
  const summary = runData.summary

  // Column positions (X coordinates for each stage layer)
  const L0 = 50, L1 = L0 + NW + GX, L2 = L1 + NW + GX, L3 = L2 + NW + GX,
        L4 = L3 + NW + GX, L5 = L4 + NW + GX, L6 = L5 + NW + GX,
        L7 = L6 + NW + GX, L8 = L7 + NW + GX

  // Layer 0: Brief Input
  nodes.push(mk("brief_input", "Brief Input", "📝", briefData ? "complete" : "ready", L0, 200, { stageData: briefData as Record<string, unknown> | null, runId }))

  // Layer 1: Parsed Brief
  if (briefData) {
    nodes.push(mk("brief_parsed", "Parsed Brief", "📋", "complete", L1, 200, { stageData: briefData as Record<string, unknown> | null, runId, type: "brief_parsed" }))
    edges.push(ce("brief_input", "brief_parsed", "#16a34a"))
  }

  // Layer 2: Territories (branching — multiple rows)
  const territories = terData?.["territories"] as Array<Record<string, unknown>> | undefined
  const hasRealTerritories = Array.isArray(territories) && territories.length > 0
  const showTerritories = triggered.has("territories") || hasRealTerritories

  if (showTerritories && hasRealTerritories) {
    const totalH = territories.length * (NH + GY) - GY
    const startY = 200 - totalH / 2
    territories.forEach((t, i) => {
      const y = startY + i * (NH + GY)
      const n = mk(`territory-${i}`, (t["name"] as string) ?? `T${i+1}`, "🎨", "complete", L2, y,
        { stageData: t as Record<string, unknown>, runId, type: "territory", territoryId: t["id"] as string })
      nodes.push(n)
      if (briefData) edges.push(ce("brief_parsed", `territory-${i}`, "#16a34a"))
    })
  }

  // Layer 3: Visual DNA (one per territory)
  const hasRealVD = !!(vdData?.["territories"]) && Object.keys(vdData["territories"] as object).length > 0
  const showVD = triggered.has("visual_dna") || hasRealVD

  if (showVD && hasRealVD) {
    const vdMap = vdData!["territories"] as Record<string, Record<string, unknown>>
    const entries = Object.entries(vdMap)
    entries.forEach(([tid, vd], i) => {
      const terNode = nodes.find(n => n.id === `territory-${i}`)
      const y = terNode?.position.y ?? 200 + i * (NH + GY)
      const n = mk(`vd-${tid}`, tid, "🧬", "complete", L3, y,
        { stageData: { ...vd, territory_id: tid } as Record<string, unknown>, runId, type: "visual_dna", territoryId: tid })
      nodes.push(n)
      const parentId = terNode?.id ?? `territory-${i}`
      if (nodes.some(nn => nn.id === parentId)) edges.push(ce(parentId, `vd-${tid}`, "#16a34a"))
    })
  }

  // Layer 4: References (per-ingredient image nodes)
  const { nodes: refNodes, edges: refEdges } = buildReferenceNodes(runData, runId, L4)
  nodes.push(...refNodes); edges.push(...refEdges)

  // Layer 5: Deck
  const hasRealDeck = !!(outData?.["ecd_deck_url"] || outData?.["_deckCopy"])
  const showDeck = triggered.has("deck") || hasRealDeck

  if (showDeck && hasRealDeck) {
    const vdNodes = nodes.filter(n => n.id.startsWith("vd-"))
    const avgY = vdNodes.length ? vdNodes.reduce((s, n) => s + n.position.y, 0) / vdNodes.length : 200
    nodes.push(mk("deck_out", "Deck", "📦", "complete", L5, avgY, { stageData: outData as Record<string, unknown> | null, runId, type: "deck" }))
    vdNodes.forEach(n => edges.push(ce(n.id, "deck_out", "#a3a3a3")))
    refNodes.forEach(n => edges.push(ce(n.id, "deck_out", "#a3a3a3")))
  }

  // Layer 6-8: Gates
  const showGates = triggered.has("gates") || hasRealDeck
  if (showGates) {
    const gy = 200 - NH - GY
    const n1 = mk("gate_ecd", "ECD Gate", "✅", ecdGate ? "complete" : "ready", L6, gy, { gateData: ecdGate as Record<string, unknown> | null, runId, type: "ecd_gate" })
    const n2 = mk("gate_client", "Client Gate", "🔒", clientGate ? "complete" : ecdGate ? "ready" : "pending", L7, gy, { gateData: clientGate as Record<string, unknown> | null, runId, type: "client_gate" })
    nodes.push(n1, n2)
    edges.push(ce("deck_out", "gate_ecd", hasRealDeck ? "#16a34a" : "#52525b"))
    edges.push(ce("gate_ecd", "gate_client", ecdGate ? "#16a34a" : "#52525b"))
    if (summary) {
      const n3 = mk("flow_release", "Release", "🚀", "complete", L8, gy, { runId, type: "flow_release" })
      nodes.push(n3)
      edges.push(ce("gate_client", "flow_release", "#16a34a"))
    }
  }

  return { nodes, edges }
}

// ── Action label ────────────────────────────────────────────────────────────

function getAction(stageId: string, runData: RunStatus | null): string | null {
  if (!runData) return null
  const st = runData.stages
  switch (stageId) {
    case "brief": return null
    case "territories": return st.territory_generation ? "🔄 Regenerate Territories" : "✅ Approve & Generate Territories"
    case "visual_dna": return st.visual_dna ? "🔄 Regenerate Visual DNA" : "🧬 Encode Visual DNA"
    case "references": return st.visual_dna ? "🎨 Generate Reference Images" : null
    case "deck": return st.output_generation ? "🔄 Regenerate Deck" : "📦 Generate Deck"
    case "gates": return null
    default: return null
  }
}

// ── Component ───────────────────────────────────────────────────────────────

interface Props { stageId: string; runId: string; runData: RunStatus | null; loading: boolean; error: string | null; onRefresh: () => void; onAdvance?: () => void }

export default function StageCanvas({ stageId, runId, runData, loading, error, onRefresh, onAdvance }: Props) {
  const [triggered, setTriggered] = useState<Set<string>>(new Set())
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const { nodes: rawNodes, edges: rawEdges } = useMemo(
    () => buildGraph(runData, runId, triggered), [runData, runId, triggered])
  const actionLabel = useMemo(() => getAction(stageId, runData), [stageId, runData])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const hasDragged = useRef(false)

  // Load saved positions from localStorage
  const savedPositions = useMemo(() => {
    if (typeof window === "undefined") return {}
    try { return JSON.parse(localStorage.getItem(`gl_pos_${runId}`) ?? "{}") as Record<string, {x:number;y:number}> }
    catch { return {} }
  }, [runId])

  // Sync: only ADD new nodes/edges. Never reposition existing nodes.
  const nodeIds = useMemo(() => (rawNodes as Node[]).map(n => n.id).join(","), [rawNodes])
  const prevIds = useRef("")
  useEffect(() => {
    if (nodeIds === prevIds.current) return
    prevIds.current = nodeIds
    setNodes((prev) => {
      const rawMap = new Map((rawNodes as Node[]).map(n => [n.id, n]))
      const prevMap = new Map(prev.map(n => [n.id, n]))
      const result: Node[] = []
      // Keep existing nodes that still exist in rawNodes (don't touch their positions)
      for (const pn of prev) {
        if (rawMap.has(pn.id)) result.push(pn)
      }
      // Add new nodes, positioning image nodes relative to their parent ingredient
      for (const rn of (rawNodes as Node[])) {
        if (!prevMap.has(rn.id)) {
          const saved = savedPositions[rn.id]
          if (saved) { rn.position = saved; result.push(rn); continue }
          // For image nodes (img-*), offset from parent ingredient (ing-*)
          const imgMatch = rn.id.match(/^img-(.+?)-(.+?)-(\d+)$/)
          if (imgMatch) {
            const ingId = `ing-${imgMatch[1]}-${imgMatch[2]}`
            const parent = result.find(n => n.id === ingId) ?? prevMap.get(ingId)
            if (parent) {
              const imgIdx = parseInt(imgMatch[3]!)
              rn.position = { x: parent.position.x + IMG_OFFSET + imgIdx * IMG_OFFSET, y: parent.position.y }
            }
          }
          result.push(rn)
        }
      }
      return result
    })
    setEdges(rawEdges as Edge[])
  }, [nodeIds, savedPositions, rawNodes, rawEdges, setNodes, setEdges]) // eslint-disable-line

  // Track drag + save positions to localStorage
  const handleNodesChange: typeof onNodesChange = useCallback((changes) => {
    const isDragging = changes.some(c => c.type === "position" && c.dragging)
    const dragEnd = changes.some(c => c.type === "position" && !c.dragging)
    if (isDragging) hasDragged.current = true
    if (dragEnd) {
      // Save all node positions to localStorage
      const allPositions: Record<string, {x:number;y:number}> = {}
      nodes.forEach(n => { allPositions[n.id] = n.position })
      try { localStorage.setItem(`gl_pos_${runId}`, JSON.stringify(allPositions)) } catch {}
    }
    onNodesChange(changes)
  }, [onNodesChange, nodes, runId])

  const onNodeClick = useCallback((_e: React.MouseEvent, n: Node) => { setSelectedNodeId(n.id) }, [])
  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null
  const selectedNodeData = selectedNode?.data as unknown as CanvasNodeData | null

  async function handleAction() {
    if (!actionLabel || actionLoading) return; setActionLoading(true)
    try {
      switch (stageId) {
        case "territories": {
          const r = await fetch("/api/territories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId }) })
          if (!r.ok) throw new Error((await r.json()).error); break
        }
        case "visual_dna": {
          const r = await fetch(`/api/run/${runId}`); const d = await r.json()
          const ter = d.stages?.territory_generation?.territories as Array<Record<string, unknown>> | undefined
          if (ter) for (const t of ter) await fetch("/api/visual-dna", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId, territory: t }) })
          break
        }
        case "references": {
          const r = await fetch(`/api/run/${runId}`); const d = await r.json()
          const vd = d.stages?.visual_dna?.territories as Record<string, Record<string, unknown>> | undefined
          if (vd) for (const [tid, v] of Object.entries(vd)) {
            const ids = (v["ingredients"] as Array<{ ingredient_id: string; type: string }> | undefined)?.filter(i => i.type !== "brand_asset").map(i => i.ingredient_id) ?? []
            if (ids.length) await fetch("/api/generate-references", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId, territoryId: tid, ingredientIds: ids, source: "comfyui", workflow: "image_ideogram4_t2i" }) })
          }
          break
        }
        case "deck": {
          const r = await fetch("/api/generate-deck", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId }) })
          if (!r.ok) throw new Error((await r.json()).error); break
        }
      }
      setTriggered(prev => new Set([...prev, stageId])); onRefresh()
    } catch (e) { console.error(stageId, "failed:", e) }
    finally { setActionLoading(false) }
  }

  if (loading) return <div className="flex-1 flex items-center justify-center bg-zinc-950"><p className="text-sm text-zinc-500">Loading…</p></div>
  if (error) return <div className="flex-1 flex items-center justify-center bg-zinc-950"><p className="text-sm text-red-400">{error}<button onClick={onRefresh} className="ml-3 rounded bg-zinc-800 px-3 py-1.5 text-xs">Retry</button></p></div>

  return (
    <div className="flex-1 flex flex-col">
      {actionLabel && (
        <div className="flex items-center justify-center py-3 px-4 border-b border-zinc-800 bg-zinc-900/50 shrink-0">
          <button onClick={handleAction} disabled={actionLoading}
            className="rounded-lg bg-white px-6 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-40 transition-colors">
            {actionLoading ? "Working…" : actionLabel}
          </button>
        </div>
      )}
      <div className="flex-1 flex">
        <div className="flex-1">
          <ReactFlow
            nodes={nodes} edges={edges} nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange} onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick} onPaneClick={() => setSelectedNodeId(null)}
            nodesDraggable selectNodesOnDrag
            minZoom={0.15} maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#18181b" gap={20} />
            <Controls className="[&>button]:!bg-zinc-900 [&>button]:!border-zinc-700 [&>button]:!text-zinc-400" position="bottom-left" />
          </ReactFlow>
        </div>
        {selectedNode && selectedNodeData && (
          <SidePanel nodeId={selectedNode.id} nodeData={selectedNodeData} runId={runId} onClose={() => setSelectedNodeId(null)} onRefresh={onRefresh} {...(onAdvance !== undefined && { onAdvance })} />
        )}
      </div>
    </div>
  )
}
