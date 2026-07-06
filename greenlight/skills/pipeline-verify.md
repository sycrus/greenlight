# Pipeline Verify — Per-Stage Verification

## Reference
- [loop-maker: separate verifier](https://github.com/EricTechPro/loop-maker/blob/main/references/loops-and-loop-engineering.md)
- [loop-maker: verifier template](https://github.com/EricTechPro/loop-maker/blob/main/scripts/verifier_template.sh)

## The rule

> A generator that judges its own output is not a loop; it is an optimist.

Every pipeline stage has a **separate verifier** — a program that runs after the generator and returns exit 0 (pass) or exit 1 (fail). The verifier never shares a prompt with the generator.

## Per-stage verification checks

### Stage 1 — Brief Parsing
- [ ] JSON schema matches PRD §5 parsed_brief schema
- [ ] `brand` non-empty string
- [ ] `campaign_objective` non-empty string
- [ ] `target_audience.primary` non-empty string
- [ ] `confidence_score` is a number ≥ 0.5
- [ ] `brief_gaps` is a non-empty array
- [ ] `token_cost` written to Firestore

### Stage 2 — Territory Generation
- [ ] 3 distinct territories returned
- [ ] Each territory has all required fields (PRD §5 Stage 2)
- [ ] Territories have different visual_language and tone values (divergence enforced)
- [ ] `risk_flag` populated on any territory that warrants it
- [ ] Token cost written to Firestore

### Stage 3 — Visual DNA Encoding
- [ ] 3 Visual DNA objects (one per territory)
- [ ] Each has palette, ingredients, cinematography, brand_rules_as_prompts, negative_prompt_list
- [ ] Reference image URIs are valid GCS paths
- [ ] Imagen generation count + cost written to Firestore

### Stage 4 — Output Generation
- [ ] Slides deck ID returned (string, non-empty)
- [ ] Flow package GCS URI returned
- [ ] Flow package matches PRD §5 Stage 4b schema
- [ ] Token cost + Slides API calls written to Firestore

### Gate 1 — ECD Approval
- [ ] `approval_status` is `APPROVED` or `APPROVED_WITH_NOTES`
- [ ] `territory_selected` references a valid territory ID
- [ ] `approved_at` timestamp present
- [ ] Gate record written to Firestore

### Gate 2 — Client Approval
- [ ] All Gate 1 checks pass
- [ ] Flow package GCS signed URL generated
- [ ] Run summary written to Firestore

## Verification is committed to git

Every verification result becomes part of the agent trace file:
```markdown
| ✅ schema valid |
| ✅ confidence ≥ 0.5 — confidence: 0.87 |
| ✅ gaps populated |
```

Commit only when all checks pass. A ❌ blocks the commit.
