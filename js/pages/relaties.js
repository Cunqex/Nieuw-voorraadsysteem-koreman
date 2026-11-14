import {
  sb, check, esc, money, num, datum, $, on, toast, modal, confirmBox, formFields, readForm,
  SOORT_KLANT, BTW, badge, PO_STATUS, SO_STATUS, setTitle, withTotals, alles, vandaag, refresh,
} from '../ui.js?v=20261114163134';

const KLANT_FIELDS = [
  { name: 'aanhef', label: 'Aanhef', placeholder: 'bv. Familie, De heer, Mevrouw' },
  { name: 'naam', label: 'Naam / bedrijfsnaam *', required: true },
  { name: 'soort', label: 'Soort', type: 'select', options: SOORT_KLANT },
  { name: 'contactpersoon', label: 'Contactpersoon' },
  { name: 'email', label: 'E-mail', type: 'email' },
  { name: 'telefoon', label: 'Telefoon' },
  { name: 'mobiel', label: 'Mobiel' },
  { name: 'adres', label: 'Adres' },
  { name: 'postcode_plaats', label: 'Postcode en plaats' },
  { name: 'land', label: 'Land' },
  { name: 'btw_nummer', label: 'Btw-nummer' },
  { name: 'taal', label: 'Taal documenten', type: 'select', options: { nl: 'Nederlands', en: 'Engels' } },
  { name: 'btw_regeling', label: 'Standaard btw', type: 'select', options: BTW },
  { name: 'actief', label: 'Actief', type: 'checkbox', default: true },
  { name: 'notities', label: 'Notities', type: 'textarea' },
];
const LEV_FIELDS = [
  { name: 'naam', label: 'Naam *', required: true },
  { name: 'valuta', label: 'Valuta (inkoop)', type: 'select', options: { EUR: 'Euro (€)', USD: 'Dollar ($)' } },
  { name: 'contactpersoon', label: 'Contactpersoon' },
  { name: 'email', label: 'E-mail', type: 'email' },
  { name: 'telefoon', label: 'Telefoon' },
  { name: 'land', label: 'Land' },
  { name: 'adres', label: 'Adres', type: 'textarea' },
  { name: 'actief', label: 'Actief', type: 'checkbox', default: true },
  { name: 'notities', label: 'Notities', type: 'textarea' },
];

const KLEUREN = ['#7C5CFC', '#3B82F6', '#0E9F6E', '#F59E0B', '#EF4444', '#DB2777', '#0891B2', '#65A30D', '#9333EA', '#EA580C', '#475569', '#B45309'];
function kleur(naam) {
  let h = 0;
  for (const ch of String(naam || '')) h = (h * 31 + ch.codePointAt(0)) % 9973;
  return KLEUREN[h % KLEUREN.length];
}

const cfg = {
  klanten: { titel: 'Klanten & architecten', enkel: 'klant', fields: KLANT_FIELDS, route: 'klant' },
  leveranciers: { titel: 'Leveranciers', enkel: 'leverancier', fields: LEV_FIELDS, route: 'leverancier' },
};

export async function bewerkRelatie(table, rec = {}) {
  const k = cfg[table];
  return modal({
    title: rec.id ? `${k.enkel[0].toUpperCase() + k.enkel.slice(1)} bewerken` : `Nieuwe ${k.enkel}`,
    body: formFields(k.fields, rec),
    onSubmit: async (v) => {
      if (rec.id) { check(await sb.from(table).update(v).eq('id', rec.id)); return rec.id; }
      return check(await sb.from(table).insert(v).select('id').single()).id;
    },
  });
}

