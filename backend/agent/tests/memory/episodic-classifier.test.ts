import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock @anthropic-ai/sdk ─────────────────────────────────────────────────────
// classifyEpisodicEvent creates a new Anthropic client internally.
// We intercept messages.create to control the classifier output.

const mockCreate = vi.hoisted(() => vi.fn())

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}))

import { classifyEpisodicEvent } from "../../src/memory/episodic.classifier.js"

function anthropicResponse(text: string) {
  return { content: [{ type: "text", text }] }
}

describe("classifyEpisodicEvent", () => {
  beforeEach(() => { mockCreate.mockReset() })

  // ── Episodic detections ──────────────────────────────────────────────────────

  it("returns summary when agent resolves a complaint", async () => {
    mockCreate.mockResolvedValueOnce(
      anthropicResponse(JSON.stringify({ episodic: true, summary: "User's billing issue was resolved with a £10 credit." }))
    )
    const result = await classifyEpisodicEvent(
      "I was charged twice last month",
      "I've applied a £10 credit to your account. The duplicate charge has been resolved."
    )
    expect(result).toBe("User's billing issue was resolved with a £10 credit.")
  })

  it("returns summary when agent confirms an account change", async () => {
    mockCreate.mockResolvedValueOnce(
      anthropicResponse(JSON.stringify({ episodic: true, summary: "User's delivery address updated to 42 Park Road, Sydney." }))
    )
    const result = await classifyEpisodicEvent(
      "Can you update my address to 42 Park Road?",
      "Done — your delivery address has been updated to 42 Park Road, Sydney."
    )
    expect(result).toBe("User's delivery address updated to 42 Park Road, Sydney.")
  })

  it("returns summary when agent escalates to a specialist", async () => {
    mockCreate.mockResolvedValueOnce(
      anthropicResponse(JSON.stringify({ episodic: true, summary: "User's complaint escalated to a specialist team." }))
    )
    const result = await classifyEpisodicEvent(
      "This is the third time I've had this problem",
      "I've escalated this to our specialist team. You'll hear back within 24 hours."
    )
    expect(result).toBe("User's complaint escalated to a specialist team.")
  })

  it("returns summary when a multi-step workflow completes", async () => {
    mockCreate.mockResolvedValueOnce(
      anthropicResponse(JSON.stringify({ episodic: true, summary: "Return initiated for order #88321." }))
    )
    const result = await classifyEpisodicEvent(
      "I want to return order 88321",
      "Your return for order #88321 has been initiated. A prepaid label is on its way."
    )
    expect(result).toBe("Return initiated for order #88321.")
  })

  // ── Non-episodic ─────────────────────────────────────────────────────────────

  it("returns null for routine Q&A", async () => {
    mockCreate.mockResolvedValueOnce(
      anthropicResponse(JSON.stringify({ episodic: false }))
    )
    const result = await classifyEpisodicEvent(
      "What are your opening hours?",
      "We're open Monday to Friday, 9am to 6pm AEST."
    )
    expect(result).toBeNull()
  })

  it("returns null for a partial or in-progress response", async () => {
    mockCreate.mockResolvedValueOnce(
      anthropicResponse(JSON.stringify({ episodic: false }))
    )
    const result = await classifyEpisodicEvent(
      "Can you help me with my order?",
      "Of course! Could you share your order number so I can look into it?"
    )
    expect(result).toBeNull()
  })

  // ── Error handling ───────────────────────────────────────────────────────────

  it("returns null when Anthropic throws", async () => {
    mockCreate.mockRejectedValueOnce(new Error("API unavailable"))
    const result = await classifyEpisodicEvent("anything", "anything")
    expect(result).toBeNull()
  })

  it("returns null when response is malformed JSON", async () => {
    mockCreate.mockResolvedValueOnce(anthropicResponse("not valid json at all"))
    const result = await classifyEpisodicEvent("anything", "anything")
    expect(result).toBeNull()
  })

  it("returns null when response content is empty", async () => {
    mockCreate.mockResolvedValueOnce({ content: [] })
    const result = await classifyEpisodicEvent("anything", "anything")
    expect(result).toBeNull()
  })

  it("returns null when episodic is true but summary is missing", async () => {
    mockCreate.mockResolvedValueOnce(
      anthropicResponse(JSON.stringify({ episodic: true }))
    )
    const result = await classifyEpisodicEvent("anything", "anything")
    expect(result).toBeNull()
  })
})
