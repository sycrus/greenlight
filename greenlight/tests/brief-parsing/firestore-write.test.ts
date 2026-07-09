/**
 * Firestore write tests — stage record shape + collection path correctness.
 *
 * Tests the Firestore client wrapper: writeStageRecord, writeGateRecord,
 * writeRunSummary, readStageRecord, readGateRecord, readRunSummary.
 * Mocks firebase-admin/firestore at the external boundary per TDD convention.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockDocSet = vi.fn().mockResolvedValue(undefined)
const mockDocGet = vi.fn()
const mockCollectionDoc = vi.fn()

const mockFirestoreInstance = {
  doc: mockCollectionDoc,
}

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(() => mockFirestoreInstance),
  FieldValue: {
    serverTimestamp: () => ({ _method: "serverTimestamp" }),
  },
}))

vi.mock("firebase-admin/app", () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => []),
  cert: vi.fn(),
}))

// Dynamic import so mocks are in place before module loads
const {
  writeStageRecord,
  writeGateRecord,
  writeRunSummary,
  readStageRecord,
  readGateRecord,
  readRunSummary,
} = await import("../../lib/firestore.js")

// ── Helpers ────────────────────────────────────────────────────────────────────

function setupDoc(exists: boolean, data?: Record<string, unknown>) {
  mockDocGet.mockResolvedValue({
    exists,
    data: () => (exists ? (data ?? {}) : undefined),
  })
  mockCollectionDoc.mockReturnValue({
    set: mockDocSet,
    get: mockDocGet,
  })
}

// ── writeStageRecord ───────────────────────────────────────────────────────────

describe("writeStageRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDoc(false)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("writes to the correct collection path: /runs/{runId}/stages/{stage}", async () => {
    await writeStageRecord({
      stage: "brief-parsing",
      runId: "run-123",
      data: { brand: "Nike" },
      tokenCost: 0.00042,
    })

    expect(mockCollectionDoc).toHaveBeenCalledWith(
      "runs/run-123/stages/brief-parsing"
    )
  })

  it("writes the data payload under top-level keys", async () => {
    const data = {
      brand: "Nike",
      campaign_objective: "Launch campaign",
      confidence_score: 0.85,
    }

    await writeStageRecord({
      stage: "brief-parsing",
      runId: "run-456",
      data,
      tokenCost: 0.0001,
    })

    const written = mockDocSet.mock.calls[0]?.[0] as Record<string, unknown>
    expect(written["brand"]).toBe("Nike")
    expect(written["campaign_objective"]).toBe("Launch campaign")
    expect(written["confidence_score"]).toBe(0.85)
  })

  it("writes metadata under _meta key", async () => {
    await writeStageRecord({
      stage: "brief-parsing",
      runId: "run-789",
      data: { brand: "Nike" },
      tokenCost: 0.00042,
    })

    const written = mockDocSet.mock.calls[0]?.[0] as Record<string, unknown>
    const meta = written["_meta"] as Record<string, unknown>
    expect(meta).toBeDefined()
    expect(meta["stage"]).toBe("brief-parsing")
    expect(meta["runId"]).toBe("run-789")
    expect(meta["tokenCost"]).toBe(0.00042)
  })

  it("writes server timestamp in _meta.updatedAt", async () => {
    await writeStageRecord({
      stage: "brief-parsing",
      runId: "run-ts",
      data: { brand: "Test" },
    })

    const written = mockDocSet.mock.calls[0]?.[0] as Record<string, unknown>
    const meta = written["_meta"] as Record<string, unknown>
    expect(meta["updatedAt"]).toEqual({ _method: "serverTimestamp" })
  })

  it("handles null tokenCost (writes null)", async () => {
    await writeStageRecord({
      stage: "brief-parsing",
      runId: "run-null-cost",
      data: { brand: "Test" },
    })

    const written = mockDocSet.mock.calls[0]?.[0] as Record<string, unknown>
    const meta = written["_meta"] as Record<string, unknown>
    expect(meta["tokenCost"]).toBeNull()
  })

  it("handles Imagen cost fields when provided", async () => {
    await writeStageRecord({
      stage: "visual-dna",
      runId: "run-img",
      data: { territory_id: "t1" },
      imagenCost: 0.04,
      imagenGenerations: 3,
      tokenCost: 0.001,
    })

    const written = mockDocSet.mock.calls[0]?.[0] as Record<string, unknown>
    const meta = written["_meta"] as Record<string, unknown>
    expect(meta["imagenCost"]).toBe(0.04)
    expect(meta["imagenGenerations"]).toBe(3)
  })

  it("writes null for Imagen fields when not provided", async () => {
    await writeStageRecord({
      stage: "brief-parsing",
      runId: "run-no-img",
      data: { brand: "Test" },
    })

    const written = mockDocSet.mock.calls[0]?.[0] as Record<string, unknown>
    const meta = written["_meta"] as Record<string, unknown>
    expect(meta["imagenCost"]).toBeNull()
    expect(meta["imagenGenerations"]).toBeNull()
  })

  it("writes different stage names to correct subcollections", async () => {
    const stages = [
      "brief-parsing",
      "territory-generation",
      "visual-dna",
      "output-generation",
    ]

    for (const stage of stages) {
      vi.clearAllMocks()
      setupDoc(false)
      await writeStageRecord({
        stage,
        runId: "run-stages",
        data: { test: true },
      })

      expect(mockCollectionDoc).toHaveBeenCalledWith(
        `runs/run-stages/stages/${stage}`
      )
    }
  })

  it("is idempotent — can be called multiple times (overwrites via set)", async () => {
    await writeStageRecord({
      stage: "brief-parsing",
      runId: "run-idem",
      data: { brand: "First" },
    })

    await writeStageRecord({
      stage: "brief-parsing",
      runId: "run-idem",
      data: { brand: "Second", updated: true },
    })

    // Both calls should use doc().set() — the second overwrites
    expect(mockDocSet).toHaveBeenCalledTimes(2)
    const secondWrite = mockDocSet.mock.calls[1]?.[0] as Record<string, unknown>
    expect(secondWrite["brand"]).toBe("Second")
    expect(secondWrite["updated"]).toBe(true)
  })
})

// ── writeGateRecord ────────────────────────────────────────────────────────────

describe("writeGateRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDoc(false)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("writes to the correct collection path: /runs/{runId}/gates/{gate}", async () => {
    await writeGateRecord({
      gate: "ecd_approval",
      runId: "run-gate-1",
      approvalStatus: "APPROVED",
      territorySelected: "Territory 1",
      notes: null,
      approverName: "Jane CD",
      approverEmail: "jane@agency.com",
      revisionCycles: 0,
    })

    expect(mockCollectionDoc).toHaveBeenCalledWith(
      "runs/run-gate-1/gates/ecd_approval"
    )
  })

  it("writes all gate fields with correct values", async () => {
    await writeGateRecord({
      gate: "ecd_approval",
      runId: "run-gate-2",
      approvalStatus: "APPROVED_WITH_NOTES",
      territorySelected: "Territory 2 — Bold",
      notes: "Love the palette, adjust tone slightly",
      approverName: "John ECD",
      approverEmail: "john@agency.com",
      revisionCycles: 1,
    })

    const written = mockDocSet.mock.calls[0]?.[0] as Record<string, unknown>
    expect(written["gate"]).toBe("ecd_approval")
    expect(written["runId"]).toBe("run-gate-2")
    expect(written["approvalStatus"]).toBe("APPROVED_WITH_NOTES")
    expect(written["territorySelected"]).toBe("Territory 2 — Bold")
    expect(written["notes"]).toBe("Love the palette, adjust tone slightly")
    expect(written["approverName"]).toBe("John ECD")
    expect(written["approverEmail"]).toBe("john@agency.com")
    expect(written["revisionCycles"]).toBe(1)
  })

  it("writes server timestamp in approvedAt", async () => {
    await writeGateRecord({
      gate: "ecd_approval",
      runId: "run-ts-gate",
      approvalStatus: "APPROVED",
      territorySelected: "T1",
      notes: null,
      approverName: "Jane",
      approverEmail: "jane@agency.com",
      revisionCycles: 0,
    })

    const written = mockDocSet.mock.calls[0]?.[0] as Record<string, unknown>
    expect(written["approvedAt"]).toEqual({ _method: "serverTimestamp" })
  })

  it("writes client approval gate to correct path", async () => {
    await writeGateRecord({
      gate: "client_approval",
      runId: "run-client",
      approvalStatus: "APPROVED",
      territorySelected: "Territory 1",
      notes: "Looks great!",
      approverName: "Client Inc.",
      approverEmail: "client@brand.com",
      revisionCycles: 0,
    })

    expect(mockCollectionDoc).toHaveBeenCalledWith(
      "runs/run-client/gates/client_approval"
    )
  })
})

// ── writeRunSummary ────────────────────────────────────────────────────────────

describe("writeRunSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDoc(false)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("writes to the correct path: /runs/{runId}/summary", async () => {
    await writeRunSummary("run-summary-1", {
      brand: "Nike",
      approved_territory: "Territory 1",
    })

    expect(mockCollectionDoc).toHaveBeenCalledWith("runs/run-summary-1/summaries/main")
  })

  it("writes summary data with server timestamp", async () => {
    const summaryData = {
      brand: "Nike",
      brief_hash: "abc123",
      approved_territory: "Territory 2",
      total_cost_usd: 0.25,
    }

    await writeRunSummary("run-summary-2", summaryData)

    const written = mockDocSet.mock.calls[0]?.[0] as Record<string, unknown>
    expect(written["brand"]).toBe("Nike")
    expect(written["brief_hash"]).toBe("abc123")
    expect(written["approved_territory"]).toBe("Territory 2")
    expect(written["total_cost_usd"]).toBe(0.25)
    expect(written["completedAt"]).toEqual({ _method: "serverTimestamp" })
  })
})

// ── readStageRecord ────────────────────────────────────────────────────────────

describe("readStageRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("reads from the correct document path", async () => {
    setupDoc(true, { brand: "Nike", _meta: {} })

    await readStageRecord("run-read-1", "brief-parsing")

    expect(mockCollectionDoc).toHaveBeenCalledWith(
      "runs/run-read-1/stages/brief-parsing"
    )
  })

  it("returns document data when it exists", async () => {
    const data = { brand: "Nike", campaign_objective: "Launch", _meta: {} }
    setupDoc(true, data)

    const result = await readStageRecord("run-read-2", "brief-parsing")
    expect(result).toEqual(data)
  })

  it("returns null when document does not exist", async () => {
    setupDoc(false)

    const result = await readStageRecord("run-read-3", "territory-generation")
    expect(result).toBeNull()
  })
})

// ── readGateRecord ─────────────────────────────────────────────────────────────

describe("readGateRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("reads from the correct gate document path", async () => {
    setupDoc(true, {
      gate: "ecd_approval",
      approvalStatus: "APPROVED",
      territorySelected: "T1",
    })

    await readGateRecord("run-gr-1", "ecd_approval")

    expect(mockCollectionDoc).toHaveBeenCalledWith(
      "runs/run-gr-1/gates/ecd_approval"
    )
  })

  it("returns gate data when it exists", async () => {
    const gateData = {
      gate: "ecd_approval",
      approvalStatus: "APPROVED",
      territorySelected: "Territory 3",
      approverName: "Jane CD",
    }
    setupDoc(true, gateData)

    const result = await readGateRecord("run-gr-2", "ecd_approval")
    expect(result).toEqual(gateData)
  })

  it("returns null when gate has not been passed", async () => {
    setupDoc(false)

    const result = await readGateRecord("run-gr-3", "client_approval")
    expect(result).toBeNull()
  })
})

// ── readRunSummary ─────────────────────────────────────────────────────────────

describe("readRunSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("reads from the summary document path", async () => {
    setupDoc(true, { brand: "Nike", total_cost_usd: 0.5 })

    await readRunSummary("run-sr-1")

    expect(mockCollectionDoc).toHaveBeenCalledWith("runs/run-sr-1/summaries/main")
  })

  it("returns summary data when it exists", async () => {
    const summaryData = { brand: "Nike", total_cost_usd: 1.25 }
    setupDoc(true, summaryData)

    const result = await readRunSummary("run-sr-2")
    expect(result).toEqual(summaryData)
  })

  it("returns null when summary has not been written", async () => {
    setupDoc(false)

    const result = await readRunSummary("run-sr-3")
    expect(result).toBeNull()
  })
})

// ── Integration: write-then-read contract ──────────────────────────────────────

describe("write-then-read contract", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("stage path is consistent between write and read", async () => {
    const runId = "run-contract-1"
    const stage = "brief-parsing"

    // Write
    setupDoc(false)
    await writeStageRecord({ stage, runId, data: { brand: "Nike" } })
    const writePath = mockCollectionDoc.mock.calls[0]?.[0] as string

    // Read
    setupDoc(true, { brand: "Nike" })
    await readStageRecord(runId, stage)
    const readPath = mockCollectionDoc.mock.calls[0]?.[0] as string

    expect(writePath).toBe(readPath)
    expect(writePath).toBe("runs/run-contract-1/stages/brief-parsing")
  })

  it("gate path is consistent between write and read", async () => {
    const runId = "run-contract-2"
    const gate = "ecd_approval"

    // Write
    setupDoc(false)
    await writeGateRecord({
      gate,
      runId,
      approvalStatus: "APPROVED",
      territorySelected: "T1",
      notes: null,
      approverName: "Jane",
      approverEmail: "jane@agency.com",
      revisionCycles: 0,
    })
    const writePath = mockCollectionDoc.mock.calls[0]?.[0] as string

    // Read
    setupDoc(true, { gate, approvalStatus: "APPROVED" })
    await readGateRecord(runId, gate)
    const readPath = mockCollectionDoc.mock.calls[0]?.[0] as string

    expect(writePath).toBe(readPath)
    expect(writePath).toBe("runs/run-contract-2/gates/ecd_approval")
  })

  it("summary path is consistent between write and read", async () => {
    const runId = "run-contract-3"

    // Write
    setupDoc(false)
    await writeRunSummary(runId, { brand: "Nike" })
    const writePath = mockCollectionDoc.mock.calls[0]?.[0] as string

    // Read
    setupDoc(true, { brand: "Nike" })
    await readRunSummary(runId)
    const readPath = mockCollectionDoc.mock.calls[0]?.[0] as string

    expect(writePath).toBe(readPath)
    expect(writePath).toBe("runs/run-contract-3/summaries/main")
  })
})
