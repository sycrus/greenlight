/**
 * Git operations for trace commits.
 *
 * Each pipeline stage produces trace files that get committed to git.
 * This module wraps `git add` + `git commit` for the traces directory.
 *
 * Commit convention:
 *   run/{run_id}: stage {n} — {stage_display_name} {✅/❌}
 *
 * Example git log:
 *   d91c3f2 run/nike-q3: stage 5 — Gate 2 Client Approval ✅
 *   7fe441c run/nike-q3: stage 4 — Gate 1 ECD Approval ✅
 *   a83109c run/nike-q3: stage 3 — Dual Output Generation ✅
 *   3fb62e0 run/nike-q3: stage 2 — Visual DNA Encoding ✅
 *   c2518da run/nike-q3: stage 1 — Creative Territory Generation ✅
 *   0e9174a run/nike-q3: stage 0 — Brief Parsing ✅
 */

import { execSync } from "node:child_process"
import type { PipelineStage } from "./types/trace.js"

// ── Stage metadata ───────────────────────────────────────────────────────────

const STAGE_ORDER: Record<PipelineStage, number> = {
  "brief-parsing": 0,
  "territory-generation": 1,
  "visual-dna": 2,
  "output-generation": 3,
  "gate-ecd": 4,
  "gate-client": 5,
}

const STAGE_LABEL: Record<PipelineStage, string> = {
  "brief-parsing": "Brief Parsing",
  "territory-generation": "Creative Territory Generation",
  "visual-dna": "Visual DNA Encoding",
  "output-generation": "Dual Output Generation",
  "gate-ecd": "Gate 1 — ECD Approval",
  "gate-client": "Gate 2 — Client Approval",
}

// ── Git operations ───────────────────────────────────────────────────────────

const TRACES_GLOB = "greenlight/traces/runs/"

function git(args: string): string {
  try {
    return execSync(`git ${args}`, { encoding: "utf-8", cwd: process.cwd() }).trim()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`git ${args.split(" ")[0]} failed: ${message}`)
  }
}

/**
 * Stage all trace files for a run and commit them.
 *
 * @param runId   — pipeline run identifier (e.g. "nike-q3-campaign")
 * @param stage   — which pipeline stage just completed
 * @param success — whether verification passed (controls ✅/❌ in commit message)
 * @returns the commit hash
 */
export function commitStage(
  runId: string,
  stage: PipelineStage,
  success: boolean,
): string {
  const n = STAGE_ORDER[stage]
  const label = STAGE_LABEL[stage]
  const glyph = success ? "✅" : "❌"
  const message = `run/${runId}: stage ${n} — ${label} ${glyph}`

  // Stage only this run's trace directory
  const runTraceDir = `${TRACES_GLOB}${runId}`
  git(`add ${runTraceDir}`)

  // Check if there's anything to commit
  const diff = git("diff --cached --name-only")
  if (!diff) return ""

  git(`commit -m "${message}"`)
  return git("rev-parse HEAD")
}

/**
 * Commit the final run summary after all stages and gates are complete.
 */
export function commitRunComplete(runId: string): string {
  const runTraceDir = `${TRACES_GLOB}${runId}`
  git(`add ${runTraceDir}`)

  const diff = git("diff --cached --name-only")
  if (!diff) return ""

  const message = `run/${runId}: complete — all stages passed, Flow package released 🚀`
  git(`commit -m "${message}"`)
  return git("rev-parse HEAD")
}

/**
 * Get the git log for a specific run.
 * Returns the commit history that tells the pipeline's story.
 */
export function getRunHistory(runId: string): string {
  return git(`log --oneline --grep="run/${runId}" --reverse`)
}

/**
 * Check if the working tree is clean (no uncommitted trace files).
 */
export function isClean(): boolean {
  const status = git("status --porcelain -- greenlight/traces/")
  return status === ""
}
