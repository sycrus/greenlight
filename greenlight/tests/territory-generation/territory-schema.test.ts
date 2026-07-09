/**
 * Territory schema validation tests.
 *
 * Tests validateTerritories(): schema compliance, field validation,
 * divergence detection, risk flag handling.
 */

import { describe, it, expect } from "vitest"
import { validateTerritories } from "../../lib/gemini.js"

// ── Sample data ────────────────────────────────────────────────────────────────

const VALID_TERRITORY_1 = {
  id: "territory-1",
  name: "Raw Velocity",
  creative_proposition: "Capture the raw, unfiltered energy of street culture — speed as self-expression.",
  visual_language: "gritty urban textures, motion blur, high-contrast shadows, concrete and steel palette",
  tone: "Urgent and electric — the adrenaline of the city at night.",
  emotional_arc: "0s anticipation → 15s explosive energy → 30s triumphant release",
  scene_count_suggestion: 5,
  flow_prompt_style: "Dynamic street-style cinematography with rapid cuts and kinetic camera movement. Urban environments at blue hour with neon accent lighting. Athletes in motion, frozen at peak action then released into fluid movement.",
  negative_constraints: ["No slow motion", "No studio lighting", "No direct eye contact with camera"],
  risk_flag: null,
}

const VALID_TERRITORY_2 = {
  id: "territory-2",
  name: "Quiet Precision",
  creative_proposition: "Innovation is found in silence — the beauty of engineered perfection.",
  visual_language: "minimalist white spaces, macro detail shots, soft diffused light, glass and metal surfaces",
  tone: "Contemplative and refined — the elegance of intentional design.",
  emotional_arc: "0s curiosity → 15s revelation of detail → 30s quiet satisfaction",
  scene_count_suggestion: 3,
  flow_prompt_style: "Clean, architectural cinematography with smooth dolly movements and precise rack focuses. Sterile lab environments transitioning to warm natural light. Extreme close-ups of material texture and engineering details.",
  negative_constraints: ["No urban settings", "No crowds", "No fast cuts"],
  risk_flag: null,
}

const VALID_TERRITORY_3 = {
  id: "territory-3",
  name: "Collective Joy",
  creative_proposition: "Movement is better together — community as the ultimate performance enhancer.",
  visual_language: "warm golden hour light, diverse group shots, organic natural settings, saturated earth tones",
  tone: "Warm and inclusive — the infectious energy of shared achievement.",
  emotional_arc: "0s isolation → 15s connection → 30s collective celebration",
  scene_count_suggestion: 4,
  flow_prompt_style: "Warm, documentary-style cinematography capturing authentic human connection. Golden hour exteriors with lens flare and shallow depth of field. Group movement sequences shot from within the crowd.",
  negative_constraints: ["No solo shots", "No artificial lighting", "No competitive framing"],
  risk_flag: "Potential cultural sensitivity: ensure diverse casting represents the target market authentically, not tokenistically.",
}

const VALID_TERRITORIES_RESPONSE = {
  territories: [VALID_TERRITORY_1, VALID_TERRITORY_2, VALID_TERRITORY_3],
}

// ── Schema validation ──────────────────────────────────────────────────────────

describe("validateTerritories — schema", () => {
  it("returns valid:true for a complete 3-territory response", () => {
    const result = validateTerritories(VALID_TERRITORIES_RESPONSE)
    expect(result.valid).toBe(true)
    expect(result.gaps).toHaveLength(0)
    expect(result.territories).toHaveLength(3)
  })

  it("returns valid:false when territories array is missing", () => {
    const result = validateTerritories({ something: "else" })
    expect(result.valid).toBe(false)
    expect(result.gaps).toContain("territories array is missing or not an array")
  })

  it("returns valid:false when fewer than 3 territories", () => {
    const result = validateTerritories({ territories: [VALID_TERRITORY_1, VALID_TERRITORY_2] })
    expect(result.valid).toBe(false)
    expect(result.gaps.some((g) => g.includes("Expected 3"))).toBe(true)
  })

  it("handles null input gracefully", () => {
    const result = validateTerritories(null)
    expect(result.valid).toBe(false)
    expect(result.gaps).toContain("Response is not an object")
    expect(result.territories).toHaveLength(0)
  })

  it("handles non-object input gracefully", () => {
    const result = validateTerritories("not an object")
    expect(result.valid).toBe(false)
  })
})

