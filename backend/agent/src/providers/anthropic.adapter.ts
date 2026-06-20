/**
 * Anthropic provider adapter.
 *
 * Wraps the Anthropic SDK directly (not via langchain-anthropic).
 * Converts LangGraph BaseMessage[] ↔ Anthropic messages format.
 * Swapping to a different LLM means replacing this file only.
 *
 * Model is configurable per call — defaults to DEFAULT_MODEL env var.
 * Per-agent overrides: pass `model` explicitly in AnthropicCallOptions.
 */

import Anthropic from "@anthropic-ai/sdk"
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages"
import { withSpan } from "../observability/otel.js"
import { getLangfuse } from "../observability/langfuse.client.js"

const client = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"],
})

const DEFAULT_MODEL =
  process.env["DEFAULT_MODEL"] ?? "claude-haiku-4-5-20251001"

export interface AnthropicCallOptions {
  /** Override model per call — useful for giving the orchestrator a smarter model */
  model?: string
  maxTokens?: number
  systemPrompt?: string
  temperature?: number
  agentNode?: string
  userId?: string
  sessionId?: string
}

export interface AnthropicStreamOptions extends AnthropicCallOptions {
  onChunk: (text: string) => void
}

// ── Message conversion ────────────────────────────────────────────────────────

function toAnthropicMessages(
  messages: BaseMessage[]
): Anthropic.MessageParam[] {
  return messages
    .filter((m) => !(m instanceof SystemMessage))
    .map((m) => ({
      role: m instanceof HumanMessage ? "user" : "assistant",
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    }))
}

function extractSystemPrompt(messages: BaseMessage[]): string | undefined {
  const sys = messages.find((m) => m instanceof SystemMessage)
  return sys ? (typeof sys.content === "string" ? sys.content : undefined) : undefined
}

function serializeMessages(messages: BaseMessage[]): string {
  return JSON.stringify(
    messages.map((m) => ({
      role: m instanceof SystemMessage ? "system" : m instanceof HumanMessage ? "user" : "assistant",
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    }))
  )
}

// ── Call ──────────────────────────────────────────────────────────────────────

export async function callClaude(
  messages: BaseMessage[],
  options: AnthropicCallOptions = {}
): Promise<AIMessage> {
  const model = options.model ?? DEFAULT_MODEL
  const systemPrompt = options.systemPrompt ?? extractSystemPrompt(messages)

  return withSpan("llm.call", { ...(options.agentNode !== undefined && { agentNode: options.agentNode }) }, async (span) => {
    span.setAttribute("gen_ai.system", "anthropic")
    span.setAttribute("gen_ai.request.model", model)
    span.setAttribute("llm.input_messages", serializeMessages(messages))

    const response = await client.messages.create({
      model,
      max_tokens: options.maxTokens ?? 1024,
      ...(options.temperature !== undefined && { temperature: options.temperature }),
      ...(systemPrompt !== undefined && { system: systemPrompt }),
      messages: toAnthropicMessages(messages),
    })

    const text = response.content[0]?.type === "text" ? response.content[0].text : ""

    span.setAttribute("gen_ai.usage.input_tokens", response.usage.input_tokens)
    span.setAttribute("gen_ai.usage.output_tokens", response.usage.output_tokens)
    span.setAttribute("llm.output", text)

    const lf = getLangfuse()
    if (lf) {
      const trace = lf.trace({ name: options.agentNode ?? "llm.call", ...(options.sessionId !== undefined && { sessionId: options.sessionId }), ...(options.userId !== undefined && { userId: options.userId }) })
      trace.generation({ name: "generation", model, input: messages.map((m) => ({ role: m._getType(), content: m.content })), output: text, usage: { input: response.usage.input_tokens, output: response.usage.output_tokens, unit: "TOKENS" } })
      void lf.flushAsync()
    }

    return new AIMessage(text)
  })
}

// ── Streaming call ────────────────────────────────────────────────────────────

export async function streamClaude(
  messages: BaseMessage[],
  options: AnthropicStreamOptions
): Promise<AIMessage> {
  const model = options.model ?? DEFAULT_MODEL
  const systemPrompt = options.systemPrompt ?? extractSystemPrompt(messages)

  return withSpan("llm.stream", { ...(options.agentNode !== undefined && { agentNode: options.agentNode }) }, async (span) => {
    span.setAttribute("gen_ai.system", "anthropic")
    span.setAttribute("gen_ai.request.model", model)
    span.setAttribute("llm.input_messages", serializeMessages(messages))

    let fullText = ""

    const stream = client.messages.stream({
      model,
      max_tokens: options.maxTokens ?? 1024,
      ...(options.temperature !== undefined && { temperature: options.temperature }),
      ...(systemPrompt !== undefined && { system: systemPrompt }),
      messages: toAnthropicMessages(messages),
    })

    for await (const chunk of stream) {
      if (
        chunk.type === "content_block_delta" &&
        chunk.delta.type === "text_delta"
      ) {
        fullText += chunk.delta.text
        options.onChunk(chunk.delta.text)
      }
    }

    const finalMsg = await stream.finalMessage()
    span.setAttribute("gen_ai.usage.input_tokens", finalMsg.usage.input_tokens)
    span.setAttribute("gen_ai.usage.output_tokens", finalMsg.usage.output_tokens)
    span.setAttribute("llm.output", fullText)

    const lf = getLangfuse()
    if (lf) {
      const trace = lf.trace({ name: options.agentNode ?? "llm.stream", ...(options.sessionId !== undefined && { sessionId: options.sessionId }), ...(options.userId !== undefined && { userId: options.userId }) })
      trace.generation({ name: "generation", model, input: messages.map((m) => ({ role: m._getType(), content: m.content })), output: fullText, usage: { input: finalMsg.usage.input_tokens, output: finalMsg.usage.output_tokens, unit: "TOKENS" } })
      void lf.flushAsync()
    }

    return new AIMessage(fullText)
  })
}
