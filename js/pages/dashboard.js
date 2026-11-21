// Overzicht: de lopende verkoop- en inkooporders.
import { sb, check, esc, money, setTitle, withTotals, alles, loadImages } from '../ui.js?v=20261121142910';
import { metRegels, vkKaart, ikKaart } from '../orderkaart.js?v=20261121142910';

const STAP = 8;

export async function render(c) {
  setTitle('Overzicht');
  const [pos, sos] = await Promise.all([
    alles(() => sb.from('inkooporders').select('id, ordernummer, status, orderdatum, leverdatum, valuta, voor_wie, leveranciers(naam), klanten(naam), verkooporders(id, orderbev_nummer, offertenummer, klanten(naam)), referentie').not('status', 'in', '(ontvangen,geannuleerd)').order('orderdatum', { ascending: false })),
    alles(() => sb.from('verkooporders').select('id, offertenummer, orderbev_nummer, factuurnummer, status, orderdatum, klant_referentie, klanten(naam)').not('status', 'in', '(betaald,geannuleerd)').order('orderdatum', { ascending: false })),
  ]);
  await Promise.all([withTotals(sos, 'v_verkooporder_totalen', 'verkooporder_id'), withTotals(pos, 'v_inkooporder_totalen', 'inkooporder_id')]);
  const t = (r) => r._t || {};
  const open = (s) => Math.max(0, Number(t(s).totaal || 0) - Number(t(s).betaald || 0));

  const nu = new Date();
  c.innerHTML = `
    <div class="page-head db-kop"><div><h1>Overzicht</h1><p class="muted db-datum">${nu.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div><span class="spacer"></span>
      <a class="btn" href="#/artikel/new"><i data-lucide="plus"></i> Nieuw artikel</a>
      <a class="btn" href="#/inkoop?nieuw=1"><i data-lucide="plus"></i> Inkooporder</a>
      <a class="btn primary" href="#/verkoop?nieuw=1"><i data-lucide="plus"></i> Verkooporder</a>
    </div>
    <section class="card db-sectie" id="db-vk"></section>
    <section class="card db-sectie" id="db-ik"></section>`;

  // ---------- Verkoop ----------
  const vk = { f: 'alle', n: STAP };
  const VK_F = [['alle', 'Alle'], ['offerte', 'Offertes'], ['bevestigd', 'Bevestigd'], ['geleverd', 'Geleverd'], ['gefactureerd', 'Gefactureerd']];
  const tekenVk = async () => {
    const lijst = sos.filter((s) => vk.f === 'alle' || s.status === vk.f);
    await metRegels(lijst.slice(0, vk.n), 'verkooporder_regels', 'verkooporder_id');
    const orders = sos.filter((s) => s.status !== 'offerte');
    const telling = (k) => (k === 'alle' ? sos.length : sos.filter((s) => s.status === k).length);
    $('#db-vk').innerHTML = `
      <div class="db-sectie-kop"><div><h2><i data-lucide="file-text"></i> Lopende verkooporders</h2>
        <p class="db-samen"><b>${sos.length}</b> lopend · <b>${money(orders.reduce((x, s) => x + open(s), 0))}</b> nog te ontvangen</p></div>
        <a class="btn small" href="#/verkoop">Alle verkooporders</a></div>
      <div class="db-tabs">${VK_F.map(([k, l]) => `<button type="button" class="db-tab ${vk.f === k ? 'aan' : ''}" data-f="${k}">${l} <span>${telling(k)}</span></button>`).join('')}</div>
      <div class="art-grid ord-grid">${lijst.slice(0, vk.n).map(vkKaart).join('') || '<p class="empty">Geen orders.</p>'}</div>
      ${lijst.length > vk.n ? `<button type="button" class="db-meer" data-meer>Toon meer (nog ${lijst.length - vk.n})</button>` : ''}`;
    loadImages($('#db-vk'));
  };
  $('#db-vk').addEventListener('click', (e) => {
    const f = e.target.closest('[data-f]'); if (f) { vk.f = f.dataset.f; vk.n = STAP; tekenVk(); }
    if (e.target.closest('[data-meer]')) { vk.n += 16; tekenVk(); }
  });

  // ---------- Inkoop ----------
  const ik = { f: 'alle', n: STAP };
  const IK_F = [['alle', 'Alle'], ['concept', 'Concept'], ['verstuurd', 'Verstuurd'], ['bevestigd', 'Bevestigd'], ['in_productie', 'In productie'], ['verzonden', 'Verzonden']];
  const tekenIk = async () => {
    const lijst = pos.filter((p) => ik.f === 'alle' || p.status === ik.f);
    await metRegels(lijst.slice(0, ik.n), 'inkooporder_regels', 'inkooporder_id');
    const telling = (k) => (k === 'alle' ? pos.length : pos.filter((p) => p.status === k).length);
    $('#db-ik').innerHTML = `
      <div class="db-sectie-kop"><div><h2><i data-lucide="truck"></i> Lopende inkooporders</h2>
        <p class="db-samen"><b>${pos.length}</b> lopend · <b>${telling('concept')}</b> nog te versturen · <b>${telling('in_productie') + telling('verzonden')}</b> in productie of onderweg</p></div>
        <a class="btn small" href="#/inkoop">Alle inkooporders</a></div>
      <div class="db-tabs">${IK_F.map(([k, l]) => `<button type="button" class="db-tab ${ik.f === k ? 'aan' : ''}" data-f="${k}">${l} <span>${telling(k)}</span></button>`).join('')}</div>
      <div class="art-grid ord-grid">${lijst.slice(0, ik.n).map(ikKaart).join('') || '<p class="empty">Geen orders.</p>'}</div>
      ${lijst.length > ik.n ? `<button type="button" class="db-meer" data-meer>Toon meer (nog ${lijst.length - ik.n})</button>` : ''}`;
    loadImages($('#db-ik'));
  };
  $('#db-ik').addEventListener('click', (e) => {
    const f = e.target.closest('[data-f]'); if (f) { ik.f = f.dataset.f; ik.n = STAP; tekenIk(); }
    if (e.target.closest('[data-meer]')) { ik.n += 16; tekenIk(); }
  });

  function $(sel) { return c.querySelector(sel); }
  await Promise.all([tekenVk(), tekenIk()]);
}
