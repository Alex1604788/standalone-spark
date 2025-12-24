/**
 * OZON Performance API Sync Function
 * Version: 2.6.7-sequential-processing
 * Date: 2025-12-24
 *
 * Key features:
 * - ZIP archive extraction support (in-memory using JSZip)
 * - Individual report requests per campaign (not batch!) - Fixes duplicate key violations
 * - AUTOMATIC: Processes ALL campaigns automatically (all ~46 active campaigns in one run)
 * - campaign_offset parameter optional - only needed to continue from specific position
 * - Deduplicates cumulative snapshots - keeps last row (end-of-day data at 00:00 MSK)
 * - Async report generation with UUID polling (40 attempts, ~3.5min timeout)
 * - Sync history tracking for partial sync support
 * - All OZON endpoints use redirect: "follow" for 307 redirects
 * - Proper campaign_id extraction from reports
 * - Fixed: add_to_cart now uses parseInt for INTEGER column compatibility
 * - Fixed: Increased polling timeout for large reports (30+ campaigns)
 * - Fixed: Request individual reports per campaign to avoid OZON returning same data for all
 * - Fixed: Use UUID instead of pollResult.link to avoid double URL construction
 * - Fixed: Deduplicate rows within CSV - OZON returns cumulative snapshots, we keep the last one
 * - Fixed: CSV column mapping - first column is DATE, not SKU! Updated destructuring to match actual OZON CSV structure
 * - Filter: Process RUNNING + STOPPED campaigns (exclude only ARCHIVED + ENDED) - captures historical data from recently stopped campaigns
 * - Chunk size: 8 campaigns per chunk for optimal performance
 * - FIXED: Automatic processing of ALL chunks - no manual offset management needed!
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
  campaign_offset?: number; // Offset для пагинации кампаний (0, 8, 16, 24, ...)
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
  orders_model?: number;  // Заказы модели - OZON возвращает отдельно от orders
  revenue?: number;
  add_to_cart?: number;
  avg_bill?: number;
}

interface CampaignInfo {
  id: string;
  name: string;
  type: string;
  state: string; // CAMPAIGN_STATE_RUNNING, CAMPAIGN_STATE_STOPPED, CAMPAIGN_STATE_ARCHIVED, CAMPAIGN_STATE_ENDED
}

// Вспомогательная функция для polling статуса отчета
async function pollReportStatus(
  uuid: string,
  accessToken: string,
  maxAttempts: number = 15,      // Reduced from 40 to 15 - faster skip of stuck campaigns (~75sec timeout)
  initialDelay: number = 10000,  // 10s initial delay - OZON needs time to start processing
  pollInterval: number = 5000    // 5s between attempts - total timeout ~1.5 minutes per campaign
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

  // Вторая строка - заголовки столбцов
  const headerLine = lines[1];
  console.error(`CSV headers: ${headerLine}`);

  // Парсим заголовки для динамического определения позиций столбцов
  const headers = headerLine.split(';').map(h => h.trim().toLowerCase());

  // Создаем mapping колонок (обрабатываем вариации названий)
  const findColumnIndex = (names: string[]): number => {
    for (const name of names) {
      const index = headers.findIndex(h => h.includes(name.toLowerCase()));
      if (index !== -1) return index;
    }
    return -1;
  };

  // Ищем индексы столбцов по названиям
  // ВАЖНО: Нужно найти "Расход, ₽, с НДС" но не "Расход за минусом бонусов"
  // Аналогично для "Заказы" и "Продажи" - не захватить "модели" версии
  const findPrimaryColumn = (keyword: string, excludeWords: string[]): number => {
    return headers.findIndex(h => {
      const lower = h.toLowerCase();
      // Должен содержать ключевое слово
      if (!lower.includes(keyword.toLowerCase())) return false;
      // Но НЕ должен содержать слова-исключения
      for (const exclude of excludeWords) {
        if (lower.includes(exclude.toLowerCase())) return false;
      }
      return true;
    });
  };

  const colIndexes = {
    date: findColumnIndex(['день', 'дата']),
    sku: findColumnIndex(['sku']),
    productName: findColumnIndex(['название']),
    price: findColumnIndex(['цена']),
    views: findColumnIndex(['показы']),
    clicks: findColumnIndex(['клики']),
    ctr: findColumnIndex(['ctr']),
    toCart: findColumnIndex(['в корзину', 'корзину']),
    avgCpc: findColumnIndex(['cpc', 'средняя стоимость клика']),
    spent: findPrimaryColumn('расход', ['за минусом', 'бонус']),  // "Расход, ₽, с НДС" но не "Расход за минусом бонусов"
    orders: findPrimaryColumn('заказы', ['модел']),  // "Заказы" но не "Заказы модели"
    revenue: findPrimaryColumn('продажи', ['модел', 'заказов модел']),  // "Продажи, ₽" но не "Продажи с заказов модели"
    ordersModel: findColumnIndex(['заказы модели', 'заказы мод']),
    revenueFromModels: findColumnIndex(['продажи с моделей', 'продажи с зак']),
  };

  console.error(`📋 Column indexes for "${campaignInfo.name}":`, colIndexes);

  // Пропускаем заголовок (вторая строка) и начинаем с данных
  const dataLines = lines.slice(2);

  // Показываем первую строку данных для отладки
  if (dataLines.length > 0) {
    console.error(`CSV first data row: ${dataLines[0]}`);
  }

  const stats: OzonPerformanceStats[] = [];

  for (const line of dataLines) {
    // Пропускаем строку "Всего" и пустые строки
    if (line.includes('Всего') || line.includes('Bcero') || !line.trim()) {
      continue;
    }

    // Разбираем по точке с запятой
    const columns = line.split(';').map(col => col.trim());

    // ДИАГНОСТИКА: логируем первую строку для каждой кампании
    if (stats.length === 0) {
      console.error(`🔍 Campaign "${campaignInfo.name}": CSV has ${columns.length} columns`);
    }

    // Проверяем наличие обязательных столбцов
    if (colIndexes.date === -1 || colIndexes.sku === -1) {
      console.error(`⚠️  Missing required columns (date or sku) in "${campaignInfo.name}"`);
      continue;
    }

    // Извлекаем значения по индексам
    const getColumn = (index: number): string => index >= 0 && index < columns.length ? columns[index] : '';

    const dateStr = getColumn(colIndexes.date);
    const sku = getColumn(colIndexes.sku);
    const views = getColumn(colIndexes.views);
    const clicks = getColumn(colIndexes.clicks);
    const toCart = getColumn(colIndexes.toCart);
    const avgCpc = getColumn(colIndexes.avgCpc);
    const spent = getColumn(colIndexes.spent);
    const orders = getColumn(colIndexes.orders);
    const revenue = getColumn(colIndexes.revenue);
    const ordersModel = getColumn(colIndexes.ordersModel);
    const revenueFromModels = getColumn(colIndexes.revenueFromModels);

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

    // Дата уже в первом столбце (dateStr), парсим её из формата DD.MM.YYYY в YYYY-MM-DD
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
      orders_model: parseInt(ordersModel),  // Заказы модели - OZON складывает с orders в итоговой аналитике
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

    const { marketplace_id, start_date, end_date, sync_period = 'custom', campaign_offset = 0, test = false } = await req.json() as OzonPerformanceRequest;

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
          version: "2.6.4-fix-column-detection",
          build_date: "2025-12-22"
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
    const allCampaigns: CampaignInfo[] = (campaignsData.list || []).map((campaign: any) => ({
      id: campaign.id || String(campaign.campaignId || ''),
      name: campaign.title || campaign.name || 'Unknown Campaign',
      type: campaign.advObjectType || campaign.type || 'UNKNOWN',
      state: campaign.state || 'UNKNOWN'
    }));

    console.error(`Found ${allCampaigns.length} campaigns (all states)`);

    // Фильтруем: RUNNING + STOPPED (могли быть активны в период синхронизации)
    // Исключаем только ARCHIVED и ENDED (мертвые кампании)
    const campaigns = allCampaigns.filter(c =>
      c.state === 'CAMPAIGN_STATE_RUNNING' || c.state === 'CAMPAIGN_STATE_STOPPED'
    );

    const excludedCount = allCampaigns.length - campaigns.length;
    console.error(`Filtered to ${campaigns.length} campaigns (RUNNING + STOPPED)`);
    console.error(`Excluded ${excludedCount} dead campaigns (ARCHIVED + ENDED)`);

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

    // 5. Запрашиваем статистику для всех RUNNING + STOPPED кампаний
    // После фильтрации осталось ~44 кампании (вместо 345)
    // Chunk size = 8: позволяет обработать ~44 кампании за 6 чанков без превышения таймаута
    const chunkSize = 8;  // Increased from 5 now that we filter campaigns
    const campaignChunks = [];
    for (let i = 0; i < campaigns.length; i += chunkSize) {
      campaignChunks.push(campaigns.slice(i, i + chunkSize));
    }

    console.error(`Split into ${campaignChunks.length} chunks of ${chunkSize} campaigns each`);

    let allStats: OzonPerformanceStats[] = [];

    // АВТОМАТИЧЕСКАЯ ОБРАБОТКА: Обрабатываем ВСЕ чанки начиная с campaign_offset
    // По умолчанию campaign_offset=0 → обрабатываем все кампании автоматически
    // Если указан offset → продолжаем с этого места (полезно если предыдущий запуск не завершился)
    const startChunkIndex = Math.floor(campaign_offset / chunkSize);
    const chunksToProcess = startChunkIndex < campaignChunks.length
      ? campaignChunks.slice(startChunkIndex)  // Все чанки начиная с startChunkIndex
      : [];

    if (chunksToProcess.length === 0) {
      console.error(`⚠️  campaign_offset=${campaign_offset} exceeds total campaigns (${campaigns.length}). No campaigns to process.`);

      return new Response(
        JSON.stringify({
          success: true,
          message: `campaign_offset=${campaign_offset} exceeds total campaigns (${campaigns.length})`,
          inserted: 0,
          total_campaigns: campaigns.length,
          campaign_offset
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const totalCampaignsToProcess = chunksToProcess.reduce((sum, chunk) => sum + chunk.length, 0);
    const startCampaign = campaign_offset;
    const endCampaign = Math.min(campaign_offset + totalCampaignsToProcess - 1, campaigns.length - 1);

    console.error(`📋 AUTO MODE: Processing ${chunksToProcess.length} chunks (${totalCampaignsToProcess} campaigns)`);
    console.error(`   Campaigns ${startCampaign} to ${endCampaign} of ${campaigns.length} total`);
    console.error(`   Starting from chunk ${startChunkIndex + 1}/${campaignChunks.length}`);

    // Отслеживание обработанных и пропущенных кампаний
    const processedCampaigns: string[] = [];
    const failedCampaigns: Array<{name: string, id: string, reason: string}> = [];

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
          failedCampaigns.push({name: campaign.name, id: campaign.id, reason: `Failed to request report: ${errorText.substring(0, 100)}`});
          continue;  // Skip this campaign, continue with next one
        }

        const reportData = await reportRequest.json();
        const uuid = reportData.UUID;

        if (!uuid) {
          console.error(`No UUID received for campaign ${campaign.name}:`, reportData);
          failedCampaigns.push({name: campaign.name, id: campaign.id, reason: 'No UUID received from OZON API'});
          continue;  // Skip this campaign
        }

        console.error(`Report UUID for campaign ${campaign.name}: ${uuid}`);

        // Polling отчета (uses default params: 40 attempts, 10s initial delay, 5s interval)
        const pollResult = await pollReportStatus(uuid, accessToken);

        if (!pollResult.success) {
          console.error(`Polling failed for campaign ${campaign.name}:`, pollResult.error);
          failedCampaigns.push({name: campaign.name, id: campaign.id, reason: `Polling timeout: ${pollResult.error}`});
          continue;  // Skip this campaign
        }

        // Скачиваем и парсим отчет для ЭТОЙ кампании (не для всех!)
        try {
          const campaignStats = await downloadAndParseReport(uuid, accessToken, campaign);
          console.error(`Campaign ${campaign.name} returned ${campaignStats.length} rows`);
          allStats = allStats.concat(campaignStats);
          processedCampaigns.push(campaign.name);  // Успешно обработана
        } catch (err) {
          console.error(`Failed to parse report for campaign ${campaign.name}:`, err.message);
          failedCampaigns.push({name: campaign.name, id: campaign.id, reason: `Parse error: ${err.message}`});
          // Продолжаем со следующей кампанией
        }

        // ВАЖНО: Пауза между кампаниями чтобы не превысить лимит активных запросов OZON (максимум 1)
        // Даем OZON API время закрыть предыдущий запрос перед началом нового
        await new Promise(resolve => setTimeout(resolve, 3000));  // 3 секунды между кампаниями
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
      orders_model: stat.orders_model || 0,  // Заказы модели
      revenue: stat.revenue || null,
      add_to_cart: stat.add_to_cart || null,
      avg_bill: stat.avg_bill || null,
    }));

    // Debug: показываем что вставляем
    console.error(`Inserting ${records.length} records for marketplace_id: ${marketplace_id}`);
    console.error(`First record sample:`, JSON.stringify(records[0], null, 2));
    console.error(`Date range in records: ${records[0]?.stat_date} to ${records[records.length - 1]?.stat_date}`);

    const { data: insertData, error: insertError } = await supabaseClient
      .from("ozon_performance_daily")
      .upsert(records, { onConflict: "marketplace_id,stat_date,sku,campaign_id" })
      .select();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save data", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.error(`Insert successful! Returned ${insertData?.length || 0} rows from database`);

    // Статистика обработки кампаний
    console.error(`\n📊 CAMPAIGN PROCESSING SUMMARY:`);
    console.error(`   ✅ Successfully processed: ${processedCampaigns.length} campaigns`);
    console.error(`   ❌ Failed/Skipped: ${failedCampaigns.length} campaigns`);

    if (processedCampaigns.length > 0) {
      console.error(`\n   Processed campaigns: ${processedCampaigns.join(', ')}`);
    }

    if (failedCampaigns.length > 0) {
      console.error(`\n   ⚠️  FAILED CAMPAIGNS (need retry):`);
      failedCampaigns.forEach(fc => {
        console.error(`      - ${fc.name} (ID: ${fc.id}): ${fc.reason}`);
      });
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
            processed_campaigns: processedCampaigns.length,
            failed_campaigns: failedCampaigns.length,
            failed_campaign_names: failedCampaigns.map(fc => fc.name),
          },
        })
        .eq("id", syncId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: failedCampaigns.length > 0
          ? `Synchronization completed with ${failedCampaigns.length} failed campaigns`
          : "Synchronization completed successfully",
        period: { from: formatDate(periodStart), to: formatDate(periodEnd) },
        total_campaigns: campaigns.length,
        processed_campaigns: processedCampaigns.length,
        failed_campaigns: failedCampaigns.length,
        failed_campaign_details: failedCampaigns,
        chunks_processed: chunksToProcess.length,
        inserted: records.length,
        sync_id: syncId,
        version: "2.6.7-sequential-processing",
        build_date: "2025-12-24",
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
        version: "2.6.4-fix-column-detection",
        build_date: "2025-12-22",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
