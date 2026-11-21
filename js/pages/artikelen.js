import {
  alles,
  sb, check, esc, money, num, datum, maat, m2, $, $$, on, toast, modal, confirmBox, formFields, readForm,
  SOORT_ARTIKEL, loadImages, uploadFile, withTotals, setTitle, badge, PO_STATUS, SO_STATUS, vandaag, refresh, klantOpt, levOpt, designOpt, comboHtml,
 bewaakFormulier} from '../ui.js?v=20261121172358';
import { materiaalKeuze, psychPrijs, MATERIALEN_NL, activeerKeuzes } from '../keuzes.js?v=20261121172358';
import { kaartenModal } from '../kaarten.js?v=20261121172358';

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

// ---------- Customprijs per m² van de website (maatwerk) ----------
// Eerst live van koremanmaastricht.nl (actueel), anders wat er bij het ophalen is opgeslagen.
async function websiteCustomprijs(lijst) {
  const handles = [...new Set(lijst.filter(Boolean))];
  if (!handles.length) return null;
  const { data } = await sb.from('website_producten').select('handle, titel, b2b, custom_m2, b2b_custom_m2').in('handle', handles);
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
}
// Alle custom-artikelen bijwerken als de customprijs op de website is veranderd (zelf aangepaste prijzen blijven staan).
// Draait één keer per sessie op de achtergrond bij het openen van de artikellijst.
async function syncCustomPrijzen() {
  try { if (sessionStorage.getItem('custom-sync')) return; sessionStorage.setItem('custom-sync', '1'); } catch { /* */ }
  const { data } = await sb.from('artikelen').select('id, lengte_cm, breedte_cm, verkoopprijs, custom_prijs_m2, website_handle, designs(website_handle)').eq('custom', true).eq('custom_prijs_handmatig', false).neq('soort', 'staal');
  let n = 0;
  for (const r of data || []) {
    const w = await websiteCustomprijs([r.website_handle, r.designs?.website_handle]).catch(() => null);
    if (!w || (r.custom_prijs_m2 != null && Math.abs(Number(r.custom_prijs_m2) - w.m2) < 0.005)) continue;
    const upd = { custom_prijs_m2: w.m2 };
    const { error } = await sb.from('artikelen').update(upd).eq('id', r.id);
    if (!error) n++;
  }
  if (n) toast(`Maatwerkprijs op de website gewijzigd: ${n} artikel${n === 1 ? '' : 'en'} bijgewerkt`, 'ok');
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
      <button class="btn small danger" id="sel-del"><i data-lucide="trash-2"></i> Verwijderen</button>
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
  // ---- geselecteerde artikelen verwijderen ----
  // Artikelen die op een order staan of voorraad hebben, worden niet gewist maar op inactief gezet.
  $('#sel-del', c).onclick = async (e) => {
    const knop = e.currentTarget; if (knop.disabled) return;
    knop.disabled = true;
    try {
      const ids = [...gekozen.keys()]; const inGebruik = new Set();
      for (let i = 0; i < ids.length; i += 150) {
        const deel = ids.slice(i, i + 150);
        const [po, so, vrd] = (await Promise.all([
          sb.from('inkooporder_regels').select('artikel_id').in('artikel_id', deel),
          sb.from('verkooporder_regels').select('artikel_id').in('artikel_id', deel),
          sb.from('v_voorraad').select('artikel_id, voorraad_totaal, uitgeleend').in('artikel_id', deel),
        ])).map(check);
        [...po, ...so].forEach((r) => inGebruik.add(r.artikel_id));
        vrd.filter((v) => Number(v.voorraad_totaal) !== 0 || Number(v.uitgeleend) !== 0).forEach((v) => inGebruik.add(v.artikel_id));
      }
      const weg = ids.filter((id) => !inGebruik.has(id)); const inactief = ids.filter((id) => inGebruik.has(id));
      const nrs = (l) => { const n = l.map((id) => gekozen.get(id)); return n.slice(0, 8).join(', ') + (n.length > 8 ? ` en ${n.length - 8} andere` : ''); };
      const tekst = [
        weg.length ? `${weg.length} artikel${weg.length === 1 ? '' : 'en'} definitief verwijderen (${nrs(weg)})? Dit kan niet ongedaan worden gemaakt.` : '',
        inactief.length ? `${inactief.length} artikel${inactief.length === 1 ? ' staat' : 'en staan'} op een order of ${inactief.length === 1 ? 'heeft' : 'hebben'} voorraad (${nrs(inactief)}). ${inactief.length === 1 ? 'Dat wordt' : 'Die worden'} niet gewist maar op inactief gezet, zodat de orders en de voorraad blijven kloppen.` : '',
      ].filter(Boolean).join(' ');
      if (!await confirmBox(tekst, weg.length ? 'Verwijderen' : 'Op inactief zetten')) return;
      for (let i = 0; i < weg.length; i += 150) check(await sb.from('artikelen').delete().in('id', weg.slice(i, i + 150)));
      for (let i = 0; i < inactief.length; i += 150) check(await sb.from('artikelen').update({ actief: false }).in('id', inactief.slice(i, i + 150)));
      toast([weg.length ? `${weg.length} verwijderd` : '', inactief.length ? `${inactief.length} op inactief gezet` : ''].filter(Boolean).join(', '), 'ok');
      gekozen.clear(); werkSelectieBij(); load();
    } finally { knop.disabled = false; }
  };

  $('#sel-stalen', c).onclick = async () => {
    const { stalenVelModal } = await import('../staalkaart.js?v=20261121172358');
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
  syncCustomPrijzen().catch(() => {});

  let seq = 0; let toon = 120;
  const load = async () => {
    const mine = ++seq;
    const q = $('#q', c).value.trim().replace(/[%,()]/g, '');
    let ids = null;
    if ($('#opvoorraad', c).checked) ids = (await alles(() => sb.from('v_voorraad').select('artikel_id').gt('voorraad_totaal', 0))).map((v) => v.artikel_id);
    const maak = () => {
      let query = sb.from('artikelen').select('id, artikelnummer, naam, soort, breedte_cm, lengte_cm, materiaal, verkoopprijs, verkoopprijs_m2, inkoopprijs, actief, foto_pad, collecties, custom, designs(naam, hoofdfoto_pad, design_code_lev), leveranciers(naam)')
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
            <span class="art-soort">${esc(SOORT_ARTIKEL[r.soort])}${r.custom ? ' · Maatwerk' : ''}</span>${vinkje(r)}</div>
          <div class="art-body">
            <div class="art-nr">${r.artikelnummer}${r.actief ? '' : ' · inactief'}</div>
            <div class="art-naam">${esc(r.naam)}</div>
            <div class="art-meta">${[maat(r), r.materiaal].filter(Boolean).map(esc).join(' · ') || '&nbsp;'}</div>
            <div class="art-meta">${[r.designs?.naam ? 'Design ' + r.designs.naam : '', korteCollectie(r.collecties), r.leveranciers?.naam].filter(Boolean).map(esc).join(' · ') || '&nbsp;'}</div>
            <div class="art-foot">${r.soort === 'staal' ? `<span class="art-prijs art-ink">${r.inkoopprijs != null ? `<small>inkoop</small> ${money(r.inkoopprijs)}` : '<small>geen inkoopprijs</small>'}</span>` : `<span class="art-prijs">${r.verkoopprijs == null && r.verkoopprijs_m2 != null ? `${money(r.verkoopprijs_m2)} <small class="art-m2">/ m²</small>` : money(r.verkoopprijs)}</span>`}<span>${voorraadBadge(r)}</span></div>
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
        <td class="num">${r.soort === 'staal' ? `<span class="muted small">inkoop</span> ${r.inkoopprijs != null ? money(r.inkoopprijs) : '–'}` : (r.verkoopprijs == null && r.verkoopprijs_m2 != null ? `${money(r.verkoopprijs_m2)} <span class="muted small">/ m²</span>` : money(r.verkoopprijs))}</td></tr>`).join('')}
      </tbody></table>`;
    loadImages($('#tbl', c));
  };
  on(c, 'click', '#view [data-view]', (_e, b) => {
    view = b.dataset.view;
    try { localStorage.setItem('artikel-weergave', view); } catch { /* geen opslag */ }
    zetView(); load();
  });
  on(c, 'click', 'tr[data-id]', (_e, tr) => { location.hash = '#/artikel/' + tr.dataset.id; });
  $('#wandvel', c).onclick = async () => { const { wandVelModal } = await import('../kaarten.js?v=20261121172358'); wandVelModal(); };
  $('#sel-wand', c).onclick = async () => { const { wandVelModal } = await import('../kaarten.js?v=20261121172358'); await wandVelModal([...gekozen.keys()]); };
  $('#stalenvel', c).onclick = async () => { const { stalenVelModal } = await import('../staalkaart.js?v=20261121172358'); stalenVelModal(); };
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

  // Algemeen: in groepen, zodat het kaartje rustig blijft (uitleg zit in de tooltip achter het i-icoon)
  const fNaam = [
    { name: 'naam', label: 'Naam *', required: true, placeholder: 'bv. Fawn Design' },
    { name: 'soort', label: 'Soort', type: 'select', options: SOORT_ARTIKEL },
  ];
  const fHerkomst = [
    { name: 'design_id', label: 'Design', type: 'combo', empty: '– geen –', options: designs.map(designOpt) },
    { name: 'leverancier_id', label: 'Leverancier', type: 'combo', placeholder: 'Kies…', options: levs.map(levOpt) },
    { name: 'productnr_lev', label: 'Productnummer leverancier', placeholder: '–' },
  ];
  const fOms = [
    { name: 'omschrijving', label: 'Aanvullende omschrijving', type: 'textarea', placeholder: 'Maat, kwaliteit, kleur… (komt op offertes en facturen)' },
  ];
  const fMaat = [
    { name: 'lengte_cm', label: 'Lengte (cm)', type: 'number' },
    { name: 'breedte_cm', label: 'Breedte (cm)', type: 'number' },
    { name: 'vorm', label: 'Vorm', type: 'select', options: VORMEN.map((v) => [v, v || '–']) },
  ];
  const fKwaliteit = [
    { name: 'materiaal', label: 'Materiaal', placeholder: 'bv. Wol / zijde, tencel', full: true },
    { name: 'techniek', label: 'Techniek', placeholder: 'bv. handgeknoopt' },
    { name: 'poolhoogte', label: 'Poolhoogte', placeholder: 'bv. 1–3 cm' },
    { name: 'kleurcode', label: 'Kleurcode', placeholder: 'bv. KOR098' },
  ];
  const fLogistiek = [
    { name: 'gewicht_kg', label: 'Gewicht (kg)', type: 'number' },
    { name: 'hs_code', label: 'HS-code', placeholder: 'bv. 5702910000', info: 'Douanecode, nodig bij import en export.' },
  ];
  const fInkoop = [
    { name: 'inkoopprijs', label: `Per stuk (${valuta})`, type: 'number', step: '0.01' },
    { name: 'inkoopprijs_m2', label: `Per m² (${valuta})`, type: 'number', step: '0.01' },
    { name: 'factor', label: 'Factor', type: 'number', step: '0.1', info: 'Verkoopprijs = inkoopprijs per m² × factor (standaard 6,5). Pas je inkoop of factor aan, dan wordt de standaardprijs vanzelf berekend.' },
  ];
  const fVerkoop = [
    { name: 'verkoopprijs_m2', label: 'Standaardprijs per m²', type: 'number', step: '1', info: 'De gewone prijs per m² (standaardmaten en voorraad).' },
    { name: 'custom_prijs_m2', label: 'Maatwerkprijs per m²', type: 'number', step: '0.01', info: 'De prijs per m² voor maatwerk. Wordt automatisch van de website gehaald als het artikel daaraan gekoppeld is; vul je zelf een andere prijs in, dan blijft die staan.' },
    { name: 'verkoopprijs', label: 'Prijs per stuk', type: 'number', step: '1', info: 'Bij de standaardmaten 140×200, 170×240, 200×300 en 250×350 cm: standaardprijs per m² × oppervlakte. Bij elke andere maat: maatwerkprijs per m² × oppervlakte. Afgerond; je kunt hem ook zelf aanpassen.' },
  ];

  if (a.factor == null) a.factor = 6.5;
  const fotoPad = a.foto_pad || a.designs?.hoofdfoto_pad;
  c.innerHTML = `
    <div class="page-head">
      <a class="btn small" href="#/artikelen"><i data-lucide="arrow-left"></i> Artikelen</a>
      <h1>${isNew ? 'Nieuw artikel' : `Artikel ${a.artikelnummer} – ${esc(a.naam)}`}</h1><span class="spacer"></span>
      ${isNew ? '' : `<button class="btn" id="print-kaarten" title="Wandkaart of prijskaartje voor dit artikel printen"><i data-lucide="printer"></i> Kaarten printen</button><button class="btn" id="kopie">Kopiëren</button><button class="btn danger" id="del">Verwijderen</button>`}
    </div>
    ${isNew ? '<div class="help">Het artikelnummer wordt automatisch toegekend bij opslaan (nieuwe reeks vanaf 9000; artikelen uit IOne houden hun eigen nummer).</div>' : ''}
    <form id="f">
      <div class="card art-alg"><h2>Algemeen<span class="spacer"></span>
          <label class="switch" title="Uit = het artikel verschijnt niet meer bij zoeken"><input type="checkbox" name="actief" ${a.actief ? 'checked' : ''}><span class="switch-baan"></span><span class="switch-tekst">Actief</span></label></h2>
        <div class="art-alg-grid">
          <div class="art-foto">
            ${fotoPad ? `<img class="art-foto-img" data-path="${esc(fotoPad)}" alt="">` : '<div class="art-foto-img leeg"><i data-lucide="image"></i><span>Geen foto</span></div>'}
            ${isNew ? '' : `<label class="btn small art-foto-knop"><i data-lucide="upload"></i> Foto wijzigen<input type="file" id="foto" accept="image/*" hidden></label>`}
            ${a.designs ? `<a class="art-design" href="#/design/${a.designs.id}"><span>Design</span><b>${esc(a.designs.naam)}</b>${a.designs.design_code_lev ? `<small>${esc(a.designs.design_code_lev)}</small>` : ''}</a>` : ''}
          </div>
          <div class="art-velden">
            <div class="art-groep art-naam">${formFields(fNaam, a)}</div>
            <div class="art-groep"><h3>Herkomst</h3>${formFields(fHerkomst, a)}</div>
            <div class="art-groep"><h3>Website ${'<i class="info" title="Het product op koremanmaastricht.nl. Wordt gebruikt voor de QR-code op de staalkaart en wordt ook ingevuld als je bij Kaarten printen een product kiest.">i</i>'}</h3>
              <div class="art-web">
                <div class="art-web-link"><span class="art-web-pre">koremanmaastricht.nl/products/</span><input name="website_handle" value="${esc(a.website_handle || '')}" placeholder="bv. terra-umber">
                  ${a.website_handle ? `<a class="btn small" href="https://www.koremanmaastricht.nl/products/${esc(a.website_handle)}" target="_blank" rel="noopener" title="Bekijk op de website"><i data-lucide="external-link"></i></a>` : ''}</div>
                <div class="field"><span>Collecties</span><div id="coll-edit" class="coll-edit"></div></div>
              </div></div>
            <div class="art-groep">${formFields(fOms, a)}</div>
          </div>
        </div>
      </div>
      <div class="card art-kaart"><h2>Maat en eigenschappen</h2>
        <div class="art-groep"><h3>Maat</h3><div class="art-maat">${formFields(fMaat, a)}<div class="art-opp"><span>Oppervlakte</span><b id="opp">${m2(a) ? `${num(m2(a), 2)} m²` : '–'}</b></div></div></div>
        <div class="art-groep art-kwal"><h3>Kwaliteit</h3>${formFields(fKwaliteit, a)}</div>
        <div class="art-groep"><h3>Logistiek</h3>${formFields(fLogistiek, a)}</div>
      </div>
      <div class="card art-kaart"><h2>Prijzen</h2>
        <div class="art-groep"><h3>Inkoop</h3>${formFields(fInkoop, a)}</div>
        <div class="art-groep" id="grp-verkoop"><h3>Verkoop <span class="h3-extra">incl. btw</span></h3>${formFields(fVerkoop, a)}</div>
        <div class="art-groep" id="grp-staal" hidden><h3>Verkoop</h3><p class="staal-uitleg"><i data-lucide="info"></i> Een staal wordt nooit verkocht. Er wordt daarom geen verkoopprijs berekend; voor een staal telt alleen de inkoopprijs.</p></div>
      </div>
      <div class="btn-row" style="margin-bottom:16px"><button class="btn primary" type="submit">Opslaan</button></div>
    </form>
    <div id="extra"></div>`;
  loadImages(c);

  const form = $('#f', c);
  const collecties = [...(a.collecties || [])];
  const tekenColl = () => {
    $('#coll-edit', c).innerHTML = `${collecties.map((nm, i) => `<span class="chip aan">${esc(SUB_LABEL[nm] || CATEGORIEEN.find((x) => x.hoofd === nm)?.t || nm)} <a href="#" data-coll-weg="${i}" title="Weghalen">✕</a></span>`).join('')}
      <select id="coll-add" class="coll-add"><option value="">+ toevoegen</option>${CATEGORIEEN.map((x) => `<optgroup label="${esc(x.t)}">${catNamen(x).filter((nm) => !collecties.includes(nm)).map((nm) => `<option value="${esc(nm)}">${esc(SUB_LABEL[nm] || x.t)}</option>`).join('')}</optgroup>`).join('')}</select>`;
  };
  tekenColl();
  $('#coll-edit', c).addEventListener('click', (e) => { const w = e.target.closest('[data-coll-weg]'); if (!w) return; e.preventDefault(); collecties.splice(Number(w.dataset.collWeg), 1); tekenColl(); });
  $('#coll-edit', c).addEventListener('change', (e) => {
    if (e.target.id !== 'coll-add' || !e.target.value) return;
    const nm = e.target.value; const cc = CATEGORIEEN.find((x) => catNamen(x).includes(nm));
    collecties.push(nm); if (cc && nm !== cc.hoofd && !collecties.includes(cc.hoofd)) collecties.push(cc.hoofd);
    tekenColl();
  });
  const leegOfNum = (x) => (x === null || x === undefined || x === '' ? null : Number(x));
  // Standaardprijs per m² geldt alleen bij de standaardmaten; elke andere maat is maatwerk
  const STANDAARDMATEN = [[140, 200], [170, 240], [200, 300], [250, 350]];
  const isStdMaat = () => { const l = Number(form.lengte_cm.value), b = Number(form.breedte_cm.value); return STANDAARDMATEN.some(([x, y]) => (l === x && b === y) || (l === y && b === x)); };
  const stukBerekening = () => {
    const ar = area(); if (!ar) return null;
    const std = leegOfNum(form.verkoopprijs_m2.value); const mw = leegOfNum(form.custom_prijs_m2.value);
    const standaard = isStdMaat();
    const m2p = standaard ? (std ?? mw) : (mw ?? std);
    if (m2p == null) return null;
    return { standaard, m2p, welke: (standaard && std != null) || mw == null ? 'standaardprijs' : 'maatwerkprijs', ar, stuk: psychPrijs(m2p * ar) };
  };
  const area = () => { const l = Number(form.lengte_cm.value), b = Number(form.breedte_cm.value); return l && b ? (l * b) / 10000 : null; };
  const link = (stuk, perm2, verkoop = false) => {
    form[perm2].addEventListener('input', () => { const ar = area(); if (ar && form[perm2].value) form[stuk].value = verkoop ? psychPrijs(Number(form[perm2].value) * ar) : (Number(form[perm2].value) * ar).toFixed(2); });
    form[stuk].addEventListener('input', () => { const ar = area(); if (ar && form[stuk].value) form[perm2].value = verkoop ? Math.round(Number(form[stuk].value) / ar) : (Number(form[stuk].value) / ar).toFixed(2); });
  };
  link('inkoopprijs', 'inkoopprijs_m2');
  // ---- Stalen worden niet verkocht: geen verkoopprijs en geen factor ----
  const isStaal = () => form.soort.value === 'staal';
  const syncStaal = () => {
    const st = isStaal();
    $('#grp-verkoop', c).hidden = st; $('#grp-staal', c).hidden = !st;
    const fl = form.factor.closest('label'); if (fl) fl.style.display = st ? 'none' : '';
  };
  form.soort.addEventListener('change', syncStaal);
  // ---- Maatwerkprijs per m²: van de website (zolang je hem niet zelf aanpast) ----
  let webM2 = null; let handmatig = !!a.custom_prijs_handmatig;
  const zoekCustomprijs = () => websiteCustomprijs([form.website_handle?.value?.trim().replace(/^.*\/products\//, ''), a.designs?.website_handle]);
  form.custom_prijs_m2.insertAdjacentHTML('afterend', '<div id="custom-info" class="veld-info"></div>');
  form.verkoopprijs.insertAdjacentHTML('afterend', '<div id="stuk-info" class="veld-info"></div>');
  const toonPrijsInfo = () => {
    const ar = area(); const mw = leegOfNum(form.custom_prijs_m2.value);
    const delen = [];
    if (mw != null && ar) delen.push(`${num(ar, 2)} m² → ${money(psychPrijs(mw * ar))}`);
    if (webM2 != null && (mw == null || Math.abs(mw - webM2) > 0.004)) delen.push(`website ${money(webM2)} · <a href="#" id="custom-web">gebruiken</a>`);
    else if (webM2 != null) delen.push('zoals op de website');
    $('#custom-info', c).innerHTML = delen.join(' · ');
    $('#custom-web', c)?.addEventListener('click', (e) => { e.preventDefault(); form.custom_prijs_m2.value = webM2; handmatig = false; toonPrijsInfo(); bewaarMaatwerk(); });
    const b = stukBerekening(); const nu = leegOfNum(form.verkoopprijs.value);
    $('#stuk-info', c).innerHTML = !ar ? 'vul de maat in om te berekenen'
      : !b ? ''
      : `${b.standaard ? 'Standaardmaat' : 'Geen standaardmaat'}: ${b.welke} ${money(b.m2p)} × ${num(ar, 2)} m²${nu != null && Math.abs(nu - b.stuk) > 0.5 ? ` = ${money(b.stuk)} · <a href="#" id="stuk-gebruik">gebruiken</a>` : ''}`;
    $('#stuk-gebruik', c)?.addEventListener('click', (e) => { e.preventDefault(); form.verkoopprijs.value = b.stuk ?? ''; toonPrijsInfo(); });
  };
  const bewaarMaatwerk = async (melding) => {
    if (isNew) return;
    const v = leegOfNum(form.custom_prijs_m2.value);
    const upd = { custom_prijs_m2: v, custom: v != null, custom_prijs_handmatig: v != null && handmatig };
    const { error } = await sb.from('artikelen').update(upd).eq('id', a.id);
    if (error) { toast('Maatwerkprijs kon niet worden opgeslagen: ' + error.message, 'error'); return; }
    Object.assign(a, upd); toast(melding || 'Maatwerkprijs opgeslagen', 'ok');
  };
  form.custom_prijs_m2.addEventListener('input', toonPrijsInfo);
  form.custom_prijs_m2.addEventListener('change', () => {
    const v = leegOfNum(form.custom_prijs_m2.value);
    handmatig = v != null && !(webM2 != null && Math.abs(webM2 - v) < 0.005);
    toonPrijsInfo(); bewaarMaatwerk();
  });
  ['lengte_cm', 'breedte_cm', 'verkoopprijs_m2', 'verkoopprijs'].forEach((n) => form[n].addEventListener('input', () => setTimeout(toonPrijsInfo)));
  toonPrijsInfo();
  zoekCustomprijs().catch(() => null).then((r) => {
    if (r) webM2 = r.m2;
    const nu = leegOfNum(form.custom_prijs_m2.value);
    if (webM2 != null && !handmatig && !isStaal() && (nu == null || Math.abs(nu - webM2) > 0.004)) {
      form.custom_prijs_m2.value = webM2;
      bewaarMaatwerk(nu == null ? `Maatwerkprijs van de website ingevuld: ${money(webM2)} per m²` : `Maatwerkprijs op de website gewijzigd: nu ${money(webM2)} per m²`);
    }
    toonPrijsInfo();
  });
  // Prijs per stuk volgt de juiste m²-prijs (standaard of maatwerk) zodra prijs of maat verandert
  const zetStuk = () => { const b = stukBerekening(); if (b?.stuk) form.verkoopprijs.value = b.stuk; toonPrijsInfo(); };
  ['verkoopprijs_m2', 'custom_prijs_m2', 'lengte_cm', 'breedte_cm'].forEach((n) => form[n].addEventListener('input', () => { clearTimeout(form._st); form._st = setTimeout(zetStuk, 300); }));
  // ---- Verkoopprijs = inkoopprijs per m² × factor (standaard 6,5), afgerond op een psychologische prijs ----
  const factorPrijs = () => {
    const f = Number(form.factor.value) || 6.5; const ar = area();
    const ink2 = leegOfNum(form.inkoopprijs_m2.value) ?? (leegOfNum(form.inkoopprijs.value) != null && ar ? Number(form.inkoopprijs.value) / ar : null);
    const inkStuk = leegOfNum(form.inkoopprijs.value) ?? (ink2 != null && ar ? ink2 * ar : null);
    if (ink2 == null && inkStuk == null) return null;
    return { m2: ink2 != null ? Math.round(ink2 * f) : (ar ? Math.round((inkStuk * f) / ar) : null), stuk: inkStuk != null ? psychPrijs(inkStuk * f) : null, f };
  };
  const pasFactorToe = () => {
    if (isStaal()) return;
    const p = factorPrijs(); if (!p) return;
    form.verkoopprijs_m2.value = p.m2 ?? ''; const b = stukBerekening(); form.verkoopprijs.value = b?.stuk ?? p.stuk ?? '';
    const el = $('#factor-info', c); if (el) el.innerHTML = `Standaardprijs: ${p.m2 ? `${money(p.m2)} per m²` : ''}${p.m2 && p.stuk ? ' · ' : ''}${p.stuk ? `${money(p.stuk)} per stuk` : ''}`;
    toonPrijsInfo();
  };
  ['inkoopprijs', 'inkoopprijs_m2', 'factor'].forEach((n) => form[n].addEventListener('input', () => { clearTimeout(form._ft); form._ft = setTimeout(pasFactorToe, 400); }));
  ['lengte_cm', 'breedte_cm'].forEach((n) => form[n].addEventListener('change', () => { if (leegOfNum(form.inkoopprijs_m2.value) != null) pasFactorToe(); }));
  form.factor.insertAdjacentHTML('afterend', '<div id="factor-info" class="veld-info"></div>');
  syncStaal();
  // ---- Materiaal kiezen uit een lijst (meerdere mogelijk) ----
  materiaalKeuze(form.materiaal, { opties: MATERIALEN_NL, scheiding: ' & ' });
  activeerKeuzes(c);
  ['lengte_cm', 'breedte_cm'].forEach((n) => form[n].addEventListener('input', () => {
    const ar = area(); $('#opp', c).textContent = ar ? `${num(ar, 2)} m²` : '–';
  }));
  form.design_id.addEventListener('change', () => {
    const d = designs.find((x) => String(x.id) === form.design_id.value);
    if (d?.leverancier_id && !form.leverancier_id.value) form.leverancier_id.value = d.leverancier_id;
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const v = readForm(form);
    v.collecties = collecties;
    v.custom = v.custom_prijs_m2 != null;
    v.custom_prijs_handmatig = !!(v.custom && handmatig);
    v.std_verkoopprijs = null; v.std_verkoopprijs_m2 = null;
    if (v.soort === 'staal') Object.assign(v, { verkoopprijs: null, verkoopprijs_m2: null, custom_prijs_m2: null, custom: false, custom_prijs_handmatig: false });
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
  bewaakFormulier(form, c, { negeer: ['custom_prijs_m2'], extra: () => JSON.stringify(collecties) });
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
      <div class="vr-tegels">
        <div class="vr-tegel ${Number(v.voorraad_totaal) > 0 ? 'vr-ok' : 'vr-nul'}"><span><i data-lucide="package"></i> Op voorraad</span><b>${num(v.voorraad_totaal || 0)}</b><small>${Number(v.voorraad_totaal) > 0 ? 'stuks in totaal' : 'niet op voorraad'}</small></div>
        <div class="vr-tegel"><span><i data-lucide="store"></i> In showroom</span><b>${num(v.in_showroom || 0)}</b><small>direct beschikbaar</small></div>
        <div class="vr-tegel ${Number(v.uitgeleend) > 0 ? 'vr-let' : ''}"><span><i data-lucide="arrow-left-right"></i> Uitgeleend / op zicht</span><b>${num(v.uitgeleend || 0)}</b><small>${Number(v.uitgeleend) > 0 ? 'bij een klant' : 'niets uitgeleend'}</small></div>
        <div class="vr-tegel vr-geld"><span><i data-lucide="tag"></i> Kostprijs per stuk</span><b>${v.gem_kostprijs_eur != null ? money(v.gem_kostprijs_eur) : '–'}</b><small>${v.bevat_schatting ? '<span class="badge orange">geschat</span>' : 'gemiddeld, in euro'}</small></div>
        <div class="vr-tegel vr-geld"><span><i data-lucide="wallet"></i> Voorraadwaarde</span><b>${v.voorraadwaarde_eur != null ? money(v.voorraadwaarde_eur) : '–'}</b><small>kostprijs × voorraad</small></div>
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
      const { artikelPicker } = await import('../ui.js?v=20261121172358');
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
