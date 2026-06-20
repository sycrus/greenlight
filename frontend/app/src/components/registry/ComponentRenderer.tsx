/**
 * ComponentRenderer — maps validated A2UI specs to registered React components.
 *
 * Receives a ComponentSpec from the agent (via TOOL_CALL_END event),
 * validates it against the registry, and renders the matching component.
 *
 * Skeleton pattern:
 *   TOOL_CALL_START  → render <SkeletonComponent />
 *   TOOL_CALL_END    → swap to <ActualComponent {...props} />
 *
 * To add a new renderable component:
 *   1. Add it to packages/design-system/src/components/
 *   2. Add its entry to packages/design-system/registry.json
 *   3. Import and register it in the componentMap below
 *
 * TODO (phase 2): auto-generate componentMap from registry.json
 * so adding a Storybook story automatically makes it renderable.
 */

"use client"

import type { ComponentSpec } from "@/types"
import { validateSpec } from "@/lib/registry"

// ── Component map — register all renderable components here ──────────────────
// Import from the design-system package.
// Shadcn components are used directly for now; Storybook components in phase 2.

import {
  WeatherCard, WeatherCardSkeleton,
  CitationsCard, CitationsCardSkeleton,
  CaseStudyCard, CaseStudyCardSkeleton,
  SlideDeck, SlideDeckSkeleton,
} from "@gen-ux/design-system"

const componentMap: Record<string, React.ComponentType<Record<string, unknown>>> = {
  WeatherCard,
  CitationsCard,
  CaseStudyCard,
  SlideDeck: SlideDeck as unknown as React.ComponentType<Record<string, unknown>>,
}

const skeletonMap: Record<string, React.ComponentType> = {
  WeatherCard: WeatherCardSkeleton,
  CitationsCard: CitationsCardSkeleton,
  CaseStudyCard: CaseStudyCardSkeleton,
  SlideDeck: SlideDeckSkeleton,
}

// ─────────────────────────────────────────────────────────────────────────────

interface ComponentRendererProps {
  spec: ComponentSpec
  loading?: boolean  // true = show skeleton (TOOL_CALL_START phase)
}

export function ComponentRenderer({ spec, loading = false }: ComponentRendererProps) {
  const validation = validateSpec(spec)

  if (!validation.valid) {
    console.warn(`[registry] Invalid spec rejected: ${validation.reason}`)
    return (
      <div className="text-sm text-destructive border border-destructive/20 rounded p-2">
        Component unavailable
      </div>
    )
  }

  if (loading) {
    const Skeleton = skeletonMap[spec.component]
    if (Skeleton) return <Skeleton />
    return <div className="h-24 rounded-md bg-muted animate-pulse" />
  }

  const Component = componentMap[spec.component]

  if (!Component) {
    console.warn(`[registry] Component "${spec.component}" is registered but not imported`)
    return null
  }

  return <Component {...spec.props} />
}
