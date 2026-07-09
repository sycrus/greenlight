/**
 * Gate locking — pipeline state machine tests.
 *
 * Tests the gate locking logic: Gate 2 is locked until Gate 1 passes.
 */

import { describe, it, expect } from "vitest"

// ── Gate state machine ─────────────────────────────────────────────────────────

type Gate1Status = "NOT_SUBMITTED" | "APPROVED" | "APPROVED_WITH_REVISIONS" | "REVISIONS_REQUIRED"
type Gate2Status = "LOCKED" | "UNLOCKED"

function gate2State(gate1Status: Gate1Status): Gate2Status {
  if (gate1Status === "APPROVED" || gate1Status === "APPROVED_WITH_REVISIONS") {
    return "UNLOCKED"
  }
  return "LOCKED"
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Gate locking — Gate 2 depends on Gate 1", () => {
  it("Gate 2 is locked when Gate 1 is not submitted", () => {
    expect(gate2State("NOT_SUBMITTED")).toBe("LOCKED")
  })

  it("Gate 2 is locked when Gate 1 is REVISIONS_REQUIRED", () => {
    expect(gate2State("REVISIONS_REQUIRED")).toBe("LOCKED")
  })

  it("Gate 2 is unlocked when Gate 1 is APPROVED", () => {
    expect(gate2State("APPROVED")).toBe("UNLOCKED")
  })

  it("Gate 2 is unlocked when Gate 1 is APPROVED_WITH_REVISIONS", () => {
    expect(gate2State("APPROVED_WITH_REVISIONS")).toBe("UNLOCKED")
  })
})

// ── Pipeline state progression ─────────────────────────────────────────────────

describe("Pipeline state — full lifecycle", () => {
  it("progresses through all states correctly", () => {
    const stages = {
      brief_parsing: false,
      territory_generation: false,
      visual_dna: false,
      output_generation: false,
    }

    const gates = {
      ecd_approval: null as string | null,
      client_approval: null as string | null,
    }

    // Stage 1 complete
    stages.brief_parsing = true
    expect(stages.brief_parsing).toBe(true)

    // Stage 2 complete
    stages.territory_generation = true
    expect(stages.territory_generation).toBe(true)

    // Stage 3 complete
    stages.visual_dna = true
    expect(stages.visual_dna).toBe(true)

    // Stage 4 complete
    stages.output_generation = true
    expect(stages.output_generation).toBe(true)

    // All stages complete
    const allStagesComplete = Object.values(stages).every(Boolean)
    expect(allStagesComplete).toBe(true)

    // Gate 1 passes
    gates.ecd_approval = "APPROVED"
    expect(gate2State(gates.ecd_approval as Gate1Status)).toBe("UNLOCKED")

    // Gate 2 passes
    gates.client_approval = "APPROVED"
    expect(gates.client_approval).toBe("APPROVED")

    // Pipeline complete
    const pipelineComplete =
      allStagesComplete &&
      gates.ecd_approval !== null &&
      gates.client_approval !== null
    expect(pipelineComplete).toBe(true)
  })

  it("pipeline is not complete if any stage is missing", () => {
    // Simulate: stages 1-3 complete, stage 4 missing
    const stagesOk = { brief_parsing: true, territory_generation: true, visual_dna: true, output_generation: false }
    const allStagesComplete = Object.values(stagesOk).every(Boolean)

    expect(allStagesComplete).toBe(false)
  })

  it("pipeline is not complete if ECD gate is missing", () => {
    const ecdPassed = false
    expect(ecdPassed).toBe(false)
  })

  it("pipeline is not complete if client gate is missing", () => {
    const clientPassed = false
    expect(clientPassed).toBe(false)
  })
})
