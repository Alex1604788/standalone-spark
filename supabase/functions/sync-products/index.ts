// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 405,
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const marketplace_id = String(body?.marketplace_id ?? "").trim();

    if (!marketplace_id) {
      return new Response(JSON.stringify({ success: false, error: "marketplace_id is required" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 400,
      });
    }

    // ✅ Подключаемся к Supabase
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 1. Получаем client_id и api_key из базы
    const { data: creds, error: credsError } = await supabase
      .from("ozon_credentials")
      .select("client_id, api_key")
      .eq("marketplace_id", marketplace_id)
      .maybeSingle();

    if (credsError) {
      console.error("Error fetching credentials:", credsError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch credentials", details: credsError.message }),
        { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 500 },
      );
    }

    if (!creds?.client_id || !creds?.api_key) {
      console.error("Credentials not found for marketplace_id:", marketplace_id);
      return new Response(JSON.stringify({ success: false, error: "Credentials not found for marketplace" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 400,
      });
    }

    const client_id = creds.client_id;
    const api_key = creds.api_key;

    // 2. Обновляем статус синхронизации
    await supabase
      .from("marketplaces")
      .update({ last_sync_status: "syncing", last_sync_error: null })
      .eq("id", marketplace_id);

    // 3. Получаем список товаров (v3)
    let allProducts: any[] = [];
    let last_id = "";
    let has_more = true;
    let page_count = 0;

    while (has_more) {
      page_count++;
      console.log(`Fetching page ${page_count}, last_id: ${last_id}`);

      const proxyUrl = Deno.env.get("OZON_PROXY_URL");
      const baseUrl =
        proxyUrl && proxyUrl.trim() !== "" ? proxyUrl.trim().replace(/\/$/, "") : "https://api-seller.ozon.ru";
      const endpoint = `${baseUrl}/v3/product/list`;

      const listResp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Client-Id": client_id,
          "Api-Key": api_key,
          "Content-Type": "application/json",
          "x-o3-app-name": "seller",
        },
        body: JSON.stringify({
          filter: { visibility: "ALL" },
          last_id,
          limit: 100,
        }),
      });

      const contentType = listResp.headers.get("content-type") || "";

      if (!listResp.ok) {
        const text = await listResp.text();
        console.error("❌ Ozon list error:", listResp.status, text.slice(0, 200));
        await supabase
          .from("marketplaces")
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_status: "error",
            last_sync_error: `Ozon list error (${listResp.status})`,
          })
          .eq("id", marketplace_id);

        return new Response(JSON.stringify({ success: false, error: `Ozon list error (${listResp.status})` }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: listResp.status,
        });
      }

      if (!contentType.includes("application/json")) {
        const text = await listResp.text();
        console.error("❌ Non-JSON response from Ozon:", text.slice(0, 200));
        await supabase
          .from("marketplaces")
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_status: "error",
            last_sync_error: "Non-JSON response from Ozon API",
          })
          .eq("id", marketplace_id);

        return new Response(JSON.stringify({ success: false, message: text.slice(0, 200) }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 400,
        });
      }

      const listData = await listResp.json();
      const items = listData.result?.items || [];
      allProducts = allProducts.concat(items);

      console.log(`Page ${page_count}: Fetched ${items.length} products`);

      if (items.length === 0) {
        has_more = false;
        break;
      }

      const next_last_id = listData.result?.last_id;
      if (next_last_id && next_last_id !== last_id) {
        last_id = next_last_id;
      } else {
        has_more = false;
      }
    }

    console.log(`Total products fetched: ${allProducts.length}`);

    // 4. Получаем детали по batch-ам (используем v3)
    const detailed: any[] = [];
    const batch_size = 100;

    for (let i = 0; i < allProducts.length; i += batch_size) {
      const batchItems = allProducts.slice(i, i + batch_size);
      const batchIds = batchItems.map((p: any) => p.product_id);

      console.log(`📦 Loading details for batch ${Math.floor(i / batch_size) + 1}, IDs count: ${batchIds.length}`);

      const proxyUrl2 = Deno.env.get("OZON_PROXY_URL");
      const baseUrl2 =
        proxyUrl2 && proxyUrl2.trim() !== "" ? proxyUrl2.trim().replace(/\/$/, "") : "https://api-seller.ozon.ru";
      const infoEndpoint = `${baseUrl2}/v3/product/info/list`;

      const requestBody = {
        product_id: batchIds,
      };

      console.log("🌐 sync-products: calling Ozon API details", {
        endpoint: infoEndpoint,
        batch_size: batchIds.length,
        sample_ids: batchIds.slice(0, 3), // First 3 IDs for debugging
      });
      console.log("📤 Request body:", JSON.stringify(requestBody, null, 2));

      const infoResp = await fetch(infoEndpoint, {
        method: "POST",
        headers: {
          "Client-Id": client_id,
          "Api-Key": api_key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      console.log("📡 sync-products: Ozon details response", {
        status: infoResp.status,
        ok: infoResp.ok,
        contentType: infoResp.headers.get("content-type"),
        url: infoResp.url,
      });

      if (!infoResp.ok) {
        const text = await infoResp.text();
        console.error("❌ Ozon info error:", infoResp.status, text.slice(0, 500));
        await supabase
          .from("marketplaces")
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_status: "error",
            last_sync_error: `Ozon info error (${infoResp.status})`,
          })
          .eq("id", marketplace_id);

        return new Response(JSON.stringify({ success: false, error: `Ozon info error (${infoResp.status})` }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 400,
        });
      }

      const infoData = await infoResp.json();

      // 🔍 ДЕТАЛЬНЫЙ ЛОГ для анализа дублей
      console.log(`📥 Batch ${Math.floor(i / batch_size) + 1}: получено ${infoData.items?.length || 0} items`);

      // Проверяем есть ли дубли по product_id
      const productIds = new Map();
      (infoData.items || []).forEach((item: any) => {
        const pid = String(item.id);
        if (productIds.has(pid)) {
          const first = productIds.get(pid);
          console.log(`🔍 ДУБЛЬ! product_id=${pid}`, {
            первый: { sku: first.sku, offer_id: first.offer_id, sources_count: first.sources?.length },
            второй: { sku: item.sku, offer_id: item.offer_id, sources_count: item.sources?.length },
          });
        } else {
          productIds.set(pid, { sku: item.sku, offer_id: item.offer_id, sources: item.sources });
        }
      });

      const items = infoData.items || [];
      detailed.push(...items);

      console.log(`📦 Details loaded for batch ${Math.floor(i / batch_size) + 1}: ${items.length} items`);

      await new Promise((resolve) => setTimeout(resolve, 50)); // Задержка между батчами
    }

    console.log(`✅ Total product details: ${detailed.length}`);

    // 5. Преобразуем и сохраняем в базу
    const productsToSave = detailed.map((p: any) => {
      // Извлекаем главное изображение из primary_image массива
      const primaryImage = Array.isArray(p.primary_image) && p.primary_image[0] ? p.primary_image[0] : null;
      // Извлекаем все изображения
      const imageUrls = Array.isArray(p.images) ? p.images : [];
      // Извлекаем первый штрихкод для поля barcodes (text)
      const barcode = Array.isArray(p.barcodes) && p.barcodes[0] ? p.barcodes[0] : null;

      return {
        marketplace_id,
        external_id: String(p.id),
        name: p.name || null,
        offer_id: p.offer_id || null,
        sku: p.sku ? String(p.sku) : null,
        barcodes: barcode,
        description_category_id: p.description_category_id || null,
        type_id: p.type_id || null,
        currency_code: p.currency_code || null,
        price: p.price ? parseFloat(p.price) : null,
        min_price: p.min_price ? parseFloat(p.min_price) : null,
        old_price: p.old_price ? parseFloat(p.old_price) : null,
        is_archived: p.is_archived || false,
        is_discounted: p.is_discounted || false,
        is_kgt: p.is_kgt || false,
        is_super: p.is_super || false,
        is_seasonal: p.is_seasonal || false,
        image_url: primaryImage,
        image_urls: imageUrls,
        stocks: p.stocks || null,
        commissions: p.commissions || null,
        statuses: p.statuses || null,
        vat: p.vat || null,
        volume_weight: p.volume_weight || null,
        model_info: p.model_info || null,
        sources: p.sources || null,
        price_indexes: p.price_indexes || null,
        promotions: p.promotions || null,
        created_at: p.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    console.log(`🔍 Mapping complete, products to save: ${productsToSave.length}`);

    if (productsToSave.length > 0) {
      const { error: upsertError } = await supabase
        .from("products")
        .upsert(productsToSave, { onConflict: "marketplace_id,external_id" });

      if (upsertError) {
        console.error("❌ Supabase upsert error:", upsertError.message);
        await supabase
          .from("marketplaces")
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_status: "error",
            last_sync_error: upsertError.message,
          })
          .eq("id", marketplace_id);

        return new Response(JSON.stringify({ success: false, error: upsertError.message }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 500,
        });
      }
    }

    // 6. Обновляем статус
    await supabase
      .from("marketplaces")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: "completed",
        last_sync_error: null,
      })
      .eq("id", marketplace_id);

    console.log("✅ Products synced successfully");
    return new Response(
      JSON.stringify({
        success: true,
        total: allProducts.length,
        written_rows: productsToSave.length, // ✅ Исправлено
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 200 },
    );
  } catch (e: any) {
    console.error("❌ Unexpected sync error:", e);
    return new Response(JSON.stringify({ success: false, error: e?.message || "Unknown error" }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 500,
    });
  }
});
