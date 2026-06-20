/**
 * Slide Deck agent node.
 *
 * Generates a navigable, prospect-specific slide deck from the conversation
 * context. Retrieves supporting case studies from the knowledge base, then
 * asks Claude to structure 4-6 slides covering the prospect's challenge,
 * relevant proof points, Endava's approach, and a suggested next step.
 *
 * Returns a single SlideDeck componentSpec — rendered as a paginated card
 * deck in the frontend.
 */

import { SystemMessage } from "@langchain/core/messages"
import { callClaude } from "../providers/anthropic.adapter.js"
import { retrieveContext } from "../tools/retrieve.js"
import { withSpan } from "../observability/otel.js"
import type { GraphState, ComponentSpec } from "../types/index.js"

interface SlideSpec {
  tag: "Problem" | "Agitate" | "Proof Point" | "Solution" | "Next Step"
  headline: string
  body: string
  stat?: { value: string; label: string }
  stats?: { value: string; label: string }[]
  caseStudy?: {
    url: string
    title: string
    preamble: string
  }
}

interface DeckSpec {
  title: string
  slides: SlideSpec[]
}

const SLIDE_DECK_SYSTEM_PROMPT = `You are a McKinsey-trained presentation strategist building a concise, executive-facing slide deck for internal stakeholder sign-off. You follow the Problem–Agitate–Solution (PAS) narrative structure.

Your output is a single JSON object — no prose, no markdown fences, just the raw JSON.

Schema:
{
  "title": "string — 4-8 words, prospect-specific (e.g. 'Your Core Banking Migration Brief')",
  "slides": [
    {
      "tag": "Problem" | "Agitate" | "Proof Point" | "Solution" | "Next Step",
      "headline": "string — see headline rules below",
      "body": "string — 2-3 sentences. Factual, specific, no filler.",
      "stat": {                        // Problem and Agitate only — one prominent industry statistic
        "value": "string — short number or figure, e.g. '78%' or '$93.6M'",
        "label": "string — brief phrase explaining the stat, e.g. 'of bank IT budgets spent on legacy maintenance'"
      },
      "stats": [                       // Solution only — 2-3 modernisation outcome figures
        { "value": "string", "label": "string" }
      ],
      "caseStudy": {                   // Proof Point only — only when a matching URL appears in retrieved context
        "url": "string — verbatim from retrieved context",
        "title": "string — human-readable title derived from the content",
        "preamble": "string — one sentence on why this is relevant to the prospect's context"
      }
    }
  ]
}

HEADLINE RULES — this is the most important field. Every headline must be a McKinsey-style action title:
- State the conclusion or insight, not the topic. The reader must understand the "so what" from the headline alone.
- Use concrete, specific language. Reference the prospect's industry, company, or challenge by name where possible.
- Lead with impact: cost, risk, competitive disadvantage, or the specific outcome achieved.
- Use active verbs. Avoid nominalisations ("The migration of…" → "Migrating…").
- ≤12 words. No filler. No hedging.

Weak headline (topic): "GEO Trends and Their Impact"
Strong headline (conclusion): "GEO is making Ally invisible to the customers SEO built"

Weak headline (topic): "Endava's Core Banking Experience"
Strong headline (conclusion): "Three Tier-1 banks migrated their core platforms without a single hour of downtime"

Weak headline (topic): "Our Approach to Digital Transformation"
Strong headline (conclusion): "Embedded delivery teams cut migration risk by keeping old and new systems live in parallel"

Weak headline (topic): "Next Steps"
Strong headline (conclusion): "One 15-minute call is enough to scope whether this fits your Q3 roadmap"

PAS slide structure rules:
1. First slide — tag "Problem": Restate the prospect's challenge as a specific, costly threat. Name the industry dynamic or competitive pressure that makes this urgent. Include a "stat" field: pick the single industry number that best quantifies the scale of the problem for this prospect's context.
2. Second slide — tag "Agitate": Escalate the stakes. Explain WHY this is worse or more urgent than the prospect may realise. Make the pain impossible to ignore. Include a "stat" field: pick the number that most viscerally represents the cost of delay or competitive consequence — ideally a dollar figure or failure rate.
3. Middle slides (3-5) — tag "Proof Point": One slide per relevant case study retrieved. Headline states the outcome achieved, not the engagement type. Always include a caseStudy object. Only cite URLs that appear verbatim in the retrieved context. If no context was retrieved, omit Proof Point slides entirely. No stat field.
4. Second-to-last slide — tag "Solution": Headline states Endava's specific differentiator for this engagement type. Tie it directly to the pain in the Agitate slide. Include a "stats" array of 2-3 modernisation outcome figures. No caseStudy field.
5. Last slide — tag "Next Step": Headline names the specific action and its concrete value. No stat, stats, or caseStudy field.

Total slides: 5 minimum, 7 maximum. Quality over quantity. Every word must earn its place.

MARKET STATISTICS REFERENCE — use these verbatim in stat/stats fields, selecting the most relevant for the prospect's context:

Legacy cost (for Problem):
  { "value": "78%", "label": "of bank IT budgets consumed by legacy maintenance" }
  { "value": "10×", "label": "higher operating costs vs next-generation platforms" }
  { "value": "64%", "label": "of global banking tech spend goes to maintenance, not growth" }

Cost of delay (for Agitate):
  { "value": "$93.6M", "label": "in annual losses per institution from legacy systems (FIS/Oxford Economics)" }
  { "value": "$468M", "label": "cumulative cost of a 5-year modernisation delay" }
  { "value": "80%", "label": "of core banking migration projects fail without structured methodology" }

Competitive pressure (for Agitate):
  { "value": "1 in 4", "label": "US households now considering switching their primary bank" }
  { "value": "1 in 10", "label": "new primary accounts in the last 2 years went to fintechs" }

Modernisation outcomes (for Solution stats):
  { "value": "38–52%", "label": "reduction in total cost of ownership post-modernisation" }
  { "value": "62%", "label": "faster time-to-market for new products" }
  { "value": "20%", "label": "of banks actually switch at contract renewal — despite 60% reporting dissatisfaction" }`

