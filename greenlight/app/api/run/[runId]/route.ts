/**
 * GET /api/run/[runId] — fetch pipeline status from Firestore.
 *
 * Returns the current state of all stages and gates for a given run.
 */

import { NextResponse } from "next/server"
import {
  readStageRecord,
  readGateRecord,
  readRunSummary,
} from "@greenlight/lib/firestore"
import { getRunHistory } from "@greenlight/lib/traces"

export const runtime = "nodejs"

export async function GET(
  _req: Request,
  { params }: { params: { runId: string } }
) {
  try {
    const { runId } = params

    const [briefParsing, territoryGen, visualDna, outputGen, ecdGate, clientGate, summary] =
      await Promise.all([
        readStageRecord(runId, "brief-parsing"),
        readStageRecord(runId, "territory-generation"),
        readStageRecord(runId, "visual-dna"),
        readStageRecord(runId, "output-generation"),
        readGateRecord(runId, "ecd_approval"),
        readGateRecord(runId, "client_approval"),
        readRunSummary(runId),
      ])

    // Get git trace history (non-fatal if git isn't available)
    let gitHistory: string[] = []
    try {
      gitHistory = getRunHistory(runId).split("\n").filter(Boolean)
    } catch {
      // Git unavailable — traces still exist as files
    }

    return NextResponse.json({
      runId,
      stages: {
        brief_parsing: briefParsing ?? null,
        territory_generation: territoryGen ?? null,
        visual_dna: visualDna ?? null,
        output_generation: outputGen ?? null,
      },
      gates: {
        ecd_approval: ecdGate ?? null,
        client_approval: clientGate ?? null,
      },
      summary: summary ?? null,
      gitTrace: gitHistory,
    })
  } catch (err) {
    console.error("[run] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    )
  }
}
