#!/bin/bash

# =============================================================================
# Supabase Edge Functions Deployment Script
# =============================================================================
# This script deploys all Edge Functions to Supabase project: jnybwdisncvqmlacgrpr
# 
# Prerequisites:
# 1. Install Supabase CLI: https://supabase.com/docs/guides/cli
# 2. Run this script from the project root directory
# =============================================================================

set -e  # Exit immediately if a command exits with a non-zero status

echo "🚀 Starting Supabase Edge Functions deployment..."
echo ""

# Step 1: Login to Supabase
# This will open a browser window for authentication
echo "📝 Step 1: Logging into Supabase..."
supabase login

echo ""

# Step 2: Link to your Supabase project
# This connects the CLI to your specific project
echo "🔗 Step 2: Linking to Supabase project jnybwdisncvqmlacgrpr..."
supabase link --project-ref jnybwdisncvqmlacgrpr

echo ""
echo "✅ Successfully linked to project!"
echo ""

# Step 3: Deploy all Edge Functions
echo "📦 Step 3: Deploying Edge Functions..."
echo ""

# Core Ozon functions
echo "  → Deploying ozon-save..."
supabase functions deploy ozon-save --no-verify-jwt

echo "  → Deploying ozon-check..."
supabase functions deploy ozon-check --no-verify-jwt

echo "  → Deploying sync-ozon..."
supabase functions deploy sync-ozon --no-verify-jwt

# Product management functions
echo "  → Deploying sync-products..."
supabase functions deploy sync-products --no-verify-jwt

echo "  → Deploying save-products..."
supabase functions deploy save-products --no-verify-jwt

# Review and question sync functions
echo "  → Deploying sync-reviews..."
supabase functions deploy sync-reviews --no-verify-jwt

echo "  → Deploying sync-reviews-api..."
supabase functions deploy sync-reviews-api --no-verify-jwt

# Reply management functions
echo "  → Deploying generate-reply..."
supabase functions deploy generate-reply

echo "  → Deploying ai-generate..."
supabase functions deploy ai-generate --no-verify-jwt

echo "  → Deploying publish-reply..."
supabase functions deploy publish-reply --no-verify-jwt

echo "  → Deploying get-pending-replies..."
supabase functions deploy get-pending-replies --no-verify-jwt

echo "  → Deploying mark-reply-published..."
supabase functions deploy mark-reply-published --no-verify-jwt

echo "  → Deploying process-scheduled-replies..."
supabase functions deploy process-scheduled-replies --no-verify-jwt

# Automation functions
echo "  → Deploying auto-generate-drafts..."
supabase functions deploy auto-generate-drafts --no-verify-jwt

# Webhook and fallback functions
echo "  → Deploying fallback-webhook..."
supabase functions deploy fallback-webhook --no-verify-jwt

# Marketplace management
echo "  → Deploying create-or-get-marketplace..."
supabase functions deploy create-or-get-marketplace --no-verify-jwt

echo ""
echo "✅ All Edge Functions deployed successfully!"
echo ""
echo "📍 Functions are now available at:"
echo "   https://jnybwdisncvqmlacgrpr.supabase.co/functions/v1/{function_name}"
echo ""
echo "🎉 Deployment complete!"
