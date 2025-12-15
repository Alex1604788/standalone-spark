/**
 * OZON Performance API Sync Function
 * Version: 2.1.0-zip-support
 * Date: 2025-12-15
 *
 * Key features:
 * - ZIP archive extraction support
 * - Sequential processing (1 chunk = 10 campaigns max) - OZON API limit!
 * - Async report generation with UUID polling
 * - Sync history tracking for partial sync support
 * - All OZON endpoints use redirect: "follow" for 307 redirects
 * - Proper campaign_id extraction from reports
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unzip } from "https://deno.land/x/zip@v1.2.5/mod.ts";

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
  add_to_cart?: number;
  avg_bill?: number;
}

interface CampaignInfo {
  id: string;
  name: string;
  type: string;
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
      redirect: "follow",
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

// Функция для скачивания и парсинга отчета (с поддержкой ZIP)
async function downloadAndParseReport(
  uuid: string,
  accessToken: string,
  campaignInfo: CampaignInfo
): Promise<OzonPerformanceStats[]> {
  const reportUrl = `https://api-performance.ozon.ru:443/api/client/statistics/report?UUID=${uuid}`;

  console.error(`Downloading report from: ${reportUrl}`);

  const reportResponse = await fetch(reportUrl, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
    },
    redirect: "follow",
  });

  if (!reportResponse.ok) {
    const errorText = await reportResponse.text();
    throw new Error(`Failed to download report: ${errorText}`);
  }

  const contentType = reportResponse.headers.get("content-type") || "";
  console.error(`Report content-type:`, contentType);

  let csvText = "";

  // Проверяем формат ответа
  if (contentType.includes("application/json")) {
    // JSON ответ
    const jsonData = await reportResponse.json();
    return jsonData.rows || [];
  } else if (contentType.includes("application/zip") || contentType.includes("application/octet-stream")) {
    // ZIP архив - нужно распаковать
    console.error("Report is a ZIP archive, extracting...");

    const zipBytes = await reportResponse.arrayBuffer();
    const zipData = new Uint8Array(zipBytes);

    try {
      // Создаем временный файл для ZIP
      const tempZipPath = `/tmp/ozon_report_${uuid}.zip`;
      await Deno.writeFile(tempZipPath, zipData);

      // Распаковываем
      const tempExtractPath = `/tmp/ozon_report_${uuid}_extracted`;
      await Deno.mkdir(tempExtractPath, { recursive: true });

      await unzip(tempZipPath, tempExtractPath);

      // Ищем CSV файл в распакованной папке
      const files = [];
      for await (const entry of Deno.readDir(tempExtractPath)) {
        if (entry.isFile && entry.name.endsWith('.csv')) {
          files.push(entry.name);
        }
      }

      if (files.length === 0) {
        throw new Error("No CSV file found in ZIP archive");
      }

      // Читаем первый CSV файл
      const csvPath = `${tempExtractPath}/${files[0]}`;
      console.error(`Reading CSV file: ${csvPath}`);
      csvText = await Deno.readTextFile(csvPath);

      // Очищаем временные файлы
      await Deno.remove(tempZipPath);
      await Deno.remove(tempExtractPath, { recursive: true });

    } catch (error) {
      console.error("ZIP extraction failed:", error);
      throw new Error(`Failed to extract ZIP: ${error.message}`);
    }
  } else {
    // Plain text CSV
    csvText = await reportResponse.text();
  }

  console.error(`CSV report size: ${csvText.length} bytes`);

  // Простой CSV парсер для OZON отчетов (разделитель - точка с запятой)
  const lines = csvText.split('\n').filter(line => line.trim());

  if (lines.length < 3) {
    console.error("CSV is too short, no data rows");
    return [];
  }

  // Первая строка - комментарий с метаданными кампании
  const firstLine = lines[0];
  console.error(`CSV first line (metadata): ${firstLine.substring(0, 200)}`);

  // Пропускаем заголовок (вторая строка) и начинаем с данных
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
      console.error(`Skipping malformed line (${columns.length} columns): ${line.substring(0, 100)}`);
      continue;
    }

    const [sku, productName, price, views, clicks, ctr, toCart, avgCpc, avgCpm, spent, orders, revenue, ...rest] = columns;

    // Парсим числовые значения (заменяем запятые на точки и убираем пробелы)
    const parseNum = (str: string): number => {
      const cleaned = str.replace(/\s/g, '').replace(',', '.');
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    };

    const parseInt = (str: string): number => {
      const cleaned = str.replace(/\s/g, '');
      const num = Number.parseInt(cleaned);
      return isNaN(num) ? 0 : num;
    };

    // Извлекаем дату (последний столбец или текущая дата)
    const dateStr = rest.length > 0 ? rest[rest.length - 1] : '';
    const statDate = dateStr && /\d{2}\.\d{2}\.\d{4}/.test(dateStr)
      ? dateStr.split('.').reverse().join('-') // DD.MM.YYYY -> YYYY-MM-DD
      : new Date().toISOString().split('T')[0];

    stats.push({
      date: statDate,
      sku: sku || '',
      campaign_id: campaignInfo.id,
      campaign_name: campaignInfo.name,
      campaign_type: campaignInfo.type,
      money_spent: parseNum(spent),
      views: parseInt(views),
      clicks: parseInt(clicks),
      orders: parseInt(orders),
      revenue: parseNum(revenue),
      add_to_cart: parseNum(toCart),
      avg_bill: parseNum(avgCpc),
    });
  }

  console.error(`Parsed ${stats.length} rows from CSV for campaign ${campaignInfo.name}`);
  return stats;
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
        redirect: "follow",
      }).catch((err) => {
        console.error("Token fetch failed:", err.message);
        throw new Error(`Failed to connect to OZON API: ${err.message}`);
      });

      if (tokenResponse.url && !tokenResponse.url.includes('/api/client/token')) {
        console.error("Redirected to:", tokenResponse.url);
        return new Response(
          JSON.stringify({
            error: "Invalid credentials",
            details: "The API redirected to authentication page. Please check your Client ID and Client Secret."
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

      // Сохраняем токен в базу
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await supabaseClient
        .from("marketplace_api_credentials")
        .update({ access_token: accessToken, token_expires_at: expiresAt })
        .eq("marketplace_id", marketplace_id)
        .eq("api_type", "performance");
    }

    if (test) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Connection successful",
          token_obtained: true,
          version: "2.1.0-zip-support",
          build_date: "2025-12-15"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Получаем список кампаний
    console.error("Fetching campaigns list...");

    const campaignsResponse = await fetch("https://api-performance.ozon.ru:443/api/client/campaign", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      redirect: "follow",
    });

    if (!campaignsResponse.ok) {
      const errorText = await campaignsResponse.text();
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

    // Извлекаем кампании и их метаданные
    const campaigns: CampaignInfo[] = (campaignsData.list || []).map((campaign: any) => ({
      id: campaign.id || String(campaign.campaignId || ''),
      name: campaign.title || campaign.name || 'Unknown Campaign',
      type: campaign.advObjectType || campaign.type || 'UNKNOWN'
    }));

    console.error(`Found ${campaigns.length} campaigns`);

    if (campaigns.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No advertising campaigns found in your account.",
          inserted: 0
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Запрашиваем статистику (максимум 10 кампаний за раз)
    const chunkSize = 10;
    const campaignChunks = [];
    for (let i = 0; i < campaigns.length; i += chunkSize) {
      campaignChunks.push(campaigns.slice(i, i + chunkSize));
    }

    console.error(`Split into ${campaignChunks.length} chunks`);

    let allStats: OzonPerformanceStats[] = [];

    // Обрабатываем только первый chunk (OZON API лимит)
    const maxChunks = 1;
    const chunksToProcess = campaignChunks.slice(0, maxChunks);

    if (campaignChunks.length > maxChunks) {
      console.error(`WARNING: Processing only first ${maxChunks * chunkSize} out of ${campaigns.length} campaigns.`);
    }

    // Запрашиваем отчеты
    for (let i = 0; i < chunksToProcess.length; i++) {
      const chunk = chunksToProcess[i];
      console.error(`Requesting report for chunk ${i + 1} with ${chunk.length} campaigns`);

      const campaignIds = chunk.map(c => c.id);

      const reportRequest = await fetch("https://api-performance.ozon.ru:443/api/client/statistics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          campaigns: campaignIds,
          from: periodStart.toISOString(),
          to: periodEnd.toISOString(),
          groupBy: "DATE",
        }),
        redirect: "follow",
      });

      if (!reportRequest.ok) {
        const errorText = await reportRequest.text();

        if (syncId) {
          await supabaseClient
            .from("ozon_sync_history")
            .update({
              status: 'failed',
              error_message: `Failed to request report: ${errorText}`,
              completed_at: new Date().toISOString(),
            })
            .eq("id", syncId);
        }

        return new Response(
          JSON.stringify({
            error: "Failed to request performance report",
            details: errorText
          }),
          { status: reportRequest.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const reportData = await reportRequest.json();
      const uuid = reportData.UUID;

      if (!uuid) {
        console.error(`No UUID received:`, reportData);
        return new Response(
          JSON.stringify({ error: "No UUID received from OZON API", details: reportData }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.error(`Report UUID: ${uuid}`);

      // Polling отчета
      const pollResult = await pollReportStatus(uuid, accessToken, 10, 5000, 3000);

      if (!pollResult.success) {
        if (syncId) {
          await supabaseClient
            .from("ozon_sync_history")
            .update({
              status: 'timeout',
              error_message: `Polling failed: ${pollResult.error}`,
              completed_at: new Date().toISOString(),
            })
            .eq("id", syncId);
        }

        return new Response(
          JSON.stringify({
            error: "Report polling failed",
            details: pollResult.error,
            uuid
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Скачиваем и парсим отчет для каждой кампании в chunk
      for (const campaign of chunk) {
        try {
          const chunkStats = await downloadAndParseReport(uuid, accessToken, campaign);
          console.error(`Campaign ${campaign.name} returned ${chunkStats.length} rows`);
          allStats = allStats.concat(chunkStats);
        } catch (err) {
          console.error(`Failed to parse report for campaign ${campaign.id}:`, err.message);
          // Продолжаем с другими кампаниями
        }
      }
    }

    console.error(`Collected total ${allStats.length} stat rows`);

    if (allStats.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No data for the specified period",
          inserted: 0,
          period: { from: formatDate(periodStart), to: formatDate(periodEnd) }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Сохраняем данные в базу
    const records = allStats.map((stat) => ({
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
      add_to_cart: stat.add_to_cart || null,
      avg_bill: stat.avg_bill || null,
    }));

    const { error: insertError } = await supabaseClient
      .from("ozon_performance_daily")
      .upsert(records, { onConflict: "marketplace_id,stat_date,sku,campaign_id" });

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save data", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Обновляем историю
    if (syncId) {
      await supabaseClient
        .from("ozon_sync_history")
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          campaigns_count: campaigns.length,
          chunks_count: chunksToProcess.length,
          rows_inserted: records.length,
          metadata: {
            sync_period,
            total_campaigns: campaigns.length,
            processed_campaigns: chunksToProcess.length * chunkSize,
          },
        })
        .eq("id", syncId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Synchronization completed",
        period: { from: formatDate(periodStart), to: formatDate(periodEnd) },
        campaigns: campaigns.length,
        chunks_processed: chunksToProcess.length,
        inserted: records.length,
        sync_id: syncId,
        version: "2.1.0-zip-support",
        build_date: "2025-12-15",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Function error:", error);

    const errorDetails = {
      message: error.message,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
    };

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: errorDetails,
        version: "2.1.0-zip-support",
        build_date: "2025-12-15",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
