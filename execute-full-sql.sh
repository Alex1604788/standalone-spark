#!/bin/bash

# Read SQL file and escape it for JSON
SQL_CONTENT=$(cat /home/user/standalone-spark/AUTO_SETUP_SYSTEM.sql | jq -Rs .)

echo "🔄 Executing AUTO_SETUP_SYSTEM.sql via Supabase Management API..."
echo "📝 File size: $(wc -c < /home/user/standalone-spark/AUTO_SETUP_SYSTEM.sql) bytes"

# Execute SQL via Management API
curl -X POST "https://api.supabase.com/v1/projects/bkmicyguzlwampuindff/database/query" \
  -H "Authorization: Bearer sbp_5ff9cb7a1a678a7aad11fb7398dc810695b08a3a" \
  -H "Content-Type: application/json" \
  -d "{\"query\": $SQL_CONTENT}" \
  -w "\n\nHTTP Status: %{http_code}\n" \
  -o /tmp/sql_result.json \
  -s

HTTP_CODE=$?

if [ $HTTP_CODE -eq 0 ]; then
  echo "✅ SQL executed successfully!"
  echo ""
  echo "Response:"
  cat /tmp/sql_result.json | jq . || cat /tmp/sql_result.json
else
  echo "❌ Error executing SQL"
  echo "Response:"
  cat /tmp/sql_result.json
  exit 1
fi
