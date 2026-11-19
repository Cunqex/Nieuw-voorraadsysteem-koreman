// Staalkaart (B2B): het kaartje aan de stalen, zoals het Canva-ontwerp "B2B Stalen".
// Gegevens komen van de B2B-productpagina op koremanmaastricht.nl (collectie, compositie,
// maakwijze, knoopdichtheid, prijs per m², maatwerk per m²). De QR-code linkt naar die pagina,
// de streepjescode is het artikelnummer (Code 128) zodat de voorraad te scannen is.
import { sb, check, esc, $, toast } from './ui.js?v=20261119150808';
import { WEG, volgGebruiker, kaartWaarde, naVinkjes, keuzeSelect, zetWaarde, materiaalKeuze, METHODES_EN, KNOOP_EN, MATERIALEN_EN } from './keuzes.js?v=20261119150808';

const SITE = 'https://www.koremanmaastricht.nl';
export const productUrl = (handle) => `${SITE}/products/${handle}`;
// Inkoopcode op de kaart: 60 + inkoopprijs per m² afgerond op hele euro's + 4 (bv. € 398,16 per m² -> 603984)
// Inkoopprijs per m² van het artikel. Volgorde: de zelf ingevulde inkoopprijs per m² op het artikel,
// anders de laatste inkooporderregel (kostprijs in euro per stuk ÷ m²), anders inkoopprijs per stuk ÷ m².
// Zonder maat: de inkoopprijs per stuk. Met bron, zodat je in het venster ziet waar de code vandaan komt.
export async function inkoopInfo(a) {
  const opp = a.lengte_cm && a.breedte_cm ? (Number(a.lengte_cm) * Number(a.breedte_cm)) / 10000 : null;
  if (a.inkoopprijs_m2 != null && Number(a.inkoopprijs_m2) > 0) return { m2: Number(a.inkoopprijs_m2), bron: 'inkoopprijs per m² van het artikel' };
  let stuk = null;
  try {
    const { data } = await sb.from('v_inkoopregel_kostprijs').select('inkoopregel_id, kostprijs_eur_stuk').eq('artikel_id', a.id).order('inkoopregel_id', { ascending: false }).limit(1);
    if (data?.[0]?.kostprijs_eur_stuk != null) stuk = Number(data[0].kostprijs_eur_stuk);
  } catch { /* geen inkooporder */ }
  if (stuk != null && opp) return { m2: stuk / opp, bron: `inkooporder: € ${stuk.toFixed(2).replace('.', ',')} per stuk ÷ ${opp.toLocaleString('nl-NL', { maximumFractionDigits: 3 })} m²` };
  if (a.inkoopprijs != null && opp) return { m2: Number(a.inkoopprijs) / opp, bron: `inkoopprijs per stuk van het artikel ÷ ${opp.toLocaleString('nl-NL', { maximumFractionDigits: 3 })} m²` };
  const p = stuk ?? (a.inkoopprijs != null ? Number(a.inkoopprijs) : null);
  return { m2: p, bron: p == null ? 'geen inkoopprijs bekend' : 'inkoopprijs per stuk (geen maat bekend)' };
}
export async function inkoopPerM2(a) { return (await inkoopInfo(a)).m2; }
export const inkoopcode = (p) => (p === null || p === undefined || p === '' || Number.isNaN(Number(p)) ? '' : `60${Math.round(Number(p))}4`);

// ---------- Website ----------
let lijstCache = null;
async function b2bProducten() {
  if (lijstCache) return lijstCache;
  const alle = [];
  for (let page = 1; page < 20; page++) {
    const r = await fetch(`${SITE}/products.json?limit=250&page=${page}`);
    if (!r.ok) break;
    const { products } = await r.json();
    if (!products.length) break;
    alle.push(...products);
  }
  lijstCache = alle.filter((p) => (p.tags || []).some((t) => t.toLowerCase() === 'b2b'))
    .map((p) => ({ handle: p.handle, title: p.title, collectie: collectieUitTags(p.tags) }));
  return lijstCache;
}
function collectieUitTags(tags = []) {
  return tags.find((t) => !/^(b2b|koreman exclusive carpets)$/i.test(t)) || '';
}
async function productGegevens(handle) {
  const r = await fetch(productUrl(handle));
  if (!r.ok) throw new Error('Product niet gevonden op de website');
  const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
  const s = doc.querySelector('#stape-product-data') || [...doc.querySelectorAll('script[type="application/json"]')].find((x) => x.textContent.includes('"metafields"'));
  if (!s) throw new Error('Geen productgegevens gevonden op de website');
  const j = JSON.parse(s.textContent);
  const mf = j.metafields?.custom || {};
  const col = (j.collections || []).map((c) => c.title).find((t) => /^B2B .+ Collectie$/i.test(t));
  // De eerste (hoofd)foto op de website is de rechte foto van het tapijt (bovenaanzicht)
  let hoofdfoto = '';
  try { const pj = await (await fetch(`${productUrl(handle)}.js`)).json(); hoofdfoto = pj.featured_image || pj.images?.[0] || ''; } catch { /* geen foto */ }
  return {
    handle: j.handle || handle,
    title: j.title || '',
    collectie: col ? col.replace(/^B2B\s+/i, '').replace(/\s+Collectie$/i, '') : collectieUitTags(j.tags),
    compositie: mf.compositie || '',
    maakwijze: mf.maakwijze || '',
    knoopdichtheid: mf.knoopdichtheid || '',
    prijs_m2: mf.prijs_m2 || '',
    prijs_m2_maatwerk: mf.prijs_m2_maatwerk || '',
    foto: (() => { const f = hoofdfoto || j.featured_image || j.images?.[0] || ''; const u = typeof f === 'string' ? f : (f.src || ''); return u ? (u.startsWith('//') ? `https:${u}` : u) : ''; })(),
  };
}
// Zoek een passend B2B-product bij de artikelnaam (bv. "Umber Design 40x30" -> "Umber")
async function raadProduct(a) {
  const lijst = await b2bProducten();
  const tekst = ` ${[a.naam, a.designs?.naam, a.omschrijving].filter(Boolean).join(' ').toLowerCase()} `;
  const treffers = lijst.filter((p) => p.title && new RegExp(`[^a-z]${p.title.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-z]`).test(tekst));
  treffers.sort((x, y) => y.title.length - x.title.length);
  return treffers[0] || null;
}

