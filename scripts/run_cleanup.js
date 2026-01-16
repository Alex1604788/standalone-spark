// Execute the simple cleanup SQL script
// VERSION: 2026-01-15-v1
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = 'https://bkmicyguzlwampuindff.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162';

async function cleanupReplies() {
  console.log('=== Starting cleanup ===');

  // Count drafted
  const { count: draftedCount } = await supabase
    .from('replies')
    .select('*', { count: 'exact', head: true })
    .eq('marketplace_id', marketplace_id)
    .eq('status', 'drafted')
    .is('deleted_at', null);

  console.log(`Found ${draftedCount} drafted replies to delete`);

  // Count failed
  const { count: failedCount } = await supabase
    .from('replies')
    .select('*', { count: 'exact', head: true })
    .eq('marketplace_id', marketplace_id)
    .eq('status', 'failed')
    .is('deleted_at', null);

  console.log(`Found ${failedCount} failed replies to delete`);

  // Delete drafted
  const { error: draftedError } = await supabase
    .from('replies')
    .update({ deleted_at: new Date().toISOString() })
    .eq('marketplace_id', marketplace_id)
    .eq('status', 'drafted')
    .is('deleted_at', null);

  if (draftedError) {
    console.error('Error deleting drafted:', draftedError);
  } else {
    console.log(`✅ Deleted ${draftedCount} drafted replies`);
  }

  // Delete failed
  const { error: failedError } = await supabase
    .from('replies')
    .update({ deleted_at: new Date().toISOString() })
    .eq('marketplace_id', marketplace_id)
    .eq('status', 'failed')
    .is('deleted_at', null);

  if (failedError) {
    console.error('Error deleting failed:', failedError);
  } else {
    console.log(`✅ Deleted ${failedCount} failed replies`);
  }

  console.log(`=== Cleanup complete! Total deleted: ${(draftedCount || 0) + (failedCount || 0)} ===`);

  // Verify
  const { data: remaining } = await supabase
    .from('replies')
    .select('status')
    .eq('marketplace_id', marketplace_id)
    .is('deleted_at', null);

  const counts = remaining?.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  console.log('\nRemaining replies by status:', counts);
}

cleanupReplies().catch(console.error);
