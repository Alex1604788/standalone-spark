# Edge Functions Deployment Scripts

This directory contains scripts for deploying Supabase Edge Functions to your project.

## Prerequisites

1. **Install Supabase CLI**
   ```bash
   # macOS/Linux
   brew install supabase/tap/supabase
   
   # Windows
   scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
   scoop install supabase
   
   # Or using npm
   npm install -g supabase
   ```

2. **Verify Installation**
   ```bash
   supabase --version
   ```

## Usage

### macOS/Linux (Bash)

1. Make the script executable:
   ```bash
   chmod +x scripts/deploy_functions.sh
   ```

2. Run from project root:
   ```bash
   ./scripts/deploy_functions.sh
   ```

### Windows (PowerShell)

1. Open PowerShell as Administrator

2. Allow script execution (first time only):
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

3. Run from project root:
   ```powershell
   .\scripts\deploy_functions.ps1
   ```

## What Gets Deployed

The script deploys all Edge Functions to project `jnybwdisncvqmlacgrpr`:

- **Ozon Integration**: ozon-save, ozon-check, sync-ozon
- **Product Management**: sync-products, save-products
- **Review Sync**: sync-reviews, sync-reviews-api
- **Reply Management**: generate-reply, ai-generate, publish-reply, get-pending-replies, mark-reply-published
- **Automation**: auto-generate-drafts, process-scheduled-replies
- **Webhooks**: fallback-webhook
- **Marketplace**: create-or-get-marketplace

## After Deployment

Functions will be available at:
```
https://jnybwdisncvqmlacgrpr.supabase.co/functions/v1/{function_name}
```

## Troubleshooting

- **Login fails**: Make sure you have a Supabase account and browser access
- **Link fails**: Verify project ID is correct: `jnybwdisncvqmlacgrpr`
- **Deploy fails**: Check that you're in the project root directory with `supabase/functions/` folder
- **Permission denied (Bash)**: Run `chmod +x scripts/deploy_functions.sh`
- **Script blocked (PowerShell)**: Run `Set-ExecutionPolicy RemoteSigned`
