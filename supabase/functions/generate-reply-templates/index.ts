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

    const { user_id, count = 10 } = await req.json();

    if (!user_id) {
      throw new Error("user_id is required");
    }

    console.log(`[generate-reply-templates] Generating ${count} templates for user ${user_id}`);

    // Генерируем шаблоны для каждого рейтинга (по 2 на каждый рейтинг)
    const templatesPerRating = Math.ceil(count / 5);
    const generatedTemplates: any[] = [];

    for (let rating = 1; rating <= 5; rating++) {
      for (let i = 0; i < templatesPerRating && generatedTemplates.length < count; i++) {
        try {
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
                  content: `Ты - профессиональный менеджер маркетплейса. Создай шаблон ответа на отзыв покупателя.

Рейтинг: ${rating} из 5
${rating <= 2 ? "Негативный отзыв - нужно извиниться и предложить решение" : rating === 3 ? "Нейтральный отзыв - нужно поблагодарить и учесть замечания" : "Положительный отзыв - нужно поблагодарить и выразить радость"}

ТРЕБОВАНИЯ:
- Максимум 200 символов
- Официальный, дружелюбный стиль
- БЕЗ эмодзи
- БЕЗ контактов и ссылок
- БЕЗ упоминания конкретных товаров (используй общие фразы)
- Шаблон должен быть универсальным и подходить для разных товаров
- Используй плейсхолдеры типа [название товара] если нужно

Создай ТОЛЬКО текст шаблона, без заголовков и пояснений.`
                },
                { role: "user", content: `Создай шаблон ответа на отзыв с рейтингом ${rating} звезд` }
              ],
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[generate-reply-templates] AI error for rating ${rating}:`, errorText);
            continue;
          }

          const data = await response.json();
          const templateContent = data.choices?.[0]?.message?.content?.trim();

          if (!templateContent) {
            console.error(`[generate-reply-templates] Empty template for rating ${rating}`);
            continue;
          }

          generatedTemplates.push({
            name: `Шаблон для ${rating} ${rating === 1 ? 'звезды' : rating < 5 ? 'звёзд' : 'звёзд'} (${i + 1})`,
            content: templateContent,
            tone: rating >= 4 ? "friendly" : rating === 3 ? "professional" : "formal",
            rating: rating,
          });

          // Небольшая задержка между запросами
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
          console.error(`[generate-reply-templates] Error generating template for rating ${rating}:`, e);
        }
      }
    }

    console.log(`[generate-reply-templates] Generated ${generatedTemplates.length} templates`);

    return new Response(
      JSON.stringify({
        success: true,
        templates: generatedTemplates,
        count: generatedTemplates.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[generate-reply-templates] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

