/**
 * sync-ozon-analytics
 * Синхронизирует аналитику из Ozon API /v1/analytics/data
 * → таблица ozon_analytics_daily
 *
 * Логика:
 *   1. Строим маппинг sku → offer_id из ozon_stocks_daily
 *   2. Запрашиваем аналитику по dimension=["sku","day"]
 *   3. Конвертируем sku → offer_id (seller article)
 *   4. Агрегируем если у одного offer_id несколько SKU (уценённый товар)
 *
 * Вызов:
 *   POST { marketplace_id?, date_from?, date_to?, days? }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Реально поддерживаемые метрики Ozon API /v1/analytics/data.
// ВАЖНО: API молча отбрасывает неподдерживаемые метрики и сдвигает индексы!
// Проверено: conv_topurchase_pdp и bought_in_ozon_orders НЕ возвращаются.
// Порядок строго соответствует позициям в массиве metrics в ответе API.
const METRICS = [
  "ordered_units",          // 0 - заказано штук
  "revenue",                // 1 - выручка от заказов (руб)
  "cancellations",          // 2 - отмены
  "returns",                // 3 - возвраты
  "session_view",           // 4 - сессии с просмотром товара
  "session_view_pdp",       // 5 - просмотры карточки товара
  "conv_tocart_pdp",        // 6 - % добавлений в корзину с карточки
  "hits_view",              // 7 - всего просмотров (хиты)
];

const METRIC_COLUMNS = [
  "ordered_units",
  "revenue",
  "cancellations",
  "returns",
  "session_view",
  "session_view_pdp",
  "conv_tocart_pdp",
  "hits_view",
];

// Метрики которые нужно СУММИРОВАТЬ при агрегации нескольких SKU одного offer_id
const SUM_METRICS = new Set(["ordered_units","revenue","cancellations","returns","session_view","session_view_pdp","hits_view"]);
// Метрики которые нужно УСРЕДНЯТЬ (проценты/конверсии)
const AVG_METRICS = new Set(["conv_tocart_pdp"]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const body = await req.json().catch(() => ({}));
  const { marketplace_id, date_from, date_to, days = 2 } = body;

  const today = new Date().toISOString().split("T")[0];
  const defaultFrom = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
  const syncFrom = date_from || defaultFrom;
  const syncTo = date_to || today;

  console.log(`Sync analytics ${syncFrom} → ${syncTo}`);

  // Получаем маркетплейсы
  let mpQuery = supabase
    .from("marketplaces")
    .select("id, service_account_email, api_key_encrypted")
    .eq("is_active", true)
    .not("api_key_encrypted", "is", null);

  if (marketplace_id) mpQuery = mpQuery.eq("id", marketplace_id);

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

      // ── Шаг 1: Строим маппинг sku → offer_id из таблицы остатков ──────────
      // Берём самые свежие записи с непустым sku
      const { data: stockRows } = await supabase
        .from("ozon_stocks_daily")
        .select("sku, offer_id")
        .eq("marketplace_id", mp.id)
        .not("sku", "is", null)
        .order("date", { ascending: false })
        .limit(10000);

      const skuToOffer = new Map<string, string>(); // sku → offer_id
      for (const row of stockRows || []) {
        if (row.sku && row.offer_id && !skuToOffer.has(String(row.sku))) {
          skuToOffer.set(String(row.sku), row.offer_id);
        }
      }
      console.log(`Built sku→offer_id map: ${skuToOffer.size} entries`);

      // ── Шаг 2: Запрашиваем аналитику из Ozon ─────────────────────────────
      // Буфер: агрегируем по offer_id+date (несколько SKU → один offer_id)
      // key = "offer_id::date"
      type AggRow = {
        offer_id: string;
        product_name: string;
        date: string;
        metrics: (number | null)[];
        sku_count: number; // сколько SKU агрегировано (для avg)
      };
      const aggBuffer = new Map<string, AggRow>();

      let offset = 0;
      let totalFetched = 0;

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
            dimension: ["sku", "day"],
            filters: [],
            limit: 1000,
            offset,
          }),
        });

        const responseText = await ozonResp.text();

        if (!ozonResp.ok) {
          console.error(`Ozon API HTTP ${ozonResp.status}: ${responseText}`);
          results.push({ marketplace_id: mp.id, error: responseText });
          break;
        }

        let parsed: { result?: { data?: unknown[] }; code?: number; message?: string };
        try {
          parsed = JSON.parse(responseText);
        } catch {
          results.push({ marketplace_id: mp.id, error: "JSON parse error" });
          break;
        }

        if (parsed.code && parsed.code !== 0) {
          const errMsg = parsed.message || `Ozon error code ${parsed.code}`;
          console.error(errMsg);
          results.push({ marketplace_id: mp.id, error: errMsg });
          break;
        }

        type OzonRow = { dimensions: Array<{ id: string; name?: string }>; metrics: (number | null)[] };
        const rawData = (parsed.result?.data || []) as OzonRow[];
        if (rawData.length === 0) break;
        totalFetched += rawData.length;

        for (const row of rawData) {
          const sku = String(row.dimensions?.[0]?.id || "");
          const productName = row.dimensions?.[0]?.name || "";
          const date = row.dimensions?.[1]?.id || syncFrom;

          // Конвертируем sku → offer_id. Если нет в маппинге — используем sku как fallback
          const offerId = skuToOffer.get(sku) || sku;
          const key = `${offerId}::${date}`;

          const existing = aggBuffer.get(key);
          if (!existing) {
            aggBuffer.set(key, {
              offer_id: offerId,
              product_name: productName,
              date,
              metrics: row.metrics?.slice(0, METRIC_COLUMNS.length) || [],
              sku_count: 1,
            });
          } else {
            // Агрегируем метрики: суммируем счётчики, усредняем проценты
            const newMetrics = row.metrics || [];
            existing.metrics = METRIC_COLUMNS.map((col, i) => {
              const a = existing.metrics[i] ?? null;
              const b = newMetrics[i] ?? null;
              if (a === null && b === null) return null;
              if (SUM_METRICS.has(col)) return (a ?? 0) + (b ?? 0);
              if (AVG_METRICS.has(col)) {
                // Накопленное среднее: будем делить на sku_count+1 при финализации
                return ((a ?? 0) * existing.sku_count + (b ?? 0)) / (existing.sku_count + 1);
              }
              return b ?? a; // fallback — берём последнее значение
            });
            existing.sku_count += 1;
          }
        }

        console.log(`offset=${offset}, got=${rawData.length}, buffer=${aggBuffer.size}`);
        if (rawData.length < 1000) break;
        offset += 1000;
      }

      // ── Шаг 3: Upsert в базу ─────────────────────────────────────────────
      const rows = Array.from(aggBuffer.values()).map((agg) => {
        const obj: Record<string, unknown> = {
          marketplace_id: mp.id,
          offer_id: agg.offer_id,
          product_name: agg.product_name,
          date: agg.date,
        };
        METRIC_COLUMNS.forEach((col, i) => {
          obj[col] = agg.metrics[i] !== undefined ? agg.metrics[i] : null;
        });
        return obj;
      });

      let totalUpserted = 0;
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

      console.log(`Done: fetched=${totalFetched}, upserted=${totalUpserted}`);
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
