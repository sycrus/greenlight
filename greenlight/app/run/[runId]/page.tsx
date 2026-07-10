/**
 * Pipeline canvas page — stage-based viewport with sidebar navigation.
 *
 * Left: StageSidebar showing 6 pipeline stages
 * Center: StageCanvas showing nodes for the current stage only
 * Right: SidePanel (opens on node click)
 */

"use client"

import dynamic from "next/dynamic"
import { useParams } from "next/navigation"
import Link from "next/link"
import { useState, useEffect, useCallback } from "react"

const StageCanvas = dynamic(() => import("@/pipeline/StageCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-zinc-950">
      <p className="text-sm text-zinc-500">Loading canvas…</p>
    </div>
  ),
})

import { StageSidebar, useStageNavigation } from "@/pipeline"
import { useRunStatus } from "@/pipeline/hooks/useRunStatus"
import { ReactFlowProvider } from "@xyflow/react"
import DevPanel from "@/pipeline/DevPanel"

export default function PipelinePage() {
  const params = useParams<{ runId: string }>()
  const runId = params?.runId ?? ""

  const { runData, loading, error, refresh } = useRunStatus(runId)
  const { currentStage, stageStates, goToStage, markAdvanced } = useStageNavigation(runData)

  // Compute next stage advance callback
  const stageOrder = ["brief", "territories", "visual_dna", "references", "deck", "gates"]
  const currentIdx = stageOrder.indexOf(currentStage)
  const nextStage = currentIdx >= 0 && currentIdx < stageOrder.length - 1 ? stageOrder[currentIdx + 1] : null
  const handleAdvance = useCallback(() => {
    markAdvanced(currentStage)
    if (nextStage) goToStage(nextStage)
  }, [currentStage, nextStage, markAdvanced, goToStage])

  if (!runId) {
    return (
      <main className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="text-center space-y-4">
          <p className="text-zinc-400">No run ID provided.</p>
          <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
            ← Back to brief input
          </Link>
        </div>
      </main>
    )
  }

  return (
    <ReactFlowProvider>
      <main className="flex h-screen bg-zinc-950 overflow-hidden">
        <StageSidebar
          stages={stageStates}
          runId={runId}
          onStageClick={goToStage}
        />
        <StageCanvas
          stageId={currentStage}
          runId={runId}
          runData={runData}
          loading={loading}
          error={error}
          onRefresh={refresh}
          onAdvance={handleAdvance}
        />
        <DevPanel runId={runId} />
      </main>
    </ReactFlowProvider>
  )
}
