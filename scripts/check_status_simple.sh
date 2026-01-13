#!/bin/bash
# Simple status check

SUPABASE_URL="https://bkmicyguzlwampuindff.supabase.co"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk"

echo "Checking replies status..."

# Get count of each status
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/get_replies_count" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null || \
curl -s -X GET "$SUPABASE_URL/rest/v1/replies?deleted_at=is.null&select=status&limit=10000" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" | jq -r '.[].status' | sort | uniq -c