// ── Required field validation ──────────────────────────────────────────────────

describe("validateTerritories — required fields", () => {
  const requiredFields = [
    "id",
    "name",
    "creative_proposition",
    "visual_language",
    "tone",
    "emotional_arc",
    "flow_prompt_style",
  ]

  for (const field of requiredFields) {
    it(`flags missing ${field}`, () => {
      const bad = { ...VALID_TERRITORY_1, [field]: "" }
      const result = validateTerritories({ territories: [bad, VALID_TERRITORY_2, VALID_TERRITORY_3] })
      expect(result.valid).toBe(false)
      expect(result.gaps.some((g) => g.includes(field))).toBe(true)
    })
  }

  it("flags missing negative_constraints", () => {
    const bad = { ...VALID_TERRITORY_1, negative_constraints: "not-an-array" }
    const result = validateTerritories({ territories: [bad, VALID_TERRITORY_2, VALID_TERRITORY_3] })
    // negative_constraints being non-array + being missing as string — both flagged
    expect(result.gaps.some((g) => g.includes("negative_constraints"))).toBe(true)
  })

  it("flags invalid scene_count_suggestion (zero)", () => {
    const bad = { ...VALID_TERRITORY_1, scene_count_suggestion: 0 }
    const result = validateTerritories({ territories: [bad, VALID_TERRITORY_2, VALID_TERRITORY_3] })
    expect(result.gaps.some((g) => g.includes("scene_count_suggestion"))).toBe(true)
  })

  it("flags invalid scene_count_suggestion (not a number)", () => {
    const bad = { ...VALID_TERRITORY_1, scene_count_suggestion: "five" }
    const result = validateTerritories({ territories: [bad, VALID_TERRITORY_2, VALID_TERRITORY_3] })
    expect(result.gaps.some((g) => g.includes("scene_count_suggestion"))).toBe(true)
  })

  it("allows scene_count_suggestion of 6 (maximum suggested)", () => {
    const t = { ...VALID_TERRITORY_1, scene_count_suggestion: 6 }
    const result = validateTerritories({ territories: [t, VALID_TERRITORY_2, VALID_TERRITORY_3] })
    expect(result.valid).toBe(true)
  })
})

// ── Risk flag handling ─────────────────────────────────────────────────────────

describe("validateTerritories — risk flags", () => {
  it("accepts null risk_flag", () => {
    const t = { ...VALID_TERRITORY_1, risk_flag: null }
    const result = validateTerritories({ territories: [t, VALID_TERRITORY_2, VALID_TERRITORY_3] })
    expect(result.valid).toBe(true)
  })

  it("accepts string risk_flag", () => {
    const t = { ...VALID_TERRITORY_1, risk_flag: "Potential copyright concern with soundtrack reference" }
    const result = validateTerritories({ territories: [t, VALID_TERRITORY_2, VALID_TERRITORY_3] })
    expect(result.valid).toBe(true)
  })

  it("accepts missing risk_flag (undefined)", () => {
    const { risk_flag: _, ...withoutRisk } = VALID_TERRITORY_1
    const result = validateTerritories({ territories: [withoutRisk, VALID_TERRITORY_2, VALID_TERRITORY_3] })
    expect(result.valid).toBe(true)
  })
})

// ── Divergence detection ───────────────────────────────────────────────────────

