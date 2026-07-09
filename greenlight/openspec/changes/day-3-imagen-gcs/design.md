# Day 3 — Technical Design

## Architecture

```
POST /api/generate-references
  │
  ├─ readStageRecord(runId, "visual-dna")    → Firestore
  ├─ For each ingredient without reference:
  │   ├─ generateImage(prompt, style)        → Imagen 3 via Vertex AI
  │   ├─ uploadToGcs(buffer, runId, ingId)   → GCS
  │   └─ update ingredient in memory
  ├─ writeStageRecord(runId, "visual-dna")   → Firestore (update)
  └─ Return generated URIs + cost
```

## Imagen 3 integration

### `lib/gemini.ts` — `generateImage()`

```typescript
export async function generateImage(options: {
  prompt: string
  territoryId: string
  ingredientId: string
  negativePrompt?: string[]
}): Promise<{
  imageBuffer: Buffer
  gcsUri: string
  costUsd: number
}>
```

- Uses `vertexAI().getImagenModel({ model: "imagen-3.0-generate-001" })`
- Calls `model.generateImages({ prompt, ... })`
- Returns the first generated image as a Buffer
- SynthID watermarking is automatic on Imagen 3

### Pricing
- Imagen 3: $0.04 per image (1 generation)
- Written to `_meta.imagenCost` per call, accumulated

### Prompt assembly
- Base: ingredient's `flow_ingredient_prompt`
- Context: territory's `visual_language` descriptor appended
- Negative prompt: from `visual_dna.negative_prompt_list`
- Aspect ratio: `1:1`
- Style instruction: "photorealistic" appended (v0.1 default)

## GCS client

### `lib/gcs.ts`

```typescript
export async function uploadToGcs(buffer: Buffer, options: {
  runId: string
  ingredientId: string
  contentType?: string
}): Promise<{
  gcsUri: string
  publicUrl: string
  sizeBytes: number
}>
```

- Uses `@google-cloud/storage` (may need to add to package.json)
- Bucket from `GCS_BUCKET_NAME` env var
- Authentication via same service account as Vertex AI + Firestore
- Writes with `image/png` content type
- Returns both `gs://` and `https://` URLs

### Alternative: direct GCS upload via REST

If `@google-cloud/storage` adds too much bundle size, use GCS JSON API directly:
- Upload via signed URL or direct REST PUT
- Google Cloud Storage Node.js client is the standard approach

## API route

### `POST /api/generate-references`

```
Input:  { runId: string, territoryId: string, ingredientIds?: string[] }
Output: { generated: GeneratedImage[], skipped: SkippedIngredient[], cost: {...} }
```

1. Read Visual DNA from Firestore
2. Find the territory's ingredients by `territoryId`
3. Filter to ingredients that need generation (no `generated_reference_uri` + type !== "brand_asset")
4. If `ingredientIds` provided, further filter to only those
5. For each ingredient (sequential):
   a. Assemble prompt from `flow_ingredient_prompt` + territory context
   b. Call `generateImage()`
   c. Upload image buffer to GCS via `uploadToGcs()`
   d. Update ingredient's `generated_reference_uri` with GCS URI
6. Write updated Visual DNA back to Firestore (merge)
7. Return results

### Partial failure handling
- If generation 2 of 4 fails, continue with remaining
- Return `generated` array for successes, `errors` array for failures
- Update Firestore with whatever succeeded

## Firestore updates

The `/runs/{runId}/stages/visual-dna` document is UPDATED (not overwritten):

```json
{
  "territories": {
    "territory-1": {
      "ingredients": [
        {
          "ingredient_id": "char-1",
          "generated_reference_uri": "gs://greenlight-assets-agentic-499802/runs/run-123/references/char-1_2026-07-07T12_00_00Z.png"
        }
      ]
    }
  },
  "_meta": {
    "imagenCost": 0.12,
    "imagenGenerations": 3,
    "tokenCost": 0.00054,
    "updatedAt": "<serverTimestamp>"
  }
}
```

The `imagenCost` and `imagenGenerations` accumulate across calls — each call adds to the running total.

## UI updates

### Pipeline status page — Visual DNA panel

Each ingredient card shows:
- If `generated_reference_uri` is set: thumbnail image (`<img>` tag with public URL)
- If null: "No reference image" placeholder with a "Generate" button (triggers API call)
- Loading spinner during generation
- Error state if generation fails

The public URL is derived from the `gs://` URI:
- `gs://bucket/path/to/file.png` → `https://storage.googleapis.com/bucket/path/to/file.png`

### New: generate button per ingredient

Each ingredient card gets a small "Generate" button that calls:
```
POST /api/generate-references { runId, territoryId, ingredientIds: [ing.id] }
```

This allows the producer to selectively generate images for specific ingredients.

## Error handling

| Scenario | Behavior |
|---|---|
| No Visual DNA for run | `400` — run Stage 3 first |
| Territory not found | `400` — territory ID mismatch |
| All ingredients have refs | `200` — `{ generated: [], message: "All complete" }` |
| Imagen safety filter blocks | `502` — specific reason from API |
| Imagen quota exceeded | `502` — quota message |
| GCS upload fails | `502` — bucket/permission issue |
| Partial success | `200` — `generated` + `errors` arrays |
| Network timeout (60s per image) | Skip failed, continue with remaining |

## Cost estimate

| Item | Per-unit cost | Estimate per run |
|---|---|---|
| Imagen 3 (1 image) | $0.04 | 12 ingredients × $0.04 = $0.48 |
| GCS storage (1GB/mo) | $0.02 | Negligible (~2MB/run) |
| GCS egress (1GB) | $0.12 | Negligible (Slides embedding) |
| **Day 3 total per run** | | **~$0.48** |

## Test strategy

Test files:

1. `tests/imagen/imagen-call.test.ts` — mocked Imagen 3 call shape, prompt assembly
2. `tests/gcs/gcs-upload.test.ts` — mocked GCS upload path, URI format
3. `tests/imagen/generate-references.test.ts` — integration: Ingredient → Imagen → GCS → Firestore update
4. `tests/imagen/cost-tracking.test.ts` — cost accumulation across calls
