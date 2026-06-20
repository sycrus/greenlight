import { writeFileSync, readFileSync, mkdirSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import type { Slide } from "@gen-ux/design-system"

export interface DeckEntry {
  id: string
  title: string
  slides: Slide[]
}

const dir = join(tmpdir(), "gen-ux-decks")
mkdirSync(dir, { recursive: true })

export function saveDeck(title: string, slides: Slide[]): string {
  const id = Math.random().toString(36).slice(2, 10)
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, title, slides }))
  return id
}

export function getDeck(id: string): DeckEntry | undefined {
  try {
    return JSON.parse(readFileSync(join(dir, `${id}.json`), "utf-8")) as DeckEntry
  } catch {
    return undefined
  }
}
