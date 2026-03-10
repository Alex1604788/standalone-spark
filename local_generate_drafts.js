// Local auto-generate-drafts: creates template-based replies for unanswered reviews
// Runs locally without edge function timeout limits

const SUPABASE_URL = 'https://bkmicyguzlwampuindff.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk';
const MARKETPLACE_ID = '84b1d0f5-6750-407c-9b04-28c051972162';
const USER_ID = '34458753-5070-4f35-86a2-3e8ccbec6e38';

const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

// Settings from marketplace_settings:
// Ratings 1-3: mode=semi (drafted), templates ON
// Ratings 4-5: mode=auto (scheduled), templates ON
const MODES = { 1: 'semi', 2: 'semi', 3: 'semi', 4: 'auto', 5: 'auto' };

let templates = {}; // rating -> [content1, content2, ...]

async function loadTemplates() {
  console.log('Loading templates...');
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/reply_templates?select=id,content,rating&user_id=eq.${USER_ID}`,
    { headers }
  );
  const data = await res.json();
  if (!Array.isArray(data)) { console.error('Templates load error:', data); return; }
  for (const t of data) {
    const r = t.rating || 0; // 0 = universal
    if (!templates[r]) templates[r] = [];
    templates[r].push(t.content);
  }
  const counts = Object.entries(templates).map(([r, arr]) => `${r}:${arr.length}`).join(', ');
  console.log(`Loaded templates: ${counts}`);
}

function getTemplate(rating) {
  const ratingTemplates = templates[rating] || [];
  const universalTemplates = templates[0] || [];
  const all = [...ratingTemplates, ...universalTemplates];
  if (all.length === 0) return null;
  return all[Math.floor(Math.random() * all.length)];
}

async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      const text = await res.text();
      if (i < retries && (text.includes('timeout') || text.includes('502') || text.includes('55P03'))) {
        console.log(`  Retry ${i}/${retries} in 5s...`);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      return { ok: false, text: () => Promise.resolve(text), json: () => Promise.resolve({}) };
    } catch (e) {
      if (i < retries) {
        console.log(`  Fetch error, retry ${i}/${retries}: ${e.message}`);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      throw e;
    }
  }
}

async function main() {
  await loadTemplates();

  let totalDrafted = 0;
  let totalScheduled = 0;
  let totalSkipped = 0;
  let batch = 0;
  const BATCH_SIZE = 50;
  const MAX_BATCHES = 1000; // safety limit
  const startTime = Date.now();

  while (batch < MAX_BATCHES) {
    batch++;

    // Fetch unanswered reviews
    const res = await fetchWithRetry(
      `${SUPABASE_URL}/rest/v1/reviews?select=id,rating,marketplace_id&segment=eq.unanswered&deleted_at=is.null&marketplace_id=eq.${MARKETPLACE_ID}&limit=${BATCH_SIZE}&order=review_date.desc`,
      { headers }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error(`Fetch reviews error: ${err.slice(0, 200)}`);
      await new Promise(r => setTimeout(r, 10000));
      continue;
    }

    const reviews = await res.json();
    if (!Array.isArray(reviews) || reviews.length === 0) {
      console.log('No more unanswered reviews');
      break;
    }

    // Create replies in batch
    const replies = [];
    for (const review of reviews) {
      const mode = MODES[review.rating] || 'semi';
      const template = getTemplate(review.rating);

      if (!template) {
        totalSkipped++;
        continue;
      }

      replies.push({
        review_id: review.id,
        content: template,
        status: mode === 'auto' ? 'scheduled' : 'drafted',
        mode: mode === 'auto' ? 'auto' : 'semi_auto',
        user_id: USER_ID,
        marketplace_id: review.marketplace_id || MARKETPLACE_ID,
        scheduled_at: mode === 'auto' ? new Date().toISOString() : null,
      });
    }

    if (replies.length === 0) {
      console.log(`Batch ${batch}: no templates matched, skipping ${reviews.length} reviews`);
      continue;
    }

    // Insert replies
    const insertRes = await fetchWithRetry(
      `${SUPABASE_URL}/rest/v1/replies`,
      {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify(replies),
      }
    );

    if (!insertRes.ok) {
      const err = await insertRes.text();
      // If duplicate key error, some replies already exist - skip them
      if (err.includes('duplicate') || err.includes('23505')) {
        console.log(`Batch ${batch}: some duplicates, inserting one by one...`);
        for (const reply of replies) {
          const singleRes = await fetchWithRetry(
            `${SUPABASE_URL}/rest/v1/replies`,
            {
              method: 'POST',
              headers: { ...headers, 'Prefer': 'return=minimal' },
              body: JSON.stringify(reply),
            }
          );
          if (singleRes.ok) {
            if (reply.status === 'scheduled') totalScheduled++;
            else totalDrafted++;
          }
          await new Promise(r => setTimeout(r, 50));
        }
      } else {
        console.error(`Insert error: ${err.slice(0, 200)}`);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
    } else {
      const scheduled = replies.filter(r => r.status === 'scheduled').length;
      const drafted = replies.filter(r => r.status === 'drafted').length;
      totalScheduled += scheduled;
      totalDrafted += drafted;
    }

    // Update review segments to 'pending' so they don't reappear in next batch
    const reviewIds = reviews.map(r => r.id);
    const segmentRes = await fetchWithRetry(
      `${SUPABASE_URL}/rest/v1/reviews?id=in.(${reviewIds.join(',')})`,
      {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ segment: 'pending' }),
      }
    );
    if (!segmentRes.ok) {
      console.log(`  Warning: segment update failed for ${reviewIds.length} reviews`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Batch ${batch}: +${replies.length} replies (${totalDrafted} drafted, ${totalScheduled} scheduled), ${elapsed}s`);

    // Small delay between batches
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n✅ Done! ${totalDrafted} drafted, ${totalScheduled} scheduled, ${totalSkipped} skipped, ${batch} batches`);
}

main().catch(console.error);
