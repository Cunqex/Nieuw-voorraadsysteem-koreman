import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js?v=20261114113126';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- Formatters ----------
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function money(v, cur = 'EUR') {
  if (v === null || v === undefined || v === '') return '–';
  const n = Number(v);
  return (cur === 'USD' ? '$ ' : '€ ') + n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export const num = (v, d = 0) => (v === null || v === undefined || v === '') ? '–' : Number(v).toLocaleString('nl-NL', { maximumFractionDigits: d === 0 ? 2 : d });
export function datum(v) {
  if (!v) return '–';
  const d = new Date(v);
  return d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
export const vandaag = () => new Date().toISOString().slice(0, 10);
export const maat = (a) => (a?.breedte_cm && a?.lengte_cm) ? `${num(a.lengte_cm)} x ${num(a.breedte_cm)} cm` : '';
export const m2 = (a) => (a?.breedte_cm && a?.lengte_cm) ? (a.breedte_cm * a.lengte_cm) / 10000 : null;

// ---------- Labels ----------
export const SOORT_ARTIKEL = { voorraad: 'Voorraadtapijt', maatwerk: 'Maatwerk op bestelling', staal: 'Staal', dienst: 'Dienst' };
export const SOORT_KLANT = { particulier: 'Particulier', zakelijk: 'Zakelijk', architect: 'Architect', agent: 'Agent' };
export const BTW = { nl21: '21% btw (Nederland)', eu_verlegd: '0% btw verlegd (EU zakelijk)', export0: '0% btw (export buiten EU)' };
export const PO_STATUS = {
  concept: ['Concept', ''], verstuurd: ['Verstuurd', 'blue'], bevestigd: ['Bevestigd door leverancier', 'blue'],
  in_productie: ['In productie', 'orange'], verzonden: ['Verzonden', 'orange'], ontvangen: ['Ontvangen', 'green'], geannuleerd: ['Geannuleerd', 'red'],
};
export const SO_STATUS = {
  offerte: ['Offerte', ''], bevestigd: ['Bevestigd', 'blue'], geleverd: ['Geleverd', 'orange'],
  gefactureerd: ['Gefactureerd', 'orange'], betaald: ['Betaald', 'green'], geannuleerd: ['Geannuleerd', 'red'],
};
export const badge = (map, key) => { const [t, c] = map[key] || [key, '']; return `<span class="badge ${c}">${esc(t)}</span>`; };

// ---------- DOM helpers ----------
export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }
// Gedelegeerde event-handler. Loopt een (async) actie nog, dan wordt een
// tweede klik genegeerd – zo kan een knop nooit dubbel afgaan.
export function on(root, event, selector, handler) {
  let busy = false;
  root.addEventListener(event, (e) => {
    const t = e.target.closest?.(selector);
    if (!t || !root.contains(t) || busy) return;
    const r = handler(e, t);
    if (r && typeof r.finally === 'function') { busy = true; r.finally(() => { busy = false; }); }
  });
}

// Huidige pagina opnieuw opbouwen (na opslaan/verwijderen). Scrollpositie blijft staan.
export function refresh() { window.dispatchEvent(new Event('app:refresh')); }

export function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  $('#toast-root').appendChild(t);
  setTimeout(() => t.remove(), type === 'error' ? 7000 : 3500);
}

// Controleer Supabase-resultaat; gooit fout met nette melding
export function check({ data, error }) {
  if (error) {
    console.error(error);
    toast('Fout: ' + (error.message || error), 'error');
    throw error;
  }
  return data;
}

