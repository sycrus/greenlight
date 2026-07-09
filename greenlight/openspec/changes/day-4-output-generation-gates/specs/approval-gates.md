# Spec: Approval Gates

## Overview

Two sequential permission gates block Flow package release until both ECD and client have approved. Each gate is a lightweight form handler that writes an audit record to Firestore. Gate 2 triggers Flow package release on approval.

## Gate 1 — ECD Approval

### Trigger
Deck generation completes → ECD reviews deck in Google Slides → clicks approval link → opens form

### Form fields
| Field | Type | Required | Notes |
|---|---|---|---|
| `territorySelected` | radio (T1/T2/T3) | Yes | Must match an actual territory ID |
| `approvalStatus` | radio | Yes | APPROVED / APPROVED_WITH_REVISIONS / REVISIONS_REQUIRED |
| `notes` | textarea | Conditional | Required if REVISIONS_REQUIRED |
| `name` | text | Yes | ECD's full name |
| `email` | text | Yes | ECD's email |

### API: `POST /api/gates/ecd`

**Request:**
```json
{
  "runId": "run-...",
  "territorySelected": "t1",
  "approvalStatus": "APPROVED",
  "notes": "Looks great. Let's proceed.",
  "name": "Jane Doe",
  "email": "jane@agency.com"
}
```

**Validation:**
- `runId` must exist in Firestore (has at least Stage 1)
- `territorySelected` must be one of the 3 territory IDs from the run
- `approvalStatus` must be `APPROVED | APPROVED_WITH_REVISIONS | REVISIONS_REQUIRED`
- If `REVISIONS_REQUIRED`, `notes` is required and must be non-empty

**Firestore write:** `/runs/{runId}/gates/ecd_approval`
```json
{
  "gate": "ecd_approval",
  "runId": "...",
  "slidesDeckId": "1AbC...",
  "slidesVersion": 1,
  "territorySelected": "t1",
  "approvalStatus": "APPROVED",
  "ecdNotes": "...",
  "ecdName": "Jane Doe",
  "ecdEmail": "jane@agency.com",
  "revisionCycles": 0,
  "approvedAt": "<server timestamp>"
}
```

**Re-submission (revision):** If ECD submits again after REVISIONS_REQUIRED, increment `revisionCycles`, update `slidesVersion`.

**Response:**
```json
{
  "gate": "ecd_approval",
  "status": "APPROVED",
  "revisionCycles": 0,
  "nextGate": "client_approval"
}
```

## Gate 2 — Client Approval

### Trigger
Gate 1 passes → client deck shared → client reviews → clicks approval link → opens form

### Form fields
| Field | Type | Required | Notes |
|---|---|---|---|
| `territorySelected` | radio (T1/T2/T3) | Yes | Must match an actual territory ID |
| `approvalStatus` | radio | Yes | APPROVED / APPROVED_WITH_NOTES / REVISIONS_REQUIRED |
| `notes` | textarea | Conditional | Required if REVISIONS_REQUIRED |
| `name` | text | Yes | Client's full name |
| `title` | text | Yes | Client's job title |
| `email` | text | Yes | Client's email |

### API: `POST /api/gates/client`

**Request:**
```json
{
  "runId": "run-...",
  "territorySelected": "t1",
  "approvalStatus": "APPROVED",
  "notes": null,
  "name": "John Smith",
  "title": "Brand Director",
  "email": "john@brand.com"
}
```

**Validation:**
- `runId` must exist
- Gate 1 must exist with status `APPROVED` or `APPROVED_WITH_REVISIONS` (not `REVISIONS_REQUIRED`)
- `territorySelected` must be one of the 3 territory IDs
- `approvalStatus` must be `APPROVED | APPROVED_WITH_NOTES | REVISIONS_REQUIRED`
- If `REVISIONS_REQUIRED`, `notes` is required

**Firestore write:** `/runs/{runId}/gates/client_approval`
```json
{
  "gate": "client_approval",
  "runId": "...",
  "slidesDeckId": "1XyZ...",
  "slidesVersion": 1,
  "territorySelected": "t1",
  "approvalStatus": "APPROVED",
  "clientNotes": null,
  "clientName": "John Smith",
  "clientTitle": "Brand Director",
  "clientEmail": "john@brand.com",
  "revisionCycles": 0,
  "approvedAt": "<server timestamp>"
}
```

### Flow release (on APPROVED or APPROVED_WITH_NOTES)

After writing the gate record:
1. Read `flow-package.json` from GCS
2. Set `approved_territory_id` = territory from Gate 2
3. Set `approved_by_ecd` = ECD name from Gate 1 record
4. Set `approved_by_client` = client name from Gate 2 record
5. Set `released_at` = current ISO8601 timestamp
6. Re-upload to GCS (overwrite)
7. Generate GCS signed URL (48-hour expiry, GET method)
8. Write run summary to `/runs/{runId}/summaries/main`
9. Return signed URL + flow package URI in response

**Response (approved):**
```json
{
  "gate": "client_approval",
  "status": "APPROVED",
  "revisionCycles": 0,
  "flowPackageUrl": "https://storage.googleapis.com/...?signature=...",
  "flowPackageUri": "gs://.../flow-package.json",
  "pipelineComplete": true
}
```

**Response (revisions required):**
```json
{
  "gate": "client_approval",
  "status": "REVISIONS_REQUIRED",
  "revisionCycles": 0,
  "pipelineComplete": false
}
```

## Gate locking logic

| Gate 1 status | Gate 2 |
|---|---|
| Not submitted | Locked — waiting for ECD |
| REVISIONS_REQUIRED | Locked — ECD revisions needed |
| APPROVED / APPROVED_WITH_REVISIONS | Unlocked — ready for client |

## Error scenarios

1. **Gate submitted for non-existent run** → 404 "Run {runId} not found"
2. **Gate 2 submitted before Gate 1** → 400 "Gate 1 (ECD approval) must be passed first"
3. **Gate 2 submitted when Gate 1 is REVISIONS_REQUIRED** → 400 "Gate 1 requires revisions — cannot proceed to client approval"
4. **Invalid approval status** → 400 with valid values
5. **Missing required notes on REVISIONS_REQUIRED** → 400 "Notes are required when revisions are requested"
6. **Flow package release fails (GCS error)** → gate record still written, Flow release error returned separately, UI shows retry option
