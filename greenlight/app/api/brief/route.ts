/**
 * POST /api/brief — parse a creative brief via Gemini 2.5 Flash.
 *
 * Input:  { brief: string, brandRules?: Record<string, string> }
 * Output: { parsed_brief: {...}, runId: string }
 *
 * Writes the parsed brief to Firestore and trace files to git.
 */

import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { callGemini, parseGeminiJson } from "@greenlight/lib/genkit"
import { validateParsedBrief } from "@greenlight/lib/gemini"
import { writeStageRecord } from "@greenlight/lib/firestore"
import {
  writeBriefInput,
  writeStageOutput,
  writeAgentTrace,
} from "@greenlight/lib/tracer"
import { commitStage } from "@greenlight/lib/traces"
import { BRIEF_PARSING_SYSTEM_PROMPT } from "@greenlight/lib/prompts/brief-parsing"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const { brief, brandRules, runId: existingRunId } = (await req.json()) as {
      brief?: string
      brandRules?: Record<string, string>
      runId?: string
    }

    if (!brief?.trim()) {
      return NextResponse.json(
        { error: "Brief text is required" },
        { status: 400 }
      )
    }

    const runId = existingRunId ?? `run-${Date.now()}-${randomUUID().slice(0, 6)}`

    // Stage 0: write raw brief input (git trace)
    writeBriefInput(runId, brief, brandRules as Record<string, unknown> | undefined)

    // Stage 1: call Gemini 2.5 Flash
    const systemPrompt = brandRules
      ? `${BRIEF_PARSING_SYSTEM_PROMPT}\n\nBrand rules:\n${JSON.stringify(brandRules, null, 2)}`
      : BRIEF_PARSING_SYSTEM_PROMPT

    const startedAt = Date.now()
    const response = await callGemini(brief, {
      systemPrompt,
      maxTokens: 2048,
    })
    const durationMs = Date.now() - startedAt

    // Parse + validate
    const parsed = parseGeminiJson(response.text)
    if (!parsed) {
      return NextResponse.json(
        { error: "Failed to parse Gemini response as JSON", raw: response.text },
        { status: 502 }
      )
    }

    const { valid, gaps } = validateParsedBrief(parsed)
    const parsedBrief = parsed as Record<string, unknown>

    // Surface gaps from the validator if the model didn't populate them
    if (!Array.isArray(parsedBrief["brief_gaps"]) || (parsedBrief["brief_gaps"] as unknown[]).length === 0) {
      parsedBrief["brief_gaps"] = gaps
    }

    const confidenceScore =
      typeof parsedBrief["confidence_score"] === "number"
        ? parsedBrief["confidence_score"]
        : valid ? 0.8 : 0.5

    // Verification checks
    const verification = [
      { check: "schema valid", passed: valid, ...(!valid && { detail: gaps.join(", ") }) },
      { check: "confidence ≥ 0.5", passed: confidenceScore >= 0.5, detail: `confidence: ${confidenceScore}` },
      { check: "brief_gaps populated", passed: Array.isArray(parsedBrief["brief_gaps"]) && (parsedBrief["brief_gaps"] as unknown[]).length >= 0 },
    ]

    // Write agent trace (git)
    const agentTrace = writeAgentTrace({
      stage: "brief-parsing",
      runId,
      model: response.model,
      systemPrompt,
      userMessage: brief,
      rawResponse: response.text,
      parsedOutput: parsedBrief,
      usage: response.usage,
      durationMs,
      verification,
    })

    // Write stage output (git)
    writeStageOutput({
      stage: "brief-parsing",
      runId,
      data: parsedBrief,
      metadata: {
        pipelineComponent: "brief-parsing-v1",
        model: response.model,
        confidenceScore,
        ...response.usage,
      },
    })

    // Write to Firestore (include raw brief for later editing)
    await writeStageRecord({
      stage: "brief-parsing",
      runId,
      data: {
        ...parsedBrief,
        _rawBrief: brief,
        ...(brandRules !== undefined && { _brandRules: brandRules }),
      },
      tokenCost: response.usage.costUsd,
      confidenceScore,
    })

    // Commit traces to git (fire-and-forget — don't block the response)
    try {
      commitStage(runId, "brief-parsing", valid)
    } catch (err) {
      console.warn("[tracer] git commit failed (non-fatal):", err)
    }

    return NextResponse.json({
      parsed_brief: parsedBrief,
      runId,
      usage: response.usage,
      verification,
    })
  } catch (err) {
    console.error("[brief] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    )
  }
}
