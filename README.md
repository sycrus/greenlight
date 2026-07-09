# Greenlight — Pre-Production Intelligence Agent v0.1

Governed pre-production pipeline for short-form branded video. From client brief to approved creative direction with full human decision audit at every gate. Outputs a Google Slides pre-production deck (for human approval) and a Flow-ready creative package (for production handoff).

**Stack:** Vertex AI (Agent Engine, Pipelines, Gemini 2.5 Flash, Imagen 3, Firestore, GCS, Cloud Functions) + Google Slides/Drive APIs + Next.js 14 on Vercel.

---

## What this system does

```
CLIENT BRIEF (text + brand rules)
        │
        ▼
 Brief Parsing Agent      ← Gemini 2.5 Flash
        │
        ▼
 Creative Territory Gen   ← 3 distinct creative directions
        │
        ▼
 Visual DNA Encoding      ← Gemini 2.5 Flash + Imagen 3
        │
   ┌────┴────┐
   ▼         ▼
Slides Deck  Flow Package
   │         (locked)
   ▼
Gate 1: ECD Approval      ← Slides review + approval form
   │
   ▼
Gate 2: Client Approval   ← Client-facing deck + approval form
   │
   ▼
Flow Package Released     ← CD begins production in Google Flow
```

**This system does not generate video.** It governs the decisions that happen _before_ Flow opens — and creates the audit record that explains why the production went in the direction it did.

The canonical spec is [`PRD.md`](./PRD.md) — read it before writing code.

---

## User flow (producer walkthrough)

This is the complete end-to-end path a producer takes to go from client brief to approved creative package.

### 1. Submit a brief (`/`)

The producer opens the app and sees a simple form:

- **Creative Brief** — paste the raw client brief (unstructured text)
- **Brand Rules** (optional) — palette, typography, logo usage, restricted imagery, competitor names

Clicking **"Parse Brief"** sends the brief to Gemini 2.5 Flash, which extracts structured data: brand name, campaign objective, target audience, key message, tone descriptors, format specs, and any gaps or missing information. The parsed result appears on screen with a confidence score and a run ID.

> **Firestore write:** `/runs/{runId}/stages/brief-parsing`

### 2. Generate creative territories (automatic)

After the brief is parsed, the producer navigates to `/run/{runId}`. The pipeline status page shows Stage 1 as complete.

The producer clicks **"Generate Territories"** (or the system triggers it automatically). Gemini generates 3 distinct creative territories, each with a name, creative proposition, visual language, tone, emotional arc, suggested scene count, and Flow prompt style. The territories are validated for divergence — if two territories share too much visual language, a warning is shown.

> **Firestore write:** `/runs/{runId}/stages/territory-generation`

### 3. Encode Visual DNA (automatic)

With territories generated, the system proceeds to Visual DNA encoding. For each territory, Gemini produces:

- **Palette** (primary, accent, forbidden hex colors)
- **Ingredients** (characters, locations, objects, brand assets) with Flow-compatible prompts
- **Cinematography** (style, shot types, camera movement, lighting, color grade)
- **Brand rules as positive prompts** (model translates negative constraints into actionable direction)

> **Firestore write:** `/runs/{runId}/stages/visual-dna`

### 4. Generate reference images (on demand)

On the pipeline status page, each Visual DNA ingredient shows a **"Generate Image"** button. Clicking it calls Imagen 3 (via Gemini image generation) and uploads the result to GCS. Brand assets skip generation — they use uploaded logos instead. Images appear as thumbnails in the UI.

> **GCS path:** `runs/{runId}/references/{ingredientId}_{timestamp}.png`

### 5. Generate pre-production deck

When Stages 1–3 are complete, a **"Generate Deck"** button appears on the pipeline status page. Clicking it:

1. Gemini generates slide copy for all 15 slides in a single call
2. Google Slides API creates a new presentation and populates slides with the generated copy, territory data, palette swatches, and Visual DNA details
3. The ECD version (internal) is shared via Drive API with Commenter access
4. A client version is created by duplicating the ECD deck, removing the Brand Alignment slide (risk flags and internal rationale), and sharing with Viewer access
5. A Flow-ready JSON package is assembled from all 3 Visual DNA objects and uploaded to GCS
6. The output record is written to Firestore with deck URLs and Flow package URI

> **Firestore write:** `/runs/{runId}/stages/output-generation`

The pipeline status page now shows clickable links to both decks and the Flow package.

### 6. ECD approval — Gate 1 (`/run/{runId}/approve/ecd`)

With the deck generated, an **"ECD Approval Form"** button appears. The ECD:

