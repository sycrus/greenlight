# Visual DNA Encoding — Spec

## Input

- `territory`: a single territory object from Stage 2
- `brand_rules`: optional structured object (palette, typography, logoUsage, restrictedImagery, competitorNames)

## Output

```json
{
  "visual_dna": {
    "territory_id": "string — the territory this DNA encodes",
    "version": "string — semantic version, starts at \"1.0.0\"",
    "palette": {
      "primary": ["#hex — 2-4 primary brand/territory colors"],
      "accent": ["#hex — 1-3 accent/pop colors"],
      "forbidden": ["#hex — colors to avoid per brand rules or territory constraints"]
    },
    "ingredients": [
      {
        "ingredient_id": "string — unique within this territory, e.g. \"char-1\"",
        "type": "character | location | object | brand_asset",
        "description": "string — 1-2 sentence visual description",
        "reference_image_uri": "gcs_uri | null — placeholder: null until Day 3 Imagen integration",
        "generated_reference_uri": "gcs_uri | null — placeholder: null until Day 3",
        "flow_ingredient_prompt": "string — prompt-ready text for Google Flow ingredient creation"
      }
    ],
    "cinematography": {
      "style": "string — overall visual style (e.g. 'documentary handheld', 'polished commercial')",
      "preferred_shot_types": ["string — e.g. 'close-up', 'wide', 'dutch angle'"],
      "camera_movement": "string — e.g. 'fluid gimbal', 'locked tripod', 'dynamic handheld'",
      "lighting": "string — e.g. 'high-key natural', 'low-key dramatic', 'neon practical'",
      "color_grade": "string — e.g. 'warm desaturated', 'cool blue shift', 'vibrant pushed saturation'"
    },
    "brand_rules_as_prompts": ["string — each brand rule translated into a positive prompt constraint"],
    "negative_prompt_list": ["string — what to explicitly avoid in image/video generation"],
    "flow_scene_brief": "string — a paragraph describing how to configure a Flow session for this territory"
  },
  "cost": {
    "inputTokens": "integer",
    "outputTokens": "integer",
    "costUsd": "float"
  }
}
```

## Behavior

### Palette extraction
- If brand_rules includes palette hex values → use as primary palette
- If no brand palette → Gemini infers from territory visual_language description
- Forbidden palette from brand_rules.restrictedImagery if applicable

### Ingredient spec generation
- At least 1 ingredient per type (character, location, object, brand_asset)
- Ingredient descriptions are concrete and visual — a CD should be able to brief an artist from them
- `flow_ingredient_prompt` is copy-paste ready for Google Flow's ingredient panel
- `reference_image_uri` and `generated_reference_uri` are `null` until Day 3 (Imagen integration)

### Cinematography encoding
- Style, shot types, camera movement, lighting, and color grade are independently specifiable
- Derived from territory's visual_language and tone
- Must be internally coherent — a "polished commercial" style shouldn't have "handheld shaky-cam" movement

### Brand rules → prompts
- Each brand rule is translated from "do not do X" into "do Y" (positive framing)
- Negative prompt list captures the "avoid" constraints in AI prompt language
- Examples:
  - Rule: "Logo must be at least 20px from edges" → Prompt: "Nike swoosh with 20px+ clearspace on all sides"
  - Rule: "No competitor products" → Negative prompt: "Adidas, Puma, Reebok, Under Armour logos or products"

## Errors

- Missing territory → `400 { error: "Territory is required" }`
- Gemini timeout (30s) → retry once, then `502 { error: "Visual DNA encoding timed out" }`
- Malformed Gemini response → retry with stricter prompt, then `502 { error: "Failed to encode visual DNA" }`
