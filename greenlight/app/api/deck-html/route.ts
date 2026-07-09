/**
 * GET /api/deck-html?runId=...&variant=ecd|client
 *
 * Generates and returns an HTML pre-production deck viewable in any browser.
 * Bypasses the service account Drive quota issue that blocks Slides API.
 */

import { NextResponse } from "next/server"
import { readStageRecord } from "@greenlight/lib/firestore"
import { generateDeckHtml } from "@greenlight/lib/deck-html"
import type { DeckCopy } from "@greenlight/lib/types/pipeline"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const runId = url.searchParams.get("runId")
    const variant = (url.searchParams.get("variant") ?? "ecd") as "ecd" | "client"

    if (!runId) {
      return NextResponse.json({ error: "runId is required" }, { status: 400 })
    }

    // Read the output-generation record for deck copy data
    const outputDoc = await readStageRecord(runId, "output-generation")
    const deckCopy = outputDoc?.["_deckCopy"] as DeckCopy | undefined

    if (!deckCopy) {
      return NextResponse.json(
        { error: "No deck copy found. Run Generate Deck first." },
        { status: 404 }
      )
    }

    const briefDoc = await readStageRecord(runId, "brief-parsing")
    const brand = (briefDoc?.["brand"] as string) ?? "Unknown"

    const html = generateDeckHtml(deckCopy, brand, runId, variant)

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    })
  } catch (err) {
    console.error("[deck-html] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    )
  }
}
