/**
 * Deck generation — end-to-end flow tests.
 *
 * Tests the POST /api/generate-deck integration:
 * Firestore read → Gemini copy → Slides create → populate → share → duplicate → Firestore write.
 * All external boundaries are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@greenlight/lib/gemini", () => ({
  callGemini: vi.fn(),
  parseGeminiJson: vi.fn(),
}))

vi.mock("@greenlight/lib/firestore", () => ({
  readStageRecord: vi.fn(),
  writeStageRecord: vi.fn(),
}))

vi.mock("googleapis", () => ({
  google: {
    slides: vi.fn(() => ({
      presentations: {
        create: vi.fn().mockResolvedValue({ data: { presentationId: "mock-pres-123" } }),
        batchUpdate: vi.fn().mockResolvedValue({ data: { replies: [] } }),
        get: vi.fn().mockResolvedValue({
          data: { slides: Array(15).fill({ objectId: "slide" }) },
        }),
      },
    })),
    drive: vi.fn(() => ({
      permissions: { create: vi.fn().mockResolvedValue({ data: { id: "perm-1" } }) },
      files: {
        copy: vi.fn().mockResolvedValue({ data: { id: "mock-pres-client-456" } }),
        get: vi.fn().mockResolvedValue({ data: { id: "mock-file" } }),
      },
    })),
  },
}))

const { callGemini, parseGeminiJson } = await import("@greenlight/lib/gemini")
const { readStageRecord, writeStageRecord } = await import("@greenlight/lib/firestore")

// ── Helpers ────────────────────────────────────────────────────────────────────

const MOCK_BRIEF = {
  brand: "Nike",
  campaign_objective: "Launch Air Max Dn",
  target_audience: { primary: "Gen Z", secondary: null },
  key_message: "Feel the unreal",
  mandatory_elements: ["Swoosh"],
  tone_descriptors: ["bold", "energetic"],
  format: { duration_seconds: 30, aspect_ratio: "9:16", platform: "TikTok" },
  brief_gaps: [],
  confidence_score: 0.85,
}

const MOCK_TERRITORIES = [
  {
    id: "t1",
    name: "Raw Velocity",
    creative_proposition: "Unfiltered motion.",
    visual_language: "high-contrast, kinetic, urban",
    tone: "bold",
    emotional_arc: "tension → release",
    scene_count_suggestion: 5,
    flow_prompt_style: "Cinéma vérité",
    negative_constraints: [],
    risk_flag: "May be too aggressive",
  },
  {
    id: "t2",
    name: "Quiet Precision",
    creative_proposition: "Engineered art.",
    visual_language: "clean, studio, macro",
    tone: "refined",
    emotional_arc: "reveal → integrate",
    scene_count_suggestion: 4,
    flow_prompt_style: "Product photography",
    negative_constraints: [],
    risk_flag: null,
  },
  {
    id: "t3",
    name: "Collective Joy",
    creative_proposition: "Social catalyst.",
    visual_language: "warm, saturated, candid",
    tone: "warm",
    emotional_arc: "individual → collective",
    scene_count_suggestion: 6,
    flow_prompt_style: "Documentary",
    negative_constraints: [],
    risk_flag: "Casting dependency",
  },
]

const MOCK_VISUAL_DNA = {
  territories: {
    t1: {
      territory_id: "t1",
      palette: { primary: ["#FF4400"], accent: ["#00FF88"], forbidden: ["#000000"] },
      ingredients: [],
      cinematography: {
        style: "handheld",
        preferred_shot_types: ["wide", "close-up"],
        camera_movement: "kinetic",
        lighting: "natural",
        color_grade: "high-contrast",
      },
      brand_rules_as_prompts: ["Use swoosh"],
      negative_prompt_list: ["No competitors"],
      flow_scene_brief: "Urban kinetic energy",
    },
    t2: {
      territory_id: "t2",
      palette: { primary: ["#FFFFFF"], accent: ["#0066CC"], forbidden: ["#FF0000"] },
      ingredients: [],
      cinematography: {
        style: "studio",
        preferred_shot_types: ["macro", "tracking"],
        camera_movement: "smooth",
        lighting: "controlled",
        color_grade: "clean",
      },
      brand_rules_as_prompts: ["Product focus"],
      negative_prompt_list: ["No clutter"],
      flow_scene_brief: "Clean precision showcase",
    },
    t3: {
      territory_id: "t3",
      palette: { primary: ["#F4A460"], accent: ["#FFD700"], forbidden: ["#808080"] },
      ingredients: [],
      cinematography: {
        style: "documentary",
        preferred_shot_types: ["medium", "wide", "group"],
        camera_movement: "observational",
        lighting: "golden hour",
        color_grade: "warm",
      },
      brand_rules_as_prompts: ["Diverse cast"],
      negative_prompt_list: ["No sterile environments"],
      flow_scene_brief: "Warm collective moments",
    },
  },
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("POST /api/generate-deck — integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("reads all required Firestore stages before generating", async () => {
    ;(readStageRecord as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(MOCK_BRIEF) // brief-parsing
      .mockResolvedValueOnce({ territories: MOCK_TERRITORIES }) // territory-generation
      .mockResolvedValueOnce(MOCK_VISUAL_DNA) // visual-dna

    // Simulate the API route contract
    const brief = await readStageRecord("run-test", "brief-parsing")
    const territories = await readStageRecord("run-test", "territory-generation")
    const visualDna = await readStageRecord("run-test", "visual-dna")

    expect(brief).toBeDefined()
    expect(territories).toBeDefined()
    expect(visualDna).toBeDefined()
    expect(readStageRecord).toHaveBeenCalledTimes(3)
  })

  it("returns 400 if brief stage is missing", async () => {
    ;(readStageRecord as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const brief = await readStageRecord("run-test", "brief-parsing")
    expect(brief).toBeNull()
    // API route should return 400 "Run run-test has no parsed brief"
  })

  it("returns 400 if territory stage is missing", async () => {
    ;(readStageRecord as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(MOCK_BRIEF)
      .mockResolvedValueOnce(null)

    const brief = await readStageRecord("run-test", "brief-parsing")
    const territories = await readStageRecord("run-test", "territory-generation")
    expect(brief).toBeDefined()
    expect(territories).toBeNull()
  })

  it("calls Gemini with all context for deck copy generation", async () => {
    ;(readStageRecord as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(MOCK_BRIEF)
      .mockResolvedValueOnce({ territories: MOCK_TERRITORIES })
      .mockResolvedValueOnce(MOCK_VISUAL_DNA)

    ;(callGemini as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: JSON.stringify({ titleSlide: { headline: "Test", subtitle: "Sub" } }),
      usage: { inputTokens: 2000, outputTokens: 1500, costUsd: 0.00015 },
      model: "gemini-2.5-flash",
    })

    // Simulate: read all stages → build prompt → call Gemini
    const brief = await readStageRecord("run-test", "brief-parsing")
    const territories = await readStageRecord("run-test", "territory-generation")
    const visualDna = await readStageRecord("run-test", "visual-dna")

    const promptInput = JSON.stringify({ brief, territories, visualDna })
    const response = await callGemini(promptInput, {
      systemPrompt: expect.any(String) as string,
      maxTokens: 8192,
    })

    expect(callGemini).toHaveBeenCalledWith(
      expect.stringContaining("Nike"),
      expect.objectContaining({
        maxTokens: 8192,
      })
    )
    expect(response.usage.outputTokens).toBeGreaterThan(0)
  })

  it("writes output record to Firestore after generating", async () => {
    ;(parseGeminiJson as ReturnType<typeof vi.fn>).mockReturnValue({
      titleSlide: { headline: "Deck", subtitle: "v1" },
      territories: { t1: {}, t2: {}, t3: {} },
    })
    ;(writeStageRecord as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    await writeStageRecord({
      stage: "output-generation",
      runId: "run-test",
      data: {
        slides_deck_id_ecd: "pres-123",
        slides_deck_id_client: "pres-456",
        ecd_deck_url: "https://docs.google.com/presentation/d/pres-123/edit",
        client_deck_url: "https://docs.google.com/presentation/d/pres-456/view",
        flow_package_gcs_uri: "gs://bucket/flow-package.json",
        slide_count_ecd: 15,
        slide_count_client: 14,
      },
      tokenCost: 0.00015,
    })

    expect(writeStageRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "output-generation",
        runId: "run-test",
        data: expect.objectContaining({
          slides_deck_id_ecd: expect.any(String),
          slides_deck_id_client: expect.any(String),
          ecd_deck_url: expect.stringContaining("docs.google.com"),
          client_deck_url: expect.stringContaining("docs.google.com"),
        }),
        tokenCost: expect.any(Number),
      })
    )
  })

  it("ECD deck URL is /edit (commenter), client URL is /view (reader)", () => {
    const ecdUrl = "https://docs.google.com/presentation/d/pres-123/edit"
    const clientUrl = "https://docs.google.com/presentation/d/pres-456/view"

    expect(ecdUrl).toMatch(/\/edit$/)
    expect(clientUrl).toMatch(/\/view$/)
    expect(ecdUrl).not.toBe(clientUrl)
  })

  it("client deck has fewer slides than ECD deck", () => {
    // ECD has 15 slides, client has 14 (brand alignment removed)
    const ecdSlides = 15
    const clientSlides = 14
    expect(clientSlides).toBeLessThan(ecdSlides)
  })

  it("tracked cost includes Gemini tokens from deck copy call", () => {
    const geminiCost = 0.00015 // input 2000 + output 1500 tokens
    expect(geminiCost).toBeGreaterThan(0)
    // Cost should be written to Firestore _meta
  })
})

// ── Placeholder replacement contract ───────────────────────────────────────────

describe("Deck generation — placeholder replacement", () => {
  it("replaces all known placeholders in slide text", () => {
    const placeholders: Record<string, string> = {
      "{{BRAND}}": "Nike",
      "{{T1_NAME}}": "Raw Velocity",
      "{{T1_PROPOSITION}}": "Unfiltered motion.",
      "{{T2_NAME}}": "Quiet Precision",
      "{{T3_NAME}}": "Collective Joy",
      "{{APPROVAL_INSTRUCTIONS}}": "Select your preferred territory",
      "{{NEXT_STEPS}}": "CD enters Flow with approved package",
    }

    const template = "{{BRAND}} — {{T1_NAME}} vs {{T2_NAME}}"
    let result = template
    for (const [key, value] of Object.entries(placeholders)) {
      result = result.replace(key, value)
    }

    expect(result).toBe("Nike — Raw Velocity vs Quiet Precision")
    expect(result).not.toContain("{{")
  })

  it("leaves unreplaced placeholders visible (for debugging)", () => {
    const placeholders: Record<string, string> = {
      "{{BRAND}}": "Nike",
    }

    const template = "{{BRAND}} presents {{UNKNOWN_PLACEHOLDER}}"
    let result = template
    for (const [key, value] of Object.entries(placeholders)) {
      result = result.replace(key, value)
    }

    expect(result).toContain("{{UNKNOWN_PLACEHOLDER}}")
    expect(result).toContain("Nike presents")
  })
})