export async function renderList(c, table) {
  const k = cfg[table];
  setTitle(k.titel);
  c.innerHTML = `
    <div class="page-head"><h1>${k.titel}</h1><span class="spacer"></span>
      <button class="btn primary" id="nieuw"><i data-lucide="plus"></i> Nieuwe ${k.enkel}</button></div>
    <div class="toolbar">
      <input type="search" id="q" placeholder="Zoeken…">
      ${table === 'klanten' ? `<select id="soort"><option value="">Alle soorten</option>${Object.entries(SOORT_KLANT).map(([a, b]) => `<option value="${a}">${b}</option>`).join('')}</select>` : ''}
      <span class="spacer"></span>
      <div class="segmented" id="view">
        <button class="btn small" data-view="kaart" title="Kaartjes"><i data-lucide="layout-grid"></i></button>
        <button class="btn small" data-view="lijst" title="Lijst"><i data-lucide="list"></i></button>
      </div>
    </div>
    <div class="rel-grid" id="kaarten"></div>
    <div class="card flush" id="tbl-card"><div class="table-wrap" id="tbl"></div></div>`;
  let view = 'kaart';
  try { view = localStorage.getItem('relatie-weergave') || 'kaart'; } catch { /* geen opslag */ }
  const zetView = () => c.querySelectorAll('#view [data-view]').forEach((b) => b.classList.toggle('primary', b.dataset.view === view));
  zetView();
  on(c, 'click', '#view [data-view]', (_e, b) => {
    view = b.dataset.view;
    try { localStorage.setItem('relatie-weergave', view); } catch { /* geen opslag */ }
    zetView(); load();
  });
  const load = async () => {
    const q = $('#q', c).value.trim().replace(/[%,()]/g, '');
    const rows = await alles(() => {
      let query = sb.from(table).select('*').order('naam').order('id');
      if (q) query = query.or(`naam.ilike.%${q}%,contactpersoon.ilike.%${q}%,email.ilike.%${q}%`);
      if ($('#soort', c)?.value) query = query.eq('soort', $('#soort', c).value);
      return query;
    });
    const el = $('#tbl', c);
    $('#tbl-card', c).style.display = view === 'kaart' ? 'none' : '';
    $('#kaarten', c).style.display = view === 'kaart' ? '' : 'none';
    if (!rows.length) { el.innerHTML = '<p class="empty">Niets gevonden.</p>'; $('#tbl-card', c).style.display = ''; $('#kaarten', c).innerHTML = ''; return; }
    if (view === 'kaart') {
      $('#kaarten', c).innerHTML = rows.map((r) => {
        const adres = [(r.adres || '').replace(/\n/g, ', '), r.postcode_plaats, table === 'klanten' && /^nederland$/i.test(r.land || '') ? '' : r.land].filter(Boolean).join(', ');
        const sub = table === 'klanten' ? SOORT_KLANT[r.soort] : r.valuta;
        return `<a class="rel-card" data-id="${r.id}" href="#/${k.route}/${r.id}">
          <span class="rel-av" style="background:${kleur(r.naam)}">${esc((r.naam || '?').trim()[0].toUpperCase())}</span>
          <span class="rel-body">
            <span class="rel-naam">${esc(r.naam)}${r.actief ? '' : ' <span class="badge">inactief</span>'}</span>
            <span class="rel-meta">${r.nummer} · ${esc(sub)}</span>
            ${adres ? `<span class="rel-line">${esc(adres)}</span>` : ''}
            ${r.telefoon || r.mobiel ? `<span class="rel-line">${esc(r.telefoon || r.mobiel)}</span>` : ''}
            ${r.email ? `<span class="rel-line rel-mail">${esc(r.email)}</span>` : ''}
          </span></a>`;
      }).join('');
      return;
    }
    el.innerHTML = `<table class="list"><thead><tr><th>Nr.</th><th>Naam</th>${table === 'klanten' ? '<th>Soort</th><th>Plaats</th>' : '<th>Valuta</th><th>Land</th>'}<th>Contact</th><th>E-mail</th><th>Telefoon</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="click" data-id="${r.id}"><td>${r.nummer}</td><td><b>${esc(r.naam)}</b>${r.actief ? '' : ' <span class="badge">inactief</span>'}</td>
        ${table === 'klanten' ? `<td>${esc(SOORT_KLANT[r.soort])}</td><td>${esc(r.postcode_plaats || '')}</td>` : `<td>${r.valuta}</td><td>${esc(r.land || '')}</td>`}
        <td>${esc(r.contactpersoon || '')}</td><td>${esc(r.email || '')}</td><td>${esc(r.telefoon || r.mobiel || '')}</td></tr>`).join('')}
    </tbody></table>`;
  };
  on(c, 'click', 'tr[data-id]', (_e, tr) => { location.hash = `#/${k.route}/${tr.dataset.id}`; });
  $('#nieuw', c).onclick = async () => { const id = await bewerkRelatie(table); if (id) location.hash = `#/${k.route}/${id}`; };
  let t; $('#q', c).addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
  $('#soort', c)?.addEventListener('change', load);
  await load();
}

