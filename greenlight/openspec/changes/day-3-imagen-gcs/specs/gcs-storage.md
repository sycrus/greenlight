# GCS Asset Storage — Spec

## Input

- Image buffer (from Imagen 3 generation)
- `runId`: pipeline run identifier
- `ingredientId`: which ingredient this image belongs to

## Output

```json
{
  "gcs_uri": "gs://greenlight-assets-agentic-499802/runs/{runId}/references/char-1_2026-07-07T12_00_00Z.png",
  "public_url": "https://storage.googleapis.com/greenlight-assets-agentic-499802/runs/{runId}/references/char-1_2026-07-07T12_00_00Z.png",
  "content_type": "image/png",
  "size_bytes": 819200
}
```

## Behavior

### Upload
- Bucket: `greenlight-assets-agentic-499802` (created Day 1)
- Path: `runs/{runId}/references/{ingredient_id}_{iso8601}.png`
- Content type: `image/png`
- Access: uniform bucket-level access (not fine-grained ACLs)
- Public URL via GCS object public access (bucket configured for public read on `references/` prefix)

### URI conventions
- `gs://` URIs used internally (Firestore, Imagen, Slides API, Flow package)
- `https://` public URLs used for Slides deck embedding and UI display
- URIs are permanent — no expiry. GCS lifecycle policy can be added later for cleanup.

### Naming
- Timestamp included to distinguish regeneration cycles
- Ingredient ID is the primary key — finding the latest reference image for an ingredient means sorting by timestamp

### Bucket structure
```
gs://greenlight-assets-agentic-499802/
└── runs/
    └── {runId}/
        └── references/
            ├── char-1_2026-07-07T12_00_00Z.png
            ├── loc-1_2026-07-07T12_00_05Z.png
            ├── obj-1_2026-07-07T12_00_10Z.png
            └── ...
```

## Errors

- Bucket not found → ensure bucket exists at deploy time
- Upload failure → retry once, then `502`
- GCS quota exceeded → `502 { error: "GCS quota exceeded" }`
