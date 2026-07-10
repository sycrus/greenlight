"use client"
import { useState, useEffect } from "react"
import type { CanvasNodeData } from "../types"

interface TestCase { label: string; briefText: string; brandRules: Record<string, string> }

const TEST_CASES: TestCase[] = [
  { label: "Nike — Air Max Dn", briefText: `We're launching the Nike Air Max Dn to Gen Z. This is the first Air Max with Dynamic Air — four tubes that shift pressure as you move. We want a TikTok-first campaign that feels raw and real, not polished. The shoe is available in volt green and total orange colorways. Must include the visible Air unit in every shot. No competitor footwear. Target: 18–24, sneaker culture, streetwear adjacent. Key message: "Feel the Unreal." We need this in 30 seconds vertical. Go.`, brandRules: { palette: "volt green #CCFF00, total orange #FF6200, black #000000", typography: "Futura Bold for headlines", logoUsage: "Nike swoosh visible in first and last 3 seconds", restrictedImagery: "no competitor logos, no alcohol, no political imagery", competitorNames: "Adidas, Puma" } },
  { label: "Patagonia — Worn Wear", briefText: `Patagonia wants to promote its Worn Wear repair and resale program. Target audience is environmentally conscious 25–40 year-olds who value sustainability over fast fashion. We need a 45-second video for Instagram and YouTube that feels authentic and documentary-style — no glossy production. Key message: "The most sustainable jacket is the one you already own." Show real repairs, real people, real stories. No new product shots. Must include the Patagonia logo and Worn Wear patch. Tone: honest, warm, activist-lite.`, brandRules: { palette: "earth tones #8B7355, #D4C5B2, #4A7C59, navy #1B2A3D", typography: "Belwe Bold for headlines", logoUsage: "Patagonia logo on repair station signage", restrictedImagery: "no new products, no fast fashion brands, no models — real people only", competitorNames: "The North Face, Arc'teryx, Columbia" } },
  { label: "Oatly — Post Milk Generation", briefText: `Launch Oatly's new Barista Edition oat milk in Singapore. Target: 22–35 urban professionals who go to specialty coffee shops. 15-second vertical for TikTok and Instagram Reels. The tone is Oatly's signature weird-confident — self-aware, a little absurd, never corny. Key message: "It's just oat milk. But better. Way better." Show the carton in a real café setting, barista pouring latte art, customer reaction. No dairy comparisons — we're post-milk, not anti-milk. Must include the Oatly logo and the phrase "Post Milk Generation."`, brandRules: { palette: "Oatly blue #005BAA, cream #FFF8E7, black #1A1A1A", typography: "Oatly custom sans-serif, all lowercase preferred", logoUsage: "Oatly logo on carton, no isolated logo placements", restrictedImagery: "no dairy products, no cows, no traditional milk packaging", competitorNames: "Alpro, Minor Figures, Califia Farms" } },
]

interface Props { runId: string; nodeData: CanvasNodeData; onRefresh: () => void; error: string | null; setError: (e: string | null) => void }

export default function BriefEditPanel({ runId, nodeData, onRefresh, error, setError }: Props) {
  const rawBrief = (nodeData.stageData?.["_rawBrief"] as string) ?? ""
  const [text, setText] = useState(rawBrief)
  const [reparsing, setReparsing] = useState(false)
  const [brandRules, setBrandRules] = useState<Record<string, string>>((nodeData.stageData?.["_brandRules"] as Record<string, string>) ?? {})

  useEffect(() => { if (rawBrief && !text) setText(rawBrief) }, [rawBrief, text])

  function loadTestCase(tc: TestCase) {
    setText(tc.briefText)
    setBrandRules(tc.brandRules)
    setError(null)
  }

  async function handleReparse() {
    if (reparsing) return; setReparsing(true)
    setError(null)
    try {
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: text, brandRules, runId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Re-parse failed")
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-parse failed")
    } finally {
      setReparsing(false)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-zinc-300">Edit Brief</h3>

      {/* Test cases */}
      <div>
        <p className="text-[10px] font-medium text-zinc-500 mb-1.5 uppercase tracking-wider">Quick Fill</p>
        <div className="flex flex-wrap gap-1.5">
          {TEST_CASES.map(tc => (
            <button key={tc.label} onClick={() => loadTestCase(tc)}
              className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors">
              {tc.label}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none font-mono"
      />
      <button
        type="button"
        onClick={handleReparse}
        disabled={reparsing || !text.trim()}
        className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-40 transition-colors"
      >
        {reparsing ? "Re-parsing…" : "Re-parse Brief"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
