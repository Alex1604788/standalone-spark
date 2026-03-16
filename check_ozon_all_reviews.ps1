$headers = @{
    'Client-Id' = '1172055'
    'Api-Key' = '6a584aee-c327-46a0-b46d-9aa7cdd92361'
    'Content-Type' = 'application/json'
}

# Test 1: All reviews, no status filter, no cursor - see what comes back first
$body = '{"limit": 20}'
$result = Invoke-RestMethod -Uri 'https://api-seller.ozon.ru/v1/review/list' -Method POST -Headers $headers -Body $body -TimeoutSec 30
Write-Host "=== ALL reviews (no status, no cursor) ==="
Write-Host "Count: $($result.reviews.Count), has_next: $($result.has_next), last_id: $($result.last_id)"
if ($result.reviews.Count -gt 0) {
    Write-Host "First: $($result.reviews[0].published_at)"
    Write-Host "Last: $($result.reviews[-1].published_at)"
}

# Test 2: UNPROCESSED, no cursor - oldest unprocessed
$body2 = '{"filter": {"status": "UNPROCESSED"}, "limit": 20}'
$result2 = Invoke-RestMethod -Uri 'https://api-seller.ozon.ru/v1/review/list' -Method POST -Headers $headers -Body $body2 -TimeoutSec 30
Write-Host "`n=== UNPROCESSED (no cursor) ==="
Write-Host "Count: $($result2.reviews.Count), has_next: $($result2.has_next), last_id: $($result2.last_id)"
if ($result2.reviews.Count -gt 0) {
    Write-Host "First: $($result2.reviews[0].published_at) id=$($result2.reviews[0].id)"
    Write-Host "Last: $($result2.reviews[-1].published_at) id=$($result2.reviews[-1].id)"
}

# Test 3: UNPROCESSED with cursor just before today - see what's there
$body3 = '{"filter": {"status": "UNPROCESSED"}, "limit": 20, "last_id": "019cf74f-8653-7a04-985b-7efded58e9ea"}'
$result3 = Invoke-RestMethod -Uri 'https://api-seller.ozon.ru/v1/review/list' -Method POST -Headers $headers -Body $body3 -TimeoutSec 30
Write-Host "`n=== UNPROCESSED (from cursor 15:19 UTC) ==="
Write-Host "Count: $($result3.reviews.Count), has_next: $($result3.has_next)"
if ($result3.reviews.Count -gt 0) {
    foreach ($r in $result3.reviews) {
        Write-Host "  id=$($r.id), date=$($r.published_at), answered=$($r.is_answered)"
    }
}

# Test 4: ALL reviews with cursor just before today - see what's there without UNPROCESSED filter
$body4 = '{"limit": 20, "last_id": "019cf74f-8653-7a04-985b-7efded58e9ea"}'
$result4 = Invoke-RestMethod -Uri 'https://api-seller.ozon.ru/v1/review/list' -Method POST -Headers $headers -Body $body4 -TimeoutSec 30
Write-Host "`n=== ALL reviews (from cursor 15:19 UTC) ==="
Write-Host "Count: $($result4.reviews.Count), has_next: $($result4.has_next)"
if ($result4.reviews.Count -gt 0) {
    foreach ($r in $result4.reviews) {
        Write-Host "  id=$($r.id), date=$($r.published_at), is_answered=$($r.is_answered), status=$($r.status)"
    }
}
