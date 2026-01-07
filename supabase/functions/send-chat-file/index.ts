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
    const formData = await req.formData();
    const chat_id = formData.get('chat_id') as string;
    const marketplace_id = formData.get('marketplace_id') as string;
    const file = formData.get('file') as File;

    if (!chat_id || !marketplace_id || !file) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required parameters: chat_id, marketplace_id, file' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 400 }
      );
    }

    const supabase = createClient(
      Deno.env.get('OZON_SUPABASE_URL')!,
      Deno.env.get('OZON_SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log(`[send-chat-file] Sending file to chat ${chat_id}`);

    // Get marketplace and check if it has API credentials
    const { data: marketplace } = await supabase
      .from('marketplaces')
      .select('id, type')
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

    console.log(`[send-chat-file] Sync mode: ${syncMode}`);

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

    // Prepare file for OZON API
    const fileData = new FormData();
    fileData.append('chat_id', chat_id);
    fileData.append('file', file);

    // Send file to OZON API
    console.log(`[send-chat-file] Calling OZON API to send file (${file.name}, ${file.size} bytes)`);

    const ozonResponse = await fetch('https://api-seller.ozon.ru/v1/chat/send/file', {
      method: 'POST',
      headers: {
        'Client-Id': cred.client_id,
        'Api-Key': cred.client_secret,
      },
      body: fileData,
    });

    if (!ozonResponse.ok) {
      const errorText = await ozonResponse.text();
      console.error('[send-chat-file] OZON API error:', errorText);

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
    console.log('[send-chat-file] File sent successfully:', result);

    // Save message to database
    const messageId = result.message_id || `msg_file_${Date.now()}`;
    const fileUrl = result.file_url || '';

    const { error: messageError } = await supabase
      .from('chat_messages')
      .insert({
        chat_id: chatRecord.id,
        message_id: String(messageId),
        sender_type: 'seller',
        sender_name: null,
        text: file.name,
        is_read: true,
        is_image: file.type.startsWith('image/'),
        image_urls: fileUrl ? [fileUrl] : null,
        sent_at: new Date().toISOString(),
      });

    if (messageError) {
      console.error('[send-chat-file] Error saving message to database:', messageError);
      // Don't fail the request - file was sent successfully to OZON
    }

    // Update chat updated_at timestamp
    await supabase
      .from('chats')
      .update({
        updated_at: new Date().toISOString(),
        last_message_text: file.name,
        last_message_at: new Date().toISOString(),
        last_message_from: 'seller',
      })
      .eq('id', chatRecord.id);

    return new Response(
      JSON.stringify({
        success: true,
        message_id: messageId,
        file_url: fileUrl,
        message: 'Файл отправлен',
      }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error: any) {
    console.error('[send-chat-file] Unexpected error:', error);

    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Unknown error' }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
    );
  }
});
