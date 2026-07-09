/**
 * Genkit adapter — single file for all AI model calls.
 *
 * Replaces lib/gemini.ts. Uses @genkit-ai/google-genai with Vertex AI
 * (ADC auth — same service account as before).
 *
 * Benefits:
 *   - Native Imagen 3 support via `output: { format: 'media' }`
 *   - Zod schema structured output
 *   - Unified generate() API
 */

import { genkit, z } from "genkit"
import { vertexAI, googleAI } from "@genkit-ai/google-genai"

// ── Client ───────────────────────────────────────────────────────────────────

const LOCATION = process.env["VERTEX_LOCATION"] ?? "us-central1"
const PROJECT = process.env["GCP_PROJECT_ID"] ?? ""

let _ai: ReturnType<typeof genkit> | null = null

/** Exposed for testing — allows tests to inject a mock. */
export function setAiInstance(mock: ReturnType<typeof genkit>): void {
  _ai = mock
}

function ai() {
  if (!_ai) {
    const plugins: Parameters<typeof genkit>[0]["plugins"] = [
      vertexAI({
        projectId: PROJECT,
        location: LOCATION,
      }),
    ]
    // Add googleAI plugin for image generation if API key is available
    if (process.env["GEMINI_API_KEY"]) {
      plugins.push(googleAI({ apiKey: process.env["GEMINI_API_KEY"] }))
    }
    _ai = genkit({ plugins })
  }
  return _ai
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface GeminiCallOptions {
  model?: string
  maxTokens?: number
  temperature?: number
  systemPrompt?: string
  schema?: z.ZodTypeAny
}

export interface GeminiResponse<T = unknown> {
  text: string
  output?: T
  usage: { inputTokens: number; outputTokens: number; costUsd: number }
  model: string
}

export interface ImageGenerationOptions {
  prompt: string
  negativePrompt?: string
  aspectRatio?: "1:1" | "9:16" | "16:9"
}

export interface ImageGenerationResult {
  imageBuffer: Buffer
  costUsd: number
  model: string
  /** Error message if generation failed and placeholder was used */
  error?: string
}

// ── Pricing ──────────────────────────────────────────────────────────────────

const PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash": { input: 0.00001875, output: 0.000075 },
}

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const name = model.split("/").pop() ?? model
  const p = PRICING[name] ?? PRICING["gemini-2.5-flash"]!
  return (inputTokens / 1000) * p.input + (outputTokens / 1000) * p.output
}

// ── Core Gemini call ─────────────────────────────────────────────────────────

const DEFAULT_MODEL = "vertexai/gemini-2.5-flash"

export async function callGemini<T = unknown>(
  userMessage: string,
  options: GeminiCallOptions = {}
): Promise<GeminiResponse<T>> {
  const modelRef = options.model ?? DEFAULT_MODEL

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generateArgs: Record<string, any> = {
    model: modelRef,
    prompt: userMessage,
    config: {} as Record<string, unknown>,
  }

  if (options.systemPrompt) {
    generateArgs.system = options.systemPrompt
  }
  if (options.maxTokens) {
    (generateArgs.config as Record<string, unknown>).maxOutputTokens = options.maxTokens
  }
  if (options.temperature !== undefined) {
    (generateArgs.config as Record<string, unknown>).temperature = options.temperature
  }
  if (options.schema) {
    generateArgs.output = { format: "json", schema: options.schema }
  }

  const response = await ai().generate(generateArgs)

  const text = response.text
  const usage = response.usage
  const inputTokens = usage?.inputTokens ?? 0
  const outputTokens = usage?.outputTokens ?? 0

  const result: GeminiResponse<T> = {
    text,
    usage: {
      inputTokens,
      outputTokens,
      costUsd: calcCost(modelRef, inputTokens, outputTokens),
    },
    model: modelRef,
  }

  if (options.schema !== undefined) {
    ;(result as unknown as Record<string, unknown>).output = response.output as T | null
  }

  return result
}

// ── Legacy JSON parse (kept for backward compat) ────────────────────────────

