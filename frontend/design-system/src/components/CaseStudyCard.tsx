import { cn } from "./utils"

export interface CaseStudyCardItem {
  url: string
  title: string
  preamble: string
}

interface CaseStudyCardProps {
  cards: CaseStudyCardItem[]
  className?: string
}

function previewImageUrl(pageUrl: string): string {
  return `/api/og-image?url=${encodeURIComponent(pageUrl)}`
}

export function CaseStudyCard({ cards, className }: CaseStudyCardProps) {
  if (cards.length === 0) return null

  return (
    <div
      className={cn(
        "grid gap-3",
        cards.length === 1 ? "grid-cols-1 max-w-xs" : "grid-cols-2",
        className
      )}
    >
      {cards.map((card) => (
        <a
          key={card.url}
          href={card.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex flex-col rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="relative h-36 bg-muted overflow-hidden shrink-0">
            <img
              src={previewImageUrl(card.url)}
              alt={card.title}
              className="w-full h-full object-cover object-top"
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).style.display = "none"
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5 p-3 flex-1">
            <p className="text-xs font-semibold text-foreground line-clamp-1 leading-snug">
              {card.title}
            </p>
            <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed flex-1">
              {card.preamble}
            </p>
            <span className="text-xs text-primary group-hover:underline mt-1">
              Read case study →
            </span>
          </div>
        </a>
      ))}
    </div>
  )
}

export function CaseStudyCardSkeleton() {
  return (
    <div className="grid gap-3 grid-cols-2">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-xl border bg-card overflow-hidden shadow-sm">
          <div className="h-36 bg-muted animate-pulse" />
          <div className="p-3 space-y-2">
            <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
            <div className="h-3 w-full rounded bg-muted animate-pulse" />
            <div className="h-3 w-4/5 rounded bg-muted animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
            <div className="h-3 w-20 rounded bg-muted animate-pulse mt-1" />
          </div>
        </div>
      ))}
    </div>
  )
}
