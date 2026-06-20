/**
 * Design system barrel export.
 *
 * All imports from @gen-ux/design-system come through here.
 * Swap Shadcn primitives for your design system components
 * by updating these exports — no changes needed in consumer apps.
 *
 * Phase 2: this file is auto-generated from Storybook CSF stories by the
 * registry build script. For now, maintain manually.
 */

// ── Primitives (Shadcn — swap target) ─────────────────────────────────────────
export { Button } from "./components/ui/Button"
export { Input } from "./components/ui/Input"

// ── Generative UI components (registered in registry.json) ───────────────────
export { WeatherCard, WeatherCardSkeleton } from "./components/WeatherCard"
export { CitationsCard, CitationsCardSkeleton } from "./components/CitationsCard"
export { CaseStudyCard, CaseStudyCardSkeleton } from "./components/CaseStudyCard"
export type { CaseStudyCardItem } from "./components/CaseStudyCard"
export { SlideDeck, SlideDeckSkeleton } from "./components/SlideDeck"
export type { SlideDeckProps, Slide } from "./components/SlideDeck"

// ── Utilities ─────────────────────────────────────────────────────────────────
export { cn } from "./components/utils"
