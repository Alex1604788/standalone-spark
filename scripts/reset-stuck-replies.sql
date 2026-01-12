-- Reset all stuck publishing and failed replies back to scheduled status
UPDATE replies SET status = 'scheduled', retry_count = 0, error_message = NULL, scheduled_at = NOW(), updated_at = NOW() WHERE status IN ('publishing', 'failed') AND marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162';

-- Check results
SELECT status, COUNT(*) as count FROM replies WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162' GROUP BY status ORDER BY status;