// ---------- Modal ----------
export function modal({ title, body, submitLabel = 'Opslaan', onSubmit, wide = false, onOpen, danger = false }) {
  return new Promise((resolve) => {
    const root = $('#modal-root');
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<form class="modal" style="${wide ? 'max-width:1000px' : ''}">
      <h2>${esc(title)}</h2>
      <div class="modal-body">${body}</div>
      <div class="actions">
        <button type="button" class="btn" data-cancel>Annuleren</button>
        ${onSubmit ? `<button type="submit" class="btn ${danger ? 'danger-solid' : 'primary'}">${esc(submitLabel)}</button>` : ''}
      </div></form>`;
    root.appendChild(bg);
    const form = $('form', bg);
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || root.lastElementChild !== bg) return;
      close(null);
    };
    document.addEventListener('keydown', onKey);
    const close = (v) => { document.removeEventListener('keydown', onKey); bg.remove(); resolve(v); };
    $('[data-cancel]', bg).onclick = () => close(null);
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(null); });
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', form);
      btn.disabled = true;
      try {
        const res = await onSubmit(readForm(form), form);
        if (res !== false) close(res ?? true);
      } catch (err) { console.error(err); }
      btn.disabled = false;
    };
    onOpen?.(form);
    const first = $('input:not([type=hidden]):not(.combo-input),select,textarea,.combo-btn', $('.modal-body', form));
    (first || $('button[type=submit]', form))?.focus();
  });
}

export function confirmBox(text, label = 'Ja, doorgaan') {
  const danger = /verwijder|annuleer/i.test(label);
  return modal({ title: 'Weet je het zeker?', body: `<p>${esc(text)}</p>`, submitLabel: label, danger, onSubmit: () => true });
}

// ---------- Forms ----------
// fields: [{name, label, type:'text'|'number'|'textarea'|'select'|'checkbox'|'date', options:{v:label}|[[v,l]], full, hint, step, required}]
export function formFields(fields, values = {}) {
  return `<div class="form-grid">${fields.map((f) => {
    const v = values[f.name] ?? f.default ?? '';
    const req = f.required ? 'required' : '';
    const cls = f.full ? 'full' : '';
    const hint = f.hint ? `<span class="hint">${esc(f.hint)}</span>` : '';
    if (f.type === 'checkbox') {
      return `<label class="check ${cls}"><input type="checkbox" name="${f.name}" ${v ? 'checked' : ''}> ${esc(f.label)}</label>`;
    }
    if (f.type === 'textarea') {
      return `<label class="${cls || 'full'}">${esc(f.label)}<textarea name="${f.name}" ${req}>${esc(v)}</textarea>${hint}</label>`;
    }
    if (f.type === 'combo') {
      return `<div class="field ${cls}"><span>${esc(f.label)}</span>${comboHtml({ name: f.name, options: f.options, value: v, placeholder: f.placeholder, empty: f.empty, required: f.required })}${hint}</div>`;
    }
    if (f.type === 'select') {
      const opts = Array.isArray(f.options) ? f.options : Object.entries(f.options);
      return `<label class="${cls}">${esc(f.label)}<select name="${f.name}" ${req}>
        ${f.empty !== undefined ? `<option value="">${esc(f.empty)}</option>` : ''}
        ${opts.map(([ov, ol]) => `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`).join('')}
      </select>${hint}</label>`;
    }
    const step = f.type === 'number' ? `step="${f.step || 'any'}"` : '';
    return `<label class="${cls}">${esc(f.label)}<input type="${f.type || 'text'}" name="${f.name}" value="${esc(v)}" ${step} ${req} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}>${hint}</label>`;
  }).join('')}</div>`;
}

// Leest form naar object; lege strings → null, numbers → Number, checkbox → bool
export function readForm(form) {
  const out = {};
  $$('input[name],select[name],textarea[name]', form).forEach((el) => {
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'number') out[el.name] = el.value === '' ? null : Number(el.value);
    else if (el.type === 'file') return;
    else out[el.name] = el.value.trim() === '' ? null : el.value.trim();
  });
  return out;
}

// ---------- Storage (foto's / CAD's) ----------
const urlCache = new Map();
export async function mediaUrl(path) {
  if (!path) return null;
  const c = urlCache.get(path);
  if (c && c.exp > Date.now()) return c.url;
  const { data } = await sb.storage.from('media').createSignedUrl(path, 3600);
  if (!data) return null;
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}
// Vul alle <img data-path="..."> in een container (alle links in één verzoek)
export async function loadImages(root) {
  const imgs = $$('img[data-path]', root).filter((i) => i.dataset.path);
  const now = Date.now();
  const need = [...new Set(imgs.map((i) => i.dataset.path))].filter((p) => !(urlCache.get(p)?.exp > now));
  for (let i = 0; i < need.length; i += 100) {
    const { data } = await sb.storage.from('media').createSignedUrls(need.slice(i, i + 100), 3600);
    (data || []).forEach((d) => { if (d.signedUrl) urlCache.set(d.path, { url: d.signedUrl, exp: now + 50 * 60 * 1000 }); });
  }
  imgs.forEach((img) => {
    const u = urlCache.get(img.dataset.path)?.url;
    img.onerror = () => { img.removeAttribute('src'); img.classList.add('img-fout'); };
    if (u) img.src = u; else img.classList.add('img-fout');
  });
}
export const isImage = (p) => /\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(p || '');
export async function uploadFile(folder, file) {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${folder}/${Date.now()}-${safe}`;
  check(await sb.storage.from('media').upload(path, file, { upsert: false }));
  return path;
}

// ---------- Artikel zoeken (autocomplete) ----------
export function artikelPicker(input, onPick, { filter } = {}) {
  const wrap = input.parentElement;
  wrap.classList.add('ac');
  let list = null; let timer;
  const close = () => { list?.remove(); list = null; };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      if (q.length < 1) return close();
      let query = sb.from('artikelen').select('id, artikelnummer, naam, omschrijving, soort, leverancier_id, inkoopprijs, verkoopprijs, breedte_cm, lengte_cm, foto_pad, design_id, designs(hoofdfoto_pad, design_code_lev)').eq('actief', true).limit(15);
      if (/^\d+$/.test(q)) query = query.eq('artikelnummer', Number(q));
      else query = query.or(`naam.ilike.%${q.replace(/[%,()]/g, '')}%,omschrijving.ilike.%${q.replace(/[%,()]/g, '')}%`);
      if (filter) query = filter(query);
      const rows = check(await query);
      close();
      list = document.createElement('div');
      list.className = 'ac-list';
      list.innerHTML = rows.length ? rows.map((r, i) => `<div class="ac-item" data-i="${i}">
        <b>${r.artikelnummer}</b><span>${esc(r.naam)}</span><span class="muted small" style="margin-left:auto">${esc([maat(r), SOORT_ARTIKEL[r.soort]].filter(Boolean).join(' · '))}</span></div>`).join('')
        : '<div class="ac-item muted">Niets gevonden</div>';
      wrap.appendChild(list);
      list.addEventListener('mousedown', (e) => {
        const it = e.target.closest('[data-i]');
        if (!it) return;
        e.preventDefault();
        onPick(rows[Number(it.dataset.i)]);
        input.value = '';
        close();
      });
    }, 200);
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
}

