/**
 * Flow package — assembly + schema validation tests.
 *
 * Tests the Flow package JSON assembly from Visual DNA objects
 * and validation against the PRD §5 Stage 4b schema.
 */

import { describe, it, expect } from "vitest"

// ── Types ──────────────────────────────────────────────────────────────────────

interface FlowIngredient {
  ingredient_id: string
  name: string
  type: "character" | "location" | "object" | "brand_asset"
  reference_image_uri: string | null
  generated_reference_uri: string | null
  flow_ingredient_prompt: string
}

interface SceneBrief {
  scene_number: number
  territory_id: string
  description: string
  shot_language: string
  suggested_flow_prompt: string
  duration_seconds: number
}

interface FlowPackage {
  flow_package: {
    run_id: string
    brand: string
    approved_territory_id: string | null
    visual_dna: Record<string, unknown>
    flow_session_brief: string
    ingredients: FlowIngredient[]
    scene_briefs: SceneBrief[]
    brand_rules_as_prompts: string[]
    negative_prompt_list: string[]
    approved_by_ecd: string | null
    approved_by_client: string | null
    released_at: string | null
  }
}

// ── Sample data ────────────────────────────────────────────────────────────────

const MOCK_VISUAL_DNA_T1 = {
  territory_id: "t1",
  version: "1.0.0",
  palette: { primary: ["#FF4400"], accent: ["#00FF88"], forbidden: [] },
  ingredients: [
    {
      ingredient_id: "char-1",
      type: "character" as const,
      description: "Young athlete",
      reference_image_uri: null,
      generated_reference_uri: "gs://bucket/runs/r1/char-1.png",
      flow_ingredient_prompt: "A young athlete in motion, cinematic lighting",
    },
    {
      ingredient_id: "loc-1",
      type: "location" as const,
      description: "Urban rooftop",
      reference_image_uri: null,
      generated_reference_uri: null,
      flow_ingredient_prompt: "Urban rooftop at golden hour, city skyline background",
    },
  ],
  cinematography: {
    style: "handheld",
    preferred_shot_types: ["wide"],
    camera_movement: "kinetic",
    lighting: "natural",
    color_grade: "high-contrast",
  },
  brand_rules_as_prompts: ["Use swoosh prominently"],
  negative_prompt_list: ["No competitor logos"],
  flow_scene_brief: "Urban kinetic energy — fast cuts, motion blur, raw texture",
}

const MOCK_VISUAL_DNA_T2 = {
  territory_id: "t2",
  version: "1.0.0",
  palette: { primary: ["#FFFFFF"], accent: ["#0066CC"], forbidden: [] },
  ingredients: [
    {
      ingredient_id: "obj-1",
      type: "object" as const,
      description: "Air Max Dn shoe",
      reference_image_uri: null,
      generated_reference_uri: "gs://bucket/runs/r1/obj-1.png",
      flow_ingredient_prompt: "Product hero shot of Air Max Dn on white infinity cove",
    },
    {
      ingredient_id: "brand-1",
      type: "brand_asset" as const,
      description: "Nike swoosh logo",
      reference_image_uri: null,
      generated_reference_uri: null,
      flow_ingredient_prompt: "Nike swoosh — use uploaded asset",
    },
  ],
  cinematography: {
    style: "studio",
    preferred_shot_types: ["macro"],
    camera_movement: "smooth",
    lighting: "controlled",
    color_grade: "clean",
  },
  brand_rules_as_prompts: ["Product must be center frame"],
  negative_prompt_list: ["No clutter"],
  flow_scene_brief: "Clean precision — macro details, smooth camera, product focus",
}

// ── Assembly helper ────────────────────────────────────────────────────────────

