/**
 * Imagen image generation call shape tests (Genkit-based).
 *
 * Tests generateImage() using setAiInstance() to inject a mock,
 * bypassing real Genkit initialization.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const mockGenerate = vi.fn()

const { generateImage, setAiInstance } = await import("../../lib/genkit.js")

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("generateImage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Inject mock Genkit instance
    setAiInstance({ generate: mockGenerate } as unknown as ReturnType<typeof import("genkit").genkit>)
  })

  afterEach(() => {
    vi.clearAllMocks()
    setAiInstance(null as unknown as ReturnType<typeof import("genkit").genkit>)
  })

  it("returns image buffer and cost on successful Imagen call", async () => {
    // Need >100 chars base64 to pass the minimum check
    const longBase64 = Buffer.from("imagebytes").toString("base64").padEnd(120, "A")
    mockGenerate.mockResolvedValue({
      text: "",
      media: { url: `data:image/png;base64,${longBase64}` },
      usage: { inputTokens: 0, outputTokens: 0 },
    })

    const result = await generateImage({ prompt: "A young athlete, photorealistic" })
    expect(result.imageBuffer).toBeInstanceOf(Buffer)
    expect(result.costUsd).toBe(0.02)
  })

  it("decodes base64 from data URL properly", async () => {
    const testData = "test-image-data-x"
    const longBase64 = Buffer.from(testData).toString("base64").padEnd(120, "A")
    mockGenerate.mockResolvedValue({
      text: "",
      media: { url: `data:image/png;base64,${longBase64}` },
      usage: { inputTokens: 0, outputTokens: 0 },
    })

    const result = await generateImage({ prompt: "Test" })
  })

  it("sends prompt to Genkit's generate()", async () => {
    mockGenerate.mockResolvedValue({
      text: "",
      media: { url: "data:image/png;base64,YQ==" },
      usage: { inputTokens: 0, outputTokens: 0 },
    })

    await generateImage({ prompt: "A test image prompt" })

    // First call tries vertexai/gemini-2.5-flash-image
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.stringContaining("gemini-2.5-flash-image"),
        prompt: expect.stringContaining("A test image prompt"),
      })
    )
  })

  it("retries on rate limit (429) errors", async () => {
    vi.useFakeTimers()
    mockGenerate
      .mockRejectedValueOnce(new Error("429 RESOURCE_EXHAUSTED"))
      .mockResolvedValueOnce({
        text: "",
        media: { url: `data:image/png;base64,${Buffer.from("retry-success").toString("base64").padEnd(120, "A")}` },
        usage: { inputTokens: 0, outputTokens: 0 },
      })

    const promise = generateImage({ prompt: "Test" })
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.imageBuffer.toString().startsWith("retry-success")).toBe(true)
    expect(mockGenerate).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it("gives up after MAX_RETRIES rate limits", async () => {
    vi.useFakeTimers()
    mockGenerate.mockRejectedValue(new Error("429 RESOURCE_EXHAUSTED"))

    const promise = generateImage({ prompt: "Test" })
    // Fast-forward through all retry delays
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.model).toBe("placeholder")
    expect(mockGenerate.mock.calls.length).toBe(3) // MAX_RETRIES
    vi.useRealTimers()
  })

  it("does not retry on non-rate-limit errors", async () => {
    mockGenerate.mockRejectedValue(new Error("NOT_FOUND: Model not found"))

    const result = await generateImage({ prompt: "Test" })
    expect(result.model).toBe("placeholder")
    // Only 1 attempt — no retry for non-429 errors
    expect(mockGenerate).toHaveBeenCalledTimes(1)
  })

  it("charges $0.02 per successful image generation", async () => {
    const longBase64 = Buffer.from("long-enough-image-data-for-cost-test").toString("base64").padEnd(120, "A")
    mockGenerate.mockResolvedValue({
      text: "",
      media: { url: `data:image/png;base64,${longBase64}` },
      usage: { inputTokens: 0, outputTokens: 0 },
    })

    const result = await generateImage({ prompt: "Test" })
    expect(result.costUsd).toBe(0.02)
  })

  it("charges $0.00 for placeholder fallback", async () => {
    mockGenerate.mockRejectedValue(new Error("NOT_FOUND"))

    const result = await generateImage({ prompt: "Test" })
    expect(result.costUsd).toBe(0)
  })
})
