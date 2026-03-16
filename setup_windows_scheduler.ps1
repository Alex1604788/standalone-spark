# Setup Windows Task Scheduler to trigger reviews sync every 10 minutes
# Run this script ONCE as Administrator to install the scheduled task
# This serves as backup in case Supabase pg_cron stops

$taskName = "OzonReviewsSync"
$scriptPath = (Resolve-Path ".\run_sync_task.ps1").Path
$workingDir = Split-Path $scriptPath

# Remove existing task if any
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

# Create action
$action = New-ScheduledTaskAction `
    -Execute "PowerShell.exe" `
    -Argument "-NonInteractive -WindowStyle Hidden -File `"$scriptPath`"" `
    -WorkingDirectory $workingDir

# Run every 10 minutes, starting now
$trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 10) -Once -At (Get-Date)

# Run as current user
$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Trigger OZON reviews sync every 10 minutes (backup for pg_cron)"

Write-Host "Task '$taskName' registered successfully!"
Write-Host "It will run every 10 minutes when your PC is on."
Write-Host "To remove: Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
