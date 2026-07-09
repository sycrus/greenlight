# Territory Generation — Spec

## Input

- `parsed_brief`: the structured output from Stage 1 (brand, campaign_objective, target_audience, key_message, mandatory_elements, tone_descriptors, format, brief_gaps, confidence_score)
- `brand_rules`: optional structured object (palette, typography, logoUsage, restrictedImagery, competitorNames)

## Output

```json
{
  "territories": [
    {
      "id": "territory-1",
      "name": "string — distinctive, memorable name for this creative direction",
      "creative_proposition": "string — the strategic bet: what is this territory saying that the others are not?",
      "visual_language": "string — concrete description of the visual world (color, light, texture, composition, space)",
      "tone": "string — emotional register and attitude",
      "emotional_arc": "string — the 30s feeling journey: how does the viewer feel at 0s vs 15s vs 30s?",
      "scene_count_suggestion": "integer (3-6) — suggested number of scenes for a 30s execution",
      "flow_prompt_style": "string — a prompt-ready paragraph describing this territory's aesthetic for Google Flow",
      "negative_constraints": ["string — what this territory deliberately AVOIDS"],
      "risk_flag": "string | null — anything potentially off-brand, legally sensitive, or culturally ambiguous"
    }
  ],
  "cost": {
    "inputTokens": "integer",
    "outputTokens": "integer",
    "costUsd": "float"
  }
}
```

## Behavior

### Divergence enforcement
- Territories MUST be mutually exclusive creative bets — not variations on one theme
- Prompt instructs Gemini: "Treat each territory as a independently viable creative direction. Territories must not share visual language descriptors, emotional register, or target audience framing."
- If any two territories share >2 overlapping descriptors or have near-identical creative propositions, the producer is warned in UI

### Risk flagging
- The model is instructed to surface anything it identifies as potentially:
  - Off-brand (contradicts known brand rules)
  - Legally sensitive (unlicensed IP, talent likeness, trademark risk)
  - Culturally ambiguous (could be read differently across markets)
- Risk flags are shown to producer and ECD but NOT in client-facing deck (Day 4)
- `null` if no risks identified

### Scene count
- Suggested scene count (3-6) based on emotional arc complexity
- 30s format: typically 3-5 scenes at 6-10 seconds each
- Platform-aware: TikTok/Reels may favor faster cuts (5-6 scenes)

## Errors

- Missing parsed_brief → `400 { error: "Parsed brief is required" }`
- Gemini timeout (30s) → retry once, then `502 { error: "Territory generation timed out" }`
- Malformed Gemini response → retry with stricter prompt, then `502 { error: "Failed to generate territories" }`
- Less than 3 territories returned → `502 { error: "Generated fewer than 3 territories" }`
