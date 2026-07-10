/**
 * Edge definitions for the pipeline. Conditional styling based on status.
 */

import type { Edge } from "@xyflow/react"

const BASE_EDGES: Array<{ source: string; target: string }> = [
  { source: "brief_input", target: "brief_parsing" },
  { source: "brief_parsing", target: "territory_generation" },
  { source: "territory_generation", target: "visual_dna" },
  { source: "visual_dna", target: "reference_images" },
  { source: "reference_images", target: "deck_generation" },
  { source: "deck_generation", target: "ecd_gate" },
  { source: "ecd_gate", target: "client_gate" },
  { source: "client_gate", target: "flow_release" },
]

interface StageStatus {
  isComplete: boolean
  isStale: boolean
}

export function buildEdges(statuses: Record<string, StageStatus>): Edge[] {
  return BASE_EDGES.map((e, i) => {
    const sourceStatus = statuses[e.source]
    const targetStatus = statuses[e.target]

    const sourceOk = sourceStatus?.isComplete ?? false
    const targetStale = targetStatus?.isStale ?? false

    let stroke = "#3f3f46" // zinc-700 (pending)
    let animated = false
    let strokeDasharray: string | undefined

    if (sourceOk && !targetStale) {
      stroke = "#166534" // green-700 (complete path)
    } else if (sourceOk && targetStale) {
      stroke = "#92400e" // amber-700 (stale downstream)
      animated = true
      strokeDasharray = "6 4"
    }

    return {
      id: `e-${e.source}-${e.target}-${i}`,
      source: e.source,
      target: e.target,
      type: "smoothstep" as const,
      animated,
      style: { stroke, strokeWidth: 2, strokeDasharray },
    }
  })
}
