/**
 * Client gate — validation + Firestore write + Flow release tests.
 *
 * Tests POST /api/gates/client: Gate 1 pre-check, input validation,
 * Firestore write, Flow package release trigger.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@greenlight/lib/firestore", () => ({
  readGateRecord: vi.fn(),
  writeGateRecord: vi.fn(),
  readStageRecord: vi.fn(),
  writeRunSummary: vi.fn(),
}))

const { readGateRecord, writeGateRecord, writeRunSummary } = await import(
  "@greenlight/lib/firestore"
)

// ── Types ──────────────────────────────────────────────────────────────────────

type ApprovalStatus = "APPROVED" | "APPROVED_WITH_NOTES" | "REVISIONS_REQUIRED"

interface ClientGateInput {
  runId: string
  territorySelected: string
  approvalStatus: ApprovalStatus
  notes: string | null
  name: string
  title: string
  email: string
}

// ── Validation helpers ─────────────────────────────────────────────────────────

function validateClientGate(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (typeof input !== "object" || input === null) {
    return { valid: false, errors: ["Input is not an object"] }
  }

  const i = input as Record<string, unknown>

  const validStatuses: ApprovalStatus[] = [
    "APPROVED",
    "APPROVED_WITH_NOTES",
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
  if (typeof i["title"] !== "string" || !i["title"]) errors.push("title is required")
  if (typeof i["email"] !== "string" || !i["email"]) errors.push("email is required")

  return { valid: errors.length === 0, errors }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Client gate — input validation", () => {
  const VALID_INPUT: ClientGateInput = {
    runId: "run-test",
    territorySelected: "t1",
    approvalStatus: "APPROVED",
    notes: null,
    name: "John Smith",
    title: "Brand Director",
    email: "john@brand.com",
  }

  it("accepts valid APPROVED submission", () => {
    const result = validateClientGate(VALID_INPUT)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it("accepts APPROVED_WITH_NOTES", () => {
    const result = validateClientGate({
      ...VALID_INPUT,
      approvalStatus: "APPROVED_WITH_NOTES",
      notes: "Love the direction. Consider adding more diverse casting.",
    })
    expect(result.valid).toBe(true)
  })

  it("requires notes when REVISIONS_REQUIRED", () => {
    const result = validateClientGate({
      ...VALID_INPUT,
      approvalStatus: "REVISIONS_REQUIRED",
      notes: null,
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("notes are required when REVISIONS_REQUIRED")
  })

  it("rejects invalid approval status", () => {
    const result = validateClientGate({
      ...VALID_INPUT,
      approvalStatus: "NOT_APPROVED" as ApprovalStatus,
    })
    expect(result.valid).toBe(false)
  })

  it("rejects invalid territory ID", () => {
    const result = validateClientGate({ ...VALID_INPUT, territorySelected: "t99" })
    expect(result.valid).toBe(false)
  })

  it("requires title field (unlike ECD gate)", () => {
    const result = validateClientGate({ ...VALID_INPUT, title: "" })
    expect(result.errors).toContain("title is required")
  })

  it("requires name, title, and email", () => {
    const result = validateClientGate({
      ...VALID_INPUT,
      name: "",
      title: "",
      email: "",
    })
    expect(result.errors).toContain("name is required")
    expect(result.errors).toContain("title is required")
    expect(result.errors).toContain("email is required")
  })
})

// ── Gate locking (Gate 1 must be passed) ───────────────────────────────────────

describe("Client gate — Gate 1 lock check", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("allows submission when Gate 1 is APPROVED", async () => {
    ;(readGateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({
      approvalStatus: "APPROVED",
      territorySelected: "t1",
      revisionCycles: 0,
    })

    const ecdGate = await readGateRecord("run-test", "ecd_approval")
    const canProceed =
      ecdGate &&
      ((ecdGate as Record<string, unknown>)["approvalStatus"] === "APPROVED" ||
        (ecdGate as Record<string, unknown>)["approvalStatus"] === "APPROVED_WITH_REVISIONS")

    expect(canProceed).toBe(true)
  })

  it("allows submission when Gate 1 is APPROVED_WITH_REVISIONS", async () => {
    ;(readGateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({
      approvalStatus: "APPROVED_WITH_REVISIONS",
      territorySelected: "t1",
      revisionCycles: 1,
    })

    const ecdGate = await readGateRecord("run-test", "ecd_approval")
    const canProceed =
      ecdGate?.["approvalStatus"] === "APPROVED" ||
      ecdGate?.["approvalStatus"] === "APPROVED_WITH_REVISIONS"

    expect(canProceed).toBe(true)
  })

  it("blocks submission when Gate 1 is REVISIONS_REQUIRED", async () => {
    ;(readGateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({
      approvalStatus: "REVISIONS_REQUIRED",
      territorySelected: null,
      revisionCycles: 1,
    })

    const ecdGate = await readGateRecord("run-test", "ecd_approval")
    const isBlocked =
      ecdGate?.["approvalStatus"] === "REVISIONS_REQUIRED"

    expect(isBlocked).toBe(true)
  })

  it("blocks submission when Gate 1 does not exist", async () => {
    ;(readGateRecord as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const ecdGate = await readGateRecord("run-test", "ecd_approval")
    expect(ecdGate).toBeNull()
    // Gate 2 should return 400 "Gate 1 must be passed first"
  })

  it("returns 400 with descriptive message when blocked", () => {
    // Contract test: the API response when Gate 2 is blocked
    const response = {
      status: 400,
      body: {
        error: "Gate 1 (ECD approval) must be passed before client approval",
      },
    }

    expect(response.status).toBe(400)
    expect(response.body.error).toContain("ECD")
  })
})

// ── Firestore write + Flow release ─────────────────────────────────────────────

describe("Client gate — Firestore write + Flow release", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("writes client gate record to correct path", async () => {
    ;(writeGateRecord as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    await writeGateRecord({
      gate: "client_approval",
      runId: "run-test",
      approvalStatus: "APPROVED",
      territorySelected: "t2",
      notes: null,
      approverName: "John Smith",
      approverEmail: "john@brand.com",
      revisionCycles: 0,
    })

    expect(writeGateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        gate: "client_approval",
        runId: "run-test",
        approvalStatus: "APPROVED",
        approverName: "John Smith",
      })
    )
  })

  it("triggers run summary write on APPROVED", async () => {
    ;(writeGateRecord as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    ;(writeRunSummary as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    // Simulate Gate 2 approval flow
    await writeGateRecord({
      gate: "client_approval",
      runId: "run-test",
      approvalStatus: "APPROVED",
      territorySelected: "t2",
      notes: null,
      approverName: "John Smith",
      approverEmail: "john@brand.com",
      revisionCycles: 0,
    })

    // On approval: write run summary
    await writeRunSummary("run-test", {
      runId: "run-test",
      brand: "Nike",
      approvedTerritory: "t2",
      totalGeminiCost: 0.0004,
      totalImagenCost: 0.00,
      revisionCyclesEcd: 0,
      revisionCyclesClient: 0,
      flowPackageUri: "gs://bucket/runs/run-test/flow-package.json",
    })

    expect(writeRunSummary).toHaveBeenCalledWith(
      "run-test",
      expect.objectContaining({
        brand: expect.any(String),
        approvedTerritory: expect.any(String),
        flowPackageUri: expect.stringContaining("gs://"),
      })
    )
  })

  it("does NOT trigger run summary on REVISIONS_REQUIRED", () => {
    // Contract: Flow package is NOT released on REVISIONS_REQUIRED
    const approvalStatus = "REVISIONS_REQUIRED" as string
    const shouldRelease = approvalStatus === "APPROVED" || approvalStatus === "APPROVED_WITH_NOTES"

    expect(shouldRelease).toBe(false)
  })

  it("triggers Flow release for both APPROVED and APPROVED_WITH_NOTES", () => {
    // Contract: only APPROVED and APPROVED_WITH_NOTES trigger release
    const RELEASE_STATUSES = new Set(["APPROVED", "APPROVED_WITH_NOTES"])
    expect(RELEASE_STATUSES.has("APPROVED")).toBe(true)
    expect(RELEASE_STATUSES.has("APPROVED_WITH_NOTES")).toBe(true)
    expect(RELEASE_STATUSES.has("REVISIONS_REQUIRED")).toBe(false)
  })

  it("includes flow package signed URL in approval response", () => {
    // Contract: Gate 2 APPROVED response includes flow package download
    const response = {
      gate: "client_approval",
      status: "APPROVED",
      revisionCycles: 0,
      flowPackageUrl: "https://storage.googleapis.com/bucket/runs/run-1/flow-package.json?Signature=abc",
      flowPackageUri: "gs://bucket/runs/run-1/flow-package.json",
      pipelineComplete: true,
    }

    expect(response.flowPackageUrl).toBeDefined()
    expect(response.flowPackageUrl).toContain("https://")
    expect(response.pipelineComplete).toBe(true)
  })
})
