#!/bin/bash
# Automatic cleanup of drafted replies via Supabase REST API
# This script deletes in batches to avoid timeout

SUPABASE_URL="https://bkmicyguzlwampuindff.supabase.co"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk"

echo "Starting cleanup of drafted replies..."
TOTAL_DELETED=0
BATCH=0

while true; do
  BATCH=$((BATCH + 1))

  # Get 1000 drafted reply IDs
  echo "Batch $BATCH: Fetching drafted replies..."
  RESPONSE=$(curl -s -X GET "$SUPABASE_URL/rest/v1/replies?status=eq.drafted&deleted_at=is.null&select=id&limit=1000" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY")

  # Check if empty
  COUNT=$(echo "$RESPONSE" | jq '. | length')

  if [ "$COUNT" -eq 0 ]; then
    echo "No more drafted replies to delete"
    break
  fi

  # Extract IDs
  IDS=$(echo "$RESPONSE" | jq -r '.[].id' | paste -sd "," -)

  # Delete this batch
  echo "Batch $BATCH: Deleting $COUNT replies..."
  NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

  curl -s -X PATCH "$SUPABASE_URL/rest/v1/replies?id=in.($IDS)" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "{\"deleted_at\":\"$NOW\",\"updated_at\":\"$NOW\"}"

  TOTAL_DELETED=$((TOTAL_DELETED + COUNT))
  echo "Batch $BATCH: Deleted $COUNT (total: $TOTAL_DELETED)"

  if [ "$COUNT" -lt 1000 ]; then
    echo "Last batch was smaller than 1000, cleanup complete"
    break
  fi

  # Small delay
  sleep 0.5
done

echo "=========================================="
echo "Cleanup completed!"
echo "Total deleted: $TOTAL_DELETED"
echo "=========================================="

# Show final counts
echo ""
echo "Final counts:"
curl -s -X GET "$SUPABASE_URL/rest/v1/replies?deleted_at=is.null&select=status" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  | jq -r '.[].status' | sort | uniq -c