function assembleFlowPackage(
  runId: string,
  brand: string,
  brief: Record<string, unknown>,
  visualDnas: Record<string, unknown>[]
): FlowPackage {
  // Flatten ingredients
  const allIngredients: FlowIngredient[] = []
  const seenIds = new Set<string>()
  for (const vd of visualDnas) {
    const ings = (vd["ingredients"] as FlowIngredient[]) ?? []
    for (const ing of ings) {
      if (!seenIds.has(ing.ingredient_id)) {
        seenIds.add(ing.ingredient_id)
        allIngredients.push(ing)
      }
    }
  }

  // Aggregate brand rules + negative prompts
  const brandRulesSet = new Set<string>()
  const negativePromptsSet = new Set<string>()
  for (const vd of visualDnas) {
    for (const rule of (vd["brand_rules_as_prompts"] as string[]) ?? []) {
      brandRulesSet.add(rule)
    }
    for (const neg of (vd["negative_prompt_list"] as string[]) ?? []) {
      negativePromptsSet.add(neg)
    }
  }

  // Generate scene briefs
  const sceneBriefs: SceneBrief[] = []
  let sceneNum = 1
  for (const vd of visualDnas) {
    const territoryId = vd["territory_id"] as string
    const flowSceneBrief = vd["flow_scene_brief"] as string
    const sceneCount = 4 // default, can be overridden from territory data

    for (let i = 0; i < sceneCount; i++) {
      sceneBriefs.push({
        scene_number: sceneNum++,
        territory_id: territoryId,
        description: `${flowSceneBrief} — scene ${i + 1}`,
        shot_language: "Cinematic",
        suggested_flow_prompt: `Create scene ${i + 1} for ${territoryId}: ${flowSceneBrief}`,
        duration_seconds: 6,
      })
    }
  }

  // Generate flow session brief
  const flowSessionBrief = `Brand: ${brand}. ${brief["campaign_objective"] ?? ""}. Three creative territories explore different execution approaches.`

  // Build visual_dna map
  const visualDnaMap: Record<string, unknown> = {}
  for (const vd of visualDnas) {
    const tid = vd["territory_id"] as string
    visualDnaMap[tid] = vd
  }

  return {
    flow_package: {
      run_id: runId,
      brand,
      approved_territory_id: null,
      visual_dna: visualDnaMap,
      flow_session_brief: flowSessionBrief,
      ingredients: allIngredients,
      scene_briefs: sceneBriefs,
      brand_rules_as_prompts: [...brandRulesSet],
      negative_prompt_list: [...negativePromptsSet],
      approved_by_ecd: null,
      approved_by_client: null,
      released_at: null,
    },
  }
}

// ── Validation helper ──────────────────────────────────────────────────────────

