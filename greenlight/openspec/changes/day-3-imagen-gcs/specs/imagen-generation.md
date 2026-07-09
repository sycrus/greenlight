# Imagen Reference Generation — Spec

## Input

- `runId`: pipeline run identifier
- `territoryId`: which territory's ingredients to generate images for
- `ingredientIds` (optional): specific ingredients to generate. If omitted, generates for all ingredients without a `generated_reference_uri`.

## Output

```json
{
  "generated": [
    {
      "ingredient_id": "char-1",
      "type": "character",
      "description": "A young athlete in their mid-20s...",
      "generated_reference_uri": "gs://greenlight-assets-agentic-499802/runs/{runId}/references/char-1_2026-07-07T12_00_00Z.png",
      "prompt_used": "Young athlete, mid-20s, determined expression, dark technical running gear, low angle hero shot, urban skyline background, cinematic lighting, 1:1 aspect ratio, photorealistic"
    }
  ],
  "skipped": [
    {
      "ingredient_id": "brand-1",
      "reason": "already_has_reference | not_supported_type (brand_asset uses logo, not generation)"
    }
  ],
  "cost": {
    "imagenGenerations": 3,
    "imagenCostUsd": 0.12,
    "gcsBytesWritten": 2457600
  }
}
```

## Behavior

### Image generation
- Model: `imagen-3.0-generate-001`
- Aspect ratio: `1:1` (square — works for both Slides deck and Flow Ingredients)
- Resolution: default Imagen 3 output (typically 1024×1024)
- Prompt: assembled from `ingredient.flow_ingredient_prompt` + territory visual style context
- Safety filter: default Imagen 3 settings (no override in v0.1)
- SynthID watermarking: automatic, no configuration needed

### Generation strategy
- One image per ingredient — no multi-shot generation in v0.1
- Ingredients of type `brand_asset` are SKIPPED (logos should use uploaded assets, not AI generation)
- If an ingredient already has a `generated_reference_uri`, it is skipped
- Sequential generation to stay within rate limits (no parallel Imagen calls)

### GCS storage
- Bucket: `greenlight-assets-agentic-499802`
- Path pattern: `runs/{runId}/references/{ingredient_id}_{timestamp}.png`
- Images are stored as `image/png` with standard GCS object metadata
- URIs use `gs://` protocol (native to Imagen, Slides API, and Flow)

### Cost tracking
- Imagen 3: ~$0.04 per image (1 image generation)
- Written to Firestore `_meta.imagenCost` and `_meta.imagenGenerations` on each call
- Accumulated across calls — if 3 ingredients generated over 2 calls, total cost reflects all of them

## Errors

- Missing runId or territoryId → `400`
- Visual DNA not found → `400 { error: "No Visual DNA found for this run. Run Stage 3 first." }`
- Territory not found in Visual DNA → `400 { error: "Territory {id} not found in Visual DNA" }`
- No ingredients to generate → `200 { generated: [], skipped: [...all ingredients], message: "All ingredients already have reference images" }`
- Imagen 3 quota / safety filter block → `502 { error: "Imagen 3 generation failed: {reason}" }`
- GCS upload failure → `502 { error: "Failed to upload to GCS: {reason}" }`
- Partial success: if 3 of 5 ingredients succeed, returned with `generated` + `errors` arrays