export function parseGeminiJson(text: string): unknown | null {
  let stripped = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim()
  const start = stripped.indexOf("{")
  if (start === -1) return null
  let depth = 0
  let end = -1
  for (let i = start; i < stripped.length; i++) {
    if (stripped[i] === "{") depth++
    else if (stripped[i] === "}") {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  if (end === -1) return null
  try { return JSON.parse(stripped.slice(start, end + 1)) }
  catch { return null }
}

// ── Image generation (Imagen + Gemini image models) ─────────────────────────

const IMAGEN_COST_PER_IMAGE = 0.02

// Models to try in order: Gemini image (Vertex AI, no API key needed) → Imagen (Google AI, needs API key)
const IMAGE_MODELS = [
  { ref: "vertexai/gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image (Vertex AI)" },
  { ref: "googleai/imagen-4.0-fast-generate-001", label: "Imagen 4 Fast (Google AI)" },
]

export async function generateImage(
  options: ImageGenerationOptions
): Promise<ImageGenerationResult> {
  const prompt = [
    "Generate a photorealistic image:",
    options.prompt,
    options.aspectRatio === "9:16" ? "vertical 9:16 format" : "square 1:1 format",
    "high quality, professional",
  ].join(". ")

  const errors: string[] = []

  for (const model of IMAGE_MODELS) {
    try {
      console.log(`[genkit] Trying image model: ${model.label}`)
      const response = await ai().generate({
        model: model.ref,
        prompt,
      })

      const media = response.media
      if (media?.url) {
        const base64 = media.url.replace(/^data:image\/\w+;base64,/, "")
        if (base64 && base64.length > 100) {
          console.log(`[genkit] ${model.label} succeeded (${base64.length} chars base64)`)
          return {
            imageBuffer: Buffer.from(base64, "base64"),
            costUsd: IMAGEN_COST_PER_IMAGE,
            model: model.ref,
          }
        }
        errors.push(`${model.label}: base64 too short (${base64.length} chars)`)
      } else if (response.text) {
        errors.push(`${model.label}: returned text, not image — "${response.text.slice(0, 100)}"`)
      } else {
        errors.push(`${model.label}: no media or text — finishReason: ${response.finishReason ?? "unknown"}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`${model.label}: ${message.slice(0, 200)}`)
      console.warn(`[genkit] ${model.label} failed: ${message.slice(0, 200)}`)
    }
  }

  const errorDetail = errors.join(" | ")
  console.warn(`[genkit] All image models failed: ${errorDetail}`)
  return { ...generatePlaceholder(), error: errorDetail }
}

// ── Placeholder ──────────────────────────────────────────────────────────────

function generatePlaceholder(): ImageGenerationResult {
  return { imageBuffer: createPlaceholderPng(512, 512), costUsd: 0, model: "placeholder" }
}

function createPlaceholderPng(width: number, height: number): Buffer {
  const zlib = require("zlib") as typeof import("zlib")
  const rawData: Buffer[] = []
  for (let y = 0; y < height; y++) {
    rawData.push(Buffer.from([0]))
    const row = Buffer.alloc(width * 4)
    for (let x = 0; x < width; x++) {
      const offset = x * 4
      const isCenter = Math.abs(x - width / 2) < 60 || Math.abs(y - height / 2) < 60
      row[offset] = isCenter ? 0x55 : 0x2A
      row[offset + 1] = isCenter ? 0x55 : 0x2A
      row[offset + 2] = isCenter ? 0x55 : 0x2A
      row[offset + 3] = 0xFF
    }
    rawData.push(row)
  }
  const uncompressed = Buffer.concat(rawData)
  const compressed = zlib.deflateSync(uncompressed)
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = createChunk("IHDR", buildIHDR(width, height))
  const idat = createChunk("IDAT", compressed)
  const iend = createChunk("IEND", Buffer.alloc(0))
  return Buffer.concat([signature, ihdr, idat, iend])
}

function buildIHDR(width: number, height: number): Buffer {
  const b = Buffer.alloc(13)
  b.writeUInt32BE(width, 0)
  b.writeUInt32BE(height, 4)
  b.writeUInt8(8, 8)
  b.writeUInt8(6, 9)
  b.writeUInt8(0, 10)
  b.writeUInt8(0, 11)
  b.writeUInt8(0, 12)
  return b
}

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