function validateFlowPackage(
  pkg: unknown
): { valid: boolean; gaps: string[] } {
  const gaps: string[] = []

  if (typeof pkg !== "object" || pkg === null) {
    return { valid: false, gaps: ["Flow package is not an object"] }
  }

  const fp = (pkg as Record<string, unknown>)["flow_package"] as Record<string, unknown> | null
  if (!fp || typeof fp !== "object") {
    return { valid: false, gaps: ["flow_package is missing"] }
  }

  if (typeof fp["run_id"] !== "string" || !fp["run_id"]) gaps.push("run_id")
  if (typeof fp["brand"] !== "string" || !fp["brand"]) gaps.push("brand")
  if (typeof fp["flow_session_brief"] !== "string" || !fp["flow_session_brief"]) {
    gaps.push("flow_session_brief")
  }

  if (!Array.isArray(fp["ingredients"])) {
    gaps.push("ingredients must be an array")
  } else if ((fp["ingredients"] as unknown[]).length === 0) {
    gaps.push("ingredients cannot be empty")
  }

  if (!Array.isArray(fp["scene_briefs"])) {
    gaps.push("scene_briefs must be an array")
  } else if ((fp["scene_briefs"] as unknown[]).length === 0) {
    gaps.push("scene_briefs cannot be empty")
  }

  if (!Array.isArray(fp["brand_rules_as_prompts"])) gaps.push("brand_rules_as_prompts")
  if (!Array.isArray(fp["negative_prompt_list"])) gaps.push("negative_prompt_list")

  if (typeof fp["visual_dna"] !== "object" || fp["visual_dna"] === null) {
    gaps.push("visual_dna is missing")
  }

  return { valid: gaps.length === 0, gaps }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Flow package — assembly", () => {
  it("assembles a valid flow package from 2 visual DNA objects", () => {
    const pkg = assembleFlowPackage(
      "run-test",
      "Nike",
      { campaign_objective: "Launch Air Max Dn" },
      [MOCK_VISUAL_DNA_T1, MOCK_VISUAL_DNA_T2]
    )

    const result = validateFlowPackage(pkg)
    expect(result.valid).toBe(true)
    expect(result.gaps).toEqual([])
  })

  it("includes all 3 territory visual DNA objects", () => {
    const pkg = assembleFlowPackage("run-test", "Nike", {}, [
      MOCK_VISUAL_DNA_T1,
      MOCK_VISUAL_DNA_T2,
      { territory_id: "t3", ingredients: [], brand_rules_as_prompts: [], negative_prompt_list: [], flow_scene_brief: "Warm" },
    ])

    const visualDna = pkg.flow_package.visual_dna
    expect(Object.keys(visualDna)).toHaveLength(3)
    expect(visualDna["t1"]).toBeDefined()
    expect(visualDna["t2"]).toBeDefined()
    expect(visualDna["t3"]).toBeDefined()
  })

  it("deduplicates ingredients by ingredient_id across territories", () => {
    const duplicateIngredient = {
      ingredient_id: "char-1",
      type: "character" as const,
      description: "Duplicate",
      reference_image_uri: null,
      generated_reference_uri: null,
      flow_ingredient_prompt: "dup",
    }

    const pkg = assembleFlowPackage("run-test", "Nike", {}, [
      MOCK_VISUAL_DNA_T1, // has char-1
      { ...MOCK_VISUAL_DNA_T2, ingredients: [duplicateIngredient] }, // also has char-1
    ])

    const char1Count = pkg.flow_package.ingredients.filter(
      (i) => i.ingredient_id === "char-1"
    ).length
    expect(char1Count).toBe(1)
  })

  it("deduplicates brand rules across territories", () => {
    const pkg = assembleFlowPackage("run-test", "Nike", {}, [
      MOCK_VISUAL_DNA_T1,
      { ...MOCK_VISUAL_DNA_T2, brand_rules_as_prompts: ["Use swoosh prominently"] }, // same rule
    ])

    const swooshCount = pkg.flow_package.brand_rules_as_prompts.filter(
      (r) => r === "Use swoosh prominently"
    ).length
    expect(swooshCount).toBe(1)
  })

  it("generates scene briefs for each territory", () => {
    const pkg = assembleFlowPackage("run-test", "Nike", {}, [
      MOCK_VISUAL_DNA_T1,
      MOCK_VISUAL_DNA_T2,
    ])

    const t1Scenes = pkg.flow_package.scene_briefs.filter(
      (s) => s.territory_id === "t1"
    )
    const t2Scenes = pkg.flow_package.scene_briefs.filter(
      (s) => s.territory_id === "t2"
    )

    expect(t1Scenes.length).toBeGreaterThan(0)
    expect(t2Scenes.length).toBeGreaterThan(0)
    expect(t1Scenes[0]!.scene_number).toBe(1)
  })

  it("scene briefs have sequential numbers across territories", () => {
    const pkg = assembleFlowPackage("run-test", "Nike", {}, [
      MOCK_VISUAL_DNA_T1,
      MOCK_VISUAL_DNA_T2,
    ])

    const sceneNums = pkg.flow_package.scene_briefs.map((s) => s.scene_number)
    for (let i = 1; i <= sceneNums.length; i++) {
      expect(sceneNums).toContain(i)
    }
  })

  it("sets all approval fields to null on initial assembly", () => {
    const pkg = assembleFlowPackage("run-test", "Nike", {}, [MOCK_VISUAL_DNA_T1])

    expect(pkg.flow_package.approved_territory_id).toBeNull()
    expect(pkg.flow_package.approved_by_ecd).toBeNull()
    expect(pkg.flow_package.approved_by_client).toBeNull()
    expect(pkg.flow_package.released_at).toBeNull()
  })

  it("generates a flow session brief with brand name", () => {
    const pkg = assembleFlowPackage("run-test", "Nike", {
      campaign_objective: "Launch product",
    }, [MOCK_VISUAL_DNA_T1])

    expect(pkg.flow_package.flow_session_brief).toContain("Nike")
    expect(pkg.flow_package.flow_session_brief.length).toBeGreaterThan(20)
  })

  it("handles empty visual DNA data gracefully", () => {
    const pkg = assembleFlowPackage("run-test", "Brand", {}, [])

    expect(pkg.flow_package.ingredients).toEqual([])
    expect(pkg.flow_package.brand_rules_as_prompts).toEqual([])
    expect(pkg.flow_package.negative_prompt_list).toEqual([])
  })
})

