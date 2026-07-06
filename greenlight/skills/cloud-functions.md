# Cloud Functions — Approval Gates

## Official docs
- [Cloud Functions Gen 2](https://cloud.google.com/functions/docs/concepts/version-comparison)
- [Firebase SDK for CF](https://firebase.google.com/docs/functions)
- [gcloud functions deploy](https://cloud.google.com/functions/docs/deploy)

## Greenlight pattern (Day 5)

Two HTTPS-triggered Gen 2 functions:
- `ecd-approval` — Gate 1: ECD approves creative direction
- `client-approval` — Gate 2: Client approves creative direction

## Function shape

```typescript
// greenlight/functions/ecd-approval.ts
import { onRequest } from "firebase-functions/v2/https"
import { writeGateRecord } from "@greenlight/lib/firestore"

export const ecdApproval = onRequest(async (req, res) => {
  const { runId, territorySelected, approvalStatus, notes, name, email } = req.body

  // Validate required fields
  if (!runId || !territorySelected || !approvalStatus || !name || !email) {
    res.status(400).json({ error: "Missing required fields" })
    return
  }

  // Write gate record to Firestore
  await writeGateRecord({
    gate: "ecd_approval",
    runId,
    approvalStatus,
    territorySelected,
    notes: notes ?? null,
    approverName: name,
    approverEmail: email,
    revisionCycles: 0, // incremented on revisions
  })

  res.json({ success: true, next: "Gate 2 — Client Approval" })
})
```

## Deploy

```bash
gcloud functions deploy ecd-approval \
  --gen2 \
  --runtime=nodejs20 \
  --region=us-central1 \
  --source=greenlight/functions \
  --entry-point=ecdApproval \
  --trigger-http \
  --allow-unauthenticated \
  --service-account=greenlight-agent@greenlight-v01.iam.gserviceaccount.com
```

## Cold starts

- Expect 1–3s latency on first invocation
- Acceptable for gate approval forms (not latency-sensitive)
- Warm invocations are <100ms

## Gate logic

- Gate 2 is UNLOCKED only when Gate 1 status is `APPROVED` or `APPROVED_WITH_NOTES`
- Flow package remains locked in GCS until Gate 2 passes
- All gate records write `approvedAt: FieldValue.serverTimestamp()`
