# Git Traces — Development Audit Trail

## Reference
- [loop-maker pattern](https://github.com/EricTechPro/loop-maker) — separate state file, verifier, durable-vs-changing rule

## Greenlight adapter

Two files:
- `greenlight/lib/tracer.ts` — writes trace markdown + JSON files
- `greenlight/lib/traces.ts` — `git add` + `git commit` per stage

## Trace directory structure

```
greenlight/traces/runs/{run_id}/
├── 01-brief-input.md          Raw brief + brand rules
├── 02-brief_parsing.json      Stage 1 output (validated)
├── 03-territory_generation.json
├── 04-visual_dna.json
├── 05-output_generation.json
├── 07-gate_ecd.json
├── 08-gate_client.json
├── 09-run-summary.json
└── agent-traces/
    ├── brief-parsing.md       Prompt + response + tokens + verification
    ├── territory-generation.md
    ├── visual-dna.md
    └── output-generation.md
```

## Commit convention

```
run/nike-q3-campaign: stage 0 — Brief Parsing ✅
run/nike-q3-campaign: stage 1 — Creative Territory Generation ✅
run/nike-q3-campaign: stage 2 — Visual DNA Encoding ✅
run/nike-q3-campaign: stage 3 — Dual Output Generation ✅
run/nike-q3-campaign: stage 4 — Gate 1 ECD Approval ✅
run/nike-q3-campaign: stage 5 — Gate 2 Client Approval ✅
run/nike-q3-campaign: complete — Flow package released 🚀
```

## `git log --oneline --grep="run/{id}"` tells the pipeline story

No narration needed — the git history IS the audit trail.

## Dual audit layers

| | Firestore | Git traces |
|---|---|---|
| What | Machine-readable JSON | Human-readable markdown |
| Answers | "Is Gate 2 passed?" | "Why was Territory 2 chosen?" |
| Queried by | API routes, dashboard | `git log`, `git diff` |
| Demo value | GCP console | Terminal |
