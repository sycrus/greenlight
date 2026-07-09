"use client"

import { useState } from "react"
import Link from "next/link"

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

// ── Test cases ──────────────────────────────────────────────────────────────────

interface TestCase {
  label: string
  briefText: string
  brandRules: {
    palette: string
    typography: string
    logoUsage: string
    restrictedImagery: string
    competitorNames: string
  }
}

const TEST_CASES: TestCase[] = [
  {
    label: "Nike — Air Max Dn",
    briefText: `We're launching the Nike Air Max Dn to Gen Z. This is the first Air Max with Dynamic Air — four tubes that shift pressure as you move. We want a TikTok-first campaign that feels raw and real, not polished. The shoe is available in volt green and total orange colorways. Must include the visible Air unit in every shot. No competitor footwear. Target: 18–24, sneaker culture, streetwear adjacent. Key message: "Feel the Unreal." We need this in 30 seconds vertical. Go.`,
    brandRules: {
      palette: "volt green #CCFF00, total orange #FF6200, black #000000",
      typography: "Futura Bold for headlines, Helvetica Neue for body",
      logoUsage: "Nike swoosh visible in first and last 3 seconds",
      restrictedImagery: "no competitor logos, no alcohol, no political imagery",
      competitorNames: "Adidas, Puma",
    },
  },
  {
    label: "Patagonia — Worn Wear",
    briefText: `Patagonia wants to promote its Worn Wear repair and resale program. Target audience is environmentally conscious 25–40 year-olds who value sustainability over fast fashion. We need a 45-second video for Instagram and YouTube that feels authentic and documentary-style — no glossy production. Key message: "The most sustainable jacket is the one you already own." Show real repairs, real people, real stories. No new product shots. Must include the Patagonia logo and Worn Wear patch. Tone: honest, warm, activist-lite.`,
    brandRules: {
      palette: "earth tones #8B7355, #D4C5B2, #4A7C59, navy #1B2A3D",
      typography: "Belwe Bold for headlines",
      logoUsage: "Patagonia logo on repair station signage, Worn Wear patch on garments",
      restrictedImagery: "no new products, no fast fashion brands, no models — real people only",
      competitorNames: "The North Face, Arc'teryx, Columbia",
    },
  },
  {
    label: "Oatly — Post Milk Generation",
    briefText: `Launch Oatly's new Barista Edition oat milk in Singapore. Target: 22–35 urban professionals who go to specialty coffee shops. 15-second vertical for TikTok and Instagram Reels. The tone is Oatly's signature weird-confident — self-aware, a little absurd, never corny. Key message: "It's just oat milk. But better. Way better." Show the carton in a real café setting, barista pouring latte art, customer reaction. No dairy comparisons — we're post-milk, not anti-milk. Must include the Oatly logo and the phrase "Post Milk Generation."`,
    brandRules: {
      palette: "Oatly blue #005BAA, cream #FFF8E7, black #1A1A1A",
      typography: "Oatly定制字体 (custom Oatly sans-serif), all lowercase preferred",
      logoUsage: "Oatly logo on carton, no isolated logo placements",
      restrictedImagery: "no dairy products, no cows, no traditional milk packaging",
      competitorNames: "Alpro, Minor Figures, Califia Farms",
    },
  },
]

// ── Page ────────────────────────────────────────────────────────────────────────

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

  function loadTestCase(tc: TestCase) {
    setBrief(tc.briefText)
    setBrandRules(tc.brandRules)
    setResult(null)
    setError(null)
  }

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
      <p className="mb-4 text-zinc-400">
        Pre-production intelligence agent. Paste a creative brief below.
      </p>

      {/* Test case quick-fill buttons */}
      <details className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/30">
        <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-zinc-500 hover:text-zinc-400">
          Test Cases — click to populate form
        </summary>
        <div className="border-t border-zinc-800 px-4 py-3 flex flex-wrap gap-2">
          {TEST_CASES.map((tc) => (
            <button
              key={tc.label}
              type="button"
              onClick={() => loadTestCase(tc)}
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors"
            >
              {tc.label}
            </button>
          ))}
        </div>
      </details>

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
            Run ID:{" "}
            <Link
              href={`/run/${result.runId}`}
              className="text-blue-400 hover:text-blue-300 underline"
            >
              {result.runId}
            </Link>{" "}
            &middot; Confidence:{" "}
            {(result.parsed_brief.confidence_score * 100).toFixed(0)}%
          </p>
          <Link
            href={`/run/${result.runId}`}
            className="mt-3 inline-block rounded-lg bg-zinc-100 px-5 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 transition-colors"
          >
            View Pipeline →
          </Link>
        </div>
      )}
    </main>
  )
}
