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

      // stockMap: ключ = offer_id (одна строка на товар в БД)
      const stockMap = new Map<string, { offer_id: string; skus: string[]; fbo: number; fbs: number }>();

      // ── Шаг 1: FBO остатки (/v2/analytics/stock_on_warehouses) ─────────────
      // Этот эндпоинт возвращает ТОЛЬКО склады FBO (РФЦ Ozon).
      // Поле warehouse_type в ответе отсутствует — все строки являются FBO.
      // Суммируем free_to_sell_amount + reserved_amount по всем складам.
      {
        let offset = 0;
        while (true) {
          const resp = await fetch("https://api-seller.ozon.ru/v2/analytics/stock_on_warehouses", {
            method: "POST",
            headers: {
              "Client-Id": clientId,
              "Api-Key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ limit: 1000, offset, warehouse_type: "ALL" }),
          });

          if (!resp.ok) {
            console.error(`FBO API error ${resp.status}: ${await resp.text()}`);
            break;
          }

          const json = await resp.json();
          const rows = json.result?.rows || [];
          if (rows.length === 0) break;

          for (const row of rows) {
            const offerId = row.item_code;
            const sku = String(row.sku || "");
            const entry = stockMap.get(offerId) || { offer_id: offerId, skus: [], fbo: 0, fbs: 0 };
            if (sku && !entry.skus.includes(sku)) entry.skus.push(sku);
            // Все склады этого эндпоинта — FBO (Ozon РФЦ)
            entry.fbo += (row.free_to_sell_amount || 0) + (row.reserved_amount || 0);
            stockMap.set(offerId, entry);
          }

          if (rows.length < 1000) break;
          offset += 1000;
        }
        console.log(`FBO sync done: ${stockMap.size} products`);
      }

      // ── Шаг 2: FBS остатки (/v3/product/info/stocks) ──────────────────────
      // Этот эндпоинт возвращает явные типы "fbo" и "fbs".
      // Используем только FBS (at seller's warehouse), FBO уже получили выше.
      // ВАЖНО: API изменился — данные теперь в json.items (не json.result.items),
      //         пагинация через cursor (не last_id).
      {
        let cursor = "";
        while (true) {
          const resp = await fetch("https://api-seller.ozon.ru/v4/product/info/stocks", {
            method: "POST",
            headers: {
              "Client-Id": clientId,
              "Api-Key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              filter: { visibility: "ALL" },
              cursor,
              limit: 1000,
            }),
          });

          if (!resp.ok) {
            console.error(`FBS API error ${resp.status}: ${await resp.text()}`);
            break;
          }

          const json = await resp.json();
          // Ответ приходит как { items: [...], cursor: "...", total: N }
          // (ранее был { result: { items: [...], last_id: "..." } })
          const items: Array<{
            offer_id: string;
            sku?: number | string;
            stocks?: Array<{ type: string; present?: number; reserved?: number }>;
          }> = json.items || json.result?.items || [];
          if (items.length === 0) break;

          for (const item of items) {
            const offerId = item.offer_id;
            const entry = stockMap.get(offerId) || { offer_id: offerId, skus: [], fbo: 0, fbs: 0 };
            if (item.sku && !entry.skus.includes(String(item.sku))) {
              entry.skus.push(String(item.sku));
            }
            for (const stock of item.stocks || []) {
              const t = (stock.type || "").toLowerCase();
              if (t === "fbs") entry.fbs += (stock.present || 0) + (stock.reserved || 0);
              // fbo из этого эндпоинта не берём — уже точнее получили выше
            }
            stockMap.set(offerId, entry);
          }

          // Cursor-based пагинация (новый формат) + fallback на last_id (старый)
          cursor = json.cursor || json.result?.last_id || "";
          if (items.length < 1000 || !cursor) break;
        }
        console.log(`FBS sync done: ${stockMap.size} products total`);
      }

      if (stockMap.size === 0) {
        results.push({ marketplace_id: mp.id, upserted: 0 });
        continue;
      }

      // Формируем строки: одна строка на offer_id (агрегировано по всем SKU)
      // sku = первый SKU (для маппинга sku→offer_id в аналитике)
      const rows = Array.from(stockMap.values()).map((s) => ({
        marketplace_id: mp.id,
        offer_id: s.offer_id,
        sku: s.skus[0] || null,
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
