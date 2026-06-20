import { describe, it, expect, vi, beforeEach } from "vitest"
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages"
import type { GraphState } from "../../src/types/index.js"

// ── Module mocks (hoisted) ─────────────────────────────────────────────────────

const mockRetrieveContext = vi.hoisted(() => vi.fn())
const mockCallClaude = vi.hoisted(() => vi.fn())

vi.mock("../../src/tools/retrieve.js", () => ({
  retrieveContext: mockRetrieveContext,
}))

vi.mock("../../src/providers/anthropic.adapter.js", () => ({
  callClaude: mockCallClaude,
  streamClaude: vi.fn(),
}))

vi.mock("../../src/observability/otel.js", () => ({
  withSpan: vi.fn((_name: string, _attrs: unknown, fn: (s: unknown) => unknown) => fn({})),
  initTelemetry: vi.fn(),
  shutdownTelemetry: vi.fn(),
}))

import { slideDeckAgentNode } from "../../src/agents/slide-deck.js"

// ── Fixture data ───────────────────────────────────────────────────────────────

const RETRIEVE_SUCCESS = {
  toolName: "retrieve_context",
  success: true,
  data: {
    chunks: [
      {
        text: "DSK Bank decomposed monolith to microservices over 14 months.",
        source: "https://endava.com/case-studies/dsk-bank",
        score: 0.93,
      },
      {
        text: "Regional US bank modernised payment hub with zero downtime.",
        source: "https://endava.com/case-studies/payment-hub",
        score: 0.88,
      },
    ],
    sources: [
      "https://endava.com/case-studies/dsk-bank",
      "https://endava.com/case-studies/payment-hub",
    ],
  },
}

const RETRIEVE_FAILURE = {
  toolName: "retrieve_context",
  success: false,
  error: "llama-rag unreachable",
}

const VALID_DECK_JSON = JSON.stringify({
  title: "Core Banking Migration Brief",
  slides: [
    {
      tag: "Challenge",
      headline: "Modernise core banking without service disruption",
      body: "Mid-size banks face compounding risk from monolithic platforms that block new product delivery.",
    },
    {
      tag: "Proof Point",
      headline: "DSK Bank: monolith to microservices in 14 months",
      body: "Zero downtime achieved through domain-driven slicing and phased cutover gates.",
      caseStudy: {
        url: "https://endava.com/case-studies/dsk-bank",
        title: "DSK Bank Digital Banking",
        preamble: "Directly mirrors the core banking modernisation challenge.",
      },
    },
    {
      tag: "Our Approach",
      headline: "Engineering-led, phased delivery with embedded teams",
      body: "Strangler-fig decomposition, parallel-run validation, and zero-disruption cutover gates.",
    },
    {
      tag: "Next Step",
      headline: "15-minute call with our banking delivery team",
      body: "Connect with the engineers who ran the DSK engagement.",
    },
  ],
})

