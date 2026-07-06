/**
 * Tracer — writes audit trail files to `traces/runs/{run_id}/`.
 *
 * Two trace types:
 *   1. Agent traces (markdown) — what the subagent thought, prompt + response + verification
 *   2. Stage outputs (JSON) — the structured data produced by each pipeline stage
 *
 * Files are committed to git as the development audit trail.
 * Firestore is the operational audit trail ("what state?").
 * Git is the forensic audit trail ("why?").
 */

import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import type {
  AgentTraceInput,
  AgentTrace,
  StageTraceInput,
  StageTrace,
  PipelineStage,
  VerificationCheck,
  UsageMetadata,
} from "./types/trace.js"

// ── Repo root resolution ─────────────────────────────────────────────────────

const REPO_ROOT = process.cwd() // Claude Code always runs from repo root
const TRACES_DIR = join(REPO_ROOT, "greenlight", "traces", "runs")

// ── Stage → file number mapping ──────────────────────────────────────────────

const STAGE_NUMBER: Record<PipelineStage, string> = {
  "brief-parsing": "02",
  "territory-generation": "03",
  "visual-dna": "04",
  "output-generation": "05",
  "gate-ecd": "07",
  "gate-client": "08",
}

const STAGE_DISPLAY_NAME: Record<PipelineStage, string> = {
  "brief-parsing": "Brief Parsing",
  "territory-generation": "Creative Territory Generation",
  "visual-dna": "Visual DNA Encoding",
  "output-generation": "Dual Output Generation",
  "gate-ecd": "Gate 1 — ECD Approval",
  "gate-client": "Gate 2 — Client Approval",
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function runDir(runId: string): string {
  return join(TRACES_DIR, runId)
}

function agentTraceDir(runId: string): string {
  return join(runDir(runId), "agent-traces")
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
}

function timestamp(): string {
  return new Date().toISOString()
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(5)}`
}

function verificationLine(check: VerificationCheck): string {
  const glyph = check.passed ? "✅" : "❌"
  const detail = check.detail ? ` — ${check.detail}` : ""
  return `| ${glyph} ${check.check}${detail} |`
}

// ── Markdown table builders ──────────────────────────────────────────────────

function buildMetadataTable(model: string, durationMs: number, usage: UsageMetadata): string {
  return [
    "| Field | Value |",
    "|---|---|",
    `| Model | ${model} |`,
    `| Duration | ${formatDuration(durationMs)} |`,
    `| Input tokens | ${usage.inputTokens.toLocaleString()} |`,
    `| Output tokens | ${usage.outputTokens.toLocaleString()} |`,
    `| Cost | ${formatCost(usage.costUsd)} |`,
    "",
  ].join("\n")
}

function buildVerificationTable(checks: VerificationCheck[]): string {
  if (checks.length === 0) return "_No verification checks run._\n"
  return [
    "| Check |",
    "|---|",
    ...checks.map(verificationLine),
    "",
  ].join("\n")
}

// ── Agent trace (markdown) ───────────────────────────────────────────────────

export function writeAgentTrace(input: AgentTraceInput): AgentTrace {
  const dir = agentTraceDir(input.runId)
  ensureDir(dir)

  const content = [
    `# Subagent: ${STAGE_DISPLAY_NAME[input.stage]}`,
    "",
    buildMetadataTable(input.model, input.durationMs, input.usage),
    "## Verification",
    "",
    buildVerificationTable(input.verification),
    "## System prompt",
    "",
    "```",
    input.systemPrompt,
    "```",
    "",
    "## User message",
    "",
    input.userMessage,
    "",
    "## Raw response",
    "",
    "```json",
    input.rawResponse,
    "```",
    "",
    "## Parsed output",
    "",
    "```json",
    JSON.stringify(input.parsedOutput, null, 2),
    "```",
    "",
  ].join("\n")

  const fileName = `${input.stage}.md`
  const filePath = join(dir, fileName)
  writeFileSync(filePath, content, "utf-8")

  const writtenAt = timestamp()

  return {
    ...input,
    writtenAt,
    filePath: `greenlight/traces/runs/${input.runId}/agent-traces/${fileName}`,
  }
}

// ── Stage output (JSON) ──────────────────────────────────────────────────────

export function writeStageOutput(input: StageTraceInput): StageTrace {
  const dir = runDir(input.runId)
  ensureDir(dir)

  const num = STAGE_NUMBER[input.stage]
  const stageName = input.stage.replace(/-/g, "_")

  const output = {
    _metadata: {
      stage: input.stage,
      runId: input.runId,
      writtenAt: timestamp(),
      ...input.metadata,
    },
    ...(input.data as Record<string, unknown>),
  }

  const fileName = `${num}-${stageName}.json`
  const filePath = join(dir, fileName)
  writeFileSync(filePath, JSON.stringify(output, null, 2) + "\n", "utf-8")

  return {
    ...input,
    writtenAt: output._metadata.writtenAt as string,
    filePath: `greenlight/traces/runs/${input.runId}/${fileName}`,
  }
}

// ── Brief input (raw) ────────────────────────────────────────────────────────

export function writeBriefInput(runId: string, brief: string, brandRules?: Record<string, unknown>): string {
  const dir = runDir(runId)
  ensureDir(dir)

  const content = [
    "# Brief Input",
    "",
    `**Run ID:** ${runId}`,
    `**Submitted:** ${timestamp()}`,
    "",
    "## Raw brief",
    "",
    brief,
    "",
  ]

  if (brandRules && Object.keys(brandRules).length > 0) {
    content.push(
      "## Brand rules",
      "",
      "```json",
      JSON.stringify(brandRules, null, 2),
      "```",
      ""
    )
  }

  const fileName = "01-brief-input.md"
  const filePath = join(dir, fileName)
  writeFileSync(filePath, content.join("\n"), "utf-8")
  return `greenlight/traces/runs/${runId}/${fileName}`
}

// ── Run summary (JSON) ───────────────────────────────────────────────────────

export function writeRunSummary(runId: string, summary: Record<string, unknown>): StageTrace {
  const dir = runDir(runId)
  ensureDir(dir)

  const output = {
    _metadata: {
      stage: "run-summary" as const,
      runId,
      writtenAt: timestamp(),
    },
    ...summary,
  }

  const fileName = "09-run-summary.json"
  const filePath = join(dir, fileName)
  writeFileSync(filePath, JSON.stringify(output, null, 2) + "\n", "utf-8")

  return {
    stage: "gate-client", // summary is written after final gate
    runId,
    data: summary,
    metadata: { stage: "run-summary" },
    writtenAt: output._metadata.writtenAt as string,
    filePath: `greenlight/traces/runs/${runId}/${fileName}`,
  }
}
