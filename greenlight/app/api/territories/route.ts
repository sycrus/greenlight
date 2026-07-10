/**
 * POST /api/territories — generate 3 creative territories from a parsed brief.
 *
 * Input:  { runId: string, brandRules?: Record<string, string> }
 * Output: { territories: Territory[], divergenceWarnings: string[], cost: {...} }
 *
 * Reads the parsed brief from Firestore, calls Gemini 2.5 Flash to generate
 * 3 mutually exclusive creative territories, validates them, and writes
 * the result to Firestore.
 */

import { NextResponse } from "next/server"
import { callGemini, parseGeminiJson } from "@greenlight/lib/llm"
import { validateTerritories } from "@greenlight/lib/gemini"
import { readStageRecord, writeStageRecord } from "@greenlight/lib/firestore"
import { TERRITORY_GENERATION_SYSTEM_PROMPT } from "@greenlight/lib/prompts/territory-generation"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const { runId, brandRules } = (await req.json()) as {
      runId?: string
      brandRules?: Record<string, string>
    }

    if (!runId?.trim()) {
      return NextResponse.json(
        { error: "runId is required" },
        { status: 400 }
      )
    }

    // Read the parsed brief from Stage 1
    const briefRecord = await readStageRecord(runId, "brief-parsing")
    if (!briefRecord) {
      return NextResponse.json(
        { error: "No parsed brief found for this run. Run Stage 1 first." },
        { status: 400 }
      )
    }

    // Build the user message: parsed brief + optional brand rules
    const parsedBrief = { ...briefRecord }
    delete parsedBrief["_meta"]

    let userMessage = JSON.stringify({ parsed_brief: parsedBrief }, null, 2)

    if (brandRules && Object.keys(brandRules).length > 0) {
      userMessage += `\n\nBrand Rules:\n${JSON.stringify(brandRules, null, 2)}`
    }

    // Build system prompt with optional brand rules context
    const systemPrompt = brandRules
      ? `${TERRITORY_GENERATION_SYSTEM_PROMPT}\n\nIMPORTANT: The following brand rules MUST be respected by all territories. Flag any territory that contradicts a rule in its risk_flag:\n${JSON.stringify(brandRules, null, 2)}`
      : TERRITORY_GENERATION_SYSTEM_PROMPT

    // Call Gemini
    const response = await callGemini(userMessage, {
      systemPrompt,
      maxTokens: 8192,
      temperature: 0.9, // Higher temperature for creative divergence
    })

    // Parse + validate
    const parsed = parseGeminiJson(response.text)
    if (!parsed) {
      return NextResponse.json(
        { error: "Failed to parse Gemini response as JSON", raw: response.text },
        { status: 502 }
      )
    }

    const { valid, gaps, territories } = validateTerritories(parsed)

    if (territories.length < 3) {
      return NextResponse.json(
        {
          error: `Generated only ${territories.length} territories (need 3)`,
          gaps,
          raw: response.text.slice(0, 500),
        },
        { status: 502 }
      )
    }

    const divergenceWarnings = gaps.filter((g) => g.startsWith("Divergence warning"))

    // Write to Firestore
    await writeStageRecord({
      stage: "territory-generation",
      runId,
      data: {
        territories,
        divergenceWarnings,
        _validation: { valid, gaps: gaps.filter((g) => !g.startsWith("Divergence warning")) },
      },
      tokenCost: response.usage.costUsd,
    })

    return NextResponse.json({
      territories,
      divergenceWarnings,
      validation: { valid, gaps },
      cost: {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        costUsd: response.usage.costUsd,
      },
    })
  } catch (err) {
    console.error("[territories] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/territories — update fields on a single territory without regenerating.
 * Input: { runId, territoryId: string, fields: { name?, creative_proposition?, tone?, ... } }
 */
export async function PATCH(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      runId?: string; territoryId?: string; fields?: Record<string, unknown>
    }
    const { runId, territoryId, fields } = body
    if (!runId || !territoryId || !fields) {
      return NextResponse.json({ error: "runId, territoryId, and fields are required" }, { status: 400 })
    }

    const doc = await readStageRecord(runId, "territory-generation")
    if (!doc?.["territories"]) {
      return NextResponse.json({ error: "No territories found for this run" }, { status: 404 })
    }

    const territories = doc["territories"] as Array<Record<string, unknown>>
    const idx = territories.findIndex((t) => t["id"] === territoryId)
    if (idx === -1) {
      return NextResponse.json({ error: `Territory ${territoryId} not found` }, { status: 404 })
    }

    // Merge fields into the territory
    territories[idx] = { ...territories[idx], ...fields }

    await writeStageRecord({
      stage: "territory-generation",
      runId,
      data: { territories, divergenceWarnings: doc["divergenceWarnings"] ?? [] },
    })

    return NextResponse.json({ territory: territories[idx] })
  } catch (err) {
    console.error("[territories PATCH] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/territories — remove a single territory.
 * Input: { runId, territoryId: string }
 */
export async function DELETE(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { runId?: string; territoryId?: string }
    const { runId, territoryId } = body
    if (!runId || !territoryId) {
      return NextResponse.json({ error: "runId and territoryId are required" }, { status: 400 })
    }

    const doc = await readStageRecord(runId, "territory-generation")
    if (!doc?.["territories"]) {
      return NextResponse.json({ error: "No territories found" }, { status: 404 })
    }

    const territories = doc["territories"] as Array<Record<string, unknown>>
    const filtered = territories.filter((t) => t["id"] !== territoryId)
    if (filtered.length === territories.length) {
      return NextResponse.json({ error: `Territory ${territoryId} not found` }, { status: 404 })
    }

    await writeStageRecord({
      stage: "territory-generation",
      runId,
      data: { territories: filtered, divergenceWarnings: doc["divergenceWarnings"] ?? [] },
    })

    // Cascade: also delete Visual DNA for this territory
    const vdDoc = await readStageRecord(runId, "visual-dna")
    const vdTerritories = (vdDoc?.["territories"] as Record<string, unknown>) ?? {}
    const hadVd = !!vdTerritories[territoryId]
    if (hadVd) {
      delete vdTerritories[territoryId]
      await writeStageRecord({ stage: "visual-dna", runId, data: { territories: vdTerritories } })
    }

    return NextResponse.json({ deleted: territoryId, remaining: filtered.length, cascade: { visualDna: hadVd } })
  } catch (err) {
    console.error("[territories DELETE] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    )
  }
}
