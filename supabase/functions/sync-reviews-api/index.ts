// VERSION: 2026-03-17-v14 - Advancing cursor: saves position each run, advances through 30-day window
// KEY CHANGES from v13:
//   - Cursor loaded from DB (reviews_sync_cursor) and saved after each run
//   - Cursor advances forward: run 1 covers Feb 15-18, run 2 covers Feb 18-21, etc.
//   - After ~10 runs, covers all 30 days and reaches fresh reviews
//   - On completion (has_next=false): cursor reset to null → next cycle restarts from 30 days ago
//   - Cursor age check: if cursor > 31 days old → reset to 30-day anchor (prevents old review drift)
//   - ignoreDuplicates: true — only insert NEW reviews (existing rows stay untouched, trigger handles them)
//   - is_answered: false set on INSERT only — trigger immediately re-sets based on existing replies
// WHY THIS IS NEEDED:
//   - OZON NEVER marks reviews as PROCESSED (mark_review_as_processed: true is ignored by OZON)
//   - OZON UNPROCESSED list = ALL 18,000+ reviews from last 30 days (forever growing)
//   - Without advancing cursor, each run covers same Feb 10-18 window (5000 reviews) and misses recent ones
// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 405 }
    );
  }

  try {
    let { marketplace_id, ozon_seller_id, user_id, client_id, api_key } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Resolve marketplace_id if not provided
    if (!marketplace_id && ozon_seller_id && user_id) {
      console.log(`Resolving marketplace_id for user ${user_id}, seller ${ozon_seller_id}`);

      const { data: marketplace } = await supabase
        .from('marketplaces')
        .select('id, api_key_encrypted, service_account_email')
        .eq('user_id', user_id)
        .eq('ozon_seller_id', ozon_seller_id)
        .maybeSingle();

      if (!marketplace) {
        return new Response(
          JSON.stringify({ success: false, error: 'Marketplace not found' }),
          { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 404 }
        );
      }

      marketplace_id = marketplace.id;
      client_id = client_id || marketplace.service_account_email;
      api_key = api_key || marketplace.api_key_encrypted;
    }

    if (!marketplace_id || !client_id || !api_key) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required parameters' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 400 }
      );
    }

    // Load saved cursor from DB
    const { data: mktplaceRow } = await supabase
      .from('marketplaces')
      .select('reviews_sync_cursor')
      .eq('id', marketplace_id)
      .single();

    let savedCursor: string | null = mktplaceRow?.reviews_sync_cursor || null;

    // Validate cursor age: if cursor encodes a date > 31 days ago, reset it
    // UUIDv7 encodes timestamp in first 12 hex chars (48 bits = ms since epoch)
    if (savedCursor) {
      const hexTs = savedCursor.replace(/-/g, '').slice(0, 12);
      const cursorMs = parseInt(hexTs, 16);
      const cursorAge = Date.now() - cursorMs;
      if (cursorAge > 31 * 86400_000) {
        console.log(`Cursor is ${Math.round(cursorAge / 86400_000)} days old — resetting to 30-day anchor`);
        savedCursor = null;
      }
    }

    // If no valid cursor, derive one from DB: find real review external_id from ~30 days ago
    if (!savedCursor) {
      const { data: cursorRow } = await supabase
        .from('reviews')
        .select('external_id')
        .eq('marketplace_id', marketplace_id)
        .gte('review_date', new Date(Date.now() - 31 * 86400_000).toISOString())
        .lte('review_date', new Date(Date.now() - 29 * 86400_000).toISOString())
        .is('deleted_at', null)
        .order('review_date', { ascending: true })
        .limit(1)
        .maybeSingle();

      savedCursor = cursorRow?.external_id || null;
      console.log(`No valid cursor — auto-derived from DB: ${savedCursor ? savedCursor.slice(0, 20) + '...' : 'none found, scanning from current position'}`);
    } else {
      console.log(`Resuming from saved cursor: ${savedCursor.slice(0, 20)}...`);
    }

    console.log(`Starting reviews sync for marketplace ${marketplace_id}`);

    // Update status
    await supabase
      .from('marketplaces')
      .update({ last_sync_status: 'syncing' })
      .eq('id', marketplace_id);

    // Get products for this marketplace — build fast lookup maps
    // NOTE: PostgREST default limit is 1000 rows — must use .limit(10000) to get all products
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, external_id, sku, offer_id')
      .eq('marketplace_id', marketplace_id)
      .limit(10000);

    if (productsError) {
      console.error('Error fetching products:', productsError);
      throw productsError;
    }

    if (!products || products.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No products found. Please sync products first.',
          reviews_count: 0
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Build fast lookup maps for product matching
    const skuMap = new Map<string, typeof products[0]>();
    const externalIdMap = new Map<string, typeof products[0]>();
    for (const p of products) {
      if (p.sku && !skuMap.has(p.sku)) skuMap.set(p.sku, p);
      if (p.external_id && !externalIdMap.has(p.external_id)) externalIdMap.set(p.external_id, p);
    }

    console.log(`Found ${products.length} products (${skuMap.size} unique SKUs)`);

    let totalReviews = 0;
    let totalPages = 0;
    let skippedOld = 0;
    let unmatchedProducts = 0;
    const MAX_PAGES = 50; // 50 pages × 100 = 5000 reviews per run

    const pageSize = 100;
    let continueLoop = true;
    let ozonHasNext = false; // Whether OZON has more pages (used for cursor save decision)
    let page = 1;
    let lastId: string | null = savedCursor;
    let lastSavedId: string | null = savedCursor;
    let reviewsBatch: any[] = [];
    const BATCH_UPSERT_SIZE = 50;

    // Date cutoff: skip reviews older than 31 days (consistent with cursor reset threshold)
    const cutoffDate = new Date(Date.now() - 31 * 86400_000);

    console.log(`Fetching UNPROCESSED reviews from cursor: ${lastId ? lastId.slice(0, 20) + '...' : 'beginning'}`);

    while (continueLoop) {
      console.log(`Page ${page}${lastId ? `, after ${lastId.slice(0, 20)}` : ''}`);

      const requestBody: any = {
        filter: { status: 'UNPROCESSED' },
        limit: pageSize,
      };
      if (lastId) {
        requestBody.last_id = lastId;
      }

      const reviewsResponse = await fetch('https://api-seller.ozon.ru/v1/review/list', {
        method: 'POST',
        headers: {
          'Client-Id': client_id,
          'Api-Key': api_key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const contentType = reviewsResponse.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const errorText = await reviewsResponse.text();
        console.error('Ozon API returned non-JSON response:', errorText.slice(0, 500));
        break;
      }

      if (!reviewsResponse.ok) {
        const errorText = await reviewsResponse.text();
        console.error('Ozon API error:', errorText);
        break;
      }

      const reviewsData = await reviewsResponse.json();
      const reviews = reviewsData.reviews || reviewsData.result?.reviews || [];

      console.log(`Page ${page}: ${reviews.length} reviews`);

      if (reviews.length === 0) {
        ozonHasNext = false;
        continueLoop = false;
        break;
      }

      for (const review of reviews) {
        try {
          // Skip reviews older than 31 days
          const reviewDate = review.published_at ? new Date(review.published_at) : null;
          if (!reviewDate || reviewDate < cutoffDate) {
            skippedOld++;
            continue;
          }

          // Match product by SKU or external_id
          const reviewSku = review.sku ? String(review.sku) : null;
          let product = null;
          if (reviewSku) {
            product = skuMap.get(reviewSku) || externalIdMap.get(reviewSku) || null;
          }
          if (!product) unmatchedProducts++;

          const reviewRecord: any = {
            marketplace_id,
            external_id: String(review.id),
            rating: review.rating || 0,
            author_name: review.author_name || 'Anonymous',
            text: review.text || '',
            advantages: review.advantages || null,
            disadvantages: review.disadvantages || null,
            review_date: review.published_at || new Date().toISOString(),
            is_answered: false,
            raw: review,
            inserted_at: new Date().toISOString(),
            status: 'new',
          };
          if (product) {
            reviewRecord.product_id = product.id;
          }
          reviewsBatch.push(reviewRecord);

          if (reviewsBatch.length >= BATCH_UPSERT_SIZE) {
            const { error: batchError } = await supabase
              .from('reviews')
              .upsert(reviewsBatch, {
                onConflict: 'marketplace_id,external_id',
                ignoreDuplicates: true, // Only insert new rows — trigger handles segment on insert
              });

            if (batchError) {
              console.error('Batch upsert error:', batchError);
            } else {
              totalReviews += reviewsBatch.length;
            }
            reviewsBatch = [];
          }
        } catch (err) {
          console.error('Error processing review:', err);
        }
      }

      totalPages++;
      if (reviewsData.last_id) {
        lastId = reviewsData.last_id;
        lastSavedId = reviewsData.last_id;
      }
      // Track OZON's has_next separately from loop continuation
      ozonHasNext = reviewsData.has_next === true && reviews.length > 0;
      // Stop looping after MAX_PAGES regardless of OZON's state
      continueLoop = ozonHasNext && page < MAX_PAGES;
      page++;

      if (continueLoop) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Flush remaining batch
    if (reviewsBatch.length > 0) {
      const { error: batchError } = await supabase
        .from('reviews')
        .upsert(reviewsBatch, {
          onConflict: 'marketplace_id,external_id',
          ignoreDuplicates: true, // Only insert new rows — trigger sets segment on insert
        });

      if (batchError) {
        console.error('Final batch upsert error:', batchError);
      } else {
        totalReviews += reviewsBatch.length;
      }
    }

    // Save cursor:
    // - If OZON has more pages (MAX_PAGES hit): save lastSavedId → advance next run
    // - If OZON is done (has_next=false): save null → next run restarts from 30-day anchor
    const newCursor = ozonHasNext ? lastSavedId : null;
    const cycleStatus = ozonHasNext ? `advanced to ${lastSavedId?.slice(0, 20)}...` : 'completed full cycle, resetting cursor';

    // POST-SYNC REPAIR: Fix any reviews that got inserted with null product_id
    // This handles race conditions and any edge cases where SKU matching failed during sync
    // ignoreDuplicates:true means ON CONFLICT DO NOTHING — so old null-product rows stay broken without this fix
    const { error: repairError } = await supabase.rpc('fix_null_product_reviews', {
      p_marketplace_id: marketplace_id,
    });
    if (repairError) {
      console.warn('Post-sync repair warning (non-fatal):', repairError.message);
    } else {
      console.log('Post-sync product_id repair completed');
    }

    await supabase
      .from('marketplaces')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'success',
        last_sync_error: null,
        reviews_sync_cursor: newCursor,
      })
      .eq('id', marketplace_id);

    console.log(`Synced ${totalReviews} new reviews (${totalPages} pages, ${skippedOld} skipped old, ${unmatchedProducts} unmatched products, ${cycleStatus})`);

    return new Response(
      JSON.stringify({
        success: true,
        reviews_count: totalReviews,
        pages: totalPages,
        skipped_old: skippedOld,
        unmatched_products: unmatchedProducts,
        cursor_advanced: newCursor ? newCursor.slice(0, 30) + '...' : 'cycle complete',
        message: `Синхронизировано ${totalReviews} отзывов (${totalPages} стр)`,
      }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error: any) {
    console.error('Unexpected error:', error);

    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Unknown error' }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
    );
  }
});
