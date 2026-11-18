// Keuzelijsten (materiaal, knoopdichtheid, methode), een materiaalkiezer en de psychologische prijsafronding.

// ---------- Materialen (Nederlands voor artikel en wandkaart, Engels voor de B2B-staalkaart) ----------
export const MATERIALEN = [
  ['Wol', 'Wool'], ['Nieuw-Zeelandse wol', 'New Zealand Wool'], ['Hooglandwol', 'Highland Wool'], ['Ghazni wol', 'Ghazni Wool'],
  ['Tibetaanse wol', 'Tibetan Wool'], ['Scheerwol', 'Virgin Wool'], ['Zijde', 'Silk'], ['Natuurzijde', 'Natural Silk'],
  ['Bamboezijde', 'Bamboo Silk'], ['Sari zijde', 'Sari Silk'], ['Brandnetel', 'Nettle'], ['Tencel', 'Tencel'],
  ['Viscose', 'Viscose'], ['Linnen', 'Linen'], ['Katoen', 'Cotton'], ['Jute', 'Jute'], ['Hennep', 'Hemp'], ['Sisal', 'Sisal'],
  ['Mohair', 'Mohair'], ['Kasjmier', 'Cashmere'], ['Alpaca', 'Alpaca'], ['Leer', 'Leather'], ['Polyester', 'Polyester'],
  ['Micro polyester', 'Micro Polyester'], ['Acryl', 'Acrylic'],
];
export const MATERIALEN_NL = MATERIALEN.map(([nl]) => nl);
export const MATERIALEN_EN = MATERIALEN.map(([, en]) => en);

// ---------- Knoopdichtheid en methode ----------
const KNOPEN = [60000, 80000, 100000, 120000, 150000, 160000, 180000, 200000, 250000, 300000, 350000, 400000, 450000, 500000, 600000, 700000, 800000, 1000000];
const dzd = (n) => n.toLocaleString('nl-NL');
export const KNOOP_NL = [...KNOPEN.map((n) => `ong. ${dzd(n)} knopen p/m²`), 'Handgetuft', 'Handgetuft 14/14', 'Handgetuft 16/16', 'Handloom', 'Handgeweven', 'Platgeweven', 'n.v.t.'];
export const KNOOP_EN = [...KNOPEN.map((n) => `${dzd(n)} / m²`), 'Handtufted', 'Handtufted 14/14', 'Handtufted 16/16', 'Handloom', 'Handwoven', 'Flatweave', 'N/A'];
export const METHODES_EN = ['Handknotted', 'Handtufted', 'Handloom', 'Handwoven', 'Flatweave', 'Hand-knotted Nepalese', 'Loop & Cut'];
export const TECHNIEKEN_NL = ['Handgeknoopt', 'Handgetuft', 'Handloom', 'Handgeweven', 'Platgeweven', 'Nepalese knoop', 'Loop & cut'];

// "n/a", "nvt", "n.v.t." of een streepje
export const leegWaarde = (v) => /^\s*(n\s*\/?\s*a|nvt|n\.v\.t\.?|-|–|—)?\s*$/i.test(String(v ?? ''));
// Regel weglaten op de kaart: alleen als je zelf N/A (of n.v.t.) kiest of typt. Komt N/A van de website, dan blijft de regel staan.
export const WEG = '__weg';
export function volgGebruiker(root) {
  const markeer = (e) => { if (e.isTrusted && e.target?.id) e.target.dataset.gebruiker = '1'; };
  root.addEventListener('input', markeer, true); root.addEventListener('change', markeer, true);
}
export function kaartWaarde(el) {
  if (!el) return '';
  if (el.closest?.('.na-wrap')?.querySelector('.na-vink input')?.checked) return WEG; // N/A aangevinkt: regel weg
  const v = el.value;
  return el.dataset.gebruiker && String(v).trim() && leegWaarde(v) ? WEG : v;
}
// Vinkje "N/A" rechtsboven bij elk kaartveld: aangevinkt = die regel staat niet op de kaart.
// Per artikel onthouden (sleutel = artikelnummer), dus de volgende keer staat het vinkje er nog.
export function naVinkjes(form, ids, sleutel = '') {
  const key = sleutel ? `kaart-na-${sleutel}` : '';
  let aan = [];
  try { aan = key ? JSON.parse(localStorage.getItem(key) || '[]') : []; } catch { aan = []; }
  const bewaar = () => {
    if (!key) return;
    const l = ids.filter((id) => form.querySelector(`#${id}-na`)?.checked);
    try { if (l.length) localStorage.setItem(key, JSON.stringify(l)); else localStorage.removeItem(key); } catch { /* geen opslag */ }
  };
  ids.forEach((id) => {
    const el = form.querySelector('#' + id); const lab = el?.closest('label');
    if (!lab || lab.parentElement?.classList.contains('na-wrap')) return;
    const wrap = document.createElement('div'); wrap.className = 'na-wrap';
    lab.replaceWith(wrap); wrap.appendChild(lab);
    const vink = document.createElement('label'); vink.className = 'na-vink'; vink.title = 'Deze regel niet op de kaart zetten';
    vink.innerHTML = `<input type="checkbox" id="${id}-na"> N/A`;
    wrap.appendChild(vink);
    const cb = vink.firstElementChild;
    const stand = () => { wrap.classList.toggle('na-aan', cb.checked); };
    cb.checked = aan.includes(id); stand();
    cb.addEventListener('change', () => { stand(); bewaar(); });
  });
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// ---------- Keuzelijst met "zelf invullen" ----------
// HTML voor een <select> met de opties; een waarde die niet in de lijst staat wordt als extra optie getoond.
export function keuzeSelect(id, opties, waarde = '', leeg = '–') {
  const lijst = waarde && !opties.includes(waarde) ? [waarde, ...opties] : opties;
  return `<select id="${id}" data-keuze><option value="">${esc(leeg)}</option>${lijst.map((o) => `<option ${o === waarde ? 'selected' : ''}>${esc(o)}</option>`).join('')}<option value="__zelf">✎ Zelf invullen…</option></select>`;
}
// Zet een waarde in een veld (select, gewoon invoerveld of materiaalkiezer)
export function zetWaarde(el, val) {
  if (!el) return;
  const v = val ?? '';
  if (el.tagName === 'SELECT' && v && ![...el.options].some((o) => o.value === v)) {
    const o = document.createElement('option'); o.textContent = v; el.insertBefore(o, el.options[1] || null);
  }
  el.value = v;
  delete el.dataset.gebruiker; // door de app ingevuld (bv. van de website), niet door jou gekozen
  el.dispatchEvent(new Event('keuze-zet'));
}
// "Zelf invullen…" gekozen: vraag de tekst in een klein invoerveld onder de lijst
export function activeerKeuzes(root) {
  root.addEventListener('change', (e) => {
    const sel = e.target;
    if (!sel.matches?.('select[data-keuze]') || sel.value !== '__zelf') return;
    sel.value = '';
    let inp = sel.parentElement.querySelector('.keuze-zelf');
    if (!inp) {
      inp = document.createElement('input'); inp.className = 'keuze-zelf'; inp.placeholder = 'Typ en druk op Enter'; inp.style.marginTop = '4px';
      sel.insertAdjacentElement('afterend', inp);
      const klaar = () => { const t = inp.value.trim(); if (t) { zetWaarde(sel, t); sel.dataset.gebruiker = '1'; sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); } inp.remove(); };
      inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); klaar(); } if (ev.key === 'Escape') inp.remove(); });
      inp.addEventListener('blur', klaar);
    }
    inp.focus();
  });
}

