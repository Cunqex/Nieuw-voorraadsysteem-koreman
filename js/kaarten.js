// Prijskaartjes en wandkaarten printen vanuit een artikel.
// - Prijskaartje: opmaak "Meubelen" uit IOne (243 x 153 pt = 85,7 x 54 mm, liggend),
//   met omschrijving, maat, prijs, artikelnummer en een Code 128-streepjescode.
// - Wandkaart: de kaart die aan de muur bij het tapijt hangt (standaard A5 liggend),
//   met collectielogo, titel, afmeting, poolmateriaal, knoopdichtheid, herkomst, prijs en het K-logo.
import { esc, $, modal, toast } from './ui.js?v=20261117141633';
import { staalPaneHtml, staalPaneInit, SK_CSS } from './staalkaart.js?v=20261117141633';

// ---------- Collecties zoals op koremanmaastricht.nl ----------
export const COLLECTIES = {
  'Luxe Vloerkleden': ['Avant-garde', 'Loricata', 'Riviera'],
  'Moderne Vloerkleden': ['Platgeweven', 'Hoogpolig', 'Laagpolig', 'Effen'],
  'Design Vloerkleden': ['Gestreept', 'Geometrisch', 'Artistiek', 'Organisch'],
  'Oosterse Tapijten': ['Kelim', 'Vintage', 'Perzisch', 'Meesterwerken', 'Ziegler'],
  Meer: ['Outlet', 'Maatwerk', 'Buiten vloerkleden'],
};
const HERKEN = [['riviera', 'Riviera'], ['avant garde', 'Avant-garde'], ['avant-garde', 'Avant-garde'], ['loricata', 'Loricata'],
  ['ziegler', 'Ziegler'], ['kelim', 'Kelim'], ['kilim', 'Kelim'], ['vintage', 'Vintage']];
export function herkenCollectie(...teksten) {
  const t = teksten.filter(Boolean).join(' ').toLowerCase();
  for (const [woord, col] of HERKEN) if (t.includes(woord)) return col;
  return '';
}