1. Reviews the internal deck in Google Slides (can add comments directly)
2. Opens the approval form via the link on the pipeline page
3. Selects a preferred territory (radio: T1 / T2 / T3)
4. Chooses a status: **Approved**, **Approved with revisions**, or **Revisions required**
5. If revisions required, provides notes explaining what needs to change
6. Enters name and email, clicks Submit

The gate record is written to Firestore. If approved, Gate 2 unlocks. If revisions are required, the producer reworks the territories or Visual DNA and regenerates the affected slides.

> **Firestore write:** `/runs/{runId}/gates/ecd_approval`

### 7. Client approval — Gate 2 (`/run/{runId}/approve/client`)

With ECD approval, the client deck is shared and a **"Client Approval Form"** link appears. The client:

1. Reviews the client-facing deck (clean — no internal notes, no risk flags)
2. Opens the approval form
3. Selects preferred territory
4. Chooses: **Approved**, **Approved with minor notes**, or **Revisions required**
5. Enters name, title, and email, clicks Submit

> **Firestore write:** `/runs/{runId}/gates/client_approval`

### 8. Flow package release

On client approval, the system automatically:

1. Updates `flow-package.json` in GCS with the approved territory ID, ECD and client names, and release timestamp
2. Generates a signed GCS URL (48-hour expiry)
3. Writes a run summary to Firestore with total costs, revision cycles, and the Flow package URI
4. Shows a **"Download Flow Package"** button in the UI

The CD receives the Flow package — a structured JSON document containing all reference images, ingredient prompts, scene briefs, and brand rules — ready to import into Google Flow.

> **Firestore write:** `/runs/{runId}/summaries/main`

### The audit record

Every stage and gate writes to Firestore. The run history is fully traceable:

```
/runs/{runId}
  ├── stages/brief-parsing      — parsed brief, gaps, confidence, token cost
  ├── stages/territory-generation — 3 territories, divergence warnings, token cost
  ├── stages/visual-dna          — 3 Visual DNA objects, palettes, ingredients, token cost
  ├── stages/output-generation   — deck IDs, deck URLs, Flow package URI, token cost
  ├── gates/ecd_approval         — who approved, which territory, when, revision cycles
  ├── gates/client_approval      — who approved, which territory, when, revision cycles
  └── summaries/main             — brand, approved territory, total costs, Flow package URI
```

No decision is lost. No rationale is missing. The pipeline tells its own story.

---

## Project structure

```
./
├── greenlight/             App — Greenlight v0.1 (Vertex AI)
│   ├── app/                Next.js 14 App Router (Vercel)
│   ├── lib/                Shared types, GCP client wrappers
│   ├── pipelines/          Vertex AI Pipelines component definitions
│   ├── functions/          Cloud Functions (approval gates)
│   ├── tests/              TDD test suite
│   └── openspec/           Spec-driven development artifacts
├── backend/                Frozen — predecessor reference patterns
│   └── agent/src/
│       ├── providers/      LLM adapter pattern
│       ├── types/          Typed component spec + agent routing
│       ├── observability/  OTel + Langfuse tracing patterns
│       ├── agents/         Structured JSON generation + parsing
│       └── skills/         SKILL.md behavioural spec pattern
├── docs/archive/           Superseded predecessor PRD
├── PRD.md                  Canonical spec — source of truth
├── CLAUDE.md               Operational guidance for Claude Code
└── README.md               This file
```

**Predecessor context:** The `backend/` directory is a frozen reference — the original Endava lead-gen deck agent built on Parlant + LangGraph + Anthropic Claude + Mem0 + llama-rag + Langfuse. Its patterns (LLM adapter, structured JSON output, typed component specs, observability) informed Greenlight's architecture. It is not built, deployed, or extended. See [`PRD.md §7`](./PRD.md) for the component-by-component migration map.

---

## Tech stack

| Function | Service | Why |
|---|---|---|
| Brief parsing agent | Gemini 2.5 Flash via `@google-cloud/vertexai` SDK | Native ADC auth, structured JSON output |
| Territory & Visual DNA generation | Gemini 2.5 Flash via Vertex AI API | Structured JSON output, cost attribution |
| Reference image generation | Imagen 3 via Vertex AI API | GCS-native output, SynthID watermarking |
| Pipeline orchestration & tracing | Vertex AI Pipelines (Kubeflow) | Component-level audit, cost per stage |
| Audit storage | Firestore | Real-time writes, document model, GCP IAM |
| Asset storage | Google Cloud Storage | Native to Imagen and Flow, signed URLs |
| Approval gate functions | Cloud Functions (Gen 2) | Serverless, triggered by form submission |
| Deck generation & sharing | Google Slides API + Drive API | Native to approver workflow |
| Frontend | Next.js 14 (App Router) on Vercel | API routes for GCP calls, server-side credentials |
| Spec-driven development | OpenSpec | Changes tracked as proposals → specs → designs → tasks |
| Testing | Vitest (TS) + pytest (Python CFs) | TDD — tests written before implementation |

