/**
 * POST /api/generate-deck — Stage 4: Dual Output Generation.
 *
 * Reads all prior stage data from Firestore, generates slide copy via Gemini,
 * creates ECD + client decks via Slides API, assembles Flow package JSON,
 * uploads to GCS, and writes output record to Firestore.
 */

import { NextResponse } from "next/server"
import { callGemini, parseGeminiJson } from "@greenlight/lib/genkit"
import { DECK_COPY_SYSTEM_PROMPT, buildDeckCopyPrompt } from "@greenlight/lib/prompts/deck-copy"
import { readStageRecord, writeStageRecord } from "@greenlight/lib/firestore"
import {
  createDeck,
  populateSlides,
  buildDeckRequests,
  shareDeck,
  duplicateDeck,
  getSlideIds,
  removeSlides,
} from "@greenlight/lib/slides"
import { uploadToGcs, gcsToHttps } from "@greenlight/lib/gcs"
import type { DeckCopy, FlowPackageWrapper } from "@greenlight/lib/types/pipeline"

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
      if (typeof t["sceneCount"] !== "number" || (t["sceneCount"] as number) < 1) {
        gaps.push(`territories.${key}.sceneCount`)
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

function assembleFlowPackage(
  runId: string,
  brief: Record<string, unknown>,
  territories: Record<string, unknown>[],
  visualDna: Record<string, Record<string, unknown>>
): FlowPackageWrapper {
  const brand = (brief["brand"] as string) ?? "Unknown"
  const allIngredients: Record<string, unknown>[] = []
  const seenIds = new Set<string>()

  for (const [_tid, vd] of Object.entries(visualDna)) {
    const ings = vd["ingredients"] as Record<string, unknown>[] | undefined
    if (!ings) continue
    for (const ing of ings) {
      const id = ing["ingredient_id"] as string
      if (id && !seenIds.has(id)) {
        seenIds.add(id)
        allIngredients.push(ing)
      }
    }
  }

  const brandRulesSet = new Set<string>()
  const negativePromptsSet = new Set<string>()
  for (const [_tid, vd] of Object.entries(visualDna)) {
    for (const rule of (vd["brand_rules_as_prompts"] as string[]) ?? []) brandRulesSet.add(rule)
    for (const neg of (vd["negative_prompt_list"] as string[]) ?? []) negativePromptsSet.add(neg)
  }

  const sceneBriefs: Record<string, unknown>[] = []
  let sceneNum = 1
  for (const [_tid, vd] of Object.entries(visualDna)) {
    const territoryId = vd["territory_id"] as string
    const flowSceneBrief = (vd["flow_scene_brief"] as string) ?? ""
    const sceneCount = 4
    for (let i = 0; i < sceneCount; i++) {
      sceneBriefs.push({
        scene_number: sceneNum++,
        territory_id: territoryId,
        description: `${flowSceneBrief} — scene ${i + 1}`,
        shot_language: "Cinematic",
        suggested_flow_prompt: `Create scene ${i + 1} for ${territoryId}: ${flowSceneBrief}`,
        duration_seconds: 6,
      })
    }
  }

  const flowSessionBrief = [
    `Brand: ${brand}.`,
    brief["campaign_objective"] ?? "",
    brief["key_message"] ?? "",
    "Three creative territories explore distinct execution approaches.",
  ]
    .filter((s) => typeof s === "string" && s.length > 0)
    .join(" ")

  return {
    flow_package: {
      run_id: runId,
      brand,
      approved_territory_id: null,
      visual_dna: visualDna,
      flow_session_brief: flowSessionBrief,
      ingredients: allIngredients as unknown as FlowPackageWrapper["flow_package"]["ingredients"],
      scene_briefs: sceneBriefs as unknown as FlowPackageWrapper["flow_package"]["scene_briefs"],
      brand_rules_as_prompts: [...brandRulesSet],
      negative_prompt_list: [...negativePromptsSet],
      approved_by_ecd: null,
      approved_by_client: null,
      released_at: null,
    },
  }
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
    const userMessage = buildDeckCopyPrompt({
      brief,
      territories,
      visualDna: visualDnaMap,
    })

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

    // 3. Try Slides API, fall back to HTML deck
    let ecdDeckUrl = ""
    let clientDeckUrl = ""
    let slidesDeckIdEcd = ""
    let slidesDeckIdClient = ""
    let slideCountEcd = 15
    let slideCountClient = 14

    try {
      const deckTitle = `${copy.titleSlide.headline} — Pre-Production Deck`
      const ecdDeck = await createDeck(deckTitle)

      // Build slide requests
      const territorySlides = territories.map((t, i) => {
        const tid = `t${i + 1}`
        const vd = visualDnaMap[tid]
        return {
          coverHeadline: copy.territories[tid]?.coverHeadline ?? (t["name"] as string),
          propositionBlurb: copy.territories[tid]?.propositionBlurb ?? "",
          visualSummary: copy.territories[tid]?.visualSummary ?? "",
          toneDescriptor: copy.territories[tid]?.toneDescriptor ?? "",
          sceneArcNotes: copy.territories[tid]?.sceneArcNotes ?? "",
          sceneCount: copy.territories[tid]?.sceneCount ?? (t["scene_count_suggestion"] as number) ?? 4,
          flowPromptStyle: copy.territories[tid]?.flowPromptStyle ?? "",
          riskFlag: copy.territories[tid]?.riskFlag ?? (t["risk_flag"] as string | null) ?? null,
          palettePrimary: (vd?.["palette"] as Record<string, string[]>)?.["primary"] ?? [],
          paletteAccent: (vd?.["palette"] as Record<string, string[]>)?.["accent"] ?? [],
        }
      })

      const brandNotes = copy.brandAlignment?.territoryNotes ?? {}
      const brandNotesText = Object.entries(brandNotes)
        .map(([tid, note]) => `${tid}: ${note}`)
        .join("\n")

      const requests = buildDeckRequests({
        brand: (brief["brand"] as string) ?? "Unknown",
        titleSlide: copy.titleSlide,
        territories: territorySlides,
        visualOverview: copy.visualOverview,
        brandAlignment: {
          territoryNotes: brandNotesText,
          divergenceNotes: copy.brandAlignment?.divergenceNotes ?? "",
          riskSummary: copy.brandAlignment?.riskSummary ?? "",
        },
        approvalSlide: copy.approvalSlide,
        nextSteps: copy.nextSteps,
      })

      await populateSlides(ecdDeck.presentationId, requests)

      // Share ECD deck
      const ecdEmail = process.env["ECD_EMAIL"] ?? ""
      ecdDeckUrl = ecdDeck.url
      if (ecdEmail) {
        try {
          const shareResult = await shareDeck(ecdDeck.presentationId, ecdEmail, "commenter")
          ecdDeckUrl = shareResult.url
        } catch (err) {
          console.warn("[generate-deck] ECD share failed:", err instanceof Error ? err.message : err)
        }
      }

      // Duplicate for client version
      const clientTitle = `${copy.titleSlide.headline} — Pre-Production Deck (Client)`
      const clientDeck = await duplicateDeck(ecdDeck.presentationId, clientTitle)

      // Remove internal-only slides
      try {
        const slideIds = await getSlideIds(clientDeck.presentationId)
        if (slideIds.length >= 13 && slideIds[12]) {
          await removeSlides(clientDeck.presentationId, [slideIds[12]])
        }
      } catch (err) {
        console.warn("[generate-deck] Client slide removal failed:", err instanceof Error ? err.message : err)
      }

      // Share client deck
      const clientEmail = process.env["CLIENT_EMAIL"] ?? ""
      clientDeckUrl = clientDeck.url
      if (clientEmail) {
        try {
          const shareResult = await shareDeck(clientDeck.presentationId, clientEmail, "reader")
          clientDeckUrl = shareResult.url
        } catch (err) {
          console.warn("[generate-deck] Client share failed:", err instanceof Error ? err.message : err)
        }
      }

      slidesDeckIdEcd = ecdDeck.presentationId
      slidesDeckIdClient = clientDeck.presentationId
      console.log("[generate-deck] Slides API succeeded")
    } catch (slidesErr) {
      console.warn("[generate-deck] Slides API failed, using HTML deck:", slidesErr instanceof Error ? slidesErr.message : slidesErr)
      // Fall back to HTML deck
      const baseUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000"
      ecdDeckUrl = `${baseUrl}/api/deck-html?runId=${runId}&variant=ecd`
      clientDeckUrl = `${baseUrl}/api/deck-html?runId=${runId}&variant=client`
    }

    // 4. Assemble & upload Flow package
    const flowPackage = assembleFlowPackage(runId, brief, territories, visualDnaMap)
    const flowBuffer = Buffer.from(JSON.stringify(flowPackage, null, 2), "utf-8")

    let flowGcsUri = ""
    let flowPublicUrl: string | null = null
    try {
      const { Storage } = await import("@google-cloud/storage")
      const keyJson = process.env["GCP_SERVICE_ACCOUNT_KEY"]
      const projectId = process.env["GCP_PROJECT_ID"] ?? ""
      const gcs = keyJson
        ? new Storage({ projectId, credentials: JSON.parse(keyJson) })
        : new Storage({ projectId })
      const bucket = gcs.bucket(process.env["GCS_BUCKET_NAME"] ?? "greenlight-assets-agentic-499802")
      const flowPath = `runs/${runId}/flow-package.json`
      await bucket.file(flowPath).save(flowBuffer, { contentType: "application/json" })
      flowGcsUri = `gs://${process.env["GCS_BUCKET_NAME"] ?? "greenlight-assets-agentic-499802"}/${flowPath}`
      flowPublicUrl = `https://storage.googleapis.com/${process.env["GCS_BUCKET_NAME"] ?? "greenlight-assets-agentic-499802"}/${flowPath}`
    } catch (err) {
      console.warn("[generate-deck] Flow package upload failed:", err instanceof Error ? err.message : err)
    }

    // 5. Write output record to Firestore (include deck copy for HTML rendering)
    await writeStageRecord({
      stage: "output-generation",
      runId,
      data: {
        _deckCopy: copy,
        slides_deck_id_ecd: slidesDeckIdEcd || "html",
        slides_deck_id_client: slidesDeckIdClient || "html",
        ecd_deck_url: ecdDeckUrl,
        client_deck_url: clientDeckUrl,
        flow_package_gcs_uri: flowGcsUri,
        flow_package_public_url: flowPublicUrl,
        slide_count_ecd: slideCountEcd,
        slide_count_client: slideCountClient,
      },
      tokenCost: geminiResponse.usage.costUsd,
    })

    return NextResponse.json({
      slides_deck_id_ecd: slidesDeckIdEcd,
      slides_deck_id_client: slidesDeckIdClient,
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