// ---------- Hulpjes ----------
const MAAT_RX = /\s*(?:size:?\s*)?(\d{2,3}(?:[.,]\d)?)\s*(?:cm)?\s*[xX×*]\s*(\d{2,3}(?:[.,]\d)?)\s*(?:cm)?/i;
const getal = (n) => Number(n).toLocaleString('nl-NL', { maximumFractionDigits: 1 });
export function maatTekst(a) {
  if (a.lengte_cm && a.breedte_cm) return `${getal(a.lengte_cm)} x ${getal(a.breedte_cm)}`;
  const m = `${a.naam || ''} ${a.omschrijving || ''}`.match(MAAT_RX);
  return m ? `${m[1]} x ${m[2]}` : '';
}
const titelZonderMaat = (naam) => String(naam || '').replace(MAAT_RX, ' ').replace(/\s{2,}/g, ' ').replace(/[\s,:-]+$/, '').trim();
const euro = (v) => Number(v || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Prijskaartje zoals IOne: "€ 6.930" (centen alleen als die er zijn)
export const prijsKaartje = (v) => { if (v === null || v === undefined || v === '') return ''; const [h, c] = euro(v).split(','); return `€ ${h}${c === '00' ? '' : ',' + c}`; };
// Wandkaart: "€ 2.990,-"
export const prijsWand = (v) => { if (v === null || v === undefined || v === '') return ''; const [h, c] = euro(v).split(','); return `€ ${h},${c === '00' ? '-' : c}`; };

const onthoud = {
  get(k, d = '') { try { return localStorage.getItem('kaart-' + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('kaart-' + k, v); } catch { /* geen opslag */ } },
};

// ---------- Code 128 (set B), zoals de streepjescode in IOne ----------
const C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
function streepjescode(tekst) {
  const codes = [104];
  for (const ch of String(tekst)) { const v = ch.charCodeAt(0) - 32; codes.push(v >= 0 && v < 95 ? v : 0); }
  let som = 104; for (let i = 1; i < codes.length; i++) som += codes[i] * i;
  codes.push(som % 103, 106);
  const mods = []; for (const c of codes) [...C128[c]].forEach((w, i) => mods.push([Number(w), i % 2 === 0]));
  const totaal = mods.reduce((s, m) => s + m[0], 0) + 10; // + rustzone links
  let mw = 0.56; const maxW = 243 - 170 - 3; if (totaal * mw > maxW) mw = maxW / totaal;
  let x = 10 * mw; let rects = '';
  for (const [w, zwart] of mods) { if (zwart) rects += `<rect x="${x.toFixed(3)}" y="0" width="${(w * mw).toFixed(3)}" height="14"/>`; x += w * mw; }
  const W = totaal * mw;
  return { W, svg: `<svg viewBox="0 0 ${W.toFixed(3)} 14" style="position:absolute;left:170pt;bottom:6pt;width:${W.toFixed(3)}pt;height:14pt" xmlns="http://www.w3.org/2000/svg">${rects}</svg>` };
}

// ---------- Prijskaartje ----------
const PK_CSS = `
.pk{position:relative;width:243pt;height:153pt;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff;font-feature-settings:normal;font-variant-ligatures:none}
.pk .t{position:absolute;white-space:nowrap;line-height:1.25}
.pk .oms{left:65pt;font-size:10pt;max-width:172pt;overflow:hidden;text-overflow:ellipsis}
.pk .maat{left:65pt;font-size:10pt}
.pk .prijs{left:62pt;font-size:13pt;font-weight:bold}`;
function prijskaartje(k) {
  const bc = streepjescode(k.nr); const mid = 170 + bc.W / 2;
  const fs = String(k.nr).length > 8 ? 7 : 10; const w = String(k.nr).length * 0.556 * fs; let links = mid - w / 2; if (links + w > 240) links = 240 - w;
  const at = (cls, y, html, extra = '') => `<div class="t ${cls}" style="bottom:${(y - 0.27 * 10 - 0.6).toFixed(2)}pt;${extra}">${html}</div>`;
  return `<div class="pk">${at('oms', 65.62, esc(k.oms))}${k.maat ? at('maat', 42.72, esc(k.maat)) : ''}${at('prijs', 19.2, esc(k.prijs))}${at('', 24.04, esc(k.nr), `left:${links.toFixed(2)}pt;font-size:${fs}pt`)}${bc.svg}</div>`;
}

// ---------- Wandkaart ----------
const FORMATEN = { A5: [210, 148], A4: [297, 210], A6: [148, 105] };
// Twee kaarten onder elkaar op één staand vel van het volgende formaat
const DUBBEL_VEL = { A5: ['A4 portrait', 'A4', 297], A6: ['A5 portrait', 'A5', 210], A4: ['A3 portrait', 'A3', 420] };
const DUBBEL_CSS = `.vel2{position:relative;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden}
.vel2 .snij{position:absolute;left:0;right:0;top:50%;border-top:.2mm dashed #c8c8c8}`;
// Wandkaarten die klaarstaan om samen met de volgende kaart op één vel te printen
const wkWacht = { lees() { try { return JSON.parse(localStorage.getItem('kaart-wk-vel') || '[]'); } catch { return []; } },
  zet(l) { try { localStorage.setItem('kaart-wk-vel', JSON.stringify(l)); } catch { /* geen opslag */ } } };
const WK_CSS = `
.wk{--w:210mm;--h:148mm;--u:calc(var(--w) / 210);position:relative;width:var(--w);height:var(--h);background:#fff;overflow:hidden;color:#1d1d1b;
  font-family:"Proxima Nova","Montserrat","Avenir Next","Segoe UI",Arial,sans-serif;font-feature-settings:normal;font-variant-ligatures:none}
.wk .wk-col{position:absolute;left:50%;top:calc(var(--u)*3);width:calc(var(--u)*56);height:calc(var(--u)*30);transform:translateX(-50%)}
.wk .titel{position:absolute;left:calc(var(--u)*26);top:calc(var(--u)*35);font-size:calc(var(--u)*9.4);font-weight:600;white-space:nowrap;max-width:calc(var(--u)*170);overflow:hidden;text-overflow:ellipsis}
.wk .rijen{position:absolute;left:calc(var(--u)*24);top:calc(var(--u)*53);right:calc(var(--u)*24)}
.wk .r{display:grid;grid-template-columns:calc(var(--u)*72) 1fr;height:calc(var(--u)*16);align-items:center;font-size:calc(var(--u)*6.4);white-space:nowrap}
.wk .kruis{position:absolute;left:calc(var(--u)*43);top:calc(var(--u)*47);width:calc(var(--u)*120);height:calc(var(--u)*60)}
.wk .logo{position:absolute;right:calc(var(--u)*8);bottom:calc(var(--u)*7);width:calc(var(--u)*30);height:auto}`;
function collectieLogo(col) {
  if (!col) return '';
  const fs = col.length > 10 ? 11.5 : 13.5;
  return `<svg class="wk-col" viewBox="0 0 200 108" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="kg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a6526"/><stop offset=".5" stop-color="#a88d3a"/><stop offset="1" stop-color="#6b5720"/></linearGradient></defs>
    <polygon points="100,2 198,54 100,106 2,54" fill="url(#kg)"/>
    <text x="100" y="54" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="${fs}" letter-spacing="1.6" fill="#fff">${esc(col.toUpperCase())}</text>
    <text x="100" y="69" text-anchor="middle" font-family="Georgia,serif" font-size="7.5" letter-spacing="2.4" fill="#fff">COLLECTIE</text></svg>`;
}
// Het kruisjespatroon uit het Koreman-logo, groot en licht op de achtergrond (zoals op de bestaande wandkaarten)
const KRUISJES = `<svg class="kruis" viewBox="0 0 676 230" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#8fb0a4" stroke-opacity=".3" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="miter">
  <polyline points="0,2 338,228 676,2"/><polyline points="0,152 226,2 563,228"/><polyline points="113,228 450,2 676,152"/></g></svg>`;
function wandkaart(k, logoUrl) {
  const rij = (l, v) => (v ? `<div class="r"><span>${l}</span><span>${esc(v)}</span></div>` : '');
  return `<div class="wk">${KRUISJES}${collectieLogo(k.collectie)}<div class="titel">${esc(k.titel)}</div><div class="rijen">${rij('Afmeting:', k.maat)}${rij('Poolmateriaal:', k.pool)}${rij('Knoopdichtheid:', k.knoop)}${rij('Herkomst:', k.herkomst)}${rij('Prijs:', k.prijs)}</div><img class="logo" src="${logoUrl}" alt="Koreman Maastricht"></div>`;
}

// ---------- Printen in een verborgen frame (eigen papierformaat per soort kaart) ----------
export function printHtml(inhoud, css, pagina) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(f);
  const doc = f.contentDocument;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><base href="${document.baseURI}"><title>Koreman kaarten</title>
    <style>@page{size:${pagina};margin:0}html,body{margin:0;padding:0}${css}
    .vel{break-after:page;page-break-after:always}.vel:last-child{break-after:auto;page-break-after:auto}
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${inhoud}</body></html>`);
  doc.close();
  const klaar = () => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 60000); };
  const imgs = [...doc.images].filter((i) => !i.complete);
  if (!imgs.length) setTimeout(klaar, 150);
  else Promise.all(imgs.map((i) => new Promise((r) => { i.onload = r; i.onerror = r; }))).then(() => setTimeout(klaar, 150));
}

// ---------- Wandkaarten printen (1 per vel, of 2 onder elkaar op het volgende formaat) ----------
const LOGO_WK = () => new URL('img/logo-k-maastricht.png', document.baseURI).href;
const uitvouwen = (lijst) => lijst.flatMap((k) => Array(Math.max(1, Number(k.n) || 1)).fill(k));
function printWandkaarten(lijst, formaat, perVel) {
  const [w, h] = FORMATEN[formaat] || FORMATEN.A5;
  const kaarten = uitvouwen(lijst).map((x) => wandkaart(x, LOGO_WK()).replace('class="wk"', `class="wk" style="--w:${w}mm;--h:${h}mm"`));
  if (String(perVel) !== '2') { printHtml(kaarten.map((k) => `<div class="vel">${k}</div>`).join(''), WK_CSS, `${w}mm ${h}mm`); return; }
  const [pagina, , velH] = DUBBEL_VEL[formaat] || DUBBEL_VEL.A5;
  let html = '';
  for (let i = 0; i < kaarten.length; i += 2) html += `<div class="vel vel2" style="width:${w}mm;height:${velH - 0.5}mm">${kaarten[i]}${kaarten[i + 1] || ''}${kaarten[i + 1] ? '<div class="snij"></div>' : ''}</div>`;
  printHtml(html, WK_CSS + DUBBEL_CSS, pagina);
}
// Wandkaartgegevens uit een artikel (artikel met designs(naam) en leveranciers(land))
function wandkaartVoorArtikel(a) {
  return {
    nr: String(a.artikelnummer ?? ''),
    collectie: herkenCollectie(a.naam, a.omschrijving, a.omzetgroep, a.designs?.naam),
    titel: titelZonderMaat(a.naam) || a.naam || '',
    maat: maatTekst(a),
    pool: a.materiaal || onthoud.get('pool'),
    knoop: onthoud.get('knoop'),
    herkomst: a.leveranciers?.land || onthoud.get('herkomst', 'India'),
    prijs: prijsWand(a.verkoopprijs),
    n: 1,
  };
}

// ---------- Venster vanuit het artikel ----------
export async function kaartenModal(a) {
  const logoUrl = new URL('img/logo-k-maastricht.png', document.baseURI).href;
  const pk = { oms: titelZonderMaat(a.naam) || a.naam || '', maat: maatTekst(a), prijs: prijsKaartje(a.verkoopprijs), nr: String(a.artikelnummer ?? ''), n: 1 };
  const wk = { ...wandkaartVoorArtikel(a), formaat: onthoud.get('formaat', 'A5') };
  const optCol = Object.entries(COLLECTIES).map(([g, subs]) => `<optgroup label="${esc(g)}">${subs.map((s) => `<option ${wk.collectie === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</optgroup>`).join('');
  const veld = (id, label, v, extra = '') => `<label>${label}<input id="${id}" value="${esc(v)}" ${extra}></label>`;
  const body = `
    <style>${PK_CSS}${WK_CSS}${SK_CSS}
      .kt-tabs{display:flex;gap:6px;margin-bottom:14px}.kt-pane{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px;align-items:start}
      .kt-pane[hidden]{display:none}.kt-prev{background:var(--canvas);border:1px solid var(--line);border-radius:12px;padding:12px;overflow:hidden}
      .kt-prev .schaal{transform-origin:top left}.kt-form label{display:block;margin-bottom:8px;font-size:13px;color:var(--navy-500)}
      .kt-form input,.kt-form select{display:block;width:100%;margin-top:3px}.kt-row{display:flex;gap:8px;align-items:end}
      @media (max-width:760px){.kt-pane{grid-template-columns:1fr}}</style>
    <div class="kt-tabs"><button type="button" class="btn primary" data-tab="wk">Wandkaart</button><button type="button" class="btn" data-tab="pk">Prijskaartje</button><button type="button" class="btn" data-tab="sk">Staalkaart (B2B)</button></div>
    <div class="kt-pane" data-pane="wk">
      <div class="kt-prev"><div class="schaal" id="wk-prev"></div></div>
      <div class="kt-form">
        <label>Collectie<select id="wk-collectie"><option value="">Geen collectielogo</option>${optCol}</select></label>
        ${veld('wk-titel', 'Titel', wk.titel)}${veld('wk-maat', 'Afmeting', wk.maat, 'placeholder="241 x 175"')}
        ${veld('wk-pool', 'Poolmateriaal', wk.pool, 'list="kt-pool"')}${veld('wk-knoop', 'Knoopdichtheid', wk.knoop, 'list="kt-knoop"')}
        ${veld('wk-herkomst', 'Herkomst', wk.herkomst)}${veld('wk-prijs', 'Prijs', wk.prijs)}
        <div class="kt-row"><label style="flex:1">Formaat<select id="wk-formaat">${Object.keys(FORMATEN).map((f) => `<option value="${f}" ${wk.formaat === f ? 'selected' : ''}>${f} liggend (${FORMATEN[f][0]} × ${FORMATEN[f][1]} mm)</option>`).join('')}</select></label>
          <label style="width:70px">Aantal<input id="wk-n" type="number" min="1" value="1"></label></div>
        <label>Kaarten per vel<select id="wk-pervel"><option value="1">1 kaart per vel (eigen formaat)</option><option value="2">2 kaarten per vel (onder elkaar)</option></select></label>
        <div id="wk-wacht" class="small" style="margin:-2px 0 10px"></div>
        <button type="button" class="btn primary" id="wk-print" style="width:100%"><i data-lucide="printer"></i> Print wandkaart</button>
        <button type="button" class="btn" id="wk-bewaar" style="width:100%;margin-top:6px" hidden><i data-lucide="plus"></i> Bewaar voor het vel (print later samen met een andere kaart)</button>
      </div>
    </div>
    <div class="kt-pane" data-pane="pk" hidden>
      <div class="kt-prev"><div class="schaal" id="pk-prev"></div></div>
      <div class="kt-form">
        ${veld('pk-oms', 'Omschrijving', pk.oms)}${veld('pk-maat', 'Maat', pk.maat, 'placeholder="250 x 200"')}${veld('pk-prijs', 'Prijs', pk.prijs)}
        <label>Aantal<input id="pk-n" type="number" min="1" value="1"></label>
        <button type="button" class="btn primary" id="pk-print" style="width:100%"><i data-lucide="printer"></i> Print prijskaartje</button>
        <p class="small muted" style="margin-top:8px">Formaat 85,7 × 54 mm, opmaak "Meubelen" uit IOne. Kies de labelprinter en schaal 100%.</p>
      </div>
    </div>
    ${staalPaneHtml()}
    <datalist id="kt-pool"><option>Hoogland wol &amp; bamboezijde</option><option>Nieuw-Zeelandse wol</option><option>Nieuw-Zeelandse wol &amp; zijde</option><option>Hoogland wol</option><option>Wol &amp; bamboezijde</option><option>Wol &amp; zijde</option><option>100% wol</option><option>Zijde</option><option>Tencel</option></datalist>
    <datalist id="kt-knoop"><option>ong. 350.000 knopen p/m²</option><option>ong. 250.000 knopen p/m²</option><option>ong. 160.000 knopen p/m²</option><option>Handgetuft</option><option>Handgeweven</option></datalist>`;

  await modal({
    title: `Kaarten printen – ${a.artikelnummer} ${a.naam || ''}`,
    body,
    wide: true,
    onOpen: (form) => {
      $('.actions [data-cancel]', form.parentElement).textContent = 'Sluiten';
      const v = (id) => $('#' + id, form).value;
      const schaal = (el, breedtePx) => { el.style.transform = 'none'; const kaart = el.firstElementChild; const k = breedtePx / kaart.offsetWidth; el.style.transform = `scale(${k})`; el.parentElement.style.height = `${kaart.offsetHeight * k + 24}px`; };
      const leesWk = () => ({ collectie: v('wk-collectie'), titel: v('wk-titel'), maat: v('wk-maat'), pool: v('wk-pool'), knoop: v('wk-knoop'), herkomst: v('wk-herkomst'), prijs: v('wk-prijs'), formaat: v('wk-formaat'), n: Math.max(1, parseInt(v('wk-n'), 10) || 1) });
      const leesPk = () => ({ oms: v('pk-oms'), maat: v('pk-maat'), prijs: v('pk-prijs'), nr: pk.nr, n: Math.max(1, parseInt(v('pk-n'), 10) || 1) });
      const zetPerVel = () => {
        const twee = v('wk-pervel') === '2'; const wacht = wkWacht.lees(); const f = v('wk-formaat');
        $('#wk-bewaar', form).hidden = !twee;
        $('#wk-print', form).innerHTML = `<i data-lucide="printer"></i> ${twee ? `Print op ${DUBBEL_VEL[f][1]} (2 per vel)` : 'Print wandkaart'}`;
        $('#wk-wacht', form).innerHTML = twee
          ? (wacht.length ? `<div style="background:var(--amber-bg);border-radius:8px;padding:8px 10px">Klaar voor het vel: ${wacht.map((x, i) => `<span style="white-space:nowrap"><b>${esc(x.titel)}</b>${x.maat ? ' (' + esc(x.maat) + ')' : ''}${Number(x.n) > 1 ? ' ×' + x.n : ''} <a href="#" data-weg="${i}" title="Weghalen">✕</a></span>`).join(', ')}<br><span class="muted">Deze worden samen met deze kaart geprint.</span></div>`
            : `<span class="muted">${DUBBEL_VEL[f][1]} staand, met een snijlijn in het midden. Wil je twee verschillende tapijten op één vel? Klik bij het eerste op "Bewaar voor het vel" en print bij het tweede.</span>`)
          : '';
        $('#wk-wacht', form).querySelectorAll('[data-weg]').forEach((x) => { x.onclick = (e) => { e.preventDefault(); const l = wkWacht.lees(); l.splice(Number(x.dataset.weg), 1); wkWacht.zet(l); zetPerVel(); }; });
        window.lucide?.createIcons();
      };
      const toonWk = () => { const el = $('#wk-prev', form); el.innerHTML = wandkaart(leesWk(), logoUrl); schaal(el, $('.kt-prev', form).clientWidth - 24); };
      const toonPk = () => { const el = $('#pk-prev', form); el.innerHTML = prijskaartje(leesPk()); schaal(el, Math.min(420, $('[data-pane=pk] .kt-prev', form).clientWidth - 24)); };
      $('#wk-collectie', form).value = wk.collectie;
      $('#wk-pervel', form).value = onthoud.get('pervel', '1');
      form.addEventListener('change', (e) => { if (e.target.id === 'wk-pervel' || e.target.id === 'wk-formaat') {
        // 2 per vel: standaard A5-kaarten op een gewoon A4-vel
        if (e.target.id === 'wk-pervel' && v('wk-pervel') === '2' && v('wk-formaat') === 'A4') { $('#wk-formaat', form).value = 'A5'; toonWk(); }
        onthoud.set('pervel', v('wk-pervel')); zetPerVel(); } });
      zetPerVel();
      $('#wk-bewaar', form).onclick = () => {
        const k = leesWk();
        if (!k.titel) { toast('Vul een titel in', 'error'); return; }
        const l = wkWacht.lees(); l.push({ ...k, nr: String(a.artikelnummer ?? '') }); wkWacht.zet(l);
        toast(`${k.n === 1 ? 'Kaart' : k.n + ' kaarten'} bewaard. Open het volgende artikel en print daar.`); zetPerVel();
      };
      form.addEventListener('input', (e) => { if (e.target.id?.startsWith('wk-')) toonWk(); else if (e.target.id?.startsWith('pk-')) toonPk(); });
      form.addEventListener('change', (e) => { if (e.target.id?.startsWith('wk-')) toonWk(); });
      form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); });
      form.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
        form.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('primary', x === b));
        form.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.tab; });
        if (b.dataset.tab === 'pk') toonPk(); else if (b.dataset.tab === 'sk') toonSk(); else toonWk();
      }));
      $('#wk-print', form).onclick = () => {
        const k = leesWk();
        if (!k.titel) { toast('Vul een titel in', 'error'); return; }
        onthoud.set('pool', k.pool); onthoud.set('knoop', k.knoop); onthoud.set('herkomst', k.herkomst); onthoud.set('formaat', k.formaat);
        if (v('wk-pervel') !== '2') { printWandkaarten([k], k.formaat, 1); return; }
        printWandkaarten([...wkWacht.lees(), k], k.formaat, 2);
        wkWacht.zet([]); zetPerVel();
      };
      $('#pk-print', form).onclick = () => {
        const k = leesPk();
        printHtml(Array(k.n).fill(`<div class="vel">${prijskaartje(k)}</div>`).join(''), PK_CSS, '243pt 153pt');
      };
      const toonSk = staalPaneInit(form, a, new URL('img/logo-koreman.jpg', document.baseURI).href, onthoud, printHtml);
      window.lucide?.createIcons();
      if (a.soort === 'staal') form.querySelector('[data-tab=sk]').click(); else requestAnimationFrame(toonWk);
    },
  });
}

