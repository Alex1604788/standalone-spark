// VERSION: 2026-01-12-v1 - Emergency cleanup of 608k drafted replies
// This function deletes all drafted replies in batches to avoid timeout

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    console.log("Starting cleanup of drafted replies...");

    let totalDeleted = 0;
    let batchNumber = 0;
    const batchSize = 1000; // Delete 1000 at a time

    while (true) {
      batchNumber++;

      // Get batch of drafted reply IDs
      const { data: draftedReplies, error: fetchError } = await supabase
        .from("replies")
        .select("id")
        .eq("status", "drafted")
        .is("deleted_at", null)
        .limit(batchSize);

      if (fetchError) {
        console.error(`Batch ${batchNumber} fetch error:`, fetchError);
        throw fetchError;
      }

      if (!draftedReplies || draftedReplies.length === 0) {
        console.log("No more drafted replies to delete");
        break;
      }

      // Delete this batch
      const ids = draftedReplies.map(r => r.id);
      const { error: deleteError } = await supabase
        .from("replies")
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .in("id", ids);

      if (deleteError) {
        console.error(`Batch ${batchNumber} delete error:`, deleteError);
        throw deleteError;
      }

      totalDeleted += draftedReplies.length;
      console.log(`Batch ${batchNumber}: deleted ${draftedReplies.length} (total: ${totalDeleted})`);

      // If we got less than batchSize, we're done
      if (draftedReplies.length < batchSize) {
        break;
      }

      // Small delay to not overload the database
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`Cleanup completed! Total deleted: ${totalDeleted}`);

    // Get final counts
    const { data: finalCounts } = await supabase
      .from("replies")
      .select("status", { count: "exact", head: true })
      .is("deleted_at", null);

    return new Response(
      JSON.stringify({
        success: true,
        total_deleted: totalDeleted,
        batches: batchNumber,
        message: `Successfully deleted ${totalDeleted} drafted replies in ${batchNumber} batches`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Cleanup error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
