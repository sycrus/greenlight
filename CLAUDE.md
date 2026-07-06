# CLAUDE.md — Greenlight

Guidance for Claude Code working in this repo.

---

## Project context — read this first

This repo is Greenlight v0.1 — a governed pre-production pipeline for short-form branded video. **The authoritative spec is [`PRD.md`](./PRD.md)**. Read it before writing code.

**Active development** happens in `greenlight/`. The `backend/` directory is a frozen predecessor — architectural reference only. It is not built, deployed, or extended. `frontend/` has been removed.

**Stack:** Vertex AI (Agent Engine, Pipelines, Gemini 2.5 Flash, Imagen 3) + Firestore + GCS + Cloud Functions (Gen 2) + Google Slides/Drive APIs + Next.js 14 on Vercel.

**Before any non-trivial work:** consult [PRD.md](./PRD.md) for the stage specification, data model, and gate logic. Use OpenSpec (`/opsx:propose`) for changes — never ad-lib architecture.

The predecessor Endava-platform PRD is at [`docs/archive/prd-v0.2-superseded-2026-06.md`](./docs/archive/prd-v0.2-superseded-2026-06.md) — historical context only.

---

## Repo structure

```
./
├── greenlight/              App — Greenlight v0.1
│   ├── app/                 Next.js 14 App Router (Vercel)
│   ├── lib/                 Shared types, GCP client wrappers
│   ├── pipelines/           Vertex AI Pipelines component definitions
│   ├── functions/           Cloud Functions (approval gate handlers)
│   ├── tests/               TDD test suite (mirrors pipeline stages)
│   └── openspec/            Spec-driven development artifacts
│       ├── changes/         Active change proposals
│       └── archive/         Completed changes
├── backend/                 Frozen — predecessor reference patterns
│   └── agent/src/
│       ├── providers/       LLM adapter pattern (swap one file → swap provider)
│       ├── types/           Typed component spec + agent routing
│       ├── observability/   OTel + Langfuse tracing patterns
│       ├── agents/          Structured JSON generation + parsing pattern
│       └── skills/          SKILL.md behavioural spec pattern
├── docs/archive/            Superseded predecessor PRD
├── PRD.md                   Canonical spec — source of truth
└── README.md                Project overview + quick start
```

---

## Dev commands

```bash
# Greenlight (active)
cd greenlight && pnpm dev              # Next.js on :3000
cd greenlight && pnpm test             # Vitest — all tests
cd greenlight && pnpm test:watch       # TDD loop
cd greenlight && pnpm lint             # tsc --noEmit
cd greenlight && pnpm openspec update  # Update OpenSpec agent instructions

# Predecessor (reference only — not built or deployed)
pnpm --filter @gen-ux/agent lint       # TypeScript check still works
```

Environment: copy `greenlight/.env.example` → `greenlight/.env`.

---

## TypeScript rules (strict — enforce these)

`tsconfig.base.json` enables `strict`, `exactOptionalPropertyTypes`, and `noUncheckedIndexedAccess`:

- **Never assign `undefined` to an optional property directly.** Use a conditional spread:
  ```typescript
  // WRONG
  const obj = { key: maybeUndefined }
  // RIGHT
  const obj = { ...(maybeUndefined !== undefined && { key: maybeUndefined }) }
  ```
- **Always check array index access** — `arr[0]` is `T | undefined` under `noUncheckedIndexedAccess`.
- **Unused parameters** that must exist for a signature: prefix with `_` (e.g., `_userId`).

---

## OpenSpec workflow (spec-driven development)

Every feature or fix starts as an OpenSpec change. **No code without a spec.**

```
/opsx:explore              Explore the problem space, read code, shape a plan
/opsx:propose <change>     Create proposal.md + specs/ + design.md + tasks.md
/opsx:apply                Implement tasks from the plan
/opsx:archive              Archive completed change, update specs
```

Changes live in `greenlight/openspec/changes/<name>/` with four artifacts:

| Artifact | Purpose |
|---|---|
| `proposal.md` | Why this change, what changes |
| `specs/` | Requirements and scenarios (one .md per spec) |
| `design.md` | Technical approach, data flow, error handling |
| `tasks.md` | Implementation checklist (checked off as done) |

The first change (`day-1-gcp-foundations`) is scaffolded and ready to implement.

---

## Test-driven development (TDD)

**Tests are written before implementation.** No exceptions — this is the law in this repo.

```bash
cd greenlight
pnpm test:watch   # red → green → refactor loop
```

Test structure mirrors pipeline stages:

```
greenlight/tests/
├── brief-parsing/           Stage 1 — Gemini brief parsing
├── territory-generation/    Stage 2 — creative territory generation
├── visual-dna/              Stage 3 — Visual DNA encoding + Imagen
├── output-generation/       Stage 4 — Slides deck + Flow package
├── gates/                   ECD + client approval gate logic
└── pipeline/                End-to-end pipeline integration
```

