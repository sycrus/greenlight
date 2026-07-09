/**
 * POST /api/generate-references — generate Imagen 3 reference images for Visual DNA ingredients.
 *
 * Input:  { runId: string, territoryId: string, ingredientIds?: string[] }
 * Output: { generated: GeneratedImage[], skipped: SkippedIngredient[], errors: ErrorResult[], cost: {...} }
 *
 * Reads the Visual DNA from Firestore, finds ingredients without reference images,
 * generates images via Imagen 3, uploads to GCS, and updates Firestore in place.
 * Ingredients of type "brand_asset" are skipped (logos should use uploaded assets).
 */

import { NextResponse } from "next/server"
import { generateImage } from "@greenlight/lib/gemini"
import { uploadToGcs, gcsToHttps } from "@greenlight/lib/gcs"
import { readStageRecord, writeStageRecord } from "@greenlight/lib/firestore"

export const runtime = "nodejs"

// ── Types ──────────────────────────────────────────────────────────────────────

interface IngredientData {
  ingredient_id: string
  type: string
  description: string
  flow_ingredient_prompt: string
  reference_image_uri: string | null
  generated_reference_uri: string | null
}

interface GeneratedImage {
  ingredient_id: string
  type: string
  gcsUri: string
  publicUrl: string
}

interface SkippedIngredient {
  ingredient_id: string
  reason: "already_has_reference" | "brand_asset_skipped" | "not_requested"
}

interface ErrorResult {
  ingredient_id: string
  error: string
}

// ── Route ──────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const { runId, territoryId, ingredientIds } = (await req.json()) as {
      runId?: string
      territoryId?: string
      ingredientIds?: string[]
    }

    if (!runId?.trim() || !territoryId?.trim()) {
      return NextResponse.json(
        { error: "runId and territoryId are required" },
        { status: 400 }
      )
    }

    // Read Visual DNA from Firestore
    const vdRecord = await readStageRecord(runId, "visual-dna")
    if (!vdRecord) {
      return NextResponse.json(
        { error: "No Visual DNA found for this run. Run Stage 3 first." },
        { status: 400 }
      )
    }

    const territories = vdRecord["territories"] as Record<string, Record<string, unknown>> | undefined
    if (!territories || !territories[territoryId]) {
      return NextResponse.json(
        { error: `Territory ${territoryId} not found in Visual DNA` },
        { status: 400 }
      )
    }

    const vd = territories[territoryId]!
    const ingredients = (vd["ingredients"] as IngredientData[]) ?? []
    const territoryName = (vd["territory_id"] as string) ?? territoryId

    // Filter: which ingredients need generation?
    const toGenerate = ingredients.filter((ing) => {
      // Skip if already has a generated URI
      if (ing.generated_reference_uri) return false
      // Skip brand_asset — logos should use uploaded assets
      if (ing.type === "brand_asset") return false
      // If ingredientIds specified, only process those
      if (ingredientIds && ingredientIds.length > 0) {
        return ingredientIds.includes(ing.ingredient_id)
      }
      return true
    })

    const skipped: SkippedIngredient[] = ingredients
      .filter((ing) => !toGenerate.includes(ing))
      .map((ing) => ({
        ingredient_id: ing.ingredient_id,
        reason: (ing.generated_reference_uri
          ? "already_has_reference"
          : ing.type === "brand_asset"
            ? "brand_asset_skipped"
            : "not_requested") as SkippedIngredient["reason"],
      }))

    if (toGenerate.length === 0) {
      return NextResponse.json({
        generated: [],
        skipped,
        errors: [],
        cost: { imagenGenerations: 0, imagenCostUsd: 0 },
        message: "All ingredients already have reference images or were skipped.",
      })
    }

    // Generate images sequentially (rate limit safety)
    const generated: GeneratedImage[] = []
    const errors: ErrorResult[] = []
    let totalCost = 0
    let generationCount = 0

    for (const ing of toGenerate) {
      try {
        // Assemble prompt from ingredient + territory context
        const prompt = ing.flow_ingredient_prompt ||
          `${ing.description}, photorealistic, 1:1 aspect ratio`

        const negativePrompt = Array.isArray(vd["negative_prompt_list"])
          ? (vd["negative_prompt_list"] as string[]).join(", ")
          : undefined

        // Call Imagen 3
        const result = await generateImage({
          prompt,
          ...(negativePrompt !== undefined && { negativePrompt }),
          aspectRatio: "1:1",
        })

        // Upload to GCS
        const upload = await uploadToGcs(result.imageBuffer, {
          runId,
          ingredientId: ing.ingredient_id,
        })

        // Update ingredient in memory
        ing.generated_reference_uri = upload.gcsUri

        generated.push({
          ingredient_id: ing.ingredient_id,
          type: ing.type,
          gcsUri: upload.gcsUri,
          publicUrl: upload.publicUrl,
        })

        totalCost += result.costUsd
        generationCount++
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        console.error(`[generate-references] Failed for ${ing.ingredient_id}:`, message)
        errors.push({
          ingredient_id: ing.ingredient_id,
          error: message,
        })
        // Continue with remaining ingredients
      }
    }

    // Write updated Visual DNA back to Firestore (merge)
    const existingMeta = (vdRecord["_meta"] as Record<string, unknown>) ?? {}
    const existingImagenCost = (existingMeta["imagenCost"] as number) ?? 0
    const existingImagenGenerations = (existingMeta["imagenGenerations"] as number) ?? 0

    await writeStageRecord({
      stage: "visual-dna",
      runId,
      data: {
        territories: {
          ...territories,
          [territoryId]: { ...vd, ingredients },
        },
      },
      tokenCost: (existingMeta["tokenCost"] as number) ?? 0,
      imagenCost: existingImagenCost + totalCost,
      imagenGenerations: existingImagenGenerations + generationCount,
    })

    return NextResponse.json({
      generated,
      skipped,
      errors,
      cost: {
        imagenGenerations: generationCount,
        imagenCostUsd: totalCost,
        totalImagenGenerations: existingImagenGenerations + generationCount,
        totalImagenCostUsd: existingImagenCost + totalCost,
      },
      ...(generated.length > 0 && {
        note: `${generated.length} images generated for territory ${territoryName}. ${errors.length > 0 ? `${errors.length} failed.` : ""}`,
      }),
    })
  } catch (err) {
    console.error("[generate-references] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    )
  }
}
