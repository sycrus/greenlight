/**
 * Trace types — the audit trail data model.
 *
 * Every subagent action and pipeline stage output is captured as a trace.
 * Traces are written to `traces/runs/{run_id}/` and committed to git.
 * This is the forensic audit layer ("why?"). Firestore is the operational
 * layer ("what state?"). They are complementary.
 */

// ── Pipeline stages ──────────────────────────────────────────────────────────

export type PipelineStage =
  | "brief-parsing"
  | "territory-generation"
  | "visual-dna"
  | "output-generation"
  | "gate-ecd"
  | "gate-client"

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  "brief-parsing",
  "territory-generation",
  "visual-dna",
  "output-generation",
  "gate-ecd",
  "gate-client",
] as const

// ── Agent trace (per-subagent call) ──────────────────────────────────────────

export interface VerificationCheck {
  check: string
  passed: boolean
  detail?: string
}

export interface UsageMetadata {
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export interface AgentTraceInput {
  stage: PipelineStage
  runId: string
  model: string
  systemPrompt: string
  userMessage: string
  rawResponse: string
  parsedOutput: unknown
  usage: UsageMetadata
  durationMs: number
  verification: VerificationCheck[]
}

export interface AgentTrace extends AgentTraceInput {
  writtenAt: string // ISO8601 timestamp
  filePath: string // relative to repo root
}

// ── Stage output trace (structured data per stage) ───────────────────────────

export interface StageTraceInput {
  stage: PipelineStage
  runId: string
  data: unknown // the stage output (parsed_brief, territories, visual_dna, etc.)
  metadata?: Record<string, unknown>
}

export interface StageTrace extends StageTraceInput {
  writtenAt: string
  filePath: string
}

// ── Run summary ──────────────────────────────────────────────────────────────

export interface RunSummary {
  runId: string
  brand: string
  briefHash: string
  approvedTerritory: string | null
  costs: {
    briefParsingTokens: number
    territoryGenerationTokens: number
    visualDnaTokens: number
    imagenGenerations: number
    imagenCost: number
    outputGenerationTokens: number
    totalTokenCost: number
    totalImagenCost: number
    totalCostUsd: number
  }
  gateCycles: {
    ecdRevisionCycles: number
    clientRevisionCycles: number
  }
  pipelineDurationMinutes: number
  operator: string
  completedAt: string
}

// ── Trace file index ─────────────────────────────────────────────────────────

export interface TraceIndex {
  runId: string
  startedAt: string
  completedAt: string | null
  stages: Record<PipelineStage, {
    agentTracePath: string | null
    stageOutputPath: string | null
    committed: boolean
    commitHash: string | null
  }>
}
