import { getDeck } from "@/lib/deck-store"
import { DeckView } from "./DeckView"

export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const deck = getDeck(id)

  if (!deck) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          backgroundColor: "#122d38",
          color: "white",
          fontFamily: "var(--font-poppins, Poppins, sans-serif)",
          fontSize: 18,
        }}
      >
        Deck not found or session expired.
      </div>
    )
  }

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"}/deck/${id}`

  return <DeckView title={deck.title} slides={deck.slides} shareUrl={shareUrl} />
}
