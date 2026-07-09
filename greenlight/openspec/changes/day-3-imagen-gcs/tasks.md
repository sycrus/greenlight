# Day 3 — Implementation Tasks

## 1. GCS client
- [x] Add `@google-cloud/storage` to package.json
- [x] Implement `lib/gcs.ts` — `uploadToGcs()` wrapper
- [x] Upload to correct bucket + path pattern: `runs/{runId}/references/{ingredientId}_{timestamp}.png`
- [x] Return both `gs://` and `https://` URLs
- [x] Handle upload errors: bucket not found, quota, network
- [x] Make bucket publicly readable for UI display

## 2. Imagen 3 integration
- [x] Implement `generateImage()` in `lib/gemini.ts`
- [x] Model: `imagegeneration` (imagen-3.0-generate-001 requires GCP allowlist — see note)
- [x] Prompt assembly: ingredient.flow_ingredient_prompt + territory context + negative prompt
- [x] Return image buffer + cost
- [x] Handle errors: safety filter, quota, timeout
- [x] **Fallback**: placeholder PNG when Imagen not provisioned (404/403 → placeholder)

## 3. API route — `POST /api/generate-references`
- [x] Accept `{ runId, territoryId, ingredientIds? }`
- [x] Read Visual DNA from Firestore, find ingredients to generate
- [x] Skip brand_asset type + ingredients that already have URIs
- [x] Generate images sequentially (rate limit safety)
- [x] Upload each to GCS, update ingredient in memory
- [x] Write updated Visual DNA back to Firestore (merge, accumulate cost)
- [x] Partial failure handling: return generated + errors arrays

## 4. Firestore updates
- [x] Update ingredient `generated_reference_uri` in Visual DNA document
- [x] Accumulate `imagenCost` and `imagenGenerations` in `_meta`
- [x] Read-modify-write pattern to preserve existing data

## 5. UI updates
- [x] Reference image thumbnails in Visual DNA ingredient cards
- [x] "Generate" button per ingredient (calls API for single ingredient)
- [x] Loading spinner during generation
- [x] Error state with retry
- [x] `gs://` → `https://` URI conversion helper
- [x] Brand asset skip notice

## 6. Tests (TDD)
- [x] `tests/imagen/imagen-call.test.ts` — mocked Imagen call shape, prompt assembly (17 tests)
- [x] `tests/gcs/gcs-upload.test.ts` — mocked GCS upload path, URI format (10 tests)
- [x] `tests/imagen/generate-references.test.ts` — ingredient → Imagen → GCS → Firestore flow (8 tests)
- [x] `tests/imagen/cost-tracking.test.ts` — cost accumulation across calls (6 tests)

## 7. Deploy + verify
- [x] Deploy to Vercel
- [x] End-to-end test: visual DNA → generate references → GCS URIs → Firestore update
- [x] Verify placeholder images render (200 OK from public GCS URL)
- [x] Verify GCS bucket has generated images

## Implementation notes

- **Imagen 3 not provisioned**: GCP requires an allowlist for Imagen 3 access. Per CLAUDE.md fallback instructions, `generateImage()` returns a minimal placeholder PNG when the API returns 404/403. Real images replace placeholders once approved.
- **Model name**: Used `imagegeneration` (base model). `imagen-3.0-generate-001` also returns 404 — both require allowlist approval. Apply at: https://cloud.google.com/vertex-ai/docs/generative-ai/image/imagen-3-request-access
- **Public access**: Made GCS bucket publicly readable (`allUsers: roles/storage.objectViewer`) so UI can display images without signed URLs.
- **Placeholder cost**: $0.00 — only real Imagen calls incur cost.
- **Test suite**: 215 tests, 14 files, all passing.
