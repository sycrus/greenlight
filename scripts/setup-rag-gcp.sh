#!/usr/bin/env bash
# setup-rag-gcp.sh — provision GCP resources for the llama-rag RAG pipeline
#
# Builds on setup-gcp.sh (which handles Cloud SQL + service account).
# Run this after setup-gcp.sh, or standalone if those resources already exist.
#
# What this does:
#   1. Enables Cloud Run, Cloud Storage, Artifact Registry, Eventarc APIs
#   2. Creates a GCS bucket for raw scraped content
#   3. Stores OPENAI_API_KEY in Secret Manager
#   4. Grants the service account Storage/Run/Artifact Registry IAM roles
#   5. Builds and pushes the llama-rag Docker image to Artifact Registry
#   6. Deploys llama-rag to Cloud Run (reads DB password + OpenAI key from Secrets)
#   7. Prints LLAMA_RAG_URL so you can point ingest_local.py at it
#
# Usage:
#   OPENAI_API_KEY=sk-... ./scripts/setup-rag-gcp.sh
#
# Optional overrides (env vars):
#   GCP_PROJECT, GCP_REGION, CLOUD_SQL_INSTANCE, MEMORY_DB_NAME, MEMORY_DB_USER
#   GCP_SA_NAME, DB_SECRET_NAME, RAG_GCS_BUCKET, RAG_SERVICE_NAME
#
# Requires: gcloud CLI, Docker (for image build)
#   gcloud auth login
#   gcloud auth application-default login
#   gcloud auth configure-docker <REGION>-docker.pkg.dev

set -euo pipefail

# ── Config ─────────────────────────────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT:-aip-generative-exp-n0005168}"
REGION="${GCP_REGION:-australia-southeast1}"
INSTANCE_NAME="${CLOUD_SQL_INSTANCE:-gen-ux-memory}"
DB_NAME="${MEMORY_DB_NAME:-agent_memory}"
DB_USER="${MEMORY_DB_USER:-agent}"
SA_NAME="${GCP_SA_NAME:-gen-ux-agent}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
DB_SECRET_NAME="${DB_SECRET_NAME:-gen-ux-db-password}"
OPENAI_SECRET_NAME="gen-ux-openai-key"

RAG_GCS_BUCKET="${RAG_GCS_BUCKET:-${PROJECT_ID}-rag-content}"
RAG_SERVICE_NAME="${RAG_SERVICE_NAME:-llama-rag}"
ARTIFACT_REPO="gen-ux"
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/${RAG_SERVICE_NAME}"
CONNECTION_NAME="${PROJECT_ID}:${REGION}:${INSTANCE_NAME}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "==> Project:    $PROJECT_ID"
echo "==> Region:     $REGION"
echo "==> GCS Bucket: $RAG_GCS_BUCKET"
echo "==> Image:      $IMAGE_NAME"
echo ""

gcloud config set project "$PROJECT_ID"

# ── 1. Enable APIs ─────────────────────────────────────────────────────────────
echo "==> Enabling APIs..."
gcloud services enable \
  run.googleapis.com \
  storage.googleapis.com \
  artifactregistry.googleapis.com \
  eventarc.googleapis.com \
  cloudbuild.googleapis.com \
  --project="$PROJECT_ID"

# ── 2. GCS bucket ──────────────────────────────────────────────────────────────
echo "==> Creating GCS bucket gs://${RAG_GCS_BUCKET}..."
if ! gsutil ls -b "gs://${RAG_GCS_BUCKET}" &>/dev/null; then
  gsutil mb -p "$PROJECT_ID" -l "$REGION" "gs://${RAG_GCS_BUCKET}"
  # Lifecycle: delete objects older than 365 days to control costs
  cat > /tmp/rag-lifecycle.json <<'EOF'
{
  "rule": [
    {
      "action": {"type": "Delete"},
      "condition": {"age": 365}
    }
  ]
}
EOF
  gsutil lifecycle set /tmp/rag-lifecycle.json "gs://${RAG_GCS_BUCKET}"
  rm /tmp/rag-lifecycle.json
  echo "    Created with 365-day lifecycle policy."
else
  echo "    Bucket already exists, skipping."
fi

# ── 3. OPENAI_API_KEY in Secret Manager ────────────────────────────────────────
echo "==> Storing OPENAI_API_KEY in Secret Manager..."
if ! gcloud secrets describe "$OPENAI_SECRET_NAME" --project="$PROJECT_ID" &>/dev/null; then
  if [[ -z "${OPENAI_API_KEY:-}" ]]; then
    echo "    ERROR: OPENAI_API_KEY env var not set. Re-run with OPENAI_API_KEY=sk-..."
    exit 1
  fi
  echo -n "$OPENAI_API_KEY" | gcloud secrets create "$OPENAI_SECRET_NAME" \
    --replication-policy=automatic \
    --data-file=- \
    --project="$PROJECT_ID"
  echo "    Secret created."
else
  echo "    Secret already exists, skipping."
  echo "    To update: echo -n 'sk-...' | gcloud secrets versions add $OPENAI_SECRET_NAME --data-file=- --project=$PROJECT_ID"
fi

