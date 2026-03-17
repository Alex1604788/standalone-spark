// TEMPORARY cleanup function - run once to fix old 2025 reviews
// v2: Two-pass approach to bypass BEFORE UPDATE trigger limitation
// The trigger calculate_review_segment reads OLD is_answered from DB.
// Fix: First REST call sets is_answered=true (segment stays 'unanswered').
//      Second REST call (new transaction) fires trigger which NOW
//      reads is_answered=true from DB → correctly sets segment='archived'.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Get IDs of old reviews still in unanswered/pending
  // Supabase returns max 1000 by default - that's our batch size
  const { data: oldReviews } = await supabase
    .from('reviews')
    .select('id')
    .lt('review_date', '2026-01-01T00:00:00Z')
    .in('segment', ['unanswered', 'pending'])
    .is('deleted_at', null);

  const oldReviewIds = (oldReviews || []).map((r: { id: string }) => r.id);

  if (oldReviewIds.length === 0) {
    // Count total remaining to confirm done
    const { count: remaining } = await supabase
      .from('reviews')
      .select('id', { count: 'exact', head: true })
      .lt('review_date', '2026-01-01T00:00:00Z')
      .in('segment', ['unanswered', 'pending'])
      .is('deleted_at', null);

    return new Response(JSON.stringify({
      success: true,
      old_reviews_found: 0,
      reviews_archived: 0,
      remaining: remaining || 0,
      message: remaining === 0 ? '✅ ALL DONE! All old reviews archived.' : `Found ${remaining} remaining but batch was empty`
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  console.log(`Processing batch of ${oldReviewIds.length} old reviews`);

  // Step 1: Cancel scheduled/drafted replies for these reviews
  let deletedReplies = 0;
  for (let i = 0; i < oldReviewIds.length; i += 500) {
    const batch = oldReviewIds.slice(i, i + 500);
    const { error } = await supabase
      .from('replies')
      .update({ deleted_at: new Date().toISOString() })
      .in('review_id', batch)
      .in('status', ['scheduled', 'drafted'])
      .is('deleted_at', null);
    if (!error) deletedReplies++;
  }
  console.log(`Step 1: Cancelled replies for batch`);

  // Step 2: FIRST PASS - Set is_answered=true
  // Trigger fires but reads OLD is_answered=false from DB → sets segment='unanswered'
  // BUT is_answered=true IS committed to DB after this REST call
  for (let i = 0; i < oldReviewIds.length; i += 500) {
    const batch = oldReviewIds.slice(i, i + 500);
    await supabase
      .from('reviews')
      .update({ is_answered: true })
      .in('id', batch)
      .is('deleted_at', null);
  }
  console.log(`Step 2: Set is_answered=true (trigger sees old value, segment still 'unanswered')`);

  // Step 3: SECOND PASS - trigger NOW reads is_answered=true (committed in step 2) → 'archived'
  let archivedReviews = 0;
  for (let i = 0; i < oldReviewIds.length; i += 500) {
    const batch = oldReviewIds.slice(i, i + 500);
    const { error } = await supabase
      .from('reviews')
      .update({ segment: 'archived' })
      .in('id', batch)
      .eq('is_answered', true)
      .is('deleted_at', null);
    if (!error) archivedReviews += batch.length;
  }
  console.log(`Step 3: Archived ${archivedReviews} reviews (trigger now reads is_answered=true)`);

  // Count remaining old unanswered
  const { count: remaining } = await supabase
    .from('reviews')
    .select('id', { count: 'exact', head: true })
    .lt('review_date', '2026-01-01T00:00:00Z')
    .in('segment', ['unanswered', 'pending'])
    .is('deleted_at', null);

  return new Response(JSON.stringify({
    success: true,
    batch_size: oldReviewIds.length,
    replies_cancelled: deletedReplies,
    reviews_archived: archivedReviews,
    remaining: remaining || 0,
    done: (remaining || 0) === 0,
    message: `Archived ${archivedReviews}, remaining: ${remaining || 0}`
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
