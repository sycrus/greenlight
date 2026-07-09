/**
 * Pipeline data types — Stage 2 & 3 output schemas (PRD §5).
 *
 * Stage 1 (brief-parsing) types are defined inline in app/api/brief/route.ts
 * and app/page.tsx. These are the shared types for territory generation and
 * Visual DNA encoding.
 */

// ── Stage 2: Territory ─────────────────────────────────────────────────────────

export interface Territory {
  id: string
  name: string
  creative_proposition: string
  visual_language: string
  tone: string
  emotional_arc: string
  scene_count_suggestion: number
  flow_prompt_style: string
  negative_constraints: string[]
  risk_flag: string | null
}

// ── Stage 3: Visual DNA ────────────────────────────────────────────────────────

export interface Palette {
  primary: string[]
  accent: string[]
  forbidden: string[]
}

export interface Ingredient {
  ingredient_id: string
  type: "character" | "location" | "object" | "brand_asset"
  description: string
  reference_image_uri: string | null
  generated_reference_uri: string | null
  flow_ingredient_prompt: string
}

export interface Cinematography {
  style: string
  preferred_shot_types: string[]
  camera_movement: string
  lighting: string
  color_grade: string
}

export interface VisualDNA {
  territory_id: string
  version: string
  palette: Palette
  ingredients: Ingredient[]
  cinematography: Cinematography
  brand_rules_as_prompts: string[]
  negative_prompt_list: string[]
  flow_scene_brief: string
}

// ── API response wrappers ──────────────────────────────────────────────────────

export interface TerritoryGenerationResponse {
  territories: Territory[]
  divergenceWarnings: string[]
  cost: {
    inputTokens: number
    outputTokens: number
    costUsd: number
  }
}

export interface VisualDNAResponse {
  visual_dna: VisualDNA
  cost: {
    inputTokens: number
    outputTokens: number
    costUsd: number
  }
}

// ── Stage 4: Slides Deck ────────────────────────────────────────────────────────

export interface TitleSlideData {
  headline: string
  subtitle: string
}

export interface TerritorySlideData {
  coverHeadline: string
  propositionBlurb: string
  visualSummary: string
  toneDescriptor: string
  sceneArcNotes: string
  sceneCount: number
  flowPromptStyle: string
  riskFlag: string | null
}

export interface VisualOverviewData {
  summary: string
  paletteComparison: string
  cinematographyComparison: string
  ingredientComparison: string
}

export interface BrandAlignmentData {
  territoryNotes: Record<string, string>
  divergenceNotes: string
  riskSummary: string
}

export interface ApprovalSlideData {
  instructions: string
  territoryOptions: Array<{ id: string; name: string; summary: string }>
}

export interface DeckCopy {
  titleSlide: TitleSlideData
  briefSummary: string
  territories: Record<string, TerritorySlideData>
  visualOverview: VisualOverviewData
  brandAlignment: BrandAlignmentData
  approvalSlide: ApprovalSlideData
  nextSteps: string
}

export interface SlidesDeckOutput {
  slides_deck_id_ecd: string
  slides_deck_id_client: string
  ecd_deck_url: string
  client_deck_url: string
  flow_package_gcs_uri: string
  flow_package_public_url: string | null
  slide_count_ecd: number
  slide_count_client: number
}

// ── Stage 4: Flow Package ───────────────────────────────────────────────────────

export interface FlowIngredient {
  ingredient_id: string
  name: string
  type: "character" | "location" | "object" | "brand_asset"
  reference_image_uri: string | null
  generated_reference_uri: string | null
  flow_ingredient_prompt: string
}

export interface SceneBrief {
  scene_number: number
  territory_id: string
  description: string
  shot_language: string
  suggested_flow_prompt: string
  duration_seconds: number
}

export interface FlowPackageData {
  run_id: string
  brand: string
  approved_territory_id: string | null
  visual_dna: Record<string, unknown>
  flow_session_brief: string
  ingredients: FlowIngredient[]
  scene_briefs: SceneBrief[]
  brand_rules_as_prompts: string[]
  negative_prompt_list: string[]
  approved_by_ecd: string | null
  approved_by_client: string | null
  released_at: string | null
}

export interface FlowPackageWrapper {
  flow_package: FlowPackageData
}

// ── Gates ───────────────────────────────────────────────────────────────────────

export type EcdApprovalStatus = "APPROVED" | "APPROVED_WITH_REVISIONS" | "REVISIONS_REQUIRED"
export type ClientApprovalStatus = "APPROVED" | "APPROVED_WITH_NOTES" | "REVISIONS_REQUIRED"

export interface EcdGateInput {
  runId: string
  territorySelected: string
  approvalStatus: EcdApprovalStatus
  notes: string | null
  name: string
  email: string
}

export interface ClientGateInput {
  runId: string
  territorySelected: string
  approvalStatus: ClientApprovalStatus
  notes: string | null
  name: string
  title: string
  email: string
}

export interface GateRecord {
  gate: string
  runId: string
  approvalStatus: string
  territorySelected: string
  notes: string | null
  approverName: string
  approverEmail: string
  revisionCycles: number
}
