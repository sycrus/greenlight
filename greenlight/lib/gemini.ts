/**
 * Gemini + Imagen adapter — the single file that calls Vertex AI models.
 *
 * Pattern: swap this file to change LLM provider. Everything else calls
 * `callGemini()`, `parseGeminiJson()`, or `generateImage()`.
 * Based on the predecessor pattern at
 * `backend/agent/src/providers/anthropic.adapter.ts`.
 *
 * Default Gemini model: gemini-2.5-flash
 * Imagen model: imagen-3.0-generate-001
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
    const keyJson = process.env["GCP_SERVICE_ACCOUNT_KEY"]
    _vertexAI = new VertexAI({
      project: PROJECT,
      location: LOCATION,
      ...(keyJson && {
        googleAuthOptions: {
          credentials: JSON.parse(keyJson),
        },
      }),
    })
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

// ── Stage 2: Territory validation ─────────────────────────────────────────────

/**
 * Validate an array of territory objects (PRD §5 Stage 2).
 * Checks schema compliance and divergence between territories.
 */
export function validateTerritories(
  parsed: unknown
): { valid: boolean; gaps: string[]; territories: Record<string, unknown>[] } {
  const gaps: string[] = []
  const territories: Record<string, unknown>[] = []

  if (typeof parsed !== "object" || parsed === null) {
    return { valid: false, gaps: ["Response is not an object"], territories: [] }
  }

  const p = parsed as Record<string, unknown>
  const arr = Array.isArray(p["territories"]) ? p["territories"] : (Array.isArray(parsed) ? parsed : null)

  if (!arr || !Array.isArray(arr)) {
    return { valid: false, gaps: ["territories array is missing or not an array"], territories: [] }
  }

  if (arr.length < 3) {
    gaps.push(`Expected 3 territories, got ${arr.length}`)
  }

  for (let i = 0; i < (arr as unknown[]).length; i++) {
    const t = (arr as unknown[])[i] as Record<string, unknown> | null
    if (!t || typeof t !== "object") {
      gaps.push(`territories[${i}] is not an object`)
      continue
    }
    territories.push(t)

    const requiredStrings = [
      "id",
      "name",
      "creative_proposition",
      "visual_language",
      "tone",
      "emotional_arc",
      "flow_prompt_style",
    ]
    for (const field of requiredStrings) {
      if (typeof t[field] !== "string" || !(t[field] as string).trim()) {
        gaps.push(`territories[${i}].${field} is missing or empty`)
      }
    }

    if (typeof t["scene_count_suggestion"] !== "number" || (t["scene_count_suggestion"] as number) < 1) {
      gaps.push(`territories[${i}].scene_count_suggestion must be a positive number`)
    }

    if (!Array.isArray(t["negative_constraints"])) {
      gaps.push(`territories[${i}].negative_constraints must be an array`)
    }

    // risk_flag is optional — null or string
    if (t["risk_flag"] !== null && t["risk_flag"] !== undefined && typeof t["risk_flag"] !== "string") {
      gaps.push(`territories[${i}].risk_flag must be null or a string`)
    }
  }

  // Divergence check: territories should not share visual_language descriptors
  if (territories.length >= 2) {
    const visualLanguages = territories.map((t) =>
      ((t["visual_language"] as string) ?? "").toLowerCase().split(/[,\s]+/).filter(Boolean)
    )
    for (let i = 0; i < visualLanguages.length; i++) {
      for (let j = i + 1; j < visualLanguages.length; j++) {
        const overlap = visualLanguages[i]!.filter((w) =>
          visualLanguages[j]!.includes(w) && w.length > 3
        )
        if (overlap.length > 2) {
          gaps.push(
            `Divergence warning: territories[${i}] and territories[${j}] share visual language terms: ${overlap.join(", ")}`
          )
        }
      }
    }
  }

  return { valid: gaps.filter((g) => !g.startsWith("Divergence warning")).length === 0 && territories.length >= 3, gaps, territories }
}

// ── Stage 3: Visual DNA validation ─────────────────────────────────────────────

/**
 * Validate a Visual DNA object (PRD §5 Stage 3).
 * Checks schema compliance, palette format, ingredient count, cinematography coherence.
 */
