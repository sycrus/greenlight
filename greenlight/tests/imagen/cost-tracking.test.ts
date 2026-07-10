/**
 * Imagen cost tracking tests.
 *
 * Tests cost accumulation across multiple generate-references calls.
 * Verifies imagenCost and imagenGenerations accumulate correctly in Firestore.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockDocSet = vi.fn().mockResolvedValue(undefined)
const mockDocGet = vi.fn()
const mockCollectionDoc = vi.fn()

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(() => ({ doc: mockCollectionDoc })),
  FieldValue: { serverTimestamp: () => ({ _method: "serverTimestamp" }) },
}))

vi.mock("firebase-admin/app", () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => []),
  cert: vi.fn(),
}))

const { writeStageRecord } = await import("../../lib/firestore.js")

// ── Helpers ────────────────────────────────────────────────────────────────────

function setupDoc(exists: boolean, data?: Record<string, unknown>) {
  mockDocGet.mockResolvedValue({ exists, data: () => (exists ? (data ?? {}) : undefined) })
  mockCollectionDoc.mockReturnValue({ set: mockDocSet, get: mockDocGet })
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Imagen cost accumulation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDoc(false)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("writes initial Imagen cost on first generation", async () => {
    await writeStageRecord({
      stage: "visual-dna",
      runId: "run-cost-1",
      data: { territories: { "territory-1": {} } },
      tokenCost: 0.00054,
      imagenCost: 0.12,
      imagenGenerations: 3,
    })

    const written = mockDocSet.mock.calls[0]?.[0] as Record<string, unknown>
    const meta = written["_meta"] as Record<string, unknown>
    expect(meta["imagenCost"]).toBe(0.12)
    expect(meta["imagenGenerations"]).toBe(3)
  })

  it("accumulates Imagen cost across multiple calls", async () => {
    // First call: 3 generations = $0.12
    await writeStageRecord({
      stage: "visual-dna",
      runId: "run-cost-2",
      data: { territories: { "territory-1": {} } },
      tokenCost: 0.00054,
      imagenCost: 0.12,
      imagenGenerations: 3,
    })

    // Second call: +2 generations = +$0.08 → total $0.20, 5 generations
    await writeStageRecord({
      stage: "visual-dna",
      runId: "run-cost-2",
      data: { territories: { "territory-1": {} } },
      tokenCost: 0.00054,
      imagenCost: 0.20,
      imagenGenerations: 5,
    })

    // Find the second main write (has "territories" field)
    const writes = mockDocSet.mock.calls.map((c) => c[0] as Record<string, unknown>)
    const mainWrites = writes.filter((w) => w["territories"] !== undefined)
    expect(mainWrites.length).toBeGreaterThanOrEqual(2)
    const secondWrite = mainWrites[1]
    const meta = secondWrite!["_meta"] as Record<string, unknown>
    expect(meta["imagenCost"]).toBe(0.20)
    expect(meta["imagenGenerations"]).toBe(5)
  })

  it("handles zero Imagen cost (no generations yet)", async () => {
    await writeStageRecord({
      stage: "visual-dna",
      runId: "run-cost-3",
      data: { territories: { "territory-1": {} } },
      tokenCost: 0.00018,
    })

    const written = mockDocSet.mock.calls[0]?.[0] as Record<string, unknown>
    const meta = written["_meta"] as Record<string, unknown>
    // null fields for Imagen when not provided
    expect(meta["imagenCost"]).toBeNull()
    expect(meta["imagenGenerations"]).toBeNull()
  })

  it("maintains token cost alongside Imagen cost", async () => {
    await writeStageRecord({
      stage: "visual-dna",
      runId: "run-cost-4",
      data: { territories: { "territory-1": {} } },
      tokenCost: 0.00072,
      imagenCost: 0.16,
      imagenGenerations: 4,
    })

    const written = mockDocSet.mock.calls[0]?.[0] as Record<string, unknown>
    const meta = written["_meta"] as Record<string, unknown>
    expect(meta["tokenCost"]).toBe(0.00072)
    expect(meta["imagenCost"]).toBe(0.16)
  })

  it("writes server timestamp in _meta.updatedAt", async () => {
    await writeStageRecord({
      stage: "visual-dna",
      runId: "run-cost-5",
      data: { territories: {} },
      imagenCost: 0.04,
      imagenGenerations: 1,
    })

    const written = mockDocSet.mock.calls[0]?.[0] as Record<string, unknown>
    const meta = written["_meta"] as Record<string, unknown>
    expect(meta["updatedAt"]).toEqual({ _method: "serverTimestamp" })
  })
})
