# Firestore — Audit Records

## Official docs
- [Firestore Node SDK](https://cloud.google.com/firestore/docs/create-database-server-client-library)
- [Firestore emulator](https://cloud.google.com/firestore/docs/emulator)
- [Data model](https://cloud.google.com/firestore/docs/data-model)

## Greenlight adapter

Single file: `greenlight/lib/firestore.ts`

## Collection schema (PRD §6.3)

```
/runs/{run_id}
  /stages/brief_parsing        — Stage 1 output + token cost
  /stages/territory_generation — Stage 2 output + token cost
  /stages/visual_dna           — Stage 3 output + Imagen cost
  /stages/output_generation    — Stage 4 output (Slides ID + Flow GCS URI)
  /gates/ecd_approval          — Gate 1 record
  /gates/client_approval       — Gate 2 record
  /summary                     — Run summary (written on Gate 2 pass)
```

## Write pattern

```typescript
import { writeStageRecord, writeGateRecord, writeRunSummary } from "@greenlight/lib/firestore"

await writeStageRecord({
  stage: "brief-parsing",
  runId: "run-1712345678-abc123",
  data: parsedBrief,
  tokenCost: 0.00004,
  confidenceScore: 0.87,
})
```

## Read pattern

```typescript
import { readStageRecord, readGateRecord, readRunSummary } from "@greenlight/lib/firestore"

const brief = await readStageRecord(runId, "brief-parsing")  // null if not yet written
const ecdGate = await readGateRecord(runId, "ecd_approval")
const summary = await readRunSummary(runId)
```

## TDD with emulator

```bash
# Start emulator
gcloud emulators firestore start --host-port=localhost:8080

# Run tests against emulator
FIRESTORE_EMULATOR_HOST=localhost:8080 npx vitest run
```

Set `FIRESTORE_EMULATOR_HOST` in tests — the Firestore client auto-detects it.
Never mock Firestore. Use the emulator.
