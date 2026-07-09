/**
 * Visual DNA schema validation tests.
 *
 * Tests validateVisualDNA(): schema compliance, palette hex format,
 * ingredient type coverage, cinematography coherence.
 */

import { describe, it, expect } from "vitest"
import { validateVisualDNA } from "../../lib/gemini.js"

// ── Sample data ────────────────────────────────────────────────────────────────

const VALID_VISUAL_DNA = {
  visual_dna: {
    territory_id: "territory-1",
    version: "1.0.0",
    palette: {
      primary: ["#1a1a2e", "#e94560", "#0f3460"],
      accent: ["#f5c518", "#16c79a"],
      forbidden: ["#ff0000", "#00ff00"],
    },
    ingredients: [
      {
        ingredient_id: "char-1",
        type: "character",
        description: "A young athlete in their mid-20s, determined expression, wearing technical running gear in dark tones. Shot from low angle against urban skyline.",
        reference_image_uri: null,
        generated_reference_uri: null,
        flow_ingredient_prompt: "Young athlete, mid-20s, determined expression, dark technical running gear, low angle hero shot, urban skyline background, cinematic lighting",
      },
      {
        ingredient_id: "loc-1",
        type: "location",
        description: "Rooftop basketball court at blue hour, city lights beginning to glow in the distance, weathered court surface with character.",
        reference_image_uri: null,
        generated_reference_uri: null,
        flow_ingredient_prompt: "Rooftop basketball court, blue hour ambient light, distant city lights bokeh, weathered concrete surface, urban atmosphere",
      },
      {
        ingredient_id: "obj-1",
        type: "object",
        description: "Nike Air Max Dn shoe, sole-up angle showing the Dynamic Air unit, dramatic side lighting revealing texture and material layers.",
        reference_image_uri: null,
        generated_reference_uri: null,
        flow_ingredient_prompt: "Nike Air Max Dn product shot, sole-up hero angle, Dynamic Air unit visible, dramatic side lighting, material texture detail",
      },
      {
        ingredient_id: "brand-1",
        type: "brand_asset",
        description: "Nike swoosh logo in white on dark background, with generous clearspace, positioned for lower-third overlay placement.",
        reference_image_uri: null,
        generated_reference_uri: null,
        flow_ingredient_prompt: "White Nike swoosh logo on dark background, generous clearspace padding, lower-third placement, clean vector style",
      },
    ],
    cinematography: {
      style: "polished commercial with kinetic energy",
      preferred_shot_types: [
        "low angle hero shot of athlete",
        "extreme close-up of shoe texture",
        "wide tracking shot through urban environment",
        "overhead drone pull-away reveal",
      ],
      camera_movement: "fluid gimbal with occasional snap zoom for energy peaks",
      lighting: "high-contrast dramatic lighting with neon accent practicals in background",
      color_grade: "cool blue shadows with warm skin tone preservation, crushed blacks",
    },
    brand_rules_as_prompts: [
      "Nike swoosh logo with generous clearspace on all sides",
      "Nike Air Max Dn product as the sole branded footwear in every frame",
      "Performance athletic aesthetic — no casual or lifestyle styling",
    ],
    negative_prompt_list: [
      "Adidas logo, Adidas product, three-stripe design",
      "Puma logo, Puma product",
      "casual footwear, dress shoes, sandals",
    ],
    flow_scene_brief: "Configure a Flow session for a high-energy sports commercial. Use the rooftop basketball court as the primary location with blue hour lighting. Feature the athlete in dynamic motion sequences — running, jumping, quick directional changes. Hero product shots of the Air Max Dn should emphasize the Dynamic Air unit with macro detail work. Maintain a cool blue shadow grade throughout with neon accent lighting from city background practicals.",
  },
}

// ── Schema validation ──────────────────────────────────────────────────────────