function makeState(overrides: Partial<GraphState> = {}): GraphState {
  return {
    messages: [new HumanMessage("Can you build me a brief based on what we've discussed?")],
    userId: "user-1",
    sessionId: "session-1",
    route: { agent: "slide_deck", reason: "user requested deck" },
    response: null,
    componentSpec: null,
    componentSpecItems: null,
    memories: [],
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("slideDeckAgentNode", () => {
  beforeEach(() => {
    mockRetrieveContext.mockReset()
    mockCallClaude.mockReset()
    mockRetrieveContext.mockResolvedValue(RETRIEVE_SUCCESS)
    mockCallClaude.mockResolvedValue(new AIMessage(VALID_DECK_JSON))
  })

  // ── RAG retrieval ──────────────────────────────────────────────────────────

  describe("retrieval — always fires before generation", () => {
    it("calls retrieveContext exactly once per invocation", async () => {
      await slideDeckAgentNode(makeState())
      expect(mockRetrieveContext).toHaveBeenCalledOnce()
    })

    it("uses stored memories as the retrieval query when available", async () => {
      await slideDeckAgentNode(makeState({
        memories: ["mid-size bank", "core banking modernisation", "12-month timeline"],
      }))
      expect(mockRetrieveContext).toHaveBeenCalledWith(
        "mid-size bank core banking modernisation 12-month timeline"
      )
    })

    it("falls back to conversation text when no memories are stored", async () => {
      await slideDeckAgentNode(makeState({
        messages: [new HumanMessage("banking modernisation challenge")],
        memories: [],
      }))
      expect(mockRetrieveContext).toHaveBeenCalledWith("banking modernisation challenge")
    })

    it("joins all message text when falling back to messages", async () => {
      await slideDeckAgentNode(makeState({
        messages: [
          new HumanMessage("we are a bank"),
          new AIMessage("understood"),
          new HumanMessage("build me a deck"),
        ],
        memories: [],
      }))
      expect(mockRetrieveContext).toHaveBeenCalledWith("we are a bank understood build me a deck")
    })

    it("injects retrieved chunk texts into the Claude system prompt", async () => {
      await slideDeckAgentNode(makeState())
      const [messages] = mockCallClaude.mock.calls[0] as [unknown[], Record<string, unknown>]
      const systemMsg = (messages as { content: string }[]).find((m) => m instanceof SystemMessage)
      expect(systemMsg?.content).toContain("DSK Bank decomposed monolith")
      expect(systemMsg?.content).toContain("Regional US bank modernised payment hub")
    })

    it("includes state.messages after the system message", async () => {
      await slideDeckAgentNode(makeState())
      const [messages] = mockCallClaude.mock.calls[0] as [unknown[], Record<string, unknown>]
      expect((messages as object[]).some((m) => m instanceof HumanMessage)).toBe(true)
    })
  })

  // ── Memory injection ───────────────────────────────────────────────────────

  describe("memory injection", () => {
    it("includes stored memories in the Claude system prompt", async () => {
      await slideDeckAgentNode(makeState({
        memories: ["mid-size bank", "core banking challenge", "12-month CTO deadline"],
      }))
      const [messages] = mockCallClaude.mock.calls[0] as [unknown[], Record<string, unknown>]
      const systemMsg = (messages as { content: string }[]).find((m) => m instanceof SystemMessage)
      expect(systemMsg?.content).toContain("mid-size bank")
      expect(systemMsg?.content).toContain("core banking challenge")
      expect(systemMsg?.content).toContain("12-month CTO deadline")
    })

    it("omits the memory block when no memories are stored", async () => {
      await slideDeckAgentNode(makeState({ memories: [] }))
      const [messages] = mockCallClaude.mock.calls[0] as [unknown[], Record<string, unknown>]
      const systemMsg = (messages as { content: string }[]).find((m) => m instanceof SystemMessage)
      expect(systemMsg?.content).not.toContain("What I know about this prospect")
    })

    it("labels the memory block clearly in the system prompt", async () => {
      await slideDeckAgentNode(makeState({ memories: ["VP Engineering", "retail"] }))
      const [messages] = mockCallClaude.mock.calls[0] as [unknown[], Record<string, unknown>]
      const systemMsg = (messages as { content: string }[]).find((m) => m instanceof SystemMessage)
      expect(systemMsg?.content).toContain("What I know about this prospect")
    })
  })

  // ── JSON parsing — happy path ──────────────────────────────────────────────

  describe("deck parsing — valid JSON", () => {
    it("returns a SlideDeck componentSpec when Claude outputs valid JSON", async () => {
      const result = await slideDeckAgentNode(makeState())
      expect(result.componentSpec?.component).toBe("SlideDeck")
    })

    it("passes the deck title as a prop", async () => {
      const result = await slideDeckAgentNode(makeState())
      expect(result.componentSpec?.props.title).toBe("Core Banking Migration Brief")
    })

    it("passes the slides array as a prop", async () => {
      const result = await slideDeckAgentNode(makeState())
      const slides = result.componentSpec?.props.slides as unknown[]
      expect(Array.isArray(slides)).toBe(true)
      expect(slides.length).toBe(4)
    })

    it("returns a response string that mentions the slide count", async () => {
      const result = await slideDeckAgentNode(makeState())
      expect(result.response).toContain("4")
    })

    it("appends the AI response to state.messages", async () => {
      const result = await slideDeckAgentNode(makeState())
      expect(result.messages?.at(-1)).toBeInstanceOf(AIMessage)
    })
  })

  // ── JSON parsing — resilience ──────────────────────────────────────────────

  describe("deck parsing — resilience", () => {
    it("strips markdown code fences before parsing", async () => {
      mockCallClaude.mockResolvedValue(
        new AIMessage("```json\n" + VALID_DECK_JSON + "\n```")
      )
      const result = await slideDeckAgentNode(makeState())
      expect(result.componentSpec?.component).toBe("SlideDeck")
    })

    it("ignores prose before the opening brace", async () => {
      mockCallClaude.mockResolvedValue(
        new AIMessage("Here is the deck:\n\n" + VALID_DECK_JSON)
      )
      const result = await slideDeckAgentNode(makeState())
      expect(result.componentSpec?.component).toBe("SlideDeck")
    })

    it("normalises lowercase tag 'challenge' to 'Challenge'", async () => {
      const lowercaseDeck = JSON.stringify({
        title: "Test Deck",
        slides: [
          { tag: "challenge", headline: "A problem", body: "Some body text." },
          { tag: "our approach", headline: "How we do it", body: "Our approach." },
          { tag: "next step", headline: "Call us", body: "Reach out." },
          { tag: "proof point", headline: "We did it", body: "Outcome here." },
        ],
      })
      mockCallClaude.mockResolvedValue(new AIMessage(lowercaseDeck))
      const result = await slideDeckAgentNode(makeState())
      expect(result.componentSpec?.component).toBe("SlideDeck")
      const slides = result.componentSpec?.props.slides as Array<{ tag: string }>
      expect(slides[0]?.tag).toBe("Challenge")
      expect(slides[1]?.tag).toBe("Our Approach")
      expect(slides[2]?.tag).toBe("Next Step")
      expect(slides[3]?.tag).toBe("Proof Point")
    })

    it("accepts 'approach' as an alias for 'Our Approach'", async () => {
      const deck = JSON.stringify({
        title: "T",
        slides: [
          { tag: "Challenge", headline: "h", body: "b" },
          { tag: "approach", headline: "h2", body: "b2" },
          { tag: "Next Step", headline: "h3", body: "b3" },
        ],
      })
      mockCallClaude.mockResolvedValue(new AIMessage(deck))
      const result = await slideDeckAgentNode(makeState())
      const slides = result.componentSpec?.props.slides as Array<{ tag: string }>
      const approachSlide = slides.find((s) => s.tag === "Our Approach")
      expect(approachSlide).toBeDefined()
    })

    it("filters out slides with unrecognised tags but keeps valid ones", async () => {
      const deck = JSON.stringify({
        title: "T",
        slides: [
          { tag: "Challenge", headline: "h", body: "b" },
          { tag: "Unknown Tag", headline: "ignored", body: "b" },
          { tag: "Next Step", headline: "h3", body: "b3" },
        ],
      })
      mockCallClaude.mockResolvedValue(new AIMessage(deck))
      const result = await slideDeckAgentNode(makeState())
      const slides = result.componentSpec?.props.slides as Array<{ tag: string }>
      expect(slides.length).toBe(2)
      expect(slides.every((s) => s.tag !== "Unknown Tag")).toBe(true)
    })

    it("includes caseStudy on Proof Point slides when present", async () => {
      const result = await slideDeckAgentNode(makeState())
      const slides = result.componentSpec?.props.slides as Array<{
        tag: string
        caseStudy?: { url: string; title: string; preamble: string }
      }>
      const proofSlide = slides.find((s) => s.tag === "Proof Point")
      expect(proofSlide?.caseStudy?.url).toBe("https://endava.com/case-studies/dsk-bank")
      expect(proofSlide?.caseStudy?.title).toBe("DSK Bank Digital Banking")
    })

    it("omits caseStudy when the field is absent", async () => {
      const deck = JSON.stringify({
        title: "T",
        slides: [
          { tag: "Challenge", headline: "h", body: "b" },
          { tag: "Our Approach", headline: "h2", body: "b2" },
          { tag: "Next Step", headline: "h3", body: "b3" },
        ],
      })
      mockCallClaude.mockResolvedValue(new AIMessage(deck))
      const result = await slideDeckAgentNode(makeState())
      const slides = result.componentSpec?.props.slides as Array<{ tag: string; caseStudy?: unknown }>
      slides.forEach((s) => expect(s.caseStudy).toBeUndefined())
    })
  })

  // ── Fallback on parse failure ──────────────────────────────────────────────

  describe("fallback — unparseable response", () => {
    it("returns no componentSpec when Claude output is not JSON", async () => {
      mockCallClaude.mockResolvedValue(new AIMessage("Sorry, I cannot build that right now."))
      const result = await slideDeckAgentNode(makeState())
      expect(result.componentSpec).toBeUndefined()
    })

    it("returns a fallback response string when parsing fails", async () => {
      mockCallClaude.mockResolvedValue(new AIMessage("not json"))
      const result = await slideDeckAgentNode(makeState())
      expect(typeof result.response).toBe("string")
      expect((result.response?.length ?? 0)).toBeGreaterThan(0)
    })

    it("returns no componentSpec when all slides have invalid tags", async () => {
      const badDeck = JSON.stringify({
        title: "T",
        slides: [
          { tag: "Invalid", headline: "h", body: "b" },
          { tag: "Also Invalid", headline: "h2", body: "b2" },
        ],
      })
      mockCallClaude.mockResolvedValue(new AIMessage(badDeck))
      const result = await slideDeckAgentNode(makeState())
      expect(result.componentSpec).toBeUndefined()
    })
  })

  // ── Retrieval failure — graceful degradation ───────────────────────────────

  describe("retrieval failure — graceful degradation", () => {
    it("still calls callClaude when retrieval fails", async () => {
      mockRetrieveContext.mockResolvedValue(RETRIEVE_FAILURE)
      await slideDeckAgentNode(makeState())
      expect(mockCallClaude).toHaveBeenCalledOnce()
    })

    it("tells Claude no context was found when retrieval fails", async () => {
      mockRetrieveContext.mockResolvedValue(RETRIEVE_FAILURE)
      await slideDeckAgentNode(makeState())
      const [messages] = mockCallClaude.mock.calls[0] as [unknown[], Record<string, unknown>]
      const systemMsg = (messages as { content: string }[]).find((m) => m instanceof SystemMessage)
      expect(systemMsg?.content).toContain("No relevant content found")
    })

    it("still returns a SlideDeck spec when retrieval fails but Claude produces valid JSON", async () => {
      mockRetrieveContext.mockResolvedValue(RETRIEVE_FAILURE)
      const result = await slideDeckAgentNode(makeState())
      expect(result.componentSpec?.component).toBe("SlideDeck")
    })
  })

  // ── Model selection ────────────────────────────────────────────────────────

  describe("model", () => {
    it("uses claude-sonnet-4-6", async () => {
      await slideDeckAgentNode(makeState())
      const [, options] = mockCallClaude.mock.calls[0] as [unknown, Record<string, unknown>]
      expect(options.model).toBe("claude-sonnet-4-6")
    })
  })

  // ── Observability ──────────────────────────────────────────────────────────

  describe("observability", () => {
    it("passes userId and sessionId to withSpan attributes", async () => {
      const { withSpan } = await import("../../src/observability/otel.js")
      await slideDeckAgentNode(makeState({ userId: "u-42", sessionId: "s-99" }))
      expect(withSpan).toHaveBeenCalledWith(
        "slide_deck_agent",
        expect.objectContaining({ userId: "u-42", sessionId: "s-99" }),
        expect.any(Function)
      )
    })
  })
})
