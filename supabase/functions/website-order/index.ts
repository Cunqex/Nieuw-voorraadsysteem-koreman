// Koppeling met de webshop (Shopify, koremanmaastricht.nl).
// 1) Shopify stuurt elke nieuwe order hierheen (webhook orders/create). De order wordt een verkooporder in de
//    voorraad-app; regels die niet op voorraad zijn krijgen meteen een concept-inkooporder.
// 2) De voorraad-app (Instellingen) kan hier de koppeling controleren en aanzetten.
// Sleutels staan als secrets bij Supabase: SHOPIFY_CLIENT_ID en SHOPIFY_CLIENT_SECRET (van de eigen app in Shopify).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';

const WINKEL = Deno.env.get('SHOPIFY_SHOP') ?? '8r5tm0-vc.myshopify.com';
const API = '2026-10';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
const db = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const eigenUrl = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1/website-order`;

const gelijk = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let v = 0;
  for (let i = 0; i < a.length; i++) v |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return v === 0;
};
async function hmac(tekst: string, geheim: string) {
  const sleutel = await crypto.subtle.importKey('raw', new TextEncoder().encode(geheim), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return encodeBase64(new Uint8Array(await crypto.subtle.sign('HMAC', sleutel, new TextEncoder().encode(tekst))));
}

// deno-lint-ignore no-explicit-any
type Vrij = any;
const adres = (a: Vrij) => (a ? { naam: a.name, bedrijf: a.company, adres1: a.address1, adres2: a.address2, postcode: a.zip, plaats: a.city, land: a.country, telefoon: a.phone } : null);
// Een order zoals Shopify hem stuurt -> de vorm die website_order_ontvangen verwacht
export function vanShopify(o: Vrij) {
  return {
    order: o.name,
    datum: o.created_at,
    email: o.email ?? o.contact_email ?? o.customer?.email ?? null,
    telefoon: o.phone ?? o.customer?.phone ?? null,
    betaald: String(o.financial_status ?? '').toUpperCase(),
    totaal: o.current_total_price ?? o.total_price,
    btw: o.current_total_tax ?? o.total_tax,
    verzendkosten: o.total_shipping_price_set?.shop_money?.amount ?? '0',
    incl_btw: String(o.taxes_included ?? true),
    opmerking: [o.test ? 'TESTORDER (testbetaling in Shopify)' : null, o.note].filter(Boolean).join('\n') || null,
    klant: { voornaam: o.customer?.first_name, achternaam: o.customer?.last_name, bedrijf: o.customer?.default_address?.company },
    factuuradres: adres(o.billing_address),
    afleveradres: adres(o.shipping_address),
    regels: (o.line_items ?? []).map((li: Vrij) => ({
      sku: li.sku, titel: li.title, variant: li.variant_title, aantal: li.quantity, prijs: li.price,
      korting: (li.discount_allocations ?? []).reduce((s: number, d: Vrij) => s + Number(d.amount || 0), 0).toFixed(2),
    })),
  };
}

async function shopifyToken() {
  const id = Deno.env.get('SHOPIFY_CLIENT_ID'); const geheim = Deno.env.get('SHOPIFY_CLIENT_SECRET');
  if (!id || !geheim) throw new Error('De sleutels van de Shopify-app zijn nog niet ingevuld bij Supabase (SHOPIFY_CLIENT_ID en SHOPIFY_CLIENT_SECRET).');
  const r = await fetch(`https://${WINKEL}/admin/oauth/access_token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: geheim }),
  });
  const t = await r.json().catch(() => ({}));
  if (!r.ok || !t.access_token) throw new Error(`Shopify geeft geen toegang (${r.status}): ${t.error_description ?? t.error ?? 'onbekende fout'}. Is de app geïnstalleerd op de winkel en kloppen de sleutels?`);
  return { token: t.access_token as string, rechten: String(t.scope ?? '') };
}
async function gql(token: string, query: string, variables: Vrij = {}) {
  const r = await fetch(`https://${WINKEL}/admin/api/${API}/graphql.json`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token }, body: JSON.stringify({ query, variables }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.errors) throw new Error(`Shopify-fout (${r.status}): ${JSON.stringify(j.errors ?? j).slice(0, 300)}`);
  return j.data;
}

// Controleren (en met aanzetten = true: instellen) dat Shopify nieuwe orders hierheen stuurt
async function koppeling(aanzetten: boolean) {
  const { token, rechten } = await shopifyToken();
  const d = await gql(token, `{ shop { name } webhookSubscriptions(first: 50) { nodes { id topic uri } } }`);
  let actief = (d.webhookSubscriptions.nodes as Vrij[]).some((w) => w.topic === 'ORDERS_CREATE' && w.uri === eigenUrl());
  if (!actief && aanzetten) {
    const m = await gql(token, `mutation($sub: WebhookSubscriptionInput!) { webhookSubscriptionCreate(topic: ORDERS_CREATE, webhookSubscription: $sub) { webhookSubscription { id } userErrors { field message } } }`,
      { sub: { uri: eigenUrl(), format: 'JSON' } });
    const fout = m.webhookSubscriptionCreate.userErrors?.[0];
    if (fout) throw new Error(`Shopify weigert de koppeling: ${fout.message}`);
    actief = true;
  }
  return { winkel: d.shop.name, rechten, actief };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { fout: 'Alleen POST' });
  const rauw = await req.text();

  // ---- 1) Order van Shopify ----
  const handtekening = req.headers.get('x-shopify-hmac-sha256');
  if (handtekening) {
    const geheim = Deno.env.get('SHOPIFY_CLIENT_SECRET') ?? '';
    if (!geheim || !gelijk(await hmac(rauw, geheim), handtekening)) return json(401, { fout: 'Ongeldige handtekening' });
    if (req.headers.get('x-shopify-topic') !== 'orders/create') return json(200, { overgeslagen: 'ander onderwerp' });
    const sb = db();
    let naam: string | null = null;
    try {
      const order = JSON.parse(rauw); naam = order?.name ?? null;
      const { data, error } = await sb.rpc('website_order_ontvangen', { p: vanShopify(order) });
      if (error) throw new Error(error.message);
      if (data?.nieuw) {
        await sb.from('website_meldingen').insert({
          website_order: naam, gelukt: true, verkooporder_id: data.verkooporder_id,
          melding: (data.melding ?? `Verkooporder ${data.ordernummer} aangemaakt`) + (data.inkooporders ? `, ${data.inkooporders} concept-inkooporder(s)` : '') + (data.regels_los ? `, ${data.regels_los} regel(s) zonder artikel` : ''),
        });
      }
      return json(200, data);
    } catch (e) {
      // Wel 200 teruggeven: anders blijft Shopify het opnieuw proberen en zet het de koppeling uiteindelijk uit. De fout staat in het logboek.
      await sb.from('website_meldingen').insert({ website_order: naam, gelukt: false, melding: (e as Error).message.slice(0, 500) });
      return json(200, { fout: (e as Error).message });
    }
  }

  // ---- 2) Vanuit de voorraad-app: alleen voor ingelogde gebruikers ----
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: wie } = await db().auth.getUser(jwt);
  if (!wie?.user) return json(401, { fout: 'Niet ingelogd' });
  let vraag: Vrij = {};
  try { vraag = JSON.parse(rauw || '{}'); } catch { /* leeg */ }
  try {
    return json(200, await koppeling(vraag.actie === 'koppel'));
  } catch (e) {
    return json(200, { fout: (e as Error).message });
  }
});
