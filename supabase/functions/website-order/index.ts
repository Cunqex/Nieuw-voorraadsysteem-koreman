// Ontvangt een websiteorder uit de Shopify-admin (knop "Naar voorraadportaal", via Shopify Flow)
// en zet die als verkooporder in de voorraad-app. Alleen verzoeken met de juiste sleutel worden verwerkt.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const gelijk = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let v = 0;
  for (let i = 0; i < a.length; i++) v |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return v === 0;
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { fout: 'Alleen POST' });
  const sleutel = Deno.env.get('WEBSITE_SLEUTEL') ?? '';
  const gekregen = req.headers.get('x-koreman-sleutel') ?? '';
  if (!sleutel || !gelijk(sleutel, gekregen)) return json(401, { fout: 'Geen toegang' });

  let order: unknown;
  try { order = await req.json(); } catch { return json(400, { fout: 'De order kon niet gelezen worden (geen geldige JSON)' }); }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await sb.rpc('website_order_ontvangen', { p: order });
  if (error) return json(422, { fout: error.message });
  return json(200, data);
});
