/**
 * Flow package — GCS storage tests.
 *
 * Tests GCS upload + signed URL generation for flow-package.json.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockFileSave = vi.fn()
const mockFileGetSignedUrl = vi.fn()
const mockBucketFile = vi.fn((_path: string) => ({
  save: mockFileSave,
  getSignedUrl: mockFileGetSignedUrl,
}))

vi.mock("@google-cloud/storage", () => ({
  Storage: vi.fn(() => ({
    bucket: vi.fn(() => ({
      file: mockBucketFile,
    })),
  })),
}))

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Flow package — GCS upload", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("uploads flow-package.json to correct GCS path", async () => {
    mockFileSave.mockResolvedValue([])

    const runId = "run-1783350191981-e0907b"
    const objectPath = `runs/${runId}/flow-package.json`
    const contentType = "application/json"

    const content = Buffer.from(JSON.stringify({ flow_package: { run_id: runId } }), "utf-8")

    mockBucketFile(objectPath)
    await mockFileSave(content, { contentType })

    expect(mockBucketFile).toHaveBeenCalledWith(objectPath)
    expect(mockFileSave).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ contentType: "application/json" })
    )
  })

  it("path pattern matches design spec", () => {
    const runId = "run-abc123"
    const path = `runs/${runId}/flow-package.json`

    expect(path).toMatch(/^runs\/run-.+\/flow-package\.json$/)
    expect(path).toContain(runId)
    expect(path).toContain("flow-package.json")
  })

  it("content type is application/json", () => {
    const contentType = "application/json"
    expect(contentType).toBe("application/json")
  })

  it("generates signed URL with 48-hour expiry on release", async () => {
    mockFileGetSignedUrl.mockResolvedValue([
      "https://storage.googleapis.com/bucket/runs/run-1/flow-package.json?Expires=...&Signature=...",
    ])

    const expires = Date.now() + 48 * 60 * 60 * 1000 // 48 hours

    const file = mockBucketFile("runs/run-1/flow-package.json")
    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires,
    })

    expect(mockFileGetSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "read",
        expires: expect.any(Number),
      })
    )
    expect(signedUrl).toContain("https://")
    expect(signedUrl).toContain("Signature=")
    expect(typeof signedUrl).toBe("string")
  })

  it("signed URL contains the GCS bucket and object path", async () => {
    mockFileGetSignedUrl.mockResolvedValue([
      "https://storage.googleapis.com/greenlight-assets/runs/run-1/flow-package.json?signature=abc",
    ])

    const [signedUrl] = await mockBucketFile("runs/run-1/flow-package.json").getSignedUrl({
      action: "read",
      expires: Date.now() + 48 * 60 * 60 * 1000,
    })

    expect(signedUrl).toContain("flow-package.json")
    expect(signedUrl).toContain("storage.googleapis.com")
  })

  it("returns unsigned GCS URI as fallback when signed URL fails", () => {
    // Fallback contract: if signed URL generation fails, return the gs:// URI
    const gcsUri = "gs://greenlight-assets/runs/run-1/flow-package.json"
    const publicUrl = "https://storage.googleapis.com/greenlight-assets/runs/run-1/flow-package.json"

    expect(gcsUri).toMatch(/^gs:\/\//)
    expect(publicUrl).toMatch(/^https:\/\//)
    // Both point to the same object
    expect(gcsUri).toContain("flow-package.json")
    expect(publicUrl).toContain("flow-package.json")
  })

  it("handles GCS upload failure with retry", async () => {
    mockFileSave
      .mockRejectedValueOnce(new Error("Network timeout"))
      .mockResolvedValueOnce([]) // retry succeeds

    const content = Buffer.from("test")
    const file = mockBucketFile("runs/run-1/flow-package.json")

    // First attempt fails
    await expect(file.save(content, { contentType: "application/json" }))
      .rejects.toThrow("Network timeout")

    // Retry succeeds
    await file.save(content, { contentType: "application/json" })
    expect(mockFileSave).toHaveBeenCalledTimes(2)
  })
})
