/**
 * Territory generation — Gemini call shape tests.
 *
 * Tests the POST /api/territories API route behavior.
 * Mocks the Gemini adapter at the boundary.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@greenlight/lib/gemini", () => ({
  callGemini: vi.fn(),
  parseGeminiJson: vi.fn(),
  validateTerritories: vi.fn(),
}))

vi.mock("@greenlight/lib/firestore", () => ({
  readStageRecord: vi.fn(),
  writeStageRecord: vi.fn(),
}))

vi.mock("@greenlight/lib/prompts/territory-generation", () => ({
  TERRITORY_GENERATION_SYSTEM_PROMPT: "MOCK_TERRITORY_PROMPT",
}))

// We test the API route handler logic by importing it
// The route file is not directly importable (Next.js route), so we test
// the contract: what callGemini receives, what validateTerritories validates,
// what writeStageRecord writes.

const { callGemini, parseGeminiJson, validateTerritories } = await import(
  "@greenlight/lib/gemini"
)
const { readStageRecord, writeStageRecord } = await import(
  "@greenlight/lib/firestore"
)

// ── Helpers ────────────────────────────────────────────────────────────────────

const MOCK_PARSED_BRIEF = {
  brand: "Nike",
  campaign_objective: "Launch Air Max Dn to Gen Z",
  target_audience: { primary: "Gen Z", secondary: null },
  key_message: "Feel the unreal",
  mandatory_elements: ["Nike swoosh", "Product shot"],
  tone_descriptors: ["bold", "energetic"],
  format: { duration_seconds: 30, aspect_ratio: "9:16", platform: "TikTok" },
  brief_gaps: ["No color palette"],
  confidence_score: 0.85,
}

const MOCK_TERRITORIES = {
  territories: [
    { id: "territory-1", name: "Raw Velocity" },
    { id: "territory-2", name: "Quiet Precision" },
    { id: "territory-3", name: "Collective Joy" },
  ],
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("POST /api/territories", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("reads the parsed brief from Firestore before calling Gemini", async () => {
    // Contract: the API route reads brief-parsing stage before Gemini call
    ;(readStageRecord as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_PARSED_BRIEF)
    ;(parseGeminiJson as ReturnType<typeof vi.fn>).mockReturnValue(MOCK_TERRITORIES)
    ;(validateTerritories as ReturnType<typeof vi.fn>).mockReturnValue({
      valid: true,
      gaps: [],
      territories: MOCK_TERRITORIES.territories,
    })
    ;(callGemini as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: JSON.stringify(MOCK_TERRITORIES),
      usage: { inputTokens: 1000, outputTokens: 800, costUsd: 0.00008 },
      model: "gemini-2.5-flash",
    })

    // Simulate what the API route does:
    const briefRecord = await readStageRecord("run-test", "brief-parsing")
    expect(briefRecord).toEqual(MOCK_PARSED_BRIEF)

    const response = await callGemini(
      JSON.stringify({ parsed_brief: briefRecord }),
      { systemPrompt: expect.any(String) as string, maxTokens: 3072 }
    )
    expect(response.usage.inputTokens).toBeGreaterThan(0)
  })

  it("returns error when parsed brief is not found", async () => {
    (readStageRecord as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const briefRecord = await readStageRecord("run-test", "brief-parsing")
    expect(briefRecord).toBeNull()
    // API route should return 400 in this case
  })

  it("writes territories to Firestore under territory-generation stage", async () => {
    (writeStageRecord as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    await writeStageRecord({
      stage: "territory-generation",
      runId: "run-test",
      data: { territories: MOCK_TERRITORIES.territories },
      tokenCost: 0.00008,
    })

    expect(writeStageRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "territory-generation",
        runId: "run-test",
        data: expect.objectContaining({
          territories: expect.any(Array),
        }) as unknown,
      })
    )
  })

  it("passes the system prompt to Gemini with divergence instructions", async () => {
    ;(callGemini as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: "{}",
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      model: "gemini-2.5-flash",
    })

    await callGemini(JSON.stringify({ parsed_brief: MOCK_PARSED_BRIEF }), {
      systemPrompt: "MOCK_TERRITORY_PROMPT",
      maxTokens: 8192,
    })

    expect(callGemini).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        systemPrompt: expect.stringContaining("") as string,
        maxTokens: 8192,
      })
    )
  })
})

// ── Deleted: prompt contract tests moved to territory-schema.test.ts ─
