/**
 * Imagen / Gemini image generation call shape tests.
 *
 * Tests generateImage(): prompt assembly, SDK call shape,
 * response handling (inlineData), placeholder fallback, cost.
 * Mocks the Vertex AI SDK at the boundary per TDD convention.
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

const { generateImage } = await import("../../lib/gemini.js")

// ── Helpers ────────────────────────────────────────────────────────────────────

function mockImageResponse(base64Image: string) {
  mockGenerateContent.mockResolvedValue({
    response: {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: base64Image,
                },
              },
            ],
          },
        },
      ],
    },
  })
  mockGetGenerativeModel.mockReturnValue({
    generateContent: mockGenerateContent,
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("generateImage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockImageResponse("aW1hZ2VieXRlcw==") // "imagebytes" in base64
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── Response shape ────────────────────────────────────────────────────────

  it("returns image buffer, cost, and model on success", async () => {
    const result = await generateImage({
      prompt: "A young athlete, photorealistic",
    })

    expect(result.imageBuffer).toBeInstanceOf(Buffer)
    expect(result.imageBuffer.toString()).toBe("imagebytes")
    expect(result.costUsd).toBe(0.02)
    expect(result.model).toBe("gemini-2.0-flash-image-generation")
  })

  it("decodes base64 inlineData into Buffer", async () => {
    mockImageResponse("dGVzdC1pbWFnZS1kYXRh") // "test-image-data"
    const result = await generateImage({ prompt: "Test" })
    expect(result.imageBuffer.toString()).toBe("test-image-data")
  })

  // ── Prompt assembly ───────────────────────────────────────────────────────

  it("calls getGenerativeModel with the image model", async () => {
    await generateImage({ prompt: "Test prompt" })

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-2.0-flash-image-generation" })
    )
  })

  it("sends prompt in contents array", async () => {
    await generateImage({ prompt: "A test image prompt" })

    const callArgs = mockGenerateContent.mock.calls[0]?.[0] as Record<string, unknown>
    const contents = callArgs["contents"] as Array<Record<string, unknown>>
    const parts = contents[0]?.["parts"] as Array<Record<string, unknown>>
    expect(parts[0]?.["text"]).toContain("A test image prompt")
  })

  it("includes photorealistic and aspect ratio in prompt", async () => {
    await generateImage({ prompt: "Test" })

    const callArgs = mockGenerateContent.mock.calls[0]?.[0] as Record<string, unknown>
    const contents = callArgs["contents"] as Array<Record<string, unknown>>
    const parts = contents[0]?.["parts"] as Array<Record<string, unknown>>
    expect(parts[0]?.["text"]).toContain("photorealistic")
    expect(parts[0]?.["text"]).toContain("1:1 aspect ratio")
  })

  it("includes negative prompt when provided", async () => {
    await generateImage({
      prompt: "Test",
      negativePrompt: "No violence, no nudity",
    })

    const callArgs = mockGenerateContent.mock.calls[0]?.[0] as Record<string, unknown>
    const contents = callArgs["contents"] as Array<Record<string, unknown>>
    const parts = contents[0]?.["parts"] as Array<Record<string, unknown>>
    expect(parts[0]?.["text"]).toContain("No violence, no nudity")
  })

  it("omits negative prompt text when not provided", async () => {
    await generateImage({ prompt: "Test" })

    const callArgs = mockGenerateContent.mock.calls[0]?.[0] as Record<string, unknown>
    const contents = callArgs["contents"] as Array<Record<string, unknown>>
    const parts = contents[0]?.["parts"] as Array<Record<string, unknown>>
    expect(parts[0]?.["text"]).not.toContain("Avoid:")
  })

  it("sets maxOutputTokens to 4096", async () => {
    await generateImage({ prompt: "Test" })

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        generationConfig: expect.objectContaining({ maxOutputTokens: 4096 }),
      })
    )
  })

  // ── Placeholder fallback ──────────────────────────────────────────────────

  it("falls back to placeholder when model throws", async () => {
    mockGenerateContent.mockRejectedValue(new Error("Model not found"))

    const result = await generateImage({ prompt: "Test" })
    expect(result.model).toBe("placeholder")
    expect(result.costUsd).toBe(0)
    expect(result.imageBuffer).toBeInstanceOf(Buffer)
  })

  it("falls back to placeholder when response has no inlineData", async () => {
    mockGetGenerativeModel.mockReturnValue({
      generateContent: vi.fn().mockResolvedValue({
        response: {
          candidates: [{ content: { parts: [{ text: "I cannot generate images" }] } }],
        },
      }),
    })

    const result = await generateImage({ prompt: "Test" })
    expect(result.model).toBe("placeholder")
    expect(result.costUsd).toBe(0)
  })

  it("falls back to placeholder when candidates array is empty", async () => {
    mockGetGenerativeModel.mockReturnValue({
      generateContent: vi.fn().mockResolvedValue({
        response: { candidates: [] },
      }),
    })

    const result = await generateImage({ prompt: "Test" })
    expect(result.model).toBe("placeholder")
  })

  // ── Cost ──────────────────────────────────────────────────────────────────

  it("charges $0.02 per successful image generation", async () => {
    const result = await generateImage({ prompt: "Test" })
    expect(result.costUsd).toBe(0.02)
  })

  it("charges $0.00 for placeholder fallback", async () => {
    mockGenerateContent.mockRejectedValue(new Error("Any error"))

    const result = await generateImage({ prompt: "Test" })
    expect(result.costUsd).toBe(0)
  })
})
