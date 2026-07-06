# TDD Loop — Test-Driven Development

## Official docs
- [Vitest](https://vitest.dev/guide/)
- [Firestore emulator](https://cloud.google.com/firestore/docs/emulator)
- [pytest](https://docs.pytest.org/) (Python Cloud Functions)

## The rule

**Tests are written before implementation.** No exceptions.

```bash
cd greenlight
npm run test:watch   # red → green → refactor loop
```

## Test structure

```
greenlight/tests/
├── tracer/                  Tracer module tests (17 tests)
├── brief-parsing/           Stage 1 — schema + JSON parse (22 tests)
├── territory-generation/    Stage 2 — territory schema + divergence
├── visual-dna/              Stage 3 — Visual DNA schema + Imagen
├── output-generation/       Stage 4 — Slides + Flow package
├── gates/                   ECD + client approval logic
└── pipeline/                End-to-end integration
```

## Mock strategy

| Dependency | Strategy | Reason |
|---|---|---|
| Gemini API | Mock with fixture JSON | Fast (<100ms), no cost, deterministic |
| Imagen 3 | Mock | Slow + costs money |
| Firestore | **Emulator** (real) | Never mock Firestore |
| Google Slides API | Mock | Rate-limited, slow |
| Cloud Functions | Mock HTTP trigger | Test logic, not infra |
| Git operations | Mock `execSync` | Don't commit during test runs |

## What to mock vs. what to integration-test

```
Mock:          Gemini, Imagen, Slides API, Cloud Functions HTTP
Never mock:    Firestore (use emulator), File I/O (use tmp dirs)
Integration:   Full pipeline E2E (run once before committing)
```

## Test patterns

- **Schema validation:** does output match PRD §5 JSON schema?
- **Error handling:** empty input → 400, API timeout → 502, malformed response → parse fallback
- **Firestore writes:** correct collection, correct shape, timestamps present
- **Cost tracking:** token counts written, calculated correctly from usage metadata

## Pre-commit verification

```bash
npm test                   # All tests (must pass)
npm run lint               # tsc --noEmit (must pass)
npm run test:coverage      # Check coverage thresholds
```
