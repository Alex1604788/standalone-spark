// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

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
    const client_id = String(body?.client_id ?? "").trim();
    const api_key = String(body?.api_key ?? "").trim();

    console.log("🔍 ozon-check: received request", {
      has_marketplace_id: !!marketplace_id,
      has_client_id: !!client_id,
      has_api_key: !!api_key,
    });

    if (!marketplace_id) {
      console.error("❌ ozon-check: marketplace_id is missing");
      return new Response(JSON.stringify({ success: false, error: "marketplace_id is required" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 400,
      });
    }

    console.log("🔍 ozon-check: credentials loaded", {
      has_client_id: !!client_id,
      has_api_key: !!api_key,
      client_id_valid: /^\d+$/.test(client_id),
    });

    if (!client_id || !/^\d+$/.test(client_id)) {
      console.error("❌ ozon-check: Invalid client_id", { client_id });
      return new Response(JSON.stringify({ success: false, error: "Invalid client_id: must be digits" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 400,
      });
    }
    if (!api_key) {
      console.error("❌ ozon-check: api_key is missing");
      return new Response(JSON.stringify({ success: false, error: "api_key is required" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 400,
      });
    }

    // ✅ Используем v4 для проверки
    const proxyUrl = Deno.env.get("OZON_PROXY_URL");
    const baseUrl =
      proxyUrl && proxyUrl.trim() !== "" ? proxyUrl.trim().replace(/\/$/, "") : "https://api-seller.ozon.ru";
    const endpoint = `${baseUrl}/v4/product/info/attributes`;

    console.log("🌐 ozon-check: calling Ozon API", { endpoint });

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Client-Id": client_id,
        "Api-Key": api_key,
        "Content-Type": "application/json",
        "x-o3-app-name": "seller", // Обязательный заголовок
      },
      body: JSON.stringify({
        limit: 1, // Минимальный лимит для проверки
        offset: 0,
        filter: {
          visibility: "ALL",
        },
      }),
    });

    console.log("📡 ozon-check: Ozon API response", {
      status: resp.status,
      ok: resp.ok,
      contentType: resp.headers.get("content-type"),
      url: resp.url, // Важно: откуда пришёл ответ
    });

    const contentType = resp.headers.get("content-type") || "";
    if (!resp.ok) {
      const text = await resp.text();
      console.error("❌ ozon-check: Ozon API error", { status: resp.status, response: text.slice(0, 200) });
      return new Response(JSON.stringify({ success: false, status: resp.status, message: text.slice(0, 200) }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: resp.status,
      });
    }

    if (!contentType.includes("application/json")) {
      const text = await resp.text();
      console.error("❌ ozon-check: Non-JSON response", { contentType, response: text.slice(0, 200) });
      return new Response(JSON.stringify({ success: false, status: resp.status, message: text.slice(0, 200) }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: resp.status,
      });
    }

    console.log("✅ ozon-check: Success");
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 200,
    });
  } catch (e: any) {
    console.error("❌ ozon-check: Unexpected error", { error: e?.message, stack: e?.stack });
    return new Response(JSON.stringify({ success: false, error: e?.message || "Unknown error" }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 500,
    });
  }
});
