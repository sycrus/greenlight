# Day 1 — Technical Design

## GCP setup

- Project: `greenlight-v01`
- Region: `us-central1` (Vertex AI + Imagen availability)
- Service account: `greenlight-agent@greenlight-v01.iam.gserviceaccount.com`
- IAM roles:
  - `roles/aiplatform.user` — Vertex AI API calls
  - `roles/datastore.user` — Firestore reads/writes
  - `roles/storage.admin` — GCS bucket management
  - `roles/cloudfunctions.developer` — Deploy Cloud Functions
  - `roles/drive.file` — Slides + Drive API (delegated domain-wide, scoped)

## Next.js scaffold

- Next.js 14 App Router on Vercel
- Route: `POST /api/brief` — accepts brief text + brand rules, calls Gemini, returns parsed_brief
- Route: `GET /api/run/[runId]` — fetches pipeline state from Firestore
- Page: `/` — brief input form (textarea + brand rules fields)
- Page: `/run/[runId]` — pipeline status dashboard
- Tailwind CSS for styling

## Gemini 2.5 Flash integration

- Call via `@google-cloud/aiplatform` SDK (not via Vertex AI Agent Engine — that comes in Day 7)
- System prompt compresses the PRD §5 Stage 1 parsed_brief schema
- Response parsed with the same pattern as `backend/agent/src/agents/slide-deck.ts` (strip fences, find JSON, parse, validate)
- Fallback: retry once on parse failure with stricter prompt

## Firestore writes

- Collection: `runs/{run_id}/stages/brief_parsing`
- Fields: parsed_brief (JSON), brief_gaps (array), confidence_score (float), token_cost (float), created_at (timestamp), operator (string)

## Cost tracking

- Token count from Gemini `usageMetadata` in response
- Cost calculated at $0.00001875 / 1k input tokens, $0.000075 / 1k output tokens (Gemini 2.5 Flash pricing)
- Written to Firestore stage record
