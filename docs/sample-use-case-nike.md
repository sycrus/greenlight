# Sample Use Case: Nike Air Max Dn Launch

Complete end-to-end walkthrough from client brief to Flow package release.

---

## Input → `/`

**Creative Brief (raw text):**

> We're launching the Nike Air Max Dn to Gen Z. This is the first Air Max with Dynamic Air — four tubes that shift pressure as you move. We want a TikTok-first campaign that feels raw and real, not polished. The shoe is available in volt green and total orange colorways. Must include the visible Air unit in every shot. No competitor footwear. Target: 18–24, sneaker culture, streetwear adjacent. Key message: "Feel the Unreal." We need this in 30 seconds vertical. Go.

**Brand Rules:**
- Palette: volt green `#CCFF00`, total orange `#FF6200`, black `#000000`
- Logo: Nike swoosh visible in first and last 3 seconds
- Restricted: no competitor logos, no alcohol, no political imagery
- Competitors: Adidas, Puma

---

## Stage 1 — Brief Parsing

```json
{
  "parsed_brief": {
    "brand": "Nike",
    "campaign_objective": "Launch Air Max Dn — first Dynamic Air sneaker — to Gen Z",
    "target_audience": {
      "primary": "Gen Z 18–24, sneaker culture, streetwear adjacent",
      "secondary": null
    },
    "key_message": "Feel the Unreal",
    "mandatory_elements": [
      "Nike swoosh",
      "Visible Air unit",
      "Volt green #CCFF00",
      "Total orange #FF6200"
    ],
    "tone_descriptors": ["raw", "real", "unpolished", "energetic"],
    "format": {
      "duration_seconds": 30,
      "aspect_ratio": "9:16",
      "platform": "TikTok"
    },
    "brief_gaps": [
      "No specific talent or casting direction",
      "No music or sound direction"
    ],
    "confidence_score": 0.87
  },
  "runId": "run-1783401234567-a1b2c3",
  "cost": { "inputTokens": 412, "outputTokens": 380, "costUsd": 0.000036 }
}
```

---

## Stage 2 — Creative Territories

| | Territory 1 | Territory 2 | Territory 3 |
|---|---|---|---|
| **Name** | Raw Velocity | Pressure Shift | Unreal Union |
| **Proposition** | Unfiltered motion — the shoe in its element, no staging, no polish | The tech as the hero — what Dynamic Air does that no other shoe can | Streetwear culture meets innovation — the shoe as identity piece |
| **Visual Language** | Handheld, motion blur, urban decay backdrops, natural light only | Macro product shots, pressure visualization, clean studio, tech-diagram aesthetic | Crew cast, golden hour, street environments, fashion-documentary hybrid |
| **Tone** | bold, raw, kinetic | precise, technical, mesmerizing | warm, inclusive, aspirational |
| **Arc** | Static tension → burst → settle into groove | Curiosity → reveal → awe → desire | Individual moments → connections form → collective energy |
| **Scenes** | 5 | 4 | 6 |
| **Flow Style** | Cinéma vérité, handheld, no tripod | Product photography, macro lens, controlled lighting | Documentary, natural light, candid |
| **Risk** | May feel too chaotic for brand safety | May feel like a product ad, not TikTok-native | Crowd casting needed — diversity requirement |

---

## Stage 3 — Visual DNA

### T1 — Raw Velocity

```json
{
  "territory_id": "t1",
  "palette": {
    "primary": ["#CCFF00", "#FF6200"],
    "accent": ["#1A1A1A", "#FFFFFF"],
    "forbidden": ["#0000FF", "#FF0000"]
  },
  "ingredients": [
    {
      "ingredient_id": "char-1",
      "type": "character",
      "description": "Young runner, 20s, streetwear fit, Air Max Dn on feet, mid-stride in urban alleyway",
      "flow_ingredient_prompt": "A Gen Z runner in Nike streetwear, Air Max Dn volt green colorway, captured mid-stride, motion blur, natural light, urban alleyway background, cinéma vérité style"
    },
    {
      "ingredient_id": "loc-1",
      "type": "location",
      "description": "Concrete underpass with graffiti, harsh shadows, single light source from above",
      "flow_ingredient_prompt": "Urban concrete underpass, graffiti-covered walls, dramatic single-source overhead lighting, deep shadows, gritty texture"
    },
    {
      "ingredient_id": "obj-1",
      "type": "object",
      "description": "Air Max Dn close-up — Dynamic Air tubes compressing on impact",
      "flow_ingredient_prompt": "Extreme close-up of Nike Air Max Dn sole unit, Dynamic Air tubes visibly compressing on foot strike, slow motion, 240fps, volt green color accent"
    },
    {
      "ingredient_id": "brand-1",
      "type": "brand_asset",
      "description": "Nike swoosh — use uploaded vector asset",
      "flow_ingredient_prompt": "Nike swoosh logo — use uploaded brand asset in first and last 3 seconds"
    }
  ],
  "cinematography": {
    "style": "cinéma vérité handheld",
    "preferred_shot_types": ["wide running shot", "extreme close-up shoe", "dutch angle urban"],
    "camera_movement": "handheld, kinetic, no stabilization",
    "lighting": "available light only — street lamps, sunlight, practicals",
    "color_grade": "high contrast, crushed blacks, desaturated except volt green + total orange"
  },
  "negative_prompt_list": [
    "no tripod",
    "no studio lighting",
    "no polished color grade",
    "no Adidas or Puma",
    "no alcohol",
    "no political imagery"
  ],
  "flow_scene_brief": "Open on runner in motion through urban underpass — shoe impact in slow-mo — cut to street-level sprint — final hero shot with swoosh. Raw, unfiltered, real."
}
```

