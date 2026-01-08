import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "3.0.0-model-orders-support";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OzonPerformanceRequest {
  marketplace_id: string;
  start_date?: string; // YYYY-MM-DD
  end_date?: string; // YYYY-MM-DD
  sync_period?: 'daily' | 'weekly' | 'custom'; // тип синхронизации
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
  orders_model?: number;
  revenue_model?: number;
}

// Вспомогательная функция для polling статуса отчета
async function pollReportStatus(
  uuid: string,
  accessToken: string,
  maxAttempts: number = 10,
  initialDelay: number = 5000,
  pollInterval: number = 3000
): Promise<{ success: boolean; link?: string; error?: string }> {
  // Начальная задержка
  await new Promise(resolve => setTimeout(resolve, initialDelay));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.error(`Polling attempt ${attempt}/${maxAttempts} for UUID ${uuid}`);

    const statusResponse = await fetch(`https://api-performance.ozon.ru:443/api/client/statistics/${uuid}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
    });

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      console.error(`Status check failed for UUID ${uuid}:`, errorText);
      return { success: false, error: `Status check failed: ${errorText}` };
    }

    const statusData = await statusResponse.json();
    console.error(`UUID ${uuid} status:`, statusData.state);

    if (statusData.state === "OK") {
      console.error(`Report ready! Link:`, statusData.link);
      return { success: true, link: statusData.link };
    }

    if (statusData.state === "ERROR") {
      const errorMsg = statusData.error || "Unknown error";
      console.error(`Report generation failed:`, errorMsg);
      return { success: false, error: errorMsg };
    }

    // NOT_STARTED или IN_PROGRESS - продолжаем ждать
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  return { success: false, error: `Timeout after ${maxAttempts} attempts` };
}

// Функция для скачивания и парсинга отчета
async function downloadAndParseReport(
  uuid: string,
  accessToken: string
): Promise<OzonPerformanceStats[]> {
  const reportUrl = `https://api-performance.ozon.ru:443/api/client/statistics/report?UUID=${uuid}`;

  console.error(`Downloading report from: ${reportUrl}`);

  const reportResponse = await fetch(reportUrl, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
    },
  });

  if (!reportResponse.ok) {
    const errorText = await reportResponse.text();
    throw new Error(`Failed to download report: ${errorText}`);
  }

  const contentType = reportResponse.headers.get("content-type") || "";
  console.error(`Report content-type:`, contentType);

  // Проверяем формат ответа
  if (contentType.includes("application/json")) {
    // JSON ответ
    const jsonData = await reportResponse.json();
    return jsonData.rows || [];
  } else {
    // CSV ответ - нужно распарсить
    const csvText = await reportResponse.text();
    console.error(`CSV report size: ${csvText.length} bytes`);

    // Простой CSV парсер для OZON отчетов (разделитель - точка с запятой)
    const lines = csvText.split('\n').filter(line => line.trim());

    if (lines.length < 3) {
      console.error("CSV is too short, no data rows");
      return [];
    }

    // Пропускаем первую строку (комментарий с описанием кампании) и заголовок
    const dataLines = lines.slice(2);

    const stats: OzonPerformanceStats[] = [];

    for (const line of dataLines) {
      // Пропускаем строку "Всего" и пустые строки
      if (line.includes('Всего') || line.includes('Bcero') || !line.trim()) {
        continue;
      }

      // Разбираем по точке с запятой
      const columns = line.split(';').map(col => col.trim());

      // Ожидаемая структура: [sku, name, price, views, clicks, ctr, to_cart, avg_cpc, avg_cpm, spent, orders, revenue, model_orders, model_revenue, drr, date]
      if (columns.length < 11) {
        console.error(`Skipping malformed line: ${line}`);
        continue;
      }

      const [sku, , , views, clicks, , , , , spent, orders, revenue, model_orders, model_revenue] = columns;

      // Парсим числовые значения (заменяем запятые на точки для дробных чисел)
      const parseNum = (str: string): number => {
        const cleaned = str.replace(/\s/g, '').replace(',', '.');
        return parseFloat(cleaned) || 0;
      };

      stats.push({
        date: new Date().toISOString().split('T')[0], // TODO: извлечь дату из отчета
        sku: sku || '',
        campaign_id: '', // TODO: извлечь из метаданных отчета
        money_spent: parseNum(spent),
        views: parseInt(views) || 0,
        clicks: parseInt(clicks) || 0,
        orders: parseInt(orders) || 0,
        revenue: parseNum(revenue),
        orders_model: parseInt(model_orders) || 0,
        revenue_model: parseNum(model_revenue),
      });
    }

    console.error(`Parsed ${stats.length} rows from CSV`);
    return stats;
  }
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

    const { marketplace_id, start_date, end_date, sync_period = 'custom', test = false } = await req.json() as OzonPerformanceRequest;

    if (!marketplace_id) {
      return new Response(
        JSON.stringify({ error: "marketplace_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Определяем период синхронизации
    let periodStart: Date;
    let periodEnd: Date = new Date();
    let triggerType: string = 'manual';

    if (sync_period === 'daily') {
      // Последние 3 дня
      periodStart = new Date(periodEnd.getTime() - 3 * 24 * 60 * 60 * 1000);
      triggerType = 'cron_daily';
    } else if (sync_period === 'weekly') {
      // Последние 30 дней
      periodStart = new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
      triggerType = 'cron_weekly';
    } else {
      // Кастомный период
      periodEnd = end_date ? new Date(end_date) : periodEnd;
      periodStart = start_date ? new Date(start_date) : new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
      triggerType = 'manual';
    }

    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    // Создаем запись в истории синхронизаций
    const { data: syncRecord, error: syncError } = await supabaseClient
      .from("ozon_sync_history")
      .insert({
        marketplace_id,
        status: 'in_progress',
        trigger_type: triggerType,
        period_from: formatDate(periodStart),
        period_to: formatDate(periodEnd),
        metadata: { sync_period },
      })
      .select()
      .single();

    if (syncError || !syncRecord) {
      console.error("Failed to create sync history record:", syncError);
      // Продолжаем работу даже если не удалось создать запись
    }

    const syncId = syncRecord?.id;

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
        JSON.stringify({
          success: true,
          message: "Connection successful",
          token_obtained: true,
          version: VERSION
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Получаем список кампаний
    console.error("STEP 4: Fetching campaigns list...");

    let campaignsResponse;
    try {
      campaignsResponse = await fetch("https://api-performance.ozon.ru:443/api/client/campaign", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        redirect: "follow",
      });
    } catch (err) {
      const errMsg = (err as Error).message || "Unknown error";
      console.error("Campaigns API fetch failed:", errMsg);
      return new Response(
        JSON.stringify({
          error: "Failed to fetch campaigns",
          details: errMsg
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.error("Campaigns API response status:", campaignsResponse.status);

    if (!campaignsResponse.ok) {
      const errorText = await campaignsResponse.text();
      console.error("Campaigns API error response:", errorText);
      return new Response(
        JSON.stringify({
          error: "Failed to fetch campaigns list",
          status: campaignsResponse.status,
          details: errorText
        }),
        { status: campaignsResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const campaignsData = await campaignsResponse.json();
    console.error("Campaigns response data:", JSON.stringify(campaignsData).substring(0, 1000));

    // Извлекаем ID всех кампаний
    const campaignIds = (campaignsData.list || []).map((campaign: any) => campaign.id);
    console.error("Extracted campaign IDs:", JSON.stringify(campaignIds));

    if (campaignIds.length === 0) {
      console.error("No campaigns found in response!");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No advertising campaigns found in your account. Create campaigns in OZON Performance first.",
          inserted: 0
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.error(`STEP 5: Found ${campaignIds.length} campaigns`);

    // 5. Запрашиваем статистику по кампаниям (OZON ограничивает до 10 кампаний за запрос)
    console.error("STEP 6: Fetching performance data from", formatDate(periodStart), "to", formatDate(periodEnd));

    // Разбиваем кампании на chunks по 10 штук
    const chunkSize = 10;
    const campaignChunks = [];
    for (let i = 0; i < campaignIds.length; i += chunkSize) {
      campaignChunks.push(campaignIds.slice(i, i + chunkSize));
    }

    console.error(`STEP 7: Split into ${campaignChunks.length} chunks (max 10 campaigns per request)`);

    let allStats: OzonPerformanceStats[] = [];
    const reportUUIDs: string[] = [];

    // Ограничение: максимум 4 chunks (40 кампаний) чтобы уложиться в 40s timeout
    const maxChunks = 4;
    const chunksToProcess = campaignChunks.slice(0, maxChunks);

    if (campaignChunks.length > maxChunks) {
      console.error(`WARNING: Too many campaigns (${campaignIds.length}). Processing only first ${maxChunks * chunkSize} campaigns.`);
    }

    // Шаг 1: Запрашиваем отчеты для всех chunks (получаем UUIDs)
    for (let i = 0; i < chunksToProcess.length; i++) {
      const chunk = chunksToProcess[i];
      console.error(`Requesting report for chunk ${i + 1}/${chunksToProcess.length} with ${chunk.length} campaigns`);

      const reportRequest = await fetch("https://api-performance.ozon.ru:443/api/client/statistics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          campaigns: chunk,
          from: periodStart.toISOString(),
          to: periodEnd.toISOString(),
          groupBy: "DATE",
        }),
        redirect: "follow",
      }).catch((err) => {
        console.error(`Report request failed for chunk ${i + 1}:`, err.message);
        throw new Error(`Failed to request report: ${err.message}`);
      });

      if (!reportRequest.ok) {
        const errorText = await reportRequest.text();
        console.error(`Report request error for chunk ${i + 1}:`, errorText);

        // Обновляем запись в истории
        if (syncId) {
          await supabaseClient
            .from("ozon_sync_history")
            .update({
              status: 'failed',
              error_message: `Failed to request report for chunk ${i + 1}: ${errorText}`,
              completed_at: new Date().toISOString(),
            })
            .eq("id", syncId);
        }

        return new Response(
          JSON.stringify({
            error: "Failed to request performance report",
            details: errorText,
            chunk: i + 1,
            total_chunks: chunksToProcess.length
          }),
          { status: reportRequest.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const reportData = await reportRequest.json();
      const uuid = reportData.UUID;

      if (!uuid) {
        console.error(`No UUID received for chunk ${i + 1}:`, reportData);

        // Обновляем запись в истории
        if (syncId) {
          await supabaseClient
            .from("ozon_sync_history")
            .update({
              status: 'failed',
              error_message: `No UUID received for chunk ${i + 1}`,
              completed_at: new Date().toISOString(),
            })
            .eq("id", syncId);
        }

        return new Response(
          JSON.stringify({
            error: "No UUID received from OZON API",
            details: reportData
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.error(`Chunk ${i + 1} UUID: ${uuid}`);
      reportUUIDs.push(uuid);
    }

    // Шаг 2: Polling и скачивание отчетов
    for (let i = 0; i < reportUUIDs.length; i++) {
      const uuid = reportUUIDs[i];
      console.error(`Polling report ${i + 1}/${reportUUIDs.length}: ${uuid}`);

      // Polling с параметрами: 5s initial, 3s interval, 10 attempts
      const pollResult = await pollReportStatus(uuid, accessToken, 10, 5000, 3000);

      if (!pollResult.success) {
        console.error(`Polling failed for UUID ${uuid}:`, pollResult.error);

        // Обновляем запись в истории
        if (syncId) {
          await supabaseClient
            .from("ozon_sync_history")
            .update({
              status: 'timeout',
              error_message: `Polling failed for UUID ${uuid}: ${pollResult.error}`,
              completed_at: new Date().toISOString(),
            })
            .eq("id", syncId);
        }

        return new Response(
          JSON.stringify({
            error: "Report polling failed",
            details: pollResult.error,
            uuid,
            report: i + 1,
            total_reports: reportUUIDs.length
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Скачиваем и парсим отчет
      try {
        const chunkStats = await downloadAndParseReport(uuid, accessToken);
        console.error(`Report ${i + 1} returned ${chunkStats.length} rows`);
        allStats = allStats.concat(chunkStats);
      } catch (err) {
        const errMsg = (err as Error).message || "Unknown error";
        console.error(`Failed to download/parse report ${uuid}:`, errMsg);

        // Обновляем запись в истории
        if (syncId) {
          await supabaseClient
            .from("ozon_sync_history")
            .update({
              status: 'failed',
              error_message: `Failed to download/parse report ${uuid}: ${errMsg}`,
              completed_at: new Date().toISOString(),
            })
            .eq("id", syncId);
        }

        return new Response(
          JSON.stringify({
            error: "Failed to download/parse report",
            details: errMsg,
            uuid
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.error(`STEP 8: Collected total ${allStats.length} stat rows from all chunks`);
    const stats = allStats;

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
      orders_model: stat.orders_model || 0,
      revenue_model: stat.revenue_model || null,
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

    // Обновляем запись в истории - успех
    if (syncId) {
      await supabaseClient
        .from("ozon_sync_history")
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          campaigns_count: campaignIds.length,
          chunks_count: chunksToProcess.length,
          rows_inserted: records.length,
          metadata: {
            sync_period,
            report_uuids: reportUUIDs,
            total_campaigns: campaignIds.length,
            processed_campaigns: chunksToProcess.length * chunkSize,
          },
        })
        .eq("id", syncId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Synchronization completed",
        version: VERSION,
        period: { from: formatDate(periodStart), to: formatDate(periodEnd) },
        campaigns: campaignIds.length,
        chunks_processed: chunksToProcess.length,
        inserted: records.length,
        sync_id: syncId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Function error:", error);

    // Более подробная информация об ошибке
    const err = error as Error;
    const errorDetails = {
      message: err.message || "Unknown error",
      name: err.name || "Error",
      cause: err.cause,
      stack: err.stack?.split('\n').slice(0, 3).join('\n'),
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
