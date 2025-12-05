// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 405 }
    );
  }

  try {
    const { user_id, ozon_seller_id, name, client_id, api_key } = await req.json();

    if (!user_id || !ozon_seller_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required parameters: user_id, ozon_seller_id' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 400 }
      );
    }

    const supabase = createClient(
      Deno.env.get('OZON_SUPABASE_URL')!,
      Deno.env.get('OZON_SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Try to get existing marketplace
    const { data: existing, error: selectError } = await supabase
      .from('marketplaces')
      .select('id, name, ozon_seller_id')
      .eq('user_id', user_id)
      .eq('ozon_seller_id', ozon_seller_id)
      .maybeSingle();

    if (selectError) {
      console.error('Error selecting marketplace:', selectError);
      return new Response(
        JSON.stringify({ success: false, error: selectError.message }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
      );
    }

    // If exists, return it
    if (existing) {
      console.log(`Found existing marketplace: ${existing.id}`);
      return new Response(
        JSON.stringify({
          success: true,
          marketplace_id: existing.id,
          name: existing.name,
          is_new: false,
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Create new marketplace
    const marketplaceName = name || `OZON ${ozon_seller_id}`;
    const { data: created, error: insertError } = await supabase
      .from('marketplaces')
      .insert({
        user_id,
        type: 'ozon',
        name: marketplaceName,
        ozon_seller_id,
        api_key_encrypted: api_key || null,
        service_account_email: client_id || null,
        is_active: true,
        last_sync_status: 'pending',
      })
      .select('id, name')
      .single();

    if (insertError) {
      console.error('Error creating marketplace:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
      );
    }

    console.log(`Created new marketplace: ${created.id}`);
    return new Response(
      JSON.stringify({
        success: true,
        marketplace_id: created.id,
        name: created.name,
        is_new: true,
      }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Unknown error' }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
    );
  }
});
