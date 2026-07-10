/**
 * LLM provider switch — uses DeepSeek when DEEPSEEK_API_KEY is set, otherwise Gemini.
 * All API routes should import callGemini/parseGeminiJson from here.
 */

import { callGemini as geminiCall, parseGeminiJson as geminiParse, generateImage as geminiImage } from "@greenlight/lib/genkit"
import { callGemini as deepseekCall, parseGeminiJson as deepseekParse, generateImage as deepseekImage } from "@greenlight/lib/deepseek"
import type { GeminiCallOptions, GeminiResponse } from "@greenlight/lib/genkit"

const useDeepseek = !!process.env["DEEPSEEK_API_KEY"]

console.log(`[llm] Using ${useDeepseek ? "DeepSeek" : "Gemini"} for LLM calls`)

export async function callGemini<T = unknown>(
  userMessage: string,
  options?: GeminiCallOptions
): Promise<GeminiResponse<T>> {
  return useDeepseek ? deepseekCall<T>(userMessage, options) : geminiCall<T>(userMessage, options)
}

export function parseGeminiJson(text: string): unknown | null {
  return useDeepseek ? deepseekParse(text) : geminiParse(text)
}

export async function generateImage(options: Parameters<typeof geminiImage>[0]): ReturnType<typeof geminiImage> {
  return useDeepseek ? deepseekImage(options) : geminiImage(options)
}

export type { GeminiCallOptions, GeminiResponse }
