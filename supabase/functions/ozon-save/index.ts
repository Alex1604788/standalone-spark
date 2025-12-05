// functions/ozon-save/index.ts
// redeploy stamp: 2025-11-05
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Собираем CORS под конкретный запрос */
function buildCors(req: Request) {
  const origin = req.headers.get("Origin") ?? "*";
  const acrh =
    req.headers.get("Access-Control-Request-Headers") ?? "authorization, x-client-info, apikey, content-type";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": acrh,
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

/** Добавляем CORS в любой Response */
function withCors(resp: Response, cors: Record<string, string>) {
  const h = new Headers(resp.headers);
  for (const [k, v] of Object.entries(cors)) h.set(k, v);
  return new Response(resp.body, { status: resp.status, headers: h });
}

serve(async (req) => {
  const cors = buildCors(req);

  // ✅ preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  // --- env / client ---
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return withCors(
      new Response(
        JSON.stringify({
          success: false,
          error: "internal_config_missing",
          message: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured in environment",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
      cors,
    );
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    if (req.method !== "POST") {
      return withCors(
        new Response(JSON.stringify({ success: false, error: "method_not_allowed" }), {
          status: 405,
          headers: { "Content-Type": "application/json" },
        }),
        cors,
      );
    }

    const body = await req.json();
    const marketplace_id = (body.marketplace_id ?? "").toString().trim();
    const client_id = (body.client_id ?? "").toString().trim();
    const api_key = (body.api_key ?? "").toString().trim();

    if (!marketplace_id || !client_id || !api_key) {
      return withCors(
        new Response(
          JSON.stringify({
            success: false,
            error: "missing_fields",
            message: "marketplace_id, client_id, api_key required",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
        cors,
      );
    }

    // Проверяем наличие marketplace
    const { data: mp, error: mpErr } = await sb
      .from("marketplaces")
      .select("id")
      .eq("id", marketplace_id)
      .maybeSingle();
    if (mpErr) {
      return withCors(
        new Response(JSON.stringify({ success: false, error: "db_error", details: mpErr.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
        cors,
      );
    }
    if (!mp) {
      return withCors(
        new Response(JSON.stringify({ success: false, error: "marketplace_not_found" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
        cors,
      );
    }

    // Upsert cred'ов (+ статус)
    const now = new Date().toISOString();
    const { error: upErr } = await sb
      .from("ozon_credentials")
      .upsert(
        { marketplace_id, client_id, api_key, status: "active", updated_at: now },
        { onConflict: "marketplace_id" },
      );
    if (upErr) {
      return withCors(
        new Response(JSON.stringify({ success: false, error: "upsert_failed", details: upErr.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
        cors,
      );
    }

    return withCors(
      new Response(JSON.stringify({ success: true, message: "credentials_saved" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
      cors,
    );
  } catch (e: any) {
    return withCors(
      new Response(JSON.stringify({ success: false, error: "unexpected_error", details: e?.message ?? String(e) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
      cors,
    );
  }
});
