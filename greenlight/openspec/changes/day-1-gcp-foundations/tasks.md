# Day 1 — Implementation Tasks

## 1. GCP provisioning
- [ ] Create GCP project `greenlight-v01` with billing enabled
- [ ] Enable APIs: Vertex AI, Firestore, Cloud Storage, Cloud Functions, Cloud Run, Google Slides, Google Drive
- [ ] Create service account `greenlight-agent`
- [ ] Assign IAM roles: `aiplatform.user`, `datastore.user`, `storage.admin`, `cloudfunctions.developer`
- [ ] Download service account JSON key → store as `GCP_SERVICE_ACCOUNT_KEY` in Vercel env
- [ ] Create Firestore database in native mode
- [ ] Create GCS bucket `greenlight-assets` with uniform access control

## 2. Next.js scaffold
- [ ] Create Next.js 14 App Router in `greenlight/app/`
- [ ] Configure Tailwind CSS
- [ ] Set up environment variables (`.env.example` + Vercel env)
- [ ] Build `POST /api/brief` route — calls Gemini 2.5 Flash
- [ ] Build `GET /api/run/[runId]` route — reads Firestore
- [ ] Build brief input page (`/`) — textarea + brand rules form fields
- [ ] Build pipeline status page (`/run/[runId]`)

## 3. Gemini 2.5 Flash brief parsing
- [ ] Implement `lib/gemini.ts` — adapter wrapping `@google-cloud/aiplatform`
- [ ] Write system prompt for brief parsing (parsed_brief JSON schema from PRD §5)
- [ ] Implement JSON parse + validate helper (`lib/parse-json.ts`)
- [ ] Implement brief gaps detection logic
- [ ] Implement confidence score extraction

## 4. Firestore integration
- [ ] Implement `lib/firestore.ts` — client wrapper
- [ ] Write parsed brief to `/runs/{run_id}/stages/brief_parsing`
- [ ] Write cost record with token counts

## 5. Tests (TDD)
- [ ] `tests/brief-parsing/brief-parsing.test.ts` — schema validation
- [ ] `tests/brief-parsing/gemini-adapter.test.ts` — API call shape + error handling
- [ ] `tests/brief-parsing/firestore-write.test.ts` — stage record shape

## 6. Deploy
- [ ] Deploy Next.js to Vercel
- [ ] Verify Firestore writes from deployed app
- [ ] Verify Gemini calls from deployed app
