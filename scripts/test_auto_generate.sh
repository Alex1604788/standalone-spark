#!/bin/bash
# Test script for auto-generate-drafts function

echo "Testing auto-generate-drafts function..."
echo ""

# Known marketplace_id from OZON
MARKETPLACE_ID="84b1d0f5-6750-407c-9b04-28c051972162"

# Get user_id from marketplace using SERVICE_ROLE_KEY via RPC
# Since we can't access marketplaces table directly due to RLS,
# we'll call the CRON wrapper which handles this automatically

echo "=== Method 1: Call CRON wrapper (recommended) ==="
echo "This automatically finds all active marketplaces and their user_ids"
echo ""

curl -X POST 'https://bkmicyguzlwampuindff.supabase.co/functions/v1/auto-generate-drafts-cron' \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ" \
  -H "Content-Type: application/json"

echo ""
echo ""
echo "=== Check results ==="
echo "Checking if replies were created..."
echo ""

sleep 2

curl -s 'https://bkmicyguzlwampuindff.supabase.co/rest/v1/replies?select=id,status,review_id,created_at&marketplace_id=eq.84b1d0f5-6750-407c-9b04-28c051972162&deleted_at=is.null&order=created_at.desc&limit=5' \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ" | jq

echo ""
echo "=== Next: Check Supabase Logs ==="
echo "Go to Supabase Dashboard → Edge Functions → auto-generate-drafts → Logs"
echo "Look for:"
echo "  🔍 Attempting INSERT - shows what data is being inserted"
echo "  📊 INSERT result - shows if it succeeded or failed"
echo "  ❌ Insert ERROR - if there's an error"
echo "  ⚠️ INSERT returned NO data - if RLS blocked the SELECT"
echo "  ⚡ Successfully created - if it worked!"
