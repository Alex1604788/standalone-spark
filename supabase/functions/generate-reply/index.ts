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
    const {
      reviewId,
      questionId,
      tone = "friendly",
      response_length = "normal",
    } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const lengthConfig = {
      short: {
        maxChars: 200,
        instruction: "Максимум 200 символов (2-3 предложения)",
      },
      normal: {
        maxChars: 400,
        instruction: "Максимум 400 символов (не более 4 предложений)",
      },
    };

    const config = lengthConfig[response_length as keyof typeof lengthConfig] || lengthConfig.normal;

    let itemData;
    let systemPrompt = "";
    let userPrompt = "";
    let productId: string | null = null;
    let offerId: string | null = null;
    let marketplaceId: string | null = null;

    if (reviewId) {
      const { data: review, error } = await supabase
        .from("reviews")
        .select("*, products(id, name, offer_id, marketplace_id)")
        .eq("id", reviewId)
        .is("deleted_at", null)
        .single();

      if (error) throw error;

      itemData = review;
      productId = review.products?.id;
      offerId = review.products?.offer_id;
      marketplaceId = review.marketplace_id;

      systemPrompt = `Ты - профессиональный менеджер по работе с клиентами интернет-магазина.

КРИТИЧЕСКИ ВАЖНО:
- Пиши ТОЛЬКО текст ответа клиенту
- НЕ добавляй заголовки: "Ответ:", "Отзыв:", "**Ответ:**", "**Отзыв:**"
- НЕ используй markdown форматирование (без звёздочек, без заголовков)
- НЕ повторяй текст отзыва
- Пиши сразу с первого слова ответа

Требования к стилю:
- ${config.instruction}
- ТОЛЬКО официальный деловой стиль (без эмоций, эмодзи, восклицательных знаков)
- БЕЗ контактных данных (телефонов, email, ссылок)
- БЕЗ предложений обмена напрямую
- Поблагодари за отзыв формально
${review.rating >= 4 ? "- Вырази благодарность за положительную оценку" : "- Вежливо извинись за негативный опыт"}
- Если есть критика — признай проблему и сообщи, что информация передана в отдел качества
- Деловой язык: "Благодарим за отзыв", "Учтём Ваши замечания", "Работаем над улучшением"`;

      userPrompt = `Напиши ответ на отзыв покупателя.

Товар: ${review.products?.name || "не указан"}
Рейтинг: ${review.rating} из 5
Отзыв: "${review.text || ""}"
${review.advantages ? `Достоинства: "${review.advantages}"` : ""}
${review.disadvantages ? `Недостатки: "${review.disadvantages}"` : ""}`;

    } else if (questionId) {
      const { data: question, error } = await supabase
        .from("questions")
        .select("*, products(id, name, offer_id, marketplace_id)")
        .eq("id", questionId)
        .is("deleted_at", null)
        .single();

      if (error) throw error;

      itemData = question;
      productId = question.products?.id;
      offerId = question.products?.offer_id;
      marketplaceId = question.marketplace_id;

      systemPrompt = `Ты - профессиональный менеджер по работе с клиентами интернет-магазина.

КРИТИЧЕСКИ ВАЖНО:
- Пиши ТОЛЬКО текст ответа клиенту
- НЕ добавляй заголовки: "Ответ:", "Вопрос:", "**Ответ:**", "**Вопрос:**"
- НЕ используй markdown форматирование (без звёздочек, без заголовков)
- НЕ повторяй текст вопроса
- Пиши сразу с первого слова ответа

Требования к стилю:
- ${config.instruction}
- ТОЛЬКО официальный деловой стиль (без эмоций, эмодзи)
- БЕЗ контактных данных (телефонов, email, ссылок)
- Дай чёткий профессиональный ответ на вопрос
- Если не знаешь точного ответа: "Для уточнения деталей рекомендуем обратиться в службу поддержки магазина"
- Деловой язык: "Благодарим за вопрос", "Согласно характеристикам", "Рекомендуем обратиться"`;

      userPrompt = `Напиши ответ на вопрос покупателя.

Товар: ${question.products?.name || "не указан"}
Вопрос: "${question.text}"`;

    } else {
      throw new Error("Either reviewId or questionId must be provided");
    }

    // 🆕 Получаем базу знаний для этого товара
    let knowledgeContext = "";
    if (offerId && marketplaceId) {
      console.log(`Fetching knowledge for offer_id: ${offerId}, marketplace_id: ${marketplaceId}`);
      
      // Используем функцию get_knowledge_for_product_with_fallback
      const { data: knowledge, error: knowledgeError } = await supabase
        .rpc("get_knowledge_for_product_with_fallback", {
          p_marketplace_id: marketplaceId,
          p_offer_id: offerId,
          p_limit: 5,
        });

      if (knowledgeError) {
        console.error("Error fetching knowledge:", knowledgeError);
      } else if (knowledge && knowledge.length > 0) {
        console.log(`Found ${knowledge.length} knowledge entries`);
        knowledgeContext = "\n\n📚 БАЗА ЗНАНИЙ О ТОВАРЕ (используй эту информацию для ответа):\n";
        knowledge.forEach((k: any, i: number) => {
          knowledgeContext += `\n${i + 1}. ${k.title}:\n${k.content}\n`;
        });
      } else {
        console.log("No knowledge found for this product");
      }
    }

    // Добавляем базу знаний в системный промпт
    if (knowledgeContext) {
      systemPrompt += `\n\nВАЖНО: При формировании ответа ОБЯЗАТЕЛЬНО используй информацию из базы знаний о товаре, если она релевантна вопросу или отзыву.${knowledgeContext}`;
    }

    userPrompt += "\n\nНапиши только текст ответа, без заголовков и форматирования.";

    console.log("System prompt length:", systemPrompt.length);
    console.log("User prompt length:", userPrompt.length);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: response_length === "short" ? 200 : 500,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits to your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Failed to generate reply");
    }

    const data = await response.json();
    let generatedReply = data.choices[0].message.content;

    generatedReply = generatedReply
      .trim()
      .replace(/^\*\*Ответ:\*\*\s*/i, "")
      .replace(/^\*\*Отзыв:\*\*\s*/i, "")
      .replace(/^\*\*Вопрос:\*\*\s*/i, "")
      .replace(/^Ответ:\s*/i, "")
      .replace(/^Отзыв:\s*/i, "")
      .replace(/^Вопрос:\s*/i, "")
      .trim();

    return new Response(JSON.stringify({ reply: generatedReply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error generating reply:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
