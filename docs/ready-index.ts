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
  sync_period?: "daily" | "weekly" | "custom";
  test?: boolean;
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

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function pollReportStatus(
  uuid: string,
  accessToken: string,
  {
    maxAttempts = 8,
    initialDelay = 2000,
    pollInterval = 2000,
  }: { maxAttempts?: number; initialDelay?: number; pollInterval?: number } = {},
): Promise<{ success: boolean; link?: string; error?: string }> {
  await delay(initialDelay);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const statusResponse = await fetch(
      `https://api-performance.ozon.ru:443/api/client/statistics/${uuid}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      return { success: false, error: `Status check failed: ${errorText}` };
    }

    const statusData = await statusResponse.json();

    if (statusData.state === "OK") {
      return { success: true, link: statusData.link };
    }

    if (statusData.state === "ERROR") {
      return { success: false, error: statusData.error || "Unknown error" };
    }

    if (attempt < maxAttempts) {
      await delay(pollInterval);
    }
  }

  return { success: false, error: `Timeout after ${maxAttempts} attempts` };
}

async function downloadAndParseReport(
  uuid: string,
  accessToken: string,
  options: { link?: string; campaignIds?: string[]; periodFrom?: string; periodTo?: string } = {},
): Promise<OzonPerformanceStats[]> {
  const reportUrl = options.link ??
    `https://api-performance.ozon.ru:443/api/client/statistics/report?UUID=${uuid}`;

  const reportResponse = await fetch(reportUrl, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!reportResponse.ok) {
    const errorText = await reportResponse.text();
    throw new Error(`Failed to download report: ${errorText}`);
  }

  const contentType = reportResponse.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const jsonData = await reportResponse.json();
    const rows = Array.isArray(jsonData?.rows)
      ? jsonData.rows
      : Array.isArray(jsonData?.data)
      ? jsonData.data
      : [];

    return rows.map((row: unknown) => normalizeStatRow(row as Record<string, unknown>, options.campaignIds));
  }

  const csvText = await reportResponse.text();
  const lines = csvText.split("\n").filter((line) => line.trim());

  if (lines.length < 3) return [];

  const dataLines = lines.slice(2);
  const stats: OzonPerformanceStats[] = [];

  for (const line of dataLines) {
    if (!line.trim() || line.includes("Всего") || line.includes("Bcero")) continue;

    const columns = line.split(";").map((col) => col.trim());
    if (columns.length < 11) continue;

    const [sku, , , views, clicks, , , , , spent, orders, revenue] = columns;
    const dateColumn = columns[columns.length - 1];

    const parseNum = (value: string): number => {
      const cleaned = value.replace(/\s/g, "").replace(",", ".");
      const parsed = parseFloat(cleaned);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const statDate = normalizeDate(dateColumn) ?? options.periodTo ?? options.periodFrom ?? today();
    const campaignId = resolveCampaignIdFromChunk(options.campaignIds);

    stats.push({
      date: statDate,
      sku: sku || "",
      campaign_id: campaignId,
      money_spent: parseNum(spent),
      views: parseInt(views) || 0,
      clicks: parseInt(clicks) || 0,
      orders: parseInt(orders) || 0,
      revenue: parseNum(revenue),
    });
  }

  return stats;
}

function normalizeDate(dateValue: string | undefined | null): string | null {
  if (!dateValue) return null;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split("T")[0];
}

function resolveCampaignIdFromChunk(campaignIds?: string[]): string {
  if (campaignIds?.length === 1) return campaignIds[0];
  if (campaignIds && campaignIds.length > 1) {
    throw new Error("Report rows lack campaign_id while request contained multiple campaigns");
  }
  throw new Error("campaign_id is missing and cannot be inferred from request chunk");
}

function normalizeStatRow(row: Record<string, unknown>, campaignIds?: string[]): OzonPerformanceStats {
  const statDate = normalizeDate(
    (row.date as string) ||
      (row.stat_date as string) ||
      (row.date_from as string) ||
      (row.day as string) ||
      (row.period as string),
  );

  const campaignId = (row.campaign_id || row.campaignId || row.campaign) as string | undefined;
  const sku = (row.sku || row.offer_id || row.offerId || "") as string;

  if (!statDate) throw new Error("Unable to parse stat date from report row");
  if (!campaignId) throw new Error("Report row does not contain campaign_id");

  const moneySpent = Number(row.money_spent ?? row.spent ?? row.cost ?? row.drr_sum ?? 0) || 0;
  const views = Number(row.views ?? row.impressions ?? row.shows ?? 0) || 0;
  const clicks = Number(row.clicks ?? row.ctr_clicks ?? 0) || 0;
  const orders = Number(row.orders ?? row.purchases ?? 0) || 0;
  const revenue = Number(row.revenue ?? row.gmv ?? row.profit ?? 0) || null;

  return {
    date: statDate,
    sku,
    offer_id: (row.offer_id || row.offerId) as string | undefined,
    campaign_id: String(campaignId),
    campaign_name: (row.campaign_name || row.campaignName) as string | undefined,
    campaign_type: (row.campaign_type || row.campaignType) as string | undefined,
    money_spent: moneySpent,
    views,
    clicks,
    orders,
    revenue: revenue ?? undefined,
  };
}

const today = () => new Date().toISOString().split("T")[0];
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let supabaseClient: ReturnType<typeof createClient> | null = null;
  let syncId: number | undefined;

  const markFailed = async (message: string) => {
    if (supabaseClient && syncId) {
      await supabaseClient
        .from("ozon_sync_history")
        .update({
          status: "failed",
          error_message: message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncId);
    }
  };

  try {
    supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { marketplace_id, start_date, end_date, sync_period = "custom", test = false } =
      await req.json() as OzonPerformanceRequest;

    if (!marketplace_id) {
      return jsonResponse({ error: "marketplace_id is required" }, 400);
    }

    // Determine sync period
    let periodEnd = new Date();
    let periodStart: Date;
    let triggerType = "manual";

    if (sync_period === "daily") {
      periodStart = new Date(periodEnd.getTime() - 3 * 24 * 60 * 60 * 1000);
      triggerType = "cron_daily";
    } else if (sync_period === "weekly") {
      periodStart = new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
      triggerType = "cron_weekly";
    } else {
      periodEnd = end_date ? new Date(end_date) : periodEnd;
      periodStart = start_date ? new Date(start_date) : new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const formatDate = (date: Date) => date.toISOString().split("T")[0];

    // Record sync start
    const { data: syncRecord, error: syncStartError } = await supabaseClient
      .from("ozon_sync_history")
      .insert({
        marketplace_id,
        status: "in_progress",
        trigger_type: triggerType,
        period_from: formatDate(periodStart),
        period_to: formatDate(periodEnd),
        metadata: { sync_period },
      })
      .select()
      .single();

    if (syncStartError || !syncRecord) {
      return jsonResponse({ error: "Failed to start sync", details: syncStartError?.message }, 500);
    }

    syncId = syncRecord.id;

    // Load credentials
    const { data: creds, error: credsError } = await supabaseClient
      .from("marketplace_api_credentials")
      .select("client_id, client_secret, access_token, token_expires_at")
      .eq("marketplace_id", marketplace_id)
      .eq("api_type", "performance")
      .single();

    if (credsError || !creds) {
      await markFailed("API credentials not found. Please configure them first.");
      return jsonResponse({ error: "API credentials not found. Please configure them first." }, 404);
    }

    let accessToken = creds.access_token;
    const tokenExpired = !creds.token_expires_at || new Date(creds.token_expires_at) <= new Date();

    if (!accessToken || tokenExpired) {
      const tokenResponse = await fetch("https://api-performance.ozon.ru/api/client/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: creds.client_id,
          client_secret: creds.client_secret,
          grant_type: "client_credentials",
        }),
        redirect: "follow",
      }).catch((err) => {
        throw new Error(`Failed to connect to OZON API: ${err.message}`);
      });

      if (tokenResponse.url && !tokenResponse.url.includes("/api/client/token")) {
        await markFailed("Invalid credentials for OZON Performance API");
        return jsonResponse(
          {
            error: "Invalid credentials",
            details: "The API redirected to authentication page. Please check your Client ID and Client Secret for OZON Performance API.",
          },
          401,
        );
      }

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        await markFailed(errorText);
        return jsonResponse({ error: "Failed to obtain access token", details: errorText }, 401);
      }

      const tokenData = await tokenResponse.json();
      accessToken = tokenData.access_token;

      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await supabaseClient
        .from("marketplace_api_credentials")
        .update({ access_token: accessToken, token_expires_at: expiresAt })
        .eq("marketplace_id", marketplace_id)
        .eq("api_type", "performance");
    }

    if (test) {
      return jsonResponse({ success: true, message: "Connection successful", token_obtained: true });
    }

    // Fetch campaigns
    const campaignsResponse = await fetch("https://api-performance.ozon.ru:443/api/client/campaign", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      redirect: "follow",
    }).catch((err) => {
      throw new Error(`Failed to fetch campaigns: ${err.message}`);
    });

    if (!campaignsResponse.ok) {
      const errorText = await campaignsResponse.text();
      await markFailed(errorText);
      return jsonResponse(
        { error: "Failed to fetch campaigns list", status: campaignsResponse.status, details: errorText },
        campaignsResponse.status,
      );
    }

    const campaignsData = await campaignsResponse.json();
    const campaignIds = (campaignsData.list || []).map((campaign: { id: string }) => campaign.id);

    if (campaignIds.length === 0) {
      return jsonResponse({
        success: true,
        message: "No advertising campaigns found in your account. Create campaigns in OZON Performance first.",
        inserted: 0,
      });
    }

    const chunkSize = 10; // API limit
    const campaignChunks: string[][] = [];
    for (let i = 0; i < campaignIds.length; i += chunkSize) {
      campaignChunks.push(campaignIds.slice(i, i + chunkSize));
    }

    const stats: OzonPerformanceStats[] = [];
    const reportRequests: { uuid: string; campaigns: string[] }[] = [];

    for (const chunk of campaignChunks) {
      const reportRequest = await fetch("https://api-performance.ozon.ru:443/api/client/statistics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ campaigns: chunk, from: periodStart.toISOString(), to: periodEnd.toISOString(), groupBy: "DATE" }),
        redirect: "follow",
      }).catch((err) => {
        throw new Error(`Failed to request report: ${err.message}`);
      });

      if (!reportRequest.ok) {
        const errorText = await reportRequest.text();
        throw new Error(`Failed to request performance report: ${errorText}`);
      }

      const { uuid } = await reportRequest.json();
      if (!uuid) throw new Error("OZON did not return report UUID");
      reportRequests.push({ uuid, campaigns: chunk });
    }

    // Poll and download each report in parallel to reduce total runtime
    const reportResults = await Promise.all(
      reportRequests.map(async ({ uuid, campaigns }) => {
        const { success, link, error } = await pollReportStatus(uuid, accessToken as string);
        if (!success) {
          throw new Error(`Report generation failed (${uuid}): ${error}`);
        }

        return downloadAndParseReport(uuid, accessToken as string, {
          link,
          campaignIds: campaigns,
          periodFrom: formatDate(periodStart),
          periodTo: formatDate(periodEnd),
        });
      }),
    );

    for (const rows of reportResults) {
      stats.push(...rows);
    }

    if (stats.length === 0) {
      return jsonResponse({ success: true, message: "No data for the specified period", inserted: 0 });
    }

    const records = stats.map((stat) => ({
      marketplace_id,
      stat_date: stat.date,
      sku: stat.sku,
      offer_id: stat.offer_id ?? null,
      campaign_id: stat.campaign_id,
      campaign_name: stat.campaign_name ?? null,
      campaign_type: stat.campaign_type ?? null,
      money_spent: stat.money_spent ?? 0,
      views: stat.views ?? 0,
      clicks: stat.clicks ?? 0,
      orders: stat.orders ?? 0,
      revenue: stat.revenue ?? null,
    }));

    const { error: insertError } = await supabaseClient
      .from("ozon_performance_daily")
      .upsert(records, { onConflict: "marketplace_id,stat_date,sku,campaign_id" });

    if (insertError) {
      throw new Error(insertError.message);
    }

    if (syncId) {
      await supabaseClient
        .from("ozon_sync_history")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          campaigns_count: campaignIds.length,
          chunks_count: campaignChunks.length,
          rows_inserted: records.length,
          metadata: {
            sync_period,
            report_uuids: reportRequests.map((r) => r.uuid),
            total_campaigns: campaignIds.length,
          },
        })
        .eq("id", syncId);
    }

    return jsonResponse({
      success: true,
      message: "Synchronization completed",
      period: { from: formatDate(periodStart), to: formatDate(periodEnd) },
      campaigns: campaignIds.length,
      chunks_processed: campaignChunks.length,
      inserted: records.length,
      sync_id: syncId,
    });
  } catch (error) {
    const err = error as Error;

    if (supabaseClient && syncId) {
      await supabaseClient
        .from("ozon_sync_history")
        .update({
          status: "failed",
          error_message: err.message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncId);
    }

    const errorDetails = {
      message: err.message || "Unknown error",
      name: err.name || "Error",
      stack: err.stack?.split("\n").slice(0, 3).join("\n"),
    };

    return jsonResponse({ error: "Internal server error", details: errorDetails }, 500);
  }
});
