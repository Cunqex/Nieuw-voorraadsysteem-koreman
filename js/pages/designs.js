import {
  sb, check, esc, money, maat, $, on, toast, confirmBox, formFields, readForm,
  SOORT_ARTIKEL, loadImages, uploadFile, isImage, mediaUrl, setTitle, refresh, levOpt,
} from '../ui.js?v=20261114113126';

// =============================== LIJST ===============================
export async function renderList(c) {
  setTitle('Designs');
  c.innerHTML = `
    <div class="page-head"><h1>Designs</h1><span class="spacer"></span>
      <a class="btn primary" href="#/design/new"><i data-lucide="plus"></i> Nieuw design</a></div>
    <div class="help">Een design is een tapijtontwerp van de leverancier, zoals het op het staal staat (bv. <b>JO#8010</b>).
      Hier bewaar je de foto's en CAD's. Daaronder maak je de artikelen aan: het staal, en elk tapijt in een bepaalde maat.
      De designcode en foto gaan automatisch mee op de inkooporder, zodat de leverancier weet welk tapijt je bedoelt.</div>
    <div class="toolbar"><input type="search" id="q" placeholder="Zoek op naam of designcode…"></div>
    <div id="grid" class="grid"></div>`;
  const load = async () => {
    const q = $('#q', c).value.trim().replace(/[%,()]/g, '');
    let query = sb.from('designs').select('id, naam, design_code_lev, hoofdfoto_pad, leveranciers(naam), artikelen(count)').order('naam').limit(500);
    if (q) query = query.or(`naam.ilike.%${q}%,design_code_lev.ilike.%${q}%`);
    const rows = check(await query);
    $('#grid', c).innerHTML = rows.length ? rows.map((d) => `
      <a class="card" href="#/design/${d.id}" style="text-decoration:none;color:inherit;padding:10px;margin:0">
        ${d.hoofdfoto_pad ? `<img class="thumb big" data-path="${esc(d.hoofdfoto_pad)}" alt="">` : '<div class="thumb big"></div>'}
        <div style="margin-top:8px"><b>${esc(d.naam)}</b></div>
        <div class="small muted">${esc(d.design_code_lev || 'geen designcode')} · ${esc(d.leveranciers?.naam || 'geen leverancier')}</div>
        <div class="small muted">${d.artikelen?.[0]?.count ?? 0} artikel(en)</div>
      </a>`).join('') : '<p class="empty">Nog geen designs.</p>';
    loadImages(c);
  };
  let t; $('#q', c).addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
  await load();
}

