/**
 * POST /api/gates/ecd — Gate 1: ECD Approval.
 *
 * Validates ECD approval form submission, writes gate record to Firestore.
 * Increments revision cycle on resubmission.
 */

import { NextResponse } from "next/server"
import { readStageRecord, readGateRecord, writeGateRecord } from "@greenlight/lib/firestore"
import type { EcdApprovalStatus, EcdGateInput } from "@greenlight/lib/types/pipeline"

export const runtime = "nodejs"

// ── Validation ─────────────────────────────────────────────────────────────────

function validateEcdInput(body: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  const validStatuses: EcdApprovalStatus[] = [
    "APPROVED",
    "APPROVED_WITH_REVISIONS",
    "REVISIONS_REQUIRED",
  ]

  if (typeof body["runId"] !== "string" || !body["runId"]) errors.push("runId is required")
  if (typeof body["territorySelected"] !== "string" || !body["territorySelected"]) {
    errors.push("territorySelected is required")
  } else {
    const validTerritories = ["t1", "t2", "t3"]
    if (!validTerritories.includes(body["territorySelected"] as string)) {
      errors.push('territorySelected must be t1, t2, or t3')
    }
  }

  if (!validStatuses.includes(body["approvalStatus"] as EcdApprovalStatus)) {
    errors.push(`approvalStatus must be one of: ${validStatuses.join(", ")}`)
  }

  if (body["approvalStatus"] === "REVISIONS_REQUIRED") {
    if (typeof body["notes"] !== "string" || !(body["notes"] as string).trim()) {
      errors.push("notes are required when REVISIONS_REQUIRED")
    }
  }

  if (typeof body["name"] !== "string" || !body["name"]) errors.push("name is required")
  if (typeof body["email"] !== "string" || !body["email"]) errors.push("email is required")

  return { valid: errors.length === 0, errors }
}

// ── POST ───────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

    // Validate input
    const validation = validateEcdInput(body)
    if (!validation.valid) {
      return NextResponse.json({ error: "Validation failed", details: validation.errors }, { status: 400 })
    }

    const input = body as unknown as EcdGateInput

    // Check run exists
    const briefDoc = await readStageRecord(input.runId, "brief-parsing")
    if (!briefDoc) {
      return NextResponse.json({ error: `Run ${input.runId} not found` }, { status: 404 })
    }

    // Track revision cycles
    let revisionCycles = 0
    const existingGate = await readGateRecord(input.runId, "ecd_approval")
    if (existingGate?.["revisionCycles"] !== undefined) {
      revisionCycles = (existingGate["revisionCycles"] as number) + 1
    }

    // Get slides deck ID from output stage
    const outputDoc = await readStageRecord(input.runId, "output-generation")
    const slidesDeckId = (outputDoc?.["slides_deck_id_ecd"] as string) ?? "unknown"

    // Write gate record
    await writeGateRecord({
      gate: "ecd_approval",
      runId: input.runId,
      approvalStatus: input.approvalStatus,
      territorySelected: input.territorySelected,
      notes: input.notes,
      approverName: input.name,
      approverEmail: input.email,
      revisionCycles,
    })

    const nextGate = input.approvalStatus === "REVISIONS_REQUIRED" ? null : "client_approval"

    return NextResponse.json({
      gate: "ecd_approval",
      status: input.approvalStatus,
      revisionCycles,
      ...(nextGate !== undefined && { nextGate }),
    })
  } catch (err) {
    console.error("[gates/ecd] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    )
  }
}
