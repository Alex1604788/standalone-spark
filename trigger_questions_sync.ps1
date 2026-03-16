$url = 'https://bkmicyguzlwampuindff.supabase.co/functions/v1/sync-questions-api'
$headers = @{
    'Authorization' = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk'
    'Content-Type' = 'application/json'
}
$body = '{"marketplace_id":"84b1d0f5-6750-407c-9b04-28c051972162","client_id":"1172055","api_key":"6a584aee-c327-46a0-b46d-9aa7cdd92361"}'
Write-Host "Triggering sync-questions-api..."
$response = Invoke-RestMethod -Uri $url -Method POST -Headers $headers -Body $body -TimeoutSec 120
$response | ConvertTo-Json
