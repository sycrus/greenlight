/**
 * Manual left-to-right layout for pipeline nodes.
 */

import type { PipelineStageConfig } from "./types"

const NODE_WIDTH = 220
const NODE_GAP = 56
const PADDING_X = 48
const CENTER_Y = 280

export const PIPELINE_CONFIG: PipelineStageConfig[] = [
  { id: "brief_input", label: "Brief Input", icon: "📝", stageKey: "brief_parsing" },
  { id: "brief_parsing", label: "Brief Parsing", icon: "📋", stageKey: "brief_parsing" },
  { id: "territory_generation", label: "Territories", icon: "🎨", stageKey: "territory_generation" },
  { id: "visual_dna", label: "Visual DNA", icon: "🧬", stageKey: "visual_dna" },
  { id: "reference_images", label: "References", icon: "🖼", stageKey: "visual_dna" },
  { id: "deck_generation", label: "Deck", icon: "📦", stageKey: "output_generation" },
  { id: "ecd_gate", label: "ECD Gate", icon: "✅", gateKey: "ecd_approval" },
  { id: "client_gate", label: "Client Gate", icon: "🔒", gateKey: "client_approval" },
  { id: "flow_release", label: "Release", icon: "🚀" },
]

export const NODE_POSITIONS: Record<string, { x: number; y: number }> = {}
PIPELINE_CONFIG.forEach((cfg, i) => {
  NODE_POSITIONS[cfg.id] = {
    x: PADDING_X + i * (NODE_WIDTH + NODE_GAP),
    y: CENTER_Y,
  }
})

/** Downstream DAG — which stages are invalidated when a given stage regenerates. */
const DOWNSTREAM: Record<string, string[]> = {
  brief_input: ["brief_parsing", "territory_generation", "visual_dna", "reference_images", "deck_generation", "ecd_gate", "client_gate", "flow_release"],
  brief_parsing: ["territory_generation", "visual_dna", "reference_images", "deck_generation"],
  territory_generation: ["visual_dna", "reference_images", "deck_generation"],
  visual_dna: ["reference_images", "deck_generation"],
  reference_images: ["deck_generation"],
  deck_generation: ["ecd_gate", "client_gate", "flow_release"],
  ecd_gate: ["client_gate", "flow_release"],
  client_gate: ["flow_release"],
  flow_release: [],
}

export function getDownstreamStages(nodeId: string): string[] {
  return DOWNSTREAM[nodeId] ?? []
}
