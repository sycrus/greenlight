/**
 * POST /api/visual-dna — encode a territory into a Visual DNA object.
 *
 * Input:  { runId: string, territory: Territory, brandRules?: Record<string, string> }
 * Output: { visual_dna: VisualDNA, cost: {...} }
 *
 * Called once per territory (3× parallel). Each call encodes one territory
 * into a machine-readable Visual DNA specification with palette, ingredients,
 * cinematography, and brand rule translations.
 */

import { NextResponse } from "next/server"
import { callGemini, parseGeminiJson, validateVisualDNA } from "@greenlight/lib/gemini"
import { readStageRecord, writeStageRecord } from "@greenlight/lib/firestore"
import { VISUAL_DNA_SYSTEM_PROMPT } from "@greenlight/lib/prompts/visual-dna"
import type { Territory, VisualDNA } from "@greenlight/lib/types/pipeline"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const { runId, territory, brandRules } = (await req.json()) as {
      runId?: string
      territory?: Territory
      brandRules?: Record<string, string>
    }

    if (!runId?.trim()) {
      return NextResponse.json(
        { error: "runId is required" },
        { status: 400 }
      )
    }

    if (!territory?.id) {
      return NextResponse.json(
        { error: "A valid territory with an id is required" },
        { status: 400 }
      )
    }

    // Build the user message
    let userMessage = JSON.stringify({ territory }, null, 2)

    if (brandRules && Object.keys(brandRules).length > 0) {
      userMessage += `\n\nBrand Rules:\n${JSON.stringify(brandRules, null, 2)}`
    }

    const systemPrompt = brandRules
      ? `${VISUAL_DNA_SYSTEM_PROMPT}\n\nBRAND RULES TO ENFORCE:\n${JSON.stringify(brandRules, null, 2)}`
      : VISUAL_DNA_SYSTEM_PROMPT

    // Call Gemini
    const response = await callGemini(userMessage, {
      systemPrompt,
      maxTokens: 8192,
      temperature: 0.7,
    })

    // Parse + validate
    const parsed = parseGeminiJson(response.text)
    if (!parsed) {
      return NextResponse.json(
        { error: "Failed to parse Gemini response as JSON", raw: response.text },
        { status: 502 }
      )
    }

    const { valid, gaps, visualDna } = validateVisualDNA(parsed)

    if (!visualDna) {
      return NextResponse.json(
        {
          error: "Failed to extract visual_dna from response",
          gaps,
          raw: response.text.slice(0, 500),
        },
        { status: 502 }
      )
    }

    // Ensure territory_id matches
    if (visualDna["territory_id"] !== territory.id) {
      visualDna["territory_id"] = territory.id
    }

    // Read existing visual-dna doc (if any) and merge
    const existing = await readStageRecord(runId, "visual-dna")
    const existingTerritories =
      (existing?.["territories"] as Record<string, unknown>) ?? {}

    const mergedTerritories = {
      ...existingTerritories,
      [territory.id]: visualDna,
    }

    const totalCost =
      (response.usage.costUsd) +
      (typeof existing?.["_meta"] === "object" && existing?.["_meta"] !== null
        ? ((existing["_meta"] as Record<string, unknown>)["tokenCost"] as number) ?? 0
        : 0)

    // Write to Firestore (merge with existing Visual DNA objects)
    await writeStageRecord({
      stage: "visual-dna",
      runId,
      data: {
        territories: mergedTerritories,
      },
      tokenCost: totalCost,
    })

    return NextResponse.json({
      visual_dna: visualDna as unknown as VisualDNA,
      validation: { valid, gaps },
      cost: {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        costUsd: response.usage.costUsd,
      },
      note:
        Object.keys(existingTerritories).length > 0
          ? `Merged with existing visual DNA for territories: ${Object.keys(existingTerritories).join(", ")}`
          : undefined,
    })
  } catch (err) {
    console.error("[visual-dna] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    )
  }
}
