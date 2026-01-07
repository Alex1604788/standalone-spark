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
    const { chat_id, text, marketplace_id } = await req.json();

    if (!chat_id || !text || !marketplace_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required parameters: chat_id, text, marketplace_id' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 400 }
      );
    }

    const supabase = createClient(
      Deno.env.get('OZON_SUPABASE_URL')!,
      Deno.env.get('OZON_SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log(`[send-chat-message] Sending message to chat ${chat_id}`);

    // Get marketplace and check if it has API credentials
    const { data: marketplace } = await supabase
      .from('marketplaces')
      .select('id, type, service_account_email, api_key_encrypted')
      .eq('id', marketplace_id)
      .single();

    if (!marketplace) {
      return new Response(
        JSON.stringify({ success: false, error: 'Marketplace not found' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 404 }
      );
    }

    if (marketplace.type !== 'ozon') {
      return new Response(
        JSON.stringify({ success: false, error: 'This function only supports OZON marketplaces' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 400 }
      );
    }

    // Check sync mode
    const { data: syncMode } = await supabase
      .rpc('get_marketplace_sync_mode', { p_marketplace_id: marketplace_id });

    console.log(`[send-chat-message] Sync mode: ${syncMode}`);

    if (syncMode !== 'api') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'API mode not available. Please add Premium Plus API credentials.',
          mode: 'plugin_required'
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 400 }
      );
    }

    // Get API credentials
    const { data: credentials } = await supabase
      .rpc('get_api_credentials', {
        p_marketplace_id: marketplace_id,
        p_api_type: 'seller'
      });

    if (!credentials || credentials.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'API credentials not found' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 404 }
      );
    }

    const cred = credentials[0];

    // Get internal chat record
    const { data: chatRecord } = await supabase
      .from('chats')
      .select('id')
      .eq('marketplace_id', marketplace_id)
      .eq('chat_id', chat_id)
      .single();

    if (!chatRecord) {
      return new Response(
        JSON.stringify({ success: false, error: 'Chat not found' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 404 }
      );
    }

    // Send message to OZON API
    console.log(`[send-chat-message] Calling OZON API to send message`);

    const ozonResponse = await fetch('https://api-seller.ozon.ru/v1/chat/send/message', {
      method: 'POST',
      headers: {
        'Client-Id': cred.client_id,
        'Api-Key': cred.client_secret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chat_id,
        text: text,
      }),
    });

    if (!ozonResponse.ok) {
      const errorText = await ozonResponse.text();
      console.error('[send-chat-message] OZON API error:', errorText);

      return new Response(
        JSON.stringify({
          success: false,
          error: `OZON API error: ${ozonResponse.status}`,
          details: errorText
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
      );
    }

    const result = await ozonResponse.json();
    console.log('[send-chat-message] Message sent successfully:', result);

    // Save message to database
    const messageId = result.message_id || `msg_${Date.now()}`;

    const { error: messageError } = await supabase
      .from('chat_messages')
      .insert({
        chat_id: chatRecord.id,
        message_id: String(messageId),
        sender_type: 'seller',
        sender_name: null,
        text: text,
        is_read: true,
        sent_at: new Date().toISOString(),
      });

    if (messageError) {
      console.error('[send-chat-message] Error saving message to database:', messageError);
      // Don't fail the request - message was sent successfully to OZON
    }

    // Update chat updated_at timestamp
    await supabase
      .from('chats')
      .update({
        updated_at: new Date().toISOString(),
        last_message_text: text,
        last_message_at: new Date().toISOString(),
        last_message_from: 'seller',
      })
      .eq('id', chatRecord.id);

    return new Response(
      JSON.stringify({
        success: true,
        message_id: messageId,
        message: 'Сообщение отправлено',
      }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error: any) {
    console.error('[send-chat-message] Unexpected error:', error);

    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Unknown error' }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
    );
  }
});
