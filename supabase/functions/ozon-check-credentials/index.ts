// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 405 }
    )
  }

  try {
    const body = await req.json().catch(() => ({}))
    const client_id = String((body?.client_id ?? '')).trim()
    const api_key = String((body?.api_key ?? '')).trim()

    console.log('🔍 ozon-check-credentials: received request', {
      has_client_id: !!client_id,
      has_api_key: !!api_key,
      client_id_valid: /^\d+$/.test(client_id)
    })

    if (!client_id || !/^\d+$/.test(client_id)) {
      console.error('❌ ozon-check-credentials: Invalid client_id', { client_id })
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid client_id: must be digits' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 400 }
      )
    }
    if (!api_key) {
      console.error('❌ ozon-check-credentials: api_key is missing')
      return new Response(
        JSON.stringify({ success: false, error: 'api_key is required' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 400 }
      )
    }

    const proxyUrl = Deno.env.get('OZON_PROXY_URL')
    const baseUrl = proxyUrl && proxyUrl.trim() !== '' ? proxyUrl.trim().replace(/\/$/, '') : 'https://api-seller.ozon.ru'
    const endpoint = `${baseUrl}/v2/product/list`

    console.log('🌐 ozon-check-credentials: calling Ozon API', { endpoint })

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Client-Id': client_id,
        'Api-Key': api_key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: { visibility: 'ALL' },
        limit: 1,
        last_id: '',
      }),
    })

    console.log('📡 ozon-check-credentials: Ozon API response', { 
      status: resp.status, 
      ok: resp.ok,
      contentType: resp.headers.get('content-type')
    })

    const contentType = resp.headers.get('content-type') || ''
    if (!resp.ok) {
      const text = await resp.text()
      console.error('❌ ozon-check-credentials: Ozon API error', { status: resp.status, response: text.slice(0, 200) })
      return new Response(
        JSON.stringify({ success: false, status: resp.status, message: text.slice(0, 200) }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 400 }
      )
    }

    if (!contentType.includes('application/json')) {
      const text = await resp.text()
      console.error('❌ ozon-check-credentials: Non-JSON response', { contentType, response: text.slice(0, 200) })
      return new Response(
        JSON.stringify({ success: false, status: resp.status, message: text.slice(0, 200) }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 400 }
      )
    }

    console.log('✅ ozon-check-credentials: Success')
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 200 }
    )
  } catch (e: any) {
    console.error('❌ ozon-check-credentials: Unexpected error', { error: e?.message, stack: e?.stack })
    return new Response(
      JSON.stringify({ success: false, error: e?.message || 'Unknown error' }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
    )
  }
})