// ---------- Materiaalkiezer: meerdere materialen kiezen uit een lijst ----------
// Het oorspronkelijke invoerveld blijft (verborgen) bestaan en bevat bv. "Wol & Natuurzijde".
export function materiaalKeuze(input, { opties = MATERIALEN_NL, scheiding = ' & ' } = {}) {
  if (!input || input.dataset.materiaalKeuze) return;
  input.dataset.materiaalKeuze = '1';
  input.type = 'hidden';
  const box = document.createElement('div'); box.className = 'mat-keuze';
  input.insertAdjacentElement('afterend', box);
  const delen = () => String(input.value || '').split(/\s*(?:&|\/|,|\+)\s*/).map((x) => x.trim()).filter(Boolean);
  const zetDelen = (l) => { input.value = l.join(scheiding); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); teken(); };
  const teken = () => {
    const l = delen();
    box.innerHTML = `${l.map((m, i) => `<span class="chip aan">${esc(m)} <a href="#" data-mat-weg="${i}" title="Weghalen">✕</a></span>`).join('')}
      <select data-mat-add><option value="">${l.length ? '+ materiaal toevoegen…' : 'Kies materiaal…'}</option>${opties.filter((o) => !l.some((x) => x.toLowerCase() === o.toLowerCase())).map((o) => `<option>${esc(o)}</option>`).join('')}<option value="__zelf">✎ Zelf invullen…</option></select>`;
  };
  box.addEventListener('click', (e) => { const w = e.target.closest('[data-mat-weg]'); if (!w) return; e.preventDefault(); const l = delen(); l.splice(Number(w.dataset.matWeg), 1); zetDelen(l); });
  box.addEventListener('change', (e) => {
    e.stopPropagation();
    const s = e.target.closest('[data-mat-add]'); if (!s || !s.value) return;
    if (s.value === '__zelf') {
      const inp = document.createElement('input'); inp.placeholder = 'Materiaal, Enter'; inp.style.width = '160px';
      s.replaceWith(inp); inp.focus();
      const klaar = () => { const t = inp.value.trim(); if (t) zetDelen([...delen(), t]); else teken(); };
      inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); klaar(); } });
      inp.addEventListener('blur', klaar);
      return;
    }
    zetDelen([...delen(), s.value]);
  });
  input.addEventListener('keuze-zet', teken);
  teken();
}

// ---------- Psychologische prijs, zonder decimalen ----------
// Altijd naar boven afgerond:  < € 1.000 eindigt op 9 (bv. 627 → 629, 45 → 49),
// € 1.000–9.999 eindigt op 49 of 99 (1.628 → 1.649, 3.225 → 3.249), vanaf € 10.000 op 490 of 990 (15.234 → 15.490).
export function psychPrijs(x) {
  const n = Number(x);
  if (!n || n <= 0 || Number.isNaN(n)) return null;
  let v = n;
  if (v < 1000) { const r = Math.ceil((v + 1) / 10) * 10 - 1; if (r < 1000) return r; v = 1000; }
  if (v < 10000) { const r = Math.ceil((v + 1) / 50) * 50 - 1; if (r < 10000) return r; v = 10000; }
  return Math.ceil((v + 10) / 500) * 500 - 10;
}
