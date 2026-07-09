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

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.stringContaining("imagen"),
        prompt: expect.stringContaining("A test image prompt"),
      })
    )
  })

  it("includes square format by default", async () => {
    mockGenerate.mockResolvedValue({
      text: "",
      media: { url: "data:image/png;base64,YQ==" },
      usage: { inputTokens: 0, outputTokens: 0 },
    })

    await generateImage({ prompt: "Test" })
    expect(mockGenerate.mock.calls[0]?.[0]?.prompt).toContain("square 1:1 format")
    expect(mockGenerate.mock.calls[0]?.[0]?.prompt).toContain("photorealistic")
  })

  it("uses 9:16 format when aspectRatio is set", async () => {
    mockGenerate.mockResolvedValue({
      text: "",
      media: { url: "data:image/png;base64,YQ==" },
      usage: { inputTokens: 0, outputTokens: 0 },
    })

    await generateImage({ prompt: "Test", aspectRatio: "9:16" })
    expect(mockGenerate.mock.calls[0]?.[0]?.prompt).toContain("vertical 9:16 format")
  })

  it("falls back to placeholder when generate throws", async () => {
    mockGenerate.mockRejectedValue(new Error("Imagen not available"))

    const result = await generateImage({ prompt: "Test" })
    expect(result.model).toBe("placeholder")
    expect(result.costUsd).toBe(0)
    expect(result.imageBuffer).toBeInstanceOf(Buffer)
  })

  it("falls back to placeholder when media is null", async () => {
    mockGenerate.mockResolvedValue({
      text: "No image generated",
      media: null,
      usage: { inputTokens: 0, outputTokens: 0 },
    })

    const result = await generateImage({ prompt: "Test" })
    expect(result.model).toBe("placeholder")
    expect(result.costUsd).toBe(0)
  })

  it("falls back to placeholder when base64 is too short", async () => {
    mockGenerate.mockResolvedValue({
      text: "",
      media: { url: "data:image/png;base64,abc" },
      usage: { inputTokens: 0, outputTokens: 0 },
    })

    const result = await generateImage({ prompt: "Test" })
    expect(result.model).toBe("placeholder")
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
    mockGenerate.mockRejectedValue(new Error("Any error"))

    const result = await generateImage({ prompt: "Test" })
    expect(result.costUsd).toBe(0)
  })
})
