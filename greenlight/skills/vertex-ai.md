# Vertex AI — Gemini + Imagen

## Official docs
- [Gemini on Vertex AI](https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/overview)
- [Gemini 2.5 Flash](https://cloud.google.com/vertex-ai/generative-ai/docs/gemini/2-5-flash)
- [Imagen 3](https://cloud.google.com/vertex-ai/generative-ai/docs/image/generate-images)
- [Node.js SDK](https://cloud.google.com/nodejs/docs/reference/aiplatform/latest)

## Greenlight adapter

Single file: `greenlight/lib/gemini.ts`

Pattern (from predecessor `backend/agent/src/providers/anthropic.adapter.ts`):
- One file wraps the SDK — everything else calls `callGemini()` or `generateImage()`
- Swap this file to change LLM provider

## Gemini call pattern

```typescript
import { callGemini, parseGeminiJson, validateParsedBrief } from "@greenlight/lib/gemini"

const response = await callGemini(userMessage, {
  systemPrompt: "...",  // Embed JSON schema in prompt, not response_mime_type
  maxTokens: 2048,
})

const parsed = parseGeminiJson(response.text)  // Strip fences → find {...} → JSON.parse
const { valid, gaps } = validateParsedBrief(parsed)  // Check against PRD schema

// Cost tracked automatically from response.usage
console.log(response.usage.costUsd)  // $0.00002
```

## Never use `response_mime_type: "application/json"`
Gemini 2.5 Flash structured output mode is less reliable than prompt-forced JSON for complex nested schemas. Always embed the schema in the system prompt.

## Models + pricing

| Model | Input (1k tokens) | Output (1k tokens) |
|---|---|---|
| `gemini-2.5-flash-001` | $0.00001875 | $0.000075 |
| `imagen-3.0-generate-001` | Per-image pricing | ~$0.02–$0.04/image |

## Imagen 3

```typescript
// TODO: implement in lib/gemini.ts (Day 3)
// Output always goes to GCS URI (not base64 — too large for Firestore)
// SynthID watermarking is automatic
```

## Structured output fallback
1. Parse raw response with `parseGeminiJson()`
2. If null → retry once with stricter prompt (add "Return ONLY the JSON object. No markdown, no prose.")
3. If still null → return 502 error to client
