/**
 * Gemini adapter tests — API call shape + error handling.
 *
 * Tests the `callGemini` function and its cost calculation.
 * Mocks the Vertex AI SDK at the external boundary per TDD convention.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockGenerateContent = vi.fn()
const mockGetGenerativeModel = vi.fn()

vi.mock("@google-cloud/vertexai", () => ({
  VertexAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}))

// Dynamic import so mocks are in place before module loads
const { callGemini, parseGeminiJson, validateParsedBrief } =
  await import("../../lib/gemini.js")

// ── Helpers ────────────────────────────────────────────────────────────────────

function mockModelResponse(overrides: Record<string, unknown> = {}) {
  return {
    response: {
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify({ brand: "Nike", test: true }) }],
          },
        },
      ],
      usageMetadata: {
        promptTokenCount: 150,
        candidatesTokenCount: 80,
        totalTokenCount: 230,
        ...overrides,
      },
    },
  }
}

function setupModel(response: unknown) {
  mockGenerateContent.mockResolvedValue(response)
  mockGetGenerativeModel.mockReturnValue({
    generateContent: mockGenerateContent,
  })
}

// ── callGemini ─────────────────────────────────────────────────────────────────

describe("callGemini", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupModel(mockModelResponse())
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── Response shape ────────────────────────────────────────────────────────

  it("returns the expected GeminiResponse shape on success", async () => {
    const result = await callGemini("Test brief")

    expect(result).toHaveProperty("text")
    expect(result).toHaveProperty("usage")
    expect(result).toHaveProperty("model")
    expect(typeof result.text).toBe("string")
    expect(typeof result.usage.inputTokens).toBe("number")
    expect(typeof result.usage.outputTokens).toBe("number")
    expect(typeof result.usage.costUsd).toBe("number")
    expect(result.model).toBe("gemini-2.5-flash")
  })

  it("extracts text from the first candidate content part", async () => {
    const expectedText = JSON.stringify({ brand: "Nike", test: true })
    const result = await callGemini("Test brief")
    expect(result.text).toBe(expectedText)
  })

  it("returns usage metadata with correct token counts", async () => {
    const result = await callGemini("Test brief")
    expect(result.usage.inputTokens).toBe(150)
    expect(result.usage.outputTokens).toBe(80)
  })

  // ── Empty / missing response fields ───────────────────────────────────────

  it("returns empty string when candidates array is empty", async () => {
    setupModel({
      response: {
        candidates: [],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0 },
      },
    })

    const result = await callGemini("Test brief")
    expect(result.text).toBe("")
  })

  it("returns empty string when candidates[0] has no content", async () => {
    setupModel({
      response: {
        candidates: [{ content: null }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0 },
      },
    })

    const result = await callGemini("Test brief")
    expect(result.text).toBe("")
  })

  it("returns zero tokens when usageMetadata is missing", async () => {
    setupModel({
      response: {
        candidates: [
          { content: { parts: [{ text: "some text" }] } },
        ],
      },
    })

    const result = await callGemini("Test brief")
    expect(result.usage.inputTokens).toBe(0)
    expect(result.usage.outputTokens).toBe(0)
  })

  // ── Model selection ───────────────────────────────────────────────────────

  it("uses gemini-2.5-flash as the default model", async () => {
    await callGemini("Test brief")

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-2.5-flash" })
    )
  })

  it("respects custom model option", async () => {
    await callGemini("Test brief", { model: "gemini-2.5-pro" })

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-2.5-pro" })
    )
  })

  // ── System prompt ─────────────────────────────────────────────────────────

  it("passes system instruction when systemPrompt is provided", async () => {
    const systemPrompt = "You are a creative brief parser."
    await callGemini("Test brief", { systemPrompt })

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInstruction: {
          role: "system",
          parts: [{ text: systemPrompt }],
        },
      })
    )
  })

  it("omits system instruction when systemPrompt is not provided", async () => {
    await callGemini("Test brief")

    const callArgs = mockGetGenerativeModel.mock.calls[0]?.[0]
    expect(callArgs).not.toHaveProperty("systemInstruction")
  })

  // ── Generation config ─────────────────────────────────────────────────────

  it("uses maxOutputTokens of 2048 by default", async () => {
    await callGemini("Test brief")

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        generationConfig: expect.objectContaining({ maxOutputTokens: 2048 }),
      })
    )
  })

  it("respects custom maxTokens option", async () => {
    await callGemini("Test brief", { maxTokens: 1024 })

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        generationConfig: expect.objectContaining({ maxOutputTokens: 1024 }),
      })
    )
  })

  it("omits temperature when not provided", async () => {
    await callGemini("Test brief")

    const callArgs = mockGetGenerativeModel.mock.calls[0]?.[0]
    expect(
      (callArgs as Record<string, unknown>)["generationConfig"] as Record<string, unknown>
    ).not.toHaveProperty("temperature")
  })

  it("passes temperature when provided", async () => {
    await callGemini("Test brief", { temperature: 0.3 })

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        generationConfig: expect.objectContaining({ temperature: 0.3 }),
      })
    )
  })

  // ── Cost calculation ──────────────────────────────────────────────────────

  it("calculates cost correctly with known pricing", async () => {
    // Gemini 2.5 Flash: input $0.00001875/1k, output $0.000075/1k
    // 150 input tokens = 150/1000 * 0.00001875 = 0.0000028125
    // 80 output tokens = 80/1000 * 0.000075 = 0.000006
    // Total = 0.0000088125
    const result = await callGemini("Test brief")
    expect(result.usage.costUsd).toBeCloseTo(0.0000088125, 10)
  })

  it("returns zero cost when token counts are zero", async () => {
    setupModel({
      response: {
        candidates: [
          { content: { parts: [{ text: "empty response" }] } },
        ],
        usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0 },
      },
    })

    const result = await callGemini("Test brief")
    expect(result.usage.costUsd).toBe(0)
  })

  it("handles large token counts for cost calculation", async () => {
    setupModel({
      response: {
        candidates: [
          { content: { parts: [{ text: "large response" }] } },
        ],
        usageMetadata: {
          promptTokenCount: 100_000,
          candidatesTokenCount: 50_000,
        },
      },
    })

    const result = await callGemini("Test brief")
    // 100 * 0.00001875 + 50 * 0.000075 = 0.001875 + 0.00375 = 0.005625
    expect(result.usage.costUsd).toBeCloseTo(0.005625, 8)
  })

  // ── Error handling ────────────────────────────────────────────────────────

  it("propagates API errors (network failure)", async () => {
    mockGenerateContent.mockRejectedValue(new Error("Network error: connect ETIMEDOUT"))

    await expect(callGemini("Test brief")).rejects.toThrow("Network error")
  })

  it("propagates API errors (rate limit / 429)", async () => {
    mockGenerateContent.mockRejectedValue(
      new Error("429 Too Many Requests — quota exceeded")
    )

    await expect(callGemini("Test brief")).rejects.toThrow("429")
  })

  it("propagates API errors (auth / 403)", async () => {
    mockGenerateContent.mockRejectedValue(
      new Error("403 Forbidden — insufficient permissions")
    )

    await expect(callGemini("Test brief")).rejects.toThrow("403")
  })

  // ── User message handling ─────────────────────────────────────────────────

  it("sends the user message in the contents array", async () => {
    const message = "Create a 30s ad for Nike Air Max Dn targeting Gen Z on TikTok."
    await callGemini(message)

    expect(mockGenerateContent).toHaveBeenCalledWith({
      contents: [{ role: "user", parts: [{ text: message }] }],
    })
  })

  it("handles empty user message", async () => {
    await callGemini("")

    expect(mockGenerateContent).toHaveBeenCalledWith({
      contents: [{ role: "user", parts: [{ text: "" }] }],
    })
  })

  it("handles very long user messages", async () => {
    const longMessage = "A".repeat(100_000)
    await callGemini(longMessage)

    expect(mockGenerateContent).toHaveBeenCalledWith({
      contents: [{ role: "user", parts: [{ text: longMessage }] }],
    })
  })
})

// ── Cost calculation edge cases ────────────────────────────────────────────────

describe("cost calculation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupModel(mockModelResponse())
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("calculates cost for the default model (gemini-2.5-flash)", async () => {
    // These specific token counts produce a verifiable cost
    setupModel({
      response: {
        candidates: [
          { content: { parts: [{ text: "x" }] } },
        ],
        usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 1000 },
      },
    })

    const result = await callGemini("Test")
    // 1000/1000 * 0.00001875 + 1000/1000 * 0.000075 = 0.00001875 + 0.000075 = 0.00009375
    expect(result.usage.costUsd).toBeCloseTo(0.00009375, 8)
  })

  it("uses gemini-2.5-flash pricing as fallback for unknown models", async () => {
    setupModel({
      response: {
        candidates: [
          { content: { parts: [{ text: "x" }] } },
        ],
        usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 1000 },
      },
    })

    const result = await callGemini("Test", { model: "some-future-model" })
    // Falls back to gemini-2.5-flash pricing
    expect(result.usage.costUsd).toBeCloseTo(0.00009375, 8)
  })
})

// ── Re-exported pure functions (contract: they are the same functions) ─────────

describe("parseGeminiJson (via gemini adapter)", () => {
  it("is exported and functional", () => {
    const result = parseGeminiJson('{"key":"value"}')
    expect(result).toEqual({ key: "value" })
  })

  it("returns null for invalid input", () => {
    expect(parseGeminiJson("not json")).toBeNull()
  })
})

describe("validateParsedBrief (via gemini adapter)", () => {
  it("is exported and functional", () => {
    const result = validateParsedBrief({
      brand: "Test",
      campaign_objective: "Test objective",
      target_audience: { primary: "Test audience", secondary: null },
      key_message: "Test message",
      tone_descriptors: ["bold"],
      confidence_score: 0.9,
    })
    expect(result.valid).toBe(true)
  })

  it("detects missing required fields", () => {
    const result = validateParsedBrief({})
    expect(result.valid).toBe(false)
    expect(result.gaps.length).toBeGreaterThan(0)
  })
})
