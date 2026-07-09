/**
 * Territory generation — Firestore write contract tests.
 *
 * Verifies the correct collection path, document shape, and field
 * conventions for territory generation stage records.
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

const { writeStageRecord, readStageRecord } = await import(
  "../../lib/firestore.js"
)

// ── Helpers ────────────────────────────────────────────────────────────────────

function setupDoc(exists: boolean, data?: Record<string, unknown>) {
  mockDocGet.mockResolvedValue({ exists, data: () => (exists ? (data ?? {}) : undefined) })
  mockCollectionDoc.mockReturnValue({ set: mockDocSet, get: mockDocGet })
}

const MOCK_TERRITORIES = [
  {
    id: "territory-1",
    name: "Raw Velocity",
    creative_proposition: "Capture raw energy",
    visual_language: "gritty urban textures",
    tone: "Urgent and electric",
    emotional_arc: "anticipation → energy → release",
    scene_count_suggestion: 5,
    flow_prompt_style: "Dynamic street cinematography",
    negative_constraints: ["No slow motion"],
    risk_flag: null,
  },
]

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("writeStageRecord — territory-generation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDoc(false)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("writes territories to the correct path", async () => {
    await writeStageRecord({
      stage: "territory-generation",
      runId: "run-tg-1",
      data: { territories: MOCK_TERRITORIES },
      tokenCost: 0.00015,
    })

    expect(mockCollectionDoc).toHaveBeenCalledWith(
      "runs/run-tg-1/stages/territory-generation"
    )
  })

  it("writes territories array in the document data", async () => {
    await writeStageRecord({
      stage: "territory-generation",
      runId: "run-tg-2",
      data: { territories: MOCK_TERRITORIES },
      tokenCost: 0.00015,
    })

    const written = mockDocSet.mock.calls[0]?.[0] as Record<string, unknown>
    expect(Array.isArray(written["territories"])).toBe(true)
    expect((written["territories"] as unknown[])).toHaveLength(1)
  })

  it("writes token cost in _meta", async () => {
    await writeStageRecord({
      stage: "territory-generation",
      runId: "run-tg-3",
      data: { territories: MOCK_TERRITORIES },
      tokenCost: 0.00042,
    })

    const written = mockDocSet.mock.calls[0]?.[0] as Record<string, unknown>
    const meta = written["_meta"] as Record<string, unknown>
    expect(meta["tokenCost"]).toBe(0.00042)
  })

  it("writes server timestamp in _meta.updatedAt", async () => {
    await writeStageRecord({
      stage: "territory-generation",
      runId: "run-tg-4",
      data: { territories: MOCK_TERRITORIES },
    })

    const written = mockDocSet.mock.calls[0]?.[0] as Record<string, unknown>
    const meta = written["_meta"] as Record<string, unknown>
    expect(meta["updatedAt"]).toEqual({ _method: "serverTimestamp" })
  })
})

describe("readStageRecord — territory-generation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("reads from the correct territory-generation path", async () => {
    setupDoc(true, { territories: MOCK_TERRITORIES, _meta: {} })

    await readStageRecord("run-tg-read", "territory-generation")

    expect(mockCollectionDoc).toHaveBeenCalledWith(
      "runs/run-tg-read/stages/territory-generation"
    )
  })

  it("returns data when territories document exists", async () => {
    const data = { territories: MOCK_TERRITORIES, _meta: { tokenCost: 0.00015 } }
    setupDoc(true, data)

    const result = await readStageRecord("run-tg-read-2", "territory-generation")
    expect(result).toEqual(data)
  })

  it("returns null when territories not yet generated", async () => {
    setupDoc(false)

    const result = await readStageRecord("run-tg-read-3", "territory-generation")
    expect(result).toBeNull()
  })
})
