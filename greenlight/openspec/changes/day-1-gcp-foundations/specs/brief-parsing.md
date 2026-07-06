# Brief Parsing — Spec

## Input

- `raw_brief`: freeform text (required)
- `brand_rules`: structured object with palette, typography, logo rules, restricted imagery, competitor names (optional)
- `reference_pdf_uri`: GCS URI to uploaded PDF (optional — v0.1 text extraction only)

## Output

```json
{
  "parsed_brief": {
    "brand": "string",
    "campaign_objective": "string",
    "target_audience": {
      "primary": "string",
      "secondary": "string | null"
    },
    "key_message": "string",
    "mandatory_elements": ["string"],
    "tone_descriptors": ["string"],
    "format": {
      "duration_seconds": 30,
      "aspect_ratio": "16:9 | 9:16",
      "platform": "string"
    },
    "brief_gaps": ["string"],
    "confidence_score": "float"
  }
}
```

## Behavior

- `brief_gaps`: surfaced to producer in UI before proceeding. Producer can fill gaps manually or proceed with AI-inferred defaults.
- Producer confirmation is logged to Firestore but is NOT a named permission gate.
- PDF reference: Gemini document understanding extracts text only (no image processing in v0.1).

## Errors

- Empty brief → `400 { error: "Brief text is required" }`
- Gemini timeout (30s) → retry once, then `502 { error: "Brief parsing timed out" }`
- Malformed Gemini response → retry with stricter prompt, then `502 { error: "Failed to parse brief" }`
