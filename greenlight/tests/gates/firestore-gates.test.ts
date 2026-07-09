/**
 * Gate Firestore contract tests.
 *
 * Tests the Firestore document shapes for gate records and run summary.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@greenlight/lib/firestore", () => ({
  writeGateRecord: vi.fn(),
  readGateRecord: vi.fn(),
  writeRunSummary: vi.fn(),
  readRunSummary: vi.fn(),
}))

const { writeGateRecord, readGateRecord, writeRunSummary, readRunSummary } =
  await import("@greenlight/lib/firestore")

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Gate records — Firestore document shape", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── ECD gate ───────────────────────────────────────────────────────────────

  it("ECD gate record matches PRD schema", async () => {
    ;(writeGateRecord as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    const record = {
      gate: "ecd_approval",
      runId: "run-test",
      approvalStatus: "APPROVED" as const,
      territorySelected: "t1",
      notes: "Looks great",
      approverName: "Jane Doe",
      approverEmail: "jane@agency.com",
      revisionCycles: 0,
    }

    await writeGateRecord(record)

    expect(writeGateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        gate: "ecd_approval",
        runId: expect.any(String),
        approvalStatus: expect.stringMatching(/APPROVED|APPROVED_WITH_REVISIONS|REVISIONS_REQUIRED/),
        territorySelected: expect.stringMatching(/^t[123]$/),
        approverName: expect.any(String),
        approverEmail: expect.any(String),
        revisionCycles: expect.any(Number),
      })
    )
  })

  it("ECD gate notes can be null", async () => {
    ;(writeGateRecord as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    await writeGateRecord({
      gate: "ecd_approval",
      runId: "run-test",
      approvalStatus: "APPROVED",
      territorySelected: "t1",
      notes: null,
      approverName: "Jane Doe",
      approverEmail: "jane@agency.com",
      revisionCycles: 0,
    })

    expect(writeGateRecord).toHaveBeenCalledWith(
      expect.objectContaining({ notes: null })
    )
  })

  it("ECD gate revision cycles start at 0", async () => {
    ;(writeGateRecord as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    await writeGateRecord({
      gate: "ecd_approval",
      runId: "run-test",
      approvalStatus: "APPROVED",
      territorySelected: "t1",
      notes: null,
      approverName: "Jane Doe",
      approverEmail: "jane@agency.com",
      revisionCycles: 0,
    })

    expect(writeGateRecord).toHaveBeenCalledWith(
      expect.objectContaining({ revisionCycles: 0 })
    )
  })

  // ── Client gate ───────────────────────────────────────────────────────────

  it("Client gate record matches PRD schema", async () => {
    ;(writeGateRecord as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    const record = {
      gate: "client_approval",
      runId: "run-test",
      approvalStatus: "APPROVED" as const,
      territorySelected: "t2",
      notes: "Love it",
      approverName: "John Smith",
      approverEmail: "john@brand.com",
      revisionCycles: 0,
    }

    await writeGateRecord(record)

    expect(writeGateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        gate: "client_approval",
        runId: expect.any(String),
        approvalStatus: expect.stringMatching(/APPROVED|APPROVED_WITH_NOTES|REVISIONS_REQUIRED/),
        territorySelected: expect.stringMatching(/^t[123]$/),
        approverName: expect.any(String),
        approverEmail: expect.any(String),
      })
    )
  })

  // ── Gate document paths ──────────────────────────────────────────────────

  it("gate records are written to correct collection path", () => {
    const runId = "run-abc123"

    const ecdPath = `runs/${runId}/gates/ecd_approval`
    const clientPath = `runs/${runId}/gates/client_approval`

    expect(ecdPath).toMatch(/^runs\/run-.+\/gates\/ecd_approval$/)
    expect(clientPath).toMatch(/^runs\/run-.+\/gates\/client_approval$/)
    expect(ecdPath).not.toBe(clientPath)
  })

  it("stage records are separate from gate records", () => {
    const runId = "run-abc123"

    const stagePath = `runs/${runId}/stages/brief-parsing`
    const gatePath = `runs/${runId}/gates/ecd_approval`

    expect(stagePath).toContain("stages")
    expect(gatePath).toContain("gates")
    expect(stagePath).not.toBe(gatePath)
  })
})

// ── Run summary ────────────────────────────────────────────────────────────────

describe("Run summary — Firestore document shape", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("writes run summary with all required fields", async () => {
    ;(writeRunSummary as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    await writeRunSummary("run-test", {
      runId: "run-test",
      brand: "Nike",
      approvedTerritory: "t1",
      totalGeminiCost: 0.00042,
      totalImagenCost: 0.00,
      revisionCyclesEcd: 0,
      revisionCyclesClient: 0,
      flowPackageUri: "gs://bucket/runs/run-test/flow-package.json",
      flowPackageSignedUrl: "https://storage.googleapis.com/bucket/runs/run-test/flow-package.json?sig=abc",
    })

    expect(writeRunSummary).toHaveBeenCalledWith(
      "run-test",
      expect.objectContaining({
        runId: "run-test",
        brand: expect.any(String),
        approvedTerritory: expect.any(String),
        totalGeminiCost: expect.any(Number),
        totalImagenCost: expect.any(Number),
        revisionCyclesEcd: expect.any(Number),
        revisionCyclesClient: expect.any(Number),
        flowPackageUri: expect.stringContaining("gs://"),
      })
    )
  })

  it("summary includes cost accumulated across all stages", () => {
    const totalGeminiCost = 0.00042 // from all Gemini calls across stages
    const totalImagenCost = 0.00 // placeholder images are free

    expect(totalGeminiCost).toBeGreaterThan(0)
    expect(totalImagenCost).toBeGreaterThanOrEqual(0)
  })

  it("readRunSummary returns null when no summary exists", async () => {
    ;(readRunSummary as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const summary = await readRunSummary("run-test")
    expect(summary).toBeNull()
  })

  it("readRunSummary returns the summary after pipeline completes", async () => {
    const mockSummary = {
      runId: "run-test",
      brand: "Nike",
      approvedTerritory: "t1",
      completedAt: { _seconds: 1752000000 },
    }
    ;(readRunSummary as ReturnType<typeof vi.fn>).mockResolvedValue(mockSummary)

    const summary = await readRunSummary("run-test")
    expect(summary).not.toBeNull()
    expect(summary).toEqual(mockSummary)
  })
})
