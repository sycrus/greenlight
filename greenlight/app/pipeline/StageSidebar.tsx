"use client"

import Link from "next/link"
import type { StageState, StageStatus } from "./hooks/useStageNavigation"

const STATUS_DOT: Record<StageStatus, { color: string; label: string }> = {
  active: { color: "bg-white ring-2 ring-white/30", label: "Current" },
  complete: { color: "bg-green-500", label: "Complete" },
  ready: { color: "bg-blue-500 animate-pulse", label: "Ready" },
  locked: { color: "bg-zinc-700", label: "Locked" },
}

interface Props {
  stages: StageState[]
  runId: string
  onStageClick: (stageId: string) => void
}

export default function StageSidebar({ stages, runId, onStageClick }: Props) {
  return (
    <aside className="flex flex-col h-full w-[200px] shrink-0 border-r border-zinc-800 bg-zinc-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Pipeline</h2>
      </div>

      {/* Stages */}
      <nav className="flex-1 py-2 space-y-0.5">
        {stages.map((stage) => {
          const dot = STATUS_DOT[stage.status]!
          const isLocked = stage.status === "locked"
          const isActive = stage.status === "active"

          return (
            <button
              key={stage.id}
              type="button"
              disabled={isLocked}
              onClick={() => onStageClick(stage.id)}
              className={`
                flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors
                ${isActive ? "bg-zinc-800/50 border-l-2 border-white -ml-px" : "border-l-2 border-transparent"}
                ${isLocked ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-zinc-900"}
              `}
            >
              <span className="flex-shrink-0 relative">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${dot.color}`} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{stage.icon}</span>
                  <span className={`text-sm truncate ${isActive ? "text-white font-medium" : isLocked ? "text-zinc-600" : "text-zinc-300"}`}>
                    {stage.label}
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-zinc-800 px-4 py-3 space-y-2">
        <p className="font-mono text-[10px] text-zinc-600 truncate" title={runId}>
          {runId.slice(0, 12)}…
        </p>
        <Link
          href="/"
          className="block text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ← New Run
        </Link>
        <Link
          href={`/run/${runId}/legacy`}
          className="block text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Legacy view
        </Link>
      </div>
    </aside>
  )
}