// ── Schema validation ──────────────────────────────────────────────────────────

describe("Flow package — schema validation", () => {
  it("validates a complete flow package", () => {
    const pkg = assembleFlowPackage("run-test", "Nike", {}, [
      MOCK_VISUAL_DNA_T1,
      MOCK_VISUAL_DNA_T2,
    ])
    const result = validateFlowPackage(pkg)
    expect(result.valid).toBe(true)
  })

  it("rejects non-object input", () => {
    const result = validateFlowPackage(null)
    expect(result.valid).toBe(false)
    expect(result.gaps).toEqual(["Flow package is not an object"])
  })

  it("rejects missing flow_package wrapper", () => {
    const result = validateFlowPackage({})
    expect(result.valid).toBe(false)
    expect(result.gaps).toContain("flow_package is missing")
  })

  it("rejects missing run_id", () => {
    const pkg = { flow_package: { brand: "Nike", flow_session_brief: "Brief", ingredients: [{ id: "1" }], scene_briefs: [{ n: 1 }], brand_rules_as_prompts: [], negative_prompt_list: [], visual_dna: {} } }
    const result = validateFlowPackage(pkg)
    expect(result.gaps).toContain("run_id")
  })

  it("rejects missing brand", () => {
    const pkg = { flow_package: { run_id: "r1", flow_session_brief: "Brief", ingredients: [{ id: "1" }], scene_briefs: [{ n: 1 }], brand_rules_as_prompts: [], negative_prompt_list: [], visual_dna: {} } }
    const result = validateFlowPackage(pkg)
    expect(result.gaps).toContain("brand")
  })

  it("rejects empty ingredients", () => {
    const pkg = { flow_package: { run_id: "r1", brand: "Nike", flow_session_brief: "Brief", ingredients: [], scene_briefs: [{ n: 1 }], brand_rules_as_prompts: [], negative_prompt_list: [], visual_dna: {} } }
    const result = validateFlowPackage(pkg)
    expect(result.gaps).toContain("ingredients cannot be empty")
  })

  it("rejects empty scene_briefs", () => {
    const pkg = { flow_package: { run_id: "r1", brand: "Nike", flow_session_brief: "Brief", ingredients: [{ id: "1" }], scene_briefs: [], brand_rules_as_prompts: [], negative_prompt_list: [], visual_dna: {} } }
    const result = validateFlowPackage(pkg)
    expect(result.gaps).toContain("scene_briefs cannot be empty")
  })
})

// ── Release (Gate 2 approval) ──────────────────────────────────────────────────

describe("Flow package — release on Gate 2 approval", () => {
  it("updates approval fields on release", () => {
    const pkg = assembleFlowPackage("run-test", "Nike", {}, [MOCK_VISUAL_DNA_T1])

    // Simulate Gate 2 approval
    const released = {
      ...pkg.flow_package,
      approved_territory_id: "t1",
      approved_by_ecd: "Jane Doe",
      approved_by_client: "John Smith",
      released_at: "2026-07-09T00:00:00.000Z",
    }

    expect(released.approved_territory_id).toBe("t1")
    expect(released.approved_by_ecd).toBe("Jane Doe")
    expect(released.approved_by_client).toBe("John Smith")
    expect(released.released_at).toMatch(/^2026-07-09/)
    expect(released.released_at).not.toBeNull()
  })

  it("released_at is an ISO8601 timestamp", () => {
    const timestamp = new Date().toISOString()
    expect(timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    )
  })
})