describe("validateVisualDNA — schema", () => {
  it("returns valid:true for a complete visual DNA object", () => {
    const result = validateVisualDNA(VALID_VISUAL_DNA)
    expect(result.valid).toBe(true)
    expect(result.gaps).toHaveLength(0)
    expect(result.visualDna).not.toBeNull()
  })

  it("handles null input gracefully", () => {
    const result = validateVisualDNA(null)
    expect(result.valid).toBe(false)
    expect(result.gaps).toContain("Response is not an object")
    expect(result.visualDna).toBeNull()
  })

  it("handles non-object input gracefully", () => {
    const result = validateVisualDNA("not an object")
    expect(result.valid).toBe(false)
  })

  it("extracts visual_dna from wrapper object", () => {
    const result = validateVisualDNA(VALID_VISUAL_DNA)
    expect(result.visualDna?.["territory_id"]).toBe("territory-1")
  })

  it("handles direct visual_dna object (without wrapper)", () => {
    const result = validateVisualDNA(VALID_VISUAL_DNA.visual_dna)
    expect(result.visualDna?.["territory_id"]).toBe("territory-1")
  })
})

// ── Top-level field validation ─────────────────────────────────────────────────

describe("validateVisualDNA — top-level fields", () => {
  it("flags missing territory_id", () => {
    const bad = { ...VALID_VISUAL_DNA.visual_dna, territory_id: "" }
    const result = validateVisualDNA({ visual_dna: bad })
    expect(result.valid).toBe(false)
    expect(result.gaps.some((g) => g.includes("territory_id"))).toBe(true)
  })

  it("flags missing version", () => {
    const bad = { ...VALID_VISUAL_DNA.visual_dna, version: "" }
    const result = validateVisualDNA({ visual_dna: bad })
    expect(result.valid).toBe(false)
    expect(result.gaps.some((g) => g.includes("version"))).toBe(true)
  })

  it("flags missing flow_scene_brief", () => {
    const bad = { ...VALID_VISUAL_DNA.visual_dna, flow_scene_brief: "" }
    const result = validateVisualDNA({ visual_dna: bad })
    expect(result.valid).toBe(false)
    expect(result.gaps.some((g) => g.includes("flow_scene_brief"))).toBe(true)
  })
})

// ── Palette validation ─────────────────────────────────────────────────────────

describe("validateVisualDNA — palette", () => {
  it("flags missing palette", () => {
    const { palette: _, ...bad } = VALID_VISUAL_DNA.visual_dna
    const result = validateVisualDNA({ visual_dna: bad })
    expect(result.gaps.some((g) => g.includes("palette"))).toBe(true)
  })

  it("flags non-array primary palette", () => {
    const bad = {
      ...VALID_VISUAL_DNA.visual_dna,
      palette: { ...VALID_VISUAL_DNA.visual_dna.palette, primary: "not-an-array" },
    }
    const result = validateVisualDNA({ visual_dna: bad })
    expect(result.gaps.some((g) => g.includes("palette.primary"))).toBe(true)
  })

  it("flags invalid hex codes", () => {
    const bad = {
      ...VALID_VISUAL_DNA.visual_dna,
      palette: { ...VALID_VISUAL_DNA.visual_dna.palette, primary: ["#1a1a2e", "not-a-color", "#GGGGGG"] },
    }
    const result = validateVisualDNA({ visual_dna: bad })
    expect(result.gaps.some((g) => g.includes("not a valid hex"))).toBe(true)
  })

  it("accepts valid 6-character hex codes", () => {
    const result = validateVisualDNA(VALID_VISUAL_DNA)
    expect(result.valid).toBe(true)
  })

  it("accepts uppercase hex codes", () => {
    const vd = {
      ...VALID_VISUAL_DNA.visual_dna,
      palette: {
        primary: ["#1A1A2E", "#FF5733"],
        accent: ["#F5C518"],
        forbidden: [],
      },
    }
    const result = validateVisualDNA({ visual_dna: vd })
    expect(result.valid).toBe(true)
  })

  it("flags missing accent array", () => {
    const bad = {
      ...VALID_VISUAL_DNA.visual_dna,
      palette: { ...VALID_VISUAL_DNA.visual_dna.palette, accent: "not-array" },
    }
    const result = validateVisualDNA({ visual_dna: bad })
    expect(result.gaps.some((g) => g.includes("palette.accent"))).toBe(true)
  })

  it("flags missing forbidden array", () => {
    const bad = {
      ...VALID_VISUAL_DNA.visual_dna,
      palette: { ...VALID_VISUAL_DNA.visual_dna.palette, forbidden: "not-array" },
    }
    const result = validateVisualDNA({ visual_dna: bad })
    expect(result.gaps.some((g) => g.includes("palette.forbidden"))).toBe(true)
  })
})

