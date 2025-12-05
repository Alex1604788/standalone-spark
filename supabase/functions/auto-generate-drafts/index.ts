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

    console.log("Auto-generating drafts for unanswered reviews and questions...");

    // Get user settings to check if semi_auto_mode is enabled
    const { data: users, error: usersError } = await supabase
      .from("user_settings")
      .select("user_id, semi_auto_mode, require_approval_low_rating");

    if (usersError) throw usersError;

    let totalDrafts = 0;

    for (const userSettings of users || []) {
      if (!userSettings.semi_auto_mode) continue;

      // Get unanswered reviews
      const { data: reviews, error: reviewsError } = await supabase
        .from("reviews")
        .select("*, products!inner(marketplace_id, name, marketplaces!inner(user_id))")
        .eq("is_answered", false)
        .is("deleted_at", null)
        .eq("products.marketplaces.user_id", userSettings.user_id)
        .limit(10);

      if (reviewsError) {
        console.error("Error fetching reviews:", reviewsError);
        continue;
      }

      // Generate drafts for reviews
      for (const review of reviews || []) {
        // Check if draft already exists
        const { data: existingReply } = await supabase
          .from("replies")
          .select("id")
          .eq("review_id", review.id)
          .maybeSingle();

        if (existingReply) continue;

        // Check if low rating requires approval
        if (userSettings.require_approval_low_rating && review.rating <= 2) {
          // Generate draft
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
                  content: `Ты - профессиональный менеджер. Твоя задача - написать СТРОГО ОФИЦИАЛЬНЫЙ ответ на отзыв.
                  
Товар: ${review.products.name}
Рейтинг: ${review.rating} из 5
Отзыв: ${review.text || ""}

ТРЕБОВАНИЯ:
- Максимум 400 символов
- ТОЛЬКО официальный стиль
- БЕЗ эмодзи, контактов, ссылок
- Вежливо извиниться за негативный опыт
- Предложить обращение в службу поддержки`
                },
                { role: "user", content: "Сгенерируй ответ" }
              ],
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const generatedReply = data.choices[0].message.content;

            // Create draft reply
            const { error: insertError } = await supabase.from("replies").insert({
              review_id: review.id,
              content: generatedReply,
              status: "drafted",
              mode: "semi_auto",
              user_id: userSettings.user_id,
            });

            if (!insertError) totalDrafts++;
          }
        }
      }

      // Get unanswered questions
      const { data: questions, error: questionsError } = await supabase
        .from("questions")
        .select("*, products!inner(marketplace_id, name, marketplaces!inner(user_id))")
        .eq("is_answered", false)
        .is("deleted_at", null)
        .eq("products.marketplaces.user_id", userSettings.user_id)
        .limit(10);

      if (questionsError) {
        console.error("Error fetching questions:", questionsError);
        continue;
      }

      // Generate drafts for questions
      for (const question of questions || []) {
        // Check if draft already exists
        const { data: existingReply } = await supabase
          .from("replies")
          .select("id")
          .eq("question_id", question.id)
          .maybeSingle();

        if (existingReply) continue;

        // Generate draft
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
                content: `Ты - профессиональный менеджер. Ответь на вопрос покупателя ОФИЦИАЛЬНО.
                
Товар: ${question.products.name}
Вопрос: ${question.text}

ТРЕБОВАНИЯ:
- Максимум 400 символов
- ТОЛЬКО официальный стиль
- БЕЗ эмодзи, контактов
- Чёткий профессиональный ответ`
              },
              { role: "user", content: "Сгенерируй ответ" }
            ],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const generatedReply = data.choices[0].message.content;

          // Create draft reply
          const { error: insertError } = await supabase.from("replies").insert({
            question_id: question.id,
            content: generatedReply,
            status: "drafted",
            mode: "semi_auto",
            user_id: userSettings.user_id,
          });

          if (!insertError) totalDrafts++;
        }
      }
    }

    console.log(`Auto-generated ${totalDrafts} drafts`);

    return new Response(
      JSON.stringify({ message: `Auto-generated ${totalDrafts} drafts` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error auto-generating drafts:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
