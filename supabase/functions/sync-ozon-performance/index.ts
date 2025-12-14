/**
 * OZON Performance API Sync Function
 * Version: 2.0.0-final
 * Date: 2025-12-14
 *
 * Key features:
 * - Sequential processing (1 chunk = 10 campaigns)
 * - ZIP extraction support with JSZip
 * - All OZON endpoints use redirect: "follow" (fixes 307 redirects)
 * - Optimized polling: 6 attempts × 2s = 13s
 * - Handles { list: [...] } response format for campaigns
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
  avg_bill?: number;
  add_to_cart?: number;
  favorites?: number;
}

interface OzonCampaign {
  id: string;
  title: string;
  state: string;
  advObjectType: string;
}

// Helper function: Poll report status until ready
async function pollReportStatus(
  uuid: string,
  accessToken: string,
  maxAttempts: number = 6,
  initialDelay: number = 3000,
  pollInterval: number = 2000
): Promise<string> {
  console.log(`Polling report ${uuid}...`);

  // Initial delay before first check
  await new Promise(resolve => setTimeout(resolve, initialDelay));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`Checking report status, attempt ${attempt}/${maxAttempts}...`);

    const statusResponse = await fetch("https://api-performance.ozon.ru/api/client/statistics", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
      },
      redirect: "follow",
    });

    console.log(`Status check response: ${statusResponse.status} ${statusResponse.statusText}`);

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      throw new Error(`Failed to check report status (${statusResponse.status}): ${errorText}`);
    }

    const statusData = await statusResponse.json();
    const report = statusData.find((r: any) => r.UUID === uuid);

    if (!report) {
      throw new Error(`Report ${uuid} not found in status list`);
    }

    console.log(`Report ${uuid} status: ${report.state} (attempt ${attempt}/${maxAttempts})`);

    if (report.state === "OK") {
      return report.state;
    }

    if (report.state === "ERROR") {
      throw new Error(`Report generation failed: ${report.error || "Unknown error"}`);
    }

    // Wait before next check (except on last attempt)
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error(`Report ${uuid} not ready after ${maxAttempts} attempts`);
}

// Helper function: Download and parse report
async function downloadAndParseReport(
  uuid: string,
  accessToken: string,
  campaignIdFromMeta: string,
  dateFrom: string | undefined
): Promise<OzonPerformanceStats[]> {
  console.log(`Downloading report ${uuid}...`);

  const downloadResponse = await fetch(
    `https://api-performance.ozon.ru/api/client/statistics/${uuid}`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
      },
      redirect: "follow",
    }
  );

  console.log(`Download response: ${downloadResponse.status} ${downloadResponse.statusText}`);

  if (!downloadResponse.ok) {
    const errorText = await downloadResponse.text();
    throw new Error(`Failed to download report (${downloadResponse.status}): ${errorText}`);
  }

  const blob = await downloadResponse.arrayBuffer();
  console.log(`Downloaded ${blob.byteLength} bytes`);

  // Check if it's a ZIP file (magic bytes: 0x50 0x4B)
  const firstBytes = new Uint8Array(blob.slice(0, 4));
  const isZip = firstBytes[0] === 0x50 && firstBytes[1] === 0x4B;

  let csvText: string;

  if (isZip) {
    console.log("ZIP detected, extracting...");
    const zip = await JSZip.loadAsync(blob);
    const fileNames = Object.keys(zip.files);

    if (fileNames.length === 0) {
      throw new Error("ZIP archive is empty");
    }

    const csvFileName = fileNames.find(name => name.endsWith('.csv')) || fileNames[0];
    console.log(`Extracting file: ${csvFileName}`);

    const csvFile = zip.files[csvFileName];
    csvText = await csvFile.async("string");
  } else {
    console.log("Plain CSV detected");
    csvText = new TextDecoder("utf-8").decode(blob);
  }

  // Remove NULL bytes
  csvText = csvText.replace(/\0/g, '');

  console.log(`CSV content (first 500 chars): ${csvText.substring(0, 500)}`);

  const lines = csvText.split('\n').filter(line => line.trim());

  if (lines.length === 0) {
    console.log("Empty CSV");
    return [];
  }

  // Extract campaign_id from metadata if present
  let metaCampaignId = campaignIdFromMeta;

  // Check if first line is metadata (starts with #)
  if (lines[0].startsWith('#')) {
    const metaLine = lines[0];
    console.log(`Metadata line: ${metaLine}`);

    // Format: # Отчет по РК №123456789
    const match = metaLine.match(/№(\d+)/);
    if (match) {
      metaCampaignId = match[1];
      console.log(`Extracted campaign_id from metadata: ${metaCampaignId}`);
    }

    // Remove metadata line
    lines.shift();
  }

  if (lines.length === 0) {
    console.log("No data after metadata");
    return [];
  }

  // Parse CSV (semicolon-delimited)
  const headerLine = lines[0];
  const headers = headerLine.split(';').map(h => h.trim());
  console.log(`Headers (${headers.length}):`, headers);

  const dataLines = lines.slice(1);
  console.log(`Data lines: ${dataLines.length}`);

  const stats: OzonPerformanceStats[] = [];

  for (const line of dataLines) {
    if (!line.trim()) continue;

    const values = line.split(';').map(v => v.trim());

    if (values.length < headers.length) {
      console.log(`Skipping incomplete line: ${line}`);
      continue;
    }

    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index];
    });

    // Map Russian headers to English field names
    const stat: OzonPerformanceStats = {
      date: convertRussianDateToISO(row['Дата'] || row['Date'] || ''),
      sku: row['SKU'] || row['sku'] || '',
      campaign_id: metaCampaignId || row['ID кампании'] || row['Campaign ID'] || '',
      money_spent: parseFloat(row['Расход'] || row['Spend'] || '0'),
      views: parseInt(row['Показы'] || row['Views'] || '0'),
      clicks: parseInt(row['Клики'] || row['Clicks'] || '0'),
      orders: parseInt(row['Заказы'] || row['Orders'] || '0'),
      revenue: parseFloatOrNull(row['Продажи'] || row['Revenue']),
      avg_bill: parseFloatOrNull(row['Средний чек'] || row['Avg Bill']),
      add_to_cart: parseIntOrNull(row['Добавления в корзину'] || row['Add to Cart']),
      favorites: parseIntOrNull(row['Добавления в избранное'] || row['Favorites']),
    };

    // Filter by date if needed
    if (dateFrom && stat.date < dateFrom) {
      continue;
    }

    stats.push(stat);
  }

  console.log(`Parsed ${stats.length} stats records`);
  return stats;
}

// Helper: Convert DD.MM.YYYY to YYYY-MM-DD
function convertRussianDateToISO(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('.');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return dateStr;
}

function parseFloatOrNull(value: string | undefined): number | null {
  if (!value || value === '' || value === '-') return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

function parseIntOrNull(value: string | undefined): number | null {
  if (!value || value === '' || value === '-') return null;
  const num = parseInt(value);
  return isNaN(num) ? null : num;
}

// Helper: Get all campaigns to build name/type mapping
async function getCampaigns(accessToken: string): Promise<Map<string, OzonCampaign>> {
  console.log("Fetching campaigns list...");

  const campaignsResponse = await fetch("https://api-performance.ozon.ru/api/client/campaign", {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
    },
    redirect: "follow",
  });

  console.log(`Campaigns list response: ${campaignsResponse.status} ${campaignsResponse.statusText}`);

  if (!campaignsResponse.ok) {
    const errorText = await campaignsResponse.text();
    throw new Error(`Failed to fetch campaigns (${campaignsResponse.status}): ${errorText}`);
  }

  const campaignsData = await campaignsResponse.json();
  console.log(`Campaigns API response structure:`, JSON.stringify(campaignsData).substring(0, 500));

  // OZON API returns { list: [...] }, not array directly
  const campaigns: OzonCampaign[] = campaignsData.list || campaignsData || [];
  console.log(`Found ${campaigns.length} campaigns`);

  const campaignMap = new Map<string, OzonCampaign>();
  campaigns.forEach(c => campaignMap.set(c.id, c));

  return campaignMap;
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

    // 1. Get credentials from database
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

    // 2. Check/refresh token
    let accessToken = creds.access_token;
    const tokenExpired = !creds.token_expires_at || new Date(creds.token_expires_at) <= new Date();

    if (!accessToken || tokenExpired) {
      console.log("Getting new access token...");

      // IMPORTANT: Token endpoint requires following redirects (returns 307 with __rr=1 parameter)
      const tokenResponse = await fetch("https://performance.ozon.ru/api/client/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: creds.client_id,
          client_secret: creds.client_secret,
          grant_type: "client_credentials",
        }),
        redirect: "follow", // Follow redirects for token endpoint
      });

      console.log(`Token response: ${tokenResponse.status} ${tokenResponse.statusText}`);

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

      // Save token to database (expires in 30 minutes)
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await supabaseClient
        .from("marketplace_api_credentials")
        .update({ access_token: accessToken, token_expires_at: expiresAt })
        .eq("marketplace_id", marketplace_id)
        .eq("api_type", "performance");

      console.log("Access token obtained and saved");
    }

    if (test) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Connection successful",
          token_obtained: true,
          version: "2.0.0-final",
          build_date: "2025-12-14"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Determine period
    const endDateObj = end_date ? new Date(end_date) : new Date();
    const startDateObj = start_date ? new Date(start_date) : new Date(endDateObj.getTime() - 7 * 24 * 60 * 60 * 1000);
    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    console.log(`Sync period: ${formatDate(startDateObj)} to ${formatDate(endDateObj)}`);

    // 4. Get campaigns for name/type mapping
    const campaignMap = await getCampaigns(accessToken);
    const campaignIds = Array.from(campaignMap.keys());

    if (campaignIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No campaigns found", inserted: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${campaignIds.length} campaigns...`);

    // 5. Split campaigns into chunks (max 10 per request)
    const chunkSize = 10;
    const chunks: string[][] = [];
    for (let i = 0; i < campaignIds.length; i += chunkSize) {
      chunks.push(campaignIds.slice(i, i + chunkSize));
    }

    console.log(`Split into ${chunks.length} chunks of ${chunkSize} campaigns each`);

    // IMPORTANT: Process only 1 chunk at a time (OZON limit: 1 active request)
    const maxChunks = 1;
    const chunksToProcess = chunks.slice(0, maxChunks);

    if (chunks.length > maxChunks) {
      console.log(`WARNING: Too many campaigns (${campaignIds.length}). Processing only first ${maxChunks * chunkSize} campaigns (${maxChunks} chunk). Run sync multiple times to get all data.`);
    }

    let allStats: OzonPerformanceStats[] = [];

    // 6. Process chunks SEQUENTIALLY (one at a time)
    for (let i = 0; i < chunksToProcess.length; i++) {
      const chunk = chunksToProcess[i];
      console.log(`Processing chunk ${i + 1}/${chunksToProcess.length} (${chunk.length} campaigns)...`);

      // Request report for this chunk
      console.log(`Requesting report for chunk ${i + 1}...`);

      const reportResponse = await fetch("https://api-performance.ozon.ru/api/client/statistics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          campaigns: chunk,
          dateFrom: formatDate(startDateObj),
          dateTo: formatDate(endDateObj),
        }),
        redirect: "follow",
      });

      console.log(`Report request response: ${reportResponse.status} ${reportResponse.statusText}`);

      if (!reportResponse.ok) {
        const errorText = await reportResponse.text();
        console.error(`Chunk ${i + 1} request error (${reportResponse.status}):`, errorText);
        return new Response(
          JSON.stringify({ error: "Failed to request performance report", details: errorText }),
          { status: reportResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const reportData = await reportResponse.json();
      const uuid = reportData.UUID;

      if (!uuid) {
        console.error("No UUID in report response:", reportData);
        return new Response(
          JSON.stringify({ error: "No UUID received from OZON API", details: JSON.stringify(reportData) }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Chunk ${i + 1}: Report requested, UUID = ${uuid}`);

      // Immediately poll and download this report (don't wait for other chunks)
      try {
        await pollReportStatus(uuid, accessToken, 6, 3000, 2000);
        console.log(`Chunk ${i + 1}: Report ${uuid} is ready`);

        const chunkStats = await downloadAndParseReport(uuid, accessToken, '', formatDate(startDateObj));
        console.log(`Chunk ${i + 1}: Downloaded and parsed ${chunkStats.length} rows`);

        // Enrich stats with campaign name and type from mapping
        chunkStats.forEach(stat => {
          const campaignInfo = campaignMap.get(stat.campaign_id);
          if (campaignInfo) {
            stat.campaign_name = campaignInfo.title;
            stat.campaign_type = campaignInfo.advObjectType;
          }
        });

        allStats = allStats.concat(chunkStats);
      } catch (pollError) {
        console.error(`Chunk ${i + 1}: Error processing report ${uuid}:`, pollError);
        // Continue with next chunk instead of failing completely
      }
    }

    if (allStats.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No data for the specified period", inserted: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Total stats collected: ${allStats.length} rows`);

    // 7. Save to database
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
      avg_bill: stat.avg_bill || null,
      add_to_cart: stat.add_to_cart || null,
      favorites: stat.favorites || null,
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

    console.log(`Successfully saved ${records.length} records to database`);

    const isPartialSync = chunks.length > maxChunks;
    const warningMessage = isPartialSync
      ? `⚠️ Partial sync: processed ${chunksToProcess.length * chunkSize} out of ${campaignIds.length} campaigns. Run sync again to continue.`
      : "Synchronization completed";

    return new Response(
      JSON.stringify({
        success: true,
        message: warningMessage,
        partial_sync: isPartialSync,
        period: { from: formatDate(startDateObj), to: formatDate(endDateObj) },
        campaigns_total: campaignIds.length,
        campaigns_processed: chunksToProcess.length * chunkSize,
        campaigns_remaining: Math.max(0, campaignIds.length - (chunksToProcess.length * chunkSize)),
        chunks_processed: chunksToProcess.length,
        chunks_total: chunks.length,
        inserted: records.length,
        version: "2.0.0-final",
        build_date: "2025-12-14"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Function error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
