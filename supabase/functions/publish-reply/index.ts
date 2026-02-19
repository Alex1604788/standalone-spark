/**
 * publish-reply: Публикует ответ на отзыв или вопрос
 * VERSION: 2026-02-19-v4
 *
 * CHANGELOG:
 * v4 (2026-02-19):
 * - FIX: Добавлен sku в SELECT query для products (OZON вопросы всегда падали с "Product SKU not found")
 * - FIX: Catch блок теперь сбрасывает статус в 'failed' если ошибка возникла после захвата атомарной блокировки
 *
 * v3 (2026-01-31):
 * - FIX: Добавлена атомарная блокировка для предотвращения DUPLICATE_IN_BATCH
 * - UPDATE status='publishing' WHERE status='scheduled' гарантирует что только 1 процесс обработает reply
 * - Защита от race condition при параллельной обработке в process-scheduled-replies
 *
 * v2 (2026-01-31):
 * - FIX: SKU проверка перенесена ТОЛЬКО для questions (для reviews SKU не нужен)
 * - OZON Review API (/v1/review/comment/create) требует: review_id, text
 * - OZON Question API (/v1/question/answer/create) требует: question_id, sku, text
 *
 * v1 (2026-01-31):
 * - FIX: Убран !inner JOIN для reviews и questions (они взаимоисключающие)
 * - Теперь используется LEFT JOIN - один из них будет NULL
 */
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

  let supabase: ReturnType<typeof createClient> | null = null;
  let reply_id: string | null = null;
  let lockAcquired = false;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    supabase = createClient(supabaseUrl, supabaseKey);

    ({ reply_id } = await req.json());
    console.log("Processing reply:", reply_id);

    // 🔒 ATOMIC LOCK: Пытаемся захватить reply, изменив статус на "publishing"
    // Только ОДИН запрос успешно обновит статус, остальные получат 0 rows
    const { data: lockResult, error: lockError } = await supabase
      .from("replies")
      .update({ status: "publishing" })
      .eq("id", reply_id)
      .eq("status", "scheduled") // ← Критически важно! Обновляем только если scheduled
      .is("deleted_at", null)
      .select("id");

    if (lockError || !lockResult || lockResult.length === 0) {
      console.log(`[publish-reply] Reply ${reply_id} already being processed or not scheduled. Skipping.`);
      return new Response(
        JSON.stringify({ success: false, message: "Already being processed or not scheduled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 }
      );
    }

    lockAcquired = true;
    console.log(`[publish-reply] Lock acquired for reply ${reply_id}`);

    // 1. Получаем данные ответа
    const { data: reply, error: replyError } = await supabase
      .from("replies")
      .select(
        `
        *,
        review:reviews(id, external_id, product:products(external_id, sku, marketplace:marketplaces(*))),
        question:questions(id, external_id, product:products(external_id, sku, marketplace:marketplaces(*)))
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

    // === OZON LOGIC: API or Plugin ===
    if (marketplace.type === "ozon") {
      console.log("[publish-reply] OZON marketplace detected");

      // Check sync mode: 'api' (Premium Plus) or 'plugin' (fallback)
      const { data: syncMode } = await supabase
        .rpc('get_marketplace_sync_mode', { p_marketplace_id: marketplace.id });

      console.log(`[publish-reply] OZON sync_mode: ${syncMode}`);

      if (syncMode === 'api') {
        // PREMIUM PLUS: Publish via OZON API
        console.log("[publish-reply] Using OZON API for publishing");

        // Get API credentials
        const { data: credentials } = await supabase
          .rpc('get_api_credentials', {
            p_marketplace_id: marketplace.id,
            p_api_type: 'seller'
          });

        if (!credentials || credentials.length === 0) {
          console.error("[publish-reply] API credentials not found, falling back to plugin");
          // Fall back to plugin if no credentials — delay 5 min to avoid tight loop in process-scheduled-replies
          const fiveMinutesLater = new Date(Date.now() + 5 * 60 * 1000).toISOString();
          await supabase
            .from("replies")
            .update({
              status: "scheduled",
              scheduled_at: fiveMinutesLater,
              error_message: null,
              retry_count: 0,
            })
            .eq("id", reply_id);

          return new Response(JSON.stringify({ success: true, mode: "queued_for_extension" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Proceed with API publishing (handled below with other marketplaces)
        console.log("[publish-reply] API credentials found, proceeding with API publish");
      } else {
        // NO PREMIUM: Queue for plugin — delay 5 min to avoid tight loop in process-scheduled-replies
        console.log("[publish-reply] Using plugin mode, queuing for extension");

        const fiveMinutesLater = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        await supabase
          .from("replies")
          .update({
            status: "scheduled",
            scheduled_at: fiveMinutesLater,
            error_message: null,
            retry_count: 0,
          })
          .eq("id", reply_id);

        return new Response(JSON.stringify({ success: true, mode: "queued_for_extension" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    // =============================

    // ДАЛЕЕ ИДЕТ СТАРЫЙ КОД ДЛЯ ДРУГИХ МАРКЕТПЛЕЙСОВ (WB, Yandex)
    // Они, видимо, работают через серверное API.

    // Status already set to "publishing" by atomic lock above

    const externalId = reply.review?.external_id || reply.question?.external_id;
    if (!externalId) {
      throw new Error("External ID not found");
    }

    // Publish to marketplace API (Server-side)
    let success = false;
    let errorMessage = "";

    try {
      switch (marketplace.type) {
        case "ozon":
          // Get API credentials for OZON
          const { data: ozonCreds } = await supabase
            .rpc('get_api_credentials', {
              p_marketplace_id: marketplace.id,
              p_api_type: 'seller'
            });

          if (!ozonCreds || ozonCreds.length === 0) {
            throw new Error("OZON API credentials not found");
          }

          const cred = ozonCreds[0];

          if (reply.review_id) {
            // Publish review comment (SKU not needed for reviews)
            success = await publishToOzonReview(
              cred.client_id,
              cred.client_secret,
              externalId,
              reply.content,
            );
          } else if (reply.question_id) {
            // Publish question answer (SKU required for questions)
            const product = reply.question?.product;
            if (!product || !product.sku) {
              throw new Error("Product SKU not found for OZON question API");
            }

            success = await publishToOzonQuestion(
              cred.client_id,
              cred.client_secret,
              externalId,
              product.sku,
              reply.content,
            );
          }
          break;
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
    // 🔒 FIX: Если блокировка была захвачена, сбрасываем статус в 'failed'
    // Иначе reply зависнет в 'publishing' до истечения 10-минутного таймаута в process-scheduled-replies
    if (lockAcquired && supabase && reply_id) {
      await supabase
        .from("replies")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : "Unknown error",
        })
        .eq("id", reply_id);
      console.log(`[publish-reply] Reply ${reply_id} marked as failed due to unhandled error`);
    }
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

async function publishToOzonReview(
  clientId: string,
  apiKey: string,
  reviewId: string,
  content: string,
): Promise<boolean> {
  console.log("[publish-reply] Publishing to OZON review:", { reviewId });

  const response = await fetch("https://api-seller.ozon.ru/v1/review/comment/create", {
    method: "POST",
    headers: {
      "Client-Id": clientId,
      "Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      review_id: reviewId,
      text: content,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[publish-reply] OZON review API error:", response.status, errorText);
    throw new Error(`OZON review API error: ${response.status}`);
  }

  const result = await response.json();
  console.log("[publish-reply] OZON review published successfully:", result);
  return true;
}

async function publishToOzonQuestion(
  clientId: string,
  apiKey: string,
  questionId: string,
  sku: string,
  content: string,
): Promise<boolean> {
  console.log("[publish-reply] Publishing to OZON question:", { questionId, sku });

  const response = await fetch("https://api-seller.ozon.ru/v1/question/answer/create", {
    method: "POST",
    headers: {
      "Client-Id": clientId,
      "Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question_id: questionId,
      sku: parseInt(sku, 10),
      text: content,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[publish-reply] OZON question API error:", response.status, errorText);
    throw new Error(`OZON question API error: ${response.status}`);
  }

  const result = await response.json();
  console.log("[publish-reply] OZON question answered successfully:", result);
  return true;
}
