/**
 * sync-ozon: Синхронизирует отзывы и вопросы из Ozon API
 * 
 * ВАЖНО: Товары должны быть синхронизированы ЗАРАНЕЕ через sync-products!
 * Если товар не найден - отзыв/вопрос будет пропущен с warning.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OzonReview {
  id: string;
  sku: number;
  rating: number;
  text?: string;
  advantages?: string;
  disadvantages?: string;
  author_name: string;
  published_at: string;
  photos_amount: number;
  comments_amount: number;
  is_rating_participant: boolean;
}

interface OzonQuestion {
  id: string;
  sku: number;
  text: string;
  author_name: string;
  published_at: string;
  status: string;
  answers_count: number;
  product_url: string;
  question_link: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { marketplace_id, action, clientId: providedClientId, apiKey: providedApiKey } = await req.json();

    // Verification mode - check API credentials
    if (action === "verify") {
      console.log("Verifying Ozon API credentials");

      if (!providedClientId || !providedApiKey) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Client-Id and Api-Key are required for verification",
          }),
          { status: 400, headers: corsHeaders },
        );
      }

      const headers = {
        "Client-Id": providedClientId,
        "Api-Key": providedApiKey,
        "Content-Type": "application/json",
      };

      // Verify access using product/list endpoint
      try {
        const response = await fetch("https://api-seller.ozon.ru/v3/product/list", {
          method: "POST",
          headers,
          body: JSON.stringify({ page_size: 1 }),
        });

        const data = await response.json();

        if (response.status === 200 && data.result) {
          // Try to get shop info
          let shopName = null;
          try {
            const infoResponse = await fetch("https://api-seller.ozon.ru/v1/seller/info", {
              method: "POST",
              headers,
              body: JSON.stringify({}),
            });

            if (infoResponse.ok) {
              const infoData = await infoResponse.json();
              shopName = infoData.result?.name || null;
            }
          } catch (e) {
            console.log("Could not fetch shop info:", e);
          }

          return new Response(
            JSON.stringify({
              success: true,
              message: "Доступ к Ozon API подтверждён",
              shopName: shopName || "Ozon магазин",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        } else if (response.status === 401 || response.status === 403) {
          return new Response(
            JSON.stringify({
              success: false,
              message: "Доступ запрещён. Проверьте корректность Client-Id / API-Key и роли ключа",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        } else {
          return new Response(
            JSON.stringify({
              success: false,
              message: data.message || "Ошибка проверки доступа к Ozon API",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } catch (fetchError) {
        console.error("Fetch error:", fetchError);
        return new Response(
          JSON.stringify({
            success: false,
            message: "Не удалось связаться с Ozon. Попробуйте ещё раз",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Sync mode - requires marketplace_id
    console.log("Starting Ozon sync for marketplace:", marketplace_id);

    if (!marketplace_id) {
      throw new Error("marketplace_id is required for sync operation");
    }

    // Get marketplace details
    const { data: marketplace, error: marketplaceError } = await supabase
      .from("marketplaces")
      .select("*")
      .eq("id", marketplace_id)
      .eq("type", "ozon")
      .single();

    if (marketplaceError || !marketplace) {
      throw new Error(`Marketplace not found: ${marketplaceError?.message}`);
    }

    // Check if marketplace is in fallback mode (UI mode)
    if (marketplace.fallback_enabled && marketplace.fallback_mode === "browser_extension") {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Синхронизация для UI-режима происходит автоматически через расширение браузера. Ручная синхронизация не требуется.",
          isFallbackMode: true,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    if (!marketplace.api_key_encrypted) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "API key not configured for this marketplace",
        }),
        { status: 400, headers: corsHeaders },
      );
    }

    const apiKeyEncrypted = String(marketplace.api_key_encrypted);

    if (!apiKeyEncrypted.includes(":")) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid API key format. Expected format: ClientId:ApiKey",
        }),
        { status: 400, headers: corsHeaders },
      );
    }

    const [clientId, apiKey] = apiKeyEncrypted.split(":");

    if (!clientId || !apiKey) {
      throw new Error("Invalid API key format. Expected: ClientId:ApiKey");
    }

    const headers = {
      "Client-Id": clientId,
      "Api-Key": apiKey,
      "Content-Type": "application/json",
    };

    let syncStats = {
      reviews_synced: 0,
      questions_synced: 0,
      products_synced: 0,
      errors: [] as string[],
    };

    // Sync reviews
    try {
      console.log("Syncing reviews...");
      let lastId = "";
      let hasNext = true;
      let prevLastId = null as string | null;

      while (hasNext) {
        const reviewsResponse = await fetch("https://api-seller.ozon.ru/v1/review/list", {
          method: "POST",
          headers,
          body: JSON.stringify({
            last_id: lastId,
            limit: 100,
            sort_dir: "DESC",
            status: "ALL",
          }),
        });

        if (!reviewsResponse.ok) {
          const errorText = await reviewsResponse.text();
          throw new Error(`Failed to fetch reviews: ${reviewsResponse.status} ${errorText}`);
        }

        const reviewsData = await reviewsResponse.json();
        hasNext = reviewsData.has_next || false;
        prevLastId = lastId;
        lastId = reviewsData.last_id || "";

        if (prevLastId === lastId) {
          console.warn("Reviews pagination stopped: last_id did not change");
          break;
        }

        if (reviewsData.reviews && reviewsData.reviews.length > 0) {
          for (const review of reviewsData.reviews as OzonReview[]) {
            const { data: product } = await supabase
              .from("products")
              .select("id")
              .eq("marketplace_id", marketplace_id)
              .eq("external_id", review.sku.toString())
              .maybeSingle();

            let productId = product?.id;

            if (!productId) {
              console.warn(`[SYNC] Product not found for SKU ${review.sku}. Skipping review...`);
              syncStats.errors.push(`Product SKU ${review.sku} not found - run sync-products first`);
              continue;
            }

            const { error: reviewError } = await supabase.from("reviews").upsert(
              {
                external_id: review.id,
                product_id: productId,
                author_name: review.author_name,
                text: review.text || "",
                advantages: review.advantages,
                disadvantages: review.disadvantages,
                rating: review.rating,
                review_date: review.published_at,
                is_answered: review.comments_amount > 0,
              },
              {
                onConflict: "external_id",
              },
            );

            if (reviewError) {
              console.error("Failed to upsert review:", reviewError);
              syncStats.errors.push(`Review ${review.id}: ${reviewError.message}`);
            } else {
              syncStats.reviews_synced++;
            }
          }
        }

        if (!hasNext || !reviewsData.reviews || reviewsData.reviews.length === 0) {
          break;
        }
      }
    } catch (error) {
      console.error("Error syncing reviews:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      syncStats.errors.push(`Reviews: ${errorMessage}`);
    }

    // Sync questions
    try {
      console.log("Syncing questions...");
      let lastId = "";
      let hasMore = true;
      let prevLastId = null as string | null;

      while (hasMore) {
        const questionsResponse = await fetch("https://api-seller.ozon.ru/v1/question/list", {
          method: "POST",
          headers,
          body: JSON.stringify({
            filter: { status: "ALL" },
            last_id: lastId,
          }),
        });

        if (!questionsResponse.ok) {
          const errorText = await questionsResponse.text();
          throw new Error(`Failed to fetch questions: ${questionsResponse.status} ${errorText}`);
        }

        const questionsData = await questionsResponse.json();

        prevLastId = lastId;
        lastId = questionsData.last_id || "";

        const items: OzonQuestion[] = questionsData.questions || [];

        if (items.length > 0) {
          for (const question of items) {
            const { data: product } = await supabase
              .from("products")
              .select("id")
              .eq("marketplace_id", marketplace_id)
              .eq("external_id", question.sku.toString())
              .maybeSingle();

            let productId = product?.id;

            if (!productId) {
              console.warn(`[SYNC] Product not found for SKU ${question.sku}. Skipping question...`);
              syncStats.errors.push(`Product SKU ${question.sku} not found - run sync-products first`);
              continue;
            }

            const { error: questionError } = await supabase.from("questions").upsert(
              {
                external_id: question.id,
                product_id: productId,
                author_name: question.author_name,
                text: question.text,
                question_date: question.published_at,
                is_answered: question.answers_count > 0,
              },
              {
                onConflict: "external_id",
              },
            );

            if (questionError) {
              console.error("Failed to upsert question:", questionError);
              syncStats.errors.push(`Question ${question.id}: ${questionError.message}`);
            } else {
              syncStats.questions_synced++;
            }
          }
        }

        // ✅ правильная пагинация без ">=10"
        if (typeof questionsData.has_next === "boolean") {
          hasMore = questionsData.has_next;
        } else {
          // если нет has_next → продолжаем только пока:
          // 1) пришли элементы
          // 2) last_id реально меняется (иначе зациклится)
          hasMore = items.length > 0 && lastId !== prevLastId;
        }

        if (lastId === prevLastId) {
          console.warn("Questions pagination stopped: last_id did not change");
          break;
        }
      }
    } catch (error) {
      console.error("Error syncing questions:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      syncStats.errors.push(`Questions: ${errorMessage}`);
    }

    // Update marketplace last_sync_at
    await supabase.from("marketplaces").update({ last_sync_at: new Date().toISOString() }).eq("id", marketplace_id);

    console.log("Sync completed:", syncStats);

    return new Response(
      JSON.stringify({
        success: true,
        stats: syncStats,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Sync error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
