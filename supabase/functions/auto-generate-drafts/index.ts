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

    // Get marketplace settings including modes and template usage flags
    let settings: {
      reply_length: string;
      reviews_mode_1: string;
      reviews_mode_2: string;
      reviews_mode_3: string;
      reviews_mode_4: string;
      reviews_mode_5: string;
      questions_mode: string;
      use_templates_1?: boolean;
      use_templates_2?: boolean;
      use_templates_3?: boolean;
      use_templates_4?: boolean;
      use_templates_5?: boolean;
    } | null = null;

    if (marketplace_id) {
      const { data } = await supabase
        .from("marketplace_settings")
        .select("reply_length, reviews_mode_1, reviews_mode_2, reviews_mode_3, reviews_mode_4, reviews_mode_5, questions_mode, use_templates_1, use_templates_2, use_templates_3, use_templates_4, use_templates_5")
        .eq("marketplace_id", marketplace_id)
        .single();
      
      settings = data;
    }

    const replyLength = settings?.reply_length || response_length;
    const maxChars = replyLength === "short" ? 200 : 400;

    // Helper function to get mode for specific rating
    const getReviewMode = (rating: number): string => {
      if (!settings) return "semi"; // default to semi-auto
      switch (rating) {
        case 1: return settings.reviews_mode_1 || "semi";
        case 2: return settings.reviews_mode_2 || "semi";
        case 3: return settings.reviews_mode_3 || "semi";
        case 4: return settings.reviews_mode_4 || "semi";
        case 5: return settings.reviews_mode_5 || "semi";
        default: return "semi";
      }
    };

    // Helper function to check if templates should be used for rating
    const shouldUseTemplates = (rating: number): boolean => {
      if (!settings) return false;
      switch (rating) {
        case 1: return settings.use_templates_1 || false;
        case 2: return settings.use_templates_2 || false;
        case 3: return settings.use_templates_3 || false;
        case 4: return settings.use_templates_4 || false;
        case 5: return settings.use_templates_5 || false;
        default: return false;
      }
    };

    // Helper function to get random template for rating
    const getRandomTemplate = async (rating: number): Promise<string | null> => {
      try {
        // Получаем шаблоны для данного рейтинга или универсальные (rating IS NULL)
        const { data: templates, error } = await supabase
          .from("reply_templates")
          .select("id, content, use_count")
          .eq("user_id", user_id)
          .or(`rating.eq.${rating},rating.is.null`)
          .limit(100);

        if (error || !templates || templates.length === 0) {
          console.log(`[auto-generate-drafts] No templates found for rating ${rating}`);
          return null;
        }

        // Выбираем случайный шаблон
        const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
        
        // Увеличиваем счётчик использования
        await supabase
          .from("reply_templates")
          .update({ use_count: (randomTemplate.use_count || 0) + 1 })
          .eq("id", randomTemplate.id);

        return randomTemplate.content;
      } catch (e) {
        console.error(`[auto-generate-drafts] Error getting template for rating ${rating}:`, e);
        return null;
      }
    };

    // Get unanswered reviews (segment = 'unanswered' means no drafts exist)
    let reviewsQuery = supabase
      .from("reviews")
      .select("id, text, advantages, disadvantages, rating, marketplace_id, products(name, marketplace_id)")
      .eq("segment", "unanswered")
      .is("deleted_at", null);

    if (marketplace_id) {
      reviewsQuery = reviewsQuery.eq("marketplace_id", marketplace_id);
    }

    // ✅ Ограничиваем до 30 отзывов за раз чтобы избежать таймаута Edge Function (2 минуты)
    // С учетом AI запросов: 30 отзывов * 2 сек = 60 сек (безопасно)
    // CRON будет вызывать функцию каждые 10 минут для обработки следующей партии
    const { data: reviews, error: reviewsError } = await reviewsQuery.limit(30);

    if (reviewsError) {
      console.error("Error fetching reviews:", reviewsError);
      throw reviewsError;
    }

    console.log(`[auto-generate-drafts] Found ${reviews?.length || 0} unanswered reviews`);

    let totalDrafts = 0;
    let totalScheduled = 0;
    let skippedNoMode = 0;
    const errors: string[] = [];

    // Generate drafts for reviews
    for (const review of reviews || []) {
      try {
        // ✅ УБИРАЕМ проверку на existingReply - если segment = 'unanswered', значит replies нет
        // Это ускоряет обработку и убирает лишние запросы к БД
        // Проверка была избыточной, т.к. segment уже учитывает наличие replies

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

        // Get mode for this review's rating
        const mode = getReviewMode(review.rating);
        
        // Если режим "off", пропускаем отзыв
        if (mode === "off") {
          skippedNoMode++;
          console.log(`[auto-generate-drafts] Skip review ${review.id} (rating: ${review.rating}): mode is "off"`);
          continue;
        }
        
        // Determine status based on mode
        // auto = scheduled (will be published automatically)
        // semi = drafted (requires confirmation)
        const replyStatus = mode === "auto" ? "scheduled" : "drafted";
        const replyMode = mode === "auto" ? "auto" : "semi_auto";

        console.log(`[auto-generate-drafts] Review ${review.id} (rating: ${review.rating}) -> mode: ${mode}, status: ${replyStatus}`);

        // ✅ Проверяем, нужно ли использовать шаблоны
        let generatedReply: string | null = null;
        let useTemplates = shouldUseTemplates(review.rating);

        if (useTemplates) {
          // Используем шаблон вместо генерации через ИИ
          console.log(`[auto-generate-drafts] Using template for review ${review.id} (rating: ${review.rating})`);
          generatedReply = await getRandomTemplate(review.rating);
          
          if (!generatedReply) {
            console.warn(`[auto-generate-drafts] No template found, falling back to AI generation`);
            // Fallback to AI if no template found
            useTemplates = false;
          }
        }

        // Если шаблоны не используются или не найдены - генерируем через ИИ
        if (!useTemplates || !generatedReply) {
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
          generatedReply = data.choices?.[0]?.message?.content;

          if (!generatedReply) {
            console.error(`[auto-generate-drafts] Empty reply for review ${review.id}`);
            errors.push(`Review ${review.id}: empty reply`);
            continue;
          }
        }

        // Create reply with appropriate status
        const { error: insertError } = await supabase.from("replies").insert({
          review_id: review.id,
          content: generatedReply,
          status: replyStatus,
          mode: replyMode,
          user_id: user_id,
          marketplace_id: mpId,
          scheduled_at: replyStatus === "scheduled" ? new Date().toISOString() : null,
        });

        if (insertError) {
          console.error(`[auto-generate-drafts] Insert error for review ${review.id}:`, insertError);
          errors.push(`Review ${review.id}: ${insertError.message}`);
        } else {
          if (replyStatus === "scheduled") {
            console.log(`[auto-generate-drafts] ⚡ Scheduled auto-reply for review ${review.id} (${useTemplates ? 'template' : 'AI'})`);
            totalScheduled++;
          } else {
            console.log(`[auto-generate-drafts] ✅ Created draft for review ${review.id} (${useTemplates ? 'template' : 'AI'})`);
            totalDrafts++;
          }
        }

        // Задержка только для ИИ-генерации (шаблоны мгновенные)
        // Для шаблонов задержка не нужна, т.к. это просто выбор из БД
        if (!useTemplates) {
          // Задержка для ИИ, чтобы не перегружать API
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (e) {
        console.error(`[auto-generate-drafts] Error processing review ${review.id}:`, e);
        errors.push(`Review ${review.id}: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }

    // Process questions if questions_mode is not 'off'
    const questionsMode = settings?.questions_mode || "off";
    let totalQuestionDrafts = 0;
    let totalQuestionScheduled = 0;

    if (questionsMode !== "off") {
      console.log(`[auto-generate-drafts] Processing questions in mode: ${questionsMode}`);

      let questionsQuery = supabase
        .from("questions")
        .select("id, text, author_name, marketplace_id, products(name, marketplace_id)")
        .eq("is_answered", false)
        .is("deleted_at", null);

      if (marketplace_id) {
        questionsQuery = questionsQuery.eq("marketplace_id", marketplace_id);
      }

      const { data: questions, error: questionsError } = await questionsQuery.limit(20);

      if (questionsError) {
        console.error("Error fetching questions:", questionsError);
      } else {
        console.log(`[auto-generate-drafts] Found ${questions?.length || 0} unanswered questions`);

        for (const question of questions || []) {
          try {
            // Check no reply exists
            const { data: existingReply } = await supabase
              .from("replies")
              .select("id")
              .eq("question_id", question.id)
              .limit(1);

            if (existingReply && existingReply.length > 0) {
              console.log(`[auto-generate-drafts] Skip question ${question.id}: reply exists`);
              continue;
            }

            const products = question.products as any;
            const productName = Array.isArray(products) 
              ? products[0]?.name || "Товар" 
              : products?.name || "Товар";
            
            const mpId = question.marketplace_id || (Array.isArray(products) 
              ? products[0]?.marketplace_id 
              : products?.marketplace_id);

            const replyStatus = questionsMode === "auto" ? "scheduled" : "drafted";
            const replyMode = questionsMode === "auto" ? "auto" : "semi_auto";

            console.log(`[auto-generate-drafts] Question ${question.id} -> mode: ${questionsMode}, status: ${replyStatus}`);

            // Generate answer using AI
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
                    content: `Ты - профессиональный менеджер маркетплейса. Ответь на вопрос покупателя о товаре.

Товар: ${productName}
Вопрос от ${question.author_name}: ${question.text}

ТРЕБОВАНИЯ:
- Максимум ${maxChars} символов
- Официальный, дружелюбный стиль
- БЕЗ эмодзи
- БЕЗ контактов и ссылок
- Конкретный и полезный ответ
- Ответ должен быть завершённым, не обрезанным`
                  },
                  { role: "user", content: "Сгенерируй ответ" }
                ],
              }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error(`[auto-generate-drafts] AI error for question ${question.id}:`, errorText);
              errors.push(`Question ${question.id}: AI error`);
              continue;
            }

            const data = await response.json();
            const generatedReply = data.choices?.[0]?.message?.content;

            if (!generatedReply) {
              console.error(`[auto-generate-drafts] Empty reply for question ${question.id}`);
              errors.push(`Question ${question.id}: empty reply`);
              continue;
            }

            // Create reply
            const { error: insertError } = await supabase.from("replies").insert({
              question_id: question.id,
              content: generatedReply,
              status: replyStatus,
              mode: replyMode,
              user_id: user_id,
              marketplace_id: mpId,
              scheduled_at: replyStatus === "scheduled" ? new Date().toISOString() : null,
            });

            if (insertError) {
              console.error(`[auto-generate-drafts] Insert error for question ${question.id}:`, insertError);
              errors.push(`Question ${question.id}: ${insertError.message}`);
            } else {
              if (replyStatus === "scheduled") {
                console.log(`[auto-generate-drafts] ⚡ Scheduled auto-reply for question ${question.id}`);
                totalQuestionScheduled++;
              } else {
                console.log(`[auto-generate-drafts] ✅ Created draft for question ${question.id}`);
                totalQuestionDrafts++;
              }
            }

            await new Promise(resolve => setTimeout(resolve, 200));
          } catch (e) {
            console.error(`[auto-generate-drafts] Error processing question ${question.id}:`, e);
            errors.push(`Question ${question.id}: ${e instanceof Error ? e.message : "unknown"}`);
          }
        }
      }
    }

    console.log(`[auto-generate-drafts] Completed: Reviews - ${totalDrafts} drafts, ${totalScheduled} scheduled, ${skippedNoMode} skipped (mode=off). Questions - ${totalQuestionDrafts} drafts, ${totalQuestionScheduled} scheduled. ${errors.length} errors`);

    return new Response(
      JSON.stringify({ 
        success: true,
        reviews: {
          drafts_created: totalDrafts,
          scheduled: totalScheduled,
          processed: reviews?.length || 0,
          skipped_no_mode: skippedNoMode,
        },
        questions: {
          drafts_created: totalQuestionDrafts,
          scheduled: totalQuestionScheduled,
        },
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
