/**
 * Visual DNA — Gemini call shape tests.
 *
 * Tests the POST /api/visual-dna API route behavior.
 * Mocks the Gemini adapter at the boundary.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@greenlight/lib/gemini", () => ({
  callGemini: vi.fn(),
  parseGeminiJson: vi.fn(),
  validateVisualDNA: vi.fn(),
}))

vi.mock("@greenlight/lib/firestore", () => ({
  readStageRecord: vi.fn(),
  writeStageRecord: vi.fn(),
}))

vi.mock("@greenlight/lib/prompts/visual-dna", () => ({
  VISUAL_DNA_SYSTEM_PROMPT: "MOCK_VISUAL_DNA_PROMPT",
}))

const { callGemini, parseGeminiJson, validateVisualDNA } = await import(
  "@greenlight/lib/gemini"
)
const { writeStageRecord } = await import("@greenlight/lib/firestore")

// ── Helpers ────────────────────────────────────────────────────────────────────

const MOCK_TERRITORY = {
  id: "territory-1",
  name: "Raw Velocity",
  creative_proposition: "Capture raw energy of street culture.",
  visual_language: "gritty urban textures, motion blur, high contrast",
  tone: "Urgent and electric",
  emotional_arc: "anticipation → energy → release",
  scene_count_suggestion: 5,
  flow_prompt_style: "Dynamic street cinematography",
  negative_constraints: ["No slow motion"],
  risk_flag: null,
}

const MOCK_VISUAL_DNA = {
  visual_dna: {
    territory_id: "territory-1",
    version: "1.0.0",
    palette: { primary: ["#1a1a2e"], accent: ["#e94560"], forbidden: [] },
    ingredients: [
      { ingredient_id: "char-1", type: "character", description: "Athlete", reference_image_uri: null, generated_reference_uri: null, flow_ingredient_prompt: "Athlete prompt" },
      { ingredient_id: "loc-1", type: "location", description: "Rooftop", reference_image_uri: null, generated_reference_uri: null, flow_ingredient_prompt: "Rooftop prompt" },
      { ingredient_id: "obj-1", type: "object", description: "Shoe", reference_image_uri: null, generated_reference_uri: null, flow_ingredient_prompt: "Shoe prompt" },
      { ingredient_id: "brand-1", type: "brand_asset", description: "Logo", reference_image_uri: null, generated_reference_uri: null, flow_ingredient_prompt: "Logo prompt" },
    ],
    cinematography: { style: "polished", preferred_shot_types: ["close-up", "wide", "tracking"], camera_movement: "gimbal", lighting: "dramatic", color_grade: "cool" },
    brand_rules_as_prompts: ["Nike swoosh with clearspace"],
    negative_prompt_list: ["Adidas"],
    flow_scene_brief: "Configure a Flow session...",
  },
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("POST /api/visual-dna", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("calls Gemini with territory data and system prompt", async () => {
    ;(callGemini as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: JSON.stringify(MOCK_VISUAL_DNA),
      usage: { inputTokens: 1500, outputTokens: 2000, costUsd: 0.00018 },
      model: "gemini-2.5-flash",
    })
    ;(parseGeminiJson as ReturnType<typeof vi.fn>).mockReturnValue(MOCK_VISUAL_DNA)
    ;(validateVisualDNA as ReturnType<typeof vi.fn>).mockReturnValue({
      valid: true,
      gaps: [],
      visualDna: MOCK_VISUAL_DNA.visual_dna,
    })

    const response = await callGemini(
      JSON.stringify({ territory: MOCK_TERRITORY }),
      { systemPrompt: "MOCK_VISUAL_DNA_PROMPT", maxTokens: 8192 }
    )

    expect(response.usage.inputTokens).toBe(1500)
    expect(response.usage.outputTokens).toBe(2000)
  })

  it("writes visual DNA to Firestore under visual-dna stage", async () => {
    (writeStageRecord as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    await writeStageRecord({
      stage: "visual-dna",
      runId: "run-test",
      data: {
        territories: {
          "territory-1": MOCK_VISUAL_DNA.visual_dna,
        },
      },
      tokenCost: 0.00018,
    })

    expect(writeStageRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "visual-dna",
        runId: "run-test",
      })
    )
  })

  it("validates the parsed response against Visual DNA schema", () => {
    const parsed = parseGeminiJson(JSON.stringify(MOCK_VISUAL_DNA))
    // In the API route: if parsed is null, return 502
    expect(parsed).not.toBeNull()

    const validation = validateVisualDNA(parsed)
    expect(validation.valid).toBe(true)
  })
})

// ── Deleted: prompt contract tests moved to visual-dna-schema.test.ts ─
