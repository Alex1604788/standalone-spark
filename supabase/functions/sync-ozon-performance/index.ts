/**
 * OZON Performance API Sync Function
 * Version: 2.2.3-deduplicate-cumulative-snapshots
 * Date: 2025-12-18
 *
 * Key features:
 * - ZIP archive extraction support (in-memory using JSZip)
 * - Individual report requests per campaign (not batch!) - Fixes duplicate key violations
 * - Processes 5 campaigns per sync (reduced from 10) to avoid Supabase timeout (150s limit)
 * - Deduplicates cumulative snapshots - keeps last row (end-of-day data at 00:00 MSK)
 * - Async report generation with UUID polling (40 attempts, ~3.5min timeout)
 * - Sync history tracking for partial sync support
 * - All OZON endpoints use redirect: "follow" for 307 redirects
 * - Proper campaign_id extraction from reports
 * - Fixed: add_to_cart now uses parseInt for INTEGER column compatibility
 * - Fixed: Increased polling timeout for large reports (30+ campaigns)
 * - Fixed: Request individual reports per campaign to avoid OZON returning same data for all
 * - Fixed: Use UUID instead of pollResult.link to avoid double URL construction
 * - Fixed: Reduced chunk size to 5 to stay under Supabase Edge Function timeout
 * - Fixed: Deduplicate rows within CSV - OZON returns cumulative snapshots, we keep the last one
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

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
  maxAttempts: number = 40,      // Increased from 10 to 40 for large reports (30+ campaigns)
  initialDelay: number = 10000,  // Increased from 5s to 10s - OZON needs time to start processing
  pollInterval: number = 5000    // Increased from 3s to 5s - total timeout ~3.5 minutes
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
    // ZIP архив - распаковываем в памяти (без файлов на диске)
    console.error("Report is a ZIP archive, extracting in-memory...");

    try {
      const zipBytes = await reportResponse.arrayBuffer();

      // Загружаем ZIP в JSZip
      const zip = await JSZip.loadAsync(zipBytes);

      // Ищем CSV файл в архиве
      const csvFiles = Object.keys(zip.files).filter(name =>
        name.endsWith('.csv') && !zip.files[name].dir
      );

      if (csvFiles.length === 0) {
        throw new Error("No CSV file found in ZIP archive");
      }

      // Читаем первый CSV файл
      const csvFileName = csvFiles[0];
      console.error(`Extracting CSV file: ${csvFileName}`);

      csvText = await zip.files[csvFileName].async("text");
      console.error(`Extracted CSV size: ${csvText.length} bytes`);

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
      add_to_cart: parseInt(toCart),  // Fixed: use parseInt for INTEGER column
      avg_bill: parseNum(avgCpc),
    });
  }

  console.error(`Parsed ${stats.length} rows from CSV for campaign ${campaignInfo.name}`);
  return stats;
}

// Функция дедупликации: убирает дубликаты, оставляя последнюю строку
// OZON возвращает кумулятивные снимки данных в течение дня
// Последняя строка = финальное состояние на конец дня (00:00 МСК)
function deduplicateStats(rows: OzonPerformanceStats[]): OzonPerformanceStats[] {
  const grouped = new Map<string, OzonPerformanceStats>();

  for (const row of rows) {
    // Ключ: дата + SKU + кампания
    const key = `${row.date}_${row.sku}_${row.campaign_id}`;

    // Просто перезаписываем - последняя строка побеждает
    grouped.set(key, row);
  }

  return Array.from(grouped.values());
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
          version: "2.2.3-deduplicate-cumulative-snapshots",
          build_date: "2025-12-18"
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

    // 5. Запрашиваем статистику (максимум 5 кампаний за раз - Supabase timeout limit!)
    const chunkSize = 5;  // Reduced from 10 to avoid Edge Function timeout (150s limit)
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

    // Запрашиваем отчеты ИНДИВИДУАЛЬНО для каждой кампании
    // Fix: OZON returns same report for all campaigns when requested in batch
    for (let i = 0; i < chunksToProcess.length; i++) {
      const chunk = chunksToProcess[i];
      console.error(`Processing chunk ${i + 1} with ${chunk.length} campaigns`);

      // Обрабатываем каждую кампанию ОТДЕЛЬНО
      for (const campaign of chunk) {
        console.error(`Requesting individual report for campaign: ${campaign.name} (ID: ${campaign.id})`);

        const reportRequest = await fetch("https://api-performance.ozon.ru:443/api/client/statistics", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            campaigns: [campaign.id],  // Single campaign only! Not array of all campaigns
            from: periodStart.toISOString(),
            to: periodEnd.toISOString(),
            groupBy: "DATE",
          }),
          redirect: "follow",
        });

        if (!reportRequest.ok) {
          const errorText = await reportRequest.text();
          console.error(`Failed to request report for campaign ${campaign.name}:`, errorText);
          continue;  // Skip this campaign, continue with next one
        }

        const reportData = await reportRequest.json();
        const uuid = reportData.UUID;

        if (!uuid) {
          console.error(`No UUID received for campaign ${campaign.name}:`, reportData);
          continue;  // Skip this campaign
        }

        console.error(`Report UUID for campaign ${campaign.name}: ${uuid}`);

        // Polling отчета (uses default params: 40 attempts, 10s initial delay, 5s interval)
        const pollResult = await pollReportStatus(uuid, accessToken);

        if (!pollResult.success) {
          console.error(`Polling failed for campaign ${campaign.name}:`, pollResult.error);
          continue;  // Skip this campaign
        }

        // Скачиваем и парсим отчет для ЭТОЙ кампании (не для всех!)
        try {
          const campaignStats = await downloadAndParseReport(uuid, accessToken, campaign);
          console.error(`Campaign ${campaign.name} returned ${campaignStats.length} rows`);
          allStats = allStats.concat(campaignStats);
        } catch (err) {
          console.error(`Failed to parse report for campaign ${campaign.name}:`, err.message);
          // Продолжаем со следующей кампанией
        }
      }
    }

    console.error(`Collected total ${allStats.length} stat rows`);

    // Дедупликация: убираем дубликаты, оставляя последнюю строку для каждого (date, sku, campaign_id)
    // OZON возвращает кумулятивные снимки в течение дня - берём финальные данные на 00:00 МСК
    const deduplicatedStats = deduplicateStats(allStats);
    console.error(`After deduplication: ${deduplicatedStats.length} unique rows (removed ${allStats.length - deduplicatedStats.length} duplicates)`);

    if (deduplicatedStats.length === 0) {
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

    // Сохраняем дедуплицированные данные в базу
    const records = deduplicatedStats.map((stat) => ({
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
        version: "2.2.3-deduplicate-cumulative-snapshots",
        build_date: "2025-12-18",
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
        version: "2.2.3-deduplicate-cumulative-snapshots",
        build_date: "2025-12-18",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
