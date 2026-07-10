/**
 * Flow Package assembly — shared logic for building the Flow package JSON
 * and uploading it to GCS. Used by both generate-deck (bundled) and
 * generate-flow-package (standalone) routes.
 */

import type { FlowPackageWrapper } from "@greenlight/lib/types/pipeline"

// ── Assembly ─────────────────────────────────────────────────────────────────

/**
 * Assemble a Flow package from a run's pipeline data.
 * Pure function — no side effects. Caller handles upload + Firestore.
 */
export function assembleFlowPackage(
  runId: string,
  brief: Record<string, unknown>,
  territories: Record<string, unknown>[],
  visualDna: Record<string, Record<string, unknown>>
): FlowPackageWrapper {
  const brand = (brief["brand"] as string) ?? "Unknown"

  // Flatten + deduplicate ingredients across all territories
  const allIngredients: Record<string, unknown>[] = []
  const seenIds = new Set<string>()
  for (const [, vd] of Object.entries(visualDna)) {
    const ings = vd["ingredients"] as Record<string, unknown>[] | undefined
    if (!ings) continue
    for (const ing of ings) {
      const id = ing["ingredient_id"] as string
      if (id && !seenIds.has(id)) {
        seenIds.add(id)
        allIngredients.push(ing)
      }
    }
  }

  // Aggregate + deduplicate brand rules and negative prompts
  const brandRulesSet = new Set<string>()
  const negativePromptsSet = new Set<string>()
  for (const [, vd] of Object.entries(visualDna)) {
    for (const rule of (vd["brand_rules_as_prompts"] as string[]) ?? []) brandRulesSet.add(rule)
    for (const neg of (vd["negative_prompt_list"] as string[]) ?? []) negativePromptsSet.add(neg)
  }

  // Generate scene briefs per territory (4 scenes each)
  const sceneBriefs: Record<string, unknown>[] = []
  let sceneNum = 1
  for (const [, vd] of Object.entries(visualDna)) {
    const territoryId = vd["territory_id"] as string
    const flowSceneBrief = (vd["flow_scene_brief"] as string) ?? ""
    const sceneCount = 4
    for (let i = 0; i < sceneCount; i++) {
      sceneBriefs.push({
        scene_number: sceneNum++,
        territory_id: territoryId,
        description: `${flowSceneBrief} — scene ${i + 1}`,
        shot_language: "Cinematic",
        suggested_flow_prompt: `Create scene ${i + 1} for ${territoryId}: ${flowSceneBrief}`,
        duration_seconds: 6,
      })
    }
  }

  // Build flow session brief from parsed brief fields
  const flowSessionBrief = [
    `Brand: ${brand}.`,
    brief["campaign_objective"] ?? "",
    brief["key_message"] ?? "",
    "Three creative territories explore distinct execution approaches.",
  ]
    .filter((s) => typeof s === "string" && s.length > 0)
    .join(" ")

  return {
    flow_package: {
      run_id: runId,
      brand,
      approved_territory_id: null,
      visual_dna: visualDna,
      flow_session_brief: flowSessionBrief,
      ingredients: allIngredients as unknown as FlowPackageWrapper["flow_package"]["ingredients"],
      scene_briefs: sceneBriefs as unknown as FlowPackageWrapper["flow_package"]["scene_briefs"],
      brand_rules_as_prompts: [...brandRulesSet],
      negative_prompt_list: [...negativePromptsSet],
      approved_by_ecd: null,
      approved_by_client: null,
      released_at: null,
    },
  }
}

// ── GCS upload ───────────────────────────────────────────────────────────────

export interface FlowUploadResult {
  gcsUri: string
  publicUrl: string | null
}

/**
 * Upload the Flow package JSON to GCS. Returns GCS URI + public URL.
 */
export async function uploadFlowPackage(
  runId: string,
  flowPackage: FlowPackageWrapper
): Promise<FlowUploadResult> {
  const flowBuffer = Buffer.from(JSON.stringify(flowPackage, null, 2), "utf-8")

  const { Storage } = await import("@google-cloud/storage")
  const keyJson = process.env["GCP_SERVICE_ACCOUNT_KEY"]
  const projectId = process.env["GCP_PROJECT_ID"] ?? ""
  const gcs = keyJson
    ? new Storage({ projectId, credentials: JSON.parse(keyJson) })
    : new Storage({ projectId })

  const bucketName = process.env["GCS_BUCKET_NAME"] ?? "greenlight-assets-agentic-499802"
  const flowPath = `runs/${runId}/flow-package.json`

  const bucket = gcs.bucket(bucketName)
  await bucket.file(flowPath).save(flowBuffer, { contentType: "application/json" })

  return {
    gcsUri: `gs://${bucketName}/${flowPath}`,
    publicUrl: `https://storage.googleapis.com/${bucketName}/${flowPath}`,
  }
}
