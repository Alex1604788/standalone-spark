// VERSION: 2026-03-17-v5 - Also match question.sku against products.external_id
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

    console.log(`[sync-questions-api] Starting for marketplace ${marketplace_id}`);

    // Load saved cursor for resumable sync
    const { data: mktplace } = await supabase
      .from('marketplaces')
      .select('questions_sync_cursor')
      .eq('id', marketplace_id)
      .single();
    const savedCursor = mktplace?.questions_sync_cursor || null;

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

    if (productsError) throw productsError;

    const skuMap = new Map<string, typeof products[0]>();
    const externalIdMap = new Map<string, typeof products[0]>();
    const offerIdMap = new Map<string, typeof products[0]>();
    for (const p of products || []) {
      if (p.sku && !skuMap.has(p.sku)) skuMap.set(p.sku, p);
      if (p.external_id && !externalIdMap.has(p.external_id)) externalIdMap.set(p.external_id, p);
      if (p.offer_id && !offerIdMap.has(p.offer_id)) offerIdMap.set(p.offer_id, p);
    }

    console.log(`[sync-questions-api] ${products?.length || 0} products loaded. Starting from cursor: ${savedCursor || 'beginning'}`);

    let totalQuestions = 0;
    let unmatchedProducts = 0;
    let totalPages = 0;
    const MAX_PAGES = 30; // ~3000 questions per run to avoid timeout
    const BATCH_SIZE = 50;

    let hasMore = true;
    let lastId: string = savedCursor || '';
    let questionsBatch: any[] = [];
    let answeredExternalIds: string[] = []; // track questions OZON says are answered

    while (hasMore && totalPages < MAX_PAGES) {
      console.log(`[sync-questions-api] Page ${totalPages + 1}, last_id: ${lastId || 'first'}`);

      const questionsResponse = await fetch('https://api-seller.ozon.ru/v1/question/list', {
        method: 'POST',
        headers: {
          'Client-Id': client_id,
          'Api-Key': api_key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filter: { status: 'ALL' },
          last_id: lastId,
          limit: 100,
        }),
      });

      const contentType = questionsResponse.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        console.error('[sync-questions-api] Non-JSON response:', (await questionsResponse.text()).slice(0, 200));
        break;
      }

      if (!questionsResponse.ok) {
        console.error('[sync-questions-api] OZON API error:', await questionsResponse.text());
        break;
      }

      const questionsData = await questionsResponse.json();
      const questions = questionsData.questions || [];
      const newLastId = questionsData.last_id || '';

      console.log(`[sync-questions-api] Page ${totalPages + 1}: ${questions.length} questions`);

      if (questions.length === 0) {
        hasMore = false;
        break;
      }

      for (const question of questions) {
        try {
          const productSku = question.sku ? String(question.sku) : null;
          let product = null;
          if (productSku) {
            // 1) products.sku = question.sku (OZON item_id / FBO SKU)
            // 2) products.external_id = question.sku (some older products stored differently)
            // 3) products.offer_id = question.sku (seller article fallback)
            product = skuMap.get(productSku)
              || externalIdMap.get(productSku)
              || offerIdMap.get(productSku)
              || null;
          }
          if (!product) unmatchedProducts++;

          const extId = String(question.id);

          // Determine if OZON considers this question answered.
          // OZON returns: answers_count (int) + status ('NEW' | 'PROCESSED')
          // 'PROCESSED' = answered by seller; answers_count > 0 = same.
          const isAnsweredByOzon =
            (question.answers_count || 0) > 0 ||
            question.status === 'PROCESSED' ||
            (Array.isArray(question.comments) && question.comments.length > 0) ||
            question.is_answered === true;

          // NOTE: is_answered is intentionally excluded from upsert data.
          // This prevents sync from resetting is_answered=true back to false.
          // We handle is_answered separately below (only ever set true, never false).
          // NOTE: sku is stored to enable SQL-based product matching for unmatched questions.
          questionsBatch.push({
            marketplace_id,
            product_id: product?.id || null,
            external_id: extId,
            sku: productSku,
            author_name: question.author_name || 'Anonymous',
            text: question.text || '',
            question_date: question.published_at || new Date().toISOString(),
            status: 'new',
          });

          if (isAnsweredByOzon) {
            answeredExternalIds.push(extId);
          }

          if (questionsBatch.length >= BATCH_SIZE) {
            const { error: batchError } = await supabase
              .from('questions')
              .upsert(questionsBatch, {
                onConflict: 'marketplace_id,external_id',
                ignoreDuplicates: false,
              });
            if (batchError) {
              console.error('[sync-questions-api] Batch upsert error:', batchError);
            } else {
              totalQuestions += questionsBatch.length;
            }
            questionsBatch = [];

            // Mark answered questions (only set true, never reset to false)
            if (answeredExternalIds.length > 0) {
              await supabase
                .from('questions')
                .update({ is_answered: true })
                .eq('marketplace_id', marketplace_id)
                .in('external_id', answeredExternalIds);
              answeredExternalIds = [];
            }
          }
        } catch (err) {
          console.error('[sync-questions-api] Error processing question:', err);
        }
      }

      totalPages++;
      lastId = newLastId;
      hasMore = newLastId !== '' && questions.length > 0;

      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }

    // Flush remaining batch
    if (questionsBatch.length > 0) {
      const { error: batchError } = await supabase
        .from('questions')
        .upsert(questionsBatch, {
          onConflict: 'marketplace_id,external_id',
          ignoreDuplicates: false,
        });
      if (!batchError) totalQuestions += questionsBatch.length;
    }

    // Flush remaining answered IDs
    if (answeredExternalIds.length > 0) {
      await supabase
        .from('questions')
        .update({ is_answered: true })
        .eq('marketplace_id', marketplace_id)
        .in('external_id', answeredExternalIds);
    }

    // Save cursor: if hasMore, save position; if done, reset to start fresh
    const newCursor = hasMore ? lastId : null;
    await supabase
      .from('marketplaces')
      .update({
        last_questions_sync_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'success',
        last_sync_error: null,
        questions_sync_cursor: newCursor,
      })
      .eq('id', marketplace_id);

    console.log(`[sync-questions-api] Done: ${totalQuestions} questions (${totalPages} pages, ${unmatchedProducts} unmatched, cursor=${newCursor || 'reset'})`);

    return new Response(
      JSON.stringify({
        success: true,
        questions_count: totalQuestions,
        pages: totalPages,
        unmatched_products: unmatchedProducts,
        message: `Синхронизировано ${totalQuestions} вопросов (${totalPages} страниц)`,
      }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error: any) {
    console.error('[sync-questions-api] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Unknown error' }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
    );
  }
});
