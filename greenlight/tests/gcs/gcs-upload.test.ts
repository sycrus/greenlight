/**
 * GCS upload tests.
 *
 * Tests uploadToGcs(): path pattern, URI format, content type,
 * and gcsToHttps() URI conversion.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockSave = vi.fn()
const mockGetMetadata = vi.fn()
const mockFile = vi.fn()
const mockBucket = vi.fn()

vi.mock("@google-cloud/storage", () => ({
  Storage: vi.fn().mockImplementation(() => ({
    bucket: mockBucket,
  })),
}))

const { uploadToGcs, gcsToHttps } = await import("../../lib/gcs.js")

// ── Helpers ────────────────────────────────────────────────────────────────────

function setupBucket() {
  mockFile.mockReturnValue({
    save: mockSave,
    getMetadata: mockGetMetadata,
  })
  mockBucket.mockReturnValue({
    file: mockFile,
  })
  mockSave.mockResolvedValue(undefined)
  mockGetMetadata.mockResolvedValue([{ size: "819200" }])
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("uploadToGcs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupBucket()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("returns gcsUri and publicUrl", async () => {
    const buffer = Buffer.from("fake-image-data")
    const result = await uploadToGcs(buffer, {
      runId: "run-test",
      ingredientId: "char-1",
    })

    expect(result.gcsUri).toMatch(/^gs:\/\/.+\/runs\/run-test\/references\/char-1_.+\.png$/)
    expect(result.publicUrl).toMatch(/^https:\/\/storage\.googleapis\.com\/.+\/runs\/run-test\/references\/char-1_.+\.png$/)
    expect(result.contentType).toBe("image/png")
    expect(result.sizeBytes).toBe(819200)
  })

  it("uses the correct object path pattern", async () => {
    const buffer = Buffer.from("data")
    await uploadToGcs(buffer, { runId: "run-123", ingredientId: "loc-1" })

    const objectPath = mockFile.mock.calls[0]?.[0] as string
    expect(objectPath).toMatch(/^runs\/run-123\/references\/loc-1_.+\.png$/)
  })

  it("uploads with image/png content type", async () => {
    const buffer = Buffer.from("data")
    await uploadToGcs(buffer, { runId: "run-ct", ingredientId: "obj-1" })

    expect(mockSave).toHaveBeenCalledWith(
      buffer,
      expect.objectContaining({ contentType: "image/png" })
    )
  })

  it("includes timestamp in filename", async () => {
    const before = new Date()
    const buffer = Buffer.from("data")
    await uploadToGcs(buffer, { runId: "run-ts", ingredientId: "char-1" })
    const after = new Date()

    const objectPath = mockFile.mock.calls[0]?.[0] as string
    // Extract the timestamp portion from the filename
    const match = objectPath.match(/char-1_(.+)\.png$/)
    expect(match).not.toBeNull()
  })

  it("includes runId and ingredientId in object metadata", async () => {
    const buffer = Buffer.from("data")
    await uploadToGcs(buffer, { runId: "run-meta", ingredientId: "char-2" })

    expect(mockSave).toHaveBeenCalledWith(
      buffer,
      expect.objectContaining({
        metadata: expect.objectContaining({
          metadata: expect.objectContaining({
            runId: "run-meta",
            ingredientId: "char-2",
          }),
        }),
      })
    )
  })

  it("handles upload errors", async () => {
    mockSave.mockRejectedValue(new Error("Bucket not found"))

    const buffer = Buffer.from("data")
    await expect(
      uploadToGcs(buffer, { runId: "run-err", ingredientId: "char-1" })
    ).rejects.toThrow("Bucket not found")
  })
})

// ── URI conversion ─────────────────────────────────────────────────────────────

describe("gcsToHttps", () => {
  it("converts gs:// URI to https:// URL", () => {
    const result = gcsToHttps("gs://my-bucket/path/to/file.png")
    expect(result).toBe("https://storage.googleapis.com/my-bucket/path/to/file.png")
  })

  it("returns original string for non-gs:// URIs", () => {
    expect(gcsToHttps("https://already-https.com/img.png")).toBe(
      "https://already-https.com/img.png"
    )
  })

  it("handles complex paths", () => {
    const result = gcsToHttps(
      "gs://greenlight-assets-agentic-499802/runs/run-123/references/char-1_2026-07-07T12_00_00Z.png"
    )
    expect(result).toBe(
      "https://storage.googleapis.com/greenlight-assets-agentic-499802/runs/run-123/references/char-1_2026-07-07T12_00_00Z.png"
    )
  })
})
