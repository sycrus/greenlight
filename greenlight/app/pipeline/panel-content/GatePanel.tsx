"use client"
import { useState } from "react"
import type { CanvasNodeData } from "../types"

interface Props { runId: string; nodeData: CanvasNodeData; onRefresh: () => void; onAdvance?: () => void; error: string | null; setError: (e: string | null) => void; gate: "ecd" | "client" }

export default function GatePanel({ runId, nodeData, onRefresh, onAdvance, error, setError, gate }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [territorySelected, setTerritorySelected] = useState("")
  const [approvalStatus, setApprovalStatus] = useState("APPROVED")
  const [notes, setNotes] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [title, setTitle] = useState("")

  const isEcd = gate === "ecd"
  const submitted = nodeData.gateData != null
  const gateData = nodeData.gateData

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return; setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/gates/${gate}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          territorySelected,
          approvalStatus,
          notes: notes.trim() || null,
          name,
          email,
          ...(isEcd ? {} : { title }),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? data.details?.join(", ") ?? "Unknown error")
      setResult(data)
      onRefresh()
      onAdvance?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed")
    } finally {
      setSubmitting(false)
    }
  }

  // Show submitted gate info
  if (submitted || result) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-zinc-300">{isEcd ? "ECD" : "Client"} Approval</h3>
        <div className="rounded-lg border border-green-800 bg-green-950/30 px-3 py-2">
          <p className="text-sm font-medium text-green-400">Approval submitted</p>
        </div>
        <div className="space-y-2 text-xs text-zinc-400">
          <p>Status: <span className="text-zinc-200">{statusLabel(gateData?.["approvalStatus"] as string ?? (result?.["status"] as string))}</span></p>
          <p>Territory: <span className="text-zinc-200">{gateData?.["territorySelected"] as string ?? ""}</span></p>
          <p>Approver: <span className="text-zinc-200">{gateData?.["approverName"] as string ?? ""}</span></p>
          <p>Revision cycles: <span className="text-zinc-200">{gateData?.["revisionCycles"] as number ?? 0}</span></p>
          {((result as Record<string, unknown> | null)?.["flowPackageUrl"] as string | undefined) && (
            <a href={(result as Record<string, unknown>)["flowPackageUrl"] as string} target="_blank" rel="noopener noreferrer"
              className="mt-2 inline-block rounded bg-zinc-800 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors">
              📦 Download Flow Package
            </a>
          )}
        </div>
      </div>
    )
  }

  // Gate form
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-zinc-300">{isEcd ? "ECD" : "Client"} Approval</h3>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Territory */}
        <div>
          <label className="text-xs font-medium text-zinc-400">Territory</label>
          <select value={territorySelected} onChange={(e) => setTerritorySelected(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 focus:border-zinc-500 focus:outline-none" required>
            <option value="">Select territory…</option>
            <option value="t1">t1</option>
            <option value="t2">t2</option>
            <option value="t3">t3</option>
          </select>
        </div>

        {/* Status */}
        <div>
          <label className="text-xs font-medium text-zinc-400">Status</label>
          <div className="mt-1 space-y-1.5">
            {(isEcd
              ? [
                  { v: "APPROVED", l: "Approved" },
                  { v: "APPROVED_WITH_REVISIONS", l: "Approved with revisions" },
                  { v: "REVISIONS_REQUIRED", l: "Revisions required" },
                ] as const
              : [
                  { v: "APPROVED", l: "Approved" },
                  { v: "APPROVED_WITH_NOTES", l: "Approved with notes" },
                  { v: "REVISIONS_REQUIRED", l: "Revisions required" },
                ] as const
            ).map(({ v, l }) => (
              <label key={v} className={`flex items-center gap-2 rounded border px-3 py-1.5 cursor-pointer text-xs ${approvalStatus === v ? "border-zinc-400 bg-zinc-800/50 text-zinc-200" : "border-zinc-700 bg-zinc-900/50 text-zinc-400"}`}>
                <input type="radio" name="status" value={v} checked={approvalStatus === v} onChange={() => setApprovalStatus(v)} />
                {l}
              </label>
            ))}
          </div>
        </div>

        {/* Notes */}
        {approvalStatus === "REVISIONS_REQUIRED" && (
          <div>
            <label className="text-xs font-medium text-zinc-400">Notes <span className="text-red-400">*</span></label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 focus:border-zinc-500 focus:outline-none" required />
          </div>
        )}

        {/* Name + Email */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-zinc-400">Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 focus:border-zinc-500 focus:outline-none" required />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400">Email *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 focus:border-zinc-500 focus:outline-none" required />
          </div>
        </div>

        {/* Title (client only) */}
        {!isEcd && (
          <div>
            <label className="text-xs font-medium text-zinc-400">Title *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 focus:border-zinc-500 focus:outline-none" required />
          </div>
        )}

        <button type="submit" disabled={submitting || !territorySelected}
          className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-40 transition-colors">
          {submitting ? "Submitting…" : "Submit Approval"}
        </button>
      </form>
    </div>
  )
}

function statusLabel(s: string): string {
  switch (s) {
    case "APPROVED": return "Approved"
    case "APPROVED_WITH_REVISIONS": return "Approved w/ revisions"
    case "APPROVED_WITH_NOTES": return "Approved w/ notes"
    case "REVISIONS_REQUIRED": return "Revisions required"
    default: return s
  }
}
