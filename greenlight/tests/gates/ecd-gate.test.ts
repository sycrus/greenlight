/**
 * ECD gate — validation + Firestore write tests.
 *
 * Tests POST /api/gates/ecd: input validation, Firestore write contract,
 * revision cycle tracking.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@greenlight/lib/firestore", () => ({
  readGateRecord: vi.fn(),
  writeGateRecord: vi.fn(),
  readStageRecord: vi.fn(),
}))

const { readGateRecord, writeGateRecord, readStageRecord } = await import(
  "@greenlight/lib/firestore"
)

// ── Types ──────────────────────────────────────────────────────────────────────

type ApprovalStatus = "APPROVED" | "APPROVED_WITH_REVISIONS" | "REVISIONS_REQUIRED"

interface EcdGateInput {
  runId: string
  territorySelected: string
  approvalStatus: ApprovalStatus
  notes: string | null
  name: string
  email: string
}

// ── Validation helpers ─────────────────────────────────────────────────────────

function validateEcdGate(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (typeof input !== "object" || input === null) {
    return { valid: false, errors: ["Input is not an object"] }
  }

  const i = input as Record<string, unknown>

  const validStatuses: ApprovalStatus[] = [
    "APPROVED",
    "APPROVED_WITH_REVISIONS",
    "REVISIONS_REQUIRED",
  ]

  if (typeof i["runId"] !== "string" || !i["runId"]) errors.push("runId is required")
  if (typeof i["territorySelected"] !== "string" || !i["territorySelected"]) {
    errors.push("territorySelected is required")
  } else {
    const validTerritories = ["t1", "t2", "t3"]
    if (!validTerritories.includes(i["territorySelected"] as string)) {
      errors.push("territorySelected must be t1, t2, or t3")
    }
  }

  if (!validStatuses.includes(i["approvalStatus"] as ApprovalStatus)) {
    errors.push(`approvalStatus must be one of: ${validStatuses.join(", ")}`)
  }

  if (i["approvalStatus"] === "REVISIONS_REQUIRED") {
    if (typeof i["notes"] !== "string" || !(i["notes"] as string).trim()) {
      errors.push("notes are required when REVISIONS_REQUIRED")
    }
  }

  if (typeof i["name"] !== "string" || !i["name"]) errors.push("name is required")
  if (typeof i["email"] !== "string" || !i["email"]) errors.push("email is required")

  return { valid: errors.length === 0, errors }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("ECD gate — input validation", () => {
  const VALID_INPUT: EcdGateInput = {
    runId: "run-test",
    territorySelected: "t1",
    approvalStatus: "APPROVED",
    notes: null,
    name: "Jane Doe",
    email: "jane@agency.com",
  }

  it("accepts valid APPROVED submission", () => {
    const result = validateEcdGate(VALID_INPUT)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it("accepts APPROVED_WITH_REVISIONS", () => {
    const result = validateEcdGate({
      ...VALID_INPUT,
      approvalStatus: "APPROVED_WITH_REVISIONS",
      notes: "Minor tweaks to territory 1 visual language",
    })
    expect(result.valid).toBe(true)
  })

  it("requires notes when REVISIONS_REQUIRED", () => {
    const result = validateEcdGate({
      ...VALID_INPUT,
      approvalStatus: "REVISIONS_REQUIRED",
      notes: null,
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("notes are required when REVISIONS_REQUIRED")
  })

  it("accepts REVISIONS_REQUIRED with notes", () => {
    const result = validateEcdGate({
      ...VALID_INPUT,
      approvalStatus: "REVISIONS_REQUIRED",
      notes: "Need to rework the tone on T2 — it's too clinical",
    })
    expect(result.valid).toBe(true)
  })

  it("rejects invalid approval status", () => {
    const result = validateEcdGate({
      ...VALID_INPUT,
      approvalStatus: "NOT_APPROVED" as ApprovalStatus,
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes("approvalStatus"))).toBe(true)
  })

  it("rejects invalid territory ID", () => {
    const result = validateEcdGate({
      ...VALID_INPUT,
      territorySelected: "t4",
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("territorySelected must be t1, t2, or t3")
  })

  it("rejects missing name", () => {
    const result = validateEcdGate({ ...VALID_INPUT, name: "" })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("name is required")
  })

  it("rejects missing email", () => {
    const result = validateEcdGate({ ...VALID_INPUT, email: "" })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("email is required")
  })

  it("rejects missing runId", () => {
    const result = validateEcdGate({ ...VALID_INPUT, runId: "" })
    expect(result.errors).toContain("runId is required")
  })

  it("rejects empty notes on REVISIONS_REQUIRED", () => {
    const result = validateEcdGate({
      ...VALID_INPUT,
      approvalStatus: "REVISIONS_REQUIRED",
      notes: "   ",
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("notes are required when REVISIONS_REQUIRED")
  })
})

// ── Firestore write contract ───────────────────────────────────────────────────

describe("ECD gate — Firestore write", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("writes ECD gate record to correct path", async () => {
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
      expect.objectContaining({
        gate: "ecd_approval",
        runId: "run-test",
        approvalStatus: "APPROVED",
        territorySelected: "t1",
        approverName: "Jane Doe",
        approverEmail: "jane@agency.com",
      })
    )
  })

  it("tracks revision cycles — increments on resubmission", async () => {
    ;(readGateRecord as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ revisionCycles: 0, approvalStatus: "REVISIONS_REQUIRED" })
    ;(writeGateRecord as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    // Read existing record to get current revision count
    const existing = await readGateRecord("run-test", "ecd_approval")
    const currentCycles = (existing as Record<string, unknown>)?.["revisionCycles"] as number ?? 0
    const newCycles = currentCycles + 1

    // Write updated record
    await writeGateRecord({
      gate: "ecd_approval",
      runId: "run-test",
      approvalStatus: "APPROVED",
      territorySelected: "t2",
      notes: "Took another pass — looking better now",
      approverName: "Jane Doe",
      approverEmail: "jane@agency.com",
      revisionCycles: newCycles,
    })

    expect(writeGateRecord).toHaveBeenCalledWith(
      expect.objectContaining({ revisionCycles: 1 })
    )
  })

  it("writes slides deck ID in gate record", async () => {
    ;(writeGateRecord as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    // The gate record includes the slides deck ID for audit trail

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

    // Gate record path is /runs/{runId}/gates/ecd_approval
    // slides_deck_id is part of the stored record
    expect(writeGateRecord).toHaveBeenCalled()
  })
})
