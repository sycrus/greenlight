/**
 * WeatherCard — example generative UI component.
 *
 * Registered in registry.json with:
 *   requiredProps: ["city", "temperature", "description"]
 *   variants: ["default", "compact"]
 *   skeletonComponent: "WeatherCardSkeleton"
 *
 * The agent emits a TOOL_CALL_END event with:
 *   { component: "WeatherCard", props: { city, temperature, description, ... } }
 *
 * ComponentRenderer validates the spec against registry.json then renders this.
 *
 * TODO (phase 2): add to Storybook with CSF format + registry metadata block.
 * CI will pick it up and regenerate registry.json automatically.
 */

import { cn } from "./utils"

interface WeatherCardProps {
  city: string
  temperature: number
  description: string
  feelsLike?: number
  humidity?: number
  units?: "metric" | "imperial"
  variant?: "default" | "compact"
  className?: string
}

export function WeatherCard({
  city,
  temperature,
  description,
  feelsLike,
  humidity,
  units = "metric",
  variant = "default",
  className,
}: WeatherCardProps) {
  const unit = units === "metric" ? "°C" : "°F"

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 shadow-sm",
        variant === "compact" && "p-3",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{city}</p>
          <p className={cn("font-bold", variant === "compact" ? "text-2xl" : "text-4xl")}>
            {Math.round(temperature)}{unit}
          </p>
          <p className="text-sm capitalize text-muted-foreground">{description}</p>
        </div>
      </div>

      {variant === "default" && (feelsLike !== undefined || humidity !== undefined) && (
        <div className="mt-3 flex gap-4 border-t pt-3 text-xs text-muted-foreground">
          {feelsLike !== undefined && (
            <span>Feels like {Math.round(feelsLike)}{unit}</span>
          )}
          {humidity !== undefined && (
            <span>Humidity {humidity}%</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
// Rendered during TOOL_CALL_START while the agent fetches weather data.

export function WeatherCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="h-4 w-20 rounded bg-muted animate-pulse mb-2" />
      <div className="h-10 w-24 rounded bg-muted animate-pulse mb-2" />
      <div className="h-4 w-32 rounded bg-muted animate-pulse" />
    </div>
  )
}
