import {
  alles,
  sb, check, esc, money, num, datum, maat, m2, $, $$, on, toast, modal, confirmBox, formFields, readForm,
  SOORT_ARTIKEL, loadImages, uploadFile, withTotals, setTitle, badge, PO_STATUS, SO_STATUS, vandaag, refresh, klantOpt, levOpt, designOpt, comboHtml,
} from '../ui.js?v=20261117162032';
import { kaartenModal } from '../kaarten.js?v=20261117162032';

const VORMEN = ['', 'Recht', 'Recht met afgeronde hoeken', 'Rond', 'Ovaal', 'Organisch', 'Anders'];

// Categorieën en collecties zoals op koremanmaastricht.nl (namen = collecties op de website)
export const CATEGORIEEN = [
  { k: 'luxe', t: 'Luxe vloerkleden', hoofd: 'Luxe Vloerkleden', subs: [['Avant Garde Vloerkleden', 'Avant-garde'], ['Loricata', 'Loricata'], ['Riviera', 'Riviera']] },
  { k: 'modern', t: 'Moderne vloerkleden', hoofd: 'Moderne Vloerkleden', subs: [['Platgeweven Vloerkleden', 'Platgeweven'], ['Hoogpolige Vloerkleden', 'Hoogpolig'], ['Laagpolige Vloerkleden', 'Laagpolig'], ['Effen Vloerkleden', 'Effen']] },
  { k: 'design', t: 'Design vloerkleden', hoofd: 'Design Vloerkleden', subs: [['Gestreepte Tapijten', 'Gestreept'], ['Geometrische Tapijten', 'Geometrisch'], ['Artistiek', 'Artistiek'], ['Organische Vloerkleden', 'Organisch']] },
  { k: 'oosters', t: 'Oosterse tapijten', hoofd: 'Oosterse Tapijten', subs: [['Kelim', 'Kelim'], ['Vintage', 'Vintage'], ['Perzisch Tapijt', 'Perzisch'], ['Meesterwerk', 'Meesterwerken'], ['Ziegler Tapijt', 'Ziegler']] },
  { k: 'b2b', t: 'B2B collectie', hoofd: 'B2B Collectie', subs: [['B2B Nuance Collectie', 'Nuance'], ['B2B Forma Collectie', 'Forma'], ['B2B Strata Collectie', 'Strata'], ['B2B Terra Collectie', 'Terra'], ['B2B Flatwave Collectie', 'Flatwave']] },
  { k: 'meubels', t: 'Meubels', hoofd: 'Oosterse Meubels', subs: [['Chinese Meubels', 'Chinees'], ['Indiase Meubels', 'Indiaas'], ['Overige Meubels', 'Overig']] },
  { k: 'outlet', t: 'Outlet', hoofd: 'Outlet', subs: [] },
];
const catNamen = (cat) => [cat.hoofd, ...cat.subs.map(([n]) => n)];
// De meest specifieke collectie (subcollectie) om op een kaartje te tonen
const SUB_LABEL = Object.fromEntries(CATEGORIEEN.flatMap((x) => x.subs));
function korteCollectie(col = []) {
  const subs = (col || []).filter((nm) => SUB_LABEL[nm]).map((nm) => SUB_LABEL[nm]);
  if (subs.length) return subs.slice(0, 2).join(', ');
  const hoofd = CATEGORIEEN.find((x) => (col || []).includes(x.hoofd));
  return hoofd ? hoofd.t : '';
}

