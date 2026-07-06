# Day 1 — Implementation Tasks

## 1. GCP provisioning
- [x] Create GCP project `agentic-499802` with billing enabled
- [x] Enable APIs: Vertex AI, Firestore, Cloud Storage, Cloud Functions, Cloud Run, Google Slides, Google Drive
- [x] Create service account `greenlight-agent`
- [x] Assign IAM roles: `aiplatform.user`, `datastore.user`, `storage.admin`, `cloudfunctions.developer`
- [x] Authenticate via ADC (`gcloud auth application-default login`) — no service account key file needed
- [x] Create Firestore database in native mode
- [x] Create GCS bucket `greenlight-assets-agentic-499802` with uniform access control

## 2. Next.js scaffold
- [x] Create Next.js 14 App Router in `greenlight/app/`
- [x] Configure Tailwind CSS
- [x] Set up environment variables (`.env.example` + `.env`)
- [x] Build `POST /api/brief` route — calls Gemini 2.5 Flash
- [x] Build `GET /api/run/[runId]` route — reads Firestore
- [x] Build brief input page (`/`) — textarea + brand rules form fields
- [ ] Build pipeline status page (`/run/[runId]`)

## 3. Gemini 2.5 Flash brief parsing
- [x] Implement `lib/gemini.ts` — adapter wrapping `@google-cloud/vertexai` (switched from `PredictionServiceClient`)
- [x] Write system prompt for brief parsing (parsed_brief JSON schema from PRD §5)
- [x] Implement JSON parse + validate helper (`parseGeminiJson`, `validateParsedBrief`)
- [x] Implement brief gaps detection logic
- [x] Implement confidence score extraction
- [x] End-to-end verified: brief input → Gemini → parsed JSON → Firestore ✅

## 4. Firestore integration
- [x] Implement `lib/firestore.ts` — client wrapper (ADC fallback)
- [x] Write parsed brief to `/runs/{run_id}/stages/brief_parsing`
- [x] Write cost record with token counts

## 5. Tests (TDD)
- [x] `tests/brief-parsing/brief-parsing.test.ts` — schema validation (39 tests pass)
- [ ] `tests/brief-parsing/gemini-adapter.test.ts` — API call shape + error handling
- [ ] `tests/brief-parsing/firestore-write.test.ts` — stage record shape

## 6. Deploy
- [ ] Deploy Next.js to Vercel
- [ ] Verify Firestore writes from deployed app
- [ ] Verify Gemini calls from deployed app

## Implementation notes

- **SDK switch**: `@google-cloud/aiplatform`'s `PredictionServiceClient` does not support Gemini (uses legacy Predict API). Switched to `@google-cloud/vertexai`'s `VertexAI` client which calls `generateContent`.
- **Auth**: Using ADC impersonation instead of service account key files. `gcloud auth application-default login` + `set-quota-project`.
- **Config fix**: Renamed `next.config.ts` → `next.config.mjs` (Next.js 14 doesn't support `.ts` config).
- **Region**: `us-central1` for Vertex AI. `asia-southeast1` did not have Gemini 2.5 Flash at time of setup.
