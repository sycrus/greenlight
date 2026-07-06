/**
 * Brief parsing — Stage 1 tests.
 *
 * Tests the pure functions: parseGeminiJson() and validateParsedBrief().
 * Gemini API call is mocked — real API tests run as integration suite.
 */

import { describe, it, expect } from "vitest"
import { parseGeminiJson, validateParsedBrief } from "../../lib/gemini.js"

// ── Sample outputs ───────────────────────────────────────────────────────────

const VALID_PARSED_BRIEF = {
  brand: "Nike",
  campaign_objective: "Launch the new Air Max Dn line to Gen Z on TikTok",
  target_audience: {
    primary: "Gen Z (18-26), sneaker culture, fashion-forward",
    secondary: "Millennial sneaker collectors (27-35)",
  },
  key_message: "Air Max Dn — feel the unreal",
  mandatory_elements: [
    "Nike swoosh logo",
    "Air Max Dn product shot",
    "Dynamic Air unit close-up",
    "Nike tagline",
  ],
  tone_descriptors: ["bold", "energetic", "street-authentic", "future-forward"],
  format: {
    duration_seconds: 30,
    aspect_ratio: "9:16",
    platform: "TikTok",
  },
  brief_gaps: [
    "No specific color palette provided",
    "No music/sound design preferences specified",
  ],
  confidence_score: 0.82,
}

// ── parseGeminiJson ──────────────────────────────────────────────────────────

describe("parseGeminiJson", () => {
  it("parses raw JSON", () => {
    const input = JSON.stringify(VALID_PARSED_BRIEF)
    const result = parseGeminiJson(input)
    expect(result).toEqual(VALID_PARSED_BRIEF)
  })

  it("parses JSON inside markdown fences", () => {
    const input = "```json\n" + JSON.stringify(VALID_PARSED_BRIEF) + "\n```"
    const result = parseGeminiJson(input)
    expect(result).toEqual(VALID_PARSED_BRIEF)
  })

  it("parses JSON inside fences without language tag", () => {
    const input = "```\n" + JSON.stringify(VALID_PARSED_BRIEF) + "\n```"
    const result = parseGeminiJson(input)
    expect(result).toEqual(VALID_PARSED_BRIEF)
  })

  it("extracts JSON from mixed prose + JSON", () => {
    const input =
      "Here is the parsed brief:\n\n" +
      JSON.stringify(VALID_PARSED_BRIEF) +
      "\n\nLet me know if you need changes."
    const result = parseGeminiJson(input)
    expect(result).toEqual(VALID_PARSED_BRIEF)
  })

  it("returns null for empty input", () => {
    expect(parseGeminiJson("")).toBeNull()
  })

  it("returns null for input without JSON object", () => {
    expect(parseGeminiJson("Just some text, no JSON here.")).toBeNull()
  })

  it("returns null for malformed JSON", () => {
    expect(parseGeminiJson('{"brand": "Nike", broken}')).toBeNull()
  })

  it("handles nested objects and arrays correctly", () => {
    const input = JSON.stringify(VALID_PARSED_BRIEF)
    const result = parseGeminiJson(input)
    const parsed = result as Record<string, unknown>
    expect(parsed["brand"]).toBe("Nike")
    expect(Array.isArray(parsed["mandatory_elements"])).toBe(true)
    expect((parsed["target_audience"] as Record<string, unknown>)["primary"]).toBeDefined()
  })
})

// ── validateParsedBrief ─────────────────────────────────────────────────────

