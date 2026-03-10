// VERSION: 2026-03-05-v6 - Don't set is_answered from comments_amount, let segment trigger determine from published replies
// BRANCH: claude/setup-ozon-cron-jobs-2qPjk
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
    let { marketplace_id, ozon_seller_id, user_id, client_id, api_key, since } = await req.json();

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

    console.log(`Starting reviews sync for marketplace ${marketplace_id}`);

    // Load saved cursor position for resumable sync
    const { data: mktplace } = await supabase
      .from('marketplaces')
      .select('reviews_sync_cursor')
      .eq('id', marketplace_id)
      .single();
    const savedCursor = mktplace?.reviews_sync_cursor || null;

    // Update status
    await supabase
      .from('marketplaces')
      .update({ last_sync_status: 'syncing' })
      .eq('id', marketplace_id);

    // Get products for this marketplace — build fast lookup maps
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, external_id, sku, offer_id')
      .eq('marketplace_id', marketplace_id);

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
    // SKU is NOT unique (discounted items can have 2 SKUs per offer_id)
    // Use Map for O(1) lookup instead of Array.find O(n)
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
    const MAX_PAGES = 50; // Max pages per invocation (5000 reviews)
    let reachedActualEnd = false; // true only if has_next=false (OZON said "no more reviews")

    // Default: sync reviews from last 2 months only (50-60K reviews)
    const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const sinceDate = since || twoMonthsAgo;
    console.log(`Syncing reviews since: ${sinceDate}`);

    // Fetch reviews from Ozon using cursor-based pagination
    // OZON /v1/review/list returns { reviews: [...], last_id: "...", has_next: true/false }
    // Resume from saved cursor if available (OZON ignores offset/since, only last_id works)
    const pageSize = 100;
    let hasMore = true;
    let page = 1;
    let lastId: string | null = savedCursor;
    let reviewsBatch: any[] = [];
    console.log(`Starting from cursor: ${savedCursor || 'beginning'}`);
    const BATCH_UPSERT_SIZE = 50;

    while (hasMore) {
      console.log(`Fetching reviews page ${page}${lastId ? `, after ${lastId}` : ''}`);

      const requestBody: any = {
        filter: {},
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
      // OZON returns reviews at top level, NOT inside result
      const reviews = reviewsData.reviews || reviewsData.result?.reviews || [];

      console.log(`Page ${page}: Found ${reviews.length} reviews`);

      if (reviews.length === 0) {
        reachedActualEnd = true;
        hasMore = false;
        break;
      }

      // Process reviews — check date filter and build batch
      let reachedOldReviews = false;
      for (const review of reviews) {
        try {
          // Check date filter — skip reviews older than sinceDate
          const reviewDate = review.published_at || '';
          if (reviewDate && reviewDate < sinceDate) {
            skippedOld++;
            reachedOldReviews = true;
            continue;
          }

          // Match product by SKU (primary) or external_id (fallback)
          const reviewSku = review.sku ? String(review.sku) : null;
          let product = null;

          if (reviewSku) {
            product = skuMap.get(reviewSku) || externalIdMap.get(reviewSku) || null;
          }

          if (!product) {
            unmatchedProducts++;
            // Skip reviews with no product match to avoid overwriting existing product_id with null
            // These reviews either: (a) already exist in DB with a valid product_id — skip to preserve it
            // or (b) are new but for a product not yet synced — will be picked up after daily product sync
            continue;
          }

          // Build upsert record
          // NOTE: Do NOT set is_answered from comments_amount!
          // comments_amount includes buyer/moderation comments, not just seller replies.
          // The segment trigger uses published replies in our DB to determine the real segment.
          reviewsBatch.push({
            marketplace_id,
            product_id: product?.id || null,
            external_id: String(review.id),
            rating: review.rating || 0,
            author_name: review.author_name || 'Anonymous',
            text: review.text || '',
            advantages: review.advantages || null,
            disadvantages: review.disadvantages || null,
            review_date: review.published_at || new Date().toISOString(),
            raw: review,
            inserted_at: new Date().toISOString(),
            status: 'new',
          });

          // Flush batch when full
          if (reviewsBatch.length >= BATCH_UPSERT_SIZE) {
            const { error: batchError } = await supabase
              .from('reviews')
              .upsert(reviewsBatch, {
                onConflict: 'marketplace_id,external_id',
                ignoreDuplicates: false,
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
      lastId = reviewsData.last_id || null;
      // Track if OZON says there are no more pages (actual end of data)
      if (reviewsData.has_next !== true) {
        reachedActualEnd = true;
      }
      hasMore = reviewsData.has_next === true && reviews.length > 0 && page <= MAX_PAGES;
      page++;

      // Small delay to avoid rate limits (50ms for skip-only pages, 200ms when saving)
      if (hasMore) {
        const delay = reachedOldReviews && reviewsBatch.length === 0 ? 50 : 200;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Flush remaining batch
    if (reviewsBatch.length > 0) {
      const { error: batchError } = await supabase
        .from('reviews')
        .upsert(reviewsBatch, {
          onConflict: 'marketplace_id,external_id',
          ignoreDuplicates: false,
        });

      if (batchError) {
        console.error('Final batch upsert error:', batchError);
      } else {
        totalReviews += reviewsBatch.length;
      }
    }

    // Save cursor position for next run (resume from where we left off)
    // Only reset cursor if OZON said has_next=false (actual end of all reviews)
    // If we stopped due to MAX_PAGES limit, save cursor so next run continues from here
    const newCursor = reachedActualEnd ? null : lastId;
    await supabase
      .from('marketplaces')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'success',
        last_sync_error: null,
        reviews_sync_cursor: newCursor,
      })
      .eq('id', marketplace_id);

    console.log(`Synced ${totalReviews} reviews (${totalPages} pages, skipped ${skippedOld} old, ${unmatchedProducts} without product, cursor=${newCursor || 'reset'})`);

    return new Response(
      JSON.stringify({
        success: true,
        reviews_count: totalReviews,
        pages: totalPages,
        skipped_old: skippedOld,
        unmatched_products: unmatchedProducts,
        message: `Синхронизировано ${totalReviews} отзывов (${totalPages} страниц, пропущено ${skippedOld} старых)`,
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
