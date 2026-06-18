# PRD: Pre-Production Intelligence Agent
### Flame Game — Functional Prototype v0.1
**Status:** Draft · **Owner:** Joe Chung · **Last updated:** June 2026

---

## 1. Problem Statement

Creative production pipelines for short-form branded video have no governed pre-production layer. A client brief arrives — unstructured, incomplete, often contradictory — and a Creative Director translates it into a production direction through intuition, institutional knowledge, and a series of informal conversations. No decisions are captured. No rationale is documented. Brand constraints live in a PDF nobody has read. When a client disputes a creative direction three weeks into production, there is no answer — because the decision was never a decision. It was just what happened.

Generative AI tools like Google Flow have solved the production layer well: a CD can generate, iterate, and assemble short-form video at speed. The pre-production layer — from brief to approved creative direction — remains ungoverned. This system addresses that gap.

The Pre-Production Intelligence Agent sits between a client brief and Google Flow. It parses the brief, generates structured creative territories, encodes brand constraints into a machine-readable Visual DNA object, and produces two outputs from the same pipeline run: a **Google Slides pre-production deck** for human review and approval, and a **Flow-ready creative package** for production handoff. Two sequential permission gates — ECD approval and client approval — must be passed before the Flow package is released to the CD.

Every decision at every gate is attributed, timestamped, and written to a permanent audit record on Google Cloud. The generative AI does the analytical and creative legwork. The humans own every decision that matters.

**Predecessor context:** This system extends a brief-to-deck agentic pipeline previously built on LangGraph with Langfuse/OTEL observability. That system validated the brief parsing and structured output pattern. This build ports the pattern to Vertex AI's managed stack, adds the brand compliance and Visual DNA layers, and introduces the two-gate permission structure. The platform shift is deliberate: Vertex AI's native IAM, Pipeline tracing, and GCP billing integration provide enterprise governance that the open-source stack cannot match at agency scale.

**Target context:** Agency creative production teams and brand in-house studios producing short-form video (30s) for brand clients, where multiple named stakeholders must approve a creative direction before production spend begins.

---

## 2. Goals

### Primary
- Demonstrate a governed pre-production pipeline from brief input to Flow-ready package, with full human decision audit at every gate
- Show Vertex AI as the observability and governance layer — IAM, Pipeline tracing, Firestore audit, cost attribution — not just the model provider
- Produce a dual output: Google Slides deck for human approval, structured JSON package for Flow handoff
- Implement two named permission gates (ECD, client) that block pipeline progression until signed off

### Secondary
- Qualify Flame Game for Google for Startups Bootstrap Tier ($2,000 GCP credits)
- Support application narrative for Google SEAS Brand Team Creative Technologist role and WPP Production Senior Director role
- Demonstrate comparative platform reasoning: same agent pattern as LangGraph predecessor, deliberate migration to Vertex AI for governance properties
- Build toward O-1A evidence: novel application of managed AI observability to creative production governance

### Out of scope for v0.1
- In-Flow production (clip generation, shot selection, rough cut — handled by Google Flow)
- Multi-user real-time collaboration
- Production-grade auth beyond GCP IAM service account
- Fine-tuned models or custom endpoints
- DAM system integration
- PDF brand guidelines ingestion (manual structured input only)

---

## 3. Users

**CD / Creative Lead**
Receives the approved Flow package after both gates pass. Does not use this system directly in v0.1 — they are the downstream beneficiary. Their Flow session starts from a structured, approved brief rather than a blank canvas.

**ECD / Creative Director (Gate 1 approver)**
Reviews the pre-production deck internally before it goes to client. Comfortable with Google Slides. Makes the call on creative territory, tone, and visual direction. May request revisions before approving. Does not need to understand the pipeline — they receive a Slides link and a lightweight approval form.

**Client / Brand Decision Maker (Gate 2 approver)**
Reviews a client-facing version of the pre-production deck. Signs off on direction before production spend begins. Same interaction pattern as ECD — Slides link plus approval form. May request revisions.

**Producer / CT (pipeline operator)**
The person running the system. Inputs the brief, reviews AI outputs before sending to ECD, manages revision cycles, monitors pipeline cost. This is the primary user of the system UI. In a demo context, this is Joe.

**Hiring manager / technical interviewer**
Evaluates platform choices, architecture decisions, and the ability to narrate why Vertex AI is the right stack for this problem. Wants to see the Vertex dashboard alongside the prototype UI.