// ── Ingredient validation ──────────────────────────────────────────────────────

describe("validateVisualDNA — ingredients", () => {
  it("flags missing ingredients array", () => {
    const { ingredients: _, ...bad } = VALID_VISUAL_DNA.visual_dna
    const result = validateVisualDNA({ visual_dna: bad })
    expect(result.gaps.some((g) => g.includes("ingredients"))).toBe(true)
  })

  it("flags fewer than 4 ingredients", () => {
    const bad = {
      ...VALID_VISUAL_DNA.visual_dna,
      ingredients: [VALID_VISUAL_DNA.visual_dna.ingredients[0]],
    }
    const result = validateVisualDNA({ visual_dna: bad })
    expect(result.gaps.some((g) => g.includes("at least 4"))).toBe(true)
  })

  it("flags invalid ingredient type", () => {
    const bad = {
      ...VALID_VISUAL_DNA.visual_dna,
      ingredients: [
        ...VALID_VISUAL_DNA.visual_dna.ingredients.slice(0, 3),
        {
          ingredient_id: "bad-1",
          type: "not-a-valid-type",
          description: "Test",
          reference_image_uri: null,
          generated_reference_uri: null,
          flow_ingredient_prompt: "Test prompt",
        },
      ],
    }
    const result = validateVisualDNA({ visual_dna: bad })
    expect(result.gaps.some((g) => g.includes("type must be one of"))).toBe(true)
  })

  it("flags missing ingredient description", () => {
    const bad = {
      ...VALID_VISUAL_DNA.visual_dna,
      ingredients: [
        ...VALID_VISUAL_DNA.visual_dna.ingredients.slice(0, 3),
        {
          ingredient_id: "no-desc",
          type: "character",
          description: "",
          reference_image_uri: null,
          generated_reference_uri: null,
          flow_ingredient_prompt: "Test prompt",
        },
      ],
    }
    const result = validateVisualDNA({ visual_dna: bad })
    expect(result.gaps.some((g) => g.includes("description"))).toBe(true)
  })

  it("flags missing ingredient flow_ingredient_prompt", () => {
    const bad = {
      ...VALID_VISUAL_DNA.visual_dna,
      ingredients: [
        ...VALID_VISUAL_DNA.visual_dna.ingredients.slice(0, 3),
        {
          ingredient_id: "no-prompt",
          type: "object",
          description: "Test object",
          reference_image_uri: null,
          generated_reference_uri: null,
          flow_ingredient_prompt: "",
        },
      ],
    }
    const result = validateVisualDNA({ visual_dna: bad })
    expect(result.gaps.some((g) => g.includes("flow_ingredient_prompt"))).toBe(true)
  })

  it("flags missing required ingredient type (e.g. no location)", () => {
    const noLocation = VALID_VISUAL_DNA.visual_dna.ingredients.filter(
      (i) => i.type !== "location"
    )
    const bad = { ...VALID_VISUAL_DNA.visual_dna, ingredients: noLocation }
    const result = validateVisualDNA({ visual_dna: bad })
    expect(result.gaps.some((g) => g.includes("location"))).toBe(true)
  })
})

// ── Cinematography validation ──────────────────────────────────────────────────

describe("validateVisualDNA — cinematography", () => {
  it("flags missing cinematography object", () => {
    const { cinematography: _, ...bad } = VALID_VISUAL_DNA.visual_dna
    const result = validateVisualDNA({ visual_dna: bad })
    expect(result.gaps.some((g) => g.includes("cinematography"))).toBe(true)
  })

  it("flags missing style", () => {
    const bad = {
      ...VALID_VISUAL_DNA.visual_dna,
      cinematography: { ...VALID_VISUAL_DNA.visual_dna.cinematography, style: "" },
    }
    const result = validateVisualDNA({ visual_dna: bad })
    expect(result.gaps.some((g) => g.includes("cinematography.style"))).toBe(true)
  })

  it("flags non-array preferred_shot_types", () => {
    const bad = {
      ...VALID_VISUAL_DNA.visual_dna,
      cinematography: {
        ...VALID_VISUAL_DNA.visual_dna.cinematography,
        preferred_shot_types: "close-up, wide",
      },
    }
    const result = validateVisualDNA({ visual_dna: bad })
    expect(result.gaps.some((g) => g.includes("preferred_shot_types must be an array"))).toBe(true)
  })

  it("flags fewer than 3 preferred shot types", () => {
    const bad = {
      ...VALID_VISUAL_DNA.visual_dna,
      cinematography: {
        ...VALID_VISUAL_DNA.visual_dna.cinematography,
        preferred_shot_types: ["close-up"],
      },
    }
    const result = validateVisualDNA({ visual_dna: bad })
    expect(result.gaps.some((g) => g.includes("at least 3"))).toBe(true)
  })
})

