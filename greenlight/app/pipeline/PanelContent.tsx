/**
 * PanelContent — routes to the correct panel component based on node type.
 */

"use client"

import { useState } from "react"
import type { CanvasNodeData } from "./types"
import BriefEditPanel from "./panel-content/BriefEditPanel"
import BriefParsingPanel from "./panel-content/BriefParsingPanel"
import TerritoryPanel from "./panel-content/TerritoryPanel"
import VisualDnaPanelContent from "./panel-content/VisualDnaPanelContent"
import ReferencesPanel from "./panel-content/ReferencesPanel"
import DeckPanel from "./panel-content/DeckPanel"
import GatePanel from "./panel-content/GatePanel"
import FlowReleasePanel from "./panel-content/FlowReleasePanel"

interface PanelContentProps {
  nodeId: string
  nodeData: CanvasNodeData
  runId: string
  onRefresh: () => void
  onAdvance?: () => void
}

export default function PanelContent({ nodeId, nodeData, runId, onRefresh, onAdvance }: PanelContentProps) {
  const [error, setError] = useState<string | null>(null)

  const shared = { runId, nodeData, onRefresh, error, setError, ...(onAdvance !== undefined && { onAdvance }) }
  const t = nodeData.type

  // Route by node type (not ID — IDs vary per stage)
  if (t === "brief_input") {
    return <BriefEditPanel {...shared} />
  }
  if (t === "brief_parsed" || t === "brief_parsing") {
    return <BriefParsingPanel {...shared} />
  }
  if (t === "territory" || t === "territory_generation") {
    return <TerritoryPanel {...shared} />
  }
  if (t === "visual_dna") {
    return <VisualDnaPanelContent {...shared} />
  }
  if (t === "reference" || t === "reference_images") {
    return <ReferencesPanel {...shared} />
  }
  if (t === "deck" || t === "deck_generation") {
    return <DeckPanel {...shared} />
  }
  if (t === "ecd_gate" || t === "client_gate") {
    return <GatePanel {...shared} gate={t === "ecd_gate" ? "ecd" : "client"} />
  }
  if (t === "flow_release") {
    return <FlowReleasePanel {...shared} />
  }

  return <p className="text-sm text-zinc-500">Unknown: {t}</p>
}
