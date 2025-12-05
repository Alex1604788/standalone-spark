import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper function to split array into chunks
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const body = await req.json();
    const { marketplace_id, reviews = [], questions = [] } = body;

    console.log("[SYNC] start: reviews=%d, questions=%d", reviews.length, questions.length);

    if (!marketplace_id) {
      console.error("[SYNC] ERROR: marketplace_id is missing");
      return new Response(JSON.stringify({ error: "marketplace_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check marketplace exists
    const { data: marketplace, error: mpError } = await supabase
      .from("marketplaces")
      .select("id")
      .eq("id", marketplace_id)
      .single();

    if (mpError || !marketplace) {
      console.error("[SYNC] ERROR: Marketplace not found", mpError);
      return new Response(JSON.stringify({ error: "Marketplace not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let insertedReviews = 0;
    let insertedQuestions = 0;

    // ========================================
    // PROCESS REVIEWS IN BATCHES
    // ========================================
    if (reviews.length > 0) {
      console.log("[SYNC] Processing %d reviews...", reviews.length);

      // ✅ Собираем уникальные offer_id и external_id из отзывов
      const offerIds = new Set<string>();
      const externalIds = new Set<string>();

      for (const review of reviews) {
        if (review.product_offer_id) {
          offerIds.add(review.product_offer_id);
        }
        if (review.product_external_id) {
          externalIds.add(review.product_external_id);
        }
      }

      console.log("[SYNC] Unique offer_ids: %d, external_ids: %d", offerIds.size, externalIds.size);

      // ✅ Загружаем товары по offer_id И по sku/external_id
      const offerIdsArray = Array.from(offerIds);
      const externalIdsArray = Array.from(externalIds);

      let existingProducts: any[] = [];

      // Загружаем товары по offer_id
      if (offerIdsArray.length > 0) {
        const { data: productsByOfferId } = await supabase
          .from("products")
          .select("id, external_id, offer_id, sku")
          .eq("marketplace_id", marketplace_id)
          .in("offer_id", offerIdsArray);

        if (productsByOfferId) {
          existingProducts = existingProducts.concat(productsByOfferId);
        }
      }

      // Загружаем товары по SKU (запасной вариант)
      if (externalIdsArray.length > 0) {
        const { data: productsBySku } = await supabase
          .from("products")
          .select("id, external_id, offer_id, sku")
          .eq("marketplace_id", marketplace_id)
          .in("sku", externalIdsArray);

        if (productsBySku) {
          existingProducts = existingProducts.concat(productsBySku);
        }
      }

      // ✅ Создаём Map для быстрого поиска (убираем дубли)
      const productByOfferId = new Map<string, string>();
      const productBySku = new Map<string, string>();
      const productByExternalId = new Map<string, string>();

      const uniqueProducts = new Map<string, any>();
      for (const p of existingProducts) {
        if (!uniqueProducts.has(p.id)) {
          uniqueProducts.set(p.id, p);
        }
      }

      for (const p of uniqueProducts.values()) {
        if (p.offer_id) productByOfferId.set(p.offer_id, p.id);
        if (p.sku) productBySku.set(p.sku, p.id);
        if (p.external_id) productByExternalId.set(p.external_id, p.id);
      }

      console.log("[SYNC] Loaded %d unique products", uniqueProducts.size);

      // Prepare review data with product_id
      const reviewsToInsert = reviews
        .map((review: any) => {
          // ✅ Ищем товар СНАЧАЛА по offer_id, потом по SKU, потом по external_id
          let product_id = null;

          if (review.product_offer_id) {
            product_id = productByOfferId.get(review.product_offer_id);
          }

          if (!product_id && review.product_external_id) {
            product_id = productBySku.get(review.product_external_id);
          }

          if (!product_id && review.product_external_id) {
            product_id = productByExternalId.get(review.product_external_id);
          }

          if (!product_id) {
            console.warn(
              "[SYNC] Review %s: product not found (offer_id: %s, sku: %s)",
              review.external_id,
              review.product_offer_id,
              review.product_external_id,
            );
            return null;
          }

          return {
            marketplace_id,
            external_id: review.external_id,
            product_id,
            author_name: review.author_name || "",
            text: review.text || "",
            advantages: review.advantages,
            disadvantages: review.disadvantages,
            rating: review.rating,
            review_date: review.created_at || new Date().toISOString(),
            photos: review.photos || [],
            product_image: review.product_image,
            source_type: "ozon",
            status: review.status || "new",
            is_answered: Boolean(review.is_answered),
          };
        })
        .filter(Boolean);

      console.log(
        "[SYNC] Reviews to insert: %d (skipped: %d)",
        reviewsToInsert.length,
        reviews.length - reviewsToInsert.length,
      );

      // Insert reviews in batches
      const reviewBatches = chunk(reviewsToInsert, 200);
      console.log("[SYNC] Inserting %d reviews in %d batches...", reviewsToInsert.length, reviewBatches.length);

      for (let i = 0; i < reviewBatches.length; i++) {
        const batchStart = Date.now();
        const { data, error: reviewError } = await supabase
          .from("reviews")
          .upsert(reviewBatches[i], {
            onConflict: "marketplace_id,external_id",
            ignoreDuplicates: false,
          })
          .select("id");

        const batchTime = Date.now() - batchStart;
        if (reviewError) {
          console.error("[SYNC] reviews batch %d/%d ERROR: %s", i + 1, reviewBatches.length, reviewError.message);
        } else {
          const count = data?.length || 0;
          insertedReviews += count;
          console.log(
            "[SYNC] reviews batch %d/%d: %d items, %dms",
            i + 1,
            reviewBatches.length,
            reviewBatches[i].length,
            batchTime,
          );
        }
      }
    }

    // ========================================
    // PROCESS QUESTIONS IN BATCHES
    // ========================================
    if (questions.length > 0) {
      console.log("[SYNC] Processing %d questions...", questions.length);

      // ✅ Собираем уникальные offer_id и external_id из вопросов
      const offerIds = new Set<string>();
      const externalIds = new Set<string>();

      for (const question of questions) {
        if (question.product_offer_id) {
          offerIds.add(question.product_offer_id);
        }
        if (question.product_external_id) {
          externalIds.add(question.product_external_id);
        }
      }

      console.log("[SYNC] Unique offer_ids: %d, external_ids: %d", offerIds.size, externalIds.size);

      // ✅ Загружаем товары по offer_id И по sku/external_id
      const offerIdsArray = Array.from(offerIds);
      const externalIdsArray = Array.from(externalIds);

      let existingProducts: any[] = [];

      // Загружаем товары по offer_id
      if (offerIdsArray.length > 0) {
        const { data: productsByOfferId } = await supabase
          .from("products")
          .select("id, external_id, offer_id, sku")
          .eq("marketplace_id", marketplace_id)
          .in("offer_id", offerIdsArray);

        if (productsByOfferId) {
          existingProducts = existingProducts.concat(productsByOfferId);
        }
      }

      // Загружаем товары по SKU (запасной вариант)
      if (externalIdsArray.length > 0) {
        const { data: productsBySku } = await supabase
          .from("products")
          .select("id, external_id, offer_id, sku")
          .eq("marketplace_id", marketplace_id)
          .in("sku", externalIdsArray);

        if (productsBySku) {
          existingProducts = existingProducts.concat(productsBySku);
        }
      }

      // ✅ Создаём Map для быстрого поиска (убираем дубли)
      const productByOfferId = new Map<string, string>();
      const productBySku = new Map<string, string>();
      const productByExternalId = new Map<string, string>();

      const uniqueProducts = new Map<string, any>();
      for (const p of existingProducts) {
        if (!uniqueProducts.has(p.id)) {
          uniqueProducts.set(p.id, p);
        }
      }

      for (const p of uniqueProducts.values()) {
        if (p.offer_id) productByOfferId.set(p.offer_id, p.id);
        if (p.sku) productBySku.set(p.sku, p.id);
        if (p.external_id) productByExternalId.set(p.external_id, p.id);
      }

      console.log("[SYNC] Loaded %d unique products", uniqueProducts.size);

      // Prepare question data with product_id
      const questionsToInsert = questions
        .map((question: any) => {
          // ✅ Ищем товар СНАЧАЛА по offer_id, потом по SKU, потом по external_id
          let product_id = null;

          if (question.product_offer_id) {
            product_id = productByOfferId.get(question.product_offer_id);
          }

          if (!product_id && question.product_external_id) {
            product_id = productBySku.get(question.product_external_id);
          }

          if (!product_id && question.product_external_id) {
            product_id = productByExternalId.get(question.product_external_id);
          }

          if (!product_id) {
            console.warn(
              "[SYNC] Question %s: product not found (offer_id: %s, sku: %s)",
              question.external_id,
              question.product_offer_id,
              question.product_external_id,
            );
            return null;
          }

          return {
            marketplace_id,
            external_id: question.external_id,
            product_id,
            author_name: question.author_name || "",
            text: question.text || "",
            question_date: question.created_at || new Date().toISOString(),
            product_image: question.product_image,
            source_type: "ozon",
            status: question.status || "new",
            is_answered: Boolean(question.is_answered),
          };
        })
        .filter(Boolean);

      console.log(
        "[SYNC] Questions to insert: %d (skipped: %d)",
        questionsToInsert.length,
        questions.length - questionsToInsert.length,
      );

      // Insert questions in batches
      const questionBatches = chunk(questionsToInsert, 200);
      console.log("[SYNC] Inserting %d questions in %d batches...", questionsToInsert.length, questionBatches.length);

      for (let i = 0; i < questionBatches.length; i++) {
        const batchStart = Date.now();
        const { data, error: questionError } = await supabase
          .from("questions")
          .upsert(questionBatches[i], {
            onConflict: "marketplace_id,external_id",
            ignoreDuplicates: false,
          })
          .select("id");

        const batchTime = Date.now() - batchStart;
        if (questionError) {
          console.error("[SYNC] questions batch %d/%d ERROR: %s", i + 1, questionBatches.length, questionError.message);
        } else {
          const count = data?.length || 0;
          insertedQuestions += count;
          console.log(
            "[SYNC] questions batch %d/%d: %d items, %dms",
            i + 1,
            questionBatches.length,
            questionBatches[i].length,
            batchTime,
          );
        }
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("[SYNC] done in %ss", totalTime);

    return new Response(
      JSON.stringify({
        ok: true,
        inserted_reviews: insertedReviews,
        inserted_questions: insertedQuestions,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error("[SYNC] ERROR after %ss:", totalTime, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("[SYNC] Stack:", errorStack);

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: errorMessage,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