// ── Brand rules arrays ─────────────────────────────────────────────────────────

describe("validateVisualDNA — brand rules", () => {
  it("flags non-array brand_rules_as_prompts", () => {
    const bad = {
      ...VALID_VISUAL_DNA.visual_dna,
      brand_rules_as_prompts: "not an array",
    }
    const result = validateVisualDNA({ visual_dna: bad })
    expect(result.gaps.some((g) => g.includes("brand_rules_as_prompts must be an array"))).toBe(true)
  })

  it("flags non-array negative_prompt_list", () => {
    const bad = {
      ...VALID_VISUAL_DNA.visual_dna,
      negative_prompt_list: "not an array",
    }
    const result = validateVisualDNA({ visual_dna: bad })
    expect(result.gaps.some((g) => g.includes("negative_prompt_list must be an array"))).toBe(true)
  })

  it("accepts empty brand rules arrays", () => {
    const vd = {
      ...VALID_VISUAL_DNA.visual_dna,
      brand_rules_as_prompts: [],
      negative_prompt_list: [],
    }
    const result = validateVisualDNA({ visual_dna: vd })
    expect(result.valid).toBe(true)
  })
})

// ── Prompt contract ────────────────────────────────────────────────────────────

describe("visual DNA system prompt", () => {
  it("includes palette extraction instructions", async () => {
    const { VISUAL_DNA_SYSTEM_PROMPT } = await import(
      "../../lib/prompts/visual-dna.js"
    )
    expect(VISUAL_DNA_SYSTEM_PROMPT).toContain("palette")
    expect(VISUAL_DNA_SYSTEM_PROMPT).toContain("hex")
  })

  it("includes ingredient spec instructions", async () => {
    const { VISUAL_DNA_SYSTEM_PROMPT } = await import(
      "../../lib/prompts/visual-dna.js"
    )
    expect(VISUAL_DNA_SYSTEM_PROMPT).toContain("ingredients")
    expect(VISUAL_DNA_SYSTEM_PROMPT).toContain("character")
    expect(VISUAL_DNA_SYSTEM_PROMPT).toContain("location")
    expect(VISUAL_DNA_SYSTEM_PROMPT).toContain("brand_asset")
  })

  it("includes cinematography instructions", async () => {
    const { VISUAL_DNA_SYSTEM_PROMPT } = await import(
      "../../lib/prompts/visual-dna.js"
    )
    expect(VISUAL_DNA_SYSTEM_PROMPT).toContain("cinematography")
    expect(VISUAL_DNA_SYSTEM_PROMPT).toContain("preferred_shot_types")
  })

  it("includes brand rules translation instructions", async () => {
    const { VISUAL_DNA_SYSTEM_PROMPT } = await import(
      "../../lib/prompts/visual-dna.js"
    )
    expect(VISUAL_DNA_SYSTEM_PROMPT).toContain("brand_rules_as_prompts")
    expect(VISUAL_DNA_SYSTEM_PROMPT).toContain("negative_prompt_list")
  })

  it("instructs the model to return raw JSON without markdown", async () => {
    const { VISUAL_DNA_SYSTEM_PROMPT } = await import(
      "../../lib/prompts/visual-dna.js"
    )
    expect(VISUAL_DNA_SYSTEM_PROMPT).toContain("no markdown fences")
    expect(VISUAL_DNA_SYSTEM_PROMPT).toContain('start with "{"')
  })
})
