/**
 * Firestore client — audit record read/write patterns.
 *
 * Schema (PRD §6.3):
 *   /runs/{run_id}/stages/{stage_name}    — stage outputs
 *   /runs/{run_id}/gates/{gate_name}      — approval gate records
 *   /runs/{run_id}/summary                — run summary
 *
 * Generation tracking (branching):
 *   Each stage document carries a _generations array with version history.
 *   Re-running a stage appends a new generation entry and marks downstream stale.
 */

import { initializeApp, getApps, cert, type App } from "firebase-admin/app"
import {
  getFirestore,
  FieldValue,
  type Firestore,
} from "firebase-admin/firestore"

// ── Client (lazy init) ───────────────────────────────────────────────────────

let _app: App | null = null
let _db: Firestore | null = null

function db(): Firestore {
  if (!_db) {
    if (!getApps().length) {
      const key = process.env["GCP_SERVICE_ACCOUNT_KEY"]
      if (key) {
        _app = initializeApp({
          credential: cert(JSON.parse(key)),
          projectId: process.env["GCP_PROJECT_ID"] ?? "greenlight-v01",
        })
      } else {
        // Fallback: Application Default Credentials (Cloud Run, emulator)
        _app = initializeApp({
          projectId: process.env["GCP_PROJECT_ID"] ?? "greenlight-v01",
        })
      }
    }
    _db = getFirestore()
  }
  return _db
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface StageRecord {
  stage: string
  runId: string
  data: unknown
  tokenCost?: number
  imagenCost?: number
  imagenGenerations?: number
  confidenceScore?: number
}

export interface GateRecord {
  gate: string
  runId: string
  approvalStatus: "APPROVED" | "APPROVED_WITH_REVISIONS" | "APPROVED_WITH_NOTES" | "REVISIONS_REQUIRED"
  territorySelected: string
  notes: string | null
  approverName: string
  approverEmail: string
  revisionCycles: number
}

// ── Write ────────────────────────────────────────────────────────────────────

/** Write a stage output record. Now delegates to generation-aware write. */
export async function writeStageRecord(record: StageRecord): Promise<void> {
  await writeStageRecordWithGeneration(record)
}

/** Write a gate approval record. */
export async function writeGateRecord(record: GateRecord): Promise<void> {
  const docRef = db().doc(`runs/${record.runId}/gates/${record.gate}`)
  await docRef.set({
    gate: record.gate,
    runId: record.runId,
    approvalStatus: record.approvalStatus,
    territorySelected: record.territorySelected,
    notes: record.notes,
    approverName: record.approverName,
    approverEmail: record.approverEmail,
    revisionCycles: record.revisionCycles,
    approvedAt: FieldValue.serverTimestamp(),
  })
}

/** Write the run summary after all gates pass. */
export async function writeRunSummary(
  runId: string,
  summary: Record<string, unknown>
): Promise<void> {
  const docRef = db().doc(`runs/${runId}/summaries/main`)
  await docRef.set({
    ...summary,
    completedAt: FieldValue.serverTimestamp(),
  })
}

// ── Read ─────────────────────────────────────────────────────────────────────

/** Read a stage record. Returns null if not yet written. */
export async function readStageRecord(
  runId: string,
  stage: string
): Promise<Record<string, unknown> | null> {
  const doc = await db().doc(`runs/${runId}/stages/${stage}`).get()
  return doc.exists ? (doc.data() as Record<string, unknown>) : null
}

/** Read a gate record. Returns null if gate not yet passed. */
export async function readGateRecord(
  runId: string,
  gate: string
): Promise<Record<string, unknown> | null> {
  const doc = await db().doc(`runs/${runId}/gates/${gate}`).get()
  return doc.exists ? (doc.data() as Record<string, unknown>) : null
}

/** Read the run summary. */
export async function readRunSummary(
  runId: string
): Promise<Record<string, unknown> | null> {
  const doc = await db().doc(`runs/${runId}/summaries/main`).get()
  return doc.exists ? (doc.data() as Record<string, unknown>) : null
}

// ── Generation tracking (branching) ──────────────────────────────────────────

/** Pipeline DAG — which stages are downstream of a given stage. */
const PIPELINE_DOWNSTREAM: Record<string, string[]> = {
  "brief-parsing": ["territory-generation", "visual-dna", "output-generation"],
  "territory-generation": ["visual-dna", "output-generation"],
  "visual-dna": ["output-generation"],
  "output-generation": [],
}

/**
 * Write a stage record WITH generation history appended.
 * Backward-compatible — existing reads still work because top-level data is mirrored.
 */
export async function writeStageRecordWithGeneration(record: StageRecord): Promise<string> {
  const genId = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const genEntry = {
    id: genId,
    createdAt: new Date().toISOString(),
    triggeredBy: "user",
    cost: {
      tokenCost: record.tokenCost ?? null,
      imagenCost: record.imagenCost ?? null,
      imagenGenerations: record.imagenGenerations ?? null,
    },
  }

  const docRef = db().doc(`runs/${record.runId}/stages/${record.stage}`)
  const existing = await docRef.get()
  const existingData = existing.exists ? (existing.data() as Record<string, unknown>) : {}
  const existingGens = (existingData["_generations"] as Array<unknown>) ?? []

  // Cap generations at 10 to avoid 1MB doc limit
  const generations = [...existingGens.slice(-9), genEntry]

  await docRef.set({
    // Mirror current data at top level for backward compat
    ...(record.data as Record<string, unknown>),
    _meta: {
      stage: record.stage,
      runId: record.runId,
      tokenCost: record.tokenCost ?? null,
      imagenCost: record.imagenCost ?? null,
      imagenGenerations: record.imagenGenerations ?? null,
      currentGenerationId: genId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    _generations: generations,
    _stale: false,
  })

  // Mark downstream stages as stale
  await markStaleDownstream(record.runId, record.stage)

  return genId
}

/**
 * Mark all downstream stages as stale after an upstream regeneration.
 */
async function markStaleDownstream(runId: string, fromStage: string): Promise<void> {
  const downstream = PIPELINE_DOWNSTREAM[fromStage]
  if (!downstream?.length) return

  // Fire-and-forget — write each downstream doc individually
  const promises = downstream.map((stage) =>
    db().doc(`runs/${runId}/stages/${stage}`).set({ _stale: true }, { merge: true })
  )
  await Promise.all(promises)
}

/**
 * Clear the stale flag on a stage (when it's regenerated).
 */
export async function clearStaleFlag(runId: string, stage: string): Promise<void> {
  await db().doc(`runs/${runId}/stages/${stage}`).set({ _stale: false }, { merge: true })
}

/**
 * List all generations for a stage. Returns empty array if none.
 */
export async function listStageGenerations(
  runId: string,
  stage: string
): Promise<Array<{ id: string; createdAt: string; triggeredBy: string }>> {
  const doc = await db().doc(`runs/${runId}/stages/${stage}`).get()
  if (!doc.exists) return []
  const data = doc.data() as Record<string, unknown>
  return (data["_generations"] as Array<Record<string, unknown>>)?.map((g) => ({
    id: g["id"] as string,
    createdAt: g["createdAt"] as string,
    triggeredBy: (g["triggeredBy"] as string) ?? "user",
  })) ?? []
}
