import { cn } from "./utils"

interface CitationsCardProps {
  sources: string[]
  className?: string
}

export function CitationsCard({ sources, className }: CitationsCardProps) {
  if (sources.length === 0) return null

  return (
    <div className={cn("rounded-xl border bg-card p-4 shadow-sm", className)}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
        Sources
      </p>
      <ul className="space-y-1">
        {sources.map((url) => (
          <li key={url} className="text-sm">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline break-all"
            >
              {url}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CitationsCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="h-3 w-14 rounded bg-muted animate-pulse mb-3" />
      <div className="space-y-2">
        <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
        <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
        <div className="h-4 w-4/5 rounded bg-muted animate-pulse" />
      </div>
    </div>
  )
}
