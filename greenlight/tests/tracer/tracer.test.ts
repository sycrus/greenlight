/**
 * Tracer tests — git-based audit trail.
 *
 * Tests: writeAgentTrace(), writeStageOutput(), writeBriefInput(), writeRunSummary()
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import {
  writeAgentTrace,
  writeStageOutput,
  writeBriefInput,
  writeRunSummary,
} from "../../lib/tracer.js"

const TEST_RUN_ID = "test-run-001"
const TRACES_DIR = join(process.cwd(), "greenlight", "traces", "runs")

describe("writeAgentTrace", () => {
  const testInput = {
    stage: "brief-parsing" as const,
    runId: TEST_RUN_ID,
    model: "gemini-2.5-flash-001",
    systemPrompt: "You are a brief parsing agent. Extract structured data.",
    userMessage: "Nike wants a 30s spot for the new Air Max line targeting Gen Z on TikTok.",
    rawResponse: '{"brand":"Nike","campaign_objective":"Launch Air Max line"}',
    parsedOutput: { brand: "Nike", campaign_objective: "Launch Air Max line" },
    usage: { inputTokens: 247, outputTokens: 182, costUsd: 0.00002 },
    durationMs: 3200,
    verification: [
      { check: "schema valid", passed: true },
      { check: "confidence ≥ 0.5", passed: true, detail: "confidence: 0.87" },
      { check: "gaps populated", passed: true },
    ],
  }

  beforeEach(() => {
    const testDir = join(TRACES_DIR, TEST_RUN_ID)
    if (existsSync(testDir)) rmSync(testDir, { recursive: true })
  })

  afterEach(() => {
    const testDir = join(TRACES_DIR, TEST_RUN_ID)
    if (existsSync(testDir)) rmSync(testDir, { recursive: true })
  })

  it("writes a trace file to the correct path", () => {
    const result = writeAgentTrace(testInput)
    expect(result.filePath).toBe(`greenlight/traces/runs/${TEST_RUN_ID}/agent-traces/brief-parsing.md`)
    expect(existsSync(join(process.cwd(), result.filePath))).toBe(true)
  })

  it("includes the subagent header with display name", () => {
    const result = writeAgentTrace(testInput)
    const content = readFileSync(join(process.cwd(), result.filePath), "utf-8")
    expect(content).toContain("# Subagent: Brief Parsing")
  })

  it("includes metadata table with all fields", () => {
    const result = writeAgentTrace(testInput)
    const content = readFileSync(join(process.cwd(), result.filePath), "utf-8")
    expect(content).toContain("| Model | gemini-2.5-flash-001 |")
    expect(content).toContain("| Duration | 3.2s |")
    expect(content).toContain("| Input tokens | 247 |")
    expect(content).toContain("| Output tokens | 182 |")
    expect(content).toContain("| Cost | $0.00002 |")
  })

  it("shows ✅ for passed verifications and ❌ for failed", () => {
    const failingInput = {
      ...testInput,
      verification: [
        { check: "schema valid", passed: true },
        { check: "confidence ≥ 0.5", passed: false, detail: "confidence: 0.32" },
      ],
    }
    const result = writeAgentTrace(failingInput)
    const content = readFileSync(join(process.cwd(), result.filePath), "utf-8")
    expect(content).toContain("✅ schema valid")
    expect(content).toContain("❌ confidence ≥ 0.5")
    expect(content).toContain("confidence: 0.32")
  })

  it("includes system prompt verbatim", () => {
    const result = writeAgentTrace(testInput)
    const content = readFileSync(join(process.cwd(), result.filePath), "utf-8")
    expect(content).toContain("## System prompt")
    expect(content).toContain("You are a brief parsing agent. Extract structured data.")
  })

  it("includes raw response as JSON code block", () => {
    const result = writeAgentTrace(testInput)
    const content = readFileSync(join(process.cwd(), result.filePath), "utf-8")
    expect(content).toContain("## Raw response")
    expect(content).toContain("```json")
    expect(content).toContain('"brand":"Nike"')
    expect(content).toContain("```")
  })

  it("includes parsed output as pretty-printed JSON", () => {
    const result = writeAgentTrace(testInput)
    const content = readFileSync(join(process.cwd(), result.filePath), "utf-8")
    expect(content).toContain("## Parsed output")
    expect(content).toContain('"brand": "Nike"')
  })

  it("creates the directory if it does not exist", () => {
    const dir = join(TRACES_DIR, TEST_RUN_ID)
    expect(existsSync(dir)).toBe(false) // cleaned in beforeEach
    writeAgentTrace(testInput)
    expect(existsSync(dir)).toBe(true)
  })

  it("returns writtenAt timestamp in ISO8601 format", () => {
    const result = writeAgentTrace(testInput)
    expect(result.writtenAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })
})

describe("writeStageOutput", () => {
  const stageData = {
    stage: "brief-parsing" as const,
    runId: TEST_RUN_ID,
    data: {
      brand: "Nike",
      campaign_objective: "Launch Air Max line",
      target_audience: { primary: "Gen Z", secondary: null },
      confidence_score: 0.87,
    },
    metadata: { pipelineComponent: "brief-parsing-v1" },
  }

  beforeEach(() => {
    const testDir = join(TRACES_DIR, TEST_RUN_ID)
    if (existsSync(testDir)) rmSync(testDir, { recursive: true })
  })

  afterEach(() => {
    const testDir = join(TRACES_DIR, TEST_RUN_ID)
    if (existsSync(testDir)) rmSync(testDir, { recursive: true })
  })

  it("writes stage output to a numbered JSON file", () => {
    const result = writeStageOutput(stageData)
    expect(result.filePath).toBe(`greenlight/traces/runs/${TEST_RUN_ID}/02-brief_parsing.json`)
    expect(existsSync(join(process.cwd(), result.filePath))).toBe(true)
  })

  it("includes _metadata with stage, runId, writtenAt, and custom metadata", () => {
    const result = writeStageOutput(stageData)
    const content = readFileSync(join(process.cwd(), result.filePath), "utf-8")
    const parsed = JSON.parse(content)
    expect(parsed._metadata.stage).toBe("brief-parsing")
    expect(parsed._metadata.runId).toBe(TEST_RUN_ID)
    expect(parsed._metadata.writtenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(parsed._metadata.pipelineComponent).toBe("brief-parsing-v1")
  })

  it("preserves the stage data at the top level", () => {
    const result = writeStageOutput(stageData)
    const content = readFileSync(join(process.cwd(), result.filePath), "utf-8")
    const parsed = JSON.parse(content)
    expect(parsed.brand).toBe("Nike")
    expect(parsed.confidence_score).toBe(0.87)
    expect(parsed.target_audience.primary).toBe("Gen Z")
  })

  it("uses correct file numbering for each pipeline stage", () => {
    const stages = [
      { stage: "brief-parsing" as const, num: "02" },
      { stage: "territory-generation" as const, num: "03" },
      { stage: "visual-dna" as const, num: "04" },
      { stage: "output-generation" as const, num: "05" },
      { stage: "gate-ecd" as const, num: "07" },
      { stage: "gate-client" as const, num: "08" },
    ]
    for (const { stage, num } of stages) {
      const result = writeStageOutput({ ...stageData, stage })
      expect(result.filePath).toContain(`${num}-`)
    }
  })
})

describe("writeBriefInput", () => {
  beforeEach(() => {
    const testDir = join(TRACES_DIR, TEST_RUN_ID)
    if (existsSync(testDir)) rmSync(testDir, { recursive: true })
  })

  afterEach(() => {
    const testDir = join(TRACES_DIR, TEST_RUN_ID)
    if (existsSync(testDir)) rmSync(testDir, { recursive: true })
  })

  it("writes raw brief as 01-brief-input.md", () => {
    const path = writeBriefInput(TEST_RUN_ID, "Nike Air Max campaign brief...")
    expect(path).toContain("01-brief-input.md")
    const content = readFileSync(join(process.cwd(), path), "utf-8")
    expect(content).toContain("Nike Air Max campaign brief...")
    expect(content).toContain("# Brief Input")
    expect(content).toContain(`**Run ID:** ${TEST_RUN_ID}`)
  })

  it("includes brand rules JSON when provided", () => {
    const brandRules = { palette: { primary: "#FF0000" }, typography: "Helvetica" }
    const path = writeBriefInput(TEST_RUN_ID, "Brief text.", brandRules)
    const content = readFileSync(join(process.cwd(), path), "utf-8")
    expect(content).toContain("## Brand rules")
    expect(content).toContain('"primary": "#FF0000"')
  })

  it("omits brand rules section when not provided", () => {
    const path = writeBriefInput(TEST_RUN_ID, "Brief text.")
    const content = readFileSync(join(process.cwd(), path), "utf-8")
    expect(content).not.toContain("## Brand rules")
  })
})

describe("writeRunSummary", () => {
  beforeEach(() => {
    const testDir = join(TRACES_DIR, TEST_RUN_ID)
    if (existsSync(testDir)) rmSync(testDir, { recursive: true })
  })

  afterEach(() => {
    const testDir = join(TRACES_DIR, TEST_RUN_ID)
    if (existsSync(testDir)) rmSync(testDir, { recursive: true })
  })

  it("writes run summary as 09-run-summary.json", () => {
    const summary = { brand: "Nike", totalCostUsd: 0.42, approvedTerritory: "territory-2" }
    const result = writeRunSummary(TEST_RUN_ID, summary)
    expect(result.filePath).toContain("09-run-summary.json")
    const content = readFileSync(join(process.cwd(), result.filePath), "utf-8")
    const parsed = JSON.parse(content)
    expect(parsed.brand).toBe("Nike")
    expect(parsed.totalCostUsd).toBe(0.42)
    expect(parsed._metadata.writtenAt).toBeDefined()
  })
})
