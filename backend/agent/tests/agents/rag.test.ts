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

import { ragAgentNode } from "../../src/agents/rag.js"

// ── Fixture data ───────────────────────────────────────────────────────────────

const RETRIEVE_SUCCESS = {
  toolName: "retrieve_context",
  success: true,
  data: {
    chunks: [
      { text: "Product X comes in blue and red.", source: "https://example.com/products", score: 0.95 },
      { text: "All orders ship within 3–5 business days.", source: "https://example.com/shipping", score: 0.87 },
    ],
    sources: ["https://example.com/products", "https://example.com/shipping"],
  },
}

const RETRIEVE_NO_SOURCES = {
  toolName: "retrieve_context",
  success: true,
  data: {
    chunks: [{ text: "Some content.", source: "", score: 0.5 }],
    sources: [],
  },
}

const RETRIEVE_FAILURE = {
  toolName: "retrieve_context",
  success: false,
  error: "llama-rag unreachable",
}

function makeState(overrides: Partial<GraphState> = {}): GraphState {
  return {
    messages: [new HumanMessage("What colours does Product X come in?")],
    userId: "user-1",
    sessionId: "session-1",
    route: { agent: "rag", reason: "knowledge base query" },
    response: null,
    componentSpec: null,
    memories: [],
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("ragAgentNode", () => {
  beforeEach(() => {
    mockRetrieveContext.mockReset()
    mockCallClaude.mockReset()
    mockCallClaude.mockResolvedValue(new AIMessage("Product X comes in blue and red."))
  })

  // ── Core retrieval behaviour ───────────────────────────────────────────────

  describe("retrieval — always fires before generation", () => {
    it("calls retrieveContext exactly once per invocation", async () => {
      mockRetrieveContext.mockResolvedValue(RETRIEVE_SUCCESS)
      await ragAgentNode(makeState())
      expect(mockRetrieveContext).toHaveBeenCalledOnce()
    })

    it("passes the last user message text to retrieveContext", async () => {
      mockRetrieveContext.mockResolvedValue(RETRIEVE_SUCCESS)
      await ragAgentNode(makeState({
        messages: [new HumanMessage("Tell me about shipping times")],
      }))
      expect(mockRetrieveContext).toHaveBeenCalledWith("Tell me about shipping times")
    })

    it("injects retrieved chunk texts into the Claude system prompt", async () => {
      mockRetrieveContext.mockResolvedValue(RETRIEVE_SUCCESS)
      await ragAgentNode(makeState())
      const [messages] = mockCallClaude.mock.calls[0] as [unknown[], Record<string, unknown>]
      const systemMsg = (messages as { content: string }[]).find((m) => m instanceof SystemMessage)
      expect(systemMsg?.content).toContain("Product X comes in blue and red.")
      expect(systemMsg?.content).toContain("All orders ship within 3–5 business days.")
    })

    it("includes state.messages after the system message", async () => {
      mockRetrieveContext.mockResolvedValue(RETRIEVE_SUCCESS)
      await ragAgentNode(makeState())
      const [messages] = mockCallClaude.mock.calls[0] as [unknown[], Record<string, unknown>]
      expect((messages as object[]).some((m) => m instanceof HumanMessage)).toBe(true)
    })
  })

  // ── Model selection ────────────────────────────────────────────────────────

  describe("model", () => {
    it("uses claude-sonnet-4-6 for higher accuracy on RAG responses", async () => {
      mockRetrieveContext.mockResolvedValue(RETRIEVE_SUCCESS)
      await ragAgentNode(makeState())
      const [, options] = mockCallClaude.mock.calls[0] as [unknown, Record<string, unknown>]
      expect(options.model).toBe("claude-sonnet-4-6")
    })
  })

  // ── Response shape ─────────────────────────────────────────────────────────

  describe("response", () => {
    it("returns responseText from callClaude as response field", async () => {
      mockRetrieveContext.mockResolvedValue(RETRIEVE_SUCCESS)
      mockCallClaude.mockResolvedValue(new AIMessage("Blue and red."))
      const result = await ragAgentNode(makeState())
      expect(result.response).toBe("Blue and red.")
    })

    it("appends the AI response to state.messages", async () => {
      mockRetrieveContext.mockResolvedValue(RETRIEVE_SUCCESS)
      const result = await ragAgentNode(makeState())
      const lastMsg = result.messages?.at(-1)
      expect(lastMsg).toBeInstanceOf(AIMessage)
    })

    it("preserves existing messages before the AI response", async () => {
      mockRetrieveContext.mockResolvedValue(RETRIEVE_SUCCESS)
      const userMsg = new HumanMessage("What colours?")
      const result = await ragAgentNode(makeState({ messages: [userMsg] }))
      expect(result.messages?.[0]).toBeInstanceOf(HumanMessage)
      expect(result.messages?.at(-1)).toBeInstanceOf(AIMessage)
    })
  })

  // ── CitationsCard component spec ───────────────────────────────────────────

  describe("componentSpec", () => {
    it("returns CitationsCard spec when sources are present", async () => {
      mockRetrieveContext.mockResolvedValue(RETRIEVE_SUCCESS)
      const result = await ragAgentNode(makeState())
      expect(result.componentSpec?.component).toBe("CitationsCard")
      expect(result.componentSpec?.props.sources).toEqual([
        "https://example.com/products",
        "https://example.com/shipping",
      ])
    })

    it("omits componentSpec when all sources are empty strings", async () => {
      mockRetrieveContext.mockResolvedValue(RETRIEVE_NO_SOURCES)
      const result = await ragAgentNode(makeState())
      expect(result.componentSpec).toBeUndefined()
    })

    it("omits componentSpec when retrieval fails", async () => {
      mockRetrieveContext.mockResolvedValue(RETRIEVE_FAILURE)
      const result = await ragAgentNode(makeState())
      expect(result.componentSpec).toBeUndefined()
    })
  })

  // ── Retrieval failure handling ─────────────────────────────────────────────

  describe("retrieval failure — graceful degradation", () => {
    it("still calls callClaude when retrieval fails", async () => {
      mockRetrieveContext.mockResolvedValue(RETRIEVE_FAILURE)
      await ragAgentNode(makeState())
      expect(mockCallClaude).toHaveBeenCalledOnce()
    })

    it("tells Claude no context was found so it can respond honestly", async () => {
      mockRetrieveContext.mockResolvedValue(RETRIEVE_FAILURE)
      await ragAgentNode(makeState())
      const [messages] = mockCallClaude.mock.calls[0] as [unknown[], Record<string, unknown>]
      const systemMsg = (messages as { content: string }[]).find((m) => m instanceof SystemMessage)
      expect(systemMsg?.content).toContain("No relevant content found")
    })

    it("still returns a response string when retrieval fails", async () => {
      mockRetrieveContext.mockResolvedValue(RETRIEVE_FAILURE)
      mockCallClaude.mockResolvedValue(new AIMessage("I couldn't find that in the knowledge base."))
      const result = await ragAgentNode(makeState())
      expect(typeof result.response).toBe("string")
      expect(result.response?.length).toBeGreaterThan(0)
    })
  })

  // ── OTel span ─────────────────────────────────────────────────────────────

  describe("observability", () => {
    it("passes userId and sessionId to withSpan attributes", async () => {
      mockRetrieveContext.mockResolvedValue(RETRIEVE_SUCCESS)
      const { withSpan } = await import("../../src/observability/otel.js")
      await ragAgentNode(makeState({ userId: "u-42", sessionId: "s-99" }))
      expect(withSpan).toHaveBeenCalledWith(
        "rag_agent",
        expect.objectContaining({ userId: "u-42", sessionId: "s-99" }),
        expect.any(Function)
      )
    })
  })
})
