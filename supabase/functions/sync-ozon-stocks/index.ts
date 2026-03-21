/**
 * sync-ozon-stocks
 * Синхронизирует остатки FBO/FBS из Ozon API
 * → таблица ozon_stocks_daily (снимок на текущий день)
 *
 * Вызов:
 *   POST { marketplace_id? }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const body = await req.json().catch(() => ({}));
  const { marketplace_id } = body;

  const today = new Date().toISOString().split("T")[0];

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

      // Агрегированные остатки: ключ = offer_id+sku (один товар может иметь 2 SKU)
      // offer_id — артикул продавца (уникален для товара)
      // sku — код Ozon (может быть 2 на товар: основной + уценённый)
      const stockMap = new Map<string, { offer_id: string; sku: string; fbo: number; fbs: number }>();

      // FBO остатки через /v2/analytics/stock_on_warehouses
      let offset = 0;
      while (true) {
        const resp = await fetch("https://api-seller.ozon.ru/v2/analytics/stock_on_warehouses", {
          method: "POST",
          headers: {
            "Client-Id": clientId,
            "Api-Key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            limit: 1000,
            offset,
            warehouse_type: "ALL",
          }),
        });

        if (!resp.ok) {
          const err = await resp.text();
          throw new Error(`Ozon stocks API: ${err}`);
        }

        const json = await resp.json();
        const rows = json.result?.rows || [];
        if (rows.length === 0) break;

        for (const row of rows) {
          const offerId = row.item_code; // артикул продавца
          const sku = String(row.sku || "");
          // Ключ = offer_id + sku, чтобы хранить каждый SKU отдельно
          // (уценённый товар у Ozon имеет тот же offer_id, но другой sku)
          const key = `${offerId}::${sku}`;
          const existing = stockMap.get(key) || { offer_id: offerId, sku, fbo: 0, fbs: 0 };

          if (row.warehouse_name?.includes("FBO") || row.warehouse_type === "FBO") {
            existing.fbo += (row.free_to_sell_amount || 0) + (row.reserved_amount || 0);
          } else {
            existing.fbs += (row.free_to_sell_amount || 0) + (row.reserved_amount || 0);
          }

          stockMap.set(key, existing);
        }

        if (rows.length < 1000) break;
        offset += 1000;
      }

      // Если нет данных из /v2, пробуем /v3/product/info/stocks
      if (stockMap.size === 0) {
        const resp = await fetch("https://api-seller.ozon.ru/v3/product/info/stocks", {
          method: "POST",
          headers: {
            "Client-Id": clientId,
            "Api-Key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ filter: { visibility: "ALL" }, last_id: "", limit: 1000 }),
        });

        if (resp.ok) {
          const json = await resp.json();
          for (const item of json.result?.items || []) {
            const key = item.offer_id;
            let fbo = 0;
            let fbs = 0;

            for (const stock of item.stocks || []) {
              if (stock.type === "fbo") fbo += stock.present || 0;
              if (stock.type === "fbs") fbs += stock.present || 0;
            }

            stockMap.set(key, { offer_id: key, sku: "", fbo, fbs });
          }
        }
      }

      if (stockMap.size === 0) {
        results.push({ marketplace_id: mp.id, upserted: 0 });
        continue;
      }

      // Формируем строки
      const rows = Array.from(stockMap.values()).map((s) => ({
        marketplace_id: mp.id,
        offer_id: s.offer_id,
        sku: s.sku || null,
        date: today,
        fbo_stocks: s.fbo,
        fbs_stocks: s.fbs,
      }));

      // Upsert батчами
      let totalUpserted = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { error: upsertError } = await supabase
          .from("ozon_stocks_daily")
          .upsert(batch, { onConflict: "marketplace_id,offer_id,date" });

        if (upsertError) throw new Error(upsertError.message);
        totalUpserted += batch.length;
      }

      results.push({ marketplace_id: mp.id, upserted: totalUpserted });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error for mp ${mp.id}: ${msg}`);
      results.push({ marketplace_id: mp.id, error: msg });
    }
  }

  return new Response(JSON.stringify({ results, date: today }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
