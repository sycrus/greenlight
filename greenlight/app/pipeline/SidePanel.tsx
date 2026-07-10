/**
 * SidePanel — slide-out drawer for editing/viewing pipeline nodes.
 * Renders different content based on the selected node type.
 */

"use client"

import { useEffect, useCallback } from "react"
import PanelContent from "./PanelContent"
import type { CanvasNodeData } from "./types"

interface SidePanelProps {
  nodeId: string
  nodeData: CanvasNodeData
  runId: string
  onClose: () => void
  onRefresh: () => void
  onAdvance?: () => void
}

export default function SidePanel({ nodeId, nodeData, runId, onClose, onRefresh, onAdvance }: SidePanelProps) {
  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    },
    [onClose]
  )

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="fixed inset-y-0 right-0 z-50 w-[480px] bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col"
        style={{ animation: "slideIn 0.2s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">{nodeData.icon}</span>
            <span className="text-sm font-medium text-zinc-200">{nodeData.label}</span>
            {nodeData.generationCount > 1 && (
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                v{nodeData.generationCount}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          <PanelContent
            nodeId={nodeId}
            nodeData={nodeData}
            runId={runId}
            onRefresh={onRefresh}
            {...(onAdvance !== undefined && { onAdvance })}
          />
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  )
}
