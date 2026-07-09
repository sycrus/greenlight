"use client"

/**
 * ECD Approval Form — Gate 1
 *
 * Accessible from the approval slide link in the ECD deck.
 * POSTs to /api/gates/ecd and writes the gate record to Firestore.
 */

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"

interface TerritoryOption {
  id: string
  name: string
}

export default function EcdApprovalPage() {
  const params = useParams<{ runId: string }>()
  const runId = params?.runId ?? ""

  const [territories, setTerritories] = useState<TerritoryOption[]>([])
  const [territorySelected, setTerritorySelected] = useState("")
  const [approvalStatus, setApprovalStatus] = useState("APPROVED")
  const [notes, setNotes] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)

  // Fetch territories for radio options
  useEffect(() => {
    if (!runId) return
    async function load() {
      try {
        const res = await fetch(`/api/run/${runId}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Failed to load run")
        const territoriesData = data.stages?.territory_generation?.territories ?? []
        setTerritories(
          territoriesData.map((t: Record<string, unknown>) => ({
            id: t["id"] as string,
            name: t["name"] as string,
          }))
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load run data")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [runId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch("/api/gates/ecd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          territorySelected,
          approvalStatus,
          notes: notes.trim() || null,
          name,
          email,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? data.details?.join(", ") ?? "Unknown error")
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed")
    } finally {
      setSubmitting(false)
    }
  }

  const showNotes = approvalStatus === "REVISIONS_REQUIRED"

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 rounded bg-zinc-800" />
          <div className="h-40 rounded-lg bg-zinc-800" />
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link
        href={`/run/${runId}`}
        className="mb-4 inline-block text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        ← Back to pipeline status
      </Link>

      <h1 className="mb-2 text-2xl font-semibold tracking-tight">ECD Approval</h1>
      <p className="mb-8 text-sm text-zinc-400">
        Gate 1 — Review the pre-production deck and select your preferred creative territory.
      </p>

      {error && (
        <div className="mb-6 rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {result ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-green-800 bg-green-950/30 px-4 py-3">
            <p className="text-sm font-medium text-green-400">
              Approval submitted successfully
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-sm text-zinc-300">
              Status: <span className="font-medium">{String(result.status)}</span>
            </p>
            {(result.nextGate as string | undefined) && (
              <p className="mt-2 text-sm text-zinc-300">
                Next:{" "}
                <Link
                  href={`/run/${runId}/approve/client`}
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Client Approval Form
                </Link>
              </p>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Territory selection */}
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-300">
              Preferred Territory
            </label>
            <div className="space-y-2">
              {territories.map((t) => (
                <label
                  key={t.id}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                    territorySelected === t.id
                      ? "border-zinc-400 bg-zinc-800/50"
                      : "border-zinc-700 bg-zinc-900/50 hover:border-zinc-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="territory"
                    value={t.id}
                    checked={territorySelected === t.id}
                    onChange={(e) => setTerritorySelected(e.target.value)}
                    className="text-zinc-100"
                    required
                  />
                  <span className="text-sm text-zinc-200">{t.name}</span>
                  <span className="text-xs text-zinc-500">{t.id}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Approval status */}
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-300">
              Approval Status
            </label>
            <div className="space-y-2">
              {[
                { value: "APPROVED", label: "Approved — proceed to client" },
                { value: "APPROVED_WITH_REVISIONS", label: "Approved with minor revisions" },
                { value: "REVISIONS_REQUIRED", label: "Revisions required — do not proceed" },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                    approvalStatus === opt.value
                      ? "border-zinc-400 bg-zinc-800/50"
                      : "border-zinc-700 bg-zinc-900/50 hover:border-zinc-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="status"
                    value={opt.value}
                    checked={approvalStatus === opt.value}
                    onChange={(e) => setApprovalStatus(e.target.value)}
                    className="text-zinc-100"
                    required
                  />
                  <span className="text-sm text-zinc-200">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Notes (conditional) */}
          {showNotes && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">
                Revision Notes <span className="text-red-400">*</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
                placeholder="Describe what needs to be revised…"
                required={showNotes}
              />
            </div>
          )}

          {/* Name + Email */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">
                Your Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
                placeholder="Jane Doe"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">
                Your Email <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
                placeholder="jane@agency.com"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !territorySelected}
            className="rounded-lg bg-zinc-100 px-6 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Submitting…" : "Submit Approval"}
          </button>
        </form>
      )}
    </main>
  )
}
