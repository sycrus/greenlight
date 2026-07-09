/**
 * POST /api/gates/client — Gate 2: Client Approval.
 *
 * Validates client approval form submission, checks Gate 1 is passed,
 * writes gate record to Firestore, and triggers Flow package release
 * on APPROVED or APPROVED_WITH_NOTES.
 */

import { NextResponse } from "next/server"
import {
  readStageRecord,
  readGateRecord,
  writeGateRecord,
  writeRunSummary,
} from "@greenlight/lib/firestore"
import { generateSignedUrl } from "@greenlight/lib/slides"
import type { ClientApprovalStatus, ClientGateInput } from "@greenlight/lib/types/pipeline"

export const runtime = "nodejs"

// ── Validation ─────────────────────────────────────────────────────────────────

function validateClientInput(body: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  const validStatuses: ClientApprovalStatus[] = [
    "APPROVED",
    "APPROVED_WITH_NOTES",
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

  if (!validStatuses.includes(body["approvalStatus"] as ClientApprovalStatus)) {
    errors.push(`approvalStatus must be one of: ${validStatuses.join(", ")}`)
  }

  if (body["approvalStatus"] === "REVISIONS_REQUIRED") {
    if (typeof body["notes"] !== "string" || !(body["notes"] as string).trim()) {
      errors.push("notes are required when REVISIONS_REQUIRED")
    }
  }

  if (typeof body["name"] !== "string" || !body["name"]) errors.push("name is required")
  if (typeof body["title"] !== "string" || !body["title"]) errors.push("title is required")
  if (typeof body["email"] !== "string" || !body["email"]) errors.push("email is required")

  return { valid: errors.length === 0, errors }
}

// ── POST ───────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

    // Validate input
    const validation = validateClientInput(body)
    if (!validation.valid) {
      return NextResponse.json({ error: "Validation failed", details: validation.errors }, { status: 400 })
    }

    const input = body as unknown as ClientGateInput

    // Check Gate 1 is passed
    const ecdGate = await readGateRecord(input.runId, "ecd_approval")
    if (!ecdGate) {
      return NextResponse.json(
        { error: "Gate 1 (ECD approval) must be passed before client approval" },
        { status: 400 }
      )
    }

    const ecdStatus = ecdGate["approvalStatus"] as string
    if (ecdStatus === "REVISIONS_REQUIRED") {
      return NextResponse.json(
        { error: "Gate 1 (ECD approval) requires revisions — cannot proceed to client approval" },
        { status: 400 }
      )
    }

    if (ecdStatus !== "APPROVED" && ecdStatus !== "APPROVED_WITH_REVISIONS") {
      return NextResponse.json(
        { error: "Gate 1 (ECD approval) has not been approved" },
        { status: 400 }
      )
    }

    // Track revision cycles
    let revisionCycles = 0
    const existingGate = await readGateRecord(input.runId, "client_approval")
    if (existingGate?.["revisionCycles"] !== undefined) {
      revisionCycles = (existingGate["revisionCycles"] as number) + 1
    }

    // Get slides deck ID
    const outputDoc = await readStageRecord(input.runId, "output-generation")
    const slidesDeckId = (outputDoc?.["slides_deck_id_client"] as string) ?? "unknown"

    // Write gate record
    await writeGateRecord({
      gate: "client_approval",
      runId: input.runId,
      approvalStatus: input.approvalStatus,
      territorySelected: input.territorySelected,
      notes: input.notes,
      approverName: input.name,
      approverEmail: input.email,
      revisionCycles,
    })

    // If approved, trigger Flow package release
    const isApproved =
      input.approvalStatus === "APPROVED" || input.approvalStatus === "APPROVED_WITH_NOTES"

    let flowPackageUrl: string | null = null
    let flowPackageUri: string | null = null

    if (isApproved) {
      const flowPath = `runs/${input.runId}/flow-package.json`
      const bucketName = process.env["GCS_BUCKET_NAME"] ?? "greenlight-assets-agentic-499802"
      flowPackageUri = `gs://${bucketName}/${flowPath}`

      try {
        // Generate signed URL for CD download
        flowPackageUrl = await generateSignedUrl(flowPath, 48)
      } catch (err) {
        console.warn("[gates/client] Signed URL generation failed:", err instanceof Error ? err.message : err)
        // Fallback: return public URL
        flowPackageUrl = `https://storage.googleapis.com/${bucketName}/${flowPath}`
      }

      // Write run summary
      const briefDoc = await readStageRecord(input.runId, "brief-parsing")
      const brand = (briefDoc?.["brand"] as string) ?? "Unknown"
      const ecdName = (ecdGate["approverName"] as string) ?? "Unknown"

      // Calculate total costs from all stages
      const stages = ["brief-parsing", "territory-generation", "visual-dna", "output-generation"]
      let totalGeminiCost = 0
      let totalImagenCost = 0
      for (const stage of stages) {
        const doc = await readStageRecord(input.runId, stage)
        if (doc?.["_meta"]) {
          const meta = doc["_meta"] as Record<string, unknown>
          if (typeof meta["tokenCost"] === "number") totalGeminiCost += meta["tokenCost"]
          if (typeof meta["imagenCost"] === "number") totalImagenCost += meta["imagenCost"]
        }
      }

      await writeRunSummary(input.runId, {
        runId: input.runId,
        brand,
        approvedTerritory: input.territorySelected,
        totalGeminiCost,
        totalImagenCost,
        revisionCyclesEcd: (ecdGate["revisionCycles"] as number) ?? 0,
        revisionCyclesClient: revisionCycles,
        flowPackageUri,
        flowPackageSignedUrl: flowPackageUrl,
      })
    }

    return NextResponse.json({
      gate: "client_approval",
      status: input.approvalStatus,
      revisionCycles,
      ...(isApproved && {
        flowPackageUrl,
        flowPackageUri,
        pipelineComplete: true,
      }),
    })
  } catch (err) {
    console.error("[gates/client] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    )
  }
}
