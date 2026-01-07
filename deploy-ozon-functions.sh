#!/bin/bash

echo "🚀 Deploying OZON API Integration Functions..."
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to deploy with error handling
deploy_function() {
  local func_name=$1
  echo -n "Deploying $func_name... "

  if npx supabase functions deploy $func_name --no-verify-jwt 2>&1 | grep -q "Deployed"; then
    echo -e "${GREEN}✅ Success${NC}"
    return 0
  else
    echo -e "${RED}❌ Failed${NC}"
    return 1
  fi
}

# Deploy all functions
functions=(
  "sync-chats-api"
  "sync-questions-api"
  "send-chat-message"
  "send-chat-file"
)

success_count=0
fail_count=0

for func in "${functions[@]}"; do
  if deploy_function "$func"; then
    ((success_count++))
  else
    ((fail_count++))
  fi
  echo ""
done

echo "================================"
echo "Deployment Summary:"
echo "✅ Successful: $success_count"
echo "❌ Failed: $fail_count"
echo "================================"

if [ $fail_count -eq 0 ]; then
  echo -e "${GREEN}🎉 All functions deployed successfully!${NC}"
  exit 0
else
  echo -e "${RED}⚠️  Some functions failed to deploy${NC}"
  exit 1
fi