---

## Quick start

### Prerequisites

- **Google Cloud project** with billing enabled
- **Vertex AI API** enabled (Gemini 2.5 Flash, Imagen 3)
- **Vertex AI Studio TOS** accepted (open [Vertex AI Studio](https://console.cloud.google.com/vertex-ai/studio) in console)
- **Firestore**, **Cloud Storage**, **Cloud Functions** APIs enabled
- **Google Slides API** and **Google Drive API** enabled
- **Node.js 20.19+** and **pnpm**

### Setup

```bash
# 1. Clone and install
git clone <repo-url> && cd greenlight/greenlight
pnpm install

# 2. GCP foundation (creates service account, enables APIs, sets IAM roles)
GCP_PROJECT=<your-project-id> ../scripts/setup-gcp.sh

# 3. Authenticate with Application Default Credentials (ADC)
gcloud auth login
gcloud auth application-default login
gcloud auth application-default set-quota-project <your-project-id>

# 4. Configure environment
cp .env.example .env
# Fill in: GCP_PROJECT_ID, GCP_SERVICE_ACCOUNT_EMAIL, VERTEX_LOCATION
# No service account key needed — ADC handles auth automatically

# 5. Start development
pnpm dev    # Next.js on :3000
```

---

## Development workflow

### Spec-driven development (OpenSpec)

Every feature or fix starts as an OpenSpec **change**:

```
/opsx:explore              Explore the codebase and shape a plan
/opsx:propose <change>     Create proposal.md + specs/ + design.md + tasks.md
/opsx:apply                Implement tasks from the plan
/opsx:archive              Archive completed change, update specs
```

Changes live in `greenlight/openspec/changes/` and are archived to `greenlight/openspec/archive/` on completion.

### Test-driven development

**Tests are written before implementation.** No exceptions.

```bash
# TypeScript (Vitest) — greenlight/
cd greenlight && pnpm test
cd greenlight && pnpm test:watch   # TDD loop

# Python (pytest) — Cloud Functions
cd greenlight/functions && pytest tests/ -v
```

Test structure mirrors the pipeline stages:

```
greenlight/tests/
├── brief-parsing/        Stage 1 tests
├── territory-generation/ Stage 2 tests
├── visual-dna/           Stage 3 tests
├── output-generation/    Stage 4 tests
├── gates/                ECD + client approval tests
└── pipeline/             End-to-end pipeline tests
```

### Before committing

```bash
pnpm test                    # All tests must pass
pnpm lint                    # TypeScript check
```

---

## Key documents

| Document | What it covers |
|---|---|
| [`PRD.md`](./PRD.md) | Canonical spec — problem, architecture, stages, data models, gates, build plan |
| [`CLAUDE.md`](./CLAUDE.md) | Operational guidance for Claude Code in this repo |
| [`docs/archive/prd-v0.2-superseded-2026-06.md`](./docs/archive/prd-v0.2-superseded-2026-06.md) | Superseded predecessor PRD (historical reference) |

---

## Build plan (7 days)

| Day | Scope |
|---|---|
| 1 | GCP foundations — APIs, IAM, Firestore, Next.js scaffold, brief input → Gemini |
| 2 | Territory generation + Visual DNA encoding prompt engineering |
| 3 | Imagen 3 reference generation + GCS asset management |
| 4 | Google Slides API deck generation (ECD + client versions) |
| 5 | Cloud Functions for approval gates + Firestore gate records |
| 6 | Flow package JSON assembly + run summary + end-to-end test |
| 7 | Vertex Pipelines trace integration + demo preparation |

---

## Success criteria

The prototype is successful if a 12-minute demo answers yes to all:

- [ ] Complete pipeline run from brief input to Flow package release
- [ ] Two permission gates — who approved, what, when
- [ ] Pipeline cost broken down by component
- [ ] Google Slides deck generated and explainable
- [ ] Visual DNA object shown propagating into Flow
- [ ] Vertex Pipelines dashboard navigable per component
- [ ] Vertex AI platform rationale explainable vs. LangGraph + Langfuse
- [ ] Firestore run summary tells the pipeline story without narration

---

*Greenlight — Joe Chung, 2026. Built on Google Cloud Vertex AI.*
