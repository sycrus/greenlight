# Day 4 — Implementation Tasks

## 1. Dependencies + setup
- [x] Add `googleapis` to package.json (`pnpm add googleapis`)
- [x] Add env vars: `ECD_EMAIL`, `CLIENT_EMAIL` to `.env` + `.env.example`
- [x] Verify service account has Slides + Drive API scopes enabled in GCP console

## 2. Slides + Drive library
- [x] Implement `lib/slides.ts` — adapter wrapping Google Slides + Drive APIs
- [x] `createDeck(title: string): Promise<string>` — creates new presentation, returns ID
- [x] `populateSlides(presentationId, slidesData): Promise<void>` — batchUpdate with slide content
- [x] `shareDeck(presentationId, email, role): Promise<string>` — Drive permissions, returns URL
- [x] `duplicateDeck(presentationId, newTitle): Promise<string>` — Drive copy, returns new ID
- [x] `removeSlides(presentationId, slideIndices): Promise<void>` — removes internal-only slides
- [x] Handle API errors: quota (429), auth (403), not found (404)
- [x] **DEPRIORITIZED**: Slides API replaced by HTML deck at `/run/[runId]/deck` — no Google Slides dependency at runtime

## 3. Deck copy prompt
- [x] Implement `lib/prompts/deck-copy.ts` — system prompt for Gemini slide copy generation
- [x] Input: parsed brief + 3 territories + 3 Visual DNA objects
- [x] Output: structured JSON with all slide text (title, territories, visual overview, brand alignment, approval, next steps)
- [x] Include Slide API placeholder tags in prompt (`{{BRAND}}`, `{{T1_NAME}}`, etc.)
- [x] Generate both ECD and client versions of approval slide copy

## 4. Slides types
- [x] Add `SlideDeckCopy`, `TerritorySlideData`, `SlidesDeckOutput` types to `lib/types/pipeline.ts`

## 5. Deck generation API — `POST /api/generate-deck`
- [x] Read parsed brief, territories, Visual DNA from Firestore
- [x] Call Gemini for deck copy via deck copy prompt
- [x] Parse + validate slide copy JSON
- [x] Deck rendered as React HTML page at `/run/[runId]/deck?variant=ecd|client`
- [x] Write output record to Firestore (`/runs/{runId}/stages/output-generation`)
- [x] Cost tracking: Gemini tokens + Slides API call count
- [x] Handle errors: missing stages, Gemini timeout, Slides API failures

## 6. Flow package assembly
- [x] Implement `lib/flow-package.ts` — shared `assembleFlowPackage()` + `uploadFlowPackage()`
- [x] Implement `POST /api/generate-flow-package` — standalone Flow package assembly + GCS upload
- [x] Generate-deck route also calls shared lib (no duplication)
- [x] Flatten + deduplicate ingredients across territories
- [x] Generate `flow_session_brief` from parsed brief + territory context
- [x] Generate `scene_briefs[]` per territory per scene count
- [x] Aggregate + deduplicate `brand_rules_as_prompts` and `negative_prompt_list`
- [x] Upload to GCS: `runs/{runId}/flow-package.json`
- [x] Store GCS URI in Firestore output-generation record

## 7. Gate 1 API — `POST /api/gates/ecd`
- [x] Validate inputs: runId exists, territory valid, approval status valid
- [x] Require notes if REVISIONS_REQUIRED
- [x] Read existing gate record for revision cycle tracking
- [x] Write gate record to `/runs/{runId}/gates/ecd_approval`
- [x] Handle errors: invalid territory, missing run, duplicate submission

## 8. Gate 2 API — `POST /api/gates/client`
- [x] Validate Gate 1 is passed (APPROVED or APPROVED_WITH_REVISIONS)
- [x] Validate inputs: territory valid, approval status valid
- [x] Require notes if REVISIONS_REQUIRED
- [x] Write gate record to `/runs/{runId}/gates/client_approval`
- [x] On APPROVED/APPROVED_WITH_NOTES: trigger Flow release
  - [x] Read flow-package.json from GCS
  - [x] Update with approver metadata + released_at
  - [x] Re-upload to GCS
  - [x] Generate GCS signed URL (48hr expiry)
  - [x] Write run summary to `/runs/{runId}/summaries/main`
- [x] Handle errors: Gate 1 not passed, GCS failures on release

## 9. Approval form pages (UI)
- [x] Build ECD approval form page (`/run/[runId]/approve/ecd`)
  - [x] Territory radio selector (labels from Firestore territory data)
  - [x] Approval status radio (Approved / Approved with revisions / Revisions required)
  - [x] Notes textarea (shown when "revisions required")
  - [x] Name + email fields
  - [x] Submit handler → POST /api/gates/ecd
  - [x] Success state with next steps
- [x] Build client approval form page (`/run/[runId]/approve/client`)
  - [x] Same as ECD but with name + title + email fields
  - [x] Submit handler → POST /api/gates/client
  - [x] Flow package download link on approval
- [x] Gate status indicators on pipeline status page (already scaffolded, verify wiring)

## 10. UI updates — pipeline status page
- [x] "Generate Deck" button in Stage 4 row (when Stages 1-3 complete, Stage 4 not yet run)
- [x] Deck links: ECD deck URL + Client deck URL (clickable)
- [x] Flow package link (clickable, with "Released" badge after Gate 2)
- [x] Approval form links: "ECD Approval Form" + "Client Approval Form" buttons when gates are unlocked
- [x] Pipeline complete banner when summary exists

## 11. Tests (TDD)
- [x] `tests/slides/slides-api.test.ts` — mocked Slides API call shape (create, update, share, duplicate)
- [x] `tests/slides/deck-copy.test.ts` — Gemini deck copy prompt + JSON validation
- [x] `tests/slides/deck-generation.test.ts` — end-to-end deck generation flow (mocked APIs)
- [x] `tests/flow-package/assembly.test.ts` — Flow package JSON assembly + schema validation
- [x] `tests/flow-package/gcs-storage.test.ts` — GCS upload + signed URL generation
- [x] `tests/gates/ecd-gate.test.ts` — ECD gate validation + Firestore write
- [x] `tests/gates/client-gate.test.ts` — Client gate validation + Flow release trigger
- [x] `tests/gates/gate-locking.test.ts` — Gate 2 locked until Gate 1 passes
- [x] `tests/gates/firestore-gates.test.ts` — Gate record Firestore contract
- [x] ALL 325 tests passing across 23 files

## 12. Deploy + verify
- [ ] Deploy to Vercel
- [ ] End-to-end test: brief → parse → territories → visual DNA → deck → ECD gate → client gate → Flow release
- [ ] Verify HTML deck renders with both variants
- [ ] Verify Flow package JSON in GCS
- [ ] Verify Firestore gate records + summary
- [ ] Verify UI approval forms work end-to-end

## Implementation notes

- **Slides API deprioritized**: Decks render as HTML pages at `/run/[runId]/deck?variant=ecd|client` instead of Google Slides. The `lib/slides.ts` adapter is present but orphaned — HTML is the preferred rendering. No OAuth/Drive scopes needed.
- **Flow package shared lib**: `lib/flow-package.ts` provides `assembleFlowPackage()` and `uploadFlowPackage()`. Both `generate-deck` and `generate-flow-package` routes use it — no duplication.
- **Deck page**: Client variant hides risk flags + brand alignment slide. ECD variant shows everything.
- **Gate locking**: Client gate form checks ECD gate status on load and blocks with an explanatory message.