**Test patterns:**
- Schema validation: does the output match the JSON schema from PRD §5?
- Error handling: empty input, API timeout, malformed response
- Firestore writes: correct collection, correct shape, correct timestamps
- Cost tracking: token counts written, calculated correctly

**Tests are integration-first.** Hit real Firebase emulators and Vertex AI where possible. Mock only external HTTP boundaries.

---

## Vertex AI patterns

### Gemini 2.5 Flash structured output

The pattern for getting structured JSON from Gemini is established in `backend/agent/src/agents/slide-deck.ts`:

1. **System prompt** embeds the JSON schema + strict formatting rules
2. **Response parsing**: strip markdown fences → find outermost `{...}` → `JSON.parse()` → validate against expected shape
3. **Fallback**: retry once with stricter prompt on parse failure
4. **Never use `response_mime_type: "application/json"`** — Gemini 2.5 Flash's structured output mode is less reliable than prompt-forced JSON for complex nested schemas

### Gemini adapter

Create `greenlight/lib/gemini.ts` as the single file that calls the Vertex AI SDK. Everything else calls `callGemini()` or `generateImage()`. This is the same adapter pattern as `backend/agent/src/providers/anthropic.adapter.ts` — swap one file to change LLM provider.

- Default model: `gemini-2.5-flash-001`
- Cost tracking: extract `usageMetadata` from response, write to Firestore stage record
- Location: `us-central1` (configurable via `VERTEX_LOCATION` env var)

### Imagen 3

- Model: `imagen-3.0-generate-001`
- Output: GCS URI (not base64 — too large for Firestore)
- Every generation writes cost to Firestore (`imagen_generation_count`, `imagen_cost`)
- SynthID watermarking is automatic — no configuration needed

---

## Firestore patterns

### Schema

Collection path: `/runs/{run_id}/stages/{stage_name}`
Gate records: `/runs/{run_id}/gates/{gate_name}`
Run summary: `/runs/{run_id}/summary`

### Write pattern

```typescript
import { getFirestore } from "firebase-admin/firestore"

const db = getFirestore()

await db.doc(`runs/${runId}/stages/brief_parsing`).set({
  parsed_brief: { /* ... */ },
  brief_gaps: ["..."],
  confidence_score: 0.85,
  token_cost: 0.00042,
  created_at: FieldValue.serverTimestamp(),
  operator: "joe",
})
```

### Read pattern

```typescript
const doc = await db.doc(`runs/${runId}/gates/ecd_approval`).get()
if (!doc.exists) {
  // Gate not yet passed — pipeline is blocked
}
const gate = doc.data() // { approval_status, territory_selected, approved_at, ... }
```

---

## Cloud Functions patterns

Approval gates are Gen 2 Cloud Functions, triggered by HTTPS POST from the approval form:

```typescript
// greenlight/functions/ecd-approval.ts
export const ecdApproval = onRequest(async (req, res) => {
  const { runId, territorySelected, approvalStatus, notes, name, email } = req.body
  // Validate inputs
  // Write gate record to Firestore
  // Update pipeline state
  // Send notification to producer
})
```

- Cold start: expect 1–3s latency on first invocation
- IAM: service account with `datastore.user` role
- Deploy: `gcloud functions deploy ecd-approval --gen2 --runtime=nodejs20`

---

## Predecessor reference patterns (backend/)

These patterns from the frozen predecessor code informed Greenlight's architecture. They are not deployed but are worth consulting for design decisions:

| Pattern | File | What it teaches |
|---|---|---|
| LLM adapter | `backend/agent/src/providers/anthropic.adapter.ts` | Single file wraps SDK; everything else calls `callClaude()`. Swap one file to change provider |
| Structured output | `backend/agent/src/agents/slide-deck.ts` | System prompt embeds schema → parse JSON → validate → typed component spec |
| Typed specs | `backend/agent/src/types/index.ts` | `ComponentSpec`, `GraphState`, `AgentRoute` — types drive the pipeline |
| Observability | `backend/agent/src/observability/` | OTel spans + Langfuse traces — per-call cost attribution pattern |
| Behavioural specs | `backend/skills/` | SKILL.md as durable prompt assets — same idea as OpenSpec specs |

---

## Known constraints

- **Imagen 3 requires GCP allowlist** — apply before Day 3. Fallback: placeholder URIs if not approved in time.
- **Google Slides API rate limits**: 100 requests/100 seconds per user. Batch slide creation in a single `batchUpdate` call where possible.
- **Cloud Functions cold starts**: 1–3s on first invocation. Acceptable for gate approval forms (not latency-sensitive).
- **Vertex AI Agent Engine** is a newer product. If it doesn't support the structured JSON output pattern needed for brief parsing, fall back to direct Gemini 2.5 Flash API calls via the Vertex AI SDK.
- **Firestore costs**: writes are cheap, reads are cheaper. Prefer writes on pipeline events, reads only on status checks and gate polling.
