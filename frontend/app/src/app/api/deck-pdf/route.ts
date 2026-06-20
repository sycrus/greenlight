/**
 * POST /api/deck-pdf
 *
 * Accepts { title, slides } and returns a PDF blob.
 * Runs server-side (Node.js) where @react-pdf/renderer works without
 * browser bundling issues.
 *
 * Before rendering, pre-fetches the og:image for every case study URL and
 * converts each to a base64 data URI so react-pdf can embed them inline.
 * Failures are swallowed — slides without a fetchable image fall back to
 * the text-only card layout.
 */

import { type NextRequest } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"
import { readFileSync } from "fs"
import { join } from "path"
import { SlideDeckDocument } from "@/components/chat/SlideDeckPDF"
import type { Slide } from "@gen-ux/design-system"

export const runtime = "nodejs"

// Pre-load the hero shapes asset once at module init — it's a static file.
let coverImageDataUri: string | undefined
try {
  const buf = readFileSync(join(process.cwd(), "public/brand/endava-Image.png"))
  coverImageDataUri = `data:image/png;base64,${buf.toString("base64")}`
} catch { /* silently omit cover image if asset is missing */ }

async function fetchOgImageDataUri(pageUrl: string): Promise<string | null> {
  try {
    // Fetch page HTML and extract og:image URL
    const pageRes = await fetch(pageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; link-preview-bot/1.0)" },
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
    })
    if (!pageRes.ok) return null

    const html = await pageRes.text()
    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)

    const rawImageUrl = match?.[1]
    if (!rawImageUrl) return null

    const imageUrl = rawImageUrl.startsWith("http")
      ? rawImageUrl
      : new URL(rawImageUrl, pageUrl).href

    // Fetch the image itself and convert to base64 data URI
    const imgRes = await fetch(imageUrl, {
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    })
    if (!imgRes.ok) return null

    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg"
    // react-pdf supports JPEG and PNG — skip unsupported formats
    if (!contentType.startsWith("image/jpeg") && !contentType.startsWith("image/png")) {
      return null
    }

    const arrayBuffer = await imgRes.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString("base64")
    return `data:${contentType};base64,${base64}`
  } catch {
    return null
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const { title, slides } = await req.json() as { title?: string; slides?: Slide[] }

  if (!title || !slides?.length) {
    return new Response(JSON.stringify({ error: "title and slides are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Collect all unique case study URLs across slides
  const caseStudyUrls = [
    ...new Set(
      slides.flatMap((s) => (s.caseStudy?.url ? [s.caseStudy.url] : []))
    ),
  ]

  // Fetch all OG images concurrently
  const imageEntries = await Promise.all(
    caseStudyUrls.map(async (url) => [url, await fetchOgImageDataUri(url)] as const)
  )
  const ogImages = Object.fromEntries(
    imageEntries.filter(([, dataUri]) => dataUri !== null)
  ) as Record<string, string>

  const buffer = await renderToBuffer(
    createElement(SlideDeckDocument, { title, slides, ogImages, coverImageDataUri })
  )

  const filename = `${title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf`

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
