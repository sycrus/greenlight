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
| Brief parsing agent | Vertex AI Agent Engine (Gemini 2.5 Flash) | Managed runtime, native Vertex tracing |
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
- **Firestore**, **Cloud Storage**, **Cloud Functions** APIs enabled
- **Google Slides API** and **Google Drive API** enabled
- **Node.js 20.19+** and **pnpm**

### Setup

```bash
# 1. Clone and install
git clone <repo-url> && cd greenlight
pnpm install

# 2. GCP foundation (creates service account, enables APIs, sets IAM roles)
./scripts/setup-gcp.sh

# 3. Configure environment
cp .env.example .env
# Fill in: GCP_PROJECT_ID, GCP_SERVICE_ACCOUNT_EMAIL, VERTEX_LOCATION

# 4. Initialize OpenSpec (spec-driven development)
npm install -g @fission-ai/openspec@latest
openspec init

# 5. Start development
cd greenlight/app && pnpm dev    # Next.js on :3000
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
pnpm --filter greenlight test
pnpm --filter greenlight test:watch   # TDD loop

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
openspec update              # Update OpenSpec agent instructions
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
