"use client"
import Link from "next/link"
import type { CanvasNodeData } from "../types"

interface Props { runId: string; nodeData: CanvasNodeData; onRefresh: () => void; error: string | null; setError: (e: string | null) => void }

export default function FlowReleasePanel({ runId }: Props) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-green-800 bg-green-950/30 px-3 py-2">
        <p className="text-sm font-medium text-green-400">🚀 Pipeline Complete</p>
      </div>
      <p className="text-sm text-zinc-400">
        The creative package has been approved and the Flow package is ready for production.
      </p>
      <div className="flex flex-col gap-2">
        <Link href={`/run/${runId}/deck?variant=ecd`} target="_blank"
          className="rounded bg-zinc-800 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors text-center">
          📋 View ECD Deck
        </Link>
        <Link href={`/run/${runId}/deck?variant=client`} target="_blank"
          className="rounded bg-zinc-800 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors text-center">
          👁 View Client Deck
        </Link>
        <Link href={`/run/${runId}`}
          className="rounded bg-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-600 transition-colors text-center">
          🔄 Start New Run
        </Link>
      </div>
    </div>
  )
}
