# Endava Lead Gen — Routing Examples

Sample prompts showing how intent signals map to Parlant routing decisions.
Each prompt includes the classified signals and the resulting tool/guideline fired.

---

## Capability Exploration — no CTA

> "What does Endava actually do in the AI & Data space?"

```
category: capability_exploration
readiness: exploring
sentiment: neutral
urgency: normal
question_type: informational
```

`rag_agent` retrieves capability content. No CTA surfaced (readiness: exploring).

---

## Vertical Fit Check — soft CTA after proof point

> "We're in financial services. Do you have experience working with banks on core system modernisation?"

```
category: vertical_fit_check
readiness: evaluating
sentiment: neutral
urgency: normal
question_type: informational
```

`rag_agent` filters case studies by fintech/banking vertical. Soft CTA appended after proof point (readiness: evaluating).

---

## Pain Point Share — proof point + memory save, no CTA

> "Our engineering team can't move fast enough — we've got a monolith that's blocking everything and no clear path to break it apart."

```
category: pain_point_share
readiness: exploring
sentiment: neutral
urgency: normal
question_type: statement
```

`rag_agent` retrieves case study on platform decomposition. `save_memory` fires with pain point detail. No CTA (readiness: exploring).

---

## Scepticism — proof point before anything else

> "Honestly I've heard the same pitch from five other firms. What actually makes Endava different?"

```
category: competitive_evaluation
readiness: evaluating
sentiment: skeptical
urgency: normal
question_type: informational
```

Compliance/positioning guideline fires (direct response, no rag call). Skeptical sentiment suppresses CTA until proof lands.

---

## Proof Point Request — direct evidence ask

> "Can you show me a case study for a retailer that went through a cloud migration with you?"

```
category: proof_point_request
readiness: evaluating
sentiment: neutral
urgency: normal
question_type: transactional
```

`rag_agent` retrieves retail + cloud migration case study. Soft CTA follows.

---

## Urgency — compressed timeline, fast-track to CTA

> "We need to be live by Q3. I'm trying to figure out if you could realistically staff and deliver something that fast."

```
category: pain_point_share
readiness: evaluating
sentiment: neutral
urgency: high
question_type: informational
```

`rag_agent` surfaces delivery-on-timeline proof point + regional team availability. CTA pushed given evaluating + high urgency combination.

---

## Ready Signal — straight to CTA

> "I've seen enough. Can we set up a 15-minute call with your team this week?"

```
category: readiness_signal
readiness: ready
sentiment: positive
urgency: high
question_type: transactional
```

`customer_service_agent` handles booking request. No proof point needed — CTA is the entire response.

---

## Memory Save in the Flow

> "We're a 3,000-person logistics company based in the Netherlands, currently evaluating partners for a data platform rebuild."

```
category: pain_point_share
readiness: exploring
sentiment: neutral
urgency: normal
question_type: statement
```

`save_memory` fires with company size, sector (logistics), location (Netherlands), and initiative (data platform rebuild). `rag_agent` retrieves relevant capability content. No CTA.
