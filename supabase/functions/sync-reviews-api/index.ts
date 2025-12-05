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
      Deno.env.get('OZON_SUPABASE_URL')!,
      Deno.env.get('OZON_SUPABASE_SERVICE_ROLE_KEY')!
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

    // Update status
    await supabase
      .from('marketplaces')
      .update({ last_sync_status: 'syncing' })
      .eq('id', marketplace_id);

    // Get products for this marketplace
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

    console.log(`Found ${products.length} products`);

    let totalReviews = 0;
    let totalPages = 0;

    // Fetch reviews from Ozon
    const pageSize = 100;
    let hasMore = true;
    let page = 1;

    while (hasMore) {
      console.log(`Fetching reviews page ${page}`);

      const reviewsResponse = await fetch('https://api-seller.ozon.ru/v1/review/list', {
        method: 'POST',
        headers: {
          'Client-Id': client_id,
          'Api-Key': api_key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filter: since ? { since } : {},
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
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
      const reviews = reviewsData.result?.reviews || [];

      console.log(`Page ${page}: Found ${reviews.length} reviews`);

      if (reviews.length === 0) {
        hasMore = false;
        break;
      }

      // Process reviews
      for (const review of reviews) {
        try {
          // Основной идентификатор - offer_id, второстепенный - sku
          const productOfferId = review.product_offer_id;
          const productExternalId = review.product_external_id; // это SKU из URL
          
          console.log(`[sync-reviews-api] 🔍 Поиск товара: offer_id="${productOfferId}", sku="${productExternalId}"`);
          
          let product = null;
          
          // ПРИОРИТЕТ 1: Ищем по offer_id (основной идентификатор)
          if (productOfferId) {
            product = products.find(p => p.offer_id === productOfferId);
            if (product) {
              console.log(`[sync-reviews-api] ✅ Товар найден по offer_id: ${product.id}`);
            }
          }
          
          // ПРИОРИТЕТ 2: Если не нашли, ищем по sku (второстепенный)
          if (!product && productExternalId) {
            product = products.find(p => p.sku === productExternalId);
            if (product) {
              console.log(`[sync-reviews-api] ✅ Товар найден по sku: ${product.id}`);
            }
          }
          
          if (!product) {
            console.log(`[sync-reviews-api] ❌ Товар НЕ НАЙДЕН для offer_id="${productOfferId}", sku="${productExternalId}"`);
            continue;
          }

          // Upsert review
          const { error: reviewError } = await supabase
            .from('reviews')
            .upsert({
              marketplace_id,
              product_id: product.id,
              external_id: String(review.review_id || review.id),
              rating: review.score || 0,
              author_name: review.author || 'Anonymous',
              text: review.text || '',
              advantages: review.advantages || null,
              disadvantages: review.disadvantages || null,
              review_date: review.created_at || new Date().toISOString(),
              raw: review,
              inserted_at: new Date().toISOString(),
              status: 'new',
              is_answered: false,
            }, {
              onConflict: 'marketplace_id,external_id',
              ignoreDuplicates: false,
            });

          if (reviewError) {
            console.error('Error upserting review:', reviewError);
          } else {
            totalReviews++;
          }
        } catch (err) {
          console.error('Error processing review:', err);
        }
      }

      totalPages++;
      hasMore = reviews.length === pageSize;
      page++;

      // Small delay to avoid rate limits
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Update marketplace status
    await supabase
      .from('marketplaces')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'success',
        last_sync_error: null,
      })
      .eq('id', marketplace_id);

    console.log(`Successfully synchronized ${totalReviews} reviews across ${totalPages} pages`);

    return new Response(
      JSON.stringify({
        success: true,
        reviews_count: totalReviews,
        pages: totalPages,
        message: `Синхронизировано ${totalReviews} отзывов (${totalPages} страниц)`,
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
