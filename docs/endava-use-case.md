# Endava: Lead Generation

## Trigger

A prospect visits a service or industry page (e.g., AI & Data, Cloud Modernisation) with qualifying intent signals: return visit, 60+ seconds on page, or scroll depth >50%.

## User + JTBD

A technology leader (CTO, VP Engineering, or digital transformation owner) at a mid-to-large enterprise evaluating whether Endava is a credible partner for a specific capability gap. They're not ready to fill out a form, but they're trying to self-qualify before committing to a conversation.

## Experience

Intent agent detects industry vertical and content consumption pattern → Content agent surfaces a contextually relevant case study or capability proof point inline (no modal, no redirect) with a personalised engagement prompt ("You've been looking at our AI & Data work. Here's how we approached a similar challenge in \<user's industry\>") → a low-friction CTA is surfaced (15-minute conversation, not a full RFP form) → State logs engagement for follow-up sequencing.

## Agents / Tools Active

| Agent | Responsibility |
|---|---|
| **Intent** | Infers vertical, pain point category, and readiness stage from behaviour signals |
| **Content** | Retrieves relevant case studies, capability content, and regional team availability |
| **Render** | Assembles personalised proof point within Endava's tone and positioning guardrails |
| **Standards** | Evaluates output against CRAFT dimensions and business rules (regional team routing, approved case study use, NDA-flagged content restrictions) |

## Failure Modes

- System surfaces a case study from a restricted client — NDA breach
- Personalisation prompt misidentifies vertical — degrades trust
- CTA fires too early in session — increases bounce rate

---

## Intent Signal Taxonomy

Intent is read from two sources and merged before reaching Parlant:

- **Chat input (explicit)** — classified at the Next.js proxy layer, zero latency
- **Behavioural signals (implicit)** — page, dwell, scroll, viewed content *(Phase 2)*

### Category

What the prospect is trying to do in this turn.

| Value | Description | Example |
|---|---|---|
| `capability_exploration` | Asking what Endava does in a practice area | "Tell me about your AI & Data work" |
| `proof_point_request` | Asking for evidence of past delivery | "Do you have case studies in financial services?" |
| `pain_point_share` | Describing a specific challenge or gap | "We're struggling with a legacy platform migration" |
| `readiness_signal` | Expressing intent to take the next step | "Can we set up a 15-minute call?" |
| `vertical_fit_check` | Testing whether Endava has relevant sector experience | "What's your experience in fintech?" |
| `competitive_evaluation` | Actively comparing or differentiating | "How are you different from [other vendor]?" |
| `general_inquiry` | Fallback — no strong signal detected | — |

### Readiness Stage

Where the prospect is in their evaluation journey. Controls CTA timing — surfacing the booking prompt too early is the primary failure mode for bounce rate.

| Value | Description |
|---|---|
| `exploring` | Still researching — gathering information, no comparison yet |
| `evaluating` | Actively comparing options — shortlisting, due diligence language |
| `ready` | Signalling intent to engage — "let's talk", "next steps", "book" |

### Sentiment

| Value | Description | Consequence |
|---|---|---|
| `positive` | Validation signals — "impressive", "exactly what we need" | — |
| `neutral` | Default — no strong signal | — |
| `skeptical` | Trust risk — "not convinced", "prove it", "seems expensive" | Surface proof point before pushing CTA |

### Urgency

| Value | Description | Consequence |
|---|---|---|
| `high` | Time-bound language — "this quarter", "go-live deadline", "Q3" | Prioritise regional team availability in Content agent response |
| `normal` | Default | — |

### Question Type

| Value | Description |
|---|---|
| `informational` | What / how / why questions — needs explanation or content |
| `transactional` | Ready to act — "I'd like to", "can you set up", "let's" |
| `navigational` | Trying to find something — redirect or surface inline |
| `statement` | Sharing context — often a `pain_point_share` or preference |

---

## Wire Format

Appended to every message by the Next.js proxy before Parlant receives it:

```
[intent_signals]
category: proof_point_request
sentiment: skeptical
urgency: normal
question_type: informational
readiness: evaluating
[/intent_signals]
```

---

## Signal → Routing Logic

Parlant guidelines evaluate these signals to determine response strategy.

| Signal | Routing behaviour |
|---|---|
| `readiness: ready` | Surface low-friction CTA immediately |
| `readiness: evaluating` + any category | Lead with proof point, then soft CTA |
| `readiness: exploring` | No CTA — surface capability content only |
| `category: vertical_fit_check` | Content agent filters case studies by sector |
| `category: pain_point_share` | Content agent matches pain point to capability area |
| `sentiment: skeptical` | Surface proof point before any CTA |
| `urgency: high` | Include regional team availability in response |
| `category: competitive_evaluation` | Standards agent checks response against positioning guardrails before render |

---

## Implementation

| Concern | Location |
|---|---|
| Classifier | `frontend/app/src/lib/signals/intent.ts` |
| Proxy injection | `frontend/app/src/app/api/chat/route.ts` — `enrichMessage` called before `sendMessage` |
| Parlant guidelines | `backend/parlant/config/guidelines.yaml` — signal-aware routing rules *(Phase 2)* |
| Behavioural signals | Phase 2 — `page`, `dwell_ms`, `viewed`, `scroll_depth` merged into the same `[context]` block by the proxy alongside chat-derived signals |
