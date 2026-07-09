# Day 4 — Technical Design

## 1. Architecture overview

```
Stage 4 API (POST /api/generate-deck)
    │
    ├─► Gemini 2.5 Flash → generates slide copy (JSON)
    ├─► Google Slides API → creates presentation, populates slides
    ├─► Google Drive API → shares ECD deck (Commenter), client deck (Viewer)
    ├─► Firestore write → /runs/{runId}/stages/output-generation
    │
    ▼
Gate 1 (POST /api/gates/ecd)
    │
    ├─► Firestore write → /runs/{runId}/gates/ecd_approval
    ├─► If REVISIONS_REQUIRED → gate stays open, revision cycle incremented
    ├─► If APPROVED/APPROVED_WITH_REVISIONS → Gate 2 unlocked
    │
    ▼
Gate 2 (POST /api/gates/client)
    │
    ├─► Firestore write → /runs/{runId}/gates/client_approval
    ├─► If APPROVED/APPROVED_WITH_NOTES → Flow package released
    │   ├─► Update flow-package.json with approver info + released_at
    │   ├─► Generate GCS signed URL (48hr expiry)
    │   └─► Write run summary to Firestore
    └─► If REVISIONS_REQUIRED → gate stays open
```

## 2. Component design

### 2a. Slides library (`lib/slides.ts`)

New file wrapping Google Slides + Drive APIs. Follows the single-adapter pattern of `lib/gemini.ts`.

```typescript
// Key functions:
createDeck(title: string): Promise<string>           // → presentationId
addTitleSlide(presentationId, title, subtitle): void
addTerritorySlides(presentationId, territories, visualDna): void
addApprovalSlide(presentationId, territories): void
shareDeck(presentationId, email, role): Promise<string>  // → deck URL
duplicateDeck(presentationId, title): Promise<string>    // → client copy
```

**Authentication**: Same service account as Vertex AI + GCS. Requires Slides + Drive API scopes. The service account already has these APIs enabled from Day 1.

**Slide creation pattern**: Use `slides.presentations.batchUpdate()` with `requests[]` array. Each request is a `createSlide`, `insertText`, or `replaceAllText` operation.

### 2b. Deck copy prompt (`lib/prompts/deck-copy.ts`)

Gemini generates all slide copy in one call to minimize API costs. Returns structured JSON:

```json
{
  "title_slide": { "headline": "...", "subtitle": "..." },
  "territories": {
    "t1": {
      "cover_headline": "...",
      "proposition_blurb": "...",
      "visual_summary": "...",
      "scene_arc_notes": "..."
    }
  },
  "approval_slide": { "instructions": "..." },
  "next_steps": "..."
}
```

### 2c. Deck generation API (`POST /api/generate-deck`)

```
Input: { runId }
Process:
  1. Read parsed brief + territories + visual DNA from Firestore
  2. Call Gemini to generate slide copy (one call for all slides)
  3. Create ECD presentation via Slides API
  4. Populate slides via batchUpdate
  5. Share ECD deck with configured ECD email (Commenter)
  6. Duplicate presentation for client version
  7. Remove internal-only slides (brand alignment/risk flags) from client copy
  8. Share client deck with configured client email (Viewer)
  9. Write output record to Firestore (slides_deck_id_ecd, slides_deck_id_client, deck_urls)
Output: { ecd_deck_url, client_deck_url, slides_deck_id_ecd, slides_deck_id_client }
```

### 2d. Flow package API (`POST /api/generate-flow-package`)

Called automatically by `generate-deck` — the Flow package is assembled alongside the deck.

```
Process:
  1. Read all 3 Visual DNA objects from Firestore
  2. Assemble Flow package JSON per PRD §5 Stage 4b
  3. Upload to GCS: runs/{runId}/flow-package.json
  4. Store GCS URI in Firestore output-generation record
```

The `approved_territory_id`, `approved_by_*`, `released_at` fields are set to `null` initially — they're filled in when Gate 2 passes.

### 2e. Approval gate API routes

