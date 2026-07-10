/**
 * POST /api/generate-flow-package — Assemble & upload Flow package standalone.
 *
 * Unlike generate-deck (which bundles deck copy + flow package), this endpoint
 * assembles and uploads ONLY the Flow package JSON. Use for regeneration
 * without re-running the full deck copy Gemini call.
 *
 * Requires: parsed brief, territories, and Visual DNA in Firestore.
 */

import { NextResponse } from "next/server"
import { readStageRecord, writeStageRecord } from "@greenlight/lib/firestore"
import { assembleFlowPackage, uploadFlowPackage } from "@greenlight/lib/flow-package"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { runId?: string }
    const runId = body.runId

    if (!runId) {
      return NextResponse.json({ error: "runId is required" }, { status: 400 })
    }

    // Read all prior stages
    const briefDoc = await readStageRecord(runId, "brief-parsing")
    const territoryDoc = await readStageRecord(runId, "territory-generation")
    const visualDnaDoc = await readStageRecord(runId, "visual-dna")

    if (!briefDoc) {
      return NextResponse.json(
        { error: `Run ${runId} has no parsed brief — run Stage 1 first` },
        { status: 400 }
      )
    }
    if (!territoryDoc?.["territories"]) {
      return NextResponse.json(
        { error: `Run ${runId} has no territories — run Stage 2 first` },
        { status: 400 }
      )
    }
    if (!visualDnaDoc?.["territories"]) {
      return NextResponse.json(
        { error: `Run ${runId} has no Visual DNA — run Stage 3 first` },
        { status: 400 }
      )
    }

    const territories = territoryDoc["territories"] as Record<string, unknown>[]
    const visualDnaMap = visualDnaDoc["territories"] as Record<string, Record<string, unknown>>

    // Assemble the flow package
    const flowPackage = assembleFlowPackage(runId, briefDoc, territories, visualDnaMap)

    // Upload to GCS
    let gcsUri = ""
    let publicUrl: string | null = null
    try {
      const result = await uploadFlowPackage(runId, flowPackage)
      gcsUri = result.gcsUri
      publicUrl = result.publicUrl
    } catch (err) {
      console.warn("[generate-flow-package] GCS upload failed:", err instanceof Error ? err.message : err)
    }

    // Update output-generation stage record (merge with existing if present)
    const existingOutput = await readStageRecord(runId, "output-generation")
    await writeStageRecord({
      stage: "output-generation",
      runId,
      data: {
        ...(existingOutput ?? {}),
        _meta: undefined, // writeStageRecord creates its own _meta
        flow_package_gcs_uri: gcsUri,
        flow_package_public_url: publicUrl,
      },
    })

    return NextResponse.json({
      flow_package_gcs_uri: gcsUri,
      flow_package_public_url: publicUrl,
      ingredient_count: flowPackage.flow_package.ingredients.length,
      scene_count: flowPackage.flow_package.scene_briefs.length,
    })
  } catch (err) {
    console.error("[generate-flow-package] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    )
  }
}