const TAG_CANONICAL: Record<string, SlideSpec["tag"]> = {
  "problem":      "Problem",
  "challenge":    "Problem",
  "agitate":      "Agitate",
  "agitation":    "Agitate",
  "pain":         "Agitate",
  "complication": "Agitate",
  "proof point":  "Proof Point",
  "proofpoint":   "Proof Point",
  "solution":     "Solution",
  "our approach": "Solution",
  "ourapproach":  "Solution",
  "approach":     "Solution",
  "next step":    "Next Step",
  "nextstep":     "Next Step",
  "next steps":   "Next Step",
}

function normalizeTag(raw: unknown): SlideSpec["tag"] | null {
  if (typeof raw !== "string") return null
  const key = raw.toLowerCase().trim()
  const validSet = new Set<SlideSpec["tag"]>(["Problem", "Agitate", "Proof Point", "Solution", "Next Step"])
  if (validSet.has(raw as SlideSpec["tag"])) return raw as SlideSpec["tag"]
  return TAG_CANONICAL[key] ?? null
}

function parseDeck(raw: string): DeckSpec | null {
  // Strip markdown code fences if present
  const stripped = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim()
  // Find the outermost JSON object — match from first { to matching }
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
  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1)) as unknown
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>)["title"] !== "string" ||
      !Array.isArray((parsed as Record<string, unknown>)["slides"])
    ) {
      return null
    }
    const deck = parsed as DeckSpec
    deck.slides = deck.slides.flatMap((s): SlideSpec[] => {
      if (typeof s !== "object" || s === null) return []
      const raw = s as unknown as Record<string, unknown>
      const tag = normalizeTag(raw["tag"])
      if (!tag || typeof raw["headline"] !== "string" || typeof raw["body"] !== "string") return []
      const slide: SlideSpec = { tag, headline: raw["headline"], body: raw["body"] }
      if (typeof raw["stat"] === "object" && raw["stat"] !== null) {
        const st = raw["stat"] as Record<string, unknown>
        if (typeof st["value"] === "string" && typeof st["label"] === "string") {
          slide.stat = { value: st["value"], label: st["label"] }
        }
      }
      if (Array.isArray(raw["stats"])) {
        const parsed = (raw["stats"] as unknown[]).flatMap((s): { value: string; label: string }[] => {
          if (typeof s !== "object" || s === null) return []
          const st = s as Record<string, unknown>
          return typeof st["value"] === "string" && typeof st["label"] === "string"
            ? [{ value: st["value"], label: st["label"] }]
            : []
        })
        if (parsed.length > 0) slide.stats = parsed
      }
      if (typeof raw["caseStudy"] === "object" && raw["caseStudy"] !== null) {
        const cs = raw["caseStudy"] as Record<string, unknown>
        if (typeof cs["url"] === "string" && typeof cs["title"] === "string" && typeof cs["preamble"] === "string") {
          slide.caseStudy = { url: cs["url"], title: cs["title"], preamble: cs["preamble"] }
        }
      }
      return [slide]
    })
    return deck.slides.length > 0 ? deck : null
  } catch {
    return null
  }
}