describe("validateTerritories — divergence", () => {
  it("detects overlapping visual language terms between territories", () => {
    const t1 = { ...VALID_TERRITORY_1, visual_language: "warm golden light, soft shadows, organic textures" }
    const t2 = { ...VALID_TERRITORY_2, visual_language: "warm golden hour, soft diffused light, natural textures" }
    // overlap: warm, golden, light, soft, textures — 5 terms > 2 threshold
    const result = validateTerritories({ territories: [t1, t2, VALID_TERRITORY_3] })
    expect(result.gaps.some((g) => g.includes("Divergence warning"))).toBe(true)
  })

  it("does not flag small overlap (≤2 shared words)", () => {
    const t1 = { ...VALID_TERRITORY_1, visual_language: "urban light, concrete textures" }
    const t2 = { ...VALID_TERRITORY_2, visual_language: "natural light, glass textures" }
    // overlap: light, textures — 2 terms, ≤ threshold
    const result = validateTerritories({ territories: [t1, t2, VALID_TERRITORY_3] })
    expect(result.gaps.filter((g) => g.includes("Divergence warning"))).toHaveLength(0)
  })

  it("still returns valid:true when divergence warning is present (warning only)", () => {
    const t1 = { ...VALID_TERRITORY_1, visual_language: "warm golden light, soft shadows, organic textures" }
    const t2 = { ...VALID_TERRITORY_2, visual_language: "warm golden hour, soft diffused light, natural textures" }
    const result = validateTerritories({ territories: [t1, t2, VALID_TERRITORY_3] })
    // Divergence is a warning, not a validity issue
    expect(result.valid).toBe(true)
  })
})

// ── Edge cases ─────────────────────────────────────────────────────────────────

describe("validateTerritories — edge cases", () => {
  it("handles territories with null entries in array", () => {
    const result = validateTerritories({ territories: [null, VALID_TERRITORY_2, VALID_TERRITORY_3] })
    expect(result.gaps.some((g) => g.includes("is not an object"))).toBe(true)
  })

  it("handles extra territories (>3)", () => {
    const result = validateTerritories({
      territories: [VALID_TERRITORY_1, VALID_TERRITORY_2, VALID_TERRITORY_3, { ...VALID_TERRITORY_1, id: "territory-4" }],
    })
    expect(result.valid).toBe(true)
    expect(result.territories.length).toBeGreaterThanOrEqual(4)
  })

  it("handles direct array input (without wrapper object)", () => {
    const result = validateTerritories([VALID_TERRITORY_1, VALID_TERRITORY_2, VALID_TERRITORY_3])
    expect(result.valid).toBe(true)
    expect(result.territories).toHaveLength(3)
  })
})

// ── Prompt contract ────────────────────────────────────────────────────────────

describe("territory generation system prompt", () => {
  it("includes divergence enforcement language", async () => {
    const { TERRITORY_GENERATION_SYSTEM_PROMPT } = await import(
      "../../lib/prompts/territory-generation.js"
    )
    expect(TERRITORY_GENERATION_SYSTEM_PROMPT).toContain("DIVERGENCE")
    expect(TERRITORY_GENERATION_SYSTEM_PROMPT).toContain("mutually exclusive")
  })

  it("references all required territory fields", async () => {
    const { TERRITORY_GENERATION_SYSTEM_PROMPT } = await import(
      "../../lib/prompts/territory-generation.js"
    )
    const fields = [
      "creative_proposition",
      "visual_language",
      "tone",
      "emotional_arc",
      "scene_count_suggestion",
      "flow_prompt_style",
      "negative_constraints",
      "risk_flag",
    ]
    for (const field of fields) {
      expect(TERRITORY_GENERATION_SYSTEM_PROMPT).toContain(field)
    }
  })

  it("instructs the model to return raw JSON without markdown", async () => {
    const { TERRITORY_GENERATION_SYSTEM_PROMPT } = await import(
      "../../lib/prompts/territory-generation.js"
    )
    expect(TERRITORY_GENERATION_SYSTEM_PROMPT).toContain("no markdown fences")
    expect(TERRITORY_GENERATION_SYSTEM_PROMPT).toContain('start with "{"')
  })
})
