// Overzicht: de lopende verkoop- en inkooporders.
import { sb, check, esc, money, datum, badge, PO_STATUS, SO_STATUS, setTitle, withTotals, alles } from '../ui.js?v=20261121130353';

const nrVan = (s) => (s.factuurnummer ? 'F ' + s.factuurnummer : s.orderbev_nummer ? 'OB ' + s.orderbev_nummer : s.offertenummer ? 'OF ' + s.offertenummer : 'Concept');
const STAP = 12;

export async function render(c) {
  setTitle('Overzicht');
  const [pos, sos] = await Promise.all([
    alles(() => sb.from('inkooporders').select('id, ordernummer, status, orderdatum, leverdatum, valuta, voor_wie, leveranciers(naam), klanten(naam), verkooporders(id, orderbev_nummer, offertenummer, klanten(naam))').not('status', 'in', '(ontvangen,geannuleerd)').order('orderdatum', { ascending: false })),
    alles(() => sb.from('verkooporders').select('id, offertenummer, orderbev_nummer, factuurnummer, status, orderdatum, klanten(naam)').not('status', 'in', '(betaald,geannuleerd)').order('orderdatum', { ascending: false })),
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
  const tekenVk = () => {
    const lijst = sos.filter((s) => vk.f === 'alle' || s.status === vk.f);
    const orders = sos.filter((s) => s.status !== 'offerte');
    const telling = (k) => (k === 'alle' ? sos.length : sos.filter((s) => s.status === k).length);
    $('#db-vk').innerHTML = `
      <div class="db-sectie-kop"><div><h2><i data-lucide="file-text"></i> Lopende verkooporders</h2>
        <p class="db-samen"><b>${sos.length}</b> lopend · <b>${money(orders.reduce((x, s) => x + open(s), 0))}</b> nog te ontvangen</p></div>
        <a class="btn small" href="#/verkoop">Alle verkooporders</a></div>
      <div class="db-tabs">${VK_F.map(([k, l]) => `<button type="button" class="db-tab ${vk.f === k ? 'aan' : ''}" data-f="${k}">${l} <span>${telling(k)}</span></button>`).join('')}</div>
      <div class="table-wrap"><table class="list db-tabel"><thead><tr><th>Nummer</th><th>Klant</th><th>Datum</th><th>Status</th><th class="num">Totaal</th><th class="num">Nog open</th><th class="db-bet">Betaald</th></tr></thead><tbody>
      ${lijst.slice(0, vk.n).map((s) => { const tot = Number(t(s).totaal || 0); const pct = tot ? Math.min(100, Math.round((Number(t(s).betaald || 0) / tot) * 100)) : 0; const off = s.status === 'offerte';
        return `<tr class="click" onclick="location.hash='#/verkoop/${s.id}'"><td class="db-nr">${nrVan(s)}</td><td>${esc(s.klanten?.naam || '–')}</td><td class="muted">${datum(s.orderdatum)}</td><td>${badge(SO_STATUS, s.status)}</td>
        <td class="num">${money(tot)}</td><td class="num">${off ? '<span class="muted">–</span>' : open(s) > 0.005 ? `<b>${money(open(s))}</b>` : '<span class="db-voldaan">voldaan</span>'}</td>
        <td class="db-bet">${off ? '' : `<div class="db-balk" title="${pct}% betaald"><i style="width:${pct}%"></i></div><span class="db-pct">${pct}%</span>`}</td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">Geen orders.</td></tr>'}
      </tbody></table></div>
      ${lijst.length > vk.n ? `<button type="button" class="db-meer" data-meer>Toon meer (${lijst.length - vk.n} van ${lijst.length})</button>` : ''}`;
  };
  $('#db-vk').addEventListener('click', (e) => {
    const f = e.target.closest('[data-f]'); if (f) { vk.f = f.dataset.f; vk.n = STAP; tekenVk(); }
    if (e.target.closest('[data-meer]')) { vk.n += 25; tekenVk(); }
  });

  // ---------- Inkoop ----------
  const ik = { f: 'alle', n: STAP };
  const IK_F = [['alle', 'Alle'], ['concept', 'Concept'], ['verstuurd', 'Verstuurd'], ['bevestigd', 'Bevestigd'], ['in_productie', 'In productie'], ['verzonden', 'Verzonden']];
  const voorWie = (p) => { const v = p.verkooporders; if (v) return `${esc(v.klanten?.naam || '')} <span class="muted">${v.orderbev_nummer ? 'OB ' + v.orderbev_nummer : v.offertenummer ? 'OF ' + v.offertenummer : ''}</span>`; return esc(p.klanten?.naam || (p.voor_wie === 'voorraad' ? 'Voorraad' : p.voor_wie || '–')); };
  const tekenIk = () => {
    const lijst = pos.filter((p) => ik.f === 'alle' || p.status === ik.f);
    const telling = (k) => (k === 'alle' ? pos.length : pos.filter((p) => p.status === k).length);
    $('#db-ik').innerHTML = `
      <div class="db-sectie-kop"><div><h2><i data-lucide="truck"></i> Lopende inkooporders</h2>
        <p class="db-samen"><b>${pos.length}</b> lopend · <b>${telling('concept')}</b> nog te versturen · <b>${telling('in_productie') + telling('verzonden')}</b> in productie of onderweg</p></div>
        <a class="btn small" href="#/inkoop">Alle inkooporders</a></div>
      <div class="db-tabs">${IK_F.map(([k, l]) => `<button type="button" class="db-tab ${ik.f === k ? 'aan' : ''}" data-f="${k}">${l} <span>${telling(k)}</span></button>`).join('')}</div>
      <div class="table-wrap"><table class="list db-tabel"><thead><tr><th>Nummer</th><th>Leverancier</th><th>Voor</th><th>Besteld</th><th>Levering</th><th>Status</th><th class="num">Bedrag</th></tr></thead><tbody>
      ${lijst.slice(0, ik.n).map((p) => `<tr class="click" onclick="location.hash='#/inkoop/${p.id}'"><td class="db-nr">PO ${p.ordernummer}</td><td>${esc(p.leveranciers?.naam || '–')}</td><td>${voorWie(p)}</td>
        <td class="muted">${datum(p.orderdatum)}</td><td class="muted">${esc(p.leverdatum || '–')}</td><td>${badge(PO_STATUS, p.status)}</td><td class="num">${t(p).totaal != null ? money(t(p).totaal, p.valuta) : '–'}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Geen orders.</td></tr>'}
      </tbody></table></div>
      ${lijst.length > ik.n ? `<button type="button" class="db-meer" data-meer>Toon meer (${lijst.length - ik.n} van ${lijst.length})</button>` : ''}`;
  };
  $('#db-ik').addEventListener('click', (e) => {
    const f = e.target.closest('[data-f]'); if (f) { ik.f = f.dataset.f; ik.n = STAP; tekenIk(); }
    if (e.target.closest('[data-meer]')) { ik.n += 25; tekenIk(); }
  });

  function $(sel) { return c.querySelector(sel); }
  tekenVk(); tekenIk();
}
