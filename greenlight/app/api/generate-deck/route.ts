/**
 * POST /api/generate-deck — Stage 4: Dual Output Generation.
 *
 * Reads all prior stage data from Firestore, generates slide copy via Gemini,
 * assembles Flow package JSON, uploads to GCS, and writes output record.
 *
 * The deck is rendered as a React page at /run/[runId]/deck (no Slides API).
 */

import { NextResponse } from "next/server"
import { callGemini, parseGeminiJson } from "@greenlight/lib/llm"
import { DECK_COPY_SYSTEM_PROMPT, buildDeckCopyPrompt } from "@greenlight/lib/prompts/deck-copy"
import { readStageRecord, writeStageRecord } from "@greenlight/lib/firestore"
import { assembleFlowPackage, uploadFlowPackage } from "@greenlight/lib/flow-package"
import type { DeckCopy } from "@greenlight/lib/types/pipeline"

export const runtime = "nodejs"

// ── Helpers ────────────────────────────────────────────────────────────────────

function validateDeckCopy(copy: unknown): { valid: boolean; gaps: string[] } {
  const gaps: string[] = []
  if (typeof copy !== "object" || copy === null) {
    return { valid: false, gaps: ["Response is not an object"] }
  }
  const c = copy as Record<string, unknown>

  if (typeof c["titleSlide"] !== "object" || c["titleSlide"] === null) {
    gaps.push("titleSlide is missing")
  } else {
    const ts = c["titleSlide"] as Record<string, unknown>
    if (typeof ts["headline"] !== "string" || !ts["headline"]) gaps.push("titleSlide.headline")
    if (typeof ts["subtitle"] !== "string" || !ts["subtitle"]) gaps.push("titleSlide.subtitle")
  }

  if (typeof c["briefSummary"] !== "string" || !c["briefSummary"]) gaps.push("briefSummary")
  if (typeof c["territories"] !== "object" || c["territories"] === null) {
    gaps.push("territories is missing")
  } else {
    const territories = c["territories"] as Record<string, unknown>
    const keys = Object.keys(territories)
    if (keys.length < 3) gaps.push(`Expected 3 territories, got ${keys.length}`)
    for (const key of keys) {
      const t = territories[key] as Record<string, unknown> | null
      if (!t) { gaps.push(`territories.${key} is missing`); continue }
      for (const field of ["coverHeadline", "propositionBlurb", "visualSummary", "toneDescriptor", "sceneArcNotes", "flowPromptStyle"]) {
        if (typeof t[field] !== "string" || !t[field]) gaps.push(`territories.${key}.${field}`)
      }
    }
  }

  if (typeof c["visualOverview"] !== "object" || c["visualOverview"] === null) gaps.push("visualOverview")
  if (typeof c["brandAlignment"] !== "object" || c["brandAlignment"] === null) gaps.push("brandAlignment")
  if (typeof c["approvalSlide"] !== "object" || c["approvalSlide"] === null) {
    gaps.push("approvalSlide")
  } else {
    const as = c["approvalSlide"] as Record<string, unknown>
    if (!Array.isArray(as["territoryOptions"])) gaps.push("approvalSlide.territoryOptions")
  }
  if (typeof c["nextSteps"] !== "string" || !c["nextSteps"]) gaps.push("nextSteps")

  return { valid: gaps.length === 0, gaps }
}

// ── POST ───────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { runId?: string }
    const runId = body.runId

    if (!runId) {
      return NextResponse.json({ error: "runId is required" }, { status: 400 })
    }

    // 1. Read all prior stages
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

    const brief = briefDoc
    const territories = territoryDoc["territories"] as Record<string, unknown>[]
    const visualDnaMap = visualDnaDoc["territories"] as Record<string, Record<string, unknown>>

    // 2. Generate deck copy via Gemini
    const userMessage = buildDeckCopyPrompt({ brief, territories, visualDna: visualDnaMap })
    const geminiResponse = await callGemini(userMessage, {
      systemPrompt: DECK_COPY_SYSTEM_PROMPT,
      maxTokens: 8192,
    })

    const parsed = parseGeminiJson(geminiResponse.text)
    if (!parsed) {
      return NextResponse.json(
        { error: "Gemini deck copy parsing failed — invalid JSON", raw: geminiResponse.text.slice(0, 500) },
        { status: 500 }
      )
    }

    const validation = validateDeckCopy(parsed)
    if (!validation.valid) {
      console.warn("[generate-deck] Deck copy validation gaps:", validation.gaps)
    }

    const copy = parsed as DeckCopy

    // 3. Assemble & upload Flow package
    const flowPackage = assembleFlowPackage(runId, brief, territories, visualDnaMap)

    let flowGcsUri = ""
    let flowPublicUrl: string | null = null
    try {
      const upload = await uploadFlowPackage(runId, flowPackage)
      flowGcsUri = upload.gcsUri
      flowPublicUrl = upload.publicUrl
    } catch (err) {
      console.warn("[generate-deck] Flow package upload failed:", err instanceof Error ? err.message : err)
    }

    // 4. Deck URLs — rendered by React page at /run/[runId]/deck
    const baseUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000"
    const ecdDeckUrl = `${baseUrl}/run/${runId}/deck?variant=ecd`
    const clientDeckUrl = `${baseUrl}/run/${runId}/deck?variant=client`

    // 5. Write output record to Firestore
    await writeStageRecord({
      stage: "output-generation",
      runId,
      data: {
        _deckCopy: copy,
        ecd_deck_url: ecdDeckUrl,
        client_deck_url: clientDeckUrl,
        flow_package_gcs_uri: flowGcsUri,
        flow_package_public_url: flowPublicUrl,
      },
      tokenCost: geminiResponse.usage.costUsd,
    })

    return NextResponse.json({
      ecd_deck_url: ecdDeckUrl,
      client_deck_url: clientDeckUrl,
      flow_package_gcs_uri: flowGcsUri,
      flow_package_public_url: flowPublicUrl,
      cost: geminiResponse.usage,
    })
  } catch (err) {
    console.error("[generate-deck] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    )
  }
}

export async function DELETE(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { runId?: string }
    const { runId } = body
    if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 })
    // Write empty output stage (clears deck + flow package)
    await writeStageRecord({ stage: "output-generation", runId, data: {} })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 })
  }
}
