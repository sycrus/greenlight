/**
 * Canvas types for the pipeline React Flow visualization.
 */

// ── Node status ──────────────────────────────────────────────────────────────

export type NodeStatus = "pending" | "ready" | "running" | "complete" | "stale" | "error"

// ── Pipeline stage config ────────────────────────────────────────────────────

export interface PipelineStageConfig {
  id: string
  label: string
  icon: string
  stageKey?: string // Firestore stages key (e.g. "brief_parsing")
  gateKey?: string // Firestore gates key (e.g. "ecd_approval")
}

// ── Canvas node data ─────────────────────────────────────────────────────────

export interface CanvasNodeData {
  type: string
  label: string
  icon: string
  status: NodeStatus
  stageData: Record<string, unknown> | null
  gateData: Record<string, unknown> | null
  generationCount: number
  isStale: boolean
  runId: string
  territoryId?: string
}

// ── Generation entry ─────────────────────────────────────────────────────────

export interface GenerationEntry {
  id: string
  createdAt: string
  parentGenerationId: string | null
  triggeredBy: string
  data: Record<string, unknown>
  cost: {
    tokenCost: number | null
    imagenCost: number | null
    imagenGenerations: number | null
  }
}

// ── Run status (from API) ───────────────────────────────────────────────────

export interface StageData {
  _meta?: {
    stage: string
    runId: string
    tokenCost: number | null
    imagenCost?: number | null
    imagenGenerations?: number | null
    currentGenerationId?: string
    updatedAt: unknown
  }
  _generations?: GenerationEntry[]
  _stale?: boolean
  staleDownstream?: string[]
  [key: string]: unknown
}

export interface GateData {
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

export interface RunStatus {
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
