import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OzonPerformanceRequest {
  marketplace_id: string;
  start_date?: string; // YYYY-MM-DD
  end_date?: string; // YYYY-MM-DD
  test?: boolean;
}

interface OzonApiCredentials {
  client_id: string;
  client_secret: string;
  access_token?: string | null;
  token_expires_at?: string | null;
}

interface OzonPerformanceStats {
  date: string; // YYYY-MM-DD
  sku: string;
  offer_id?: string;
  campaign_id: string;
  campaign_name?: string;
  campaign_type?: string;
  money_spent: number;
  views: number;
  clicks: number;
  orders: number;
  revenue?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { marketplace_id, start_date, end_date, test = false } = await req.json() as OzonPerformanceRequest;

    if (!marketplace_id) {
      return new Response(
        JSON.stringify({ error: "marketplace_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Получаем credentials из базы
    const { data: creds, error: credsError } = await supabaseClient
      .from("marketplace_api_credentials")
      .select("client_id, client_secret, access_token, token_expires_at")
      .eq("marketplace_id", marketplace_id)
      .eq("api_type", "performance")
      .single();

    if (credsError || !creds) {
      return new Response(
        JSON.stringify({ error: "API credentials not found. Please configure them first." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Проверяем/обновляем токен
    let accessToken = creds.access_token;
    const tokenExpired = !creds.token_expires_at || new Date(creds.token_expires_at) <= new Date();

    if (!accessToken || tokenExpired) {
      // Получаем новый токен
      console.log("Requesting token for client_id:", creds.client_id);

      const tokenResponse = await fetch("https://api-performance.ozon.ru/api/client/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          client_id: creds.client_id,
          client_secret: creds.client_secret,
          grant_type: "client_credentials",
        }),
        redirect: "follow", // Follow redirects to detect auth errors
      }).catch((err) => {
        console.error("Token fetch failed:", err.message);
        throw new Error(`Failed to connect to OZON API: ${err.message}`);
      });

      // Check if we were redirected to login page
      if (tokenResponse.url && !tokenResponse.url.includes('/api/client/token')) {
        console.error("Redirected to:", tokenResponse.url);
        return new Response(
          JSON.stringify({
            error: "Invalid credentials",
            details: "The API redirected to authentication page. Please check your Client ID and Client Secret are correct for OZON Performance API."
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error("Token error:", errorText);
        return new Response(
          JSON.stringify({ error: "Failed to obtain access token", details: errorText }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tokenData = await tokenResponse.json();
      accessToken = tokenData.access_token;

      // Сохраняем токен в базу (expires через 30 минут)
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await supabaseClient
        .from("marketplace_api_credentials")
        .update({ access_token: accessToken, token_expires_at: expiresAt })
        .eq("marketplace_id", marketplace_id)
        .eq("api_type", "performance");
    }

    if (test) {
      // Тестовый режим - просто проверяем подключение
      return new Response(
        JSON.stringify({ success: true, message: "Connection successful", token_obtained: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Определяем период для запроса
    const endDateObj = end_date ? new Date(end_date) : new Date();
    const startDateObj = start_date ? new Date(start_date) : new Date(endDateObj.getTime() - 7 * 24 * 60 * 60 * 1000); // По умолчанию 7 дней

    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    // 4. Получаем список кампаний
    console.log("Fetching campaigns list...");

    const campaignsResponse = await fetch("https://api-performance.ozon.ru:443/api/client/campaign", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      redirect: "follow",
    }).catch((err) => {
      console.error("Campaigns API fetch failed:", err.message);
      throw new Error(`Failed to fetch campaigns: ${err.message}`);
    });

    if (!campaignsResponse.ok) {
      const errorText = await campaignsResponse.text();
      console.error("Campaigns API error:", errorText);
      return new Response(
        JSON.stringify({
          error: "Failed to fetch campaigns list",
          details: errorText
        }),
        { status: campaignsResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const campaignsData = await campaignsResponse.json();
    console.log("Campaigns response:", JSON.stringify(campaignsData));

    // Извлекаем ID всех кампаний
    const campaignIds = (campaignsData.list || []).map((campaign: any) => campaign.id);

    if (campaignIds.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No advertising campaigns found in your account. Create campaigns in OZON Performance first.",
          inserted: 0
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${campaignIds.length} campaigns:`, campaignIds);

    // 5. Запрашиваем статистику по кампаниям из OZON Performance API (JSON endpoint)
    console.log("Fetching performance data from", formatDate(startDateObj), "to", formatDate(endDateObj));
    console.log("Campaigns:", campaignIds);

    const performanceResponse = await fetch("https://api-performance.ozon.ru:443/api/client/statistics/json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        campaigns: campaignIds,
        from: startDateObj.toISOString(),
        to: endDateObj.toISOString(),
        groupBy: "DATE", // Группировка по дням!
      }),
      redirect: "follow",
    }).catch((err) => {
      console.error("Performance API fetch failed:", err.message);
      throw new Error(`Failed to fetch performance data: ${err.message}`);
    });

    if (!performanceResponse.ok) {
      const errorText = await performanceResponse.text();
      console.error("Performance API error:", errorText);

      // Note: "empty campaign" error should not occur now that we fetch campaign IDs first
      if (errorText.includes("empty campaign")) {
        return new Response(
          JSON.stringify({
            error: "Empty campaign error occurred despite fetching campaign list",
            details: errorText,
            campaigns_sent: campaignIds
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Failed to fetch performance data", details: errorText }),
        { status: performanceResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const performanceData = await performanceResponse.json();
    console.log("Performance API response:", JSON.stringify(performanceData).substring(0, 500));

    // Проверяем, вернул ли API UUID (асинхронный режим) или данные напрямую
    if (performanceData.UUID) {
      // API работает асинхронно - вернул UUID вместо данных
      return new Response(
        JSON.stringify({
          success: false,
          error: "OZON API returned UUID (async mode)",
          details: "The API requires polling. UUID: " + performanceData.UUID,
          uuid: performanceData.UUID,
          message: "JSON endpoint also works asynchronously. Need to implement polling logic."
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stats: OzonPerformanceStats[] = performanceData.rows || [];

    if (stats.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No data for the specified period", inserted: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Сохраняем данные в базу
    const records = stats.map((stat) => ({
      marketplace_id,
      stat_date: stat.date,
      sku: stat.sku,
      offer_id: stat.offer_id || null,
      campaign_id: stat.campaign_id,
      campaign_name: stat.campaign_name || null,
      campaign_type: stat.campaign_type || null,
      money_spent: stat.money_spent || 0,
      views: stat.views || 0,
      clicks: stat.clicks || 0,
      orders: stat.orders || 0,
      revenue: stat.revenue || null,
      // CTR, CPC, conversion, DRR будут рассчитаны триггером
    }));

    const { error: insertError, count } = await supabaseClient
      .from("ozon_performance_daily")
      .upsert(records, { onConflict: "marketplace_id,stat_date,sku,campaign_id" });

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save data", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Synchronization completed",
        period: { from: formatDate(startDateObj), to: formatDate(endDateObj) },
        inserted: records.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Function error:", error);

    // Более подробная информация об ошибке
    const errorDetails = {
      message: error.message,
      name: error.name,
      cause: error.cause,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
    };

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: errorDetails
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
