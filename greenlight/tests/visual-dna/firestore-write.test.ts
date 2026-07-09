/**
 * Visual DNA — Firestore write contract tests.
 *
 * Verifies the correct collection path, document shape, and field
 * conventions for Visual DNA stage records. All 3 territories'
 * Visual DNA objects are stored in one document keyed by territory_id.
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

const MOCK_VISUAL_DNA = {
  territory_id: "territory-1",
  version: "1.0.0",
  palette: { primary: ["#1a1a2e"], accent: ["#e94560"], forbidden: [] },
  ingredients: [
    { ingredient_id: "char-1", type: "character", description: "Athlete", reference_image_uri: null, generated_reference_uri: null, flow_ingredient_prompt: "Athlete prompt" },
    { ingredient_id: "loc-1", type: "location", description: "Rooftop", reference_image_uri: null, generated_reference_uri: null, flow_ingredient_prompt: "Rooftop prompt" },
    { ingredient_id: "obj-1", type: "object", description: "Shoe", reference_image_uri: null, generated_reference_uri: null, flow_ingredient_prompt: "Shoe prompt" },
    { ingredient_id: "brand-1", type: "brand_asset", description: "Logo", reference_image_uri: null, generated_reference_uri: null, flow_ingredient_prompt: "Logo prompt" },
  ],
  cinematography: { style: "polished", preferred_shot_types: ["cu", "wide", "track"], camera_movement: "gimbal", lighting: "dramatic", color_grade: "cool" },
  brand_rules_as_prompts: ["Nike swoosh with clearspace"],
  negative_prompt_list: ["Adidas"],
  flow_scene_brief: "Configure Flow...",
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("writeStageRecord — visual-dna", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDoc(false)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("writes to the correct path: /runs/{runId}/stages/visual-dna", async () => {
    await writeStageRecord({
      stage: "visual-dna",
      runId: "run-vd-1",
      data: {
        territories: { "territory-1": MOCK_VISUAL_DNA },
      },
      tokenCost: 0.00018,
    })

    expect(mockCollectionDoc).toHaveBeenCalledWith(
      "runs/run-vd-1/stages/visual-dna"
    )
  })

  it("writes all territories keyed by territory_id", async () => {
    const data = {
      territories: {
        "territory-1": MOCK_VISUAL_DNA,
        "territory-2": { ...MOCK_VISUAL_DNA, territory_id: "territory-2" },
        "territory-3": { ...MOCK_VISUAL_DNA, territory_id: "territory-3" },
      },
    }

    await writeStageRecord({
      stage: "visual-dna",
      runId: "run-vd-2",
      data,
      tokenCost: 0.00054,
    })

    const written = mockDocSet.mock.calls[0]?.[0] as Record<string, unknown>
    const territories = written["territories"] as Record<string, unknown>
    expect(Object.keys(territories)).toHaveLength(3)
    expect(territories["territory-1"]).toBeDefined()
    expect(territories["territory-2"]).toBeDefined()
    expect(territories["territory-3"]).toBeDefined()
  })

  it("writes token cost in _meta", async () => {
    await writeStageRecord({
      stage: "visual-dna",
      runId: "run-vd-3",
      data: { territories: { "territory-1": MOCK_VISUAL_DNA } },
      tokenCost: 0.00018,
    })

    const written = mockDocSet.mock.calls[0]?.[0] as Record<string, unknown>
    const meta = written["_meta"] as Record<string, unknown>
    expect(meta["tokenCost"]).toBe(0.00018)
  })

  it("writes server timestamp in _meta.updatedAt", async () => {
    await writeStageRecord({
      stage: "visual-dna",
      runId: "run-vd-4",
      data: { territories: { "territory-1": MOCK_VISUAL_DNA } },
    })

    const written = mockDocSet.mock.calls[0]?.[0] as Record<string, unknown>
    const meta = written["_meta"] as Record<string, unknown>
    expect(meta["updatedAt"]).toEqual({ _method: "serverTimestamp" })
  })

  it("each territory has the required Visual DNA fields", async () => {
    await writeStageRecord({
      stage: "visual-dna",
      runId: "run-vd-5",
      data: { territories: { "territory-1": MOCK_VISUAL_DNA } },
    })

    const written = mockDocSet.mock.calls[0]?.[0] as Record<string, unknown>
    const territories = written["territories"] as Record<string, unknown>
    const vd = territories["territory-1"] as Record<string, unknown>

    expect(vd["territory_id"]).toBe("territory-1")
    expect(vd["palette"]).toBeDefined()
    expect(vd["ingredients"]).toBeDefined()
    expect(vd["cinematography"]).toBeDefined()
    expect(vd["brand_rules_as_prompts"]).toBeDefined()
    expect(vd["negative_prompt_list"]).toBeDefined()
    expect(vd["flow_scene_brief"]).toBeDefined()
  })
})

describe("readStageRecord — visual-dna", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("reads from the correct visual-dna path", async () => {
    setupDoc(true, {
      territories: { "territory-1": MOCK_VISUAL_DNA },
      _meta: {},
    })

    await readStageRecord("run-vd-read", "visual-dna")

    expect(mockCollectionDoc).toHaveBeenCalledWith(
      "runs/run-vd-read/stages/visual-dna"
    )
  })

  it("returns all territories when they exist", async () => {
    const data = {
      territories: {
        "territory-1": MOCK_VISUAL_DNA,
        "territory-2": MOCK_VISUAL_DNA,
        "territory-3": MOCK_VISUAL_DNA,
      },
      _meta: { tokenCost: 0.00054 },
    }
    setupDoc(true, data)

    const result = await readStageRecord("run-vd-read-2", "visual-dna")
    expect(result).toEqual(data)
  })

  it("returns null when visual DNA not yet generated", async () => {
    setupDoc(false)

    const result = await readStageRecord("run-vd-read-3", "visual-dna")
    expect(result).toBeNull()
  })
})