# ── 4. IAM roles for service account ───────────────────────────────────────────
echo "==> Granting IAM roles to ${SA_EMAIL}..."
for ROLE in \
  roles/storage.objectViewer \
  roles/storage.objectCreator \
  roles/artifactregistry.writer \
  roles/run.invoker \
  roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$ROLE" \
    --condition=None \
    --quiet
done

# ── 5. Artifact Registry repository ────────────────────────────────────────────
echo "==> Creating Artifact Registry repository '${ARTIFACT_REPO}'..."
if ! gcloud artifacts repositories describe "$ARTIFACT_REPO" \
    --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  gcloud artifacts repositories create "$ARTIFACT_REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --project="$PROJECT_ID"
else
  echo "    Repository already exists, skipping."
fi

# ── 6. Configure Docker auth ───────────────────────────────────────────────────
echo "==> Configuring Docker auth for ${REGION}-docker.pkg.dev..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# ── 7. Build and push llama-rag image ──────────────────────────────────────────
echo "==> Building llama-rag Docker image..."
docker build \
  --platform linux/amd64 \
  -t "${IMAGE_NAME}:latest" \
  "${REPO_ROOT}/backend/llama-rag"

echo "==> Pushing image to Artifact Registry..."
docker push "${IMAGE_NAME}:latest"

IMAGE_DIGEST="$(docker inspect --format='{{index .RepoDigests 0}}' "${IMAGE_NAME}:latest")"
echo "    Pushed: ${IMAGE_DIGEST}"

# ── 8. Deploy llama-rag to Cloud Run ───────────────────────────────────────────
echo "==> Deploying ${RAG_SERVICE_NAME} to Cloud Run..."
gcloud run deploy "$RAG_SERVICE_NAME" \
  --image="${IMAGE_NAME}:latest" \
  --platform=managed \
  --region="$REGION" \
  --service-account="$SA_EMAIL" \
  --add-cloudsql-instances="${CONNECTION_NAME}" \
  --set-env-vars="DB_USER=${DB_USER},DB_NAME=${DB_NAME},CLOUD_SQL_CONNECTION_NAME=${CONNECTION_NAME}" \
  --set-secrets="DB_PASSWORD=${DB_SECRET_NAME}:latest,OPENAI_API_KEY=${OPENAI_SECRET_NAME}:latest" \
  --port=8001 \
  --min-instances=1 \
  --max-instances=5 \
  --memory=512Mi \
  --cpu=1 \
  --timeout=300 \
  --no-allow-unauthenticated \
  --project="$PROJECT_ID" \
  --quiet

SERVICE_URL="$(gcloud run services describe "$RAG_SERVICE_NAME" \
  --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')"

# ── 9. Eventarc trigger for incremental ingestion ──────────────────────────────
echo "==> Setting up Eventarc trigger for new GCS objects..."

# Cloud Run requires a separate ingest-job service for Eventarc (HTTP trigger)
# For now, print instructions — full Eventarc setup requires the ingest_job image too.
echo ""
echo "    NOTE: Eventarc trigger requires a separate ingest-job Cloud Run service."
echo "    To set up continuous ingestion, deploy ingest_job.py as a second service"
echo "    and run:"
echo ""
echo "    gcloud eventarc triggers create rag-ingest-trigger \\"
echo "      --location=${REGION} \\"
echo "      --destination-run-service=llama-rag-ingest-job \\"
echo "      --destination-run-region=${REGION} \\"
echo "      --event-filters='type=google.cloud.storage.object.v1.finalized' \\"
echo "      --event-filters='bucket=${RAG_GCS_BUCKET}' \\"
echo "      --service-account=${SA_EMAIL} \\"
echo "      --project=${PROJECT_ID}"

# ── Done ───────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  llama-rag deployed!                                         ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Service URL: ${SERVICE_URL}"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "==> Add to .env:"
echo ""
echo "    LLAMA_RAG_URL=${SERVICE_URL}"
echo "    RAG_GCS_BUCKET=${RAG_GCS_BUCKET}"
echo "    RAG_GCS_PREFIX=scraped/"
echo ""
echo "==> Ingest endava content to GCP (requires gcloud auth token):"
echo ""
echo "    TOKEN=\$(gcloud auth print-identity-token)"
echo "    LLAMA_RAG_URL=${SERVICE_URL} \\"
echo "      python scripts/ingest_local.py \\"
echo "      --pages-dir ~/Downloads/endava-scrape/endava-pages \\"
echo "      --index     ~/Downloads/endava-scrape/endava-pages-index.json"
echo ""
echo "    NOTE: Cloud Run is private (--no-allow-unauthenticated)."
echo "    The ingest script needs an auth header. Run the auth-wrapper:"
echo "    LLAMA_RAG_URL=${SERVICE_URL} LLAMA_RAG_AUTH_TOKEN=\$(gcloud auth print-identity-token) \\"
echo "      python scripts/ingest_local.py ..."
echo ""
echo "==> Upload raw scrape to GCS (for Cloud Scheduler full re-index):"
echo ""
echo "    gsutil -m cp ~/Downloads/endava-scrape/endava-pages/*.md \\"
echo "      gs://${RAG_GCS_BUCKET}/scraped/"
echo ""
