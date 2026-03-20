/**
 * sync-ozon-analytics
 * Синхронизирует аналитику из Ozon API /v1/analytics/data
 * → таблица ozon_analytics_daily
 *
 * Вызов:
 *   POST { marketplace_id?, date_from?, date_to?, days? }
 *   Без параметров — синхронизирует все маркетплейсы за последние 2 дня
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Метрики которые запрашиваем у Ozon
const METRICS = [
  "session_view",
  "percent_session_to_pdp",
  "percent_pdp_to_cart",
  "percent_cart_to_order",
  "percent_order_to_buy",
  "percent_pdp_to_order",
  "ordered_cnt",
  "ordered_amount",
  "bought_cnt",
  "bought_amount",
  "returned_cnt",
  "cancelled_cnt",
  "adv_views",
  "adv_clicks",
  "adv_carts",
  "adv_orders",
  "adv_revenue",
  "adv_expenses",
  "adv_cpc",
  "adv_cpm",
  "adv_cpcart",
  "adv_cpo",
  "adv_cpo_general",
  "percent_ctr",
  "percent_drr",
  "percent_adv_drr",
  "price_seller",
  "price_ozon",
  "price_index",
  "content_rating",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const body = await req.json().catch(() => ({}));
  const {
    marketplace_id,
    date_from,
    date_to,
    days = 2,
  } = body;

  const today = new Date().toISOString().split("T")[0];
  const defaultFrom = new Date(Date.now() - days * 86400000)
    .toISOString()
    .split("T")[0];

  const syncFrom = date_from || defaultFrom;
  const syncTo = date_to || today;

  console.log(`Sync analytics ${syncFrom} → ${syncTo}`);

  // Получаем маркетплейсы
  let mpQuery = supabase
    .from("marketplaces")
    .select("id, service_account_email, api_key_encrypted")
    .eq("is_active", true)
    .not("api_key_encrypted", "is", null);

  if (marketplace_id) {
    mpQuery = mpQuery.eq("id", marketplace_id);
  }

  const { data: mps, error: mpError } = await mpQuery;
  if (mpError) {
    return new Response(JSON.stringify({ error: mpError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<{ marketplace_id: string; upserted?: number; error?: string }> = [];

  for (const mp of mps || []) {
    try {
      const clientId = mp.service_account_email;
      const apiKey = mp.api_key_encrypted;

      // Пагинация: Ozon возвращает макс 1000 строк за раз
      let offset = 0;
      let totalUpserted = 0;

      while (true) {
        const ozonResp = await fetch("https://api-seller.ozon.ru/v1/analytics/data", {
          method: "POST",
          headers: {
            "Client-Id": clientId,
            "Api-Key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            date_from: syncFrom,
            date_to: syncTo,
            metrics: METRICS,
            dimension: ["offer_id", "day"],
            filters: [],
            limit: 1000,
            offset,
          }),
        });

        if (!ozonResp.ok) {
          const errText = await ozonResp.text();
          console.error(`Ozon API error for mp ${mp.id}: ${errText}`);
          results.push({ marketplace_id: mp.id, error: errText });
          break;
        }

        const { result } = await ozonResp.json();
        const rawData = result?.data || [];

        if (rawData.length === 0) break;

        // Преобразуем в строки для upsert
        const rows = rawData.map((row: { dimensions: Array<{ id: string }>; metrics: number[] }) => {
          const offer_id = row.dimensions?.[0]?.id || "";
          const date = row.dimensions?.[1]?.id || syncFrom;

          const obj: Record<string, unknown> = {
            marketplace_id: mp.id,
            offer_id,
            date,
          };

          METRICS.forEach((metric, i) => {
            const val = row.metrics?.[i];
            obj[metric] = val !== undefined && val !== null ? val : null;
          });

          return obj;
        });

        // Upsert батчами по 500
        for (let i = 0; i < rows.length; i += 500) {
          const batch = rows.slice(i, i + 500);
          const { error: upsertError } = await supabase
            .from("ozon_analytics_daily")
            .upsert(batch, { onConflict: "marketplace_id,offer_id,date" });

          if (upsertError) {
            console.error(`Upsert error: ${upsertError.message}`);
            throw new Error(upsertError.message);
          }
          totalUpserted += batch.length;
        }

        console.log(`mp ${mp.id}: offset=${offset}, got=${rawData.length}, total=${totalUpserted}`);

        if (rawData.length < 1000) break;
        offset += 1000;
      }

      results.push({ marketplace_id: mp.id, upserted: totalUpserted });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error for mp ${mp.id}: ${msg}`);
      results.push({ marketplace_id: mp.id, error: msg });
    }
  }

  return new Response(JSON.stringify({ results, syncFrom, syncTo }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
