/**
 * OZON Performance API Sync Function
 * Version: 3.0.4-reduce-batch-size
 * Date: 2026-01-07
 *
 * Key features:
 * - AUTO-CONTINUE CHAIN: Full sync (62 days) processes ALL campaigns via self-invoking chain
 * - FULL SYNC: Processes 12 campaigns per invocation (3 chunks × 4), then auto-calls next batch
 * - DAILY SYNC: Processes 20 campaigns per invocation (5 chunks × 4) for daily sync
 * - ZIP archive extraction support (in-memory using JSZip)
 * - Individual report requests per campaign (not batch!) - Fixes duplicate key violations
 * - INCREMENTAL SAVE: Each campaign's data is saved IMMEDIATELY after processing (survives Edge Function timeout)
 * - BATCHED UPSERT: Large campaigns (>50 records) split into batches to prevent PostgreSQL statement timeout
 * - Deduplicates cumulative snapshots - keeps last row (end-of-day data at 00:00 MSK)
 * - Async report generation with UUID polling (15 attempts, ~75sec timeout per campaign)
 * - Sync history tracking for partial sync support
 * - All OZON endpoints use redirect: "follow" for 307 redirects
 * - Proper campaign_id extraction from reports
 * - Fixed: add_to_cart now uses parseInt for INTEGER column compatibility
 * - Fixed: Request individual reports per campaign to avoid OZON returning same data for all
 * - Fixed: Use UUID instead of pollResult.link to avoid double URL construction
 * - Fixed: Deduplicate rows within CSV - OZON returns cumulative snapshots, we keep the last one
 * - Fixed: CSV column mapping - first column is DATE, not SKU! Updated destructuring to match actual OZON CSV structure
 * - Filter: Process RUNNING + STOPPED campaigns (exclude only ARCHIVED + ENDED) - captures historical data from recently stopped campaigns
 * - Chunk size: 4 campaigns per chunk (reduced from 8 to fit in Edge Function resource limits)
 * - VERSION TRACKING: Version is logged and saved in sync_history metadata
 * - Fixed: Removed 'weekly' sync mode, only 'full' and 'daily' are supported
 * - Fixed: Reduced batch sizes to prevent WORKER_LIMIT errors
 *
 * Sync modes:
 * - 'full': 62 days, max 12 campaigns per call (3 chunks × 4), auto-continues until all done
 * - 'daily': 7 days, max 20 campaigns (5 chunks × 4)
 * - 'custom': manual period via start_date/end_date (default = 'daily')
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

// ВЕРСИЯ Edge Function - обновляется при каждом изменении
const EDGE_FUNCTION_VERSION = "3.0.4-reduce-batch-size";

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

// Вспомогательная функция для retry HTTP запросов с exponential backoff
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response; // Success!
    } catch (error: any) {
      lastError = error;
      console.error(`Fetch attempt ${attempt}/${maxRetries} failed:`, error.message);

      if (attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt - 1); // Exponential backoff
        console.error(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Failed after ${maxRetries} retries: ${lastError?.message}`);
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

    // Логируем версию Edge Function в начале выполнения
    console.error(`🚀 OZON Performance Sync starting - VERSION: ${EDGE_FUNCTION_VERSION}`);
    console.error(`📋 Request: marketplace=${marketplace_id}, sync_period=${sync_period}, offset=${campaign_offset}`);

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
    let maxCampaignsPerRun: number | null = null; // null = без ограничений

    if (sync_period === 'full') {
      // Полная синхронизация: 62 дня, с auto-continue chain
      periodStart = new Date(periodEnd.getTime() - 62 * 24 * 60 * 60 * 1000);
      triggerType = 'manual_full';
      maxCampaignsPerRun = 12; // REDUCED: 3 chunks × 4 campaigns (было 24) - предотвращаем WORKER_LIMIT
    } else if (sync_period === 'daily') {
      // Ежедневная синхронизация: последние 7 дней, с ограничением для предотвращения таймаута
      periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
      triggerType = 'cron_daily';
      maxCampaignsPerRun = 20; // REDUCED: 5 chunks × 4 campaigns (было 40) - предотвращаем WORKER_LIMIT
    } else {
      // Любое другое значение (в т.ч. 'custom', 'weekly', 'hourly' и т.д.) = режим 'daily' по умолчанию
      console.error(`⚠️ Unknown sync_period: "${sync_period}", using 'daily' as default`);
      periodEnd = end_date ? new Date(end_date) : periodEnd;
      periodStart = start_date ? new Date(start_date) : new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
      triggerType = 'manual';
      maxCampaignsPerRun = 20; // REDUCED: безопасное ограничение (было 40)
    }

    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    // Создадим запись в истории синхронизаций ПОСЛЕ получения списка кампаний
    let syncId: string | null = null;

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
          version: "3.0.1-progress-fix",
          build_date: "2026-01-06"
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

    // Создаем запись в истории синхронизаций ТЕПЕРЬ (когда знаем campaigns.length)
    const { data: syncRecord, error: syncError } = await supabaseClient
      .from("ozon_sync_history")
      .insert({
        marketplace_id,
        status: 'in_progress',
        trigger_type: triggerType,
        period_from: formatDate(periodStart),
        period_to: formatDate(periodEnd),
        metadata: {
          version: EDGE_FUNCTION_VERSION,  // Версия Edge Function
          sync_period,
          total_campaigns: campaigns.length,
          current_offset: campaign_offset,
        },
      })
      .select()
      .single();

    if (syncError || !syncRecord) {
      console.error("Failed to create sync history record:", syncError);
    }

    syncId = syncRecord?.id || null;

    // 5. Запрашиваем статистику для всех RUNNING + STOPPED кампаний
    // После фильтрации осталось ~55 кампаний (вместо 362)
    // Chunk size = 4: REDUCED from 8 to prevent WORKER_LIMIT errors (Edge Function memory/time limits)
    const chunkSize = 4;  // CRITICAL: Small chunks to fit in 2-minute Edge Function timeout
    const campaignChunks = [];
    for (let i = 0; i < campaigns.length; i += chunkSize) {
      campaignChunks.push(campaigns.slice(i, i + chunkSize));
    }

    console.error(`Split into ${campaignChunks.length} chunks of ${chunkSize} campaigns each`);

    let allStats: OzonPerformanceStats[] = [];

    // АВТОМАТИЧЕСКАЯ ОБРАБОТКА: Обрабатываем чанки начиная с campaign_offset
    // Для 'full' режима: ограничиваем до maxCampaignsPerRun кампаний за один вызов
    // Для остальных режимов: обрабатываем все кампании
    const startChunkIndex = Math.floor(campaign_offset / chunkSize);

    let chunksToProcess = [];
    if (startChunkIndex < campaignChunks.length) {
      if (maxCampaignsPerRun !== null) {
        // Ограниченный режим (full sync): берём только N кампаний
        const maxChunks = Math.ceil(maxCampaignsPerRun / chunkSize);
        const endChunkIndex = Math.min(startChunkIndex + maxChunks, campaignChunks.length);
        chunksToProcess = campaignChunks.slice(startChunkIndex, endChunkIndex);
      } else {
        // Неограниченный режим (daily, weekly, custom): все оставшиеся чанки
        chunksToProcess = campaignChunks.slice(startChunkIndex);
      }
    }

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

        let reportRequest: Response;
        try {
          reportRequest = await fetchWithRetry("https://api-performance.ozon.ru:443/api/client/statistics", {
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
          }, 3, 2000); // 3 retries, 2s initial delay
        } catch (error: any) {
          console.error(`Failed to request report for campaign ${campaign.name} after retries:`, error.message);
          failedCampaigns.push({name: campaign.name, id: campaign.id, reason: `Connection error: ${error.message}`});
          continue;  // Skip this campaign, continue with next one
        }

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

          // INCREMENTAL SAVE: Сохраняем данные ЭТОЙ кампании сразу (не ждем обработки всех кампаний)
          // Это позволяет сохранить хотя бы часть данных если Edge Function получит timeout
          if (campaignStats.length > 0) {
            // Дедуплицируем данные этой кампании (убираем кумулятивные снимки, оставляем последний)
            const dedupedCampaignStats = deduplicateStats(campaignStats);
            console.error(`After deduplication: ${dedupedCampaignStats.length} unique rows for ${campaign.name}`);

            // Преобразуем в формат для вставки
            const campaignRecords = dedupedCampaignStats.map((stat) => ({
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
              orders_model: stat.orders_model || 0,
              revenue: stat.revenue || null,
              add_to_cart: stat.add_to_cart || null,
              avg_bill: stat.avg_bill || null,
            }));

            // Сохраняем в базу немедленно
            // Для больших кампаний (>50 records) разбиваем на батчи чтобы избежать statement timeout
            const BATCH_SIZE = 50;
            let savedSuccessfully = true;

            if (campaignRecords.length > BATCH_SIZE) {
              console.error(`Large campaign (${campaignRecords.length} records) - using batch insert`);
              for (let i = 0; i < campaignRecords.length; i += BATCH_SIZE) {
                const batch = campaignRecords.slice(i, i + BATCH_SIZE);
                const { error: batchError } = await supabaseClient
                  .from("ozon_performance_daily")
                  .upsert(batch, { onConflict: "marketplace_id,stat_date,sku,campaign_id" });

                if (batchError) {
                  console.error(`Batch ${i}-${i+batch.length} failed:`, batchError.message);
                  savedSuccessfully = false;
                  failedCampaigns.push({name: campaign.name, id: campaign.id, reason: `Batch save error: ${batchError.message}`});
                  break;
                }
              }
              if (savedSuccessfully) {
                console.error(`✅ Saved ${campaignRecords.length} records for campaign ${campaign.name} (batched)`);
              }
            } else {
              // Обычная вставка для небольших кампаний
              const { error: saveError } = await supabaseClient
                .from("ozon_performance_daily")
                .upsert(campaignRecords, { onConflict: "marketplace_id,stat_date,sku,campaign_id" });

              if (saveError) {
                console.error(`Failed to save data for campaign ${campaign.name}:`, saveError.message);
                failedCampaigns.push({name: campaign.name, id: campaign.id, reason: `Save error: ${saveError.message}`});
                savedSuccessfully = false;
              } else {
                console.error(`✅ Saved ${campaignRecords.length} records for campaign ${campaign.name}`);
              }
            }

            if (savedSuccessfully) {
              allStats = allStats.concat(campaignStats);  // Для финальной статистики
              processedCampaigns.push(campaign.name);  // Успешно обработана И сохранена
            }
          } else {
            console.error(`⚠️  Campaign ${campaign.name} returned no data - skipping`);
            processedCampaigns.push(campaign.name);  // Технически обработана, просто нет данных
          }
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

    // NOTE: С версии 2.6.8 данные сохраняются ИНКРЕМЕНТАЛЬНО после каждой кампании
    // Финальный upsert больше не нужен - все данные уже в базе
    console.error(`\n📦 TOTAL DATA COLLECTED: ${allStats.length} stat rows from ${processedCampaigns.length} campaigns`);

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

    // Проверяем, нужно ли автоматически продолжить синхронизацию
    const nextCampaignOffset = campaign_offset + chunksToProcess.length * chunkSize;
    const hasMoreCampaigns = nextCampaignOffset < campaigns.length;
    const shouldAutoContinue = hasMoreCampaigns && sync_period === 'full';

    // Обновляем историю
    const finalStatus = shouldAutoContinue ? 'in_progress' : 'completed';
    if (syncId) {
      await supabaseClient
        .from("ozon_sync_history")
        .update({
          status: finalStatus,
          completed_at: shouldAutoContinue ? null : new Date().toISOString(),
          campaigns_count: campaigns.length,
          chunks_count: chunksToProcess.length,
          rows_inserted: allStats.length,  // Общее количество строк (до дедупликации на уровне кампаний)
          metadata: {
            version: EDGE_FUNCTION_VERSION,  // Версия Edge Function
            sync_period,
            total_campaigns: campaigns.length,
            processed_campaigns: processedCampaigns.length,
            failed_campaigns: failedCampaigns.length,
            failed_campaign_names: failedCampaigns.map(fc => fc.name),
            current_offset: nextCampaignOffset,
            has_more: hasMoreCampaigns,
            auto_continue: shouldAutoContinue,
          },
        })
        .eq("id", syncId);
    }

    // AUTO-CONTINUE: Если есть ещё кампании и режим 'full', запускаем следующий batch
    if (shouldAutoContinue) {
      console.error(`\n🔄 AUTO-CONTINUE: Triggering next batch (offset ${nextCampaignOffset} of ${campaigns.length})`);

      // Асинхронный вызов следующего batch (не ждём ответа)
      const nextBatchPayload = {
        marketplace_id,
        sync_period: 'full',
        campaign_offset: nextCampaignOffset,
        start_date: formatDate(periodStart),
        end_date: formatDate(periodEnd),
      };

      // Вызываем функцию саму себя через HTTP
      const functionUrl = Deno.env.get("SUPABASE_URL") + "/functions/v1/sync-ozon-performance";
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

      fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(nextBatchPayload),
      }).catch(err => {
        console.error("Failed to trigger next batch:", err);
      });

      console.error(`✅ Next batch triggered asynchronously`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: shouldAutoContinue
          ? `Batch completed. Processing ${nextCampaignOffset}/${campaigns.length} campaigns. Auto-continuing...`
          : failedCampaigns.length > 0
            ? `Synchronization completed with ${failedCampaigns.length} failed campaigns. Data saved incrementally.`
            : "Synchronization completed successfully. All data saved.",
        period: { from: formatDate(periodStart), to: formatDate(periodEnd) },
        total_campaigns: campaigns.length,
        processed_campaigns: processedCampaigns.length,
        failed_campaigns: failedCampaigns.length,
        failed_campaign_details: failedCampaigns,
        chunks_processed: chunksToProcess.length,
        rows_collected: allStats.length,  // Общее количество обработанных строк
        current_offset: nextCampaignOffset,
        has_more: hasMoreCampaigns,
        auto_continue: shouldAutoContinue,
        progress: `${nextCampaignOffset}/${campaigns.length} campaigns (${Math.round(nextCampaignOffset / campaigns.length * 100)}%)`,
        note: "Data is saved incrementally after each campaign (survives Edge Function timeout)",
        sync_id: syncId,
        version: EDGE_FUNCTION_VERSION,
        build_date: "2026-01-07",
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
        version: "3.0.0-auto-continue",
        build_date: "2026-01-06",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
// Trigger deployment