// =============================== DETAIL ===============================
export async function renderDetail(c, [idStr]) {
  const isNew = idStr === 'new';
  const levs = check(await sb.from('leveranciers').select('id, naam, nummer, land, valuta').order('naam'));
  let d = {};
  if (!isNew) d = check(await sb.from('designs').select('*').eq('id', idStr).single());
  setTitle(isNew ? 'Nieuw design' : `Design ${d.naam}`);

  const fields = [
    { name: 'naam', label: 'Naam (onze naam) *', required: true, placeholder: 'bv. Fawn of Desert design' },
    { name: 'design_code_lev', label: 'Designcode / -naam leverancier', placeholder: 'bv. JO#8010', hint: 'Zoals op het staal staat' },
    { name: 'leverancier_id', label: 'Leverancier', type: 'combo', placeholder: 'Kies…', options: levs.map(levOpt) },
    { name: 'omschrijving', label: 'Omschrijving', type: 'textarea' },
    { name: 'notities', label: 'Interne notities', type: 'textarea' },
  ];

  c.innerHTML = `
    <div class="page-head"><a class="btn small" href="#/designs"><i data-lucide="arrow-left"></i> Designs</a>
      <h1>${isNew ? 'Nieuw design' : esc(d.naam)}</h1><span class="spacer"></span>
      ${isNew ? '' : '<button class="btn danger" id="del">Verwijderen</button>'}</div>
    <form id="f" class="card"><h2>Gegevens</h2>${formFields(fields, d)}
      <div class="btn-row" style="margin-top:14px"><button class="btn primary">Opslaan</button></div></form>
    <div id="extra"></div>`;

  $('#f', c).onsubmit = async (e) => {
    e.preventDefault();
    const v = readForm(e.target);
    v.leverancier_id = v.leverancier_id ? Number(v.leverancier_id) : null;
    if (isNew) {
      const row = check(await sb.from('designs').insert(v).select('id').single());
      toast('Design aangemaakt – voeg nu foto\'s en artikelen toe', 'ok');
      location.hash = '#/design/' + row.id;
    } else {
      check(await sb.from('designs').update(v).eq('id', d.id));
      toast('Opgeslagen', 'ok');
    }
  };
  if (isNew) return;

  $('#del', c).onclick = async () => {
    if (!await confirmBox('Design verwijderen? De artikelen blijven bestaan maar zijn niet meer gekoppeld.', 'Verwijderen')) return;
    check(await sb.from('designs').delete().eq('id', d.id));
    location.hash = '#/designs';
  };

  const reload = refresh;
  const [files, arts] = await Promise.all([
    sb.from('design_bestanden').select('*').eq('design_id', d.id).order('aangemaakt_op'),
    sb.from('artikelen').select('id, artikelnummer, naam, soort, breedte_cm, lengte_cm, verkoopprijs, actief').eq('design_id', d.id).order('artikelnummer'),
  ]).then((r) => r.map(check));

  const extra = $('#extra', c);
  extra.innerHTML = `
    <div class="card"><h2>Foto's en CAD's<span class="spacer"></span>
      <label class="btn small primary">+ Bestanden uploaden<input type="file" id="up" multiple hidden></label></h2>
      <p class="small muted">Klik op "Hoofdfoto" om te kiezen welke foto standaard op de inkooporder komt. Bestanden kun je ook hierheen slepen.</p>
      <div class="files" id="files">
      ${files.length ? files.map((f) => `<div class="file ${f.pad === d.hoofdfoto_pad ? 'main' : ''}">
          ${isImage(f.pad) ? `<img data-path="${esc(f.pad)}" alt="">` : `<div class="fileicon"><i data-lucide="file"></i></div>`}
          <div style="margin:6px 0;word-break:break-all">${esc(f.bestandsnaam || '')}</div>
          <select data-soort="${f.id}" style="padding:4px;font-size:12px">${['foto', 'cad', 'overig'].map((s) => `<option ${s === f.soort ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <div class="btn-row" style="margin-top:6px">
            ${f.pad === d.hoofdfoto_pad ? '<span class="badge blue">Hoofdfoto</span>' : (isImage(f.pad) ? `<button class="btn small" data-main="${esc(f.pad)}">Hoofdfoto</button>` : '')}
            <button class="btn small" data-open="${esc(f.pad)}">Open</button>
            <button class="btn small danger" data-delf="${f.id}" data-pad="${esc(f.pad)}"><i data-lucide="trash-2"></i></button>
          </div></div>`).join('') : '<p class="muted">Nog geen bestanden.</p>'}
      </div></div>
    <div class="card"><h2>Artikelen van dit design<span class="spacer"></span>
      <a class="btn small" href="#/artikel/new?design=${d.id}&soort=staal">+ Staal</a>
      <a class="btn small primary" href="#/artikel/new?design=${d.id}">+ Artikel / maat</a></h2>
      ${arts.length ? `<table class="list"><thead><tr><th>Nr.</th><th>Naam</th><th>Soort</th><th>Maat</th><th class="num">Verkoopprijs</th></tr></thead><tbody>
      ${arts.map((a) => `<tr class="click" onclick="location.hash='#/artikel/${a.id}'"><td><b>${a.artikelnummer}</b></td><td>${esc(a.naam)}${a.actief ? '' : ' <span class="badge">inactief</span>'}</td><td>${esc(SOORT_ARTIKEL[a.soort])}</td><td>${maat(a)}</td><td class="num">${money(a.verkoopprijs)}</td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">Nog geen artikelen. Maak bijvoorbeeld eerst het staal aan.</p>'}</div>`;
  loadImages(extra);

  const doUpload = async (list) => {
    if (!list.length) return;
    toast(`${list.length} bestand(en) uploaden…`);
    let eerste = null;
    for (const file of list) {
      const pad = await uploadFile(`designs/${d.id}`, file);
      const soort = isImage(file.name) ? 'foto' : (/\.(dwg|dxf|pdf|ai|psd|tif|tiff)$/i.test(file.name) ? 'cad' : 'overig');
      check(await sb.from('design_bestanden').insert({ design_id: d.id, pad, bestandsnaam: file.name, soort }));
      if (!eerste && isImage(file.name)) eerste = pad;
    }
    if (!d.hoofdfoto_pad && eerste) check(await sb.from('designs').update({ hoofdfoto_pad: eerste }).eq('id', d.id));
    toast('Geüpload', 'ok'); reload();
  };
  $('#up', extra).addEventListener('change', (e) => doUpload([...e.target.files]));
  const drop = $('#files', extra);
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.style.outline = '2px dashed #1f4f8f'; });
  drop.addEventListener('dragleave', () => { drop.style.outline = ''; });
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.style.outline = ''; doUpload([...e.dataTransfer.files]); });

  on(extra, 'click', '[data-main]', async (_e, b) => {
    check(await sb.from('designs').update({ hoofdfoto_pad: b.dataset.main }).eq('id', d.id));
    toast('Hoofdfoto ingesteld', 'ok'); reload();
  });
  on(extra, 'click', '[data-open]', async (_e, b) => { const u = await mediaUrl(b.dataset.open); if (u) window.open(u, '_blank'); });
  on(extra, 'click', '[data-delf]', async (_e, b) => {
    if (!await confirmBox('Bestand verwijderen?', 'Verwijderen')) return;
    await sb.storage.from('media').remove([b.dataset.pad]);
    check(await sb.from('design_bestanden').delete().eq('id', b.dataset.delf));
    if (d.hoofdfoto_pad === b.dataset.pad) check(await sb.from('designs').update({ hoofdfoto_pad: null }).eq('id', d.id));
    reload();
  });
  on(extra, 'change', '[data-soort]', async (_e, s) => {
    check(await sb.from('design_bestanden').update({ soort: s.value }).eq('id', s.dataset.soort));
    toast('Opgeslagen', 'ok');
  });
}
