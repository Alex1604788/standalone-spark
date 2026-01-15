#!/bin/bash
source .env

echo "=== 1. Check marketplace sync mode ==="
curl -s "${VITE_SUPABASE_URL}/rest/v1/rpc/get_marketplace_sync_mode" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"p_marketplace_id": "84b1d0f5-6750-407c-9b04-28c051972162"}'

echo -e "\n\n=== 2. Check replies in different statuses ==="
echo "Scheduled:"
curl -s "${VITE_SUPABASE_URL}/rest/v1/replies?status=eq.scheduled&marketplace_id=eq.84b1d0f5-6750-407c-9b04-28c051972162&select=count" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Prefer: count=exact"

echo -e "\nPublishing:"
curl -s "${VITE_SUPABASE_URL}/rest/v1/replies?status=eq.publishing&marketplace_id=eq.84b1d0f5-6750-407c-9b04-28c051972162&select=count" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Prefer: count=exact"

echo -e "\nFailed:"
curl -s "${VITE_SUPABASE_URL}/rest/v1/replies?status=eq.failed&marketplace_id=eq.84b1d0f5-6750-407c-9b04-28c051972162&select=count" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Prefer: count=exact"

echo -e "\nPublished:"
curl -s "${VITE_SUPABASE_URL}/rest/v1/replies?status=eq.published&marketplace_id=eq.84b1d0f5-6750-407c-9b04-28c051972162&select=count" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Prefer: count=exact"

echo -e "\n\n=== 3. Check one publishing reply details ==="
curl -s "${VITE_SUPABASE_URL}/rest/v1/replies?status=eq.publishing&marketplace_id=eq.84b1d0f5-6750-407c-9b04-28c051972162&select=id,review_id,error_message,retry_count,updated_at&order=updated_at.asc&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"

echo -e "\n\n=== 4. Check API credentials ==="
curl -s "${VITE_SUPABASE_URL}/rest/v1/rpc/get_api_credentials" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"p_marketplace_id": "84b1d0f5-6750-407c-9b04-28c051972162", "p_api_type": "seller"}'
