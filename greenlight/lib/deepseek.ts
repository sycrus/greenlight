/**
 * DeepSeek adapter — OpenAI-compatible API.
 * Same interface as lib/genkit.ts so API routes work with either provider.
 *
 * Set DEEPSEEK_API_KEY to use DeepSeek instead of Gemini.
 * Model: deepseek-chat (V3). Also supports deepseek-reasoner (R1).
 */

export interface GeminiCallOptions {
  model?: string
  maxTokens?: number
  temperature?: number
  systemPrompt?: string
}

export interface GeminiResponse<T = unknown> {
  text: string
  output?: T
  usage: { inputTokens: number; outputTokens: number; costUsd: number }
  model: string
}

const DEFAULT_MODEL = "deepseek-chat"
const BASE_URL = "https://api.deepseek.com/v1"

// DeepSeek pricing per 1M tokens
const PRICING: Record<string, { input: number; output: number }> = {
  "deepseek-chat": { input: 0.27, output: 1.10 },
  "deepseek-reasoner": { input: 0.55, output: 2.19 },
}

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? PRICING["deepseek-chat"]!
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output
}

// ── callDeepseek ────────────────────────────────────────────────────────────

export async function callGemini<T = unknown>(
  userMessage: string,
  options: GeminiCallOptions = {}
): Promise<GeminiResponse<T>> {
  const apiKey = process.env["DEEPSEEK_API_KEY"]
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not set")

  const model = options.model ?? DEFAULT_MODEL
  const messages: Array<Record<string, string>> = []

  if (options.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt })
  }
  messages.push({ role: "user", content: userMessage })

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: options.maxTokens ?? 4096,
    ...(options.temperature !== undefined ? { temperature: options.temperature } : { temperature: 0.7 }),
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  const json = await res.json()

  if (!res.ok || json.error) {
    const msg = json.error?.message ?? json.error ?? `DeepSeek API error ${res.status}`
    throw new Error(msg)
  }

  const choice = json.choices?.[0]
  const text: string = choice?.message?.content ?? ""
  const inputTokens: number = json.usage?.prompt_tokens ?? 0
  const outputTokens: number = json.usage?.completion_tokens ?? 0

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

// ── parseGeminiJson ─────────────────────────────────────────────────────────

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
  try { return JSON.parse(stripped.slice(start, end + 1)) } catch { return null }
}

// ── generateImage (placeholder — DeepSeek has no image gen) ─────────────────

export interface ImageGenerationOptions {
  prompt: string
  negativePrompt?: string
  aspectRatio?: "1:1" | "9:16" | "16:9"
}

export interface ImageGenerationResult {
  imageBuffer: Buffer
  costUsd: number
  model: string
  error?: string
}

export async function generateImage(
  _options: ImageGenerationOptions
): Promise<ImageGenerationResult> {
  return {
    imageBuffer: Buffer.alloc(1),
    costUsd: 0,
    model: "deepseek-placeholder",
    error: "DeepSeek does not support image generation. Set up ComfyUI or Imagen for images.",
  }
}
