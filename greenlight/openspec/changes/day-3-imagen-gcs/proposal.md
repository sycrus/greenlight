# Day 3 — Imagen Reference Generation + GCS

## Why

Stage 3 produces textual ingredient descriptions — a CD can read them, but an ECD or client needs something visual to react to in the Slides deck. Day 3 connects Imagen 3 to generate reference images from ingredient specs and stores them in GCS. This gives the approval gates visual assets to review, and gives the CD starting Ingredients for Google Flow. It also completes the Visual DNA object by populating the `generated_reference_uri` fields that were left null on Day 2.

## What changes

### Imagen 3 integration
- New `generateImage()` function in `lib/gemini.ts` — wraps Imagen 3 via Vertex AI SDK
- Generates a 1:1 reference image from an ingredient description + territory visual style
- SynthID watermarking is automatic (no configuration needed)

### GCS upload
- New `lib/gcs.ts` — client wrapper for `@google-cloud/storage`
- Upload generated images to `gs://greenlight-assets-agentic-499802/runs/{runId}/references/`
- Public or signed URLs for Slides deck embedding and Flow handoff

### API route
- `POST /api/generate-references` — accepts `runId` + `territoryId`
- Reads Visual DNA from Firestore, finds ingredients without `generated_reference_uri`
- Calls Imagen 3 for each, uploads to GCS, updates Firestore
- Returns updated ingredients with GCS URIs

### Firestore updates
- Updates `generated_reference_uri` on each ingredient in the Visual DNA document
- Writes Imagen cost to `_meta.imagenCost` and `_meta.imagenGenerations`

### UI updates
- Pipeline status page: reference image thumbnails in Visual DNA ingredient cards
- Image loading states and error fallbacks

### Tests (TDD)
- Imagen 3 call shape tests (mocked)
- GCS upload path + URI format tests
- Ingredient URI update flow tests
- Cost calculation tests

## Out of scope

- Moodboard / multi-image generation per ingredient (v0.1: one image per ingredient)
- Image-to-image generation (reference photo → Imagen variation)
- User-uploaded reference images (manual GCS upload only)
- Imagen safety filter override (accept defaults)
- Slides deck generation (Day 4)
- Approval gates (Day 5)
