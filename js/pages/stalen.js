import { sb, check, esc, num, datum, $, on, toast, setTitle, vandaag, SOORT_ARTIKEL } from '../ui.js?v=20261114161316';
import { uitleenModal } from './artikelen.js?v=20261114161316';

export async function render(c) {
  setTitle('Uitgeleend / op zicht');
  c.innerHTML = `
    <div class="page-head"><h1>Uitgeleend / op zicht</h1><span class="spacer"></span>
      <button class="btn primary" id="nieuw"><i data-lucide="plus"></i> Uitlenen</button></div>
    <div class="help">Hier zie je welke stalen en tapijten bij welke klant of architect liggen (vervangt de Excel-stalenlijst).
      Uitgeleende stuks tellen nog mee in de voorraad, maar niet als "in showroom".</div>
    <div class="toolbar">
      <input type="search" id="q" placeholder="Zoek op klant of artikel…">
      <select id="filter"><option value="open">Nog uit</option><option value="telaat">Te laat terug</option><option value="alle">Alles (ook terug)</option></select>
      <select id="soort"><option value="">Stalen en tapijten</option><option value="staal">Alleen stalen</option><option value="tapijt">Alleen tapijten</option></select>
    </div>
    <div class="card flush"><div class="table-wrap" id="tbl"></div></div>`;
  const load = async () => {
    let query = sb.from('uitleningen').select('*, klanten(id, naam), artikelen(id, artikelnummer, naam, soort)').order('datum_uit', { ascending: false }).limit(1000);
    const f = $('#filter', c).value;
    if (f !== 'alle') query = query.is('datum_terug', null);
    if (f === 'telaat') query = query.lt('verwacht_terug', vandaag());
    let rows = check(await query);
    const q = $('#q', c).value.trim().toLowerCase();
    if (q) rows = rows.filter((r) => `${r.klanten?.naam} ${r.artikelen?.naam} ${r.artikelen?.artikelnummer}`.toLowerCase().includes(q));
    const s = $('#soort', c).value;
    if (s === 'staal') rows = rows.filter((r) => r.artikelen?.soort === 'staal');
    if (s === 'tapijt') rows = rows.filter((r) => r.artikelen?.soort !== 'staal');
    $('#tbl', c).innerHTML = rows.length ? `<table class="list"><thead><tr><th>Bij</th><th>Artikel</th><th>Soort</th><th class="num">Aantal</th><th>Uit</th><th>Verwacht terug</th><th>Notitie</th><th></th></tr></thead><tbody>
      ${rows.map((r) => {
        const laat = !r.datum_terug && r.verwacht_terug && r.verwacht_terug < vandaag();
        return `<tr><td><a href="#/klant/${r.klanten.id}">${esc(r.klanten.naam)}</a></td>
        <td><a href="#/artikel/${r.artikelen.id}">${r.artikelen.artikelnummer} ${esc(r.artikelen.naam)}</a></td>
        <td>${esc(SOORT_ARTIKEL[r.artikelen.soort])}</td><td class="num">${num(r.aantal)}</td><td>${datum(r.datum_uit)}</td>
        <td>${datum(r.verwacht_terug)} ${laat ? '<span class="badge red">te laat</span>' : ''}</td><td>${esc(r.notitie || '')}</td>
        <td>${r.datum_terug ? `<span class="badge green">terug ${datum(r.datum_terug)}</span>` : `<button class="btn small" data-terug="${r.id}">Terug ontvangen</button>`}</td></tr>`;
      }).join('')}</tbody></table>` : '<p class="empty">Niets gevonden.</p>';
  };
  on(c, 'click', '[data-terug]', async (_e, b) => {
    check(await sb.from('uitleningen').update({ datum_terug: vandaag() }).eq('id', b.dataset.terug));
    toast('Teruggeboekt', 'ok'); load();
  });
  $('#nieuw', c).onclick = async () => { if (await uitleenModal(null)) load(); };
  let t; $('#q', c).addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 200); });
  ['#filter', '#soort'].forEach((s) => $(s, c).addEventListener('change', load));
  await load();
}