export function validateVisualDNA(
  parsed: unknown
): { valid: boolean; gaps: string[]; visualDna: Record<string, unknown> | null } {
  const gaps: string[] = []

  if (typeof parsed !== "object" || parsed === null) {
    return { valid: false, gaps: ["Response is not an object"], visualDna: null }
  }

  const p = parsed as Record<string, unknown>
  const vd = (p["visual_dna"] as Record<string, unknown>) ?? p

  if (typeof vd !== "object" || vd === null) {
    return { valid: false, gaps: ["visual_dna is not an object"], visualDna: null }
  }

  // Required top-level fields
  const topFields = ["territory_id", "version", "flow_scene_brief"]
  for (const field of topFields) {
    if (typeof vd[field] !== "string" || !(vd[field] as string).trim()) {
      gaps.push(`visual_dna.${field} is missing or empty`)
    }
  }

  // Palette validation
  if (typeof vd["palette"] !== "object" || vd["palette"] === null) {
    gaps.push("visual_dna.palette is missing")
  } else {
    const palette = vd["palette"] as Record<string, unknown>
    for (const key of ["primary", "accent", "forbidden"]) {
      if (!Array.isArray(palette[key])) {
        gaps.push(`visual_dna.palette.${key} must be an array`)
      } else {
        const arr = palette[key] as unknown[]
        for (let i = 0; i < arr.length; i++) {
          const hex = arr[i]
          if (typeof hex !== "string" || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
            gaps.push(`visual_dna.palette.${key}[${i}] is not a valid hex color (expected #rrggbb)`)
          }
        }
      }
    }
  }

  // Ingredients validation
  if (!Array.isArray(vd["ingredients"])) {
    gaps.push("visual_dna.ingredients must be an array")
  } else {
    const ingredients = vd["ingredients"] as Record<string, unknown>[]
    if (ingredients.length < 4) {
      gaps.push(`visual_dna.ingredients must have at least 4 entries (got ${ingredients.length})`)
    }

    const types = new Set<string>()
    const validTypes = ["character", "location", "object", "brand_asset"]

    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i]
      if (ing) {
        if (typeof ing["ingredient_id"] !== "string" || !ing["ingredient_id"]) {
          gaps.push(`visual_dna.ingredients[${i}].ingredient_id is missing`)
        }
        if (!validTypes.includes(ing["type"] as string)) {
          gaps.push(`visual_dna.ingredients[${i}].type must be one of: ${validTypes.join(", ")}`)
        } else {
          types.add(ing["type"] as string)
        }
        if (typeof ing["description"] !== "string" || !ing["description"]) {
          gaps.push(`visual_dna.ingredients[${i}].description is missing`)
        }
        if (typeof ing["flow_ingredient_prompt"] !== "string" || !ing["flow_ingredient_prompt"]) {
          gaps.push(`visual_dna.ingredients[${i}].flow_ingredient_prompt is missing`)
        }
      }
    }

    // Check at least one of each type
    for (const t of validTypes) {
      if (!types.has(t)) {
        gaps.push(`visual_dna.ingredients is missing at least one "${t}" type`)
      }
    }
  }

  // Cinematography validation
  if (typeof vd["cinematography"] !== "object" || vd["cinematography"] === null) {
    gaps.push("visual_dna.cinematography is missing")
  } else {
    const cine = vd["cinematography"] as Record<string, unknown>
    const cineFields = ["style", "camera_movement", "lighting", "color_grade"]
    for (const field of cineFields) {
      if (typeof cine[field] !== "string" || !(cine[field] as string).trim()) {
        gaps.push(`visual_dna.cinematography.${field} is missing or empty`)
      }
    }
    if (!Array.isArray(cine["preferred_shot_types"])) {
      gaps.push("visual_dna.cinematography.preferred_shot_types must be an array")
    } else if ((cine["preferred_shot_types"] as unknown[]).length < 3) {
      gaps.push("visual_dna.cinematography.preferred_shot_types must have at least 3 entries")
    }
  }

  // Brand rules as prompts
  if (!Array.isArray(vd["brand_rules_as_prompts"])) {
    gaps.push("visual_dna.brand_rules_as_prompts must be an array")
  }
  if (!Array.isArray(vd["negative_prompt_list"])) {
    gaps.push("visual_dna.negative_prompt_list must be an array")
  }

  return { valid: gaps.length === 0, gaps, visualDna: vd }
}

// ── Imagen 3 image generation ─────────────────────────────────────────────────

const IMAGEN_MODEL = "gemini-2.5-flash" // Gemini 2.5 Flash supports native image generation
const IMAGEN_COST_PER_IMAGE = 0.02 // approximate cost per reference image

export interface ImageGenerationOptions {
  prompt: string
  negativePrompt?: string
  aspectRatio?: "1:1" | "9:16" | "16:9"
}

export interface ImageGenerationResult {
  imageBuffer: Buffer
  costUsd: number
  model: string
}

/**
 * Generate a reference image using Gemini's native image generation.
 *
 * Gemini 2.5 Flash can output images via inlineData in response parts.
 * The same generateContent API is used — the model detects the image
 * generation intent from the prompt.
 *
 * FALLBACK: If image generation fails for any reason, generates a visible
 * placeholder PNG so the pipeline functions end-to-end.
 */
