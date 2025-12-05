# =============================================================================
# Supabase Edge Functions Deployment Script (PowerShell)
# =============================================================================
# This script deploys all Edge Functions to Supabase project: jnybwdisncvqmlacgrpr
# 
# Prerequisites:
# 1. Install Supabase CLI: https://supabase.com/docs/guides/cli
# 2. Run this script from the project root directory in PowerShell
# =============================================================================

$ErrorActionPreference = "Stop"  # Stop execution on any error

Write-Host "🚀 Starting Supabase Edge Functions deployment..." -ForegroundColor Cyan
Write-Host ""

# Step 1: Login to Supabase
# This will open a browser window for authentication
Write-Host "📝 Step 1: Logging into Supabase..." -ForegroundColor Yellow
supabase login

Write-Host ""

# Step 2: Link to your Supabase project
# This connects the CLI to your specific project
Write-Host "🔗 Step 2: Linking to Supabase project jnybwdisncvqmlacgrpr..." -ForegroundColor Yellow
supabase link --project-ref jnybwdisncvqmlacgrpr

Write-Host ""
Write-Host "✅ Successfully linked to project!" -ForegroundColor Green
Write-Host ""

# Step 3: Deploy all Edge Functions
Write-Host "📦 Step 3: Deploying Edge Functions..." -ForegroundColor Yellow
Write-Host ""

# Core Ozon functions
Write-Host "  → Deploying ozon-save..." -ForegroundColor White
supabase functions deploy ozon-save --no-verify-jwt

Write-Host "  → Deploying ozon-check..." -ForegroundColor White
supabase functions deploy ozon-check --no-verify-jwt

Write-Host "  → Deploying sync-ozon..." -ForegroundColor White
supabase functions deploy sync-ozon --no-verify-jwt

# Product management functions
Write-Host "  → Deploying sync-products..." -ForegroundColor White
supabase functions deploy sync-products --no-verify-jwt

Write-Host "  → Deploying save-products..." -ForegroundColor White
supabase functions deploy save-products --no-verify-jwt

# Review and question sync functions
Write-Host "  → Deploying sync-reviews..." -ForegroundColor White
supabase functions deploy sync-reviews --no-verify-jwt

Write-Host "  → Deploying sync-reviews-api..." -ForegroundColor White
supabase functions deploy sync-reviews-api --no-verify-jwt

# Reply management functions
Write-Host "  → Deploying generate-reply..." -ForegroundColor White
supabase functions deploy generate-reply

Write-Host "  → Deploying ai-generate..." -ForegroundColor White
supabase functions deploy ai-generate --no-verify-jwt

Write-Host "  → Deploying publish-reply..." -ForegroundColor White
supabase functions deploy publish-reply --no-verify-jwt

Write-Host "  → Deploying get-pending-replies..." -ForegroundColor White
supabase functions deploy get-pending-replies --no-verify-jwt

Write-Host "  → Deploying mark-reply-published..." -ForegroundColor White
supabase functions deploy mark-reply-published --no-verify-jwt

Write-Host "  → Deploying process-scheduled-replies..." -ForegroundColor White
supabase functions deploy process-scheduled-replies --no-verify-jwt

# Automation functions
Write-Host "  → Deploying auto-generate-drafts..." -ForegroundColor White
supabase functions deploy auto-generate-drafts --no-verify-jwt

# Webhook and fallback functions
Write-Host "  → Deploying fallback-webhook..." -ForegroundColor White
supabase functions deploy fallback-webhook --no-verify-jwt

# Marketplace management
Write-Host "  → Deploying create-or-get-marketplace..." -ForegroundColor White
supabase functions deploy create-or-get-marketplace --no-verify-jwt

Write-Host ""
Write-Host "✅ All Edge Functions deployed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📍 Functions are now available at:" -ForegroundColor Cyan
Write-Host "   https://jnybwdisncvqmlacgrpr.supabase.co/functions/v1/{function_name}" -ForegroundColor White
Write-Host ""
Write-Host "🎉 Deployment complete!" -ForegroundColor Green
