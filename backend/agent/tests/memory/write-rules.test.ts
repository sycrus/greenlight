import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest"
import { HumanMessage } from "@langchain/core/messages"
import type { GraphState } from "../../src/types/index.js"

// ── Module mocks (hoisted) ─────────────────────────────────────────────────────

const mockMemoryAdd = vi.hoisted(() => vi.fn())
const mockMemorySearch = vi.hoisted(() => vi.fn())
const mockGraphInvoke = vi.hoisted(() => vi.fn())
const mockClassifyEpisodic = vi.hoisted(() => vi.fn())
const mockStreamClaude = vi.hoisted(() => vi.fn())

vi.mock("mem0ai", () => ({ default: vi.fn().mockReturnValue({}) }))
vi.mock("@google-cloud/aiplatform", () => ({
  PredictionServiceClient: vi.fn().mockReturnValue({}),
  helpers: { toValue: vi.fn(), fromValue: vi.fn() },
}))
vi.mock("pg", () => ({ default: { Pool: vi.fn().mockReturnValue({}) } }))
vi.mock("langfuse", () => ({ default: vi.fn().mockReturnValue({ trace: vi.fn(), flushAsync: vi.fn() }) }))

vi.mock("../../src/memory/store.js", () => ({
  memoryStore: { add: mockMemoryAdd, search: mockMemorySearch },
}))

vi.mock("../../src/memory/episodic.classifier.js", () => ({
  classifyEpisodicEvent: mockClassifyEpisodic,
}))

vi.mock("../../src/graph/index.js", () => ({
  graph: { invoke: mockGraphInvoke },
}))

vi.mock("../../src/observability/otel.js", () => ({
  initTelemetry: vi.fn(),
  shutdownTelemetry: vi.fn().mockResolvedValue(undefined),
  withSpan: vi.fn((_n: string, _a: unknown, fn: () => unknown) => fn()),
}))

vi.mock("../../src/observability/langfuse.client.js", () => ({
  getLangfuse: vi.fn().mockReturnValue(null),
}))

vi.mock("../../src/providers/anthropic.adapter.js", () => ({
  streamClaude: mockStreamClaude,
  callClaude: vi.fn(),
}))

// ── Default mock implementations ──────────────────────────────────────────────

beforeEach(() => {
  mockMemoryAdd.mockResolvedValue("mem-id")
  mockMemorySearch.mockResolvedValue([])
  mockClassifyEpisodic.mockResolvedValue(null)
  mockStreamClaude.mockResolvedValue(new HumanMessage("I can help you with that."))
})

// ── Feature 1: Memory type field ──────────────────────────────────────────────

import { PlaceholderMemoryStore } from "../../src/memory/mem0.adapter.js"

describe("MemoryEntry type field — PlaceholderMemoryStore", () => {
  it("defaults type to semantic when no type in metadata", async () => {
    const store = new PlaceholderMemoryStore()
    await store.add("user-1", "prefers email notifications")
    const [entry] = await store.getAll("user-1")
    expect(entry?.type).toBe("semantic")
  })

  it("stores and returns semantic type from metadata", async () => {
    const store = new PlaceholderMemoryStore()
    await store.add("user-1", "lives in Sydney", { type: "semantic" })
    const [entry] = await store.getAll("user-1")
    expect(entry?.type).toBe("semantic")
  })

  it("stores and returns episodic type from metadata", async () => {
    const store = new PlaceholderMemoryStore()
    await store.add("user-1", "Refund processed for order #123", { type: "episodic" })
    const [entry] = await store.getAll("user-1")
    expect(entry?.type).toBe("episodic")
  })

  it("stores and returns procedural type from metadata", async () => {
    const store = new PlaceholderMemoryStore()
    await store.add("user-1", "Frequently contacts about delivery delays", { type: "procedural" })
    const [entry] = await store.getAll("user-1")
    expect(entry?.type).toBe("procedural")
  })

  it("falls back to semantic for unknown type values", async () => {
    const store = new PlaceholderMemoryStore()
    await store.add("user-1", "some content", { type: "unknown-garbage" })
    const [entry] = await store.getAll("user-1")
    expect(entry?.type).toBe("semantic")
  })

  it("search results include type", async () => {
    const store = new PlaceholderMemoryStore()
    await store.add("user-1", "allergic to peanuts", { type: "semantic" })
    const results = await store.search("user-1", "allergy")
    expect(results[0]?.type).toBe("semantic")
  })
})

// ── Feature 2: CS agent — task-only prompt (memory is Parlant's responsibility) ──

import { customerServiceAgentNode } from "../../src/agents/customer-service.js"

function makeState(overrides: Partial<GraphState> = {}): GraphState {
  return {
    messages: [new HumanMessage("I need help with my order")],
    userId: "user-1",
    sessionId: "session-1",
    route: { agent: "customer_service", reason: "general query" },
    response: null,
    memories: [],
    componentSpec: null,
    ...overrides,
  }
}

