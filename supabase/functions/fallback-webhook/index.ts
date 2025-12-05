import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- Типы данных ---
interface SyncItemReview {
  external_id: string;
  product_external_id?: string;
  product_name?: string;
  author_name?: string;
  text: string;
  rating?: number;
  created_at?: string;
  advantages?: string;
  disadvantages?: string;
  photos?: any[];
}

interface SyncItemQuestion {
  external_id: string;
  product_external_id?: string;
  product_name?: string;
  author_name?: string;
  text: string;
  created_at?: string;
}

interface FallbackWebhookPayload {
  action?: string;
  action_type?: string;
  marketplace_id?: string;
  ozon_seller_id?: string;
  email?: string;
  ozon_email?: string;
  reviews?: SyncItemReview[];
  questions?: SyncItemQuestion[];
  status?: string;
  details?: any;
  error_message?: string;
  extension_version?: string;
}

// Утилита
function nowIso() {
  return new Date().toISOString();
}

// --------------------------
// Основная функция webhook
// --------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: FallbackWebhookPayload = await req.json().catch(() => ({}));
    console.log("[fallback-webhook] incoming payload:", payload?.action, payload?.action_type);

    // 1️⃣ verify_session
    if (payload.action === "verify_session") {
      const pairing_code = payload.details?.pairing_code;
      const ozon_email = payload.ozon_email || payload.email;
      const ozon_seller_id = payload.ozon_seller_id;

      if (!pairing_code) return json400("NO_PAIRING_CODE", "pairing code required");
      if (!ozon_email) return json400("NOT_LOGGED_IN", "Войдите в Ozon под сервисной учёткой");

      const { data: connection } = await supabase
        .from("ozon_ui_connections")
        .select("id, user_id, marketplace_id, status, expires_at")
        .eq("pairing_code", pairing_code)
        .eq("status", "pending_ui_pairing")
        .maybeSingle();

      if (!connection) return json404("pairing_code_not_found", "Неверный или истёкший код подключения");
      if (connection.expires_at && new Date(connection.expires_at) < new Date()) {
        return json404("pairing_code_expired", "Истёк срок действия кода");
      }

      const { data: marketplace } = await supabase
        .from("marketplaces")
        .select("id, name")
        .eq("id", connection.marketplace_id)
        .maybeSingle();

      if (!marketplace) return json404("NO_MARKETPLACE_FOUND", "Магазин не найден");

      await supabase
        .from("ozon_ui_connections")
        .update({
          verified_email: ozon_email,
          ozon_seller_id,
          status: "active_ui",
          last_sync_at: nowIso(),
        })
        .eq("id", connection.id);

      await supabase
        .from("marketplaces")
        .update({
          verified_email: ozon_email,
          ozon_seller_id,
          last_fallback_action_at: nowIso(),
          status: "active_ui",
        })
        .eq("id", marketplace.id);

      return jsonOK({
        success: true,
        marketplace_id: marketplace.id,
        marketplace_name: marketplace.name,
        verified_email: ozon_email,
      });
    }

    // 2️⃣ connect_ozon_ui
    if (payload.action === "connect_ozon_ui") {
      const ozon_email = payload.ozon_email || payload.email;
      const ozon_seller_id = payload.ozon_seller_id;
      if (!ozon_email) return json400("MISSING_CREDENTIALS", "Нужен email");

      const { data: existingMarketplace } = await supabase
        .from("marketplaces")
        .select("user_id, id, name")
        .eq("service_account_email", ozon_email)
        .eq("type", "ozon")
        .maybeSingle();

      if (!existingMarketplace) return json404("NO_MARKETPLACE_FOUND", "Создайте магазин в веб-интерфейсе");

      await supabase
        .from("marketplaces")
        .update({
          fallback_mode: "ui",
          fallback_enabled: true,
          ozon_seller_id,
          last_sync_at: nowIso(),
        })
        .eq("id", existingMarketplace.id);

      return jsonOK({
        success: true,
        marketplace_id: existingMarketplace.id,
        marketplace_name: existingMarketplace.name,
        verified_email: ozon_email,
      });
    }

    // 3️⃣ sync_reviews — основная загрузка отзывов и вопросов
    if (payload.action === "sync_reviews") {
      const marketplace_id = payload.marketplace_id;
      const incomingReviews = payload.reviews || [];
      const incomingQuestions = payload.questions || [];

      if (!marketplace_id) return json400("NO_MARKETPLACE_ID", "marketplace_id required");

      const { data: mpCheck } = await supabase
        .from("marketplaces")
        .select("kill_switch_enabled, user_id")
        .eq("id", marketplace_id)
        .maybeSingle();

      if (!mpCheck) return json404("MARKETPLACE_NOT_FOUND", "no such marketplace");
      if (mpCheck.kill_switch_enabled) return json403("KILL_SWITCH", "Kill-switch is active");

      // --- Обработка отзывов ---
      for (const rev of incomingReviews) {
        const { data: insertedReview } = await supabase
          .from("reviews")
          .upsert(
            {
              external_id: rev.external_id,
              marketplace_id,
              product_external_id: rev.product_external_id || "unknown",
              author_name: rev.author_name || "",
              text: rev.text,
              rating: rev.rating || 0,
              review_date: rev.created_at || nowIso(),
              advantages: rev.advantages || "",
              disadvantages: rev.disadvantages || "",
              photos: rev.photos || [],
            },
            { onConflict: "external_id,marketplace_id", ignoreDuplicates: false },
          )
          .select()
          .maybeSingle();

        if (insertedReview) {
          const { data: existingReply } = await supabase
            .from("replies")
            .select("id")
            .eq("review_id", insertedReview.id)
            .maybeSingle();

          if (!existingReply) {
            const { data: replyData } = await supabase.functions.invoke("generate-reply", {
              body: {
                reviewText: rev.text,
                advantages: rev.advantages,
                disadvantages: rev.disadvantages,
                rating: rev.rating,
                productName: rev.product_name || "товар",
                tone: "friendly",
              },
            });

            if (replyData?.reply) {
              await supabase.from("replies").insert({
                review_id: insertedReview.id,
                user_id: mpCheck.user_id,
                content: replyData.reply,
                status: "drafted",
                mode: "auto",
                tone: "friendly",
              });
            }
          }
        }
      }

      // --- Обработка вопросов ---
      for (const q of incomingQuestions) {
        const { data: insertedQuestion } = await supabase
          .from("questions")
          .upsert(
            {
              external_id: q.external_id,
              marketplace_id,
              product_external_id: q.product_external_id || "unknown",
              author_name: q.author_name || "",
              text: q.text,
              question_date: q.created_at || nowIso(),
            },
            { onConflict: "external_id,marketplace_id", ignoreDuplicates: false },
          )
          .select()
          .maybeSingle();

        if (insertedQuestion) {
          const { data: existingReply } = await supabase
            .from("replies")
            .select("id")
            .eq("question_id", insertedQuestion.id)
            .maybeSingle();

          if (!existingReply) {
            const { data: replyData } = await supabase.functions.invoke("generate-reply", {
              body: {
                questionText: q.text,
                productName: q.product_name || "товар",
                tone: "friendly",
              },
            });

            if (replyData?.reply) {
              await supabase.from("replies").insert({
                question_id: insertedQuestion.id,
                user_id: mpCheck.user_id,
                content: replyData.reply,
                status: "drafted",
                mode: "auto",
                tone: "friendly",
              });
            }
          }
        }
      }

      await supabase.from("marketplaces").update({ last_sync_at: nowIso() }).eq("id", marketplace_id);

      return jsonOK({
        success: true,
        message: `Synced ${incomingReviews.length} reviews and ${incomingQuestions.length} questions`,
      });
    }

    // 4️⃣ get_pending_replies — возвращает очередь черновиков
    if (payload.action === "get_pending_replies") {
      const { marketplace_id } = payload;
      console.log("Fetching pending replies for marketplace:", marketplace_id);

      if (!marketplace_id) {
        return json400("NO_MARKETPLACE_ID", "marketplace_id required");
      }

      try {
        const { data: replies, error } = await supabase
          .from("replies")
          .select("id, content, review_id, question_id")
          .eq("status", "drafted")
          .eq("mode", "auto")
          .limit(20);

        if (error) throw error;

        console.log("Found pending replies:", replies?.length || 0);
        return jsonOK({ success: true, replies: replies || [] });
      } catch (err) {
        console.error("Error fetching pending replies:", err);
        return new Response(JSON.stringify({ success: false, error: "DB_FETCH_FAILED" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 5️⃣ kill_switch_triggered
    if (payload.action_type === "kill_switch_triggered") {
      const marketplace_id = payload.marketplace_id;
      if (!marketplace_id) return json400("NO_MARKETPLACE_ID", "marketplace_id required");

      const { data: mpCheck } = await supabase
        .from("marketplaces")
        .select("user_id")
        .eq("id", marketplace_id)
        .maybeSingle();

      if (!mpCheck) return json404("MARKETPLACE_NOT_FOUND", "no such marketplace");

      await supabase.from("marketplaces").update({ kill_switch_enabled: true }).eq("id", marketplace_id);

      console.warn("[kill_switch] activated for marketplace", marketplace_id);
      return jsonOK({ success: true, message: "Kill-switch activated" });
    }

    // fallback
    return jsonOK({ success: true, message: "No-op / fallback branch executed" });
  } catch (err: any) {
    console.error("[fallback-webhook] error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: String(err?.message || err),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// --- Ответы JSON ---
function jsonOK(data: any) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function json400(code: string, message: string) {
  return new Response(JSON.stringify({ success: false, error: code, message }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function json403(code: string, message: string) {
  return new Response(JSON.stringify({ success: false, error: code, message }), {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function json404(code: string, message: string) {
  return new Response(JSON.stringify({ success: false, error: code, message }), {
    status: 404,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
