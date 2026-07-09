# Day 2 — Territory Generation + Visual DNA Encoding

## Why

Stage 1 gives us a structured parsed brief. The pipeline now needs to generate creative directions from it. Day 2 implements the two middle stages of the pipeline: creative territory generation (3 divergent strategic bets) and Visual DNA encoding (machine-readable aesthetic specs per territory). These are the creative engine of the system — where Gemini 2.5 Flash does the analytical and creative legwork that a CD would normally do through intuition and institutional knowledge.

## What changes

### Stage 2 — Creative Territory Generation
- New Gemini 2.5 Flash prompt that generates 3 mutually exclusive creative territories from a parsed brief
- Structured JSON output enforcing divergence (territories must not share visual language or emotional register)
- Risk flag extraction — flag anything off-brand, legally sensitive, or culturally ambiguous
- API route `POST /api/territories` — accepts `runId`, calls Gemini, writes to Firestore
- Firestore write to `/runs/{runId}/stages/territory-generation`

### Stage 3 — Visual DNA Encoding
- New Gemini 2.5 Flash prompt that encodes a territory into a Visual DNA object
- Palette extraction (primary/accent/forbidden hex values)
- Ingredient spec generation (character, location, object, brand_asset types)
- Cinematography encoding (style, shot types, camera movement, lighting, color grade)
- Brand rules → prompt translation (brand_rules_as_prompts, negative_prompt_list)
- API route `POST /api/visual-dna` — accepts `runId` + `territoryId`, calls Gemini, writes to Firestore
- Firestore write to `/runs/{runId}/stages/visual-dna`

### UI updates
- Pipeline status page shows territory + visual DNA stage completion
- Territory cards displayed when Stage 2 completes (3 territories with expandable detail)
- Visual DNA panel when Stage 3 completes

### Tests (TDD)
- Territory schema validation tests
- Territory divergence enforcement tests
- Visual DNA schema validation tests
- Risk flag extraction tests
- Brand rules → prompt translation tests

## Out of scope

- Imagen 3 reference image generation (Day 3)
- Slides deck generation (Day 4)
- Approval gates (Day 5)
- Vertex Pipelines component registration (deferred to Day 7 integration pass)
