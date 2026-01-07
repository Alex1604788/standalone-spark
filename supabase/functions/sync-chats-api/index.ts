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
    let { marketplace_id, ozon_seller_id, user_id, client_id, api_key, chat_ids } = await req.json();

    const supabase = createClient(
      Deno.env.get('OZON_SUPABASE_URL')!,
      Deno.env.get('OZON_SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Resolve marketplace_id if not provided
    if (!marketplace_id && ozon_seller_id && user_id) {
      console.log(`[sync-chats-api] Resolving marketplace_id for user ${user_id}, seller ${ozon_seller_id}`);

      const { data: marketplace } = await supabase
        .from('marketplaces')
        .select('id, api_key_encrypted, service_account_email')
        .eq('user_id', user_id)
        .eq('ozon_seller_id', ozon_seller_id)
        .maybeSingle();

      if (!marketplace) {
        return new Response(
          JSON.stringify({ success: false, error: 'Marketplace not found' }),
          { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 404 }
        );
      }

      marketplace_id = marketplace.id;
      client_id = client_id || marketplace.service_account_email;
      api_key = api_key || marketplace.api_key_encrypted;
    }

    if (!marketplace_id || !client_id || !api_key) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required parameters' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 400 }
      );
    }

    console.log(`[sync-chats-api] Starting chats sync for marketplace ${marketplace_id}`);

    // Update status
    await supabase
      .from('marketplaces')
      .update({ last_sync_status: 'syncing' })
      .eq('id', marketplace_id);

    // Get existing chats from database to sync only active ones
    const { data: existingChats } = await supabase
      .from('chats')
      .select('chat_id, posting_number')
      .eq('marketplace_id', marketplace_id)
      .eq('status', 'active');

    // If chat_ids provided, sync only those, otherwise sync all existing active chats
    const chatsToSync = chat_ids || (existingChats?.map(c => c.chat_id) || []);

    console.log(`[sync-chats-api] Syncing ${chatsToSync.length} chats`);

    let totalMessages = 0;
    let totalChats = 0;

    for (const chatId of chatsToSync) {
      try {
        console.log(`[sync-chats-api] Fetching history for chat ${chatId}`);

        // Fetch chat history from OZON API
        const historyResponse = await fetch('https://api-seller.ozon.ru/v3/chat/history', {
          method: 'POST',
          headers: {
            'Client-Id': client_id,
            'Api-Key': api_key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: chatId,
            limit: 1000, // Get all messages
          }),
        });

        if (!historyResponse.ok) {
          console.error(`[sync-chats-api] Error fetching chat ${chatId}:`, await historyResponse.text());
          continue;
        }

        const historyData = await historyResponse.json();
        const result = historyData.result || {};
        const messages = result.messages || [];
        const postingNumber = result.posting_number || chatId;

        console.log(`[sync-chats-api] Found ${messages.length} messages in chat ${chatId}`);

        if (messages.length === 0) {
          continue;
        }

        // Upsert chat
        const { data: chat, error: chatError } = await supabase
          .from('chats')
          .upsert({
            marketplace_id,
            chat_id: chatId,
            posting_number: postingNumber,
            status: 'active',
            unread_count: 0, // Will be calculated from messages
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'marketplace_id,chat_id',
            ignoreDuplicates: false,
          })
          .select()
          .single();

        if (chatError || !chat) {
          console.error(`[sync-chats-api] Error upserting chat ${chatId}:`, chatError);
          continue;
        }

        totalChats++;

        // Process messages
        let unreadCount = 0;

        for (const message of messages) {
          try {
            const { error: messageError } = await supabase
              .from('chat_messages')
              .upsert({
                chat_id: chat.id,
                message_id: String(message.id),
                sender_type: message.sender_type || 'buyer',
                sender_name: message.sender_name || null,
                text: message.text || '',
                is_read: message.is_read || false,
                sent_at: message.created_at || new Date().toISOString(),
                created_at: new Date().toISOString(),
              }, {
                onConflict: 'chat_id,message_id',
                ignoreDuplicates: false,
              });

            if (messageError) {
              console.error(`[sync-chats-api] Error upserting message:`, messageError);
            } else {
              totalMessages++;

              // Count unread buyer messages
              if (message.sender_type === 'buyer' && !message.is_read) {
                unreadCount++;
              }
            }
          } catch (err) {
            console.error(`[sync-chats-api] Error processing message:`, err);
          }
        }

        // Update chat with actual unread count
        await supabase
          .from('chats')
          .update({ unread_count: unreadCount })
          .eq('id', chat.id);

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (err) {
        console.error(`[sync-chats-api] Error syncing chat ${chatId}:`, err);
      }
    }

    // Update marketplace status and last sync timestamp
    await supabase
      .from('marketplaces')
      .update({
        last_chats_sync_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'success',
        last_sync_error: null,
      })
      .eq('id', marketplace_id);

    console.log(`[sync-chats-api] Successfully synchronized ${totalChats} chats with ${totalMessages} messages`);

    return new Response(
      JSON.stringify({
        success: true,
        chats_count: totalChats,
        messages_count: totalMessages,
        message: `Синхронизировано ${totalChats} чатов (${totalMessages} сообщений)`,
      }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error: any) {
    console.error('[sync-chats-api] Unexpected error:', error);

    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Unknown error' }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
    );
  }
});