---

## 4. System Architecture

### 4.1 Pipeline overview

```
CLIENT BRIEF (text input)
        │
        ▼
┌─────────────────────────────┐
│   BRIEF PARSING AGENT        │  Vertex AI Agent Engine
│   Gemini 2.5 Flash           │  + Vertex AI Pipelines (trace)
│                             │
│   • Extract objectives      │
│   • Identify constraints    │
│   • Infer audience          │
│   • Flag brief gaps         │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│   CREATIVE TERRITORY        │  Gemini 2.5 Flash
│   GENERATION                │
│                             │
│   3 distinct territories:   │
│   • Creative proposition    │
│   • Visual language         │
│   • Tone descriptor         │
│   • Emotional arc (30s)     │
│   • Negative constraints    │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│   VISUAL DNA ENCODING        │  Gemini 2.5 Flash
│                             │  + Imagen 3 (reference gen)
│   Per territory:            │  + GCS (asset storage)
│   • Palette extraction      │
│   • Ingredient specs        │
│   • Shot language brief     │
│   • Brand rules → prompts   │
│   • Negative prompt list    │
└──────────────┬──────────────┘
               │
        ┌──────┴──────┐
        │             │
        ▼             ▼
┌──────────────┐  ┌────────────────────┐
│  SLIDES DECK  │  │  FLOW PACKAGE      │
│  (human)      │  │  (machine)         │
│               │  │                    │
│  Google Slides│  │  Structured JSON   │
│  API render   │  │  Visual DNA object │
│               │  │  Ingredient specs  │
│  ECD-facing   │  │  Prompt library    │
│  Client-facing│  │  GCS asset URIs    │
└──────┬───────┘  └────────┬───────────┘
       │                   │
       ▼                   │
┌─────────────────┐        │
│  GATE 1          │        │  ← LOCKED until Gate 2
│  ECD APPROVAL    │        │
│                 │        │
│  Slides share   │        │
│  Review + notes │        │
│  Approval form  │        │
│  Firestore write│        │
└──────┬──────────┘        │
       │                   │
       ▼                   │
┌─────────────────┐        │
│  GATE 2          │        │
│  CLIENT APPROVAL │        │
│                 │        │
│  Slides share   │        │
│  (client ver.)  │        │
│  Approval form  │        │
│  Firestore write│        │
└──────┬──────────┘        │
       │                   │
       └─────────┬─────────┘
                 │  UNLOCKED
                 ▼
        FLOW PACKAGE RELEASED
        CD begins production in Google Flow
```

### 4.2 What this system is not

This system does not generate video. It does not replace Google Flow. It does not manage production assets after handoff. It governs the decisions that happen *before* Flow opens — and creates the audit record that explains why the production went in the direction it did.

---

## 5. Stage Specifications

### Stage 1 — Brief Parsing

**Input:** Freeform creative brief (text, pasted or typed). Brand rules (structured form fields: palette hex values, typography, logo usage rules, restricted imagery, competitor names). Optional: reference PDF attachment (read via Gemini document understanding — text extraction only, no image processing in v0.1).

**Agent processing (Vertex AI Agent Engine, Gemini 2.5 Flash):**

The brief parsing agent extracts and structures:

```json
{
  "parsed_brief": {
    "brand": "string",
    "campaign_objective": "string",
    "target_audience": {
      "primary": "string",
      "secondary": "string | null"
    },
    "key_message": "string",
    "mandatory_elements": ["string"],
    "tone_descriptors": ["string"],
    "format": {
      "duration_seconds": 30,
      "aspect_ratio": "16:9 | 9:16",
      "platform": "string"
    },
    "brief_gaps": ["string"],
    "confidence_score": "float"
  }
}
```

`brief_gaps` is surfaced to the producer before proceeding — flagged items the brief didn't address that will affect creative direction. The producer can fill gaps manually or proceed with AI-inferred defaults (logged either way).

**No HITL gate here** — the producer reviews the parsed brief output in the UI, edits any misinterpretations inline, and confirms before proceeding. This confirmation is logged but is not a named permission gate.

**Vertex AI Pipelines component:** `brief-parsing-v1`
**Cost tracked:** Input/output tokens, document processing if PDF attached.

---

### Stage 2 — Creative Territory Generation

**Input:** Confirmed parsed brief + brand rules object.

