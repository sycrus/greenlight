# Day 4 — Dual Output Generation + Approval Gates

## Why

Stages 1–3 produce parsed briefs, creative territories, and Visual DNA with reference images. But the pipeline has no output and no governed approval. Stage 4 generates the two outputs that make the system useful: a Google Slides pre-production deck for human review, and a Flow-ready creative package for production handoff. Two sequential permission gates — ECD then client — must be passed before the Flow package is released.

This is the final integration stage. It connects every prior stage to a governed handoff.

## What changes

- **Google Slides deck generation**: Programmatic deck via Slides API + Gemini copy generation, two variants (ECD internal, client external), shared via Drive API
- **Flow package assembly**: Structured JSON from all 3 Visual DNA objects, stored in GCS, released on Gate 2 approval
- **ECD approval gate (Gate 1)**: Approval form + API route, Firestore audit record, revision cycle tracking
- **Client approval gate (Gate 2)**: Approval form + API route, Flow package release trigger, run summary write
- **UI updates**: Deck generation trigger, approval form pages, Flow package download link

## Out of scope

- Vertex AI Pipelines (Kubeflow) tracing — Firestore audit trail suffices for v0.1
- Email notifications (CD handoff email) — download link shown in UI instead
- Cloud Functions for gate handlers — Next.js API routes serve the same purpose in v0.1
- Revision workflow (re-generating territories/slides after ECD feedback) — gate records capture revision intent; actual re-generation is manual in v0.1
- Google account auth for ECD — name/email manually entered in prototype
- Vertex AI Agent Engine — direct Gemini API calls continue the established pattern
