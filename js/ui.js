import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

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
export function on(root, event, selector, handler) {
  root.addEventListener(event, (e) => {
    const t = e.target.closest(selector);
    if (t && root.contains(t)) handler(e, t);
  });
}

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
export function modal({ title, body, submitLabel = 'Opslaan', onSubmit, wide = false, onOpen }) {
  return new Promise((resolve) => {
    const root = $('#modal-root');
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<form class="modal" style="${wide ? 'max-width:1000px' : ''}">
      <h2>${esc(title)}</h2>
      <div class="modal-body">${body}</div>
      <div class="actions">
        <button type="button" class="btn" data-cancel>Annuleren</button>
        ${onSubmit ? `<button type="submit" class="btn primary">${esc(submitLabel)}</button>` : ''}
      </div></form>`;
    root.appendChild(bg);
    const form = $('form', bg);
    const close = (v) => { bg.remove(); resolve(v); };
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
    const first = $('input:not([type=hidden]),select,textarea', form);
    first?.focus();
  });
}

export function confirmBox(text, label = 'Ja, doorgaan') {
  return modal({ title: 'Weet je het zeker?', body: `<p>${esc(text)}</p>`, submitLabel: label, onSubmit: () => true });
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
// Vul alle <img data-path="..."> in een container
export async function loadImages(root) {
  await Promise.all($$('img[data-path]', root).map(async (img) => {
    const url = await mediaUrl(img.dataset.path);
    if (url) img.src = url;
  }));
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
        <b>${r.artikelnummer}</b> ${esc(r.naam)} <span class="muted small">${esc(SOORT_ARTIKEL[r.soort] || '')}</span></div>`).join('')
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

// ---------- Kleine helpers ----------
export async function loadOptions(table, label = 'naam', extra = '') {
  const rows = check(await sb.from(table).select(`id, ${label}${extra ? ',' + extra : ''}`).eq('actief', true).order(label));
  return rows;
}
export function setTitle(t) { document.title = t ? `${t} – Koreman Voorraad` : 'Koreman Voorraad'; }