**Agent processing (Gemini 2.5 Flash):**

Generates 3 distinct creative territories. Each territory is a genuinely different strategic and visual direction — not variations on one theme. Prompt engineering enforces divergence: the agent is instructed to treat each territory as a mutually exclusive creative bet, with an explicit constraint that territories must not share visual language or emotional register.

Each territory contains:

```json
{
  "territory": {
    "id": "string",
    "name": "string",
    "creative_proposition": "string",
    "visual_language": "string",
    "tone": "string",
    "emotional_arc": "string",
    "scene_count_suggestion": "integer",
    "flow_prompt_style": "string",
    "negative_constraints": ["string"],
    "risk_flag": "string | null"
  }
}
```

`risk_flag` surfaces anything the agent identifies as potentially off-brand, legally sensitive, or culturally ambiguous. Always shown to the producer before sending to ECD.

**Cost tracked:** Input/output tokens per generation. Regeneration count logged.

---

### Stage 3 — Visual DNA Encoding

**Input:** 3 territories from Stage 2. Brand rules object. Optional reference image uploads (moodboard, character, location — stored in GCS).

**Agent processing (Gemini 2.5 Flash + Imagen 3):**

For each territory, the agent encodes a Visual DNA object — a structured representation of the approved aesthetic that will be passed into Google Flow as Ingredients and prompt context.

```json
{
  "visual_dna": {
    "territory_id": "string",
    "version": "string",
    "palette": {
      "primary": ["#hex"],
      "accent": ["#hex"],
      "forbidden": ["#hex"]
    },
    "ingredients": [
      {
        "ingredient_id": "string",
        "type": "character | location | object | brand_asset",
        "description": "string",
        "reference_image_uri": "gcs_uri | null",
        "generated_reference_uri": "gcs_uri | null",
        "flow_ingredient_prompt": "string"
      }
    ],
    "cinematography": {
      "style": "string",
      "preferred_shot_types": ["string"],
      "camera_movement": "string",
      "lighting": "string",
      "color_grade": "string"
    },
    "brand_rules_as_prompts": ["string"],
    "negative_prompt_list": ["string"],
    "flow_scene_brief": "string"
  }
}
```

Where no reference image is uploaded for a character or key visual, Imagen 3 generates a reference image from the ingredient description. This gives the ECD and client something visual to react to in the Slides deck, and gives the CD a starting Ingredient for Flow.

Generated reference images are stored in GCS and their URIs are embedded in the Visual DNA object.

**Vertex AI Pipelines component:** `visual-dna-encoding-v1`
**Cost tracked:** Gemini tokens, Imagen 3 generations (per image), GCS storage writes.

---

### Stage 4 — Dual Output Generation

**Input:** 3 Visual DNA objects (one per territory). Parsed brief. Brand rules.

This stage generates both outputs in parallel.

#### 4a — Google Slides Pre-Production Deck

**Processing (Google Slides API + Gemini 2.5 Flash):**

A Slides presentation is generated from a master template with two variants: an ECD-facing internal version and a client-facing external version. The client version omits internal strategic rationale and risk flags; the ECD version shows everything.

**Slide structure (per territory — repeated 3×):**

| Slide | Content |
|---|---|
| Territory cover | Name, creative proposition, one-line tone descriptor |
| Visual language | Mood reference grid (generated reference images from GCS), palette swatches, cinematography style |
| Ingredients | Character/location/object references with Flow ingredient prompts shown as production notes |
| Scene arc | Emotional arc description, suggested scene count, platform format |
| Brand alignment | Brand rules applied to this territory, risk flags (ECD version only) |
| Production notes | Shot language brief, negative prompt list, estimated Flow session scope |

**Final slides (shared):**

| Slide | Content |
|---|---|
| Approval slide | "Please confirm your preferred territory below" with territory names listed |
| Next steps | What happens after approval — CD enters Flow with the approved package |

The deck is generated programmatically via Slides API, shared to the ECD's Google account with Commenter permissions. A separate client version is generated with Viewer permissions and a watermark.

#### 4b — Flow-Ready Creative Package

**Processing (structured JSON assembly):**

The Flow package is assembled from the Visual DNA object of all 3 territories, held in GCS until Gate 2 is passed. It is not shared until both approval gates are complete.

