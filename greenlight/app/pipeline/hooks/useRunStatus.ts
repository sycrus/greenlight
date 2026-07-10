/**
 * useRunStatus — fetches run data and transforms it into React Flow nodes + edges.
 */

"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import type { Node, Edge } from "@xyflow/react"
import { PIPELINE_CONFIG, NODE_POSITIONS } from "../layout"
import { buildEdges } from "../edges"
import type { CanvasNodeData, RunStatus, NodeStatus } from "../types"

function getGenerationCount(stageData: Record<string, unknown> | null): number {
  if (!stageData) return 0
  const gens = stageData["_generations"] as Array<unknown> | undefined
  return gens?.length ?? 0
}

function deriveNodeStatus(
  nodeId: string,
  data: RunStatus
): NodeStatus {
  const stages = data.stages
  const gates = data.gates

  // Gates and terminal
  if (nodeId === "ecd_gate") {
    if (!stages.output_generation) return "pending"
    return gates.ecd_approval ? "complete" : "ready"
  }
  if (nodeId === "client_gate") {
    if (!gates.ecd_approval) return "pending"
    return gates.client_approval ? "complete" : "ready"
  }
  if (nodeId === "flow_release") {
    return data.summary ? "complete" : (gates.client_approval ? "ready" : "pending")
  }

  // Stage nodes
  if (nodeId === "brief_input") {
    return stages.brief_parsing ? "complete" : "pending"
  }
  if (nodeId === "brief_parsing") {
    return stages.brief_parsing ? "complete" : "pending"
  }
  if (nodeId === "territory_generation") {
    if (!stages.brief_parsing) return "pending"
    return stages.territory_generation ? "complete" : "ready"
  }
  if (nodeId === "visual_dna") {
    if (!stages.territory_generation) return "pending"
    return stages.visual_dna ? "complete" : "ready"
  }
  if (nodeId === "reference_images") {
    if (!stages.visual_dna) return "pending"
    // Check if any ingredients have generated references
    const vd = stages.visual_dna
    const territories = vd?.["territories"] as Record<string, Record<string, unknown>> | undefined
    if (!territories) return "ready"
    let hasImages = false
    for (const [, v] of Object.entries(territories)) {
      const ings = v["ingredients"] as Array<Record<string, unknown>> | undefined
      if (ings?.some((i) => i["generated_reference_uri"])) { hasImages = true; break }
    }
    return hasImages ? "complete" : "ready"
  }
  if (nodeId === "deck_generation") {
    if (!stages.visual_dna) return "pending"
    return stages.output_generation ? "complete" : "ready"
  }

  return "pending"
}

export function useRunStatus(runId: string) {
  const [data, setData] = useState<RunStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!runId) return
    try {
      const res = await fetch(`/api/run/${runId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to fetch run status")
      setData(json as RunStatus)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [runId])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Auto-refresh every 10s while pipeline is running
  useEffect(() => {
    if (!data) return
    const allComplete =
      data.stages.output_generation &&
      data.gates.ecd_approval &&
      data.gates.client_approval
    if (allComplete) return

    const interval = setInterval(fetchStatus, 10_000)
    return () => clearInterval(interval)
  }, [data, fetchStatus])

  const nodes: Node[] = useMemo(() => {
    if (!data) return []
    return PIPELINE_CONFIG.map((cfg) => {
      const stageData = cfg.stageKey ? data.stages[cfg.stageKey as keyof typeof data.stages] : null
      const gateData = cfg.gateKey ? data.gates[cfg.gateKey as keyof typeof data.gates] : null

      return {
        id: cfg.id,
        type: "pipelineNode",
        position: NODE_POSITIONS[cfg.id] ?? { x: 0, y: 0 },
        data: {
          type: cfg.id,
          label: cfg.label,
          icon: cfg.icon,
          status: deriveNodeStatus(cfg.id, data),
          stageData: stageData as Record<string, unknown> | null,
          gateData: gateData as Record<string, unknown> | null,
          generationCount: getGenerationCount(stageData as Record<string, unknown> | null),
          isStale: (stageData as Record<string, unknown> | null)?.["_stale"] === true,
          runId,
        } as unknown as Record<string, unknown>,
      }
    })
  }, [data, runId])

  const edges: Edge[] = useMemo(() => {
    if (!data) return []
    const statuses: Record<string, { isComplete: boolean; isStale: boolean }> = {}
    for (const node of nodes) {
      const nd = node.data as unknown as CanvasNodeData
      statuses[node.id] = {
        isComplete: nd.status === "complete",
        isStale: nd.isStale,
      }
    }
    return buildEdges(statuses)
  }, [data, nodes])

  return { nodes, edges, runData: data, loading, error, refresh: fetchStatus }
}
