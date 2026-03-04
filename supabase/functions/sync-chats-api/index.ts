// VERSION: 2026-03-04-v7 - Fix direction 'Backward' (Forward returns empty):
// 1. historyData.messages (not historyData.result.messages — API has no result wrapper)
// 2. posting_number taken from chat list, not history
// 3. unread count uses message.user.type === 'Сustomer' (not message.sender_type)
// 4. Accept both snake_case (client_id/api_key) and camelCase (clientId/apiKey) from cron
// 5. Batch processing: only fetch history for batch_size chats per run (default 30)
// BRANCH: main
// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_BATCH_SIZE = 30;

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
    // Accept both snake_case (client_id/api_key) and camelCase (clientId/apiKey)
    const body = await req.json();
    let { marketplace_id, ozon_seller_id, user_id, chat_ids } = body;
    let client_id = body.client_id || body.clientId;
    let api_key = body.api_key || body.apiKey;
    const batch_size = body.batch_size || DEFAULT_BATCH_SIZE;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
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

    console.log(`[sync-chats-api] Starting chats sync for marketplace ${marketplace_id} (batch_size=${batch_size})`);

    // Update status
    await supabase
      .from('marketplaces')
      .update({ last_sync_status: 'syncing' })
      .eq('id', marketplace_id);

    // chatsToSync: array of { chatId, postingNumber }
    let chatsToSync: { chatId: string; postingNumber: string }[] = [];

    // If specific chat_ids provided, use them
    if (chat_ids && chat_ids.length > 0) {
      chatsToSync = chat_ids.map((id: string) => ({ chatId: id, postingNumber: id }));
      console.log(`[sync-chats-api] Syncing ${chatsToSync.length} specific chats`);
    } else {
      // Otherwise, fetch all active chats from OZON API
      console.log(`[sync-chats-api] Fetching active chats from OZON API`);

      let hasMore = true;
      let cursor = '';

      while (hasMore) {
        const listResponse = await fetch('https://api-seller.ozon.ru/v3/chat/list', {
          method: 'POST',
          headers: {
            'Client-Id': client_id,
            'Api-Key': api_key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filter: {
              chat_status: 'OPENED',
            },
            limit: 100,
            cursor: cursor || undefined,
          }),
        });

        if (!listResponse.ok) {
          console.error(`[sync-chats-api] Error fetching chat list:`, await listResponse.text());
          break;
        }

        const listData = await listResponse.json();
        const chats = listData.chats || [];

        console.log(`[sync-chats-api] Fetched ${chats.length} chats from OZON API`);

        for (const chatData of chats) {
          const chatObj = chatData.chat || chatData; // handle both {chat: {...}} and flat structure
          if (chatObj.chat_id) {
            chatsToSync.push({
              chatId: chatObj.chat_id,
              postingNumber: chatObj.posting_number || chatObj.chat_id,
            });
          }
        }

        cursor = listData.cursor || '';
        hasMore = !!(listData.has_next && cursor && chats.length > 0);

        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`[sync-chats-api] Total active chats found: ${chatsToSync.length}`);
    }

    // STEP 1: Quick batch upsert ALL chat records (no history fetch — fast)
    let quickUpserted = 0;
    const UPSERT_BATCH = 100;
    for (let i = 0; i < chatsToSync.length; i += UPSERT_BATCH) {
      const batch = chatsToSync.slice(i, i + UPSERT_BATCH);
      try {
        const rows = batch.map(({ chatId, postingNumber }) => ({
          marketplace_id,
          chat_id: chatId,
          posting_number: postingNumber,
          status: 'active',
          updated_at: new Date().toISOString(),
        }));
        const { error: batchError } = await supabase
          .from('chats')
          .upsert(rows, {
            onConflict: 'marketplace_id,chat_id',
            ignoreDuplicates: false,
          });
        if (batchError) {
          console.error(`[sync-chats-api] Batch upsert error:`, batchError);
        } else {
          quickUpserted += batch.length;
        }
      } catch (_err) {
        console.error(`[sync-chats-api] Batch upsert exception:`, _err);
      }
    }
    console.log(`[sync-chats-api] Quick-upserted ${quickUpserted} chat records in ${Math.ceil(chatsToSync.length / UPSERT_BATCH)} batches`);

    // STEP 2: Fetch message history only for a BATCH of chats
    // Prioritize chats that haven't been synced (no last_message_at) or oldest synced
    const { data: chatsNeedingSync } = await supabase
      .from('chats')
      .select('id, chat_id, posting_number')
      .eq('marketplace_id', marketplace_id)
      .eq('status', 'active')
      .order('last_message_at', { ascending: true, nullsFirst: true })
      .limit(batch_size);

    const chatBatch = chatsNeedingSync || [];
    console.log(`[sync-chats-api] Processing message history for ${chatBatch.length} chats (batch of ${batch_size})`);

    let totalMessages = 0;
    let totalChats = 0;

    for (const chatRecord of chatBatch) {
      try {
        const chatId = chatRecord.chat_id;
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
            direction: 'Backward',
            limit: 1000,
          }),
        });

        if (!historyResponse.ok) {
          console.error(`[sync-chats-api] Error fetching chat ${chatId}:`, await historyResponse.text());
          continue;
        }

        const historyData = await historyResponse.json();

        // API returns { has_next, messages } — not wrapped in result
        const messages = historyData.messages || [];

        console.log(`[sync-chats-api] Found ${messages.length} messages in chat ${chatId}`);

        // Extract context from any message that has it (order_number, product_sku)
        const contextMsg = messages.find((m: any) => m.context?.order_number || m.context?.sku);
        const context = contextMsg?.context || {};
        const orderNumber = context.order_number || null;
        const productSku = context.sku || null;

        // Update chat with context info
        if (orderNumber || productSku) {
          await supabase
            .from('chats')
            .update({
              order_number: orderNumber,
              product_sku: productSku,
            })
            .eq('id', chatRecord.id);
        }

        totalChats++;

        // Process messages
        let unreadCount = 0;

        for (const message of messages) {
          try {
            const messageData = message.data || [];
            const isImage = message.is_image || false;
            const imageUrls = isImage && Array.isArray(messageData) ? messageData : [];
            const textContent = !isImage && Array.isArray(messageData) && messageData.length > 0
              ? messageData.join('\n')
              : (message.text || '');

            // OZON returns user.type === 'Сustomer' (with Cyrillic С) for buyer
            const isBuyer = message.user?.type === 'Сustomer';
            const senderType = isBuyer ? 'buyer' : 'seller';

            const { error: messageError } = await supabase
              .from('chat_messages')
              .upsert({
                chat_id: chatRecord.id,
                message_id: String(message.message_id || message.id),
                sender_type: senderType,
                sender_name: message.user?.id || null,
                text: textContent || '',
                is_read: message.is_read || false,
                is_image: isImage,
                image_urls: imageUrls.length > 0 ? imageUrls : null,
                moderate_status: message.moderate_image_status || null,
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

              if (isBuyer && !message.is_read) {
                unreadCount++;
              }
            }
          } catch (err) {
            console.error(`[sync-chats-api] Error processing message:`, err);
          }
        }

        // Update chat with correct unread count and last message info
        const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
        const lastMsgData = lastMsg?.data || [];
        const lastMsgText = lastMsg
          ? (!lastMsg.is_image && lastMsgData.length > 0 ? lastMsgData[0] : (lastMsg.text || ''))
          : null;

        await supabase
          .from('chats')
          .update({
            unread_count: unreadCount,
            ...(lastMsg ? {
              last_message_text: lastMsgText,
              last_message_at: lastMsg.created_at || new Date().toISOString(),
              last_message_from: lastMsg.user?.type === 'Сustomer' ? 'buyer' : 'seller',
            } : {
              // Even if no messages, update last_message_at so this chat moves to end of queue
              last_message_at: new Date().toISOString(),
            }),
          })
          .eq('id', chatRecord.id);

        // Reduced delay between chats
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (err) {
        console.error(`[sync-chats-api] Error syncing chat ${chatRecord.chat_id}:`, err);
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

    const remaining = chatsToSync.length - chatBatch.length;
    console.log(`[sync-chats-api] Batch done: ${totalChats} chats, ${totalMessages} messages. ${remaining > 0 ? remaining + ' chats remaining for next run.' : 'All chats synced.'}`);

    return new Response(
      JSON.stringify({
        success: true,
        chats_count: totalChats,
        chats_total: chatsToSync.length,
        messages_count: totalMessages,
        remaining: remaining > 0 ? remaining : 0,
        message: `Синхронизировано ${totalChats} чатов (${totalMessages} сообщений)${remaining > 0 ? `. Осталось: ${remaining}` : ''}`,
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