```json
{
  "flow_package": {
    "run_id": "string",
    "brand": "string",
    "approved_territory_id": "string",
    "visual_dna": { },
    "flow_session_brief": "string",
    "ingredients": [
      {
        "name": "string",
        "reference_image_uri": "gcs_uri",
        "flow_ingredient_prompt": "string"
      }
    ],
    "scene_briefs": [
      {
        "scene_number": "integer",
        "description": "string",
        "shot_language": "string",
        "suggested_veo_prompt": "string",
        "duration_seconds": "integer"
      }
    ],
    "brand_rules_as_prompts": ["string"],
    "negative_prompt_list": ["string"],
    "approved_by_ecd": "string",
    "approved_by_client": "string",
    "released_at": "ISO8601 timestamp"
  }
}
```

**Vertex AI Pipelines component:** `output-generation-v1`
**Cost tracked:** Gemini tokens for deck copy generation, Slides API calls, Imagen 3 (if additional reference images generated), GCS writes.

---

### Gate 1 — ECD Approval

**Trigger:** Slides deck (ECD version) shared to ECD's Google account. Producer notified when share is complete.

**ECD interaction:**
The ECD reviews the deck in Google Slides using their existing Google account. They can add comments to specific slides directly in Slides. When ready to decide, they click a link on the approval slide that opens a lightweight Cloud Function-hosted form.

**Approval form fields:**
- Preferred territory (radio: Territory 1 / Territory 2 / Territory 3)
- Approval status (radio: Approved / Approved with revisions / Revisions required — do not proceed)
- Notes (free text — required if "revisions required")
- Name (pre-filled from Google account if authenticated)

**On submission:** Cloud Function writes the gate record to Firestore and sends a notification to the producer.

**If revisions required:** Producer reviews ECD notes, modifies territories or Visual DNA as directed, regenerates affected slides, reshares. Revision cycle count is logged. Gate 1 does not pass until ECD submits "Approved" or "Approved with revisions."

**Gate 1 audit record (Firestore: `/runs/{run_id}/gates/ecd_approval`):**
```json
{
  "gate": "ecd_approval",
  "run_id": "string",
  "slides_deck_id": "string",
  "slides_version": "integer",
  "territory_selected": "string",
  "approval_status": "APPROVED | APPROVED_WITH_REVISIONS | REVISIONS_REQUIRED",
  "ecd_notes": "string | null",
  "ecd_name": "string",
  "ecd_email": "string",
  "revision_cycles": "integer",
  "approved_at": "ISO8601 timestamp"
}
```

**Pipeline state:** Gate 2 is unlocked only when Gate 1 status is `APPROVED` or `APPROVED_WITH_REVISIONS`. The Flow package remains locked in GCS.

---

### Gate 2 — Client Approval

**Trigger:** Client-facing Slides deck shared to client's email with Viewer permissions. Approval link included in a templated email sent by the system.

**Client interaction:**
The client views the deck (client version — no internal rationale, no risk flags, clean presentation). When ready, they click the approval link.

**Approval form fields:**
- Preferred territory (radio)
- Approval status (radio: Approved / Approved with minor notes / Revisions required)
- Notes (free text)
- Name and title (manual entry — client is not assumed to have a Google account)

**On submission:** Cloud Function writes the gate record to Firestore, updates pipeline state, and triggers Flow package release.

**If revisions required:** Producer and ECD review client notes. Depending on scope, revision may require returning to Stage 2 (new territories) or Stage 3 (Visual DNA adjustment only). All revision cycles logged with rationale.

**Gate 2 audit record (Firestore: `/runs/{run_id}/gates/client_approval`):**
```json
{
  "gate": "client_approval",
  "run_id": "string",
  "slides_deck_id": "string",
  "slides_version": "integer",
  "territory_selected": "string",
  "approval_status": "APPROVED | APPROVED_WITH_NOTES | REVISIONS_REQUIRED",
  "client_notes": "string | null",
  "client_name": "string",
  "client_title": "string",
  "client_email": "string",
  "revision_cycles": "integer",
  "approved_at": "ISO8601 timestamp"
}
```

**Pipeline state:** Flow package is released from GCS and a download link is sent to the CD. Run summary record is written.

---

### Flow Handoff

On Gate 2 approval, the system:

1. Updates the Flow package JSON with `approved_territory_id`, `approved_by_ecd`, `approved_by_client`, and `released_at`
2. Generates a GCS signed URL for the Flow package (48-hour expiry)
3. Emails the CD with the signed URL, a plain-language summary of the approved direction, and a link to the run audit record
4. Writes the run summary record to Firestore

