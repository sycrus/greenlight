"use client"

import { useState, useEffect, useCallback } from "react"

// ── Test cases (shared with home page) ──────────────────────────────────────

interface TestCase {
  label: string
  briefText: string
  brandRules: Record<string, string>
}

const TEST_CASES: TestCase[] = [
  {
    label: "Nike — Air Max Dn",
    briefText: `We're launching the Nike Air Max Dn to Gen Z. This is the first Air Max with Dynamic Air — four tubes that shift pressure as you move. We want a TikTok-first campaign that feels raw and real, not polished. The shoe is available in volt green and total orange colorways. Must include the visible Air unit in every shot. No competitor footwear. Target: 18–24, sneaker culture, streetwear adjacent. Key message: "Feel the Unreal." We need this in 30 seconds vertical. Go.`,
    brandRules: { palette: "volt green #CCFF00, total orange #FF6200, black #000000", typography: "Futura Bold for headlines", logoUsage: "Nike swoosh visible in first and last 3 seconds", restrictedImagery: "no competitor logos, no alcohol, no political imagery", competitorNames: "Adidas, Puma" },
  },
  {
    label: "Patagonia — Worn Wear",
    briefText: `Patagonia wants to promote its Worn Wear repair and resale program. Target audience is environmentally conscious 25–40 year-olds who value sustainability over fast fashion. We need a 45-second video for Instagram and YouTube that feels authentic and documentary-style — no glossy production. Key message: "The most sustainable jacket is the one you already own." Show real repairs, real people, real stories. No new product shots. Must include the Patagonia logo and Worn Wear patch. Tone: honest, warm, activist-lite.`,
    brandRules: { palette: "earth tones #8B7355, #D4C5B2, #4A7C59, navy #1B2A3D", typography: "Belwe Bold for headlines", logoUsage: "Patagonia logo on repair station signage", restrictedImagery: "no new products, no fast fashion brands, no models — real people only", competitorNames: "The North Face, Arc'teryx, Columbia" },
  },
  {
    label: "Oatly — Post Milk Generation",
    briefText: `Launch Oatly's new Barista Edition oat milk in Singapore. Target: 22–35 urban professionals who go to specialty coffee shops. 15-second vertical for TikTok and Instagram Reels. The tone is Oatly's signature weird-confident — self-aware, a little absurd, never corny. Key message: "It's just oat milk. But better. Way better." Show the carton in a real café setting, barista pouring latte art, customer reaction. No dairy comparisons — we're post-milk, not anti-milk. Must include the Oatly logo and the phrase "Post Milk Generation."`,
    brandRules: { palette: "Oatly blue #005BAA, cream #FFF8E7, black #1A1A1A", typography: "Oatly custom sans-serif, all lowercase preferred", logoUsage: "Oatly logo on carton, no isolated logo placements", restrictedImagery: "no dairy products, no cows, no traditional milk packaging", competitorNames: "Alpro, Minor Figures, Califia Farms" },
  },
]

// ── Component ───────────────────────────────────────────────────────────────

interface Props { runId: string; onNewRun?: (runId: string) => void }

export default function DevPanel({ runId, onNewRun }: Props) {
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState<string | null>(null)
  const [runHistory, setRunHistory] = useState<string[]>(() => {
    if (typeof window === "undefined") return []
    try { return JSON.parse(localStorage.getItem("gl_dev_runs") ?? "[]") } catch { return [] }
  })

  // Toggle with ` (backtick)
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "`" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setOpen(prev => !prev)
    }
  }, [])

  useEffect(() => {
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [handleKey])

  async function runTestCase(tc: TestCase) {
    setRunning(tc.label)
    try {
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: tc.briefText, brandRules: tc.brandRules }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Unknown error")
      const newRunId = data.runId as string
      // Save to history
      const updated = [newRunId, ...runHistory.filter(r => r !== newRunId)].slice(0, 10)
      setRunHistory(updated)
      localStorage.setItem("gl_dev_runs", JSON.stringify(updated))
      // Navigate
      window.location.href = `/run/${newRunId}`
    } catch (e) {
      console.error("Test case failed:", e)
    } finally {
      setRunning(null)
    }
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 right-4 z-50 rounded-full bg-zinc-800 border border-zinc-700 w-8 h-8 flex items-center justify-center text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors shadow-lg"
        title="Dev Mode (`)"
      >
        {open ? "✕" : "⚙"}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-14 right-4 z-50 w-80 rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-800/50">
            <span className="text-xs font-medium text-zinc-400">Dev Mode</span>
            <span className="text-[10px] text-zinc-600">press ` to toggle</span>
          </div>

          <div className="p-3 space-y-3 max-h-[60vh] overflow-y-auto">
            {/* Current run */}
            <div>
              <p className="text-[10px] font-medium text-zinc-500 mb-1">CURRENT RUN</p>
              <code className="block text-[11px] text-zinc-400 bg-zinc-800 rounded px-2 py-1 truncate">{runId}</code>
            </div>

            {/* Test cases */}
            <div>
              <p className="text-[10px] font-medium text-zinc-500 mb-1.5">TEST CASES</p>
              <div className="space-y-1">
                {TEST_CASES.map(tc => (
                  <button
                    key={tc.label}
                    onClick={() => runTestCase(tc)}
                    disabled={running !== null}
                    className="w-full text-left rounded border border-zinc-700 bg-zinc-800/50 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800 transition-colors disabled:opacity-40"
                  >
                    {running === tc.label ? "⏳ Running…" : tc.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Run history */}
            {runHistory.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-zinc-500 mb-1">RECENT RUNS</p>
                <div className="space-y-1">
                  {runHistory.map(r => (
                    <a
                      key={r}
                      href={`/run/${r}`}
                      className={`block rounded border px-2.5 py-1 text-[11px] font-mono transition-colors ${r === runId ? "border-zinc-600 bg-zinc-800 text-zinc-300" : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"}`}
                    >
                      {r.slice(0, 30)}…
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