function kopHtml(r, table, extraKv) {
  const k = cfg[table];
  return `<div class="page-head"><a class="btn small" href="#/${table}"><i data-lucide="arrow-left"></i> ${k.titel}</a><h1>${esc(r.naam)}</h1><span class="spacer"></span>
    <button class="btn" id="edit">Bewerken</button><button class="btn danger" id="del">Verwijderen</button></div>
    <div class="card"><div class="kv">
      <div><span>Nummer</span><b>${r.nummer}</b></div>${extraKv}
      <div><span>Contactpersoon</span><b>${esc(r.contactpersoon || '–')}</b></div>
      <div><span>E-mail</span><b>${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : '–'}</b></div>
      <div><span>Telefoon</span><b>${esc(r.telefoon || r.mobiel || '–')}</b></div>
      <div><span>Adres</span><b>${esc([r.adres, r.postcode_plaats, r.land].filter(Boolean).join('\n') || '–')}</b></div>
      ${r.notities ? `<div style="grid-column:1/-1"><span>Notities</span><b>${esc(r.notities)}</b></div>` : ''}
    </div></div>`;
}
function bindKop(c, table, r, reload) {
  $('#edit', c).onclick = async () => { if (await bewerkRelatie(table, r)) { toast('Opgeslagen', 'ok'); reload(); } };
  $('#del', c).onclick = async () => {
    if (!await confirmBox('Verwijderen? Lukt alleen als er nog geen orders aan gekoppeld zijn. Anders: zet op inactief.', 'Verwijderen')) return;
    const { error } = await sb.from(table).delete().eq('id', r.id);
    if (error) return toast('Kan niet verwijderen: er zijn orders gekoppeld. Zet op inactief.', 'error');
    location.hash = '#/' + table;
  };
}