The CD takes the Flow package into Google Flow manually. In v0.1, there is no API integration between this system and Flow — the handoff is the structured JSON document and the GCS reference image URIs, which the CD uses to configure their Flow Ingredients and session brief.

---

## 6. Vertex AI Stack

Every component runs on or through Google Cloud. The stack is chosen to maximise the native observability, governance, and cost attribution that Vertex provides — not to use Vertex for its own sake.

### 6.1 Component map

| Function | Vertex AI / GCP Service | Why |
|---|---|---|
| Brief parsing agent | Vertex AI Agent Engine (Gemini 2.5 Flash) | Managed runtime, idle billing, Agent Engine sessions |
| Territory generation | Gemini 2.5 Flash via Vertex AI API | Cost-effective, strong structured output, native Vertex tracing |
| Visual DNA encoding | Gemini 2.5 Flash via Vertex AI API | Same pipeline, consistent cost attribution |
| Reference image generation | Imagen 3 via Vertex AI API | GCP-native, GCS output URIs, SynthID watermarking |
| Pipeline orchestration & tracing | Vertex AI Pipelines (Kubeflow) | Machine-side audit, component-level cost, Vertex dashboard |
| Audit storage | Firestore (GCP) | Real-time writes, document model, GCP IAM-native |
| Asset storage | Google Cloud Storage | GCS URIs native to Imagen and Flow, signed URLs for handoff |
| Approval gate functions | Cloud Functions (Gen 2) | Serverless, GCP IAM, triggered by form submission |
| Deck generation | Google Slides API (Workspace) | Native to approver workflow, no new tool adoption |
| Deck sharing & permissions | Google Drive API | Programmatic share/revoke, Viewer/Commenter roles |
| Auth | GCP IAM + service account | Single auth model across all GCP services |
| Frontend | Next.js 14 (App Router) on Vercel | API routes for GCP calls, server-side credential handling |
| Styling | Tailwind CSS | Prototype speed |

### 6.2 Vertex AI Pipelines — component structure

```
Pipeline: pre-production-intelligence
│
├── Component: brief-parsing-v1
│   Inputs:  raw_brief (string), brand_rules (JSON)
│   Outputs: parsed_brief (JSON), brief_gaps (list)
│   Metrics: token_cost, confidence_score
│
├── Component: territory-generation-v1
│   Inputs:  parsed_brief (JSON)
│   Outputs: territories (JSON × 3)
│   Metrics: token_cost, regeneration_count
│
├── Component: visual-dna-encoding-v1
│   Inputs:  territories (JSON), brand_rules (JSON),
│            reference_image_uris (list)
│   Outputs: visual_dna_objects (JSON × 3),
│            generated_reference_uris (list)
│   Metrics: token_cost, imagen_generation_count,
│            gcs_write_count
│
└── Component: output-generation-v1
    Inputs:  visual_dna_objects (JSON × 3),
             parsed_brief (JSON)
    Outputs: slides_deck_id (string),
             flow_package_uri (gcs_uri)
    Metrics: token_cost, slides_api_calls,
             gcs_write_count
```

Each component's metrics are visible in the Vertex Pipelines dashboard and aggregated to run-level cost in the run summary record.

### 6.3 Firestore schema

```
/runs/{run_id}
  /metadata          — brand, brief hash, created_at, operator
  /pipeline          — Vertex Pipeline run ID, status, component costs
  /stages
    /brief_parsing   — parsed brief, gaps, operator confirmation
    /territories     — generated territories, regeneration count
    /visual_dna      — Visual DNA objects, GCS URIs
    /outputs         — Slides deck IDs, Flow package GCS URI
  /gates
    /ecd_approval    — Gate 1 record (see §5)
    /client_approval — Gate 2 record (see §5)
  /summary           — Run summary record (written on Gate 2 pass)
```

### 6.4 Cost attribution model

Every API call writes its token cost or generation cost to the stage record in Firestore. The run summary aggregates:

