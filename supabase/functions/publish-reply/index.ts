import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WildberriesReplyPayload {
  text: string;
}

interface YandexMarketReplyPayload {
  text: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { reply_id } = await req.json();
    console.log("Processing reply:", reply_id);

    // 1. Получаем данные ответа
    const { data: reply, error: replyError } = await supabase
      .from("replies")
      .select(
        `
        *,
        review:reviews!inner(id, external_id, product:products(external_id, marketplace:marketplaces(*))),
        question:questions!inner(id, external_id, product:products(external_id, marketplace:marketplaces(*)))
      `,
      )
      .eq("id", reply_id)
      .is("deleted_at", null)
      .single();

    if (replyError || !reply) {
      throw new Error(`Reply not found: ${replyError?.message}`);
    }

    // 2. Определяем маркетплейс
    const marketplace = reply.review?.product?.marketplace || reply.question?.product?.marketplace;
    if (!marketplace) {
      throw new Error("Marketplace not found");
    }

    // === ИСПРАВЛЕНИЕ ДЛЯ OZON ===
    // Если это Ozon, мы НЕ публикуем с сервера.
    // Мы переводим статус в 'scheduled', чтобы расширение забрало ответ.
    if (marketplace.type === "ozon") {
      console.log("Ozon reply detected. Queuing for Extension...");

      await supabase
        .from("replies")
        .update({
          status: "scheduled", // Ставим в очередь для расширения
          scheduled_at: new Date().toISOString(),
          error_message: null, // Очищаем старые ошибки
          retry_count: 0,
        })
        .eq("id", reply_id);

      // Возвращаем успех, так как задача успешно поставлена в очередь
      return new Response(JSON.stringify({ success: true, mode: "queued_for_extension" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // =============================

    // ДАЛЕЕ ИДЕТ СТАРЫЙ КОД ДЛЯ ДРУГИХ МАРКЕТПЛЕЙСОВ (WB, Yandex)
    // Они, видимо, работают через серверное API.

    // Update status to publishing (только для серверной публикации)
    await supabase.from("replies").update({ status: "publishing" }).eq("id", reply_id);

    const externalId = reply.review?.external_id || reply.question?.external_id;
    if (!externalId) {
      throw new Error("External ID not found");
    }

    // Publish to marketplace API (Server-side)
    let success = false;
    let errorMessage = "";

    try {
      switch (marketplace.type) {
        case "wildberries":
          success = await publishToWildberries(
            marketplace.api_key_encrypted,
            externalId,
            reply.content,
            !!reply.review_id,
          );
          break;
        case "yandex_market":
          success = await publishToYandexMarket(
            marketplace.api_key_encrypted,
            externalId,
            reply.content,
            !!reply.review_id,
          );
          break;
        default:
          throw new Error(`Unsupported marketplace type for server-side publish: ${marketplace.type}`);
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Marketplace API error:", errorMessage);
    }

    // Update reply status based on API result
    if (success) {
      await supabase
        .from("replies")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
        })
        .eq("id", reply_id);

      // Update is_answered flag
      if (reply.review_id) {
        await supabase.from("reviews").update({ is_answered: true }).eq("id", reply.review_id);
      } else if (reply.question_id) {
        await supabase.from("questions").update({ is_answered: true }).eq("id", reply.question_id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Handle retry logic (Server-side only)
      const newRetryCount = (reply.retry_count || 0) + 1;
      const maxRetries = 5;

      if (newRetryCount >= maxRetries) {
        await supabase
          .from("replies")
          .update({
            status: "failed",
            error_message: errorMessage,
            retry_count: newRetryCount,
          })
          .eq("id", reply_id);
      } else {
        const retryDelays = [0, 5, 15, 30, 60];
        const delayMinutes = retryDelays[newRetryCount] || 60;
        const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();

        await supabase
          .from("replies")
          .update({
            status: "scheduled",
            error_message: errorMessage,
            retry_count: newRetryCount,
            scheduled_at: scheduledAt,
          })
          .eq("id", reply_id);
      }

      return new Response(JSON.stringify({ success: false, error: errorMessage }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("Error in publish-reply:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// --- Helper Functions ---

async function publishToWildberries(
  apiKey: string,
  externalId: string,
  content: string,
  isReview: boolean,
): Promise<boolean> {
  console.log("Publishing to Wildberries:", { externalId, isReview });
  const endpoint = isReview
    ? `https://feedbacks-api.wildberries.ru/api/v1/feedbacks/${externalId}/answer`
    : `https://feedbacks-api.wildberries.ru/api/v1/questions/${externalId}/answer`;

  const payload: WildberriesReplyPayload = { text: content };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Wildberries API error:", response.status, errorText);
    throw new Error(`Wildberries API error: ${response.status}`);
  }
  return true;
}

async function publishToYandexMarket(
  apiKey: string,
  externalId: string,
  content: string,
  isReview: boolean,
): Promise<boolean> {
  console.log("Publishing to Yandex Market:", { externalId, isReview });
  if (!apiKey) throw new Error("Yandex Market API key not configured");

  const [businessId, campaignId, oauthToken] = String(apiKey).split(":");
  if (!businessId || !oauthToken) throw new Error("Invalid Yandex Market API key format");

  const endpoint = isReview
    ? `https://api.partner.market.yandex.ru/businesses/${businessId}/reviews/${externalId}/comments`
    : `https://api.partner.market.yandex.ru/businesses/${businessId}/questions/${externalId}/answers`;

  const payload: YandexMarketReplyPayload = { text: content };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${oauthToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Yandex Market API error:", response.status, errorText);
    throw new Error(`Yandex Market API error: ${response.status}`);
  }
  return true;
}