export async function renderKlant(c, [id]) {
  const r = check(await sb.from('klanten').select('*').eq('id', id).single());
  setTitle(r.naam);
  const [sos, pos, uit] = await Promise.all([
    sb.from('verkooporders').select('id, offertenummer, orderbev_nummer, factuurnummer, status, orderdatum').eq('klant_id', id).order('orderdatum', { ascending: false }),
    sb.from('inkooporders').select('id, ordernummer, status, orderdatum, referentie, leveranciers(naam)').eq('klant_id', id).order('orderdatum', { ascending: false }),
    sb.from('uitleningen').select('*, artikelen(artikelnummer, naam)').eq('klant_id', id).order('datum_uit', { ascending: false }),
  ]).then((x) => x.map(check));
  await withTotals(sos, 'v_verkooporder_totalen', 'verkooporder_id');
  c.innerHTML = kopHtml(r, 'klanten', `<div><span>Soort</span><b>${esc(SOORT_KLANT[r.soort])}</b></div>
      <div><span>Btw-nummer</span><b>${esc(r.btw_nummer || '–')}</b></div>
      <div><span>Taal / btw</span><b>${r.taal === 'en' ? 'Engels' : 'Nederlands'} · ${esc(BTW[r.btw_regeling])}</b></div>`) + `
    <div class="card"><h2>Verkooporders<span class="spacer"></span><a class="btn small primary" href="#/verkoop?nieuw=1&klant=${r.id}"><i data-lucide="plus"></i> Verkooporder</a></h2>
      ${sos.length ? `<table class="list"><thead><tr><th>Nr.</th><th>Datum</th><th>Status</th><th class="num">Totaal</th><th class="num">Betaald</th></tr></thead><tbody>
      ${sos.map((s) => `<tr class="click" onclick="location.hash='#/verkoop/${s.id}'"><td>${s.factuurnummer ? 'F ' + s.factuurnummer : s.orderbev_nummer ? 'OB ' + s.orderbev_nummer : s.offertenummer ? 'OF ' + s.offertenummer : '–'}</td><td>${datum(s.orderdatum)}</td><td>${badge(SO_STATUS, s.status)}</td><td class="num">${money(s._t.totaal)}</td><td class="num">${money(s._t.betaald)}</td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">Nog geen verkooporders.</p>'}</div>
    <div class="card"><h2>Inkooporders in opdracht van deze klant</h2>
      ${pos.length ? `<table class="list"><thead><tr><th>Nr.</th><th>Leverancier</th><th>Referentie</th><th>Datum</th><th>Status</th></tr></thead><tbody>
      ${pos.map((p) => `<tr class="click" onclick="location.hash='#/inkoop/${p.id}'"><td>${p.ordernummer}</td><td>${esc(p.leveranciers?.naam)}</td><td>${esc(p.referentie || '')}</td><td>${datum(p.orderdatum)}</td><td>${badge(PO_STATUS, p.status)}</td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">Geen.</p>'}</div>
    <div class="card"><h2>Uitgeleend / op zicht</h2>
      ${uit.length ? `<table class="list"><thead><tr><th>Artikel</th><th class="num">Aantal</th><th>Uit</th><th>Verwacht terug</th><th>Terug</th><th></th></tr></thead><tbody>
      ${uit.map((u) => `<tr><td>${u.artikelen.artikelnummer} ${esc(u.artikelen.naam)}</td><td class="num">${num(u.aantal)}</td><td>${datum(u.datum_uit)}</td><td>${datum(u.verwacht_terug)}</td><td>${u.datum_terug ? datum(u.datum_terug) : '<span class="badge orange">nog uit</span>'}</td>
        <td>${u.datum_terug ? '' : `<button class="btn small" data-terug="${u.id}">Terug</button>`}</td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">Niets uitgeleend.</p>'}</div>`;
  bindKop(c, 'klanten', r, refresh);
  on(c, 'click', '[data-terug]', async (_e, b) => {
    check(await sb.from('uitleningen').update({ datum_terug: vandaag() }).eq('id', b.dataset.terug));
    toast('Teruggeboekt', 'ok'); refresh();
  });
}

export async function renderLeverancier(c, [id]) {
  const r = check(await sb.from('leveranciers').select('*').eq('id', id).single());
  setTitle(r.naam);
  const [pos, designs] = await Promise.all([
    sb.from('inkooporders').select('id, ordernummer, status, orderdatum, valuta').eq('leverancier_id', id).order('orderdatum', { ascending: false }),
    sb.from('designs').select('id, naam, design_code_lev').eq('leverancier_id', id).order('naam'),
  ]).then((x) => x.map(check));
  await withTotals(pos, 'v_inkooporder_totalen', 'inkooporder_id');
  c.innerHTML = kopHtml(r, 'leveranciers', `<div><span>Valuta</span><b>${r.valuta}</b></div>`) + `
    <div class="card"><h2>Inkooporders<span class="spacer"></span><a class="btn small primary" href="#/inkoop?nieuw=1&leverancier=${r.id}"><i data-lucide="plus"></i> Inkooporder</a></h2>
      ${pos.length ? `<table class="list"><thead><tr><th>Nr.</th><th>Datum</th><th>Status</th><th class="num">Totaal</th><th class="num">Betaald</th></tr></thead><tbody>
      ${pos.map((p) => `<tr class="click" onclick="location.hash='#/inkoop/${p.id}'"><td>${p.ordernummer}</td><td>${datum(p.orderdatum)}</td><td>${badge(PO_STATUS, p.status)}</td><td class="num">${money(p._t.totaal, p.valuta)}</td><td class="num">${money(p._t.betaald, p.valuta)}</td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">Nog geen inkooporders.</p>'}</div>
    <div class="card"><h2>Designs</h2>${designs.length ? designs.map((d) => `<a class="badge blue" style="margin:2px" href="#/design/${d.id}">${esc(d.naam)} ${esc(d.design_code_lev || '')}</a>`).join('') : '<p class="muted">Geen.</p>'}</div>`;
  bindKop(c, 'leveranciers', r, refresh);
}
