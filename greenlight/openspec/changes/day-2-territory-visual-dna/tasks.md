# Day 2 — Implementation Tasks

## 1. Territory generation — prompt + schema
- [x] Write territory generation system prompt (`lib/prompts/territory-generation.ts`)
- [x] Define TypeScript types for Territory in `lib/types/pipeline.ts`
- [x] Implement `validateTerritories()` — schema validation + divergence check
- [x] ~~Implement `validateTerritory()` — single territory field validation~~ (folded into validateTerritories)

## 2. Territory generation — API route
- [x] Build `POST /api/territories` — reads parsed brief, calls Gemini, writes Firestore
- [x] Return 3 territories with divergence warnings if detected
- [x] Handle errors: missing brief, Gemini timeout, malformed response, < 3 territories

## 3. Visual DNA encoding — prompt + schema
- [x] Write Visual DNA encoding system prompt (`lib/prompts/visual-dna.ts`)
- [x] Define TypeScript types for VisualDNA in `lib/types/pipeline.ts`
- [x] Implement `validateVisualDNA()` — schema validation, palette format check, ingredient count check

## 4. Visual DNA encoding — API route
- [x] Build `POST /api/visual-dna` — accepts territory, calls Gemini, writes Firestore
- [x] Store all 3 Visual DNA objects in one Firestore document keyed by territory_id
- [x] Handle errors: missing territory, Gemini timeout, malformed response

## 5. Brand rules → prompt translation
- [x] Brand rules passed as JSON to Gemini prompts (model handles translation)
- [x] ~~Implement `translateBrandRuleToPrompt()`~~ — not needed; Gemini handles this in-prompt
- [x] Handle empty/missing brand rules gracefully

## 6. Firestore integration
- [x] Write territory generation result to `/runs/{runId}/stages/territory-generation`
- [x] Write Visual DNA object(s) to `/runs/{runId}/stages/visual-dna`
- [x] Cost tracking: token counts written to _meta on each stage record

## 7. UI updates
- [x] Pipeline status page: territory cards when Stage 2 completes
- [x] Pipeline status page: Visual DNA panel with palette swatches when Stage 3 completes
- [x] Expandable detail views for each territory

## 8. Tests (TDD — write before implementation)
- [x] `tests/territory-generation/territory-schema.test.ts` — schema validation + divergence (25 tests)
- [x] `tests/visual-dna/visual-dna-schema.test.ts` — schema validation + palette + ingredients (27 tests)
- [x] `tests/territory-generation/gemini-call.test.ts` — mocked Gemini call shape (6 tests)
- [x] `tests/visual-dna/gemini-call.test.ts` — mocked Gemini call shape (6 tests)
- [x] `tests/territory-generation/firestore-write.test.ts` — Firestore write contract (8 tests)
- [x] `tests/visual-dna/firestore-write.test.ts` — Firestore write contract (9 tests)

## 9. Deploy + verify
- [x] Deploy to Vercel
- [x] End-to-end test: brief → parse → territories → visual DNA
- [x] Verify Firestore writes for both stages
- [x] Verify UI shows territory cards + Visual DNA panel

## Implementation notes

- **Token limit**: Territory generation requires 8192 max tokens (3 full territories is a large output). Initially set to 3072 which caused truncation.
- **Brand rules**: Gemini handles "do X" → "do Y" translation in-prompt rather than via a separate function. The system prompt instructs the model to convert negative constraints to positive prompts.
- **Visual DNA merge**: Multiple visual-dna calls for the same run merge into one Firestore document keyed by territory_id. Token costs accumulate.
- **maxTokens bump**: Both territory and visual-dna routes use 8192 tokens to ensure complete JSON output.
