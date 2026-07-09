# Spec: Flow-Ready Creative Package

## Overview

The Flow package is a structured JSON document assembled from all 3 Visual DNA objects. It is stored in GCS and held until Gate 2 (client approval) passes. On release, it is updated with approver metadata and a signed URL is generated for CD download.

## Schema

```json
{
  "flow_package": {
    "run_id": "string",
    "brand": "string",
    "approved_territory_id": "string | null",
    "visual_dna": {
      "t1": { "..." },
      "t2": { "..." },
      "t3": { "..." }
    },
    "flow_session_brief": "string",
    "ingredients": [
      {
        "name": "string",
        "ingredient_id": "string",
        "type": "character | location | object | brand_asset",
        "reference_image_uri": "gcs_uri | null",
        "generated_reference_uri": "gcs_uri | null",
        "flow_ingredient_prompt": "string"
      }
    ],
    "scene_briefs": [
      {
        "scene_number": "integer",
        "territory_id": "string",
        "description": "string",
        "shot_language": "string",
        "suggested_flow_prompt": "string",
        "duration_seconds": "integer"
      }
    ],
    "brand_rules_as_prompts": ["string"],
    "negative_prompt_list": ["string"],
    "approved_by_ecd": "string | null",
    "approved_by_client": "string | null",
    "released_at": "ISO8601 timestamp | null"
  }
}
```

## Assembly (Stage 4)

### Input
- Parsed brief from Firestore (brand, objective, key_message)
- 3 Visual DNA objects from Firestore (one per territory)
- Brand rules from brief input

### Process
1. Extract brand name from parsed brief
2. Combine all 3 Visual DNA objects under `visual_dna` keyed by territory_id
3. Flatten all ingredients from all 3 territories into `ingredients[]` (deduplicate by ingredient_id)
4. Generate `flow_session_brief`: a concise paragraph assembled from the brief + approved territory context, formatted for Flow's session setup
5. Generate `scene_briefs[]`: for each territory, create scene entries based on `scene_count_suggestion` and `flow_scene_brief`, with suggested Flow prompts
6. Aggregate `brand_rules_as_prompts` and `negative_prompt_list` across all territories (deduplicate)
7. Set `approved_territory_id`, `approved_by_ecd`, `approved_by_client`, `released_at` to `null`
8. Upload to GCS: `runs/{runId}/flow-package.json`

### GCS storage
- Path: `runs/{runId}/flow-package.json`
- Content type: `application/json`
- Public read access (same as reference images) — allows UI preview
- Final released version uploaded to same path (overwrite)

## Release (Gate 2 approval)

### Trigger
Client approval gate status = `APPROVED` or `APPROVED_WITH_NOTES`

### Process
1. Read `flow-package.json` from GCS
2. Set `approved_territory_id` to the territory selected in Gate 2
3. Set `approved_by_ecd` to the ECD name from Gate 1 record
4. Set `approved_by_client` to the client name from Gate 2 record
5. Set `released_at` to current ISO8601 timestamp
6. Re-upload to GCS (same path — overwrite)
7. Generate GCS signed URL with 48-hour expiry
8. Return signed URL in gate API response + write to run summary

## Run summary (Firestore)

On Flow package release, write to `/runs/{runId}/summaries/main`:

```json
{
  "runId": "...",
  "brand": "...",
  "approvedTerritory": "...",
  "totalGeminiCost": 0.004,
  "totalImagenCost": 0.00,
  "revisionCyclesEcd": 0,
  "revisionCyclesClient": 0,
  "flowPackageUri": "gs://...",
  "flowPackageSignedUrl": "https://...",
  "completedAt": "<server timestamp>"
}
```

## Error scenarios

1. **GCS upload fails** → retry once, return 500 if retry also fails
2. **Missing Visual DNA data** → return 400 "Run {runId} has no Visual DNA — run Stage 3 first"
3. **Signed URL generation fails** → return unsigned GCS URI as fallback, log warning
4. **Duplicate ingredient IDs across territories** → merge, keep first occurrence's data