```json
{
  "run_id": "string",
  "brand": "string",
  "brief_hash": "string",
  "approved_territory": "string",
  "costs": {
    "brief_parsing_tokens": "float",
    "territory_generation_tokens": "float",
    "visual_dna_tokens": "float",
    "imagen_generations": "integer",
    "imagen_cost": "float",
    "output_generation_tokens": "float",
    "total_token_cost": "float",
    "total_imagen_cost": "float",
    "total_cost_usd": "float"
  },
  "gate_cycles": {
    "ecd_revision_cycles": "integer",
    "client_revision_cycles": "integer"
  },
  "pipeline_duration_minutes": "float",
  "operator": "string",
  "completed_at": "ISO8601 timestamp"
}
```

This is the document a producer shows a client when asked what pre-production cost, or shows finance when justifying AI tooling spend.

---

## 7. Comparison with LangGraph Predecessor

This system implements the same agent pattern as a previously built brief-to-deck pipeline (LangGraph + Langfuse/OTEL). The migration to Vertex AI is deliberate and the differences are material:

| Concern | LangGraph + Langfuse | Vertex AI (this system) |
|---|---|---|
| Agent runtime | Self-managed graph execution | Agent Engine managed runtime |
| Observability | OTEL traces, Langsmith/Langfuse dashboard | Vertex Pipelines, Cloud Logging, GCP console |
| Cost attribution | Token costs in Langfuse | Native GCP billing per component, per project |
| Auth & access control | Custom implementation required | GCP IAM, service accounts, VPC-native |
| Approval gates | Not implemented | Two named gates, Firestore-backed, Cloud Functions |
| Output format | Deck only | Dual output: Slides deck + Flow JSON package |
| Client trust signal | Open-source tooling | Google Cloud — recognisable to enterprise legal/procurement |
| Scaling | Infrastructure managed by operator | Agent Engine scales automatically |
| Brand rules | Not implemented | Visual DNA object, encoded per territory |

The LangGraph system was the right tool for fast agency-scale creative work. Vertex AI is the right tool for governed enterprise creative production. The platform choice follows the use case.

---

## 8. Demo Flow (12 minutes)

**Setup:** A real brand brief is pre-loaded. The demo runs on a live GCP project with real Vertex API calls. Firestore writes are visible in a split-screen GCP console tab.

1. **Brief input** (1.5 min) — show the raw brief. Walk through the brand rules form. Submit. Explain what the pipeline is about to do and why each field matters.

2. **Parsed brief review** (1 min) — show the structured output. Point to the `brief_gaps` array. "The agent flagged that the brief didn't specify a target platform — I'll set that to YouTube Shorts before proceeding." Make the edit. Confirm. Show the Firestore write.

3. **Territory generation** (1.5 min) — three territories appear. Walk through how they differ. Point to a `risk_flag` on one territory. "The agent flagged a potential cultural sensitivity issue with this visual direction. That's visible to the ECD but not the client." Explain the deliberate information asymmetry.

4. **Visual DNA** (2 min) — the primary technical demo moment. Show the Visual DNA object for the selected territory. Walk through the palette, the ingredient specs, the brand rules translated into prompt language. Show a generated reference image from Imagen. "This is what the CD gets as their starting Ingredient in Flow — not a description, an actual reference image."

5. **Slides deck** (1.5 min) — open the generated Google Slides in a browser tab. Walk through two territory slides. Show how the reference images are embedded. "This is what the ECD reviews. Nothing in this deck is something I designed — it was generated from the structured data in about 90 seconds."

6. **Gate 1 — ECD approval** (1 min) — show the approval form (pre-filled for demo). Submit. Show the Firestore write in real time: gate record, territory selected, timestamp. "Gate 2 is now unlocked. The Flow package is still locked."

7. **Gate 2 — Client approval** (1 min) — show the client-facing deck version briefly. "No risk flags, no internal rationale — just what the client needs to see." Submit approval form. Show Firestore write. "The Flow package is now released."

8. **Flow handoff** (30 sec) — show the Flow package JSON. Point to the ingredients array and the suggested Veo prompts. "The CD opens Flow, loads these Ingredients, uses this scene brief. They're not starting from zero — they're starting from an approved creative direction."

9. **Vertex dashboard** (2 min) — switch to Vertex Pipelines. Show the pipeline run: four components, timing per component, cost per component. "This is the machine trace — what the AI did. The Firestore records are the human trace — what the people decided. Together, that's the complete audit." Navigate to Cloud Logging briefly.

10. **Run summary** (30 sec) — show the Firestore run summary document. "This is what you give a client when they ask what pre-production cost, what direction was approved, and who signed off on it."

---

## 9. Build Plan (7 days)

