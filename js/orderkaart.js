// Kaartjes voor verkoop- en inkooporders (zelfde stijl als de artikelkaarten).
import { sb, check, esc, money, datum, badge, PO_STATUS, SO_STATUS } from './ui.js?v=20261121143249';

// Haalt per order de regels op (artikelnaam + foto), voor de foto's en de inhoud op het kaartje.
export async function metRegels(rows, tabel, key) {
  const nodig = rows.filter((r) => !r._r);
  if (!nodig.length) return rows;
  const ids = nodig.map((r) => r.id);
  const delen = [];
  for (let i = 0; i < ids.length; i += 150) delen.push(ids.slice(i, i + 150));
  const out = (await Promise.all(delen.map((d) => sb.from(tabel)
    .select(`${key}, omschrijving, aantal, volgorde, artikelen(artikelnummer, naam, foto_pad, designs(hoofdfoto_pad))`)
    .in(key, d).order('volgorde').order('id').limit(5000)))).flatMap(check);
  const per = new Map();
  out.forEach((l) => { const a = per.get(l[key]) || []; a.push(l); per.set(l[key], a); });
  nodig.forEach((r) => { r._r = per.get(r.id) || []; });
  return rows;
}

const fotoVan = (l) => l.artikelen?.foto_pad || l.artikelen?.designs?.hoofdfoto_pad || '';

function fotos(regels) {
  const paden = [...new Set(regels.map(fotoVan).filter(Boolean))];
  const toon = paden.slice(0, 3);
  if (!toon.length) return `<div class="ord-img leeg"><i data-lucide="${regels.length ? 'image-off' : 'file-plus'}"></i></div>`;
  const rest = paden.length - toon.length;
  return `<div class="ord-img n${toon.length}">${toon.map((p, i) => `<span><img data-path="${esc(p)}" alt="" loading="lazy">${rest > 0 && i === toon.length - 1 ? `<em>+${rest}</em>` : ''}</span>`).join('')}</div>`;
}

function inhoud(regels) {
  const namen = regels.map((l) => (l.artikelen ? `${l.artikelen.artikelnummer} ${l.artikelen.naam}` : l.omschrijving)).filter((x) => x && x.trim());
  if (!namen.length) return '<span class="muted">Nog geen regels</span>';
  const st = regels.reduce((x, l) => x + (Number(l.aantal) || 0), 0);
  return `${esc(namen[0])}${namen.length > 1 ? ` <span class="muted">+ ${namen.length - 1} meer</span>` : ''}<span class="ord-stuks">${st} st.</span>`;
}

export const soNummer = (s) => (s.factuurnummer ? 'F ' + s.factuurnummer : s.orderbev_nummer ? 'OB ' + s.orderbev_nummer : s.offertenummer ? 'OF ' + s.offertenummer : 'Concept');
const OPEN = ['bevestigd', 'geleverd', 'gefactureerd'];

export function vkKaart(s) {
  const t = s._t || {};
  const tot = Number(t.totaal || 0);
  const bet = Number(t.betaald || 0);
  const open = Math.max(0, tot - bet);
  const pct = tot ? Math.min(100, Math.round((bet / tot) * 100)) : 0;
  const nrs = [s.offertenummer && 'OF ' + s.offertenummer, s.orderbev_nummer && 'OB ' + s.orderbev_nummer, s.factuurnummer && 'F ' + s.factuurnummer].filter(Boolean);
  const geld = OPEN.includes(s.status) || s.status === 'betaald';
  return `<a class="art-card ord-card" href="#/verkoop/${s.id}">
    ${fotos(s._r || [])}
    <div class="art-body">
      <div class="ord-top"><span class="art-nr">${nrs.join(' · ') || 'Concept'}</span>${badge(SO_STATUS, s.status)}</div>
      <div class="art-naam">${esc(s.klanten?.naam || '–')}</div>
      <div class="art-meta">${[datum(s.orderdatum), s.klant_referentie].filter(Boolean).map(esc).join(' · ')}</div>
      <div class="art-meta ord-inhoud">${inhoud(s._r || [])}</div>
      <div class="art-foot ord-foot">
        <div><span class="art-prijs">${money(tot)}</span>${geld ? (open > 0.005 ? `<small class="ord-open">nog ${money(open)} open</small>` : '<small class="ord-ok">volledig betaald</small>') : '<small class="muted">offerte</small>'}</div>
        ${geld ? `<div class="ord-bet" title="${pct}% betaald"><div class="db-balk"><i style="width:${pct}%"></i></div><span>${pct}%</span></div>` : ''}
      </div>
    </div></a>`;
}

const lever = (p) => (/^\d{4}-\d{2}-\d{2}/.test(p.leverdatum || '') ? datum(p.leverdatum) : /^\d/.test(p.leverdatum || '') ? p.leverdatum : p.leverdatum ? 'z.s.m.' : '');

export function ikKaart(p) {
  const t = p._t || {};
  const v = p.verkooporders;
  const voor = v ? `${esc(v.klanten?.naam || p.klanten?.naam || 'klant')} <span class="muted">${v.orderbev_nummer ? 'OB ' + v.orderbev_nummer : v.offertenummer ? 'OF ' + v.offertenummer : ''}</span>`
    : p.voor_wie === 'klant' ? esc(p.klanten?.naam || 'klant') : 'Eigen voorraad';
  const lv = lever(p);
  return `<a class="art-card ord-card" href="#/inkoop/${p.id}">
    ${fotos(p._r || [])}
    <div class="art-body">
      <div class="ord-top"><span class="art-nr">PO ${p.ordernummer}</span>${badge(PO_STATUS, p.status)}</div>
      <div class="art-naam">${esc(p.leveranciers?.naam || '–')}</div>
      <div class="art-meta"><i data-lucide="user" class="ord-ic"></i> ${voor}</div>
      <div class="art-meta">Besteld ${datum(p.orderdatum) || '–'}${lv ? ` · levering ${esc(lv)}` : ''}${p.referentie ? ' · ' + esc(p.referentie) : ''}</div>
      <div class="art-meta ord-inhoud">${inhoud(p._r || [])}</div>
      <div class="art-foot ord-foot">
        <div><span class="art-prijs">${t.totaal != null ? money(t.totaal, p.valuta) : '–'}</span>${Number(t.betaald) > 0 ? `<small class="muted">${money(t.betaald, p.valuta)} betaald</small>` : ''}</div>
      </div>
    </div></a>`;
}
