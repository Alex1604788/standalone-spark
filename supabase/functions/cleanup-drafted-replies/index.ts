// VERSION: 2026-01-13-v2 - Fix: Use SQL directly via postgres, not REST API
// This function deletes all drafted replies in batches to avoid timeout

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createClient as createPgClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    console.log("Starting cleanup of drafted replies...");

    let totalDeleted = 0;
    let batchNumber = 0;

    while (true) {
      batchNumber++;

      // Use SQL directly via RPC - delete 5000 at a time
      const { data, error } = await supabase.rpc('delete_drafted_batch_5k');

      if (error) {
        // RPC doesn't exist, create it first
        if (error.message.includes('function') && error.message.includes('does not exist')) {
          console.log("Creating delete function...");

          const { error: createError } = await supabase.rpc('exec_sql', {
            sql: `
              CREATE OR REPLACE FUNCTION delete_drafted_batch_5k()
              RETURNS INT AS $$
              DECLARE
                v_deleted INT;
              BEGIN
                DELETE FROM replies
                WHERE id IN (
                  SELECT id FROM replies
                  WHERE status = 'drafted' AND deleted_at IS NULL
                  LIMIT 5000
                );
                GET DIAGNOSTICS v_deleted = ROW_COUNT;
                RETURN v_deleted;
              END;
              $$ LANGUAGE plpgsql;
            `
          });

          if (createError) {
            console.error("Failed to create function:", createError);
            throw new Error("Cannot create SQL function - please run migration manually");
          }

          // Try again
          const { data: retryData, error: retryError } = await supabase.rpc('delete_drafted_batch_5k');
          if (retryError) throw retryError;

          const deleted = retryData || 0;
          totalDeleted += deleted;
          console.log(`Batch ${batchNumber}: deleted ${deleted} (total: ${totalDeleted})`);

          if (deleted === 0) break;

        } else {
          throw error;
        }
      } else {
        const deleted = data || 0;
        totalDeleted += deleted;
        console.log(`Batch ${batchNumber}: deleted ${deleted} (total: ${totalDeleted})`);

        if (deleted === 0) {
          console.log("No more drafted replies to delete");
          break;
        }
      }

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`Cleanup completed! Total deleted: ${totalDeleted}`);

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
