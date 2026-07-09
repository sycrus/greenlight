"use client"

/**
 * Client Approval Form — Gate 2
 *
 * Accessible from the approval slide link in the client deck.
 * POSTs to /api/gates/client and triggers Flow package release on approval.
 */

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"

interface TerritoryOption {
  id: string
  name: string
}

export default function ClientApprovalPage() {
  const params = useParams<{ runId: string }>()
  const runId = params?.runId ?? ""

  const [territories, setTerritories] = useState<TerritoryOption[]>([])
  const [territorySelected, setTerritorySelected] = useState("")
  const [approvalStatus, setApprovalStatus] = useState("APPROVED")
  const [notes, setNotes] = useState("")
  const [name, setName] = useState("")
  const [title, setTitle] = useState("")
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [gateBlocked, setGateBlocked] = useState(false)

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

        // Check if Gate 1 is passed
        const ecdGate = data.gates?.ecd_approval
        if (!ecdGate) {
          setGateBlocked(true)
        } else if (
          ecdGate.approvalStatus !== "APPROVED" &&
          ecdGate.approvalStatus !== "APPROVED_WITH_REVISIONS"
        ) {
          setGateBlocked(true)
        }
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
      const res = await fetch("/api/gates/client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          territorySelected,
          approvalStatus,
          notes: notes.trim() || null,
          name,
          title,
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

  if (gateBlocked) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <Link
          href={`/run/${runId}`}
          className="mb-4 inline-block text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          ← Back to pipeline status
        </Link>

        <div className="rounded-lg border border-amber-800 bg-amber-950/30 px-4 py-3">
          <p className="text-sm font-medium text-amber-400">Gate Locked</p>
          <p className="mt-1 text-sm text-amber-300">
            ECD approval (Gate 1) must be completed before client approval can proceed.
          </p>
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

      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Client Approval</h1>
      <p className="mb-8 text-sm text-zinc-400">
        Gate 2 — Review the creative direction and sign off before production begins.
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
              {result.pipelineComplete
                ? "Pipeline complete — Flow package released!"
                : "Approval submitted"}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-2">
            <p className="text-sm text-zinc-300">
              Status: <span className="font-medium">{String(result.status)}</span>
            </p>
            {(result.flowPackageUrl as string | undefined) && (
              <div className="mt-3 rounded-lg border border-green-800 bg-green-950/30 px-4 py-3">
                <p className="text-sm font-medium text-green-400">🚀 Flow Package Ready</p>
                <a
                  href={result.flowPackageUrl as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block rounded bg-zinc-800 px-4 py-2 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors"
                >
                  Download Flow Package
                </a>
                <p className="mt-2 text-xs text-zinc-500">
                  Signed URL — expires in 48 hours
                </p>
              </div>
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
                { value: "APPROVED", label: "Approved — proceed to production" },
                { value: "APPROVED_WITH_NOTES", label: "Approved with minor notes" },
                { value: "REVISIONS_REQUIRED", label: "Revisions required" },
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

          {/* Name + Title + Email */}
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
                placeholder="John Smith"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">
                Your Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
                placeholder="Brand Director"
                required
              />
            </div>
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
              placeholder="john@brand.com"
              required
            />
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
