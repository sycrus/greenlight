"use client"

import { useState } from "react"

interface BriefResult {
  parsed_brief: {
    brand: string
    campaign_objective: string
    target_audience: { primary: string; secondary: string | null }
    key_message: string
    mandatory_elements: string[]
    tone_descriptors: string[]
    format: {
      duration_seconds: number
      aspect_ratio: string
      platform: string
    }
    brief_gaps: string[]
    confidence_score: number
  }
  runId: string
}

export default function HomePage() {
  const [brief, setBrief] = useState("")
  const [brandRules, setBrandRules] = useState({
    palette: "",
    typography: "",
    logoUsage: "",
    restrictedImagery: "",
    competitorNames: "",
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BriefResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, brandRules }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Unknown error")
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse brief")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Greenlight</h1>
      <p className="mb-8 text-zinc-400">
        Pre-production intelligence agent. Paste a creative brief below.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-300">
            Creative Brief
          </label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
            placeholder="Paste the client brief here…"
            required
          />
        </div>

        <details className="rounded-lg border border-zinc-800 bg-zinc-900/50">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-400">
            Brand Rules (optional)
          </summary>
          <div className="space-y-4 px-4 pb-4">
            {([
              ["palette", "Palette (hex values, comma-separated)"],
              ["typography", "Typography"],
              ["logoUsage", "Logo usage rules"],
              ["restrictedImagery", "Restricted imagery"],
              ["competitorNames", "Competitor names"],
            ] as const).map(([key, label]) => (
              <div key={key}>
                <label className="mb-1 block text-xs text-zinc-500">{label}</label>
                <input
                  type="text"
                  value={brandRules[key as keyof typeof brandRules]}
                  onChange={(e) =>
                    setBrandRules((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                />
              </div>
            ))}
          </div>
        </details>

        <button
          type="submit"
          disabled={loading || !brief.trim()}
          className="rounded-lg bg-zinc-100 px-6 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Parsing…" : "Parse Brief"}
        </button>
      </form>

      {error && (
        <div className="mt-8 rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-8 space-y-4">
          <h2 className="text-lg font-semibold">Parsed Brief</h2>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <pre className="text-xs text-zinc-300 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(result.parsed_brief, null, 2)}
            </pre>
          </div>
          {result.parsed_brief.brief_gaps.length > 0 && (
            <div className="rounded-lg border border-amber-800 bg-amber-950/30 px-4 py-3">
              <p className="text-sm font-medium text-amber-400">Brief Gaps</p>
              <ul className="mt-1 list-inside list-disc text-xs text-amber-300">
                {result.parsed_brief.brief_gaps.map((gap, i) => (
                  <li key={i}>{gap}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-zinc-500">
            Run ID: {result.runId} &middot; Confidence:{" "}
            {(result.parsed_brief.confidence_score * 100).toFixed(0)}%
          </p>
        </div>
      )}
    </main>
  )
}