// Haal rijen uit een view op en hang ze als ._t aan de bijbehorende records
export async function withTotals(rows, view, key, select = '*') {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const out = [];
  for (let i = 0; i < ids.length; i += 200) {
    out.push(...check(await sb.from(view).select(select).in(key, ids.slice(i, i + 200))));
  }
  const map = new Map(out.map((t) => [t[key], t]));
  rows.forEach((r) => { r._t = map.get(r.id) || {}; });
  return rows;
}

// Opties voor de zoekbare keuzelijsten
export const klantOpt = (k) => [k.id, k.naam, [k.nummer, k.postcode_plaats].filter(Boolean).join(' · ')];
export const levOpt = (l) => [l.id, l.naam, [l.nummer, l.land, l.valuta].filter(Boolean).join(' · ')];
export const designOpt = (d) => [d.id, d.naam, d.design_code_lev || ''];

// ---------- Kleine helpers ----------
export async function loadOptions(table, label = 'naam', extra = '') {
  const rows = check(await sb.from(table).select(`id, ${label}${extra ? ',' + extra : ''}`).eq('actief', true).order(label));
  return rows;
}
export function setTitle(t) { document.title = t ? `${t} – Koreman Voorraad` : 'Koreman Voorraad'; }


// ===================== Zoekbare keuzelijst (combobox) =====================
// Vervangt de standaard <select> bij lange lijsten (klanten, leveranciers, designs).
// options: [[waarde, label, subtekst?], …]
const comboData = new Map();
let comboSeq = 0;
export function comboHtml({ name, options, value, placeholder = 'Kies…', empty, required, id }) {
  const key = 'c' + (++comboSeq);
  if (comboData.size > 400) comboData.delete(comboData.keys().next().value);
  const opts = options.map((o) => ({ v: String(o[0]), l: String(o[1] ?? ''), s: o[2] ? String(o[2]) : '' }));
  comboData.set(key, { opts, empty, placeholder });
  const cur = opts.find((o) => o.v === String(value ?? ''));
  return `<div class="combo" data-combo="${key}" ${id ? `id="${id}"` : ''}>
    <input class="combo-input" name="${name}" value="${esc(cur ? cur.v : '')}" ${required ? 'required' : ''} tabindex="-1" autocomplete="off" aria-hidden="true">
    <button type="button" class="combo-btn" aria-haspopup="listbox"><span class="combo-val ${cur ? '' : 'ph'}">${esc(cur ? cur.l : (empty ?? placeholder))}</span><i data-lucide="chevrons-up-down"></i></button>
  </div>`;
}
export function comboSet(combo, value) {
  const d = comboData.get(combo.dataset.combo);
  const o = d?.opts.find((x) => x.v === String(value ?? ''));
  $('.combo-input', combo).value = o ? o.v : '';
  const lbl = $('.combo-val', combo);
  lbl.textContent = o ? o.l : (d?.empty ?? d?.placeholder ?? '');
  lbl.classList.toggle('ph', !o);
}
function comboClose() { $$('.combo-pop').forEach((p) => p.remove()); $$('.combo.open').forEach((c) => c.classList.remove('open')); }
function comboRender(combo) {
  const d = comboData.get(combo.dataset.combo);
  const pop = $('.combo-pop', combo);
  if (!d || !pop) return;
  const q = $('.combo-q', pop).value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const cur = $('.combo-input', combo).value;
  const hits = d.opts.filter((o) => { const t = (o.l + ' ' + o.s).toLowerCase(); return q.every((w) => t.includes(w)); });
  const MAX = 60;
  let html = '';
  if (d.empty !== undefined && !q.length) html += `<div class="combo-opt muted" data-v="">${esc(d.empty)}</div>`;
  html += hits.slice(0, MAX).map((o) => `<div class="combo-opt ${o.v === cur ? 'sel' : ''}" data-v="${esc(o.v)}"><span>${esc(o.l)}</span>${o.s ? `<small>${esc(o.s)}</small>` : ''}</div>`).join('');
  if (!hits.length) html += '<div class="combo-none">Niets gevonden</div>';
  if (hits.length > MAX) html += `<div class="combo-none">Nog ${hits.length - MAX} meer – typ om te zoeken</div>`;
  const list = $('.combo-list', pop);
  list.innerHTML = html;
  (list.querySelector('.combo-opt.sel') || list.querySelector('.combo-opt'))?.classList.add('act');
  list.querySelector('.act')?.scrollIntoView({ block: 'nearest' });
}
function comboOpen(combo) {
  comboClose();
  const d = comboData.get(combo.dataset.combo);
  if (!d) return;
  combo.classList.add('open');
  const pop = document.createElement('div');
  pop.className = 'combo-pop';
  pop.innerHTML = `<div class="combo-search"><i data-lucide="search"></i><input class="combo-q" placeholder="Typ om te zoeken…" autocomplete="off"></div><div class="combo-list" role="listbox"></div>`;
  combo.appendChild(pop);
  const r = combo.getBoundingClientRect();
  if (r.bottom + 330 > window.innerHeight && r.top > 330) pop.classList.add('up');
  comboRender(combo);
  $('.combo-q', pop).focus();
}
function comboPick(combo, value) {
  comboSet(combo, value);
  comboClose();
  $('.combo-btn', combo).focus();
  $('.combo-input', combo).dispatchEvent(new Event('change', { bubbles: true }));
}
document.addEventListener('click', (e) => {
  const btn = e.target.closest?.('.combo-btn');
  if (!btn) return;
  const combo = btn.closest('.combo');
  if (combo.classList.contains('open')) comboClose(); else comboOpen(combo);
});
document.addEventListener('mousedown', (e) => {
  const opt = e.target.closest?.('.combo-opt');
  if (opt) { e.preventDefault(); comboPick(opt.closest('.combo'), opt.dataset.v); return; }
  if (!e.target.closest?.('.combo.open')) comboClose();
});
document.addEventListener('input', (e) => { if (e.target.classList?.contains('combo-q')) comboRender(e.target.closest('.combo')); });
document.addEventListener('keydown', (e) => {
  const q = e.target.classList?.contains('combo-q') ? e.target : null;
  if (!q) { if (e.key === 'Escape' && $('.combo-pop')) { e.preventDefault(); comboClose(); } return; }
  const combo = q.closest('.combo');
  const opts = $$('.combo-opt', combo);
  const i = opts.findIndex((o) => o.classList.contains('act'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = Math.max(0, Math.min(opts.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    opts[i]?.classList.remove('act'); opts[n]?.classList.add('act'); opts[n]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (opts[i]) comboPick(combo, opts[i].dataset.v);
  } else if (e.key === 'Escape') {
    e.preventDefault(); comboClose(); $('.combo-btn', combo).focus();
  } else if (e.key === 'Tab') comboClose();
});
