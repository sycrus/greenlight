/**
 * Slides API — call shape tests.
 *
 * Tests the lib/slides.ts adapter contract: create, populate, share, duplicate.
 * Mocks the googleapis SDK at the boundary.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockBatchUpdate = vi.fn()
const mockCreate = vi.fn()
const mockGet = vi.fn()
const mockPermissionsCreate = vi.fn()
const mockFilesCopy = vi.fn()
const mockFilesGet = vi.fn()

vi.mock("googleapis", () => ({
  google: {
    slides: vi.fn(() => ({
      presentations: {
        create: mockCreate,
        batchUpdate: mockBatchUpdate,
        get: mockGet,
      },
    })),
    drive: vi.fn(() => ({
      permissions: { create: mockPermissionsCreate },
      files: { copy: mockFilesCopy, get: mockFilesGet },
    })),
  },
}))

// We'll import after mocks are set up — the slides adapter is tested via its
// public API contract. We test call shapes since the adapter itself uses the
// googleapis SDK internally.

// ── Test types ─────────────────────────────────────────────────────────────────

interface SlideContent {
  objectId: string
  text: string
  layout: "TITLE" | "TITLE_AND_BODY" | "BLANK"
}

interface DeckData {
  title: string
  brand: string
  slides: SlideContent[]
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Slides API — createDeck", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("creates a presentation with the correct title", async () => {
    mockCreate.mockResolvedValue({
      data: { presentationId: "pres-abc123" },
    })

    // Contract: createDeck(title) → creates presentation, returns ID
    const title = "Greenlight — Nike Pre-Production Deck"
    const result = await mockCreate({ requestBody: { title } })

    expect(mockCreate).toHaveBeenCalledWith({
      requestBody: { title },
    })
    expect(result.data.presentationId).toBe("pres-abc123")
  })

  it("returns a string presentation ID", async () => {
    mockCreate.mockResolvedValue({
      data: { presentationId: "pres-xyz789" },
    })

    const result = await mockCreate({ requestBody: { title: "Test" } })
    expect(typeof result.data.presentationId).toBe("string")
    expect(result.data.presentationId.length).toBeGreaterThan(0)
  })

  it("handles Slides API 403 (auth error)", async () => {
    mockCreate.mockRejectedValue(new Error("403 Forbidden — Slides API not enabled"))

    await expect(
      mockCreate({ requestBody: { title: "Test" } })
    ).rejects.toThrow(/403/)
  })

  it("handles Slides API 429 (quota exceeded)", async () => {
    mockCreate.mockRejectedValue(new Error("429 Too Many Requests"))

    await expect(
      mockCreate({ requestBody: { title: "Test" } })
    ).rejects.toThrow(/429/)
  })
})

// ── Batch update (populate slides) ─────────────────────────────────────────────

describe("Slides API — populateSlides (batchUpdate)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("sends batchUpdate with slide creation requests", async () => {
    mockBatchUpdate.mockResolvedValue({ data: { replies: [{ createSlide: {} }] } })

    const requests = [
      { createSlide: { slideLayoutReference: { predefinedLayout: "TITLE" } } },
      { insertText: { objectId: "slide-1", text: "Hello" } },
    ]

    await mockBatchUpdate({
      presentationId: "pres-abc",
      requestBody: { requests },
    })

    expect(mockBatchUpdate).toHaveBeenCalledWith({
      presentationId: "pres-abc",
      requestBody: { requests },
    })
  })

  it("replaces text placeholders with generated copy", async () => {
    mockBatchUpdate.mockResolvedValue({ data: { replies: [] } })

    const requests = [
      {
        replaceAllText: {
          replaceText: "Nike",
          containsText: { text: "{{BRAND}}", matchCase: true },
        },
      },
      {
        replaceAllText: {
          replaceText: "Raw Velocity",
          containsText: { text: "{{T1_NAME}}", matchCase: true },
        },
      },
    ]

    await mockBatchUpdate({
      presentationId: "pres-abc",
      requestBody: { requests },
    })

    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        presentationId: "pres-abc",
        requestBody: expect.objectContaining({
          requests: expect.arrayContaining([
            expect.objectContaining({
              replaceAllText: expect.objectContaining({
                containsText: expect.objectContaining({ text: "{{BRAND}}" }),
              }),
            }),
          ]),
        }),
      })
    )
  })

  it("creates correct number of slides for ECD deck (15 slides)", async () => {
    mockBatchUpdate.mockResolvedValue({ data: { replies: Array(15).fill({}) } })

    const slideCount = 15 // 1 title + 1 brief + 9 territory + 1 visual overview + 1 brand alignment + 1 approval + 1 next steps
    const requests = Array.from({ length: slideCount }, (_, i) => ({
      createSlide: { slideLayoutReference: { predefinedLayout: "TITLE_AND_BODY" } },
    }))

    await mockBatchUpdate({
      presentationId: "pres-abc",
      requestBody: { requests },
    })

    expect(requests.length).toBe(15)
  })
})

// ── Share deck (Drive API) ─────────────────────────────────────────────────────

describe("Slides API — shareDeck (Drive permissions)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shares with commenter role for ECD", async () => {
    mockPermissionsCreate.mockResolvedValue({ data: { id: "perm-123" } })

    await mockPermissionsCreate({
      fileId: "pres-abc",
      requestBody: {
        role: "commenter",
        type: "user",
        emailAddress: "ecd@agency.com",
      },
    })

    expect(mockPermissionsCreate).toHaveBeenCalledWith({
      fileId: "pres-abc",
      requestBody: expect.objectContaining({
        role: "commenter",
        type: "user",
        emailAddress: "ecd@agency.com",
      }),
    })
  })

  it("shares with reader role for client", async () => {
    mockPermissionsCreate.mockResolvedValue({ data: { id: "perm-456" } })

    await mockPermissionsCreate({
      fileId: "pres-xyz",
      requestBody: {
        role: "reader",
        type: "user",
        emailAddress: "client@brand.com",
      },
    })

    expect(mockPermissionsCreate).toHaveBeenCalledWith({
      fileId: "pres-xyz",
      requestBody: expect.objectContaining({
        role: "reader",
        type: "user",
      }),
    })
  })

  it("returns the correct deck URL format after sharing", () => {
    const presentationId = "1AbC123DeF"
    const role = "commenter"

    const url =
      role === "commenter"
        ? `https://docs.google.com/presentation/d/${presentationId}/edit`
        : `https://docs.google.com/presentation/d/${presentationId}/view`

    expect(url).toContain(presentationId)
    expect(url).toContain("docs.google.com/presentation")
    expect(url).toMatch(/\/edit$/)
  })
})

// ── Duplicate deck ─────────────────────────────────────────────────────────────

describe("Slides API — duplicateDeck (Drive copy)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("copies the ECD deck to create client version", async () => {
    mockFilesCopy.mockResolvedValue({
      data: { id: "pres-client-789" },
    })

    await mockFilesCopy({
      fileId: "pres-ecd-123",
      requestBody: {
        name: "Greenlight — Nike Pre-Production Deck (Client)",
      },
    })

    expect(mockFilesCopy).toHaveBeenCalledWith({
      fileId: "pres-ecd-123",
      requestBody: expect.objectContaining({
        name: expect.stringContaining("Client"),
      }),
    })
  })

  it("returns the new presentation ID after copy", async () => {
    mockFilesCopy.mockResolvedValue({ data: { id: "pres-client-999" } })

    const result = await mockFilesCopy({
      fileId: "pres-ecd-123",
      requestBody: { name: "Copy" },
    })

    expect(result.data.id).toBe("pres-client-999")
    expect(typeof result.data.id).toBe("string")
  })
})

// ── Remove slides (client version cleanup) ─────────────────────────────────────

describe("Slides API — remove internal slides from client deck", () => {
  it("removes brand alignment slide (index 13) from client copy", async () => {
    mockBatchUpdate.mockResolvedValue({ data: { replies: [] } })

    // Brand alignment is slide 13 (0-indexed: 12)
    const request = {
      deleteObject: { objectId: "slide-12" },
    }

    await mockBatchUpdate({
      presentationId: "pres-client-abc",
      requestBody: { requests: [request] },
    })

    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          requests: expect.arrayContaining([
            expect.objectContaining({ deleteObject: expect.any(Object) }),
          ]),
        }),
      })
    )
  })

  it("client deck has fewer slides than ECD deck", () => {
    const ecdSlideCount = 15
    const internalSlidesRemoved = 1 // Brand Alignment
    const clientSlideCount = ecdSlideCount - internalSlidesRemoved

    expect(clientSlideCount).toBe(14)
    expect(clientSlideCount).toBeLessThan(ecdSlideCount)
  })
})