// =====================================================================
// Wandkaarten vanuit de artikellijst: meerdere artikelen kiezen, aantal per kaart,
// en in één keer printen (zelfde lijst als "Bewaar voor het vel" in het artikel).
// =====================================================================
export async function wandVelModal(ids = []) {
  const { sb, check, artikelPicker } = await import('./ui.js?v=20261117141633');
  const SEL = '*, designs(naam), leveranciers(land)';
  await modal({
    title: 'Wandkaarten printen',
    wide: true,
    body: `<style>${WK_CSS}.wv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-top:12px}
        .wv-item{border:1px solid var(--line);border-radius:10px;padding:6px;background:var(--canvas)}
        .wv-item .schaal{transform-origin:top left}.wv-item .wrap{overflow:hidden;background:#fff}
        .wv-item .onder{display:flex;gap:6px;align-items:center;font-size:12px;margin-top:4px}
        .wv-item .onder input{padding:2px 6px}</style>
      <div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap">
        <label class="field" style="flex:1;min-width:220px;margin:0">Wandkaart toevoegen (zoek op artikelnummer of naam)<input id="wv-zoek" placeholder="Typ om te zoeken…" autocomplete="off"></label>
        <label class="field" style="width:170px;margin:0">Formaat kaart<select id="wv-formaat">${Object.keys(FORMATEN).map((f) => `<option value="${f}">${f} liggend</option>`).join('')}</select></label>
        <label class="field" style="width:200px;margin:0">Per vel<select id="wv-pervel"><option value="2">2 kaarten per vel</option><option value="1">1 kaart per vel</option></select></label>
      </div>
      <p class="small muted" id="wv-info" style="margin:8px 0 0"></p>
      <div class="wv-grid" id="wv-grid"></div>
      <div style="display:flex;gap:8px;margin-top:14px"><button type="button" class="btn" id="wv-leeg">Lijst leegmaken</button><span style="flex:1"></span>
        <button type="button" class="btn primary" id="wv-print"><i data-lucide="printer"></i> Print</button></div>`,
    onOpen: (form) => {
      $('.actions [data-cancel]', form).textContent = 'Sluiten';
      const fo = $('#wv-formaat', form); const pv = $('#wv-pervel', form);
      fo.value = onthoud.get('formaat', 'A5'); pv.value = onthoud.get('lijst-pervel', '2');
      const toon = () => {
        const l = wkWacht.lees(); const tot = l.reduce((x, k) => x + (Number(k.n) || 1), 0); const twee = pv.value === '2';
        const vellen = twee ? Math.ceil(tot / 2) : tot;
        $('#wv-info', form).innerHTML = l.length
          ? `${l.length} ${l.length === 1 ? 'tapijt' : 'tapijten'}, samen ${tot} kaart${tot === 1 ? '' : 'en'} · ${twee ? `2 per ${DUBBEL_VEL[fo.value][1]}-vel (met snijlijn)` : `1 per ${fo.value}-vel`} · ${vellen} vel${vellen === 1 ? '' : 'len'}. Klik op een tekst in een kaart om die aan te passen.`
          : 'Nog geen wandkaarten gekozen. Zoek hierboven een tapijt, of vink artikelen aan in de lijst.';
        $('#wv-print', form).innerHTML = `<i data-lucide="printer"></i> Print (${tot} kaart${tot === 1 ? '' : 'en'})`;
        $('#wv-grid', form).innerHTML = l.map((k, i) => `<div class="wv-item"><div class="wrap"><div class="schaal">${wandkaart(k, LOGO_WK())}</div></div>
          <div class="onder"><b>${esc(k.nr || '')}</b><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(k.titel)}</span></div>
          <div class="onder"><label style="display:flex;gap:4px;align-items:center;margin:0">Aantal <input type="number" min="1" max="99" value="${Number(k.n) || 1}" data-n="${i}" style="width:56px"></label><span style="flex:1"></span><button type="button" class="btn small" data-bewerk="${i}">Aanpassen</button><button type="button" class="btn small" data-weg="${i}">Weg</button></div></div>`).join('');
        form.querySelectorAll('.wv-item').forEach((it) => { const sc = $('.schaal', it); const kaart = sc.firstElementChild; const f = (it.clientWidth - 12) / kaart.offsetWidth; sc.style.transform = `scale(${f})`; $('.wrap', it).style.height = `${kaart.offsetHeight * f}px`; });
        window.lucide?.createIcons();
      };
      const voegToe = async (lijstIds) => {
        const al = new Set(wkWacht.lees().map((k) => k.nr));
        const arts = [];
        for (let i = 0; i < lijstIds.length; i += 200) arts.push(...check(await sb.from('artikelen').select(SEL).in('id', lijstIds.slice(i, i + 200))));
        const l = wkWacht.lees();
        arts.forEach((a) => { const k = wandkaartVoorArtikel(a); if (!al.has(k.nr)) { l.push(k); al.add(k.nr); } });
        wkWacht.zet(l); toon();
      };
      artikelPicker($('#wv-zoek', form), (r) => voegToe([r.id]));
      const bewerk = (i) => {
        const l = wkWacht.lees(); const k = l[i]; if (!k) return;
        const velden = [['collectie', 'Collectie'], ['titel', 'Titel'], ['maat', 'Afmeting'], ['pool', 'Poolmateriaal'], ['knoop', 'Knoopdichtheid'], ['herkomst', 'Herkomst'], ['prijs', 'Prijs']];
        const item = form.querySelectorAll('.wv-item')[i];
        item.querySelector('.onder').insertAdjacentHTML('beforebegin', `<div class="wv-edit" style="display:grid;gap:4px;margin-top:6px;font-size:12px">${velden.map(([f, lbl]) => f === 'collectie'
          ? `<label style="margin:0">${lbl}<select data-f="${f}" style="width:100%"><option value="">Geen collectielogo</option>${Object.entries(COLLECTIES).map(([g, subs]) => `<optgroup label="${esc(g)}">${subs.map((x) => `<option ${k.collectie === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</optgroup>`).join('')}</select></label>`
          : `<label style="margin:0">${lbl}<input data-f="${f}" value="${esc(k[f] || '')}" style="width:100%;padding:3px 6px"></label>`).join('')}
          <button type="button" class="btn small primary" data-klaar="${i}">Klaar</button></div>`);
        item.querySelector(`[data-bewerk="${i}"]`).hidden = true;
      };
      form.addEventListener('change', (e) => {
        if (e.target === fo || e.target === pv) { onthoud.set('formaat', fo.value); onthoud.set('lijst-pervel', pv.value); toon(); return; }
        const i = e.target.dataset?.n; if (i === undefined) return;
        const l = wkWacht.lees(); if (!l[i]) return; l[i].n = Math.max(1, parseInt(e.target.value, 10) || 1); wkWacht.zet(l); toon();
      });
      form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); });
      form.addEventListener('click', (e) => {
        const weg = e.target.closest('[data-weg]'); if (weg) { const l = wkWacht.lees(); l.splice(Number(weg.dataset.weg), 1); wkWacht.zet(l); toon(); return; }
        const bw = e.target.closest('[data-bewerk]'); if (bw) { bewerk(Number(bw.dataset.bewerk)); return; }
        const kl = e.target.closest('[data-klaar]');
        if (kl) {
          const i = Number(kl.dataset.klaar); const l = wkWacht.lees(); const ed = kl.closest('.wv-edit');
          ed.querySelectorAll('[data-f]').forEach((x) => { l[i][x.dataset.f] = x.value; });
          wkWacht.zet(l); toon(); return;
        }
        if (e.target.closest('#wv-leeg')) { wkWacht.zet([]); toon(); }
      });
      $('#wv-print', form).onclick = () => {
        const l = wkWacht.lees(); if (!l.length) { toast('Kies eerst wandkaarten', 'error'); return; }
        printWandkaarten(l, fo.value, pv.value);
      };
      toon();
      if (ids.length) { $('#wv-info', form).textContent = 'Gegevens ophalen…'; voegToe(ids); }
    },
  });
}
