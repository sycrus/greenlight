# Day 1 — GCP Foundations + Next.js Scaffold

## Why

The pipeline needs a live GCP project before any component can be built. Day 1 establishes the foundation layer: GCP APIs enabled, IAM service account with correct roles, Firestore ready for writes, and a Next.js shell on Vercel that can call Gemini 2.5 Flash.

## What changes

- Provision GCP project with Vertex AI, Firestore, GCS, Cloud Functions, Slides API, Drive API enabled
- Create service account with IAM roles: Vertex AI User, Firestore User, Storage Admin, Cloud Functions Developer, Slides/Drive API access
- Scaffold Next.js 14 App Router on Vercel with GCP environment variables
- Build brief input form (text + brand rules fields) wired to Gemini 2.5 Flash
- Display parsed brief output in UI
- Write parsed brief to Firestore `/runs/{run_id}/stages/brief_parsing`
- Implement cost tracking per brief parse (token count → Firestore)

## Out of scope

- Territory generation (Day 2)
- Imagen reference images (Day 3)
- Slides deck generation (Day 4)
- Approval gates (Day 5)
- Flow package (Day 6)
- Vertex Pipelines tracing (Day 7)
