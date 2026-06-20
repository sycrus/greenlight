import { NextRequest, NextResponse } from "next/server"
import { saveDeck } from "@/lib/deck-store"
import type { Slide } from "@gen-ux/design-system"

export async function POST(req: NextRequest) {
  const { title, slides } = (await req.json()) as { title: string; slides: Slide[] }
  const id = saveDeck(title, slides)
  return NextResponse.json({ id })
}