**`POST /api/gates/ecd`**
```
Input: { runId, territorySelected, approvalStatus, notes, name, email }
Validation:
  - approvalStatus must be APPROVED | APPROVED_WITH_REVISIONS | REVISIONS_REQUIRED
  - notes required if REVISIONS_REQUIRED
  - territorySelected must match one of the 3 territory IDs
Write: Firestore /runs/{runId}/gates/ecd_approval per PRD §5 Gate 1 schema
Response: { gate: "ecd_approval", status: approvalStatus, revisionCycles }
```

**`POST /api/gates/client`**
```
Input: { runId, territorySelected, approvalStatus, notes, name, title, email }
Validation:
  - Gate 1 must be APPROVED or APPROVED_WITH_REVISIONS
  - approvalStatus must be APPROVED | APPROVED_WITH_NOTES | REVISIONS_REQUIRED
Write: Firestore /runs/{runId}/gates/client_approval per PRD §5 Gate 2 schema
If APPROVED/APPROVED_WITH_NOTES:
  → Flow handoff: update flow-package.json, generate signed URL, write summary
Response: { gate: "client_approval", status: approvalStatus, flowPackageUrl? }
```

### 2f. Flow handoff (triggered by Gate 2 approval)

```
Process:
  1. Read flow-package.json from GCS
  2. Update approved_territory_id, approved_by_ecd, approved_by_client, released_at
  3. Re-upload updated package to GCS
  4. Generate GCS signed URL (48-hour expiry)
  5. Write run summary to Firestore /runs/{runId}/summaries/main
```

## 3. Data flow

```
Brief (Stage 1)  ──► Territories (Stage 2)  ──► Visual DNA (Stage 3)
                                                       │
                                                       ▼
                                              POST /api/generate-deck
                                              ├─► Gemini: deck copy
                                              ├─► Slides API: ECD deck
                                              ├─► Slides API: Client deck
                                              ├─► Drive API: share both
                                              ├─► GCS: flow-package.json
                                              └─► Firestore: output-generation record
                                                       │
                                                       ▼
                                              POST /api/gates/ecd
                                              └─► Firestore: ecd_approval record
                                                       │
                                                       ▼
                                              POST /api/gates/client
                                              ├─► Firestore: client_approval record
                                              ├─► GCS: update flow-package.json
                                              └─► Firestore: run summary
```

## 4. Error handling

| Scenario | Handling |
|---|---|
| Slides API quota exceeded | Return 429, show retry-after in UI |
| Gemini deck copy timeout | Retry once, return partial deck on second failure |
| Missing territory/visual DNA data | Return 400 with specific missing stage |
| Gate 2 submitted before Gate 1 | Return 400 "Gate 1 not yet passed" |
| GCS signed URL generation fails | Return flow package GCS URI as fallback |
| Drive share fails (invalid email) | Return 400, prompt for valid email |

## 5. Firestore schema additions

### `/runs/{runId}/stages/output-generation`
```json
{
  "_meta": { "stage": "output-generation", "runId": "...", "tokenCost": 0.001, "updatedAt": "..." },
  "slides_deck_id_ecd": "1AbC...",
  "slides_deck_id_client": "1XyZ...",
  "ecd_deck_url": "https://docs.google.com/presentation/d/...",
  "client_deck_url": "https://docs.google.com/presentation/d/...",
  "flow_package_gcs_uri": "gs://.../flow-package.json",
  "flow_package_public_url": "https://storage.googleapis.com/.../flow-package.json",
  "slide_count_ecd": 20,
  "slide_count_client": 17
}
```

### `/runs/{runId}/gates/ecd_approval`
Per PRD §5 Gate 1 schema — see spec.

### `/runs/{runId}/gates/client_approval`
Per PRD §5 Gate 2 schema — see spec.

### `/runs/{runId}/summaries/main`
```json
{
  "runId": "...",
  "brand": "Nike",
  "approvedTerritory": "t1",
  "totalGeminiCost": 0.004,
  "totalImagenCost": 0.00,
  "revisionCyclesEcd": 0,
  "revisionCyclesClient": 0,
  "completedAt": "<timestamp>"
}
```

## 6. Dependencies

- `googleapis` — Google Slides + Drive API client (add to package.json)
- Service account needs Slides + Drive API scopes (already enabled Day 1)
- `ECD_EMAIL` and `CLIENT_EMAIL` env vars for deck sharing
