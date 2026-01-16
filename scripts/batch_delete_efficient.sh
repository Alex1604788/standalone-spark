#!/bin/bash
# Efficient batch delete using bulk updates
# VERSION: 2026-01-15-v2

SUPABASE_URL="https://bkmicyguzlwampuindff.supabase.co"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk"
MARKETPLACE_ID="84b1d0f5-6750-407c-9b04-28c051972162"

echo "=== Efficient batch delete via REST API ==="
echo "Target: 7,944 drafted + 21 failed = 7,965 total replies"
echo ""

BATCH_SIZE=100
DRAFTED_DELETED=0

# Delete drafted in batches
echo "Deleting drafted replies in batches of ${BATCH_SIZE}..."
ITERATION=0
while true; do
  ITERATION=$((ITERATION + 1))

  # Get batch of IDs as comma-separated string
  IDS=$(curl -s -X GET \
    "${SUPABASE_URL}/rest/v1/replies?marketplace_id=eq.${MARKETPLACE_ID}&status=eq.drafted&deleted_at=is.null&select=id&limit=${BATCH_SIZE}" \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" | jq -r '.[].id' | tr '\n' ',' | sed 's/,$//')

  if [ -z "$IDS" ]; then
    echo "✅ No more drafted replies to delete"
    break
  fi

  # Count how many IDs
  COUNT=$(echo "$IDS" | tr ',' '\n' | wc -l)

  # Bulk delete using IN filter
  RESPONSE=$(curl -s -X PATCH \
    "${SUPABASE_URL}/rest/v1/replies?id=in.(${IDS})" \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "{\"deleted_at\": \"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"}")

  if echo "$RESPONSE" | grep -q "error"; then
    echo "❌ Error in iteration ${ITERATION}: ${RESPONSE}"
    break
  fi

  DRAFTED_DELETED=$((DRAFTED_DELETED + COUNT))
  echo "[${ITERATION}] Deleted ${COUNT} drafted replies (total: ${DRAFTED_DELETED}/7944)"

  sleep 0.3
done

echo ""
echo "Deleting failed replies (21 total)..."

# Delete failed replies in one go
FAILED_IDS=$(curl -s -X GET \
  "${SUPABASE_URL}/rest/v1/replies?marketplace_id=eq.${MARKETPLACE_ID}&status=eq.failed&deleted_at=is.null&select=id" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" | jq -r '.[].id' | tr '\n' ',' | sed 's/,$//')

if [ -n "$FAILED_IDS" ]; then
  FAILED_COUNT=$(echo "$FAILED_IDS" | tr ',' '\n' | wc -l)

  curl -s -X PATCH \
    "${SUPABASE_URL}/rest/v1/replies?id=in.(${FAILED_IDS})" \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "{\"deleted_at\": \"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"}" > /dev/null

  echo "✅ Deleted ${FAILED_COUNT} failed replies"
  FAILED_DELETED=$FAILED_COUNT
else
  echo "No failed replies to delete"
  FAILED_DELETED=0
fi

echo ""
echo "=== Cleanup complete! ==="
echo "Total drafted deleted: ${DRAFTED_DELETED}"
echo "Total failed deleted: ${FAILED_DELETED}"
echo "Grand total: $((DRAFTED_DELETED + FAILED_DELETED))"
