/**
 * Gemini adapter — the single file that calls Vertex AI Gemini.
 *
 * Pattern: swap this file to change LLM provider. Everything else calls
 * `callGemini()` or `parseGeminiJson()`. Based on the predecessor pattern at
 * `backend/agent/src/providers/anthropic.adapter.ts`.
 *
 * Default model: gemini-2.5-flash
 * Cost tracking: extracts usageMetadata from every response
 */

import { VertexAI } from "@google-cloud/vertexai"

// ── Client ───────────────────────────────────────────────────────────────────

const LOCATION = process.env["VERTEX_LOCATION"] ?? "us-central1"
const PROJECT = process.env["GCP_PROJECT_ID"] ?? ""
const DEFAULT_MODEL = "gemini-2.5-flash"

// Lazy init — avoids instantiation during test runs that mock the SDK
let _vertexAI: VertexAI | null = null
function vertexAI(): VertexAI {
  if (!_vertexAI) {
    _vertexAI = new VertexAI({ project: PROJECT, location: LOCATION })
  }
  return _vertexAI
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface GeminiCallOptions {
  model?: string
  maxTokens?: number
  temperature?: number
  systemPrompt?: string
}

export interface GeminiResponse {
  text: string
  usage: {
    inputTokens: number
    outputTokens: number
    costUsd: number
  }
  model: string
}

// ── Pricing (Gemini 2.5 Flash, per 1k tokens) ────────────────────────────────

const PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash": {
    input: 0.00001875,
    output: 0.000075,
  },
}

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? PRICING["gemini-2.5-flash"]!
  return (inputTokens / 1000) * p.input + (outputTokens / 1000) * p.output
}

// ── Core call ────────────────────────────────────────────────────────────────

export async function callGemini(
  userMessage: string,
  options: GeminiCallOptions = {}
): Promise<GeminiResponse> {
  const modelName = options.model ?? DEFAULT_MODEL

  const model = vertexAI().getGenerativeModel({
    model: modelName,
    ...(options.systemPrompt !== undefined && {
      systemInstruction: { role: "system", parts: [{ text: options.systemPrompt }] },
    }),
    generationConfig: {
      maxOutputTokens: options.maxTokens ?? 2048,
      ...(options.temperature !== undefined && { temperature: options.temperature }),
    },
  })

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
  })

  const response = result.response

  // Extract text from candidates[0].content.parts[0].text
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? ""

  // Extract usage metadata
  const usage = response.usageMetadata ?? {}
  const inputTokens = usage.promptTokenCount ?? 0
  const outputTokens = usage.candidatesTokenCount ?? 0

  return {
    text,
    usage: {
      inputTokens,
      outputTokens,
      costUsd: calcCost(modelName, inputTokens, outputTokens),
    },
    model: modelName,
  }
}

// ── JSON parse + validate ────────────────────────────────────────────────────

/**
 * Parse structured JSON from a Gemini text response.
 *
 * Handles:
 *   - Raw JSON: `{"brand":"Nike"}`
 *   - Markdown-fenced: ```json ... ```
 *   - Mixed prose + JSON: extracts the outermost {...} block
 *
 * Returns the parsed object or null if parsing fails.
 */
export function parseGeminiJson(text: string): unknown | null {
  // Strip markdown code fences
  let stripped = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim()

  // Find outermost JSON object
  const start = stripped.indexOf("{")
  if (start === -1) return null

  let depth = 0
  let end = -1
  for (let i = start; i < stripped.length; i++) {
    if (stripped[i] === "{") depth++
    else if (stripped[i] === "}") {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end === -1) return null

  try {
    return JSON.parse(stripped.slice(start, end + 1))
  } catch {
    return null
  }
}

/**
 * Validate an object matches the parsed_brief schema (PRD §5 Stage 1).
 * Returns an array of gap descriptions, or empty if valid.
 */
export function validateParsedBrief(
  parsed: unknown
): { valid: boolean; gaps: string[] } {
  const gaps: string[] = []
  if (typeof parsed !== "object" || parsed === null) {
    return { valid: false, gaps: ["Response is not an object"] }
  }
  const p = parsed as Record<string, unknown>

  if (typeof p["brand"] !== "string" || !p["brand"].trim()) gaps.push("brand")
  if (typeof p["campaign_objective"] !== "string" || !p["campaign_objective"].trim())
    gaps.push("campaign_objective")
  if (typeof p["target_audience"] !== "object" || p["target_audience"] === null) {
    gaps.push("target_audience")
  } else {
    const ta = p["target_audience"] as Record<string, unknown>
    if (typeof ta["primary"] !== "string" || !ta["primary"].trim())
      gaps.push("target_audience.primary")
  }
  if (typeof p["key_message"] !== "string" || !p["key_message"].trim())
    gaps.push("key_message")
  if (!Array.isArray(p["tone_descriptors"])) gaps.push("tone_descriptors")
  if (typeof p["confidence_score"] !== "number") gaps.push("confidence_score")

  if (!Array.isArray(p["brief_gaps"])) {
    // Auto-populate brief_gaps from missing fields
    ;(p as Record<string, unknown>)["brief_gaps"] = gaps.length > 0 ? gaps : []
  }

  return { valid: gaps.length === 0, gaps }
}