export async function generateImage(
  options: ImageGenerationOptions
): Promise<ImageGenerationResult> {
  try {
    const model = vertexAI().getGenerativeModel({
      model: IMAGEN_MODEL,
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.9,
      },
    })

    // Explicit image generation instruction
    const prompt = [
      "Generate an image:",
      options.prompt,
      "1:1 square format, photorealistic",
      options.negativePrompt ? `Do NOT include: ${options.negativePrompt}` : "",
    ]
      .filter(Boolean)
      .join(". ")

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    })

    const response = result.response

    // Check for inline image data in response parts
    const parts = response.candidates?.[0]?.content?.parts ?? []
    for (const part of parts) {
      const p = part as unknown as Record<string, unknown>
      if (p["inlineData"] && typeof p["inlineData"] === "object") {
        const inlineData = p["inlineData"] as Record<string, unknown>
        const mimeType = (inlineData["mimeType"] as string) ?? "image/png"
        if (typeof inlineData["data"] === "string") {
          console.log(`[gemini] Image generated successfully (${mimeType}, ${inlineData["data"].length} chars base64)`)
          return {
            imageBuffer: Buffer.from(inlineData["data"], "base64"),
            costUsd: IMAGEN_COST_PER_IMAGE,
            model: IMAGEN_MODEL,
          }
        }
      }
      // Some models return image URLs instead of inline data
      if (p["fileData"] && typeof p["fileData"] === "object") {
        const fd = p["fileData"] as Record<string, unknown>
        console.log(`[gemini] Model returned fileData instead of inlineData: ${JSON.stringify(fd).slice(0, 300)}`)
      }
    }

    // Log what we got and fall back
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
    console.warn(`[gemini] No inline image in response. Text (first 300 chars): ${(text as string).slice(0, 300)}`)
    console.warn(`[gemini] Parts count: ${parts.length}, types: ${parts.map((p: unknown) => Object.keys(p as object)[0]).join(", ")}`)
    return generatePlaceholder(options)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[gemini] Image generation failed: ${message.slice(0, 300)} — using visible placeholder`)
    return generatePlaceholder(options)
  }
}

/**
 * Generate a visible placeholder PNG when image generation is unavailable.
 * Creates a 512×512 image with colored background so it's clearly visible in the UI.
 */
function generatePlaceholder(options: ImageGenerationOptions): ImageGenerationResult {
  const png = createPlaceholderPng(512, 512)
  return {
    imageBuffer: png,
    costUsd: 0,
    model: "placeholder",
  }
}

/**
 * Create a visible placeholder PNG (512×512) using Node.js zlib.
 * Shows a dark gray background with a lighter center stripe — visibly
 * distinct from a broken image so users can tell it loaded.
 */
function createPlaceholderPng(width: number, height: number): Buffer {
  const zlib = require("zlib") as typeof import("zlib")

  // Build raw pixel data with filter byte per row
  const rawData: Buffer[] = []
  for (let y = 0; y < height; y++) {
    rawData.push(Buffer.from([0])) // filter: None
    const row = Buffer.alloc(width * 4)
    for (let x = 0; x < width; x++) {
      const offset = x * 4
      // Create a gradient/pattern: darker edges, lighter center
      const isCenter = Math.abs(x - width / 2) < 60 || Math.abs(y - height / 2) < 60
      row[offset] = isCenter ? 0x55 : 0x2A     // R
      row[offset + 1] = isCenter ? 0x55 : 0x2A // G
      row[offset + 2] = isCenter ? 0x55 : 0x2A // B
      row[offset + 3] = 0xFF                     // A (fully opaque)
    }
    rawData.push(row)
  }

  const uncompressed = Buffer.concat(rawData)
  const compressed = zlib.deflateSync(uncompressed)

  // PNG chunks
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)   // width
  ihdrData.writeUInt32BE(height, 4)  // height
  ihdrData.writeUInt8(8, 8)          // bit depth
  ihdrData.writeUInt8(6, 9)          // color type: RGBA
  ihdrData.writeUInt8(0, 10)         // compression
  ihdrData.writeUInt8(0, 11)         // filter
  ihdrData.writeUInt8(0, 12)         // interlace
  const ihdr = createChunk("IHDR", ihdrData)

  // IDAT
  const idat = createChunk("IDAT", compressed)

  // IEND
  const iend = createChunk("IEND", Buffer.alloc(0))

  return Buffer.concat([signature, ihdr, idat, iend])
}

/** Build a PNG chunk: 4-byte length + 4-byte type + data + 4-byte CRC */
function createChunk(type: string, data: Buffer): Buffer {
  const { crc32 } = require("zlib") as typeof import("zlib")
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuffer = Buffer.from(type, "ascii")
  const crcInput = Buffer.concat([typeBuffer, data])
  const crcValue = crc32(crcInput)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crcValue, 0)
  return Buffer.concat([length, typeBuffer, data, crcBuf])
}
