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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body for user_id and marketplace_id
    const body = await req.json().catch(() => ({}));
    const { user_id, marketplace_id, response_length = "short" } = body;

    if (!user_id) {
      throw new Error("user_id is required");
    }

    console.log(`[auto-generate-drafts] Starting for user ${user_id}, marketplace ${marketplace_id || "all"}`);

    // Get marketplace settings to check reply_length
    let replyLength = response_length;
    if (marketplace_id) {
      const { data: settings } = await supabase
        .from("marketplace_settings")
        .select("reply_length")
        .eq("marketplace_id", marketplace_id)
        .single();
      
      if (settings?.reply_length) {
        replyLength = settings.reply_length;
      }
    }

    const maxChars = replyLength === "short" ? 200 : 400;

    // Get unanswered reviews (segment = 'unanswered' means no drafts exist)
    let reviewsQuery = supabase
      .from("reviews")
      .select("id, text, advantages, disadvantages, rating, marketplace_id, products(name, marketplace_id)")
      .eq("segment", "unanswered")
      .is("deleted_at", null);

    if (marketplace_id) {
      reviewsQuery = reviewsQuery.eq("marketplace_id", marketplace_id);
    }

    const { data: reviews, error: reviewsError } = await reviewsQuery.limit(20);

    if (reviewsError) {
      console.error("Error fetching reviews:", reviewsError);
      throw reviewsError;
    }

    console.log(`[auto-generate-drafts] Found ${reviews?.length || 0} unanswered reviews`);

    let totalDrafts = 0;
    const errors: string[] = [];

    // Generate drafts for reviews
    for (const review of reviews || []) {
      try {
        // Double-check no reply exists
        const { data: existingReply } = await supabase
          .from("replies")
          .select("id")
          .eq("review_id", review.id)
          .limit(1);

        if (existingReply && existingReply.length > 0) {
          console.log(`[auto-generate-drafts] Skip review ${review.id}: reply exists`);
          continue;
        }

        const reviewText = [review.text, review.advantages, review.disadvantages]
          .filter(Boolean)
          .join(" ");

        // Get product name - products can be object or array
        const products = review.products as any;
        const productName = Array.isArray(products) 
          ? products[0]?.name || "Товар" 
          : products?.name || "Товар";
        
        const mpId = review.marketplace_id || (Array.isArray(products) 
          ? products[0]?.marketplace_id 
          : products?.marketplace_id);

        // Generate draft using AI
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: `Ты - профессиональный менеджер маркетплейса. Напиши ответ на отзыв покупателя.

Товар: ${productName}
Рейтинг: ${review.rating} из 5
Отзыв: ${reviewText || "(только оценка)"}

ТРЕБОВАНИЯ:
- Максимум ${maxChars} символов
- Официальный, дружелюбный стиль
- БЕЗ эмодзи
- БЕЗ контактов и ссылок
- Поблагодарить за отзыв
${review.rating <= 2 ? "- Вежливо извиниться за негативный опыт" : ""}
- Ответ должен быть завершённым, не обрезанным`
              },
              { role: "user", content: "Сгенерируй ответ" }
            ],
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[auto-generate-drafts] AI error for review ${review.id}:`, errorText);
          errors.push(`Review ${review.id}: AI error`);
          continue;
        }

        const data = await response.json();
        const generatedReply = data.choices?.[0]?.message?.content;

        if (!generatedReply) {
          console.error(`[auto-generate-drafts] Empty reply for review ${review.id}`);
          errors.push(`Review ${review.id}: empty reply`);
          continue;
        }

        // Create draft reply
        const { error: insertError } = await supabase.from("replies").insert({
          review_id: review.id,
          content: generatedReply,
          status: "drafted",
          mode: "semi_auto",
          user_id: user_id,
          marketplace_id: mpId,
        });

        if (insertError) {
          console.error(`[auto-generate-drafts] Insert error for review ${review.id}:`, insertError);
          errors.push(`Review ${review.id}: ${insertError.message}`);
        } else {
          console.log(`[auto-generate-drafts] ✅ Created draft for review ${review.id}`);
          totalDrafts++;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (e) {
        console.error(`[auto-generate-drafts] Error processing review ${review.id}:`, e);
        errors.push(`Review ${review.id}: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }

    console.log(`[auto-generate-drafts] Completed: ${totalDrafts} drafts created, ${errors.length} errors`);

    return new Response(
      JSON.stringify({ 
        success: true,
        drafts_created: totalDrafts,
        reviews_processed: reviews?.length || 0,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[auto-generate-drafts] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
