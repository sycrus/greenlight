/**
 * Home page — pipeline canvas entry point.
 * Shows Brief Input node on canvas, side panel for editing.
 * After parsing, redirects to /run/[runId] for the full pipeline.
 */

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import {
  ReactFlow, Background, Controls,
  type Node, type NodeTypes,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import PipelineNode from "@/pipeline/nodes/PipelineNode"
import DevPanel from "@/pipeline/DevPanel"

const nodeTypes: NodeTypes = { pipelineNode: PipelineNode }

// ── Test cases ──────────────────────────────────────────────────────────────

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

// ── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar() {
  const stages = [
    { id: "brief", label: "Brief", icon: "📝", active: true },
    { id: "territories", label: "Territories", icon: "🎨", active: false },
    { id: "visual_dna", label: "Visual DNA", icon: "🧬", active: false },
    { id: "references", label: "References", icon: "🖼", active: false },
    { id: "deck", label: "Deck", icon: "📦", active: false },
    { id: "gates", label: "Gates & Release", icon: "🚀", active: false },
  ]

  return (
    <aside className="flex flex-col h-full w-[200px] shrink-0 border-r border-zinc-800 bg-zinc-950">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Pipeline</h2>
      </div>
      <nav className="flex-1 py-2 space-y-0.5">
        {stages.map((s) => (
          <div
            key={s.id}
            className={`flex items-center gap-3 px-4 py-2.5 text-left border-l-2 ${
              s.active ? "bg-zinc-800/50 border-white -ml-px" : "border-transparent opacity-30 cursor-not-allowed"
            }`}
          >
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${s.active ? "bg-white ring-2 ring-white/30" : "bg-zinc-700"}`} />
            <span className="text-sm">{s.icon}</span>
            <span className={`text-sm ${s.active ? "text-white font-medium" : "text-zinc-600"}`}>{s.label}</span>
          </div>
        ))}
      </nav>
    </aside>
  )
}

// ── Brief Edit Panel ────────────────────────────────────────────────────────

function BriefPanel({ onParsed }: { onParsed: (runId: string) => void }) {
  const [brief, setBrief] = useState("")
  const [brandRules, setBrandRules] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRules, setShowRules] = useState(false)

  function loadTestCase(tc: TestCase) {
    setBrief(tc.briefText)
    setBrandRules(tc.brandRules)
    setError(null)
  }

  async function handleParse() {
    if (!brief.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, brandRules }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Unknown error")
      onParsed(data.runId as string)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse brief")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-[480px] shrink-0 border-l border-zinc-800 bg-zinc-950 overflow-y-auto">
      <div className="p-4 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-200">Brief Input</h2>

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

        {/* Brief textarea */}
        <div>
          <label className="text-xs font-medium text-zinc-400">Creative Brief</label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={10}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none font-mono"
            placeholder="Paste the client brief here…"
          />
        </div>

        {/* Brand rules toggle */}
        <div>
          <button onClick={() => setShowRules(!showRules)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            {showRules ? "▼" : "▶"} Brand Rules (optional)
          </button>
          {showRules && (
            <div className="mt-2 space-y-2">
              {(["palette", "typography", "logoUsage", "restrictedImagery", "competitorNames"] as const).map((key) => (
                <div key={key}>
                  <label className="text-[10px] text-zinc-500 capitalize">{key.replace(/([A-Z])/g, " $1")}</label>
                  <input type="text" value={brandRules[key] ?? ""}
                    onChange={(e) => setBrandRules(prev => ({ ...prev, [key]: e.target.value }))}
                    className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-200 focus:border-zinc-500 focus:outline-none" />
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <div className="rounded border border-red-800 bg-red-950/30 px-3 py-2 text-xs text-red-400">{error}</div>}

        <button onClick={handleParse} disabled={loading || !brief.trim()}
          className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-40 transition-colors">
          {loading ? "Parsing…" : "Parse Brief"}
        </button>
      </div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

const briefNode: Node = {
  id: "brief_input",
  type: "pipelineNode",
  position: { x: 200, y: 200 },
  data: { type: "brief_input", label: "Brief Input", icon: "📝", status: "ready", stageData: null, gateData: null, generationCount: 0, isStale: false, runId: "" } as unknown as Record<string, unknown>,
}

export default function HomePage() {
  const router = useRouter()

  function handleParsed(runId: string) {
    router.push(`/run/${runId}`)
  }

  return (
    <main className="flex h-screen bg-zinc-950 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex">
        <div className="flex-1">
          <ReactFlow
            nodes={[briefNode]}
            edges={[]}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.3} maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
            defaultViewport={{ x: 0, y: 0, zoom: 0.9 }}
            nodesDraggable={false}
          >
            <Background color="#18181b" gap={20} />
            <Controls className="[&>button]:!bg-zinc-900 [&>button]:!border-zinc-700 [&>button]:!text-zinc-400" position="bottom-left" />
          </ReactFlow>
        </div>
        <BriefPanel onParsed={handleParsed} />
      </div>
      <DevPanel runId="" />
    </main>
  )
}
