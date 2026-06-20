/**
 * Fetches the og:image URL from a given page and redirects to it.
 * Used by CaseStudyCard to show link previews without a third-party service.
 *
 * GET /api/og-image?url=https://...
 *   → 302 redirect to the og:image URL found in the page head
 *   → 404 if no og:image found
 */

import { type NextRequest } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<Response> {
  const url = req.nextUrl.searchParams.get("url")

  if (!url) {
    return new Response("Missing url param", { status: 400 })
  }

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; link-preview-bot/1.0)" },
      signal: AbortSignal.timeout(6000),
    })

    if (!res.ok) {
      return new Response("Upstream fetch failed", { status: 404 })
    }

    const html = await res.text()

    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)

    const imageUrl = match?.[1]

    if (!imageUrl) {
      return new Response("No og:image found", { status: 404 })
    }

    // Resolve relative URLs
    const absolute = imageUrl.startsWith("http") ? imageUrl : new URL(imageUrl, url).href

    return Response.redirect(absolute, 302)
  } catch {
    return new Response("Failed to fetch preview", { status: 500 })
  }
}
