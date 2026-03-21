/**
 * sync-ozon-finance  v3
 * Syncs finance transactions from Ozon API /v3/finance/transaction/list
 * -> table ozon_finance_daily (aggregated by offer_id + date)
 *
 * IMPORTANT: OZON API only allows queries within one calendar month.
 * For days > 31 the period is split into monthly chunks.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SALE_OP_TYPES = new Set([
  "OperationAgentDeliveredToCustomer",
  "OperationAgentDeliveredToCustomerCanceled",
  "OperationAgentDeliveredToCustomerArrowal",
  "OperationAgentStornoDeliveredToCustomer",
  "OperationAgentStornoDeliveredToCustomerCanceled",
]);

const RETURN_OP_TYPES = new Set([
  "OperationItemReturn",
  "OperationReturnGoodsFBSofRMS",
  "OperationReturnGoodsFBO",
  "OperationItemReturnAfterArbitragePositive",
  "OperationItemReturnAfterArbitrageNegative",
  "OperationAgentStornoItemReturn",
]);

const ACQUIRING_OP_TYPES = new Set([
  "MarketplaceRedistributionOfAcquiringOperation",
  "MarketplaceAcquiringOperation",
]);

interface FinanceDailyRow {
  marketplace_id: string;
  date: string;
  offer_id: string;
  sale_amount: number;
  commission: number;
  logistics_to_customer: number;
  logistics_return: number;
  acquiring: number;
  other_expenses: number;
  disbursement: number;
}

function splitIntoMonthlyChunks(
  dateFrom: Date,
  dateTo: Date
): Array<{ from: Date; to: Date }> {
  const chunks: Array<{ from: Date; to: Date }> = [];
  let current = new Date(dateFrom);
  while (current < dateTo) {
    const endOfMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59, 999);
    const chunkEnd = endOfMonth < dateTo ? endOfMonth : new Date(dateTo);
    chunks.push({ from: new Date(current), to: chunkEnd });
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1, 0, 0, 0, 0);
  }
  return chunks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const body = await req.json().catch(() => ({}));
  const { marketplace_id, days = 30, date_from, date_to } = body;
  const fmtDate  = (d: Date) => d.toISOString().split("T")[0];

  let dateTo: Date;
  let dateFrom: Date;
  if (date_from && date_to) {
    dateFrom = new Date(date_from);
    dateTo   = new Date(date_to);
  } else {
    const safeDays = Math.min(Math.max(Number(days) || 30, 1), 31);
    dateTo   = new Date();
    dateFrom = new Date(dateTo.getTime() - safeDays * 24 * 60 * 60 * 1000);
  }

  const monthChunks = splitIntoMonthlyChunks(dateFrom, dateTo);
  console.log(`Period: ${fmtDate(dateFrom)} to ${fmtDate(dateTo)}, chunks: ${monthChunks.length}`);

  let mpQuery = supabase
    .from("marketplaces")
    .select("id, api_key_encrypted, service_account_email")
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

  const results: Array<{
    marketplace_id: string;
    upserted?: number;
    operations_processed?: number;
    skipped_no_match?: number;
    chunks_processed?: number;
    error?: string;
  }> = [];

  for (const mp of mps || []) {
    try {
      const clientId = mp.service_account_email;
      const apiKey   = mp.api_key_encrypted;

      const { data: productsData } = await supabase
        .from("products")
        .select("sku, offer_id")
        .eq("marketplace_id", mp.id)
        .not("sku", "is", null)
        .not("offer_id", "is", null);

      const skuToOfferId = new Map<string, string>();
      for (const p of productsData || []) {
        if (p.sku && p.offer_id) skuToOfferId.set(String(p.sku), p.offer_id);
      }

      if (skuToOfferId.size < 10) {
        const { data: perfData } = await supabase
          .from("ozon_performance_daily")
          .select("sku, offer_id")
          .eq("marketplace_id", mp.id)
          .not("sku", "is", null)
          .not("offer_id", "is", null);
        for (const p of perfData || []) {
          if (p.sku && p.offer_id && !skuToOfferId.has(String(p.sku))) {
            skuToOfferId.set(String(p.sku), p.offer_id);
          }
        }
      }

      console.log(`Loaded ${skuToOfferId.size} SKU->offer_id mappings for mp ${mp.id}`);

      const finMap = new Map<string, FinanceDailyRow>();

      const getOrCreate = (offerId: string, date: string): FinanceDailyRow => {
        const key = `${offerId}|${date}`;
        if (!finMap.has(key)) {
          finMap.set(key, {
            marketplace_id: mp.id,
            date,
            offer_id: offerId,
            sale_amount: 0,
            commission: 0,
            logistics_to_customer: 0,
            logistics_return: 0,
            acquiring: 0,
            other_expenses: 0,
            disbursement: 0,
          });
        }
        return finMap.get(key)!;
      };

      let totalOps = 0;
      let skippedNoMatch = 0;
      let chunksProcessed = 0;

      for (const chunk of monthChunks) {
        console.log(`Processing chunk: ${chunk.from.toISOString()} to ${chunk.to.toISOString()}`);
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const resp = await fetch("https://api-seller.ozon.ru/v3/finance/transaction/list", {
            method: "POST",
            headers: {
              "Client-Id": clientId,
              "Api-Key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              filter: {
                date: {
                  from: chunk.from.toISOString(),
                  to:   chunk.to.toISOString(),
                },
                operation_type: [],
                posting_number: "",
                transaction_type: "all",
              },
              page,
              page_size: 1000,
            }),
          });

          if (!resp.ok) {
            const errText = await resp.text();
            console.error(`Finance API error ${resp.status} for chunk ${fmtDate(chunk.from)}: ${errText}`);
            break;
          }

          const json = await resp.json();
          const operations: any[] = json.result?.operations || [];
          const pageCount: number  = json.result?.page_count || 1;

          for (const op of operations) {
            totalOps++;
            const opDate = (op.operation_date || "").split(" ")[0];
            if (!opDate) continue;
            const opType: string = op.operation_type || "";
            const items: any[] = op.items || [];
            const offerIds: string[] = [];

            for (const item of items) {
              const sku = String(item.sku || "");
              if (!sku || sku === "0") continue;
              const offerId = skuToOfferId.get(sku);
              if (offerId && !offerIds.includes(offerId)) {
                offerIds.push(offerId);
              }
            }

            if (offerIds.length === 0) { skippedNoMatch++; continue; }

            const w = 1 / offerIds.length;

            for (const offerId of offerIds) {
              const row = getOrCreate(offerId, opDate);

              if (SALE_OP_TYPES.has(opType)) {
                row.sale_amount           += Number(op.accruals_for_sale || 0) * w;
                row.commission            += Number(op.sale_commission   || 0) * w;
                row.logistics_to_customer += Number(op.delivery_charge   || 0) * w;
                row.disbursement          += Number(op.amount || 0) * w;
              } else if (RETURN_OP_TYPES.has(opType)) {
                row.sale_amount      += Number(op.accruals_for_sale      || 0) * w;
                row.commission       += Number(op.sale_commission        || 0) * w;
                row.logistics_return += Number(op.return_delivery_charge || 0) * w;
                row.disbursement     += Number(op.amount || 0) * w;
              } else if (ACQUIRING_OP_TYPES.has(opType)) {
                row.acquiring    += Number(op.amount || 0) * w;
                row.disbursement += Number(op.amount || 0) * w;
              } else {
                row.other_expenses += Number(op.amount || 0) * w;
                row.disbursement   += Number(op.amount || 0) * w;
              }
            }
          }

          hasMore = page < pageCount && operations.length > 0;
          page++;
          if (hasMore) await new Promise((r) => setTimeout(r, 150));
          // Flush finMap every 50 pages to reduce memory pressure
          if (page % 50 === 0 && finMap.size > 0) {
            const flushRows = Array.from(finMap.values()).map((r) => ({
              ...r,
              sale_amount:           Math.round(r.sale_amount           * 100) / 100,
              commission:            Math.round(r.commission            * 100) / 100,
              logistics_to_customer: Math.round(r.logistics_to_customer * 100) / 100,
              logistics_return:      Math.round(r.logistics_return      * 100) / 100,
              acquiring:             Math.round(r.acquiring             * 100) / 100,
              other_expenses:        Math.round(r.other_expenses        * 100) / 100,
              disbursement:          Math.round(r.disbursement          * 100) / 100,
              synced_at:             new Date().toISOString(),
            }));
            for (let fi = 0; fi < flushRows.length; fi += 500) {
              const flushBatch = flushRows.slice(fi, fi + 500);
              const { error: flushErr } = await supabase
                .from("ozon_finance_daily")
                .upsert(flushBatch, { onConflict: "marketplace_id,date,offer_id", ignoreDuplicates: false });
              if (flushErr) throw new Error(flushErr.message);
            }
            finMap.clear();
            console.log(`Flushed at page ${page}, total ops so far: ${totalOps}`);
          }
        }

        chunksProcessed++;
        console.log(`Chunk ${fmtDate(chunk.from)} done. Ops: ${totalOps}, finMap size: ${finMap.size}`);

        // Upsert current chunk data immediately to avoid memory buildup
        if (finMap.size > 0) {
          const chunkRows = Array.from(finMap.values()).map((r) => ({
            ...r,
            sale_amount:           Math.round(r.sale_amount           * 100) / 100,
            commission:            Math.round(r.commission            * 100) / 100,
            logistics_to_customer: Math.round(r.logistics_to_customer * 100) / 100,
            logistics_return:      Math.round(r.logistics_return      * 100) / 100,
            acquiring:             Math.round(r.acquiring             * 100) / 100,
            other_expenses:        Math.round(r.other_expenses        * 100) / 100,
            disbursement:          Math.round(r.disbursement          * 100) / 100,
            synced_at:             new Date().toISOString(),
          }));
          for (let i = 0; i < chunkRows.length; i += 500) {
            const batch = chunkRows.slice(i, i + 500);
            const { error: upsertError } = await supabase
              .from("ozon_finance_daily")
              .upsert(batch, { onConflict: "marketplace_id,date,offer_id", ignoreDuplicates: false });
            if (upsertError) throw new Error(upsertError.message);
          }
          finMap.clear(); // Free memory after each chunk
        }

        if (chunksProcessed < monthChunks.length) {
          await new Promise((r) => setTimeout(r, 300));
        }
      } // end for(chunk)

      console.log(
        `Finance total: ${totalOps} ops, ${skippedNoMatch} skipped, ${chunksProcessed} chunks`
      );

      results.push({ marketplace_id: mp.id, upserted: totalOps - skippedNoMatch, operations_processed: totalOps, skipped_no_match: skippedNoMatch, chunks_processed: chunksProcessed });

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error for mp ${mp.id}: ${msg}`);
      results.push({ marketplace_id: mp.id, error: msg });
    }
  }

  return new Response(
    JSON.stringify({
      results,
      period: { from: fmtDate(dateFrom), to: fmtDate(dateTo) },
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