**Day 1 — GCP foundations**
Project setup. Vertex AI API, Slides API, Drive API, Firestore, GCS enabled. Service account with correct IAM roles. Next.js scaffold on Vercel with environment variables. Brief input form wired to Gemini 2.5 Flash. Parsed brief output displayed in UI. Firestore stage write confirmed.

**Day 2 — Territory generation + Visual DNA**
Territory generation prompt engineering — enforce divergence, structured JSON output, risk flag extraction. Visual DNA encoding logic — palette mapping, ingredient spec generation, cinematography encoding, brand rules to prompt translation. Vertex AI Pipelines component registration for both stages.

**Day 3 — Imagen reference generation + GCS**
Imagen 3 API integration for reference image generation from ingredient descriptions. GCS upload and URI management. Visual DNA object populated with `generated_reference_uri` fields. Cost tracking per Imagen call written to Firestore.

**Day 4 — Slides deck generation**
Google Slides API template creation (ECD version and client version). Template population logic: territory copy, reference images from GCS, palette swatches, brand rule summaries. Drive API share logic — Commenter for ECD, Viewer for client. Test with a real brief end to end.

**Day 5 — Approval gates**
Cloud Function for Gate 1 (ECD approval form submission → Firestore write → producer notification). Cloud Function for Gate 2 (client approval form submission → Firestore write → Flow package release → CD notification). Gate state logic in pipeline: Flow package GCS signed URL generated only on Gate 2 pass. Revision cycle counter.

**Day 6 — Flow package + run summary**
Flow package JSON assembly from approved territory Visual DNA. Scene brief generation (Gemini — 4–6 scenes for 30s, with suggested Veo prompts). Run summary record write. Flow package signed URL generation. Email notification to CD. End-to-end test: brief in → both gates passed → Flow package delivered.

**Day 7 — Vertex Pipelines trace + demo preparation**
Vertex Pipelines run registration for all four components. Cost aggregation to run summary. Vertex dashboard walk-through rehearsal. Demo run with a real brief (R/GA archive or a fictitious but realistic brand). README and repo cleanup. Apply for Google for Startups Bootstrap Tier with live demo URL.

---

## 10. Success Criteria

The prototype is successful if a 12-minute demo answers yes to all of the following:

- Can you show a complete pipeline run from brief input to Flow package release?
- Can you show the two permission gates — who approved, what they approved, when?
- Can you show what the pipeline cost, broken down by component?
- Can you open the Google Slides deck and explain why it was generated that way?
- Can you show the Visual DNA object and explain how it propagates into Flow?
- Can you navigate the Vertex Pipelines dashboard and explain what each component did?
- Can you explain — without hedging — why Vertex AI is the right platform for this problem versus LangGraph + Langfuse?
- Does the Firestore run summary tell the story of the pipeline run without you narrating it?

---

## 11. Future Directions (post-v0.1)

**Platform**
- Multi-user support with named roles: Producer, ECD, Client, CD — each with scoped Firestore and Drive permissions via GCP IAM
- Google Workspace SSO for approver identity (replace manual name entry at gates)
- Vertex AI Model Evaluation integration for territory quality scoring across runs

**Brief intelligence**
- PDF brand guidelines ingestion via Gemini document understanding — automated brand rule extraction
- Brief gap detection trained on historical brief patterns
- Multi-brief comparison: how does this brief differ from last quarter's campaign?

**Visual DNA**
- Version control for Visual DNA across a campaign — maintain consistency across multiple 30s executions
- Fine-tuned Gemini for brand-specific brief parsing (requires training data from past campaigns)
- Automated palette extraction from uploaded brand asset images

**Approval workflow**
- DocuSign or Adobe Sign integration for legally binding client approval
- Revision diff view — show ECD exactly what changed between deck versions
- Approval deadline enforcement with automated reminders

**Flow integration**
- Direct Flow API handoff when available — push Ingredients and session brief programmatically
- Post-production feedback loop: import approved clips from Flow back into the audit record

**Business**
- Multi-project dashboard: cost and approval status across all active campaigns
- Agency billing integration: pre-production cost per brief attributed to client account
- Google for Startups Scale Tier application once Bootstrap credits are consumed

---

*Flame Game — Joe Chung, 2026. Built on Google Cloud Vertex AI.*
*Predecessor: Brief-to-Deck Intelligence Agent, LangGraph + Langfuse/OTEL, 2025.*
