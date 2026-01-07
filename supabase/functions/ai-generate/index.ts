import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateRequest {
  item_id: string;
  type: "review" | "question";
  text: string;
  rating?: number;
  product_name?: string;
  advantages?: string;
  disadvantages?: string;
  regenerate?: boolean;
  response_length?: "short" | "normal";
  product_id?: string;
  offer_id?: string;
  marketplace_id?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const body: GenerateRequest = await req.json();
    const {
      item_id,
      type,
      text,
      rating,
      product_name,
      advantages,
      disadvantages,
      regenerate,
      response_length = "normal",
    } = body;

    // Get product info to fetch knowledge
    let offerId: string | null = null;
    let marketplaceId: string | null = null;

    const table = type === "review" ? "reviews" : "questions";
    const { data: itemData } = await supabase
      .from(table)
      .select("*, products(id, offer_id, marketplace_id)")
      .eq("id", item_id)
      .single();

    if (itemData?.products) {
      offerId = itemData.products.offer_id;
      marketplaceId = type === "review" ? itemData.marketplace_id : itemData.marketplace_id;
    }

    // Check regeneration rate limit (30 seconds)
    if (regenerate) {
      const { data: item } = await supabase.from(table).select("last_generated_at").eq("id", item_id).single();

      if (item?.last_generated_at) {
        const lastGen = new Date(item.last_generated_at).getTime();
        const now = Date.now();
        if (now - lastGen < 30000) {
          return new Response(JSON.stringify({ error: "Подождите 30 секунд перед повторной генерацией" }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const lengthConfig = {
      short: {
        maxWords: 50,
        maxTokens: 200,
        instruction: "Ответ должен быть КРАТКИМ — максимум 2-3 предложения (не более 50 слов).",
      },
      normal: {
        maxWords: 150,
        maxTokens: 500,
        instruction: "Ответ должен быть развёрнутым, но не слишком длинным — 3-5 предложений (50-150 слов).",
      },
    };

    const config = lengthConfig[response_length];

    // 🆕 Получаем базу знаний для этого товара
    let knowledgeContext = "";
    if (offerId && marketplaceId) {
      console.log(`Fetching knowledge for offer_id: ${offerId}, marketplace_id: ${marketplaceId}`);
      
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

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "review") {
      systemPrompt = `Ты — профессиональный менеджер по работе с клиентами маркетплейса Ozon. 

КРИТИЧЕСКИ ВАЖНО:
- Пиши ТОЛЬКО текст ответа клиенту
- НЕ добавляй заголовки типа "Ответ:", "Отзыв:", "**Ответ:**" и т.д.
- НЕ используй markdown форматирование (без звёздочек, без заголовков)
- НЕ повторяй текст отзыва клиента
- Пиши сразу с первого слова ответа

Требования к стилю:
- Вежливый, искренний, профессиональный тон
- ${rating && rating >= 4 ? "Вырази благодарность за позитивный опыт" : "Извинись за возникшие неудобства"}
- ${disadvantages ? "Обязательно прокомментируй недостатки и предложи решение" : ""}
- ${config.instruction}
- Пиши на русском языке`;

      userPrompt = `Напиши ответ на отзыв покупателя.

Товар: ${product_name || "не указан"}
Оценка: ${rating || "не указана"}/5
Текст отзыва: "${text}"
${advantages ? `Достоинства: "${advantages}"` : ""}
${disadvantages ? `Недостатки: "${disadvantages}"` : ""}`;
    } else {
      systemPrompt = `Ты — профессиональный менеджер по работе с клиентами маркетплейса Ozon.

КРИТИЧЕСКИ ВАЖНО:
- Пиши ТОЛЬКО текст ответа клиенту
- НЕ добавляй заголовки типа "Ответ:", "Вопрос:", "**Ответ:**" и т.д.
- НЕ используй markdown форматирование (без звёздочек, без заголовков)
- НЕ повторяй текст вопроса клиента
- Пиши сразу с первого слова ответа

Требования к стилю:
- Дай чёткий и исчерпывающий ответ на вопрос
- Дружелюбный, но профессиональный тон
- Если не хватает информации, предложи связаться с поддержкой
- ${config.instruction}
- Пиши на русском языке`;

      userPrompt = `Напиши ответ на вопрос покупателя.

Товар: ${product_name || "не указан"}
Вопрос: "${text}"`;
    }

    // Добавляем базу знаний в системный промпт
    if (knowledgeContext) {
      systemPrompt += `\n\nВАЖНО: При формировании ответа ОБЯЗАТЕЛЬНО используй информацию из базы знаний о товаре, если она релевантна вопросу или отзыву.${knowledgeContext}`;
    }

    userPrompt += "\n\nНапиши только текст ответа, без заголовков и форматирования.";

    console.log("System prompt length:", systemPrompt.length);
    console.log("User prompt length:", userPrompt.length);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: config.maxTokens,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);

      await supabase.from("logs_ai").insert({
        item_id,
        type,
        error_message: `AI API error: ${aiResponse.status} - ${errorText}`,
        model: "gemini-2.5-flash",
      });

      throw new Error("AI generation failed");
    }

    const aiData = await aiResponse.json();
    let generatedText = aiData.choices?.[0]?.message?.content;

    if (!generatedText) {
      throw new Error("No content generated");
    }

    generatedText = generatedText
      .trim()
      .replace(/^\*\*Ответ:\*\*\s*/i, "")
      .replace(/^\*\*Отзыв:\*\*\s*/i, "")
      .replace(/^\*\*Вопрос:\*\*\s*/i, "")
      .replace(/^Ответ:\s*/i, "")
      .replace(/^Отзыв:\s*/i, "")
      .replace(/^Вопрос:\s*/i, "")
      .trim();

    // Save history if regenerating
    if (regenerate) {
      const { data: oldItem } = await supabase.from(table).select("suggested_reply").eq("id", item_id).single();

      if (oldItem?.suggested_reply) {
        await supabase.from("ai_reply_history").insert({
          item_id,
          type,
          old_text: oldItem.suggested_reply,
          new_text: generatedText,
          model: "gemini-2.5-flash",
        });
      }
    }

    const { error: updateError } = await supabase
      .from(table)
      .update({
        suggested_reply: generatedText,
        status: "ai_generated",
        last_generated_at: new Date().toISOString(),
      })
      .eq("id", item_id);

    if (updateError) {
      console.error("Update error:", updateError);
      throw updateError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        suggested_reply: generatedText,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("AI generation error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
