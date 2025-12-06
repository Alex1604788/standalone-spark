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

    console.log(`[update-reply-statuses] Starting for marketplace ${marketplace_id}`);

    // Get all reviews for this marketplace
    const { data: reviewsByRating, error: reviewsError } = await supabase
      .from("reviews")
      .select("id, rating")
      .eq("marketplace_id", marketplace_id);

    if (reviewsError) {
      console.error("[update-reply-statuses] Error fetching reviews:", reviewsError);
      throw reviewsError;
    }

    console.log(`[update-reply-statuses] Found ${reviewsByRating?.length || 0} reviews`);

    const modeUpdates = [
      { rating: 1, mode: settings.reviews_mode_1 },
      { rating: 2, mode: settings.reviews_mode_2 },
      { rating: 3, mode: settings.reviews_mode_3 },
      { rating: 4, mode: settings.reviews_mode_4 },
      { rating: 5, mode: settings.reviews_mode_5 },
    ];

    let totalUpdatedToScheduled = 0;
    let totalUpdatedToDrafted = 0;

    for (const { rating, mode } of modeUpdates) {
      const reviewIds = (reviewsByRating || [])
        .filter(r => r.rating === rating)
        .map(r => r.id);

      if (reviewIds.length === 0) continue;

      console.log(`[update-reply-statuses] Rating ${rating}, mode: ${mode}, reviews: ${reviewIds.length}`);

      if (mode === "auto") {
        // drafted -> scheduled
        const { data: updated, error: updateError } = await supabase
          .from("replies")
          .update({ 
            status: "scheduled", 
            mode: "auto",
            scheduled_at: new Date().toISOString() 
          })
          .eq("status", "drafted")
          .in("review_id", reviewIds)
          .select("id");

        if (updateError) {
          console.error(`[update-reply-statuses] Error updating to scheduled:`, updateError);
        } else {
          console.log(`[update-reply-statuses] Updated to scheduled: ${updated?.length || 0}`);
          totalUpdatedToScheduled += updated?.length || 0;
        }
      } else {
        // scheduled -> drafted (for semi mode)
        const { data: updated, error: updateError } = await supabase
          .from("replies")
          .update({ 
            status: "drafted", 
            mode: "semi_auto",
            scheduled_at: null 
          })
          .eq("status", "scheduled")
          .in("review_id", reviewIds)
          .select("id");

        if (updateError) {
          console.error(`[update-reply-statuses] Error updating to drafted:`, updateError);
        } else {
          console.log(`[update-reply-statuses] Updated to drafted: ${updated?.length || 0}`);
          totalUpdatedToDrafted += updated?.length || 0;
        }
      }
    }

    // Handle questions
    const { data: questionIds } = await supabase
      .from("questions")
      .select("id")
      .eq("marketplace_id", marketplace_id);

    if (questionIds && questionIds.length > 0) {
      const qIds = questionIds.map(q => q.id);
      
      if (settings.questions_mode === "auto") {
        const { data: updated } = await supabase
          .from("replies")
          .update({ 
            status: "scheduled", 
            mode: "auto",
            scheduled_at: new Date().toISOString() 
          })
          .eq("status", "drafted")
          .in("question_id", qIds)
          .select("id");
        
        totalUpdatedToScheduled += updated?.length || 0;
        console.log(`[update-reply-statuses] Questions updated to scheduled: ${updated?.length || 0}`);
      } else if (settings.questions_mode === "semi") {
        const { data: updated } = await supabase
          .from("replies")
          .update({ 
            status: "drafted", 
            mode: "semi_auto",
            scheduled_at: null 
          })
          .eq("status", "scheduled")
          .in("question_id", qIds)
          .select("id");
        
        totalUpdatedToDrafted += updated?.length || 0;
        console.log(`[update-reply-statuses] Questions updated to drafted: ${updated?.length || 0}`);
      }
    }

    console.log(`[update-reply-statuses] Completed: ${totalUpdatedToScheduled} scheduled, ${totalUpdatedToDrafted} drafted`);

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
