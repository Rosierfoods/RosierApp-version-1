#!/usr/bin/env bash
# One-command deploy of the Rosier backend + admin panel to Google Cloud Run (Mumbai).
# Run it in Google Cloud Shell from this folder:   bash deploy-gcloud.sh
# Needs: ~/env.yaml (copy of env.example.yaml, filled in) and the Cloud SQL database "rosier-db".
set -euo pipefail

REGION="${REGION:-asia-south1}"
SERVICE="${SERVICE:-rosier-api}"
DB_INSTANCE="${DB_INSTANCE:-rosier-db}"
MAX="${MAX_INSTANCES:-3}"
PROJECT="$(gcloud config get-value project 2>/dev/null)"

if [ -z "$PROJECT" ]; then echo "Choose your project first:  gcloud config set project YOUR_PROJECT_ID"; exit 1; fi
if [ ! -f "$HOME/env.yaml" ]; then echo "Missing ~/env.yaml — run:  cp env.example.yaml ~/env.yaml && nano ~/env.yaml"; exit 1; fi
if grep -q "DBPASSWORD\|PROJECT_ID\|PASTE-A-LONG\|A-STRONG-PASSWORD" "$HOME/env.yaml"; then echo "~/env.yaml still has placeholder values — fill them in with:  nano ~/env.yaml"; exit 1; fi

echo "Deploying $SERVICE to $REGION in project $PROJECT …"
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --min-instances 1 \
  --max-instances "$MAX" \
  --no-cpu-throttling \
  --cpu 1 --memory 1Gi \
  --concurrency 80 \
  --timeout 300 \
  --add-cloudsql-instances "$PROJECT:$REGION:$DB_INSTANCE" \
  --env-vars-file "$HOME/env.yaml" \
  --quiet

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
echo
echo "Live at: $URL"
echo "Check:   $URL/healthz   (should say \"db\":\"postgres\")"
echo "Admin:   $URL/admin"
echo "Store links → privacy: $URL/privacy   terms: $URL/terms   delete account: $URL/delete-account"