describe("validateParsedBrief", () => {
  it("returns valid:true for a complete parsed brief", () => {
    const result = validateParsedBrief(VALID_PARSED_BRIEF)
    expect(result.valid).toBe(true)
    expect(result.gaps).toHaveLength(0)
  })

  it("returns valid:false when brand is missing", () => {
    const result = validateParsedBrief({ ...VALID_PARSED_BRIEF, brand: "" })
    expect(result.valid).toBe(false)
    expect(result.gaps).toContain("brand")
  })

  it("returns valid:false when campaign_objective is missing", () => {
    const result = validateParsedBrief({
      ...VALID_PARSED_BRIEF,
      campaign_objective: "",
    })
    expect(result.valid).toBe(false)
    expect(result.gaps).toContain("campaign_objective")
  })

  it("returns valid:false when target_audience.primary is missing", () => {
    const result = validateParsedBrief({
      ...VALID_PARSED_BRIEF,
      target_audience: { primary: "", secondary: null },
    })
    expect(result.valid).toBe(false)
    expect(result.gaps).toContain("target_audience.primary")
  })

  it("returns valid:false when key_message is missing", () => {
    const result = validateParsedBrief({
      ...VALID_PARSED_BRIEF,
      key_message: "",
    })
    expect(result.valid).toBe(false)
    expect(result.gaps).toContain("key_message")
  })

  it("returns valid:false when tone_descriptors is not an array", () => {
    const result = validateParsedBrief({
      ...VALID_PARSED_BRIEF,
      tone_descriptors: "bold, energetic",
    })
    expect(result.valid).toBe(false)
  })

  it("returns valid:false when confidence_score is not a number", () => {
    const result = validateParsedBrief({
      ...VALID_PARSED_BRIEF,
      confidence_score: "high",
    })
    expect(result.valid).toBe(false)
  })

  it("returns all missing fields in gaps array", () => {
    const result = validateParsedBrief({ brand: "Nike" })
    expect(result.valid).toBe(false)
    expect(result.gaps.length).toBeGreaterThan(3)
    expect(result.gaps).toContain("campaign_objective")
    expect(result.gaps).toContain("target_audience")
  })

  it("handles null input gracefully", () => {
    const result = validateParsedBrief(null)
    expect(result.valid).toBe(false)
    expect(result.gaps).toContain("Response is not an object")
  })

  it("handles non-object input gracefully", () => {
    const result = validateParsedBrief("not an object")
    expect(result.valid).toBe(false)
    expect(result.gaps).toContain("Response is not an object")
  })

  it("allows secondary audience to be null", () => {
    const brief = {
      ...VALID_PARSED_BRIEF,
      target_audience: { primary: "Gen Z", secondary: null },
    }
    const result = validateParsedBrief(brief)
    expect(result.valid).toBe(true)
  })

  it("auto-populates brief_gaps from validation gaps when not present", () => {
    const brief = { ...VALID_PARSED_BRIEF, brand: "", campaign_objective: "" }
    delete (brief as Record<string, unknown>)["brief_gaps"]
    const result = validateParsedBrief(brief)
    expect(result.valid).toBe(false)
    expect((brief as Record<string, unknown>)["brief_gaps"]).toEqual(
      expect.arrayContaining(["brand", "campaign_objective"])
    )
  })
})

// ── Prompt integration (contract test) ───────────────────────────────────────

describe("brief parsing system prompt", () => {
  it("includes the PRD schema fields in the prompt", async () => {
    const { BRIEF_PARSING_SYSTEM_PROMPT } = await import(
      "../../lib/prompts/brief-parsing.js"
    )
    expect(BRIEF_PARSING_SYSTEM_PROMPT).toContain("brand")
    expect(BRIEF_PARSING_SYSTEM_PROMPT).toContain("campaign_objective")
    expect(BRIEF_PARSING_SYSTEM_PROMPT).toContain("target_audience")
    expect(BRIEF_PARSING_SYSTEM_PROMPT).toContain("brief_gaps")
    expect(BRIEF_PARSING_SYSTEM_PROMPT).toContain("confidence_score")
  })

  it("instructs the model to return raw JSON without markdown fences", async () => {
    const { BRIEF_PARSING_SYSTEM_PROMPT } = await import(
      "../../lib/prompts/brief-parsing.js"
    )
    expect(BRIEF_PARSING_SYSTEM_PROMPT).toContain("no markdown fences")
    expect(BRIEF_PARSING_SYSTEM_PROMPT).toContain("ONLY the JSON object")
  })
})
