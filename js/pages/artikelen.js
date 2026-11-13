import {
  sb, check, esc, money, num, datum, maat, m2, $, $$, on, toast, modal, confirmBox, formFields, readForm,
  SOORT_ARTIKEL, loadImages, uploadFile, withTotals, setTitle, badge, PO_STATUS, SO_STATUS, vandaag,
} from '../ui.js';

const VORMEN = ['', 'Recht', 'Recht met afgeronde hoeken', 'Rond', 'Ovaal', 'Organisch', 'Anders'];

// =============================== LIJST ===============================
export async function renderList(c, _p, query) {
  setTitle('Artikelen');
  const levs = check(await sb.from('leveranciers').select('id, naam').order('naam'));
  c.innerHTML = `
    <div class="page-head"><h1>Artikelen</h1><span class="spacer"></span>
      <a class="btn primary" href="#/artikel/new"><i data-lucide="plus"></i> Nieuw artikel</a></div>
    <div class="help">Een artikel is iets dat je inkoopt of verkoopt: een tapijt in een bepaalde maat, een staal of een dienst.
      Hoort het bij een design van de leverancier (met foto's en designcode)? Koppel het dan aan dat design.</div>
    <div class="toolbar">
      <input type="search" id="q" placeholder="Zoek op nummer, naam of omschrijving…" value="${esc(query.q || '')}">
      <select id="soort"><option value="">Alle soorten</option>${Object.entries(SOORT_ARTIKEL).map(([k, v]) => `<option value="${k}" ${query.soort === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select id="lev"><option value="">Alle leveranciers</option>${levs.map((l) => `<option value="${l.id}">${esc(l.naam)}</option>`).join('')}</select>
      <label class="check" style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="opvoorraad" style="width:auto" ${query.voorraad ? 'checked' : ''}> Alleen op voorraad</label>
      <label class="check" style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="inactief" style="width:auto"> Ook inactieve</label>
    </div>
    <div class="card flush"><div class="table-wrap" id="tbl"></div></div>`;

  const load = async () => {
    const q = $('#q', c).value.trim().replace(/[%,()]/g, '');
    let query = sb.from('artikelen').select('id, artikelnummer, naam, soort, breedte_cm, lengte_cm, verkoopprijs, actief, foto_pad, designs(hoofdfoto_pad, design_code_lev), leveranciers(naam)')
      .order('artikelnummer', { ascending: false }).limit(500);
    if (q) query = /^\d+$/.test(q) ? query.eq('artikelnummer', Number(q)) : query.or(`naam.ilike.%${q}%,omschrijving.ilike.%${q}%,productnr_lev.ilike.%${q}%`);
    if ($('#soort', c).value) query = query.eq('soort', $('#soort', c).value);
    if ($('#lev', c).value) query = query.eq('leverancier_id', $('#lev', c).value);
    if (!$('#inactief', c).checked) query = query.eq('actief', true);
    let rows = check(await query);
    await withTotals(rows, 'v_voorraad', 'artikel_id');
    if ($('#opvoorraad', c).checked) rows = rows.filter((r) => Number(r._t.voorraad_totaal) > 0);
    $('#tbl', c).innerHTML = rows.length ? `<table class="list"><thead><tr><th></th><th>Nr.</th><th>Naam</th><th>Soort</th><th>Maat</th><th>Leverancier</th><th>Design</th><th class="num">Voorraad</th><th class="num">Verkoopprijs</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="click" data-id="${r.id}">
        <td><img class="thumb" data-path="${esc(r.foto_pad || r.designs?.hoofdfoto_pad || '')}" alt=""></td>
        <td><b>${r.artikelnummer}</b></td><td>${esc(r.naam)}${r.actief ? '' : ' <span class="badge">inactief</span>'}</td>
        <td>${esc(SOORT_ARTIKEL[r.soort])}</td><td>${maat(r)}</td><td>${esc(r.leveranciers?.naam || '')}</td>
        <td>${esc(r.designs?.design_code_lev || '')}</td>
        <td class="num">${r.soort === 'dienst' ? '' : num(r._t.voorraad_totaal)}${Number(r._t.uitgeleend) ? ` <span class="muted small">(${num(r._t.uitgeleend)} uit)</span>` : ''}</td>
        <td class="num">${money(r.verkoopprijs)}</td></tr>`).join('')}
      </tbody></table>` : '<p class="empty">Geen artikelen gevonden.</p>';
    $$('img[data-path=""]', c).forEach((i) => i.removeAttribute('data-path'));
    loadImages(c);
  };
  on(c, 'click', 'tr[data-id]', (_e, tr) => { location.hash = '#/artikel/' + tr.dataset.id; });
  let t; $('#q', c).addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
  ['#soort', '#lev', '#opvoorraad', '#inactief'].forEach((s) => $(s, c).addEventListener('change', load));
  await load();
}