// =============================== LIJST ===============================
export async function renderList(c, _p, query) {
  setTitle('Artikelen');
  const levs = check(await sb.from('leveranciers').select('id, naam, nummer, land, valuta').order('naam'));
  c.innerHTML = `
    <div class="page-head"><h1>Artikelen</h1><span class="spacer"></span>
      <button class="btn" id="stalenvel" title="Meerdere staalkaarten kiezen en op A4 printen (4 per vel)"><i data-lucide="printer"></i> Staalkaarten printen</button>
      <button class="btn" id="wandvel" title="Meerdere wandkaarten kiezen en printen (2 per A4)"><i data-lucide="printer"></i> Wandkaarten printen</button>
      <button class="btn" id="voorraadlijst" title="Download een overzicht van alles wat op voorraad ligt"><i data-lucide="download"></i> Voorraadlijst</button>
      <div class="segmented" id="view">
        <button class="btn small" data-view="kaart" title="Kaartjes"><i data-lucide="layout-grid"></i></button>
        <button class="btn small" data-view="lijst" title="Lijst"><i data-lucide="list"></i></button>
      </div>
      <a class="btn primary" href="#/artikel/new"><i data-lucide="plus"></i> Nieuw artikel</a></div>
    <div class="cat-tabs" id="cat-tabs"></div>
    <div class="cat-subs" id="cat-subs"></div>
    <div class="toolbar">
      <div class="search"><i data-lucide="search"></i><input type="search" id="q" placeholder="Zoek op nummer, naam of omschrijving…" value="${esc(query.q || '')}"></div>
      <select id="soort"><option value="">Alle soorten</option>${Object.entries(SOORT_ARTIKEL).map(([k, v]) => `<option value="${k}" ${query.soort === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      ${comboHtml({ name: 'lev', id: 'lev', options: levs.map(levOpt), empty: 'Alle leveranciers' })}
      <label class="check"><input type="checkbox" id="opvoorraad" ${query.voorraad ? 'checked' : ''}> Alleen op voorraad</label>
      <label class="check"><input type="checkbox" id="inactief"> Ook inactieve</label>
      <span class="spacer"></span>
      <span class="muted small" id="aantal"></span>
    </div>
    <div class="art-grid" id="kaarten"></div>
    <div class="card flush" id="tbl-card"><div class="table-wrap" id="tbl"></div></div>
    <div id="meer" class="meer" hidden><button class="btn"></button></div>
    <div class="sel-bar" id="selbar" hidden><b id="sel-aantal"></b>
      <button class="btn small" id="sel-alles">Alles hierboven selecteren</button><button class="btn small" id="sel-wis">Selectie wissen</button>
      <span class="spacer"></span><button class="btn" id="sel-wand"><i data-lucide="printer"></i> Wandkaarten printen</button><button class="btn primary" id="sel-stalen"><i data-lucide="printer"></i> Staalkaarten printen</button></div>`;

  let view = 'kaart';
  try { view = localStorage.getItem('artikel-weergave') || 'kaart'; } catch { /* geen opslag */ }
  const zetView = () => c.querySelectorAll('#view [data-view]').forEach((b) => b.classList.toggle('primary', b.dataset.view === view));
  zetView();

  const voorraadBadge = (r) => {
    if (r.soort === 'dienst') return '';
    const n = Number(r._t.voorraad_totaal || 0), uit = Number(r._t.uitgeleend || 0);
    if (n <= 0) return '<span class="badge">Niet op voorraad</span>';
    return `<span class="badge green">${num(n)} op voorraad</span>${uit ? ` <span class="badge orange">${num(uit)} uitgeleend</span>` : ''}`;
  };

  // ---- selectie (blijft staan bij zoeken en wisselen van weergave) ----
  const gekozen = new Map(); // id -> artikelnummer
  let zichtbaar = [];
  const vinkje = (r) => `<span class="art-check ${gekozen.has(r.id) ? 'aan' : ''}" data-kies="${r.id}" data-nr="${esc(r.artikelnummer)}" title="Selecteren"><i data-lucide="check"></i></span>`;
  const werkSelectieBij = () => {
    $('#selbar', c).hidden = !gekozen.size;
    $('#sel-aantal', c).textContent = `${gekozen.size} geselecteerd`;
    c.querySelectorAll('[data-kies]').forEach((el) => el.classList.toggle('aan', gekozen.has(Number(el.dataset.kies))));
  };
  // klik op het vinkje: selecteren i.p.v. het artikel openen
  c.addEventListener('click', (e) => {
    const v = e.target.closest('[data-kies]'); if (!v) return;
    e.preventDefault(); e.stopPropagation();
    const id = Number(v.dataset.kies);
    if (gekozen.has(id)) gekozen.delete(id); else gekozen.set(id, v.dataset.nr);
    werkSelectieBij();
  }, true);
  $('#sel-wis', c).onclick = () => { gekozen.clear(); werkSelectieBij(); };
  $('#sel-alles', c).onclick = () => { zichtbaar.forEach((r) => gekozen.set(r.id, r.artikelnummer)); werkSelectieBij(); };
  $('#sel-stalen', c).onclick = async () => {
    const { stalenVelModal } = await import('../staalkaart.js?v=20261117162032');
    await stalenVelModal([...gekozen.keys()]);
  };

  // ---- categorie-tabs zoals op de website ----
  let cat = query.cat || ''; let sub = query.sub || '';
  try { if (!query.cat) { cat = localStorage.getItem('artikel-cat') || ''; sub = localStorage.getItem('artikel-sub') || ''; } } catch { /* */ }
  let tellingen = null;
  const tekenTabs = () => {
    const n = (k) => (tellingen ? ` <span class="cat-n">${tellingen[k] ?? 0}</span>` : '');
    $('#cat-tabs', c).innerHTML = [['', 'Alle artikelen'], ...CATEGORIEEN.map((x) => [x.k, x.t]), ['geen', 'Zonder collectie']]
      .map(([k, t]) => `<button type="button" class="cat-tab ${cat === k ? 'aan' : ''}" data-cat="${k}">${t}${n(k || 'alle')}</button>`).join('');
    const cc = CATEGORIEEN.find((x) => x.k === cat);
    $('#cat-subs', c).innerHTML = cc && cc.subs.length ? [['', `Alle ${cc.t.toLowerCase()}`], ...cc.subs].map(([naam, t]) => `<button type="button" class="chip ${sub === naam ? 'aan' : ''}" data-sub="${esc(naam)}">${esc(t)}${tellingen && naam ? ` <span class="cat-n">${tellingen['s:' + naam] ?? 0}</span>` : ''}</button>`).join('') : '';
  };
  const telAlles = async () => {
    const r = await alles(() => { let q2 = sb.from('artikelen').select('collecties'); if (!$('#inactief', c).checked) q2 = q2.eq('actief', true); return q2; });
    const t = { alle: r.length, geen: 0 };
    r.forEach(({ collecties: col }) => {
      const set = new Set(col || []); if (!set.size) t.geen++;
      CATEGORIEEN.forEach((x) => { if (catNamen(x).some((nm) => set.has(nm))) t[x.k] = (t[x.k] || 0) + 1; x.subs.forEach(([nm]) => { if (set.has(nm)) t['s:' + nm] = (t['s:' + nm] || 0) + 1; }); });
    });
    tellingen = t; tekenTabs();
  };
  on(c, 'click', '[data-cat]', (_e, b) => { cat = b.dataset.cat; sub = ''; try { localStorage.setItem('artikel-cat', cat); localStorage.setItem('artikel-sub', ''); } catch { /* */ } tekenTabs(); toon = 120; load(); });
  on(c, 'click', '[data-sub]', (_e, b) => { sub = b.dataset.sub; try { localStorage.setItem('artikel-sub', sub); } catch { /* */ } tekenTabs(); toon = 120; load(); });
  $('#inactief', c).addEventListener('change', () => telAlles());
  tekenTabs(); telAlles();

  let seq = 0; let toon = 120;
  const load = async () => {
    const mine = ++seq;
    const q = $('#q', c).value.trim().replace(/[%,()]/g, '');
    let ids = null;
    if ($('#opvoorraad', c).checked) ids = (await alles(() => sb.from('v_voorraad').select('artikel_id').gt('voorraad_totaal', 0))).map((v) => v.artikel_id);
    const maak = () => {
      let query = sb.from('artikelen').select('id, artikelnummer, naam, soort, breedte_cm, lengte_cm, materiaal, verkoopprijs, actief, foto_pad, collecties, custom, designs(naam, hoofdfoto_pad, design_code_lev), leveranciers(naam)')
        .order('artikelnummer', { ascending: false }).order('id');
      if (q) query = /^\d+$/.test(q) ? query.or(`artikelnummer.ilike.${q}%,productnr_lev.ilike.%${q}%`) : query.or(`naam.ilike.%${q}%,omschrijving.ilike.%${q}%,productnr_lev.ilike.%${q}%`);
      if ($('#soort', c).value) query = query.eq('soort', $('#soort', c).value);
      if ($('#lev input', c).value) query = query.eq('leverancier_id', $('#lev input', c).value);
      if (!$('#inactief', c).checked) query = query.eq('actief', true);
      if (cat === 'geen') query = query.eq('collecties', '{}');
      else if (sub) query = query.contains('collecties', [sub]);
      else if (cat) { const cc = CATEGORIEEN.find((x) => x.k === cat); if (cc) query = query.overlaps('collecties', catNamen(cc)); }
      return query;
    };
    let alle = ids && !ids.length ? [] : await alles(maak);
    if (ids) { const set = new Set(ids); alle = alle.filter((r) => set.has(r.id)); }
    if (mine !== seq) return; // er is intussen opnieuw gezocht
    const totaalAantal = alle.length;
    const rows = alle.slice(0, toon);
    zichtbaar = rows;
    await withTotals(rows, 'v_voorraad', 'artikel_id');
    if (mine !== seq) return; // er is intussen opnieuw gezocht
    $('#aantal', c).textContent = `${totaalAantal} artikel${totaalAantal === 1 ? '' : 'en'}`;
    $('#meer', c).hidden = totaalAantal <= rows.length;
    $('#meer button', c).textContent = `Toon meer (${rows.length} van ${totaalAantal})`;
    const kaart = view === 'kaart';
    $('#kaarten', c).style.display = kaart && rows.length ? '' : 'none';
    $('#tbl-card', c).style.display = kaart && rows.length ? 'none' : '';
    if (!rows.length) {
      $('#tbl', c).innerHTML = `<div class="empty"><p>Geen artikelen gevonden.</p><a class="btn primary" href="#/artikel/new"><i data-lucide="plus"></i> Nieuw artikel</a></div>`;
      return;
    }
    const foto = (r) => r.foto_pad || r.designs?.hoofdfoto_pad || '';
    if (kaart) {
      $('#kaarten', c).innerHTML = rows.map((r) => `
        <a class="art-card" href="#/artikel/${r.id}">
          <div class="art-img">${foto(r) ? `<img data-path="${esc(foto(r))}" alt="" loading="lazy">` : '<i data-lucide="image-off"></i>'}
            <span class="art-soort">${esc(SOORT_ARTIKEL[r.soort])}${r.custom ? ' · Custom' : ''}</span>${vinkje(r)}</div>
          <div class="art-body">
            <div class="art-nr">${r.artikelnummer}${r.actief ? '' : ' · inactief'}</div>
            <div class="art-naam">${esc(r.naam)}</div>
            <div class="art-meta">${[maat(r), r.materiaal].filter(Boolean).map(esc).join(' · ') || '&nbsp;'}</div>
            <div class="art-meta">${[r.designs?.naam ? 'Design ' + r.designs.naam : '', korteCollectie(r.collecties), r.leveranciers?.naam].filter(Boolean).map(esc).join(' · ') || '&nbsp;'}</div>
            <div class="art-foot"><span class="art-prijs">${money(r.verkoopprijs)}</span><span>${voorraadBadge(r)}</span></div>
          </div>
        </a>`).join('');
      loadImages($('#kaarten', c));
      return;
    }
    $('#tbl', c).innerHTML = `<table class="list"><thead><tr><th style="width:34px"></th><th></th><th>Nr.</th><th>Naam</th><th>Soort</th><th>Maat</th><th>Leverancier</th><th>Collectie</th><th>Voorraad</th><th class="num">Verkoopprijs</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="click" data-id="${r.id}">
        <td>${vinkje(r)}</td><td>${foto(r) ? `<img class="thumb" data-path="${esc(foto(r))}" alt="">` : '<span class="thumb"></span>'}</td>
        <td><b>${r.artikelnummer}</b></td><td>${esc(r.naam)}${r.actief ? '' : ' <span class="badge">inactief</span>'}</td>
        <td>${esc(SOORT_ARTIKEL[r.soort])}</td><td>${maat(r)}</td><td>${esc(r.leveranciers?.naam || '')}</td>
        <td>${esc(korteCollectie(r.collecties))}</td><td>${voorraadBadge(r)}</td>
        <td class="num">${money(r.verkoopprijs)}</td></tr>`).join('')}
      </tbody></table>`;
    loadImages($('#tbl', c));
  };
  on(c, 'click', '#view [data-view]', (_e, b) => {
    view = b.dataset.view;
    try { localStorage.setItem('artikel-weergave', view); } catch { /* geen opslag */ }
    zetView(); load();
  });
  on(c, 'click', 'tr[data-id]', (_e, tr) => { location.hash = '#/artikel/' + tr.dataset.id; });
  $('#wandvel', c).onclick = async () => { const { wandVelModal } = await import('../kaarten.js?v=20261117162032'); wandVelModal(); };
  $('#sel-wand', c).onclick = async () => { const { wandVelModal } = await import('../kaarten.js?v=20261117162032'); await wandVelModal([...gekozen.keys()]); };
  $('#stalenvel', c).onclick = async () => { const { stalenVelModal } = await import('../staalkaart.js?v=20261117162032'); stalenVelModal(); };
  // ---- voorraadlijst als bestand (opent in Excel) ----
  $('#voorraadlijst', c).onclick = async (e) => {
    const knop = e.currentTarget; knop.disabled = true;
    try {
      const vrd = (await alles(() => sb.from('v_voorraad').select('*').order('artikel_id'))).filter((v) => Number(v.voorraad_totaal) !== 0 || Number(v.uitgeleend) !== 0);
      if (!vrd.length) { toast('Er ligt nog niets op voorraad', 'error'); return; }
      const ids = vrd.map((v) => v.artikel_id); const arts = [];
      for (let i = 0; i < ids.length; i += 200) {
        arts.push(...check(await sb.from('artikelen').select('id, artikelnummer, naam, omschrijving, soort, omzetgroep, breedte_cm, lengte_cm, inkoopprijs, verkoopprijs, leveranciers(naam), designs(design_code_lev)').in('id', ids.slice(i, i + 200))));
      }
      const amap = new Map(arts.map((a) => [a.id, a]));
      const g = (x) => (x === null || x === undefined || x === '' ? '' : String(Number(x)).replace('.', ','));
      const cel = (x) => { const t = String(x ?? '').replace(/\r?\n/g, ' '); return /[;"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
      const kop = ['Artikelnummer', 'Naam', 'Omschrijving', 'Soort', 'Omzetgroep', 'Lengte (cm)', 'Breedte (cm)', 'Leverancier', 'Design', 'Voorraad totaal', 'Uitgeleend / op zicht', 'In showroom', 'Kostprijs per stuk (EUR)', 'Voorraadwaarde (EUR)', 'Verkoopprijs incl. btw (EUR)'];
      const rijen = vrd.map((v) => ({ v, a: amap.get(v.artikel_id) })).filter((x) => x.a)
        .sort((x, y) => String(x.a.artikelnummer).localeCompare(String(y.a.artikelnummer), 'nl', { numeric: true }))
        .map(({ v, a }) => [`="${a.artikelnummer}"`, a.naam, a.omschrijving, SOORT_ARTIKEL[a.soort], a.omzetgroep, g(a.lengte_cm), g(a.breedte_cm), a.leveranciers?.naam, a.designs?.design_code_lev,
          g(v.voorraad_totaal), g(v.uitgeleend), g(v.in_showroom), g(v.gem_kostprijs_eur), g(v.voorraadwaarde_eur), g(a.verkoopprijs)]);
      const som = (k) => g(Math.round(vrd.reduce((s2, v) => s2 + Number(v[k] || 0), 0) * 100) / 100);
      const totaal = ['Totaal', '', '', '', '', '', '', '', '', som('voorraad_totaal'), som('uitgeleend'), som('in_showroom'), '', som('voorraadwaarde_eur'), ''];
      const csv = '\uFEFF' + [kop, ...rijen, totaal].map((r) => r.map(cel).join(';')).join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = `voorraad-koreman-${vandaag()}.csv`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast(`Voorraadlijst met ${rijen.length} artikelen gedownload`, 'ok');
    } finally { knop.disabled = false; }
  };

  const opnieuw = () => { toon = 120; load(); };
  let t; $('#q', c).addEventListener('input', () => { clearTimeout(t); t = setTimeout(opnieuw, 250); });
  ['#soort', '#lev', '#opvoorraad', '#inactief'].forEach((s) => $(s, c).addEventListener('change', opnieuw));
  $('#meer button', c).onclick = () => { toon += 240; load(); };
  await load();
}

// =============================== DETAIL ===============================
export async function renderDetail(c, [idStr], query) {
  const isNew = idStr === 'new';
  const [levs, designs] = await Promise.all([
    sb.from('leveranciers').select('id, naam, nummer, land, valuta').order('naam'),
    sb.from('designs').select('id, naam, design_code_lev, leverancier_id').order('naam'),
  ]).then((r) => r.map(check));

  let a = { soort: 'voorraad', actief: true };
  if (!isNew) {
    a = check(await sb.from('artikelen').select('*, designs(id, naam, design_code_lev, hoofdfoto_pad, website_handle), leveranciers(naam, valuta, land)').eq('id', idStr).single());
  } else if (query.design) {
    const d = designs.find((x) => String(x.id) === query.design);
    if (d) a = { ...a, design_id: d.id, leverancier_id: d.leverancier_id, naam: d.naam, soort: query.soort || 'voorraad' };
  }
  setTitle(isNew ? 'Nieuw artikel' : `Artikel ${a.artikelnummer}`);
  const valuta = levs.find((l) => l.id === a.leverancier_id)?.valuta || 'EUR';

  const fields1 = [
    { name: 'naam', label: 'Naam *', required: true, placeholder: 'bv. Fawn 365 x 275' },
    { name: 'soort', label: 'Soort', type: 'select', options: SOORT_ARTIKEL },
    { name: 'design_id', label: 'Design (van leverancier)', type: 'combo', empty: '– geen –', options: designs.map(designOpt) },
    { name: 'leverancier_id', label: 'Leverancier', type: 'combo', placeholder: 'Kies…', options: levs.map(levOpt) },
    { name: 'productnr_lev', label: 'Productnummer leverancier' },
    { name: 'website_handle', label: 'Product op website (B2B)', placeholder: 'bv. terra-umber (laatste deel van de link)', hint: 'Voor de QR-code op de staalkaart. Wordt ook ingevuld als je bij "Kaarten printen" een product kiest.' },
    { name: 'actief', label: 'Actief (zichtbaar bij zoeken)', type: 'checkbox' },
    { name: 'omschrijving', label: 'Aanvullende omschrijving (komt op documenten)', type: 'textarea', placeholder: 'bv. Wool / real silk' },
  ];
  const fields2 = [
    { name: 'lengte_cm', label: 'Lengte (cm)', type: 'number' },
    { name: 'breedte_cm', label: 'Breedte (cm)', type: 'number' },
    { name: 'vorm', label: 'Vorm', type: 'select', options: VORMEN.map((v) => [v, v || '–']) },
    { name: 'materiaal', label: 'Materiaal', placeholder: 'bv. Wol / zijde, tencel' },
    { name: 'techniek', label: 'Techniek', placeholder: 'bv. handgeknoopt, handtufted, handloom' },
    { name: 'kleurcode', label: 'Kleurcode', placeholder: 'bv. KOR098' },
    { name: 'poolhoogte', label: 'Poolhoogte', placeholder: 'bv. 1–3 cm' },
    { name: 'gewicht_kg', label: 'Gewicht (kg)', type: 'number' },
    { name: 'hs_code', label: 'HS-code', placeholder: 'bv. 5702910000' },
  ];
  const fields3 = [
    { name: 'inkoopprijs', label: `Inkoopprijs per stuk (${valuta})`, type: 'number', step: '0.01' },
    { name: 'inkoopprijs_m2', label: `Inkoopprijs per m² (${valuta})`, type: 'number', step: '0.01' },
    { name: 'verkoopprijs', label: 'Verkoopprijs per stuk (€ incl. btw)', type: 'number', step: '0.01' },
    { name: 'verkoopprijs_m2', label: 'Verkoopprijs per m² (€ incl. btw)', type: 'number', step: '0.01' },
  ];

  const fotoPad = a.foto_pad || a.designs?.hoofdfoto_pad;
  c.innerHTML = `
    <div class="page-head">
      <a class="btn small" href="#/artikelen"><i data-lucide="arrow-left"></i> Artikelen</a>
      <h1>${isNew ? 'Nieuw artikel' : `Artikel ${a.artikelnummer} – ${esc(a.naam)}`}</h1><span class="spacer"></span>
      ${isNew ? '' : `<button class="btn" id="print-kaarten" title="Wandkaart of prijskaartje voor dit artikel printen"><i data-lucide="printer"></i> Kaarten printen</button><button class="btn" id="kopie">Kopiëren</button><button class="btn danger" id="del">Verwijderen</button>`}
    </div>
    ${isNew ? '<div class="help">Het artikelnummer wordt automatisch toegekend bij opslaan (nieuwe reeks vanaf 9000; artikelen uit IOne houden hun eigen nummer).</div>' : ''}
    <form id="f">
      <div class="card"><h2>Algemeen</h2>
        <div style="display:flex;gap:20px;flex-wrap:wrap">
          <div style="width:180px">
            ${fotoPad ? `<img class="thumb big" data-path="${esc(fotoPad)}" alt="">` : '<div class="thumb big muted" style="display:flex;align-items:center;justify-content:center">geen foto</div>'}
            ${isNew ? '' : `<label class="btn small" style="margin-top:6px">Eigen foto uploaden<input type="file" id="foto" accept="image/*" hidden></label>`}
            ${a.designs ? `<p class="small">Design: <a href="#/design/${a.designs.id}">${esc(a.designs.naam)}</a><br>${esc(a.designs.design_code_lev || '')}</p>` : ''}
          </div>
          <div style="flex:1;min-width:280px">${formFields(fields1, a)}
            <div class="field"><label>Collecties (zoals op de website)</label><div id="coll-edit" class="coll-edit"></div></div></div>
        </div>
      </div>
      <div class="card"><h2>Maat en eigenschappen</h2>${formFields(fields2, a)}
        <p class="small muted" id="opp">${m2(a) ? `Oppervlakte: ${num(m2(a), 2)} m²` : ''}</p></div>
      <div class="card"><h2>Prijzen</h2>
        <div class="custom-box"><label class="check"><input type="checkbox" name="custom" ${a.custom ? 'checked' : ''}> <b>Custom (maatwerk)</b> – verkoopprijs berekenen met de customprijs per m² van de website</label>
          <div id="custom-info" class="small" style="margin-top:6px"></div></div>
        ${formFields(fields3, a)}
        <p class="small muted">Vul je een m²-prijs in en is de maat bekend, dan rekent de app de stukprijs uit (en andersom).</p></div>
      <div class="btn-row" style="margin-bottom:16px"><button class="btn primary" type="submit">Opslaan</button></div>
    </form>
    <div id="extra"></div>`;
  loadImages(c);

  const form = $('#f', c);
  const collecties = [...(a.collecties || [])];
  const tekenColl = () => {
    $('#coll-edit', c).innerHTML = `${collecties.map((nm, i) => `<span class="chip aan">${esc(SUB_LABEL[nm] || CATEGORIEEN.find((x) => x.hoofd === nm)?.t || nm)} <a href="#" data-coll-weg="${i}" title="Weghalen">✕</a></span>`).join('')}
      <select id="coll-add" style="width:auto"><option value="">+ collectie toevoegen…</option>${CATEGORIEEN.map((x) => `<optgroup label="${esc(x.t)}">${catNamen(x).filter((nm) => !collecties.includes(nm)).map((nm) => `<option value="${esc(nm)}">${esc(SUB_LABEL[nm] || x.t)}</option>`).join('')}</optgroup>`).join('')}</select>
      ${a.website_handle ? `<a class="small" href="https://www.koremanmaastricht.nl/products/${esc(a.website_handle)}" target="_blank" rel="noopener">Bekijk op de website ↗</a>` : ''}`;
  };
  tekenColl();
  $('#coll-edit', c).addEventListener('click', (e) => { const w = e.target.closest('[data-coll-weg]'); if (!w) return; e.preventDefault(); collecties.splice(Number(w.dataset.collWeg), 1); tekenColl(); });
  $('#coll-edit', c).addEventListener('change', (e) => {
    if (e.target.id !== 'coll-add' || !e.target.value) return;
    const nm = e.target.value; const cc = CATEGORIEEN.find((x) => catNamen(x).includes(nm));
    collecties.push(nm); if (cc && nm !== cc.hoofd && !collecties.includes(cc.hoofd)) collecties.push(cc.hoofd);
    tekenColl();
  });
  const area = () => { const l = Number(form.lengte_cm.value), b = Number(form.breedte_cm.value); return l && b ? (l * b) / 10000 : null; };
  const link = (stuk, perm2) => {
    form[perm2].addEventListener('input', () => { const ar = area(); if (ar && form[perm2].value) form[stuk].value = (Number(form[perm2].value) * ar).toFixed(2); });
    form[stuk].addEventListener('input', () => { const ar = area(); if (ar && form[stuk].value) form[perm2].value = (Number(form[stuk].value) / ar).toFixed(2); });
  };
  link('inkoopprijs', 'inkoopprijs_m2');
  // ---- Custom (maatwerk): customprijs per m² van de website ----
  // customM2 = prijs die gebruikt wordt; webM2 = prijs op de website; handmatig = zelf aangepast (wordt niet overschreven)
  let customM2 = a.custom_prijs_m2 != null ? Number(a.custom_prijs_m2) : null; let webM2 = null; let customBron = '';
  let handmatig = !!a.custom_prijs_handmatig;
  const zoekCustomprijs = async () => {
    const handles = [...new Set([form.website_handle?.value?.trim().replace(/^.*\/products\//, ''), a.designs?.website_handle].filter(Boolean))];
    if (!handles.length) return null;
    const { data } = await sb.from('website_producten').select('handle, titel, b2b, custom_m2, b2b_custom_m2').in('handle', handles);
    // eerst live van de website (actueel), anders wat er bij het ophalen is opgeslagen
    for (const h of handles) {
      const opgeslagen = (data || []).find((x) => x.handle === h);
      let m2 = null; let soort = '';
      try {
        const pj = await (await fetch(`https://www.koremanmaastricht.nl/products/${h}.js`)).json();
        const tag = (pj.tags || []).map((t) => String(t).match(/^m2prijs-(\d+(?:[.,]\d+)?)$/i)).find(Boolean);
        if (tag) { m2 = Number(tag[1].replace(',', '.')); soort = 'customprijs'; }
        else if ((pj.tags || []).some((t) => String(t).toLowerCase() === 'b2b')) {
          const d = new DOMParser().parseFromString(await (await fetch(`https://www.koremanmaastricht.nl/products/${h}`)).text(), 'text/html');
          const mf = JSON.parse(d.querySelector('#stape-product-data')?.textContent || '{}').metafields?.custom || {};
          const g = String(mf.prijs_m2_maatwerk || '').replace(/\./g, '').replace(',', '.').match(/\d+(\.\d+)?/);
          if (g) { m2 = Number(g[0]); soort = 'B2B-prijs custom sizes'; }
        }
      } catch { /* website niet bereikbaar: opgeslagen prijs gebruiken */ }
      if (m2 == null && opgeslagen) {
        if (opgeslagen.custom_m2 != null) { m2 = Number(opgeslagen.custom_m2); soort = 'customprijs'; }
        else if (opgeslagen.b2b_custom_m2 != null) { m2 = Number(opgeslagen.b2b_custom_m2); soort = 'B2B-prijs custom sizes'; }
      }
      if (m2 != null) return { m2, bron: `${soort} van <a href="https://www.koremanmaastricht.nl/products/${esc(h)}" target="_blank" rel="noopener">${esc(opgeslagen?.titel || h)}</a>` };
    }
    return null;
  };
  const rekenCustom = () => {
    const info = $('#custom-info', c);
    if (!form.custom.checked) { info.innerHTML = ''; return; }
    const ar = area();
    if (customM2 != null) {
      form.verkoopprijs_m2.value = customM2.toFixed(2);
      if (ar) form.verkoopprijs.value = (customM2 * ar).toFixed(2);
    }
    const web = webM2 != null ? `Website: <b>${money(webM2)} per m²</b>${customBron ? ` (${customBron})` : ''}` : (customBron === null ? '<span style="color:var(--red-fg)">Geen customprijs gevonden op de website – vul hem hieronder zelf in.</span>' : '');
    info.innerHTML = `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <label style="margin:0;display:flex;gap:6px;align-items:center">Customprijs per m² <input type="number" step="0.01" min="0" id="custom-m2" value="${customM2 != null ? customM2.toFixed(2) : ''}" style="width:110px"></label>
        ${handmatig ? '<span class="badge custom">handmatig aangepast</span>' : ''}
        ${handmatig && webM2 != null && Math.abs(webM2 - (customM2 ?? -1)) > 0.004 ? '<button type="button" class="btn small" id="custom-web">Websiteprijs gebruiken</button>' : ''}
        <a href="#" id="custom-vernieuw">Opnieuw ophalen</a></div>
      <div style="margin-top:4px">${web}${customM2 != null && ar ? `${web ? ' · ' : ''}${money(customM2)} × ${num(ar, 2)} m² = <b>${money(customM2 * ar)}</b>` : customM2 != null ? `${web ? ' · ' : ''}vul lengte en breedte in om de prijs te berekenen` : ''}</div>`;
    $('#custom-vernieuw', c).onclick = (e) => { e.preventDefault(); haalCustom(); };
    const inp = $('#custom-m2', c);
    inp.addEventListener('change', () => {
      const n = inp.value === '' ? null : Number(inp.value);
      customM2 = n; handmatig = n != null && !(webM2 != null && Math.abs(webM2 - n) < 0.005);
      rekenCustom();
    });
    $('#custom-web', c)?.addEventListener('click', () => { customM2 = webM2; handmatig = false; rekenCustom(); });
  };
  const haalCustom = async () => {
    $('#custom-info', c).textContent = 'Customprijs ophalen van de website…';
    const r = await zoekCustomprijs().catch(() => null);
    if (r) { webM2 = r.m2; customBron = r.bron; } else { webM2 = null; customBron = null; }
    if (!handmatig && webM2 != null) customM2 = webM2;
    rekenCustom();
  };
  form.custom.addEventListener('change', () => { if (form.custom.checked) haalCustom(); else rekenCustom(); });
  ['lengte_cm', 'breedte_cm'].forEach((n) => form[n].addEventListener('input', () => { if (form.custom.checked) rekenCustom(); }));
  if (a.custom) haalCustom();
  link('verkoopprijs', 'verkoopprijs_m2');
  ['lengte_cm', 'breedte_cm'].forEach((n) => form[n].addEventListener('input', () => {
    const ar = area(); $('#opp', c).textContent = ar ? `Oppervlakte: ${num(ar, 2)} m²` : '';
  }));
  form.design_id.addEventListener('change', () => {
    const d = designs.find((x) => String(x.id) === form.design_id.value);
    if (d?.leverancier_id && !form.leverancier_id.value) form.leverancier_id.value = d.leverancier_id;
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const v = readForm(form);
    v.collecties = collecties;
    v.custom_prijs_m2 = v.custom && customM2 != null ? customM2 : null;
    v.custom_prijs_handmatig = !!(v.custom && handmatig);
    v.design_id = v.design_id ? Number(v.design_id) : null;
    if (v.website_handle) v.website_handle = v.website_handle.replace(/^.*\/products\//, '').replace(/[?#/].*$/, '');
    v.leverancier_id = v.leverancier_id ? Number(v.leverancier_id) : null;
    if (isNew) {
      const row = check(await sb.from('artikelen').insert(v).select('id, artikelnummer').single());
      toast(`Artikel ${row.artikelnummer} aangemaakt`, 'ok');
      location.hash = '#/artikel/' + row.id;
    } else {
      check(await sb.from('artikelen').update(v).eq('id', a.id));
      toast('Opgeslagen', 'ok');
      refresh();
    }
  };
  if (isNew) return;

  $('#foto', c)?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const path = await uploadFile(`artikelen/${a.id}`, file);
    check(await sb.from('artikelen').update({ foto_pad: path }).eq('id', a.id));
    toast('Foto opgeslagen', 'ok'); refresh();
  });
  $('#del', c).onclick = async () => {
    if (!await confirmBox(`Artikel ${a.artikelnummer} verwijderen? Dit kan alleen als het nog niet in orders gebruikt is. Anders: zet het op inactief.`, 'Verwijderen')) return;
    const { error } = await sb.from('artikelen').delete().eq('id', a.id);
    if (error) return toast('Kan niet verwijderen (al gebruikt). Zet het artikel op inactief.', 'error');
    location.hash = '#/artikelen';
  };
  $("#print-kaarten", c).onclick = () => kaartenModal(a);
  $('#kopie', c).onclick = async () => {
    const { id, artikelnummer, aangemaakt_op, designs: _d, leveranciers: _l, ...rest } = a;
    const row = check(await sb.from('artikelen').insert({ ...rest, naam: rest.naam + ' (kopie)' }).select('id, artikelnummer').single());
    toast(`Kopie ${row.artikelnummer} gemaakt – pas maat en prijs aan`, 'ok');
    location.hash = '#/artikel/' + row.id;
  };

  await renderExtra($('#extra', c), a, refresh);
}

async function renderExtra(el, a, reload) {
  const [vr, muts, uit, poRegels, soRegels] = await Promise.all([
    sb.from('v_voorraad').select('*').eq('artikel_id', a.id).maybeSingle(),
    sb.from('voorraad_mutaties').select('*').eq('artikel_id', a.id).order('datum', { ascending: false }).limit(50),
    sb.from('uitleningen').select('*, klanten(naam)').eq('artikel_id', a.id).order('datum_uit', { ascending: false }),
    sb.from('inkooporder_regels').select('aantal, prijs, aantal_ontvangen, inkooporders(id, ordernummer, status, orderdatum, valuta)').eq('artikel_id', a.id),
    sb.from('verkooporder_regels').select('aantal, prijs, verkooporders(id, offertenummer, orderbev_nummer, factuurnummer, status, orderdatum, klanten(naam))').eq('artikel_id', a.id),
  ]).then((r) => r.map(check));
  const v = vr || {};
  const dienst = a.soort === 'dienst';

  el.innerHTML = `
    ${dienst ? '' : `<div class="card"><h2>Voorraad<span class="spacer"></span>
        <button class="btn small" id="corr">Voorraad corrigeren</button>
        <button class="btn small" id="uitlenen">Uitlenen / op zicht</button></h2>
      <div class="kv">
        <div><span>Totaal op voorraad</span><b>${num(v.voorraad_totaal)}</b></div>
        <div><span>Uitgeleend / op zicht</span><b>${num(v.uitgeleend)}</b></div>
        <div><span>In showroom</span><b>${num(v.in_showroom)}</b></div>
        <div><span>Kostprijs per stuk (EUR)</span><b>${money(v.gem_kostprijs_eur)}${v.bevat_schatting ? ' <span class="badge orange">geschat</span>' : ''}</b></div>
        <div><span>Voorraadwaarde</span><b>${money(v.voorraadwaarde_eur)}</b></div>
      </div>
      ${v.bevat_schatting ? '<p class="small muted">"Geschat": de dollarinkoop is nog niet (helemaal) betaald. Na betaling telt het werkelijk afgeschreven eurobedrag.</p>' : ''}
    </div>`}
    ${uit.length ? `<div class="card"><h2>Uitgeleend / op zicht</h2><table class="list"><thead><tr><th>Bij</th><th class="num">Aantal</th><th>Uit</th><th>Verwacht terug</th><th>Terug</th><th></th></tr></thead><tbody>
      ${uit.map((u) => `<tr><td>${esc(u.klanten?.naam)}</td><td class="num">${num(u.aantal)}</td><td>${datum(u.datum_uit)}</td><td>${datum(u.verwacht_terug)}</td>
        <td>${u.datum_terug ? datum(u.datum_terug) : '<span class="badge orange">nog uit</span>'}</td>
        <td>${u.datum_terug ? '' : `<button class="btn small" data-terug="${u.id}">Terug ontvangen</button>`}</td></tr>`).join('')}
    </tbody></table></div>` : ''}
    <div class="card"><h2>Inkooporders</h2>${poRegels.length ? `<table class="list"><thead><tr><th>Nr.</th><th>Datum</th><th>Status</th><th class="num">Aantal</th><th class="num">Ontvangen</th><th class="num">Prijs</th></tr></thead><tbody>
      ${poRegels.map((r) => `<tr class="click" onclick="location.hash='#/inkoop/${r.inkooporders.id}'"><td>${r.inkooporders.ordernummer}</td><td>${datum(r.inkooporders.orderdatum)}</td><td>${badge(PO_STATUS, r.inkooporders.status)}</td><td class="num">${num(r.aantal)}</td><td class="num">${num(r.aantal_ontvangen)}</td><td class="num">${money(r.prijs, r.inkooporders.valuta)}</td></tr>`).join('')}
    </tbody></table>` : '<p class="muted">Nog niet ingekocht.</p>'}</div>
    <div class="card"><h2>Verkooporders</h2>${soRegels.length ? `<table class="list"><thead><tr><th>Nr.</th><th>Klant</th><th>Datum</th><th>Status</th><th class="num">Aantal</th><th class="num">Prijs excl.</th></tr></thead><tbody>
      ${soRegels.map((r) => { const s = r.verkooporders; return `<tr class="click" onclick="location.hash='#/verkoop/${s.id}'"><td>${s.factuurnummer || s.orderbev_nummer || s.offertenummer || '–'}</td><td>${esc(s.klanten?.naam)}</td><td>${datum(s.orderdatum)}</td><td>${badge(SO_STATUS, s.status)}</td><td class="num">${num(r.aantal)}</td><td class="num">${money(r.prijs)}</td></tr>`; }).join('')}
    </tbody></table>` : '<p class="muted">Nog niet verkocht.</p>'}</div>
    ${dienst ? '' : `<div class="card"><h2>Voorraadmutaties</h2>${muts.length ? `<table class="list"><thead><tr><th>Datum</th><th>Soort</th><th class="num">Aantal</th><th>Omschrijving</th></tr></thead><tbody>
      ${muts.map((m) => `<tr><td>${datum(m.datum)}</td><td>${esc(m.soort)}</td><td class="num">${Number(m.aantal) > 0 ? '+' : ''}${num(m.aantal)}</td><td>${esc(m.omschrijving || '')}</td></tr>`).join('')}
    </tbody></table>` : '<p class="muted">Nog geen mutaties.</p>'}</div>`}`;

  $('#corr', el)?.addEventListener('click', async () => {
    const ok = await modal({
      title: 'Voorraad corrigeren',
      body: `<p class="small muted">Gebruik dit voor beginvoorraad of correcties. Inkopen boek je via "Ontvangen" op de inkooporder.</p>` + formFields([
        { name: 'soort', label: 'Soort', type: 'select', options: { beginvoorraad: 'Beginvoorraad', correctie: 'Correctie' } },
        { name: 'aantal', label: 'Aantal (+ erbij, – eraf)', type: 'number', required: true },
        { name: 'waarde_eur_stuk', label: 'Waarde per stuk in EUR (bij erbij)', type: 'number', step: '0.01', hint: 'Bepaalt de voorraadwaarde' },
        { name: 'omschrijving', label: 'Reden', full: true },
      ]),
      onSubmit: async (v) => {
        if (!v.aantal) { toast('Vul een aantal in', 'error'); return false; }
        check(await sb.from('voorraad_mutaties').insert({ ...v, artikel_id: a.id }));
      },
    });
    if (ok) { toast('Voorraad bijgewerkt', 'ok'); reload(); }
  });
  $('#uitlenen', el)?.addEventListener('click', async () => {
    if (await uitleenModal(a)) reload();
  });
  on(el, 'click', '[data-terug]', async (_e, b) => {
    check(await sb.from('uitleningen').update({ datum_terug: vandaag() }).eq('id', b.dataset.terug));
    toast('Teruggeboekt', 'ok'); reload();
  });
}

export async function uitleenModal(artikel) {
  const klanten = check(await sb.from('klanten').select('id, naam, nummer, postcode_plaats, soort').eq('actief', true).order('naam'));
  const ok = await modal({
    title: `Uitlenen / op zicht: ${artikel ? artikel.artikelnummer + ' ' + artikel.naam : ''}`,
    body: `${artikel ? '' : '<label class="field">Artikel (zoek op nummer of naam)<input id="art-zoek" placeholder="Typ om te zoeken…"></label><input type="hidden" name="artikel_id"><p id="art-gekozen" class="small"></p>'}` + formFields([
      { name: 'klant_id', label: 'Bij klant / architect *', type: 'combo', required: true, placeholder: 'Kies…', options: klanten.map(klantOpt) },
      { name: 'aantal', label: 'Aantal', type: 'number', default: 1, required: true },
      { name: 'datum_uit', label: 'Datum uit', type: 'date', default: vandaag() },
      { name: 'verwacht_terug', label: 'Verwacht terug', type: 'date' },
      { name: 'notitie', label: 'Notitie', full: true },
    ]),
    onOpen: async (form) => {
      if (artikel) return;
      const { artikelPicker } = await import('../ui.js?v=20261117162032');
      artikelPicker($('#art-zoek', form), (r) => {
        form.artikel_id.value = r.id;
        $('#art-gekozen', form).innerHTML = `Gekozen: <b>${r.artikelnummer} ${esc(r.naam)}</b>`;
      });
    },
    onSubmit: async (v) => {
      const artikel_id = artikel?.id || Number(v.artikel_id);
      if (!artikel_id) { toast('Kies eerst een artikel', 'error'); return false; }
      delete v.artikel_id;
      check(await sb.from('uitleningen').insert({ ...v, klant_id: Number(v.klant_id), artikel_id }));
    },
  });
  if (ok) toast('Uitlening vastgelegd', 'ok');
  return ok;
}
