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

    console.log("[auto-generate-drafts-cron] Starting automatic draft generation for all active marketplaces...");

    // Получаем все активные маркетплейсы с их пользователями
    const { data: marketplaces, error: marketplacesError } = await supabase
      .from("marketplaces")
      .select("id, user_id, is_active")
      .eq("is_active", true);

    if (marketplacesError) {
      throw marketplacesError;
    }

    if (!marketplaces || marketplaces.length === 0) {
      console.log("[auto-generate-drafts-cron] No active marketplaces found");
      return new Response(
        JSON.stringify({ message: "No active marketplaces", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[auto-generate-drafts-cron] Found ${marketplaces.length} active marketplaces`);

    // Группируем по user_id, чтобы вызывать функцию один раз на пользователя
    const userMarketplaces = new Map<string, string[]>();
    for (const mp of marketplaces) {
      if (!mp.user_id) continue;
      if (!userMarketplaces.has(mp.user_id)) {
        userMarketplaces.set(mp.user_id, []);
      }
      userMarketplaces.get(mp.user_id)!.push(mp.id);
    }

    let totalProcessed = 0;
    let totalErrors = 0;
    const errors: string[] = [];

    // Вызываем auto-generate-drafts для каждого пользователя
    for (const [userId, mpIds] of userMarketplaces.entries()) {
      for (const mpId of mpIds) {
        try {
          console.log(`[auto-generate-drafts-cron] Processing marketplace ${mpId} for user ${userId}`);
          
          const response = await fetch(`${supabaseUrl}/functions/v1/auto-generate-drafts`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              user_id: userId,
              marketplace_id: mpId,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          const result = await response.json();
          console.log(`[auto-generate-drafts-cron] Result for marketplace ${mpId}:`, result);
          totalProcessed++;
        } catch (error) {
          console.error(`[auto-generate-drafts-cron] Error processing marketplace ${mpId}:`, error);
          errors.push(`Marketplace ${mpId}: ${error instanceof Error ? error.message : String(error)}`);
          totalErrors++;
        }
      }
    }

    console.log(`[auto-generate-drafts-cron] Completed: ${totalProcessed} processed, ${totalErrors} errors`);

    return new Response(
      JSON.stringify({
        message: "Cron job completed",
        processed: totalProcessed,
        errors: totalErrors,
        error_details: errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[auto-generate-drafts-cron] Fatal error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