export async function slideDeckAgentNode(
  state: GraphState
): Promise<Partial<GraphState>> {
  return withSpan(
    "slide_deck_agent",
    { userId: state.userId, sessionId: state.sessionId, agentNode: "slide_deck_agent" },
    async () => {
      // Build a rich retrieval query: prefer stored memories (industry, challenge,
      // timeline) over the last message, which is likely just "build me a deck".
      console.log(`[slide_deck_agent] memories received: ${state.memories.length}`, state.memories)

      const ragQuery =
        state.memories.length > 0
          ? state.memories.join(" ")
          : state.messages
              .map((m) => (typeof m.content === "string" ? m.content : ""))
              .filter(Boolean)
              .join(" ")

      console.log(`[slide_deck_agent] RAG query: "${ragQuery.slice(0, 120)}"`);

      const retrieveResult = await retrieveContext(ragQuery)
      const chunks = retrieveResult.success ? (retrieveResult.data?.chunks ?? []) : []

      const context =
        chunks.length > 0
          ? chunks
              .map((c, i) => `[${i + 1}] source:${c.source} (score:${c.score.toFixed(3)})\n${c.text}`)
              .join("\n\n")
          : "No relevant content found in the knowledge base."

      if (!retrieveResult.success) {
        console.warn(`[slide_deck_agent] retrieval failed: ${retrieveResult.error}`)
      }

      const memorySummary =
        state.memories.length > 0
          ? `\n\nWhat I know about this prospect:\n${state.memories.map((m) => `- ${m}`).join("\n")}`
          : ""

      const response = await callClaude(
        [
          new SystemMessage(`${SLIDE_DECK_SYSTEM_PROMPT}\n\nRetrieved context:\n${context}${memorySummary}`),
          ...state.messages,
        ],
        {
          agentNode: "slide_deck_agent",
          userId: state.userId,
          sessionId: state.sessionId,
          model: "claude-sonnet-4-6",
          maxTokens: 2048,
        }
      )

      const rawText = typeof response.content === "string" ? response.content : ""
      const deck = parseDeck(rawText)

      if (!deck) {
        console.warn("[slide_deck_agent] failed to parse deck JSON — falling back to empty response")
        return {
          response: "I wasn't able to build the deck right now. Try asking again with a bit more context about your challenge.",
          messages: [...state.messages, response],
        }
      }

      const componentSpec: ComponentSpec = {
        component: "SlideDeck",
        props: {
          title: deck.title,
          slides: deck.slides,
        },
      }

      return {
        response: `Here's a brief built around your context — ${deck.slides.length} slides covering the challenge, proof points, approach, and a suggested next step.`,
        messages: [...state.messages, response],
        componentSpec,
      }
    }
  )
}