*(Similar detail for T2 — Pressure Shift and T3 — Unreal Union, with different palettes, ingredients, and cinematography.)*

---

## Stage 4 — Pre-Production Deck

### ECD deck (15 slides)
- **Slide 1:** Title — "Nike — Air Max Dn Launch / Pre-Production Creative Direction Deck"
- **Slide 2:** Brief Summary — parsed objective, audience, gaps
- **Slides 3–5:** T1 — Raw Velocity (cover, visual language, production notes with risk flag ⚠)
- **Slides 6–8:** T2 — Pressure Shift
- **Slides 9–11:** T3 — Unreal Union
- **Slide 12:** Visual DNA Overview — 3 palettes side by side, cinematography comparison
- **Slide 13:** Brand Alignment — territory notes, divergence assessment, risk summary *(ECD only)*
- **Slide 14:** Approval — "Select your preferred territory" with T1/T2/T3 radio list
- **Slide 15:** Next Steps — CD enters Flow with approved package

### Client deck (14 slides)
Same as ECD minus Slide 13 (Brand Alignment). Risk flags stripped from territory detail slides.

### Sharing
- ECD: `jane.doe@agency.com` (Commenter) → `docs.google.com/presentation/d/{id}/edit`
- Client: `brandon@nike.com` (Viewer) → `docs.google.com/presentation/d/{id}/view`

---

## Gate 1 — ECD Approval

**ECD submission:**
```json
{
  "runId": "run-1783401234567-a1b2c3",
  "territorySelected": "t1",
  "approvalStatus": "APPROVED_WITH_REVISIONS",
  "notes": "Love Raw Velocity. Tone down the graffiti — keep it urban but not grimy. Add one clean product hero shot so the shoe reads clearly before the motion blur kicks in.",
  "name": "Jane Doe",
  "email": "jane.doe@agency.com"
}
```

**Firestore record:** `/runs/run-1783401234567-a1b2c3/gates/ecd_approval`
```json
{
  "approvalStatus": "APPROVED_WITH_REVISIONS",
  "territorySelected": "t1",
  "revisionCycles": 1,
  "approverName": "Jane Doe"
}
```

→ Gate 2 unlocked.

---

## Gate 2 — Client Approval

**Client submission:**
```json
{
  "runId": "run-1783401234567-a1b2c3",
  "territorySelected": "t1",
  "approvalStatus": "APPROVED",
  "notes": null,
  "name": "Brandon Mitchell",
  "title": "Brand Director, Nike Sportswear",
  "email": "brandon@nike.com"
}
```

**Firestore record:** `/runs/run-1783401234567-a1b2c3/gates/client_approval`
```json
{
  "approvalStatus": "APPROVED",
  "territorySelected": "t1"
}
```

→ Flow package released.

---

## Run Summary

**Firestore:** `/runs/run-1783401234567-a1b2c3/summaries/main`
```json
{
  "runId": "run-1783401234567-a1b2c3",
  "brand": "Nike",
  "approvedTerritory": "t1",
  "totalGeminiCost": 0.000351,
  "totalImagenCost": 0.00,
  "revisionCyclesEcd": 1,
  "revisionCyclesClient": 0,
  "flowPackageUri": "gs://greenlight-assets/runs/run-1783401234567-a1b2c3/flow-package.json",
  "flowPackageSignedUrl": "https://storage.googleapis.com/...?Signature=... (48hr)"
}
```

---

## Flow Package (released)

```json
{
  "flow_package": {
    "run_id": "run-1783401234567-a1b2c3",
    "brand": "Nike",
    "approved_territory_id": "t1",
    "visual_dna": {
      "t1": { "...full Visual DNA..." },
      "t2": { "..." },
      "t3": { "..." }
    },
    "flow_session_brief": "Brand: Nike. Launch Air Max Dn — first Dynamic Air sneaker — to Gen Z. Key message: Feel the Unreal. Three territories explored. Approved: Raw Velocity — unfiltered motion, cinéma vérité style, urban backdrop.",
    "ingredients": [
      {
        "ingredient_id": "char-1",
        "type": "character",
        "flow_ingredient_prompt": "...",
        "generated_reference_uri": "gs://..."
      },
      {
        "ingredient_id": "loc-1",
        "type": "location",
        "flow_ingredient_prompt": "...",
        "generated_reference_uri": "gs://..."
      }
    ],
    "scene_briefs": [
      {
        "scene_number": 1,
        "territory_id": "t1",
        "description": "Urban kinetic energy — runner in motion through underpass",
        "suggested_flow_prompt": "Create scene 1 for t1: Urban kinetic energy with cinéma vérité handheld style",
        "duration_seconds": 6
      }
    ],
    "approved_by_ecd": "Jane Doe",
    "approved_by_client": "Brandon Mitchell",
    "released_at": "2026-07-09T14:35:00.000Z"
  }
}
```

---

## Audit Trail

| Stage | Status | Cost |
|---|---|---|
| Brief parsing | ✅ | $0.000036 |
| Territory generation | ✅ | $0.000075 |
| Visual DNA encoding | ✅ (3 calls) | $0.000090 |
| Dual output generation | ✅ | $0.000150 |
| **Gate 1 — ECD** | APPROVED_WITH_REVISIONS (1 cycle) | — |
| **Gate 2 — Client** | APPROVED | — |
| **Flow package** | Released | Signed URL, 48hr expiry |

**Total pipeline cost: $0.000351** across 6 Gemini calls. Reference images use placeholders ($0.00) until Imagen 3 is allowlisted.

The CD opens Flow with a structured brief, reference images, ingredient prompts, scene briefs, and brand rules — ready to start production. Every decision has a name, a timestamp, and a rationale stored in Firestore.