// ---------- Vertalingen naar het Engels (zoals op de stalenkaarten) ----------
const VERTAAL = [
  [/hand?ge?knoopt/i, 'Handknotted'], [/handgeweven/i, 'Handwoven'], [/handgetuft|handtufted/i, 'Handtufted'],
  [/nieuw[- ]zeelandse wol/i, 'New Zealand Wool'], [/hoogland ?wol/i, 'Highland Wool'], [/natuurzijde|echte zijde/i, 'Natural Silk'],
  [/bamboe ?zijde/i, 'Bamboo Silk'], [/sari ?zijde/i, 'Sari Silk'], [/ghazni wol/i, 'Ghazni Wool'], [/tibetaanse wol/i, 'Tibetan Wool'], [/scheerwol/i, 'Virgin Wool'],
  [/\bzijde\b/i, 'Silk'], [/\bwol\b/i, 'Wool'], [/linnen/i, 'Linen'], [/katoen/i, 'Cotton'], [/brandnetel/i, 'Nettle'], [/hennep/i, 'Hemp'],
  [/kasjmier/i, 'Cashmere'], [/\bleer\b/i, 'Leather'], [/acryl\b/i, 'Acrylic'], [/micro polyester/i, 'Micro Polyester'], [/platgeweven/i, 'Flatweave'],
  [/\s*&\s*/g, ' / '], [/\bja\b/i, 'Yes'],
];
export const naarEngels = (t) => VERTAAL.reduce((s, [rx, en]) => s.replace(rx, en), String(t || '')).trim();
// Knoopdichtheid van de website; een klein getal (bv. 14) is de tuftkwaliteit van een handgetuft tapijt
const knoop = (t) => { const m = String(t || '').match(/([\d.\s]+)/); if (!m) return t || ''; const n = Number(m[1].replace(/[.\s]/g, '')); if (!n) return t; if (n < 100) return `Handtufted ${n}/${n}`; return `${n.toLocaleString('nl-NL')} / m²`; };
const m2prijs = (t) => { const m = String(t || '').match(/[\d.,]+/); return m ? `€ ${m[0]} / m²` : ''; };

// ---------- QR-code ----------
async function qrLib() {
  if (window.qrcode) return window.qrcode;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  return window.qrcode;
}
function qrSvg(qrcode, tekst) {
  if (!tekst || !qrcode) return '';
  const q = qrcode(0, 'M'); q.addData(tekst); q.make();
  const n = q.getModuleCount(); let p = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) p += `M${c},${r}h1v1h-1z`;
  return `<svg class="qr" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><path d="${p}" fill="#000"/></svg>`;
}

