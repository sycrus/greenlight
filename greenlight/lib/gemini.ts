/**
 * Gemini adapter — the single file that calls Vertex AI.
 *
 * Pattern: swap this file to change LLM provider. Everything else calls
 * `callGemini()` or `parseGeminiJson()`. Based on the predecessor pattern at
 * `backend/agent/src/providers/anthropic.adapter.ts`.
 *
 * Default model: gemini-2.5-flash-001
 * Cost tracking: extracts usageMetadata from every response
 */

import { PredictionServiceClient } from "@google-cloud/aiplatform"
import type { protos } from "@google-cloud/aiplatform"

// ── Client ───────────────────────────────────────────────────────────────────

const LOCATION = process.env["VERTEX_LOCATION"] ?? "asia-southeast1"
const PROJECT = process.env["GCP_PROJECT_ID"] ?? ""
const DEFAULT_MODEL = "gemini-2.5-flash-001"

// Lazy init — avoids instantiation during test runs that mock the SDK
let _client: PredictionServiceClient | null = null
function client(): PredictionServiceClient {
  if (!_client) {
    _client = new PredictionServiceClient({
      apiEndpoint: `${LOCATION}-aiplatform.googleapis.com`,
    })
  }
  return _client
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
  "gemini-2.5-flash-001": {
    input: 0.00001875,
    output: 0.000075,
  },
}

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? PRICING["gemini-2.5-flash-001"]!
  return (inputTokens / 1000) * p.input + (outputTokens / 1000) * p.output
}

// ── Core call ────────────────────────────────────────────────────────────────

export async function callGemini(
  userMessage: string,
  options: GeminiCallOptions = {}
): Promise<GeminiResponse> {
  const model = options.model ?? DEFAULT_MODEL
  const modelPath = `projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/${model}`

  const instances: protos.google.protobuf.IValue[] = [
    {
      structValue: {
        fields: {
          contents: {
            listValue: {
              values: [
                {
                  structValue: {
                    fields: {
                      role: { stringValue: "user" },
                      parts: {
                        listValue: {
                          values: [{ structValue: { fields: { text: { stringValue: userMessage } } } }],
                        },
                      },
                    },
                  },
                },
              ],
            },
          },
          ...(options.systemPrompt !== undefined && {
            systemInstruction: {
              structValue: {
                fields: {
                  parts: {
                    listValue: {
                      values: [{ structValue: { fields: { text: { stringValue: options.systemPrompt } } } }],
                    },
                  },
                },
              },
            },
          }),
          generationConfig: {
            structValue: {
              fields: {
                maxOutputTokens: { numberValue: options.maxTokens ?? 2048 },
                ...(options.temperature !== undefined && {
                  temperature: { numberValue: options.temperature },
                }),
              },
            },
          },
        },
      },
    },
  ]

  const [response] = await client().predict({
    endpoint: modelPath,
    instances: instances as unknown as protos.google.protobuf.IValue[],
  })

  const predictions = response.predictions ?? []
  const prediction = predictions[0]
  const struct = prediction?.structValue?.fields

  // Extract text from candidates[0].content.parts[0].text
  const text =
    struct?.candidates?.listValue?.values?.[0]
      ?.structValue?.fields?.content?.structValue?.fields?.parts?.listValue
      ?.values?.[0]?.structValue?.fields?.text?.stringValue ?? ""

  // Extract usage metadata
  const usageMetadata = response.metadata?.structValue?.fields?.["usageMetadata"]
    ?.structValue?.fields
  const inputTokens = Number(usageMetadata?.["promptTokenCount"]?.numberValue ?? 0)
  const outputTokens = Number(usageMetadata?.["candidatesTokenCount"]?.numberValue ?? 0)

  return {
    text,
    usage: {
      inputTokens,
      outputTokens,
      costUsd: calcCost(model, inputTokens, outputTokens),
    },
    model,
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
