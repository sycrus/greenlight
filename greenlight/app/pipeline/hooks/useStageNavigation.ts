"use client"

import { useState, useMemo, useCallback } from "react"
import type { RunStatus } from "../../pipeline/types"

// ── Stage definitions ──────────────────────────────────────────────────────

export interface StageDef {
  id: string
  label: string
  icon: string
  /** Which stage data key signals this stage is complete */
  requiresStage?: keyof RunStatus["stages"]
  /** Which gate signals completion (for gate stages) */
  requiresGate?: keyof RunStatus["gates"]
  /** Additional condition: e.g. territories must have been selected */
  requiresAdvance?: boolean
}

export const STAGES: StageDef[] = [
  { id: "brief", label: "Brief", icon: "📝", requiresStage: "brief_parsing" },
  { id: "territories", label: "Territories", icon: "🎨", requiresStage: "territory_generation" },
  { id: "visual_dna", label: "Visual DNA", icon: "🧬", requiresStage: "visual_dna", requiresAdvance: true },
  { id: "references", label: "References", icon: "🖼", requiresStage: "visual_dna" },
  { id: "deck", label: "Deck", icon: "📦", requiresStage: "output_generation" },
  { id: "gates", label: "Gates & Release", icon: "🚀", requiresStage: "output_generation" },
]

export type StageStatus = "locked" | "ready" | "active" | "complete"

export interface StageState {
  id: string
  label: string
  icon: string
  status: StageStatus
}

export function useStageNavigation(runData: RunStatus | null) {
  const [currentStage, setCurrentStage] = useState("brief")
  const [advancedStages, setAdvancedStages] = useState<Set<string>>(new Set())

  // Mark a stage as "advanced" (user clicked through to the next stage)
  const markAdvanced = useCallback((stageId: string) => {
    setAdvancedStages((prev) => new Set([...prev, stageId]))
  }, [])

  // Derive status for each stage
  const stageStates: StageState[] = useMemo(() => {
    if (!runData) return STAGES.map((s) => ({ ...s, status: "locked" as StageStatus }))

    let prevComplete = true

    return STAGES.map((stage, i) => {
      // Stage 0 (brief) is always unlocked
      if (i === 0) {
        const complete = runData.stages.brief_parsing != null
        const active = currentStage === stage.id
        return { ...stage, status: active ? "active" : complete ? "complete" : "ready" }
      }

      // Check if previous stage is complete
      const prevStage = STAGES[i - 1]!
      const prevComplete_check = prevStage.requiresStage
        ? runData.stages[prevStage.requiresStage] != null
        : true

      if (!prevComplete_check) {
        prevComplete = false
        return { ...stage, status: "locked" }
      }

      // Check advance requirement
      if (stage.requiresAdvance && !advancedStages.has(stage.id)) {
        prevComplete = false
        // If the stage data actually exists (from auto-generation), it's available
        if (stage.requiresStage && runData.stages[stage.requiresStage] != null) {
          return { ...stage, status: currentStage === stage.id ? "active" : "complete" }
        }
        return { ...stage, status: "locked" }
      }

      // This stage is available
      const stageComplete = stage.requiresStage
        ? runData.stages[stage.requiresStage] != null
        : stage.requiresGate
          ? runData.gates[stage.requiresGate] != null
          : false

      const active = currentStage === stage.id
      return { ...stage, status: active ? "active" : stageComplete ? "complete" : "ready" }
    })
  }, [runData, currentStage, advancedStages])

  // Navigate to a stage
  const goToStage = useCallback((stageId: string) => {
    const state = stageStates.find((s) => s.id === stageId)
    if (state && state.status !== "locked") {
      setCurrentStage(stageId)
    }
  }, [stageStates])

  return {
    currentStage,
    stageStates,
    goToStage,
    markAdvanced,
  }
}
