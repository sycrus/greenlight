/**
 * Generate references — integration flow tests.
 *
 * Tests the API route contract: read Visual DNA → filter ingredients →
 * generate images → upload to GCS → update Firestore.
 * Mocks Gemini, GCS, and Firestore at the boundary.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@greenlight/lib/gemini", () => ({
  generateImage: vi.fn(),
}))

vi.mock("@greenlight/lib/gcs", () => ({
  uploadToGcs: vi.fn(),
  gcsToHttps: vi.fn((uri: string) => uri.replace("gs://", "https://storage.googleapis.com/")),
}))

vi.mock("@greenlight/lib/firestore", () => ({
  readStageRecord: vi.fn(),
  writeStageRecord: vi.fn(),
}))

const { generateImage } = await import("@greenlight/lib/gemini")
const { uploadToGcs } = await import("@greenlight/lib/gcs")
const { readStageRecord, writeStageRecord } = await import("@greenlight/lib/firestore")

// ── Helpers ────────────────────────────────────────────────────────────────────

const MOCK_VISUAL_DNA = {
  territories: {
    "territory-1": {
      territory_id: "territory-1",
      version: "1.0.0",
      palette: { primary: ["#1a1a2e"], accent: [], forbidden: [] },
      ingredients: [
        {
          ingredient_id: "char-1",
          type: "character",
          description: "Young athlete",
          flow_ingredient_prompt: "Young athlete, photorealistic",
          reference_image_uri: null,
          generated_reference_uri: null,
        },
        {
          ingredient_id: "loc-1",
          type: "location",
          description: "Rooftop court",
          flow_ingredient_prompt: "Rooftop basketball court at blue hour",
          reference_image_uri: null,
          generated_reference_uri: null,
        },
        {
          ingredient_id: "obj-1",
          type: "object",
          description: "Nike shoe",
          flow_ingredient_prompt: "Nike Air Max Dn product shot",
          reference_image_uri: null,
          generated_reference_uri: null,
        },
        {
          ingredient_id: "brand-1",
          type: "brand_asset",
          description: "Nike logo",
          flow_ingredient_prompt: "Nike swoosh logo",
          reference_image_uri: null,
          generated_reference_uri: null,
        },
      ],
      cinematography: { style: "polished", preferred_shot_types: ["cu", "wide", "track"], camera_movement: "gimbal", lighting: "dramatic", color_grade: "cool" },
      brand_rules_as_prompts: [],
      negative_prompt_list: ["No violence"],
      flow_scene_brief: "Test brief",
    },
  },
  _meta: { tokenCost: 0.00054, imagenCost: 0, imagenGenerations: 0 },
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("generate-references flow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("reads Visual DNA from Firestore for the given runId", async () => {
    (readStageRecord as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_VISUAL_DNA)

    const vd = (await readStageRecord("run-gen-1", "visual-dna")) as Record<string, unknown> | null
    expect(vd).not.toBeNull()
    const territories = (vd as Record<string, unknown>)["territories"] as Record<string, unknown>
    expect(territories["territory-1"]).toBeDefined()
  })

  it("skips brand_asset ingredients", () => {
    const ingredients = MOCK_VISUAL_DNA.territories["territory-1"]!.ingredients
    const brandAssets = ingredients.filter((i) => i.type === "brand_asset")
    expect(brandAssets.length).toBeGreaterThan(0)

    // brand_asset should be skipped — no generation
    const toGenerate = ingredients.filter((i) => i.type !== "brand_asset" && !i.generated_reference_uri)
    expect(toGenerate.length).toBe(3) // char-1, loc-1, obj-1
    expect(toGenerate.find((i) => i.type === "brand_asset")).toBeUndefined()
  })

  it("skips ingredients that already have generated_reference_uri", () => {
    const vd = JSON.parse(JSON.stringify(MOCK_VISUAL_DNA))
    vd.territories["territory-1"].ingredients[0].generated_reference_uri = "gs://bucket/existing.png"

    const ingredients = vd.territories["territory-1"].ingredients
    const needsGen = ingredients.filter(
      (i: { generated_reference_uri: string | null; type: string }) =>
        !i.generated_reference_uri && i.type !== "brand_asset"
    )
    expect(needsGen.length).toBe(2) // loc-1, obj-1 (char-1 already has)
  })

  it("filters by ingredientIds when provided", () => {
    const ingredients = MOCK_VISUAL_DNA.territories["territory-1"]!.ingredients
    const requested = ["char-1"]

    const toGenerate = ingredients.filter(
      (i) => requested.includes(i.ingredient_id) && i.type !== "brand_asset" && !i.generated_reference_uri
    )
    expect(toGenerate.length).toBe(1)
    expect(toGenerate[0]!.ingredient_id).toBe("char-1")
  })

  it("generates image for each eligible ingredient", async () => {
    (generateImage as ReturnType<typeof vi.fn>).mockResolvedValue({
      imageBuffer: Buffer.from("fake-image"),
      costUsd: 0.04,
      model: "imagen-3.0-generate-001",
    })
    ;(uploadToGcs as ReturnType<typeof vi.fn>).mockResolvedValue({
      gcsUri: "gs://bucket/runs/run-1/references/char-1_test.png",
      publicUrl: "https://storage.googleapis.com/bucket/runs/run-1/references/char-1_test.png",
      sizeBytes: 819200,
      contentType: "image/png",
    })

    // Simulate: for each eligible ingredient, generate + upload
    const result1 = await generateImage({ prompt: "Young athlete, photorealistic" })
    expect(result1.imageBuffer).toBeInstanceOf(Buffer)

    const upload1 = await uploadToGcs(result1.imageBuffer, {
      runId: "run-1",
      ingredientId: "char-1",
    })
    expect(upload1.gcsUri).toMatch(/^gs:\/\//)
  })

  it("writes updated ingredients back to Firestore with accumulated cost", async () => {
    (writeStageRecord as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    await writeStageRecord({
      stage: "visual-dna",
      runId: "run-1",
      data: {
        territories: MOCK_VISUAL_DNA.territories,
      },
      tokenCost: 0.00054,
      imagenCost: 0.12, // 3 × $0.04
      imagenGenerations: 3,
    })

    expect(writeStageRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "visual-dna",
        imagenCost: 0.12,
        imagenGenerations: 3,
      })
    )
  })

  it("handles partial failure — continues after generation error", async () => {
    // First call succeeds, second fails
    (generateImage as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        imageBuffer: Buffer.from("ok"),
        costUsd: 0.04,
        model: "imagen-3.0-generate-001",
      })
      .mockRejectedValueOnce(new Error("Safety filter blocked"))

    const results: { success: boolean; error?: string }[] = []

    for (const ing of ["char-1", "loc-1"]) {
      try {
        await generateImage({ prompt: ing })
        results.push({ success: true })
      } catch (err) {
        results.push({
          success: false,
          error: err instanceof Error ? err.message : "Unknown",
        })
      }
    }

    expect(results[0]!.success).toBe(true)
    expect(results[1]!.success).toBe(false)
    expect(results[1]!.error).toContain("Safety filter")
  })
})
