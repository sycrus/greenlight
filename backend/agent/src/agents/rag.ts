/**
 * RAG agent node.
 *
 * Always retrieves from the knowledge base first, then generates a response
 * grounded strictly in the retrieved context. Tone, compliance, and brand
 * voice are Parlant's responsibility — this agent returns data only.
 *
 * Available to other agents via retrieveContext() in src/tools/retrieve.ts.
 * This node is the primary consumer for dedicated knowledge-base queries.
 */

import { SystemMessage } from "@langchain/core/messages"
import { callClaude } from "../providers/anthropic.adapter.js"
import { retrieveContext } from "../tools/retrieve.js"
import { withSpan } from "../observability/otel.js"
import type { GraphState, ComponentSpec, ComponentSpecItem } from "../types/index.js" // ComponentSpec used in satisfies

interface CardSpec {
  url: string
  title: string
  preamble: string
  insight: string
}

const RAG_SYSTEM_PROMPT = `You are a knowledge retrieval agent. Your output has two parts — keep both brief.

PART 1 — Answer (2-3 sentences max): summarise what the retrieved context says that is directly relevant to the user's question. Be factual. If context is insufficient, say so in one sentence.

PART 2 — Cards: immediately after your answer, output a <cards> block. Use this exact format:
<cards>
[{"url":"SOURCE_URL","title":"Human-readable title derived from the content","preamble":"One sentence on why this source is relevant — reference the user's vertical or challenge by name.","insight":"1-2 sentences on the specific outcome or approach and why it maps to the user's situation."}]
</cards>
Rules: only include URLs that appear verbatim in the retrieved context. Maximum 3 cards. Order by relevance. Omit the block entirely if no sources were retrieved. Output nothing after </cards>.`

function parseCards(raw: string): { cards: CardSpec[]; cleanText: string } {
  const match = raw.match(/<cards>([\s\S]*?)<\/cards>/)
  if (!match?.[1]) return { cards: [], cleanText: raw.trim() }

  let cards: CardSpec[] = []
  try {
    const parsed = JSON.parse(match[1].trim())
    if (Array.isArray(parsed)) {
      cards = parsed.filter(
        (c): c is CardSpec =>
          typeof c === "object" &&
          c !== null &&
          typeof c.url === "string" &&
          typeof c.title === "string" &&
          typeof c.preamble === "string" &&
          typeof c.insight === "string"
      )
    }
  } catch {
    // malformed JSON — proceed with no cards
  }

  const cleanText = raw.replace(/<cards>[\s\S]*?<\/cards>/, "").trim()
  return { cards, cleanText }
}

export async function ragAgentNode(
  state: GraphState
): Promise<Partial<GraphState>> {
  return withSpan(
    "rag_agent",
    { userId: state.userId, sessionId: state.sessionId, agentNode: "rag_agent" },
    async () => {
      const lastMessage = state.messages.at(-1)
      const userText =
        typeof lastMessage?.content === "string" ? lastMessage.content : ""

      // ── Always retrieve first ─────────────────────────────────────────────
      const retrieveResult = await retrieveContext(userText)

      const chunks = retrieveResult.success ? (retrieveResult.data?.chunks ?? []) : []

      const context =
        chunks.length > 0
          ? chunks
              .map((c, i) => `[${i + 1}] source:${c.source} (score:${c.score.toFixed(3)})\n${c.text}`)
              .join("\n\n")
          : "No relevant content found in the knowledge base."

      if (!retrieveResult.success) {
        console.warn(`[rag_agent] retrieval failed: ${retrieveResult.error}`)
      }

      // ── Generate response + card specs in one call ────────────────────────
      const response = await callClaude(
        [
          new SystemMessage(`${RAG_SYSTEM_PROMPT}\n\nRetrieved context:\n${context}`),
          ...state.messages,
        ],
        {
          agentNode: "rag_agent",
          userId: state.userId,
          sessionId: state.sessionId,
          model: "claude-sonnet-4-6",
          maxTokens: 2048,
        }
      )

      const rawText = typeof response.content === "string" ? response.content : ""
      const { cards, cleanText } = parseCards(rawText)

      const componentSpecItems: ComponentSpecItem[] | null =
        cards.length > 0
          ? cards.map((card) => ({
              insight: card.insight,
              spec: {
                component: "CaseStudyCard",
                props: { cards: [{ url: card.url, title: card.title, preamble: card.preamble }] },
              } satisfies ComponentSpec,
            }))
          : null

      return {
        response: cleanText,
        messages: [...state.messages, response],
        ...(componentSpecItems !== null && { componentSpecItems }),
      }
    }
  )
}
