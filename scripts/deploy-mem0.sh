#!/usr/bin/env bash
# deploy-mem0.sh — build and deploy Mem0 OSS server to Cloud Run
#
# Reads ANTHROPIC_API_KEY and OPENAI_API_KEY from .env at the repo root,
# stores them in Secret Manager, then deploys the mem0 server as a Cloud Run
# service backed by the existing Cloud SQL instance.
#
# Usage: ./scripts/deploy-mem0.sh
# Safe to re-run — idempotent.

set -euo pipefail

PROJECT_ID="${GCP_PROJECT:-aip-generative-exp-n0005168}"
REGION="${GCP_REGION:-australia-southeast1}"
CONNECTION_NAME="${CLOUD_SQL_CONNECTION_NAME:-${PROJECT_ID}:${REGION}:gen-ux-memory}"
DB_NAME="${MEMORY_DB_NAME:-agent_memory}"
DB_USER="${MEMORY_DB_USER:-agent}"
DB_SECRET="${DB_SECRET_NAME:-gen-ux-db-password}"
SA_EMAIL="gen-ux-agent@${PROJECT_ID}.iam.gserviceaccount.com"
SERVICE_NAME="mem0-server"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"
MEM0_DIR="${SCRIPT_DIR}/../backend/mem0"

read_env() {
  grep "^${1}=" "$ENV_FILE" | cut -d= -f2- | tr -d '"'
}

echo "==> Project:  $PROJECT_ID"
echo "==> Region:   $REGION"
echo ""

gcloud config set project "$PROJECT_ID"

# ── 1. Enable APIs ──────────────────────────────────────────────────────────────
echo "==> Enabling APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project="$PROJECT_ID"

# ── 2. Store API keys in Secret Manager ────────────────────────────────────────
echo "==> Storing API keys in Secret Manager..."
for VAR in ANTHROPIC_API_KEY OPENAI_API_KEY; do
  SECRET_NAME="$(echo "$VAR" | tr '[:upper:]_' '[:lower:]-')"
  VALUE="$(read_env "$VAR")"
  if [[ -z "$VALUE" ]]; then
    echo "    WARNING: $VAR not found in .env — skipping"
    continue
  fi
  if ! gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" &>/dev/null; then
    echo -n "$VALUE" | gcloud secrets create "$SECRET_NAME" \
      --replication-policy=automatic \
      --data-file=- \
      --project="$PROJECT_ID"
    echo "    Created secret: $SECRET_NAME"
  else
    echo "    Secret $SECRET_NAME already exists, skipping."
  fi
done

# ── 3. Grant SA access to API key secrets ──────────────────────────────────────
echo "==> Granting SA access to secrets..."
for SECRET_NAME in anthropic-api-key openai-api-key; do
  gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$PROJECT_ID" \
    --quiet
done

# ── 4. Deploy to Cloud Run (Cloud Build handles the image build) ────────────────
echo "==> Deploying mem0-server to Cloud Run (building image via Cloud Build)..."
gcloud run deploy "$SERVICE_NAME" \
  --source="$MEM0_DIR" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --add-cloudsql-instances="$CONNECTION_NAME" \
  --service-account="$SA_EMAIL" \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=5 \
  --set-env-vars="DB_HOST=/cloudsql/${CONNECTION_NAME},DB_NAME=${DB_NAME},DB_USER=${DB_USER}" \
  --set-secrets="DB_PASSWORD=${DB_SECRET}:latest,ANTHROPIC_API_KEY=anthropic-api-key:latest,OPENAI_API_KEY=openai-api-key:latest" \
  --project="$PROJECT_ID"

# ── 5. Print result ─────────────────────────────────────────────────────────────
SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format='value(status.url)')"

echo ""
echo "==> Mem0 server live at: ${SERVICE_URL}"
echo ""
echo "==> Add to your .env:"
echo "    MEM0_BASE_URL=${SERVICE_URL}"
