# GCP Foundations

## Official docs
- [GCP IAM](https://cloud.google.com/iam/docs/overview)
- [`gcloud` reference](https://cloud.google.com/sdk/gcloud/reference)
- [Firestore](https://cloud.google.com/firestore/docs)
- [Cloud Storage](https://cloud.google.com/storage/docs)
- [Vertex AI](https://cloud.google.com/vertex-ai/docs)

## Greenlight GCP footprint

| Resource | Name | Purpose |
|---|---|---|
| Project | `greenlight-v01` | All resources live here |
| Service account | `greenlight-agent@greenlight-v01.iam.gserviceaccount.com` | Pipeline + CF auth |
| Firestore DB | Native mode, `us-central1` | Audit records |
| GCS bucket | `greenlight-assets` | Reference images, Flow packages |

## Required APIs
```
aiplatform.googleapis.com       Vertex AI
firestore.googleapis.com        Firestore
storage.googleapis.com          Cloud Storage
cloudfunctions.googleapis.com   Cloud Functions
slides.googleapis.com           Google Slides
drive.googleapis.com            Google Drive
```

## IAM roles for greenlight-agent
```
roles/aiplatform.user
roles/datastore.user
roles/storage.admin
roles/cloudfunctions.developer
```

## Provisioning script
See `scripts/setup-gcp.sh` in repo root. Idempotent — safe to re-run.

## Credentials
- Download service account JSON key
- Set `GCP_SERVICE_ACCOUNT_KEY` env var (Vercel + local `.env`)
- Set `GCP_PROJECT_ID=greenlight-v01`
- Set `VERTEX_LOCATION=us-central1`
