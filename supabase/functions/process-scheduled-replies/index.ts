/**
 * process-scheduled-replies: Автоматически публикует scheduled replies
 * VERSION: 2026-01-31-v1
 *
 * FIX: Убран фильтр исключающий OZON
 * Теперь OZON replies публикуются автоматически через API (не через расширение)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Processing scheduled replies...');

    // 🧹 CLEANUP: Reset replies stuck in 'publishing' for more than 10 minutes back to 'scheduled'
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: stuckReplies, error: stuckError } = await supabase
      .from('replies')
      .update({ status: 'scheduled', updated_at: new Date().toISOString() })
      .eq('status', 'publishing')
      .lt('updated_at', tenMinutesAgo)
      .is('deleted_at', null)
      .select('id');

    if (stuckError) {
      console.error('Error cleaning stuck publishing replies:', stuckError);
    } else if (stuckReplies && stuckReplies.length > 0) {
      console.log(`Cleaned up ${stuckReplies.length} stuck publishing replies → scheduled`);
    }

    // Find all replies that should be published now
    const { data: scheduledReplies, error: fetchError } = await supabase
      .from('replies')
      .select(`
        id,
        marketplace_id,
        marketplace:marketplaces!inner(type)
      `)
      .eq('status', 'scheduled')
      .is('deleted_at', null)
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(50);

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${scheduledReplies?.length || 0} replies to publish`);

    if (!scheduledReplies || scheduledReplies.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No scheduled replies to process', count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Publish each reply
    const results = await Promise.allSettled(
      scheduledReplies.map(async (reply) => {
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/publish-reply`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ reply_id: reply.id }),
          });

          if (!response.ok) {
            const error = await response.text();
            console.error(`Failed to publish reply ${reply.id}:`, error);
            return { success: false, id: reply.id, error };
          }

          return { success: true, id: reply.id };
        } catch (error) {
          console.error(`Error publishing reply ${reply.id}:`, error);
          return { success: false, id: reply.id, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - successful;

    console.log(`Processed ${results.length} replies: ${successful} successful, ${failed} failed`);

    return new Response(
      JSON.stringify({
        message: 'Processing complete',
        total: results.length,
        successful,
        failed,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in process-scheduled-replies:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
