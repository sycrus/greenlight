/**
 * Firestore client — audit record read/write patterns.
 *
 * Schema (PRD §6.3):
 *   /runs/{run_id}/stages/{stage_name}    — stage outputs
 *   /runs/{run_id}/gates/{gate_name}      — approval gate records
 *   /runs/{run_id}/summary                — run summary
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
  approvalStatus: "APPROVED" | "APPROVED_WITH_NOTES" | "REVISIONS_REQUIRED"
  territorySelected: string
  notes: string | null
  approverName: string
  approverEmail: string
  revisionCycles: number
}

// ── Write ────────────────────────────────────────────────────────────────────

/** Write a stage output record. Idempotent — overwrites on retry. */
export async function writeStageRecord(record: StageRecord): Promise<void> {
  const docRef = db().doc(`runs/${record.runId}/stages/${record.stage}`)
  await docRef.set({
    ...(record.data as Record<string, unknown>),
    _meta: {
      stage: record.stage,
      runId: record.runId,
      tokenCost: record.tokenCost ?? null,
      imagenCost: record.imagenCost ?? null,
      imagenGenerations: record.imagenGenerations ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    },
  })
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
  const docRef = db().doc(`runs/${runId}/summary`)
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
  const doc = await db().doc(`runs/${runId}/summary`).get()
  return doc.exists ? (doc.data() as Record<string, unknown>) : null
}