// ---------- Code 128 (B) ----------
const C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
function barcodeSvg(tekst) {
  const codes = [104]; for (const ch of String(tekst)) { const v = ch.charCodeAt(0) - 32; codes.push(v >= 0 && v < 95 ? v : 0); }
  let som = 104; for (let i = 1; i < codes.length; i++) som += codes[i] * i; codes.push(som % 103, 106);
  let x = 0; let rects = '';
  for (const c of codes) [...C128[c]].forEach((w, i) => { if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${w}" height="40"/>`; x += Number(w); });
  return `<svg class="bc" viewBox="0 0 ${x} 40" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}

// ---------- De kaart ----------
// Ontwerp "Exclusief tapijtlabel": staande kaart, foto bovenaan, standaard 105 x 148,5 mm
// (precies 4 op een A4, paginavullend). Onderaan: QR-code | logo | artikelnummer, streepjescode en inkoopcode (604...).
// Alle maten in eenheden van 1/100 van de kaartbreedte (--u); posities vanaf de onderkant.
export const SK_CSS = `
.sk{--w:105mm;--h:148.5mm;--u:calc(var(--w) / 100);position:relative;width:var(--w);height:var(--h);background:#f8f6f1;overflow:hidden;color:#1d1d1b;font-family:Georgia,"Times New Roman",serif;font-feature-settings:normal}
.sk .gat{position:absolute;width:calc(var(--u)*2.6);height:calc(var(--u)*2.6);border-radius:50%;border:calc(var(--u)*.35) solid #9a9a9a;background:#fff;transform:translate(-50%,-50%)}
.sk .foto{position:absolute;left:calc(var(--u)*9.5);right:calc(var(--u)*9.5);top:calc(var(--u)*3);bottom:calc(var(--u)*62.5);background:#ece8df center/cover no-repeat;display:flex;align-items:center;justify-content:center;color:#a39d91;font-family:Arial,sans-serif;font-size:calc(var(--u)*3)}
.sk .titel{position:absolute;left:calc(var(--u)*6);right:calc(var(--u)*6);bottom:calc(var(--u)*53);text-align:center;font-size:calc(var(--u)*6.4);line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sk .rijen{position:absolute;left:calc(var(--u)*7.5);right:calc(var(--u)*7.5);bottom:calc(var(--u)*20);border-top:calc(var(--u)*.25) solid #a08a68}
.sk .r{display:grid;grid-template-columns:calc(var(--u)*40) 1fr;align-items:center;height:calc(var(--u)*4.35);padding-left:calc(var(--u)*2.5);border-bottom:calc(var(--u)*.25) solid #a08a68;font-size:calc(var(--u)*3.2);white-space:nowrap;overflow:hidden}
.sk .r b{font-weight:700;font-size:calc(var(--u)*3.4)}
.sk .qr{position:absolute;left:calc(var(--u)*9.5);bottom:calc(var(--u)*5);width:calc(var(--u)*12.5);height:calc(var(--u)*12.5)}
.sk .streep{position:absolute;bottom:calc(var(--u)*5.5);height:calc(var(--u)*11.5);border-left:calc(var(--u)*.3) solid #b08d57}
.sk .midden{position:absolute;left:calc(var(--u)*27);right:calc(var(--u)*30.5);bottom:calc(var(--u)*4.8);display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:calc(var(--u)*13);font-family:Arial,Helvetica,sans-serif;white-space:nowrap}
.sk .midden .logo{width:calc(var(--u)*27);height:auto;display:block}
.sk .site{font-size:calc(var(--u)*2.5);color:#1d1d1b;margin-top:calc(var(--u)*.8)}
.sk .code{position:absolute;right:calc(var(--u)*8.5);bottom:calc(var(--u)*5);width:calc(var(--u)*17.5);text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:calc(var(--u)*2.7);line-height:1.15}
.sk .code .bc{display:block;width:100%;height:calc(var(--u)*4.2);margin:calc(var(--u)*.6) 0}
.sk .inkoop{font-size:calc(var(--u)*2.7);color:#000}`;
export function staalkaart(k, logoUrl, qr) {
  const rij = (l, v) => (!v || v === WEG ? '' : `<div class="r"><b>${l}</b><span>${esc(v)}</span></div>`);
  const gat = (x, y) => `<span class="gat" style="left:calc(var(--u)*${x});top:${y}"></span>`;
  const foto = k.foto ? `<div class="foto" style="background-image:url('${String(k.foto).replace(/'/g, '%27')}')"></div>` : '<div class="foto">Geen foto</div>';
  return `<div class="sk">${foto}${gat(4.2, 'calc(var(--u)*4.2)')}${gat(95.8, 'calc(var(--u)*4.2)')}${gat(4.2, 'calc(100% - var(--u)*4.2)')}${gat(95.8, 'calc(100% - var(--u)*4.2)')}
    <div class="titel">${esc(k.titel)}</div>
    <div class="rijen">${rij('Collection:', k.collectie)}${rij('Color:', k.kleur)}${rij('Material:', k.materiaal)}${rij('Method:', k.methode)}${rij('Knot density:', k.knoop)}${rij('Price:', k.prijs)}${rij('Custom sizes:', k.maatwerk)}</div>
    ${k.handle ? qrSvg(qr, productUrl(k.handle)) : ''}<span class="streep" style="left:calc(var(--u)*25)"></span><span class="streep" style="left:calc(var(--u)*71)"></span>
    <div class="midden"><img class="logo" src="${logoUrl}" alt="Koreman Exclusive Carpets"><div class="site">koremanmaastricht.nl</div></div>
    ${k.nr || k.inkoop ? `<div class="code">${k.nr ? `${esc(k.nr)}${barcodeSvg(k.nr)}` : ''}${k.inkoop ? `<div class="inkoop">${esc(k.inkoop)}</div>` : ''}</div>` : ''}</div>`;
}

// Foto voor de kaart: dezelfde foto als in het voorraadsysteem (artikel, anders design); alleen zonder eigen foto die van de website.
// De link naar de app-foto verloopt na een uur, dus die wordt vlak voor het tonen/printen opgehaald.
export async function fotosOphalen(kaarten) {
  const { mediaUrl } = await import('./ui.js?v=20261119150808');
  await Promise.all(kaarten.map(async (k) => {
    k.foto = '';
    if (k.fotoPad) { try { k.foto = (await mediaUrl(k.fotoPad)) || ''; } catch { k.foto = ''; } }
    if (!k.foto) k.foto = k.fotoWeb || '';
  }));
  return kaarten;
}

// ---------- Tabblad in het kaartenvenster ----------
export function staalPaneHtml() {
  const veld = (id, label, extra = '') => `<label>${label}<input id="${id}" ${extra}></label>`;
  return `<div class="kt-pane" data-pane="sk" hidden>
      <div class="kt-prev"><div class="schaal" id="sk-prev"></div><p class="small muted" id="sk-status" style="margin:8px 0 0"></p><p class="small" id="sk-inkoopinfo" style="margin:6px 0 0"></p></div>
      <div class="kt-form">
        <label>Product op de website (B2B)<input id="sk-zoek" list="sk-lijst" placeholder="Typ een naam, bv. Umber" autocomplete="off"></label>
        <datalist id="sk-lijst"></datalist>
        ${veld('sk-titel', 'Titel')}${veld('sk-collectie', 'Collection')}${veld('sk-kleur', 'Color', 'placeholder="bv. 4M17"')}${veld('sk-materiaal', 'Material')}<label>Method${keuzeSelect('sk-methode', METHODES_EN)}</label>
        <label>Knot density${keuzeSelect('sk-knoop', KNOOP_EN)}</label>${veld('sk-prijs', 'Price')}${veld('sk-maatwerk', 'Custom sizes')}
        <div class="kt-row"><label style="flex:1">Breedte (mm)<input id="sk-w" type="number" min="50" max="300" step="0.5"></label><label style="flex:1">Hoogte (mm)<input id="sk-h" type="number" min="50" max="300" step="0.5"></label><label style="width:70px">Aantal<input id="sk-n" type="number" min="1" value="1"></label></div>
        <button type="button" class="btn primary" id="sk-print" style="width:100%"><i data-lucide="printer"></i> Print alleen deze kaart</button>
        <div style="border-top:1px solid var(--line);margin-top:12px;padding-top:10px">
          <b style="font-size:13px">Meerdere stalen op één A4-vel</b>
          <p class="small muted" style="margin:2px 0 8px">Zet deze kaart op het vel, open het volgende artikel en doe hetzelfde. Bij 105 × 148,5 mm passen er precies 4 op een A4 (paginavullend).</p>
          <div class="kt-row"><button type="button" class="btn" id="sk-op-vel" style="flex:1"><i data-lucide="plus"></i> Zet op vel</button>
            <button type="button" class="btn primary" id="sk-print-vel" style="flex:1"><i data-lucide="printer"></i> Print vel</button></div>
          <div id="sk-vel" class="small" style="margin-top:8px"></div>
        </div>
      </div></div>`;
}

export function staalPaneInit(form, a, logoUrl, onthoud, printHtml) {
  volgGebruiker(form);
  const v = (id) => kaartWaarde($('#' + id, form));
  const zet = (id, val) => zetWaarde($('#' + id, form), val);
  materiaalKeuze($('#sk-materiaal', form), { opties: MATERIALEN_EN, scheiding: ' / ' });
  naVinkjes(form, ['sk-collectie', 'sk-kleur', 'sk-materiaal', 'sk-methode', 'sk-knoop', 'sk-prijs', 'sk-maatwerk'], `sk-${a.artikelnummer ?? a.id}`);
  let handle = a.website_handle || a.designs?.website_handle || '';
  const fotoPad = a.foto_pad || a.designs?.hoofdfoto_pad || ''; let fotoWeb = ''; let fotoNu = '';
  let qr = null; let lijst = []; let inkoopM2 = null;
  inkoopInfo(a).then((x) => {
    inkoopM2 = x.m2; toon();
    const el = $('#sk-inkoopinfo', form);
    if (el) el.innerHTML = x.m2 != null ? `Inkoopcode <b>${inkoopcode(x.m2)}</b> = € ${Math.round(x.m2)} (${esc(x.bron)}). Klopt dit niet? Vul bij het artikel de inkoopprijs per m² in.` : 'Geen inkoopprijs bekend: vul bij het artikel de inkoopprijs per m² in.';
  }).catch(() => {});
  zet('sk-w', onthoud.get('sk3-w', '105')); zet('sk-h', onthoud.get('sk3-h', '148.5'));
  zet('sk-titel', a.naam || '');
  zet('sk-kleur', a.kleurcode || '');
  zet('sk-materiaal', naarEngels(a.materiaal)); zet('sk-methode', naarEngels(a.techniek));
  if (a.verkoopprijs_m2) zet('sk-prijs', `€ ${Number(a.verkoopprijs_m2).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} / m²`);
  const status = (t) => { $('#sk-status', form).innerHTML = t; };
  const lees = () => ({ handle, fotoPad, fotoWeb, foto: fotoNu || fotoWeb, nr: String(a.artikelnummer ?? ''), inkoop: inkoopcode(inkoopM2), titel: v('sk-titel'), collectie: v('sk-collectie'), kleur: v('sk-kleur'), materiaal: v('sk-materiaal'), methode: v('sk-methode'), knoop: v('sk-knoop'), prijs: v('sk-prijs'), maatwerk: v('sk-maatwerk'), w: Number(v('sk-w')) || 105, h: Number(v('sk-h')) || 148.5, n: Math.max(1, parseInt(v('sk-n'), 10) || 1) });
  const kaartHtml = (k) => staalkaart(k, logoUrl, qr).replace('class="sk"', `class="sk" style="--w:${k.w}mm;--h:${k.h}mm"`);
  const toon = () => {
    const el = $('#sk-prev', form); el.style.transform = 'none'; el.innerHTML = kaartHtml(lees());
    const kaart = el.firstElementChild; const k = Math.min(280, $('[data-pane=sk] .kt-prev', form).clientWidth - 24) / kaart.offsetWidth;
    el.style.transform = `scale(${k})`; el.style.height = `${kaart.offsetHeight * k}px`;
  };
  const laad = async (h, overschrijf = true) => {
    status('Gegevens ophalen van de website…');
    try {
      const p = await productGegevens(h);
      handle = p.handle; fotoWeb = p.foto || fotoWeb;
      if (overschrijf || !v('sk-titel')) zet('sk-titel', /design/i.test(p.title) ? p.title : `${p.title} Design`);
      zet('sk-collectie', p.collectie);
      if (p.compositie) zet('sk-materiaal', naarEngels(p.compositie));
      if (p.maakwijze) zet('sk-methode', naarEngels(p.maakwijze));
      zet('sk-knoop', knoop(p.knoopdichtheid));
      if (p.prijs_m2) zet('sk-prijs', m2prijs(p.prijs_m2));
      zet('sk-maatwerk', m2prijs(p.prijs_m2_maatwerk));
      zet('sk-zoek', p.title);
      const opgeslagen = handle === (a.website_handle || '');
      status(`QR-code linkt naar <a href="${esc(productUrl(handle))}" target="_blank" rel="noopener">${esc(productUrl(handle).replace('https://www.', ''))}</a>${opgeslagen ? '' : ' · <b>koppeling wordt bij printen opgeslagen</b>'}`);
    } catch (e) { status(`<span style="color:var(--red-fg)">${esc(e.message)}</span> – vul de gegevens zelf in.`); }
    toon();
  };
  (async () => {
    try { qr = await qrLib(); } catch { status('QR-code kon niet geladen worden (geen internet?).'); }
    if (fotoPad) { try { fotoNu = (await fotosOphalen([{ fotoPad }]))[0].foto; } catch { /* geen foto */ } }
    try {
      lijst = await b2bProducten();
      $('#sk-lijst', form).innerHTML = lijst.map((p) => `<option value="${esc(p.title)}">${esc(p.collectie)}</option>`).join('');
    } catch { /* website niet bereikbaar */ }
    if (handle) await laad(handle, false);
    else {
      const gok = await raadProduct(a).catch(() => null);
      if (gok) await laad(gok.handle, false);
      else { status('Nog niet gekoppeld: kies hierboven het product op de website, dan komt de QR-code erop.'); toon(); }
    }
  })();
  $('#sk-zoek', form).addEventListener('change', () => {
    const t = v('sk-zoek').trim().toLowerCase();
    const p = lijst.find((x) => x.title.toLowerCase() === t) || lijst.find((x) => x.title.toLowerCase().includes(t));
    if (p) laad(p.handle); else status('Geen B2B-product met die naam gevonden.');
  });
  form.addEventListener('input', (e) => { if (e.target.id?.startsWith('sk-') && e.target.id !== 'sk-zoek') toon(); });
  // ---- vel met meerdere kaarten (bewaard in deze browser tot je print of leegmaakt) ----
  const velLees = () => { try { return JSON.parse(localStorage.getItem('kaart-sk-vel') || '[]'); } catch { return []; } };
  const velZet = (l) => { try { localStorage.setItem('kaart-sk-vel', JSON.stringify(l)); } catch { /* geen opslag */ } };
  const perVel = (w, h) => Math.max(1, Math.floor(210.01 / w)) * Math.max(1, Math.floor(297.01 / h));
  const toonVel = () => {
    const l = velLees(); const k = lees(); const n = perVel(k.w, k.h);
    $('#sk-print-vel', form).innerHTML = `<i data-lucide="printer"></i> Print vel (${l.length})`;
    $('#sk-vel', form).innerHTML = l.length ? `<div class="muted">${l.length} kaart${l.length === 1 ? '' : 'en'} klaar${l.length > n ? ` (${Math.ceil(l.length / n)} vellen)` : ` – nog ${n - l.length} plek${n - l.length === 1 ? '' : 'ken'} vrij`}:</div>`
      + l.map((x, i) => `<div style="display:flex;gap:6px;align-items:center">${esc(x.nr)} ${esc(x.titel)}<span class="spacer" style="flex:1"></span><button type="button" class="btn small" data-vel-weg="${i}">Weg</button></div>`).join('')
      + '<button type="button" class="btn small" id="sk-vel-leeg" style="margin-top:6px">Vel leegmaken</button>' : '<span class="muted">Nog geen kaarten op het vel.</span>';
    window.lucide?.createIcons();
  };
  const bewaarKoppeling = async () => {
    if (handle && handle !== (a.website_handle || '')) {
      check(await sb.from('artikelen').update({ website_handle: handle }).eq('id', a.id));
      a.website_handle = handle; toast('Koppeling met de website opgeslagen', 'ok');
    }
  };
  $('#sk-op-vel', form).onclick = async () => {
    const k = lees(); onthoud.set('sk3-w', String(k.w)); onthoud.set('sk3-h', String(k.h));
    await bewaarKoppeling();
    const l = velLees(); l.push(k); velZet(l); toonVel(); toast(`Op het vel gezet (${l.length})`, 'ok');
  };
  form.addEventListener('click', (e) => {
    const weg = e.target.closest('[data-vel-weg]');
    if (weg) { const l = velLees(); l.splice(Number(weg.dataset.velWeg), 1); velZet(l); toonVel(); }
    if (e.target.closest('#sk-vel-leeg')) { velZet([]); toonVel(); }
  });
  $('#sk-print-vel', form).onclick = async () => {
    const l = velLees().flatMap((k) => Array(Math.max(1, Number(k.n) || 1)).fill(k)); if (!l.length) { toast('Zet eerst kaarten op het vel', 'error'); return; }
    const { w, h } = lees(); const cols = Math.max(1, Math.floor(210.01 / w)); const rows = Math.max(1, Math.floor(297.01 / h)); const n = cols * rows;
    await fotosOphalen(l);
    const vellen = []; for (let i = 0; i < l.length; i += n) vellen.push(l.slice(i, i + n));
    const css = `${SK_CSS}.blad{width:210mm;height:297mm;display:grid;grid-template-columns:repeat(${cols},${w}mm);grid-auto-rows:${h}mm;justify-content:center;align-content:center}
      .blad .sk{outline:.2mm dashed #b5b5b5;outline-offset:0}`;
    printHtml(vellen.map((vel) => `<div class="vel blad">${vel.map((k) => kaartHtml({ ...k, w, h })).join('')}</div>`).join(''), css, '210mm 297mm');
  };
  toonVel();
  $('#sk-print', form).onclick = async () => {
    const k = lees();
    onthoud.set('sk3-w', String(k.w)); onthoud.set('sk3-h', String(k.h));
    await bewaarKoppeling();
    printHtml(Array(k.n).fill(`<div class="vel">${kaartHtml(k)}</div>`).join(''), SK_CSS, `${k.w}mm ${k.h}mm`);
  };
  return toon;
}

// =====================================================================
// Stalenvel vanuit de artikellijst: meerdere stalen kiezen en op A4 printen
// (zelfde vel als "Zet op vel" in het artikel – dat blijft in deze browser bewaard)
// =====================================================================
const velLeesG = () => { try { return JSON.parse(localStorage.getItem('kaart-sk-vel') || '[]'); } catch { return []; } };
const velZetG = (l) => { try { localStorage.setItem('kaart-sk-vel', JSON.stringify(l)); } catch { /* geen opslag */ } };
const maatG = () => { let w = 105; let h = 148.5; try { w = Number(localStorage.getItem('kaart-sk3-w')) || 105; h = Number(localStorage.getItem('kaart-sk3-h')) || 148.5; } catch { /* */ } return { w, h }; };

// Maak de kaartgegevens voor één artikel: website-gegevens waar mogelijk, anders uit het artikel
async function kaartVoorArtikel(a) {
  let handle = a.website_handle || a.designs?.website_handle || '';
  let geraden = false;
  if (!handle) { const g = await raadProduct(a).catch(() => null); if (g) { handle = g.handle; geraden = true; } }
  const k = {
    handle, fotoPad: a.foto_pad || a.designs?.hoofdfoto_pad || '', fotoWeb: '', nr: String(a.artikelnummer ?? ''), inkoop: inkoopcode(await inkoopPerM2(a)), titel: a.naam || '', collectie: '', kleur: a.kleurcode || '',
    materiaal: naarEngels(a.materiaal), methode: naarEngels(a.techniek), knoop: '',
    prijs: a.verkoopprijs_m2 ? `€ ${Number(a.verkoopprijs_m2).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} / m²` : '', maatwerk: '',
  };
  if (handle) {
    try {
      const p = await productGegevens(handle);
      k.handle = p.handle; k.fotoWeb = p.foto || ''; k.titel = /design/i.test(p.title) ? p.title : `${p.title} Design`; k.collectie = p.collectie;
      if (p.compositie) k.materiaal = naarEngels(p.compositie);
      if (p.maakwijze) k.methode = naarEngels(p.maakwijze);
      k.knoop = knoop(p.knoopdichtheid); if (p.prijs_m2) k.prijs = m2prijs(p.prijs_m2); k.maatwerk = m2prijs(p.prijs_m2_maatwerk);
      if (geraden || k.handle !== a.website_handle) await sb.from('artikelen').update({ website_handle: k.handle }).eq('id', a.id);
    } catch { k.handle = ''; }
  }
  return k;
}

export async function stalenVelModal(ids = []) {
  const { modal: mdl, artikelPicker } = await import('./ui.js?v=20261119150808');
  const { printHtml } = await import('./kaarten.js?v=20261119150808');
  const logoUrl = new URL('img/logo-koreman-transparant.png', document.baseURI).href;
  let qr = null; qrLib().then((q) => { qr = q; }).catch(() => {});
  await mdl({
    title: 'Staalkaarten printen (4 per A4-vel)',
    wide: true,
    body: `<style>${SK_CSS}.sv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:12px}
        .sv-item{border:1px solid var(--line);border-radius:10px;padding:6px;background:var(--canvas);position:relative}
        .sv-item .schaal{transform-origin:top left}.sv-item .wrap{overflow:hidden;background:#fff}
        .sv-item .onder{display:flex;gap:6px;align-items:center;font-size:12px;margin-top:4px}</style>
      <div class="kt-row" style="display:flex;gap:8px;align-items:end">
        <label class="field" style="flex:1;margin:0">Staal toevoegen (zoek op artikelnummer of naam)<input id="sv-zoek" placeholder="Typ om te zoeken…" autocomplete="off"></label>
        <label class="field" style="width:110px;margin:0">Breedte (mm)<input id="sv-w" type="number" min="50" max="210" step="0.5"></label>
        <label class="field" style="width:110px;margin:0">Hoogte (mm)<input id="sv-h" type="number" min="50" max="297" step="0.5"></label>
      </div>
      <p class="small muted" id="sv-info" style="margin:8px 0 0"></p>
      <div class="sv-grid" id="sv-grid"></div>
      <div style="display:flex;gap:8px;margin-top:14px"><button type="button" class="btn" id="sv-leeg">Vel leegmaken</button><span style="flex:1"></span>
        <button type="button" class="btn primary" id="sv-print"><i data-lucide="printer"></i> Print vel</button></div>`,
    onOpen: (form) => {
      $('.actions [data-cancel]', form).textContent = 'Sluiten';
      const { w, h } = maatG(); $('#sv-w', form).value = w; $('#sv-h', form).value = h;
      const maat = () => ({ w: Number($('#sv-w', form).value) || 105, h: Number($('#sv-h', form).value) || 148.5 });
      const perVel = () => { const m = maat(); return Math.max(1, Math.floor(210.01 / m.w)) * Math.max(1, Math.floor(297.01 / m.h)); };
      const fc = new Map();
      const metFoto = (k) => ({ ...k, foto: (k.fotoPad && fc.get(k.fotoPad)) || k.fotoWeb || '' });
      const zorgFotos = async () => {
        const nodig = [...new Set(velLeesG().map((k) => k.fotoPad).filter((p2) => p2 && !fc.has(p2)))];
        if (nodig.length) (await fotosOphalen(nodig.map((p2) => ({ fotoPad: p2 })))).forEach((x, i) => fc.set(nodig[i], x.foto));
      };
      const toon = () => {
        const l = velLeesG(); const n = perVel(); const tot = l.reduce((s2, k) => s2 + (Number(k.n) || 1), 0);
        $('#sv-info', form).innerHTML = l.length
          ? `${l.length} ${l.length === 1 ? 'staal' : 'stalen'}, samen ${tot} kaart${tot === 1 ? '' : 'en'} · ${n} per A4 · ${Math.ceil(tot / n)} vel${Math.ceil(tot / n) === 1 ? '' : 'len'}. Kaarten zonder QR-code zijn (nog) niet gekoppeld aan de website – open dan het artikel en kies het product bij "Staalkaart (B2B)".`
          : 'Nog geen stalen gekozen. Zoek hierboven een staal en klik erop.';
        $('#sv-print', form).innerHTML = `<i data-lucide="printer"></i> Print (${tot} kaart${tot === 1 ? '' : 'en'})`;
        $('#sv-grid', form).innerHTML = l.map((k, i) => `<div class="sv-item"><div class="wrap"><div class="schaal">${staalkaart(metFoto(k), logoUrl, qr).replace('class="sk"', 'class="sk" style="--w:105mm;--h:148.5mm"')}</div></div>
          <div class="onder"><b>${esc(k.nr)}</b><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(k.titel)}</span>${k.handle ? '' : '<span class="badge orange">geen QR</span>'}</div>
          <div class="onder"><label style="display:flex;gap:4px;align-items:center;margin:0">Aantal <input type="number" min="1" max="99" value="${Number(k.n) || 1}" data-n="${i}" style="width:56px;padding:2px 6px"></label><span style="flex:1"></span><button type="button" class="btn small" data-weg="${i}">Weg</button></div></div>`).join('');
        form.querySelectorAll('.sv-item').forEach((it) => { const s = $('.schaal', it); const kaart = s.firstElementChild; const f = (it.clientWidth - 12) / kaart.offsetWidth; s.style.transform = `scale(${f})`; $('.wrap', it).style.height = `${kaart.offsetHeight * f}px`; });
        window.lucide?.createIcons();
      };
      artikelPicker($('#sv-zoek', form), async (r) => {
        $('#sv-info', form).textContent = `Gegevens van ${r.artikelnummer} ophalen…`;
        const a = check(await sb.from('artikelen').select('*, designs(naam, website_handle, hoofdfoto_pad)').eq('id', r.id).single());
        const k = await kaartVoorArtikel(a); k.n = 1;
        const l = velLeesG(); l.push(k); velZetG(l); await zorgFotos(); toon();
      });
      // Kaarten die al op het vel stonden bijwerken: foto uit het voorraadsysteem en inkoopcode uit de inkooporder
      (async () => {
        const nrs = [...new Set(velLeesG().map((k) => k.nr).filter(Boolean))]; if (!nrs.length) return;
        const { data } = await sb.from('artikelen').select('id, artikelnummer, foto_pad, lengte_cm, breedte_cm, inkoopprijs, inkoopprijs_m2, designs(hoofdfoto_pad)').in('artikelnummer', nrs);
        const per = new Map();
        for (const a of data || []) per.set(String(a.artikelnummer), { fotoPad: a.foto_pad || a.designs?.hoofdfoto_pad || '', inkoop: inkoopcode(await inkoopPerM2(a)) });
        const l = velLeesG().map((k) => (per.has(k.nr) ? { ...k, ...per.get(k.nr) } : k)); velZetG(l);
        await zorgFotos(); toon();
      })().catch(() => {});
      form.addEventListener('change', (e) => { const i = e.target.dataset?.n; if (i === undefined) return; const l = velLeesG(); if (!l[i]) return; l[i].n = Math.max(1, parseInt(e.target.value, 10) || 1); velZetG(l); toon(); });
      form.addEventListener('input', (e) => { if (e.target.id === 'sv-w' || e.target.id === 'sv-h') { const m = maat(); try { localStorage.setItem('kaart-sk3-w', m.w); localStorage.setItem('kaart-sk3-h', m.h); } catch { /* */ } toon(); } });
      form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); });
      form.addEventListener('click', (e) => {
        const weg = e.target.closest('[data-weg]'); if (weg) { const l = velLeesG(); l.splice(Number(weg.dataset.weg), 1); velZetG(l); toon(); }
        if (e.target.closest('#sv-leeg')) { velZetG([]); toon(); }
      });
      $('#sv-print', form).onclick = async () => {
        const l = velLeesG().flatMap((k) => Array(Math.max(1, Number(k.n) || 1)).fill(k)); if (!l.length) { toast('Kies eerst stalen', 'error'); return; }
        const { w, h } = maat(); const cols = Math.max(1, Math.floor(210.01 / w)); const rows = Math.max(1, Math.floor(297.01 / h)); const n = cols * rows;
        await zorgFotos();
        const vellen = []; for (let i = 0; i < l.length; i += n) vellen.push(l.slice(i, i + n));
        const css = `${SK_CSS}.blad{width:210mm;height:297mm;display:grid;grid-template-columns:repeat(${cols},${w}mm);grid-auto-rows:${h}mm;justify-content:center;align-content:center}.blad .sk{outline:.2mm dashed #b5b5b5}`;
        printHtml(vellen.map((vel) => `<div class="vel blad">${vel.map((k) => staalkaart(metFoto(k), logoUrl, qr).replace('class="sk"', `class="sk" style="--w:${w}mm;--h:${h}mm"`)).join('')}</div>`).join(''), css, '210mm 297mm');
      };
      qrLib().then((q) => { qr = q; toon(); }).catch(toon);
      zorgFotos().then(toon).catch(() => {});
      toon();
      // geselecteerde artikelen uit de lijst op het vel zetten
      if (ids.length) (async () => {
        const l0 = velLeesG(); const al = new Set(l0.map((k) => k.nr));
        const arts = check(await sb.from('artikelen').select('*, designs(naam, website_handle, hoofdfoto_pad)').in('id', ids));
        let i = 0;
        for (const a of arts) {
          i++; if (al.has(String(a.artikelnummer))) continue;
          $('#sv-info', form).textContent = `Gegevens ophalen ${i} van ${arts.length}: ${a.artikelnummer} ${a.naam}…`;
          const k = await kaartVoorArtikel(a); k.n = 1; const l = velLeesG(); l.push(k); velZetG(l); al.add(k.nr);
        }
        await zorgFotos(); toon();
      })();
    },
  });
}
