// Balans / voorraadtelling: barcodes scannen en de voorraad meteen gelijk zetten.
// Elke scan telt 1 stuk. De voorraad van dat artikel wordt direct: getelde stuks + wat uitgeleend is.
import { sb, check, esc, num, datum, $, on, toast, setTitle, modal, confirmBox, artikelPicker, alles, SOORT_ARTIKEL } from '../ui.js?v=20261119110855';

const maatTxt = (a) => (a?.breedte_cm && a?.lengte_cm ? `${num(a.lengte_cm)} x ${num(a.breedte_cm)} cm` : '');

// Korte piep: hoog = goed, laag = onbekend
function piep(goed) {
  try {
    const ctx = piep.ctx || (piep.ctx = new (window.AudioContext || window.webkitAudioContext)());
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = goed ? 1200 : 220; o.type = goed ? 'sine' : 'square';
    g.gain.value = 0.08; o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + (goed ? 0.08 : 0.35));
  } catch { /* geen geluid mogelijk */ }
}

export async function render(c) {
  setTitle('Balans / telling');
  const open = check(await sb.from('tellingen').select('*').eq('status', 'open').order('id', { ascending: false }).limit(1))[0];
  if (open) return renderTelling(c, open);

  const oud = check(await sb.from('tellingen').select('*').order('id', { ascending: false }).limit(20));
  const d = new Date();
  const naam = `Balans ${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
  c.innerHTML = `
    <div class="page-head"><h1>Balans / telling</h1></div>
    <div class="help">Scan alle tapijten en stalen in de showroom. Bij elke scan wordt de voorraad van dat artikel meteen aangepast:
      <b>voorraad = aantal keer gescand + wat uitgeleend is</b>. Zo klopt de voorraad direct na het scannen.
      Aan het eind kun je alles wat niet gescand is (en niet uitgeleend) op 0 zetten.</div>
    <div class="card" style="max-width:560px">
      <h2>Nieuwe telling starten</h2>
      <label class="field">Naam<input id="naam" value="${esc(naam)}"></label>
      <button class="btn primary" id="start" style="margin-top:10px"><i data-lucide="scan-line"></i> Start telling</button>
    </div>
    ${oud.length ? `<div class="card flush"><table class="list"><thead><tr><th>Telling</th><th>Gestart</th><th>Afgerond</th><th>Status</th></tr></thead><tbody>
      ${oud.map((t) => `<tr><td>${esc(t.naam)}</td><td>${datum(t.gestart_op)}</td><td>${datum(t.afgerond_op)}</td><td>${t.status === 'open' ? '<span class="badge blue">open</span>' : '<span class="badge green">afgerond</span>'}</td></tr>`).join('')}
    </tbody></table></div>` : ''}`;
  window.lucide?.createIcons();
  $('#start', c).onclick = async () => {
    const n = $('#naam', c).value.trim() || naam;
    check(await sb.from('tellingen').insert({ naam: n }));
    render(c);
  };
}

async function renderTelling(c, t) {
  c.innerHTML = `
    <div class="page-head"><h1>${esc(t.naam)}</h1><span class="badge blue" style="margin-left:8px">bezig</span><span class="spacer"></span>
      <button class="btn" id="afronden"><i data-lucide="flag"></i> Telling afronden</button></div>
    <div class="help">Klik in het scanveld en scan de barcodes. Elke scan = 1 stuk, de voorraad wordt meteen aangepast.
      Per ongeluk dubbel gescand? Klik op <b>−1</b> bij dat artikel. Stuk zonder barcode? Zoek het op bij "Handmatig toevoegen".</div>
    <div class="card scan-card">
      <label class="field">Scan hier<input id="scan" class="scan-input" autocomplete="off" placeholder="Barcode scannen…" autofocus></label>
      <div id="melding" class="scan-melding"></div>
      <div style="margin-top:12px"><label class="field">Handmatig toevoegen (zoek op nummer of naam)<input id="zoek" placeholder="Typ om te zoeken…"></label></div>
    </div>
    <div class="stats" id="stats"></div>
    <div class="card flush"><div class="toolbar" style="padding:12px 16px 0"><input type="search" id="q" placeholder="Zoek in gescande artikelen…"></div>
      <div class="table-wrap" id="tbl"></div></div>`;
  window.lucide?.createIcons();
  const scan = $('#scan', c);
  const focus = () => setTimeout(() => { if (!document.querySelector('.modal-bg') && document.activeElement?.id !== 'zoek' && document.activeElement?.id !== 'q') scan.focus(); }, 50);
  let regels = [];

  const laad = async () => {
    regels = await alles(() => sb.from('telling_regels').select('id, aantal, laatst_gescand, artikel_id, artikelen(id, artikelnummer, naam, soort, breedte_cm, lengte_cm)').eq('telling_id', t.id).order('laatst_gescand', { ascending: false }));
    toon();
  };
  const toon = () => {
    const stuks = regels.reduce((s, r) => s + r.aantal, 0);
    $('#stats', c).innerHTML = `<div class="stat"><div class="num">${num(regels.filter((r) => r.aantal > 0).length)}</div><div class="lbl">Artikelen gescand</div></div>
      <div class="stat"><div class="num">${num(stuks)}</div><div class="lbl">Stuks geteld</div></div>`;
    const q = $('#q', c).value.trim().toLowerCase();
    const rows = q ? regels.filter((r) => `${r.artikelen?.artikelnummer} ${r.artikelen?.naam}`.toLowerCase().includes(q)) : regels;
    $('#tbl', c).innerHTML = rows.length ? `<table class="list"><thead><tr><th>Artikel</th><th>Soort</th><th>Maat</th><th>Laatst gescand</th><th class="num">Geteld</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${r.aantal > 0 ? 'gescand' : ''}"><td><a href="#/artikel/${r.artikel_id}" target="_blank">${esc(r.artikelen?.artikelnummer)} ${esc(r.artikelen?.naam)}</a></td>
        <td>${esc(SOORT_ARTIKEL[r.artikelen?.soort] || '')}</td><td>${esc(maatTxt(r.artikelen))}</td>
        <td>${new Date(r.laatst_gescand).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</td>
        <td class="num"><b>${num(r.aantal)}</b></td>
        <td style="white-space:nowrap;text-align:right"><button class="btn small" data-min="${r.artikel_id}" ${r.aantal ? '' : 'disabled'}>−1</button> <button class="btn small" data-plus="${r.artikel_id}">+1</button></td></tr>`).join('')}
    </tbody></table>` : '<p class="empty">Nog niets gescand.</p>';
  };
  const melding = (res) => {
    const el = $('#melding', c);
    if (!res.gevonden) {
      el.className = 'scan-melding fout';
      el.innerHTML = `<b>Onbekende code: ${esc(res.code)}</b><br>Dit artikelnummer staat niet in de app. Scan opnieuw of zoek het handmatig op.`;
      return;
    }
    el.className = 'scan-melding goed';
    const was = Number(res.voorraad_was); const nu = Number(res.voorraad);
    el.innerHTML = `<b>${esc(res.artikelnummer)} ${esc(res.naam)}</b> ${maatTxt(res) ? `<span class="muted">· ${esc(maatTxt(res))}</span>` : ''}<br>
      Geteld: <b>${num(res.geteld)}</b> · Voorraad ${was === nu ? `blijft <b>${num(nu)}</b>` : `<b>${num(was)} → ${num(nu)}</b>`}${Number(res.uitgeleend) ? ` (waarvan ${num(res.uitgeleend)} uitgeleend)` : ''}`;
  };
  const verwerk = (res) => {
    melding(res); piep(res.gevonden);
    if (!res.gevonden) return;
    const i = regels.findIndex((r) => r.artikel_id === res.artikel_id);
    const r = i >= 0 ? regels.splice(i, 1)[0] : { artikel_id: res.artikel_id, artikelen: { id: res.artikel_id, artikelnummer: res.artikelnummer, naam: res.naam, soort: res.soort, breedte_cm: res.breedte_cm, lengte_cm: res.lengte_cm } };
    r.aantal = res.geteld; r.laatst_gescand = new Date().toISOString();
    regels.unshift(r); toon();
  };

  // Scans na elkaar verwerken (een scanner kan sneller typen dan de database antwoordt)
  let rij = Promise.resolve();
  const inRij = (fn) => { rij = rij.then(fn).catch((e) => { console.error(e); piep(false); toast(e.message || 'Fout bij verwerken', 'error'); }); return rij; };
  scan.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    e.preventDefault();
    const code = scan.value.trim(); scan.value = '';
    if (!code) return;
    inRij(async () => verwerk(check(await sb.rpc('telling_scan', { p_telling: t.id, p_code: code }))));
  });
  const zet = (id, delta) => inRij(async () => verwerk(check(await sb.rpc('telling_zet', { p_telling: t.id, p_artikel: id, p_delta: delta }))));
  on(c, 'click', '[data-min]', (_e, b) => { zet(Number(b.dataset.min), -1); focus(); });
  on(c, 'click', '[data-plus]', (_e, b) => { zet(Number(b.dataset.plus), 1); focus(); });
  artikelPicker($('#zoek', c), (a) => { zet(a.id, 1); focus(); });
  $('#q', c).addEventListener('input', toon);
  c.addEventListener('click', (e) => { if (!e.target.closest('input,button,a,select,textarea')) focus(); });

  $('#afronden', c).onclick = async () => {
    await rij;
    const voorraad = await alles(() => sb.from('v_voorraad').select('artikel_id, in_showroom').gt('in_showroom', 0));
    const gezien = new Set(regels.map((r) => r.artikel_id));
    const missend = voorraad.filter((v) => !gezien.has(v.artikel_id));
    let lijst = '';
    if (missend.length) {
      const ids = missend.slice(0, 300).map((v) => v.artikel_id);
      const arts = check(await sb.from('artikelen').select('id, artikelnummer, naam').in('id', ids));
      const m = new Map(missend.map((v) => [v.artikel_id, v.in_showroom]));
      lijst = `<div style="max-height:260px;overflow:auto;border:1px solid var(--line);border-radius:8px;margin-top:8px"><table class="list"><tbody>
        ${arts.sort((a, b) => a.artikelnummer.localeCompare(b.artikelnummer, 'nl', { numeric: true })).map((a) => `<tr><td>${esc(a.artikelnummer)}</td><td>${esc(a.naam)}</td><td class="num">${num(m.get(a.id))}</td></tr>`).join('')}
      </tbody></table></div>${missend.length > 300 ? `<p class="small muted">… en nog ${missend.length - 300} artikelen.</p>` : ''}`;
    }
    const keuze = await modal({
      title: 'Telling afronden',
      body: missend.length
        ? `<p><b>${num(missend.length)} artikelen</b> staan volgens de app in de showroom maar zijn niet gescand (${num(missend.reduce((s, v) => s + Number(v.in_showroom), 0))} stuks):</p>${lijst}
          <label class="field" style="margin-top:12px;display:flex;gap:8px;align-items:center"><input type="checkbox" name="nul" checked style="width:auto"> Zet deze artikelen op 0 (niet gevonden). Uitgeleende stuks blijven staan.</label>`
        : '<p>Alles wat in de showroom hoort te liggen is gescand.</p>',
      submitLabel: 'Afronden',
      wide: true,
      onSubmit: (v) => ({ nul: !!v.nul }),
    });
    if (!keuze) { focus(); return; }
    if (keuze.nul && missend.length && !(await confirmBox(`Weet je het zeker? De voorraad van ${missend.length} artikelen wordt op 0 gezet.`, 'Ja, afronden'))) { focus(); return; }
    const n = check(await sb.rpc('telling_afronden', { p_telling: t.id, p_nul: keuze.nul }));
    toast(`Telling afgerond${n ? `, ${n} artikelen op 0 gezet` : ''}`, 'ok');
    render(c);
  };

  await laad();
  scan.focus();
}
