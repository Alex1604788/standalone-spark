$headers = @{
    'Authorization' = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk'
    'Content-Type' = 'application/json'
    'apikey' = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk'
}
$body = @{
    marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
    client_id = '1172055'
    api_key = '6a584aee-c327-46a0-b46d-9aa7cdd92361'
} | ConvertTo-Json

$count = if ($args[0]) { [int]$args[0] } else { 5 }

for ($i = 1; $i -le $count; $i++) {
    Write-Output "Sync #$i..."
    try {
        $result = Invoke-RestMethod -Uri 'https://bkmicyguzlwampuindff.supabase.co/functions/v1/sync-chats-api' -Method POST -Headers $headers -Body $body -TimeoutSec 120
        Write-Output "Sync #$i OK: $($result | ConvertTo-Json -Depth 2 -Compress)"
    } catch {
        Write-Output "Sync #$i Error: $($_.Exception.Message)"
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $errBody = $reader.ReadToEnd()
            Write-Output "Response: $errBody"
        }
    }
    if ($i -lt $count) { Start-Sleep -Seconds 5 }
}
Write-Output "All $count syncs done!"
