/**
 * Component registry — client side.
 *
 * Loads registry.json from the design-system package and validates
 * A2UI component specs before they reach the renderer.
 *
 * The agent emits a TOOL_CALL_END event with a ComponentSpec.
 * Before rendering, the spec is validated here.
 * Invalid specs are rejected — the agent is notified and can self-correct.
 *
 * TODO (phase 2): load registry.json dynamically from the design-system
 * NPM package so it stays in sync with Storybook CI output.
 *
 * Current: registry is imported statically from packages/design-system.
 */

import type { ComponentSpec, ComponentRegistry, RegistryEntry } from "@/types"

// Static import for MVP — replace with dynamic fetch in phase 2
import registryJson from "@gen-ux/design-system/registry.json"

const registry = registryJson as ComponentRegistry

export interface ValidationResult {
  valid: boolean
  reason?: string
}

export function validateSpec(spec: ComponentSpec): ValidationResult {
  const entry = registry[spec.component] as RegistryEntry | undefined

  if (!entry) {
    return { valid: false, reason: `Unknown component: "${spec.component}"` }
  }

  const missingProps = entry.requiredProps.filter(
    (prop) => !(prop in spec.props)
  )

  if (missingProps.length > 0) {
    return {
      valid: false,
      reason: `Missing required props for ${spec.component}: ${missingProps.join(", ")}`,
    }
  }

  if (spec.variant && !entry.variants.includes(spec.variant)) {
    return {
      valid: false,
      reason: `Unknown variant "${spec.variant}" for ${spec.component}. Valid: ${entry.variants.join(", ")}`,
    }
  }

  return { valid: true }
}

export function getEntry(componentName: string): RegistryEntry | undefined {
  return registry[componentName]
}

export function getSkeletonComponent(componentName: string): string | undefined {
  return registry[componentName]?.skeletonComponent
}

export { registry }