describe("customerServiceAgentNode — task-only prompt", () => {
  beforeEach(() => {
    mockMemorySearch.mockReset().mockResolvedValue([])
    mockStreamClaude.mockReset().mockResolvedValue(new HumanMessage("I can help you with that."))
  })

  it("does not call memoryStore.search — memory recall is Parlant's job", async () => {
    await customerServiceAgentNode(makeState())
    expect(mockMemorySearch).not.toHaveBeenCalled()
  })

  it("system prompt contains no tone or compliance instructions", async () => {
    await customerServiceAgentNode(makeState())
    const systemMsg = mockStreamClaude.mock.calls[0]?.[0]?.[0]
    expect(systemMsg?.content).not.toContain("concierge")
    expect(systemMsg?.content).not.toContain("refund")
    expect(systemMsg?.content).not.toContain("competitor")
  })
})

// ── Feature 3: Ephemeral write filter + episodic classifier trigger ────────────
// Spins up the real server (with mocked graph + memoryStore + classifier)
// and hits POST /chat with controlled routes.

const TEST_PORT = 18743
process.env["PORT"] = String(TEST_PORT)

describe("server write rules", () => {
  let serverInstance: import("http").Server

  beforeAll(async () => {
    const mod = await import("../../src/server.js")
    serverInstance = mod.server
    await new Promise<void>((resolve) => {
      if (serverInstance.listening) return resolve()
      serverInstance.once("listening", resolve)
    })
  })

  afterAll(() => {
    serverInstance.close()
  })

  beforeEach(() => {
    mockMemoryAdd.mockReset().mockResolvedValue("mem-id")
    mockClassifyEpisodic.mockReset().mockResolvedValue(null)
  })

  async function postChat(route: "weather" | "customer_service" | "rag") {
    const responses: Record<string, string> = {
      customer_service: "I can help you with that.",
      rag: "Here is what I found in the knowledge base.",
      weather: "It will be sunny.",
    }
    mockGraphInvoke.mockResolvedValueOnce({
      route: { agent: route, reason: "test" },
      response: responses[route] ?? "",
      componentSpec: null,
      messages: [],
      memories: [],
    })
    const res = await fetch(`http://localhost:${TEST_PORT}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "test message", userId: "user-1", sessionId: "sess-1" }),
    })
    // Consume the SSE stream fully so all fire-and-forget tasks can settle
    await res.text()
    await new Promise((r) => setTimeout(r, 50))
  }

  it("writes semantic memory for customer_service route", async () => {
    await postChat("customer_service")
    expect(mockMemoryAdd).toHaveBeenCalledWith(
      "user-1",
      "test message",
      expect.objectContaining({ type: "semantic", agentRoute: "customer_service" })
    )
  })

  it("does not write memory for weather route", async () => {
    await postChat("weather")
    expect(mockMemoryAdd).not.toHaveBeenCalled()
  })

  it("triggers episodic classifier after customer_service response", async () => {
    await postChat("customer_service")
    expect(mockClassifyEpisodic).toHaveBeenCalledWith(
      "test message",
      "I can help you with that."
    )
  })

  it("does not trigger episodic classifier for weather route", async () => {
    await postChat("weather")
    expect(mockClassifyEpisodic).not.toHaveBeenCalled()
  })

  it("writes episodic memory when classifier returns a summary", async () => {
    mockClassifyEpisodic.mockResolvedValueOnce("User's return was initiated for order #99.")
    await postChat("customer_service")
    expect(mockMemoryAdd).toHaveBeenCalledWith(
      "user-1",
      "User's return was initiated for order #99.",
      expect.objectContaining({ type: "episodic" })
    )
  })

  it("does not write episodic memory when classifier returns null", async () => {
    mockClassifyEpisodic.mockResolvedValueOnce(null)
    await postChat("customer_service")
    // Only the semantic write should have happened
    expect(mockMemoryAdd).toHaveBeenCalledTimes(1)
    expect(mockMemoryAdd).toHaveBeenCalledWith(
      "user-1",
      "test message",
      expect.objectContaining({ type: "semantic" })
    )
  })

  // ── RAG route write rules ─────────────────────────────────────────────────

  it("writes semantic memory for rag route (knowledge queries have long-term value)", async () => {
    await postChat("rag")
    expect(mockMemoryAdd).toHaveBeenCalledWith(
      "user-1",
      "test message",
      expect.objectContaining({ type: "semantic", agentRoute: "rag" })
    )
  })

  it("does not trigger episodic classifier for rag route", async () => {
    await postChat("rag")
    expect(mockClassifyEpisodic).not.toHaveBeenCalled()
  })
})