// =============================== DETAIL ===============================
export async function renderDetail(c, [idStr], query) {
  const isNew = idStr === 'new';
  const [levs, designs] = await Promise.all([
    sb.from('leveranciers').select('id, naam, valuta').order('naam'),
    sb.from('designs').select('id, naam, design_code_lev, leverancier_id').order('naam'),
  ]).then((r) => r.map(check));

  let a = { soort: 'voorraad', actief: true };
  if (!isNew) {
    a = check(await sb.from('artikelen').select('*, designs(id, naam, design_code_lev, hoofdfoto_pad), leveranciers(naam, valuta)').eq('id', idStr).single());
  } else if (query.design) {
    const d = designs.find((x) => String(x.id) === query.design);
    if (d) a = { ...a, design_id: d.id, leverancier_id: d.leverancier_id, naam: d.naam, soort: query.soort || 'voorraad' };
  }
  setTitle(isNew ? 'Nieuw artikel' : `Artikel ${a.artikelnummer}`);
  const valuta = levs.find((l) => l.id === a.leverancier_id)?.valuta || 'EUR';

  const fields1 = [
    { name: 'naam', label: 'Naam *', required: true, placeholder: 'bv. Fawn 365 x 275' },
    { name: 'soort', label: 'Soort', type: 'select', options: SOORT_ARTIKEL },
    { name: 'design_id', label: 'Design (van leverancier)', type: 'select', empty: '– geen –', options: designs.map((d) => [d.id, `${d.naam}${d.design_code_lev ? ' (' + d.design_code_lev + ')' : ''}`]) },
    { name: 'leverancier_id', label: 'Leverancier', type: 'select', empty: '– kies –', options: levs.map((l) => [l.id, l.naam]) },
    { name: 'productnr_lev', label: 'Productnummer leverancier' },
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
      ${isNew ? '' : `<button class="btn" id="kopie">Kopiëren</button><button class="btn danger" id="del">Verwijderen</button>`}
    </div>
    ${isNew ? '<div class="help">Het artikelnummer wordt automatisch toegekend bij opslaan (nieuwe reeks vanaf 9000).</div>' : ''}
    <form id="f">
      <div class="card"><h2>Algemeen</h2>
        <div style="display:flex;gap:20px;flex-wrap:wrap">
          <div style="width:180px">
            ${fotoPad ? `<img class="thumb big" data-path="${esc(fotoPad)}" alt="">` : '<div class="thumb big muted" style="display:flex;align-items:center;justify-content:center">geen foto</div>'}
            ${isNew ? '' : `<label class="btn small" style="margin-top:6px">Eigen foto uploaden<input type="file" id="foto" accept="image/*" hidden></label>`}
            ${a.designs ? `<p class="small">Design: <a href="#/design/${a.designs.id}">${esc(a.designs.naam)}</a><br>${esc(a.designs.design_code_lev || '')}</p>` : ''}
          </div>
          <div style="flex:1;min-width:280px">${formFields(fields1, a)}</div>
        </div>
      </div>
      <div class="card"><h2>Maat en eigenschappen</h2>${formFields(fields2, a)}
        <p class="small muted" id="opp">${m2(a) ? `Oppervlakte: ${num(m2(a), 2)} m²` : ''}</p></div>
      <div class="card"><h2>Prijzen</h2>${formFields(fields3, a)}
        <p class="small muted">Vul je een m²-prijs in en is de maat bekend, dan rekent de app de stukprijs uit (en andersom).</p></div>
      <div class="btn-row" style="margin-bottom:16px"><button class="btn primary" type="submit">Opslaan</button></div>
    </form>
    <div id="extra"></div>`;
  loadImages(c);

  const form = $('#f', c);
  const area = () => { const l = Number(form.lengte_cm.value), b = Number(form.breedte_cm.value); return l && b ? (l * b) / 10000 : null; };
  const link = (stuk, perm2) => {
    form[perm2].addEventListener('input', () => { const ar = area(); if (ar && form[perm2].value) form[stuk].value = (Number(form[perm2].value) * ar).toFixed(2); });
    form[stuk].addEventListener('input', () => { const ar = area(); if (ar && form[stuk].value) form[perm2].value = (Number(form[stuk].value) / ar).toFixed(2); });
  };
  link('inkoopprijs', 'inkoopprijs_m2');
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
    v.design_id = v.design_id ? Number(v.design_id) : null;
    v.leverancier_id = v.leverancier_id ? Number(v.leverancier_id) : null;
    if (isNew) {
      const row = check(await sb.from('artikelen').insert(v).select('id, artikelnummer').single());
      toast(`Artikel ${row.artikelnummer} aangemaakt`, 'ok');
      location.hash = '#/artikel/' + row.id;
    } else {
      check(await sb.from('artikelen').update(v).eq('id', a.id));
      toast('Opgeslagen', 'ok');
      renderDetail(c, [idStr], query);
    }
  };
  if (isNew) return;

  $('#foto', c)?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const path = await uploadFile(`artikelen/${a.id}`, file);
    check(await sb.from('artikelen').update({ foto_pad: path }).eq('id', a.id));
    toast('Foto opgeslagen', 'ok'); renderDetail(c, [idStr], query);
  });
  $('#del', c).onclick = async () => {
    if (!await confirmBox(`Artikel ${a.artikelnummer} verwijderen? Dit kan alleen als het nog niet in orders gebruikt is. Anders: zet het op inactief.`, 'Verwijderen')) return;
    const { error } = await sb.from('artikelen').delete().eq('id', a.id);
    if (error) return toast('Kan niet verwijderen (al gebruikt). Zet het artikel op inactief.', 'error');
    location.hash = '#/artikelen';
  };
  $('#kopie', c).onclick = async () => {
    const { id, artikelnummer, aangemaakt_op, designs: _d, leveranciers: _l, ...rest } = a;
    const row = check(await sb.from('artikelen').insert({ ...rest, naam: rest.naam + ' (kopie)' }).select('id, artikelnummer').single());
    toast(`Kopie ${row.artikelnummer} gemaakt – pas maat en prijs aan`, 'ok');
    location.hash = '#/artikel/' + row.id;
  };

  await renderExtra($('#extra', c), a, () => renderDetail(c, [idStr], query));
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
  const klanten = check(await sb.from('klanten').select('id, naam, soort').eq('actief', true).order('naam'));
  const ok = await modal({
    title: `Uitlenen / op zicht: ${artikel ? artikel.artikelnummer + ' ' + artikel.naam : ''}`,
    body: `${artikel ? '' : '<label class="field">Artikel (zoek op nummer of naam)<input id="art-zoek" placeholder="Typ om te zoeken…"></label><input type="hidden" name="artikel_id"><p id="art-gekozen" class="small"></p>'}` + formFields([
      { name: 'klant_id', label: 'Bij klant / architect *', type: 'select', required: true, empty: '– kies –', options: klanten.map((k) => [k.id, k.naam]) },
      { name: 'aantal', label: 'Aantal', type: 'number', default: 1, required: true },
      { name: 'datum_uit', label: 'Datum uit', type: 'date', default: vandaag() },
      { name: 'verwacht_terug', label: 'Verwacht terug', type: 'date' },
      { name: 'notitie', label: 'Notitie', full: true },
    ]),
    onOpen: async (form) => {
      if (artikel) return;
      const { artikelPicker } = await import('../ui.js');
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
