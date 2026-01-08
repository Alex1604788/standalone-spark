// VERSION: 2026-01-08-v1 - Fixed env vars (SUPABASE_URL)
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
  console.log('[sync-questions-api] VERSION: 2026-01-08-v1 - Function started');

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
    console.log(`[sync-questions-api] Received request for marketplace: ${marketplace_id}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Resolve marketplace_id if not provided
    if (!marketplace_id && ozon_seller_id && user_id) {
      console.log(`[sync-questions-api] Resolving marketplace_id for user ${user_id}, seller ${ozon_seller_id}`);

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

    console.log(`[sync-questions-api] Starting questions sync for marketplace ${marketplace_id}`);

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
      console.error('[sync-questions-api] Error fetching products:', productsError);
      throw productsError;
    }

    if (!products || products.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No products found. Please sync products first.',
          questions_count: 0
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    console.log(`[sync-questions-api] Found ${products.length} products`);

    let totalQuestions = 0;
    let hasMore = true;
    let lastId = '';

    // Fetch questions from OZON API
    while (hasMore) {
      console.log(`[sync-questions-api] Fetching questions, last_id: ${lastId || 'first page'}`);

      const questionsResponse = await fetch('https://api-seller.ozon.ru/v1/question/list', {
        method: 'POST',
        headers: {
          'Client-Id': client_id,
          'Api-Key': api_key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filter: {
            status: 'ALL', // Get all questions
          },
          last_id: lastId || '',
        }),
      });

      const contentType = questionsResponse.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const errorText = await questionsResponse.text();
        console.error('[sync-questions-api] OZON API returned non-JSON response:', errorText.slice(0, 500));
        break;
      }

      if (!questionsResponse.ok) {
        const errorText = await questionsResponse.text();
        console.error('[sync-questions-api] OZON API error:', errorText);
        break;
      }

      const questionsData = await questionsResponse.json();
      const questions = questionsData.questions || [];
      lastId = questionsData.last_id || '';

      console.log(`[sync-questions-api] Found ${questions.length} questions, last_id: ${lastId}`);

      if (questions.length === 0) {
        hasMore = false;
        break;
      }

      // Process questions
      for (const question of questions) {
        try {
          // Find product by SKU
          const productSku = question.sku ? String(question.sku) : null;

          console.log(`[sync-questions-api] 🔍 Поиск товара: sku="${productSku}"`);

          let product = null;

          if (productSku) {
            // Try to find by SKU first
            product = products.find(p => p.sku === productSku);

            if (!product) {
              // Try to find by external_id as fallback
              product = products.find(p => p.external_id === productSku);
            }
          }

          if (!product) {
            console.log(`[sync-questions-api] ❌ Товар НЕ НАЙДЕН для sku="${productSku}"`);
            continue;
          }

          console.log(`[sync-questions-api] ✅ Товар найден: ${product.id}`);

          // Upsert question
          const { error: questionError } = await supabase
            .from('questions')
            .upsert({
              marketplace_id,
              product_id: product.id,
              external_id: String(question.id),
              author_name: question.author_name || 'Anonymous',
              text: question.text || '',
              question_date: question.published_at || new Date().toISOString(),
              raw: question,
              inserted_at: new Date().toISOString(),
              status: 'new',
              is_answered: (question.answers_count || 0) > 0,
            }, {
              onConflict: 'marketplace_id,external_id',
              ignoreDuplicates: false,
            });

          if (questionError) {
            console.error('[sync-questions-api] Error upserting question:', questionError);
          } else {
            totalQuestions++;
          }
        } catch (err) {
          console.error('[sync-questions-api] Error processing question:', err);
        }
      }

      // Check if there are more questions
      hasMore = lastId !== '' && questions.length > 0;

      // Small delay to avoid rate limits
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Update marketplace status and last sync timestamp
    await supabase
      .from('marketplaces')
      .update({
        last_questions_sync_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'success',
        last_sync_error: null,
      })
      .eq('id', marketplace_id);

    console.log(`[sync-questions-api] Successfully synchronized ${totalQuestions} questions`);

    return new Response(
      JSON.stringify({
        success: true,
        questions_count: totalQuestions,
        message: `Синхронизировано ${totalQuestions} вопросов`,
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
