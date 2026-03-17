// TEMPORARY cleanup function - run once to fix old 2025 reviews
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Step 1: Get count of old reviews first
  const { count: oldReviewCount } = await supabase
    .from('reviews')
    .select('id', { count: 'exact', head: true })
    .lt('review_date', '2026-01-01T00:00:00Z')
    .in('segment', ['unanswered', 'pending'])
    .is('deleted_at', null);

  const { count: oldReplyCount } = await supabase
    .from('replies')
    .select('id', { count: 'exact', head: true })
    .in('status', ['scheduled', 'drafted'])
    .is('deleted_at', null);

  // Step 2: Get IDs of old reviews
  const { data: oldReviews } = await supabase
    .from('reviews')
    .select('id')
    .lt('review_date', '2026-01-01T00:00:00Z')
    .in('segment', ['unanswered', 'pending'])
    .is('deleted_at', null);

  const oldReviewIds = (oldReviews || []).map(r => r.id);
  let deletedReplies = 0;
  let archivedReviews = 0;

  // Step 3: Delete replies in batches of 500
  for (let i = 0; i < oldReviewIds.length; i += 500) {
    const batch = oldReviewIds.slice(i, i + 500);
    const { error } = await supabase
      .from('replies')
      .update({ deleted_at: new Date().toISOString() })
      .in('review_id', batch)
      .in('status', ['scheduled', 'drafted'])
      .is('deleted_at', null);
    
    if (!error) deletedReplies += batch.length;
    console.log(`Deleted replies batch ${i/500 + 1}: ${batch.length} reviews processed`);
  }

  // Step 4: Archive old reviews in batches of 500
  for (let i = 0; i < oldReviewIds.length; i += 500) {
    const batch = oldReviewIds.slice(i, i + 500);
    const { error } = await supabase
      .from('reviews')
      .update({ is_answered: true, segment: 'archived' })
      .in('id', batch)
      .is('deleted_at', null);
    
    if (!error) archivedReviews += batch.length;
    console.log(`Archived reviews batch ${i/500 + 1}: ${batch.length} reviews processed`);
  }

  return new Response(JSON.stringify({
    success: true,
    old_reviews_found: oldReviewCount,
    old_replies_found: oldReplyCount,
    replies_cancelled: deletedReplies,
    reviews_archived: archivedReviews,
    message: `Отменено ${deletedReplies} черновиков/расписаний, архивировано ${archivedReviews} старых отзывов`
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
