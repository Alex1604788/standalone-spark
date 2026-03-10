/**
 * update-reply-statuses: Обновляет статусы ответов на основе настроек маркетплейса
 * VERSION: 2026-03-10-v2
 *
 * CHANGELOG:
 * v2 (2026-03-10):
 * - FIX: PostgREST возвращал только первые ~1000 из 57K+ отзывов → RPC-функции пропускали drafted ответы
 * - Заменили fetch-then-batch на SQL RPC bulk_update_reply_mode и bulk_update_reply_mode_questions
 * - Один SQL UPDATE с subquery вместо многократных batch-запросов
 *
 * v1:
 * - Базовая логика с fetch all reviews → batch update (не работало при >1000 отзывов)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { marketplace_id, settings } = body;

    if (!marketplace_id || !settings) {
      throw new Error("marketplace_id and settings are required");
    }

    console.log(`[update-reply-statuses] v2 Starting for marketplace ${marketplace_id}`);

    const modeUpdates = [
      { rating: 1, mode: settings.reviews_mode_1 },
      { rating: 2, mode: settings.reviews_mode_2 },
      { rating: 3, mode: settings.reviews_mode_3 },
      { rating: 4, mode: settings.reviews_mode_4 },
      { rating: 5, mode: settings.reviews_mode_5 },
    ];

    let totalUpdatedToScheduled = 0;
    let totalUpdatedToDrafted = 0;

    // ✅ FIX: Используем SQL RPC вместо fetch-then-batch
    // bulk_update_reply_mode выполняет UPDATE с subquery напрямую в SQL
    // Никаких ограничений PostgREST (1000 строк) — обрабатывает все 57K+ отзывов
    for (const { rating, mode } of modeUpdates) {
      if (mode === "auto") {
        // drafted -> scheduled: автоматическая публикация
        const { data: count, error } = await supabase
          .rpc('bulk_update_reply_mode', {
            p_marketplace_id: marketplace_id,
            p_rating: rating,
            p_target_status: 'scheduled',
            p_from_status: 'drafted',
          });

        if (error) {
          console.error(`[update-reply-statuses] RPC error rating ${rating} auto:`, error);
        } else {
          const updated = count || 0;
          totalUpdatedToScheduled += updated;
          if (updated > 0) {
            console.log(`[update-reply-statuses] Rating ${rating} auto: ${updated} drafted → scheduled`);
          }
        }
      } else {
        // scheduled -> drafted: полуавтоматический режим (требует одобрения)
        const { data: count, error } = await supabase
          .rpc('bulk_update_reply_mode', {
            p_marketplace_id: marketplace_id,
            p_rating: rating,
            p_target_status: 'drafted',
            p_from_status: 'scheduled',
          });

        if (error) {
          console.error(`[update-reply-statuses] RPC error rating ${rating} semi:`, error);
        } else {
          const updated = count || 0;
          totalUpdatedToDrafted += updated;
          if (updated > 0) {
            console.log(`[update-reply-statuses] Rating ${rating} semi: ${updated} scheduled → drafted`);
          }
        }
      }
    }

    // Handle questions (also 4990+ rows, same fix needed)
    if (settings.questions_mode === "auto") {
      const { data: count, error } = await supabase
        .rpc('bulk_update_reply_mode_questions', {
          p_marketplace_id: marketplace_id,
          p_target_status: 'scheduled',
          p_from_status: 'drafted',
        });

      if (error) {
        console.error('[update-reply-statuses] RPC error questions auto:', error);
      } else {
        const updated = count || 0;
        totalUpdatedToScheduled += updated;
        if (updated > 0) {
          console.log(`[update-reply-statuses] Questions auto: ${updated} drafted → scheduled`);
        }
      }
    } else if (settings.questions_mode === "semi") {
      const { data: count, error } = await supabase
        .rpc('bulk_update_reply_mode_questions', {
          p_marketplace_id: marketplace_id,
          p_target_status: 'drafted',
          p_from_status: 'scheduled',
        });

      if (error) {
        console.error('[update-reply-statuses] RPC error questions semi:', error);
      } else {
        const updated = count || 0;
        totalUpdatedToDrafted += updated;
        if (updated > 0) {
          console.log(`[update-reply-statuses] Questions semi: ${updated} scheduled → drafted`);
        }
      }
    }

    console.log(`[update-reply-statuses] Completed: ${totalUpdatedToScheduled} → scheduled, ${totalUpdatedToDrafted} → drafted`);

    return new Response(
      JSON.stringify({
        success: true,
        updated_to_scheduled: totalUpdatedToScheduled,
        updated_to_drafted: totalUpdatedToDrafted
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[update-reply-statuses] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
