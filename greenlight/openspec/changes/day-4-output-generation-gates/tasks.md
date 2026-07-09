# Day 4 — Implementation Tasks

## 1. Dependencies + setup
- [ ] Add `googleapis` to package.json (`pnpm add googleapis`)
- [ ] Add env vars: `ECD_EMAIL`, `CLIENT_EMAIL` to `.env` + `.env.example`
- [ ] Verify service account has Slides + Drive API scopes enabled in GCP console

## 2. Slides + Drive library
- [ ] Implement `lib/slides.ts` — adapter wrapping Google Slides + Drive APIs
- [ ] `createDeck(title: string): Promise<string>` — creates new presentation, returns ID
- [ ] `populateSlides(presentationId, slidesData): Promise<void>` — batchUpdate with slide content
- [ ] `shareDeck(presentationId, email, role): Promise<string>` — Drive permissions, returns URL
- [ ] `duplicateDeck(presentationId, newTitle): Promise<string>` — Drive copy, returns new ID
- [ ] `removeSlides(presentationId, slideIndices): Promise<void>` — removes internal-only slides
- [ ] Handle API errors: quota (429), auth (403), not found (404)

## 3. Deck copy prompt
- [ ] Implement `lib/prompts/deck-copy.ts` — system prompt for Gemini slide copy generation
- [ ] Input: parsed brief + 3 territories + 3 Visual DNA objects
- [ ] Output: structured JSON with all slide text (title, territories, visual overview, brand alignment, approval, next steps)
- [ ] Include Slide API placeholder tags in prompt (`{{BRAND}}`, `{{T1_NAME}}`, etc.)
- [ ] Generate both ECD and client versions of approval slide copy

## 4. Slides types
- [ ] Add `SlideDeckCopy`, `TerritorySlideData`, `SlidesDeckOutput` types to `lib/types/pipeline.ts`

## 5. Deck generation API — `POST /api/generate-deck`
- [ ] Read parsed brief, territories, Visual DNA from Firestore
- [ ] Call Gemini for deck copy via deck copy prompt
- [ ] Parse + validate slide copy JSON
- [ ] Create ECD presentation via Slides API
- [ ] Populate slides with generated copy + placeholder replacement
- [ ] Share ECD deck with `ECD_EMAIL` (Commenter)
- [ ] Duplicate ECD deck → client version
- [ ] Remove Brand Alignment slide + strip risk flags from client version
- [ ] Share client deck with `CLIENT_EMAIL` (Viewer)
- [ ] Write output record to Firestore (`/runs/{runId}/stages/output-generation`)
- [ ] Cost tracking: Gemini tokens + Slides API call count
- [ ] Handle errors: missing stages, Gemini timeout, Slides API failures

## 6. Flow package assembly
- [ ] Implement `POST /api/generate-flow-package` — assembles Flow package JSON
- [ ] Read all 3 Visual DNA objects from Firestore
- [ ] Flatten + deduplicate ingredients across territories
- [ ] Generate `flow_session_brief` from parsed brief + territory context
- [ ] Generate `scene_briefs[]` per territory per scene count
- [ ] Aggregate + deduplicate `brand_rules_as_prompts` and `negative_prompt_list`
- [ ] Upload to GCS: `runs/{runId}/flow-package.json`
- [ ] Store GCS URI in Firestore output-generation record

## 7. Gate 1 API — `POST /api/gates/ecd`
- [ ] Validate inputs: runId exists, territory valid, approval status valid
- [ ] Require notes if REVISIONS_REQUIRED
- [ ] Read existing gate record for revision cycle tracking
- [ ] Write gate record to `/runs/{runId}/gates/ecd_approval`
- [ ] Handle errors: invalid territory, missing run, duplicate submission

## 8. Gate 2 API — `POST /api/gates/client`
- [ ] Validate Gate 1 is passed (APPROVED or APPROVED_WITH_REVISIONS)
- [ ] Validate inputs: territory valid, approval status valid
- [ ] Require notes if REVISIONS_REQUIRED
- [ ] Write gate record to `/runs/{runId}/gates/client_approval`
- [ ] On APPROVED/APPROVED_WITH_NOTES: trigger Flow release
  - [ ] Read flow-package.json from GCS
  - [ ] Update with approver metadata + released_at
  - [ ] Re-upload to GCS
  - [ ] Generate GCS signed URL (48hr expiry)
  - [ ] Write run summary to `/runs/{runId}/summaries/main`
- [ ] Handle errors: Gate 1 not passed, GCS failures on release

## 9. Approval form pages (UI)
- [ ] Build ECD approval form page (`/run/[runId]/approve/ecd`)
  - [ ] Territory radio selector (labels from Firestore territory data)
  - [ ] Approval status radio (Approved / Approved with revisions / Revisions required)
  - [ ] Notes textarea (shown when "revisions required")
  - [ ] Name + email fields
  - [ ] Submit handler → POST /api/gates/ecd
  - [ ] Success state with next steps
- [ ] Build client approval form page (`/run/[runId]/approve/client`)
  - [ ] Same as ECD but with name + title + email fields
  - [ ] Submit handler → POST /api/gates/client
  - [ ] Flow package download link on approval
- [ ] Gate status indicators on pipeline status page (already scaffolded, verify wiring)

## 10. UI updates — pipeline status page
- [ ] "Generate Deck" button in Stage 4 row (when Stages 1-3 complete, Stage 4 not yet run)
- [ ] Deck links: ECD deck URL + Client deck URL (clickable)
- [ ] Flow package link (clickable, with "Released" badge after Gate 2)
- [ ] Approval form links: "ECD Approval Form" + "Client Approval Form" buttons when gates are unlocked
- [ ] Pipeline complete banner when summary exists

## 11. Tests (TDD — write before implementation)
- [ ] `tests/slides/slides-api.test.ts` — mocked Slides API call shape (create, update, share, duplicate)
- [ ] `tests/slides/deck-copy.test.ts` — Gemini deck copy prompt + JSON validation
- [ ] `tests/slides/deck-generation.test.ts` — end-to-end deck generation flow (mocked APIs)
- [ ] `tests/flow-package/assembly.test.ts` — Flow package JSON assembly + schema validation
- [ ] `tests/flow-package/gcs-storage.test.ts` — GCS upload + signed URL generation
- [ ] `tests/gates/ecd-gate.test.ts` — ECD gate validation + Firestore write
- [ ] `tests/gates/client-gate.test.ts` — Client gate validation + Flow release trigger
- [ ] `tests/gates/gate-locking.test.ts` — Gate 2 locked until Gate 1 passes
- [ ] `tests/gates/firestore-gates.test.ts` — Gate record Firestore contract

## 12. Deploy + verify
- [ ] Deploy to Vercel
- [ ] End-to-end test: brief → parse → territories → visual DNA → deck → ECD gate → client gate → Flow release
- [ ] Verify Slides deck created + shared (check Google Drive)
- [ ] Verify Flow package JSON in GCS
- [ ] Verify Firestore gate records + summary
- [ ] Verify UI approval forms work end-to-end
