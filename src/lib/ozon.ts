type OzonListReq = { filter?: Record<string, unknown>; last_id?: string | null; limit: number };
type OzonListItem = { product_id: number | string };
type OzonListResp = { items: OzonListItem[]; last_id: string | null };

async function ozonFetch<T>(endpoint: string, clientId: string, apiKey: string, body: unknown): Promise<T> {
  const res = await fetch(`https://api-seller.ozon.ru${endpoint}`, {
    method: "POST",
    headers: { "Client-Id": clientId, "Api-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  try {
    const json = JSON.parse(raw);
    if (!res.ok) throw new Error((json?.message || json?.error || `HTTP ${res.status}`));
    return json as T;
  } catch {
    throw new Error(`Ozon returned non-JSON (${res.status}): ${raw.slice(0, 200)}`);
  }
}

export async function fetchAllProductIds(clientId: string, apiKey: string): Promise<string[]> {
  const ids: string[] = [];
  let last_id: string | null = null;
  do {
    const req: OzonListReq = { filter: { visibility: "ALL" }, last_id, limit: 1000 };
    const resp = await ozonFetch<OzonListResp>("/v2/product/list", clientId, apiKey, req);
    (resp.items ?? []).forEach(i => ids.push(String(i.product_id)));
    last_id = resp.last_id ?? null;
  } while (last_id);
  return ids;
}

type OzonInfoReq = { product_id: string[] };
type OzonInfo = { 
  id: number | string; 
  offer_id?: string | null; 
  name?: string | null; 
  brand?: string | null; 
  images?: { link?: string }[] 
};
type OzonInfoResp = { result: OzonInfo[] };

export async function fetchProductDetailsBatched(
  clientId: string, 
  apiKey: string, 
  ids: string[],
): Promise<{ 
  external_id: string; 
  sku: string | null; 
  name: string | null; 
  brand: string | null; 
  image_url: string | null 
}[]> {
  const out: { 
    external_id: string; 
    sku: string | null; 
    name: string | null; 
    brand: string | null; 
    image_url: string | null 
  }[] = [];
  const chunk = 100;
  for (let i = 0; i < ids.length; i += chunk) {
    const req: OzonInfoReq = { product_id: ids.slice(i, i + chunk) };
    const resp = await ozonFetch<OzonInfoResp>("/v2/product/info/list", clientId, apiKey, req);
    for (const p of (resp.result ?? [])) {
      const img = Array.isArray(p.images) && p.images[0]?.link ? String(p.images[0].link) : null;
      out.push({ 
        external_id: String(p.id), 
        sku: p.offer_id ? String(p.offer_id) : null, 
        name: p.name ?? null, 
        brand: p.brand ?? null, 
        image_url: img 
      });
    }
  }
  return out;
}

export async function saveProductsToSupabase(
  supabaseUrl: string, 
  anonKey: string, 
  marketplaceId: string,
  items: { 
    external_id: string; 
    sku: string | null; 
    name: string | null; 
    brand: string | null; 
    image_url: string | null 
  }[]
) {
  const res = await fetch(`${supabaseUrl}/functions/v1/save-products`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json", 
      apikey: anonKey, 
      "x-client-info": "browser" 
    },
    body: JSON.stringify({ marketplace_id: marketplaceId, items }),
  });
  const raw = await res.text();
  const json = (() => { try { return JSON.parse(raw); } catch { return null; }})();
  if (!res.ok || json?.success === false) {
    throw new Error((json?.error || `HTTP ${res.status}`));
  }
  return json;
}
