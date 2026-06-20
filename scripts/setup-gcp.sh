#!/usr/bin/env bash
# setup-gcp.sh — provision GCP resources for the agent memory store
#
# Usage:
#   GCP_PROJECT=my-project ./scripts/setup-gcp.sh
#
# Requires: gcloud CLI installed and authenticated
#   gcloud auth login
#   gcloud auth application-default login
#
# Auth: uses Application Default Credentials (ADC) — no service account key file needed.
# Safe to re-run — checks existence before creating each resource.

set -euo pipefail

# ── Config — override via env vars ─────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT:-aip-generative-exp-n0005168}"
REGION="${GCP_REGION:-australia-southeast1}"
INSTANCE_NAME="${CLOUD_SQL_INSTANCE:-gen-ux-memory}"
DB_NAME="${MEMORY_DB_NAME:-agent_memory}"
DB_USER="${MEMORY_DB_USER:-agent}"
SA_NAME="${GCP_SA_NAME:-gen-ux-agent}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
SECRET_NAME="${DB_SECRET_NAME:-gen-ux-db-password}"

echo "==> Project:  $PROJECT_ID"
echo "==> Region:   $REGION"
echo "==> Instance: $INSTANCE_NAME"
echo ""

gcloud config set project "$PROJECT_ID"

# ── 1. Enable APIs ──────────────────────────────────────────────────────────────
echo "==> Enabling APIs..."
gcloud services enable \
  aiplatform.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  --project="$PROJECT_ID"

# ── 2. Cloud SQL instance ───────────────────────────────────────────────────────
echo "==> Creating Cloud SQL instance (this takes ~5 min on first run)..."
if ! gcloud sql instances describe "$INSTANCE_NAME" --project="$PROJECT_ID" &>/dev/null; then
  gcloud sql instances create "$INSTANCE_NAME" \
    --database-version=POSTGRES_18 \
    --edition=ENTERPRISE \
    --cpu=2 \
    --memory=8192MB \
    --region="$REGION" \
    --storage-size=10GB \
    --storage-auto-increase \
    --backup-start-time=03:00 \
    --project="$PROJECT_ID"
else
  echo "    Instance already exists, skipping."
fi

# ── 3. Database ─────────────────────────────────────────────────────────────────
echo "==> Creating database '$DB_NAME'..."
if ! gcloud sql databases describe "$DB_NAME" --instance="$INSTANCE_NAME" --project="$PROJECT_ID" &>/dev/null; then
  gcloud sql databases create "$DB_NAME" \
    --instance="$INSTANCE_NAME" \
    --project="$PROJECT_ID"
else
  echo "    Database already exists, skipping."
fi

# ── 4. DB user ──────────────────────────────────────────────────────────────────
echo "==> Creating DB user '$DB_USER'..."
DB_PASSWORD="$(openssl rand -base64 32)"
if ! gcloud sql users list --instance="$INSTANCE_NAME" --project="$PROJECT_ID" \
    --format="value(name)" | grep -q "^${DB_USER}$"; then
  gcloud sql users create "$DB_USER" \
    --instance="$INSTANCE_NAME" \
    --password="$DB_PASSWORD" \
    --project="$PROJECT_ID"
else
  echo "    User already exists, skipping password generation."
  DB_PASSWORD="<existing — retrieve from Secret Manager>"
fi

# ── 5. Secret Manager ───────────────────────────────────────────────────────────
echo "==> Storing DB password in Secret Manager..."
if ! gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" &>/dev/null; then
  echo -n "$DB_PASSWORD" | gcloud secrets create "$SECRET_NAME" \
    --replication-policy=automatic \
    --data-file=- \
    --project="$PROJECT_ID"
else
  echo "    Secret already exists, skipping."
fi

# ── 6. Service account ──────────────────────────────────────────────────────────
echo "==> Creating service account '$SA_NAME'..."
if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="Gen UX Agent" \
    --project="$PROJECT_ID"
else
  echo "    Service account already exists, skipping."
fi

# ── 7. IAM roles ────────────────────────────────────────────────────────────────
echo "==> Granting IAM roles..."
for ROLE in \
  roles/aiplatform.user \
  roles/cloudsql.client \
  roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$ROLE" \
    --condition=None \
    --quiet
done

# ── 8. Grant ADC user impersonation of the service account ─────────────────────
# Allows `gcloud auth application-default login` users to act as the SA locally.
echo "==> Granting ADC impersonation for authenticated user..."
CURRENT_USER="$(gcloud config get-value account)"
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --member="user:${CURRENT_USER}" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project="$PROJECT_ID" \
  --quiet

# ── Done ────────────────────────────────────────────────────────────────────────
CONNECTION_NAME="${PROJECT_ID}:${REGION}:${INSTANCE_NAME}"

echo ""
echo "==> Done. Add these to your .env:"
echo ""
echo "    VERTEX_PROJECT=${PROJECT_ID}"
echo "    VERTEX_LOCATION=${REGION}"
echo "    CLOUD_SQL_CONNECTION_NAME=${CONNECTION_NAME}"
echo "    MEMORY_DB_URL=postgresql://${DB_USER}:<password>@/agent_memory?host=/cloudsql/${CONNECTION_NAME}"
echo ""
echo "==> Auth (run once per machine, no key file needed):"
echo "    gcloud auth application-default login"
echo "    gcloud auth application-default set-quota-project ${PROJECT_ID}"
echo ""
echo "==> Next: run init-db.sql against the new instance:"
echo "    gcloud sql connect ${INSTANCE_NAME} --user=${DB_USER} --database=${DB_NAME} < scripts/init-db.sql"
