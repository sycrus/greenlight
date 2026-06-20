/**
 * Customer service agent node.
 *
 * Handles general queries, product questions, complaints, and account help.
 * This is the default agent — if the orchestrator can't classify a request,
 * it lands here.
 *
 * Tone, compliance, and memory are Parlant's responsibility.
 * This agent's only job: look up data and return a clear factual summary.
 */

import { SystemMessage } from "@langchain/core/messages"
import { streamClaude } from "../providers/anthropic.adapter.js"
import { withSpan } from "../observability/otel.js"
import type { GraphState } from "../types/index.js"

const CS_SYSTEM_PROMPT = `You are a customer service data agent. Look up the requested information and return a clear, factual summary of what you find. Return only the data — no tone adjustments, no brand voice, no compliance instructions. Those are handled upstream.`

export async function customerServiceAgentNode(
  state: GraphState,
  onChunk?: (text: string) => void
): Promise<Partial<GraphState>> {
  return withSpan("customer_service_agent", { userId: state.userId, sessionId: state.sessionId, agentNode: "customer_service_agent" }, async () => {
    let responseText = ""

    const response = await streamClaude(
      [new SystemMessage(CS_SYSTEM_PROMPT), ...state.messages],
      {
        agentNode: "customer_service_agent",
        userId: state.userId,
        sessionId: state.sessionId,
        onChunk: (chunk) => {
          responseText += chunk
          onChunk?.(chunk)
        },
      }
    )

    return {
      response: typeof response.content === "string" ? response.content : responseText,
      messages: [...state.messages, response],
    }
  })
}
