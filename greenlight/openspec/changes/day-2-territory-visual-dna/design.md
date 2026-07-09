# Day 2 — Technical Design

## Architecture

Both Stage 2 and Stage 3 follow the same pattern established in Stage 1:

```
API Route → callGemini() → parseGeminiJson() → validate[Stage]() → writeStageRecord()
```

No new GCP services are introduced. Both stages use Gemini 2.5 Flash via the existing `lib/gemini.ts` adapter and write to Firestore via `lib/firestore.ts`.

## API routes

### `POST /api/territories`

```
Input:  { runId: string, brandRules?: Record<string, string> }
Output: { territories: Territory[], cost: {...} }
```

1. Read parsed brief from Firestore (`readStageRecord(runId, "brief-parsing")`)
2. Build system prompt with divergence enforcement instructions
3. Call Gemini 2.5 Flash
4. Parse + validate response against territory schema
5. Verify 3 territories returned, check for divergence
6. Write to Firestore (`writeStageRecord` with stage "territory-generation")
7. Return territories to client

### `POST /api/visual-dna`

```
Input:  { runId: string, territory: Territory, brandRules?: Record<string, string> }
Output: { visual_dna: VisualDNA, cost: {...} }
```

1. Accept a single territory (called 3× — once per territory, can be parallel)
2. Build system prompt with brand rules translation instructions
3. Call Gemini 2.5 Flash
4. Parse + validate response against Visual DNA schema
5. Write to Firestore (`writeStageRecord` with stage "visual-dna", keyed by territory_id)
6. Return Visual DNA object to client

Design decision: one call per territory rather than batching all 3. This gives independent retry on failure, independent cost tracking, and lets the UI update incrementally. The client (or a future pipeline orchestrator) can fire 3 requests in parallel.

## Prompt engineering

### Territory generation prompt structure

```
You are a Creative Director at a top agency. Given a parsed creative brief,
generate 3 DISTINCT creative territories. These are NOT variations — they are
mutually exclusive strategic bets.

RULES:
1. Each territory must have a different visual language. If Territory 1 is
   "warm and organic," Territory 2 and 3 must NOT use those descriptors.
2. Each territory must have a different emotional register.
3. Territories must be concretely different — a director should be able to
   shoot 3 different ads from these 3 territories.
4. Flag anything that could be off-brand, legally risky, or culturally
   ambiguous in the risk_flag field (null if none).

[PARSED BRIEF JSON]
[BRAND RULES if provided]

Return ONLY valid JSON — no markdown fences, no commentary.
```

### Visual DNA encoding prompt structure

```
You are a Visual Designer and Cinematographer. Given a creative territory,
encode it into a Visual DNA object — a machine-readable specification that
will drive AI image generation and a Google Flow production session.

RULES:
1. Palette: extract concrete hex values. If brand rules provide palette,
   use those. Otherwise infer from the territory's visual language.
2. Ingredients: create at least 1 character, 1 location, 1 object, and
   1 brand_asset. Each description must be concrete enough to brief an artist.
3. Cinematography: all fields (style, shot types, camera, lighting, grade)
   must be internally coherent with each other and with the territory.
4. Brand rules: translate each "do not" brand rule into a positive prompt
   constraint AND a negative prompt entry.
5. flow_scene_brief: write a paragraph a CD can paste into Google Flow to
   configure their session.

[TERRITORY JSON]
[BRAND RULES JSON if provided]

Return ONLY valid JSON — no markdown fences, no commentary.
```

## Firestore schema

### `/runs/{runId}/stages/territory-generation`

```json
{
  "territories": [ /* 3 territory objects */ ],
  "_meta": {
    "stage": "territory-generation",
    "runId": "string",
    "tokenCost": 0.00012,
    "updatedAt": "<serverTimestamp>"
  }
}
```

### `/runs/{runId}/stages/visual-dna`

```json
{
  "territories": {
    "territory-1": { /* visual_dna object */ },
    "territory-2": { /* visual_dna object */ },
    "territory-3": { /* visual_dna object */ }
  },
  "_meta": {
    "stage": "visual-dna",
    "runId": "string",
    "tokenCost": 0.00036,
    "updatedAt": "<serverTimestamp>"
  }
}
```

Design decision: all 3 Visual DNA objects stored in one stage document. Each is keyed by territory_id. This simplifies reads (one Firestore get for all 3) and matches the pattern of "one stage = one document."

## UI updates

### Pipeline status page (`/run/[runId]`)

The existing page auto-detects stage completion from the API response. When Stage 2 completes:
- Territory cards appear below the Territory Generation stage row
- Each card shows: name, creative_proposition (one-liner), tone, risk_flag (if any)
- Expandable to show full territory JSON

When Stage 3 completes:
- Visual DNA panel shows palette swatches, ingredient list, cinematography specs
- Scoped to the selected/active territory

No new pages needed — the pipeline status page handles incremental stage display.

## Error handling

| Scenario | Behavior |
|---|---|
| Parsed brief not found | `400 { error: "No parsed brief found for this run. Run Stage 1 first." }` |
| Gemini timeout | Retry once. If both attempts fail, `502` with stage-specific message |
| < 3 territories returned | `502 { error: "Generated fewer than 3 territories" }` |
| Territory divergence check fails | Territories still stored, warning flag set in metadata |
| Malformed JSON from Gemini | Retry once with stricter prompt. If still fails, `502` |
| Visual DNA missing required field | Validation gaps returned to client, partial data stored |

## Cost tracking

Both stages write token costs using the existing `callGemini()` cost calculation:
- Gemini 2.5 Flash: $0.00001875/1k input, $0.000075/1k output
- Territory gen estimate: ~2000 input, ~1500 output → ~$0.00015 per generation
- Visual DNA estimate: ~1500 input, ~2000 output → ~$0.00018 per territory (~$0.00054 for all 3)
- Day 2 total estimate: ~$0.00070 per full run

## Test strategy

Tests follow the established TDD pattern from Day 1. Test files:

1. `tests/territory-generation/territory-schema.test.ts` — schema validation, divergence detection
2. `tests/visual-dna/visual-dna-schema.test.ts` — schema validation, palette validation, ingredient validation
3. `tests/territory-generation/gemini-call.test.ts` — mocked Gemini call shape for territory prompt
4. `tests/visual-dna/gemini-call.test.ts` — mocked Gemini call shape for visual DNA prompt
5. `tests/territory-generation/firestore-write.test.ts` — Firestore write contract
6. `tests/visual-dna/firestore-write.test.ts` — Firestore write contract

Integration tests (real Gemini calls) run as manual verification against the deployed endpoint.
