// Voorraadwaarde (inkoop): wat is de voorraad waard, vandaag of op een gekozen datum in het verleden.
// Rekent met de voorraadmutaties tot en met de gekozen dag, op dezelfde manier als de rest van de app:
// aantal op voorraad × gemiddelde inkoopprijs. Vracht en invoerrechten tellen niet mee.
import { sb, esc, money, $, setTitle, alles, vandaag, toast, SOORT_ARTIKEL } from '../ui.js?v=20261121160302';
import { lijnen, legenda, koppelZweef, iso, dn, r2 } from './rapportage.js?v=20261121160302';

const MAAND = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const lokaleDag = (ts) => iso(new Date(ts));
const n0 = (x) => Number(x).toLocaleString('nl-NL', { maximumFractionDigits: 2 });

export async function render(c) {
  setTitle('Voorraadwaarde');
  const nu = new Date(); const j = nu.getFullYear();
  c.innerHTML = `
    <div class="page-head"><h1>Voorraadwaarde</h1><span class="spacer"></span>
      <button class="btn primary" id="download"><i data-lucide="download"></i> Voorraadlijst van deze datum</button></div>
    <div class="toolbar">
      <label class="vw-datum">Stand op <input type="date" id="datum" value="${vandaag()}" max="${vandaag()}"></label>
      <button class="btn small" data-d="${vandaag()}">Vandaag</button>
      <button class="btn small" data-d="${iso(new Date(j, nu.getMonth(), 0))}">Eind vorige maand</button>
      <button class="btn small" data-d="${j - 1}-12-31">31 december ${j - 1}</button>
      <span class="spacer"></span><span class="muted small" id="bereik"></span>
    </div>
    <div id="inhoud"><p class="muted">Gegevens laden…</p></div>
    <div class="zweef" id="zweef" hidden></div>`;

  const [mut, kost, arts] = await Promise.all([
    alles(() => sb.from('voorraad_mutaties').select('id, artikel_id, aantal, soort, inkoopregel_id, waarde_eur_stuk, datum').order('id')),
    alles(() => sb.from('v_inkoopregel_kostprijs').select('inkoopregel_id, kostprijs_eur_stuk, is_schatting').order('inkoopregel_id')),
    alles(() => sb.from('artikelen').select('id, artikelnummer, naam, soort, omzetgroep, lengte_cm, breedte_cm, leveranciers(naam)').order('id')),
  ]);
  const kostVan = new Map(kost.map((k) => [k.inkoopregel_id, k]));
  const art = new Map(arts.map((a) => [a.id, a]));
  // per mutatie: dag en inkoopprijs per stuk (van de inkoopregel, anders de ingevulde waarde)
  const regels = mut.map((m) => { const k = m.inkoopregel_id ? kostVan.get(m.inkoopregel_id) : null;
    return { a: m.artikel_id, n: Number(m.aantal), dag: lokaleDag(m.datum), in: Number(m.aantal) > 0 && ['ontvangst', 'beginvoorraad', 'correctie'].includes(m.soort), prijs: k?.kostprijs_eur_stuk ?? m.waarde_eur_stuk, schatting: !!k?.is_schatting }; })
    .sort((x, y) => x.dag.localeCompare(y.dag));
  const eerste = regels.length ? regels[0].dag : null;

  // Stand op een dag: per artikel aantal, gemiddelde inkoopprijs en waarde
  const stand = (dag) => {
    const m = new Map();
    for (const r of regels) {
      if (r.dag > dag) break;
      let s = m.get(r.a); if (!s) { s = { aantal: 0, inAantal: 0, inWaarde: 0, schatting: false }; m.set(r.a, s); }
      s.aantal += r.n;
      if (r.in) { s.inAantal += r.n; if (r.prijs !== null && r.prijs !== undefined) s.inWaarde += r.n * Number(r.prijs); if (r.schatting) s.schatting = true; }
    }
    const rijen = [];
    m.forEach((s, id) => {
      if (Math.abs(s.aantal) < 0.005) return;
      const prijs = s.inAantal && s.inWaarde ? r2(s.inWaarde / s.inAantal) : null;
      rijen.push({ id, a: art.get(id) || {}, aantal: s.aantal, prijs, waarde: prijs === null ? 0 : r2(s.aantal * prijs), schatting: s.schatting });
    });
    return rijen;
  };
  const totaal = (rijen) => rijen.reduce((t, r) => t + r.waarde, 0);

  let tips = {}; let huidige = []; let toonAlles = false;
  const teken = () => {
    const dag = $('#datum', c).value || vandaag();
    const rijen = stand(dag).sort((x, y) => y.waarde - x.waarde);
    huidige = rijen;
    const waarde = totaal(rijen); const stuks = rijen.reduce((t, r) => t + r.aantal, 0);
    const zonder = rijen.filter((r) => r.prijs === null && r.aantal > 0); const negatief = rijen.filter((r) => r.aantal < 0);
    const jaarEerder = `${Number(dag.slice(0, 4)) - 1}${dag.slice(4)}`; const beginJaar = `${Number(dag.slice(0, 4)) - 1}-12-31`;
    const wJaar = totaal(stand(jaarEerder)); const wBegin = totaal(stand(beginJaar));
    const voorHist = (d) => eerste && d < eerste;
    $('#bereik', c).textContent = `Inkoopwaarde, excl. btw, zonder vracht en invoerrechten`;

    // verloop: eind van elke maand in de 12 maanden vóór de gekozen dag, plus de dag zelf
    const d0 = new Date(dag); const punten = [];
    for (let i = 12; i >= 1; i--) { const e = new Date(d0.getFullYear(), d0.getMonth() - i + 1, 0); punten.push({ dag: iso(e), l: `${MAAND[e.getMonth()]} '${String(e.getFullYear()).slice(2)}` }); }
    if (punten[punten.length - 1].dag !== dag) punten.push({ dag, l: `${d0.getDate()} ${MAAND[d0.getMonth()]}` });
    const reeks = punten.map((p) => r2(totaal(stand(p.dag))));
    tips = { verloop: punten.map((p, i) => `<b>${dn(p.dag)}</b><div><span><i class="res"></i>Voorraadwaarde</span><b>${money(reeks[i])}</b></div>${voorHist(p.dag) ? '<div><span class="muted">Vóór de start van de administratie</span></div>' : ''}`) };

    const groepeer = (fn) => { const m = new Map(); rijen.forEach((r) => { const k = fn(r); const g = m.get(k) || { waarde: 0, aantal: 0, n: 0 }; g.waarde += r.waarde; g.aantal += r.aantal; g.n++; m.set(k, g); }); return [...m.entries()].sort((x, y) => y[1].waarde - x[1].waarde); };
    const tabel = (lijst, kop, max = 10) => {
      const top = lijst.slice(0, max); const rest = lijst.slice(max);
      if (rest.length) top.push([`Overig (${rest.length})`, rest.reduce((t, [, g]) => ({ waarde: t.waarde + g.waarde, aantal: t.aantal + g.aantal, n: t.n + g.n }), { waarde: 0, aantal: 0, n: 0 })]);
      const mx = Math.max(1, ...top.map(([, g]) => g.waarde));
      return top.length ? `<table class="list rap-tbl"><thead><tr><th>${kop}</th><th></th><th class="num">Stuks</th><th class="num">Waarde</th><th class="num">Aandeel</th></tr></thead><tbody>
        ${top.map(([naam, g]) => `<tr><td>${esc(naam)}</td><td class="rap-balk"><i class="res" style="width:${Math.max(0, (g.waarde / mx) * 100).toFixed(1)}%"></i></td><td class="num">${n0(g.aantal)}</td><td class="num"><b>${money(g.waarde)}</b></td><td class="num muted">${waarde ? `${((g.waarde / waarde) * 100).toLocaleString('nl-NL', { maximumFractionDigits: 1 })}%` : '–'}</td></tr>`).join('')}
        <tr class="tot"><td>Totaal</td><td></td><td class="num">${n0(stuks)}</td><td class="num">${money(waarde)}</td><td class="num">100%</td></tr></tbody></table>` : '<p class="muted">Niets op voorraad.</p>';
    };
    const versch = (toen, d) => (voorHist(d) ? '<span class="delta">geen gegevens van toen</span>' : `<span class="delta ${waarde - toen >= 0 ? 'op' : 'neer'}">${waarde - toen >= 0 ? '▲' : '▼'} ${money(Math.abs(waarde - toen))}</span> <span class="muted">was ${money(toen)}</span>`);
    const kpi = (kl, lbl, w, sub) => `<div class="rap-kpi ${kl}"><span class="rap-lbl">${lbl}</span><b class="rap-num">${w}</b><span class="rap-sub">${sub}</span></div>`;
    const toon = toonAlles ? rijen : rijen.slice(0, 50);

    $('#inhoud', c).innerHTML = `
      ${voorHist(dag) ? `<div class="warnbox">Op ${dn(dag)} werd de voorraad nog niet in deze app bijgehouden. De eerste voorraadboeking is van ${dn(eerste)}; vóór die datum kan de app geen voorraadwaarde berekenen.</div>` : ''}
      <div class="rap-kpis">
        ${kpi('ink', `Voorraadwaarde op ${dn(dag)}`, money(waarde), 'Inkoopwaarde van alles wat op voorraad ligt')}
        ${kpi('', 'Stuks op voorraad', n0(stuks), `${rijen.filter((r) => r.aantal > 0).length} verschillende artikelen`)}
        ${kpi('', 'Ten opzichte van een jaar eerder', voorHist(jaarEerder) ? '–' : money(waarde - wJaar), versch(wJaar, jaarEerder))}
        ${kpi('', `Sinds 31 december ${beginJaar.slice(0, 4)}`, voorHist(beginJaar) ? '–' : money(waarde - wBegin), versch(wBegin, beginJaar))}
      </div>
      ${zonder.length ? `<div class="warnbox">${zonder.length} artikel${zonder.length === 1 ? '' : 'en'} op voorraad ${zonder.length === 1 ? 'heeft' : 'hebben'} geen inkoopprijs (${n0(zonder.reduce((t, r) => t + r.aantal, 0))} stuks) en tel${zonder.length === 1 ? 't' : 'len'} voor € 0 mee. Vul de inkoopprijs in via een voorraadcorrectie bij het artikel om de waarde kloppend te krijgen.</div>` : ''}
      ${negatief.length ? `<div class="warnbox">${negatief.length} artikel${negatief.length === 1 ? ' staat' : 'en staan'} op een negatieve voorraad. Dat drukt de waarde; controleer ${negatief.length === 1 ? 'dit artikel' : 'deze artikelen'} in de lijst hieronder.</div>` : ''}
      <div class="card"><h2>Verloop van de voorraadwaarde</h2>
        ${legenda([['res', 'Voorraadwaarde aan het eind van de maand']])}
        ${lijnen('verloop', punten.map((p) => p.l), [{ kl: 'res', waarden: reeks }], 260)}
        ${eerste ? `<p class="small muted" style="margin-top:8px">De voorraad wordt in deze app bijgehouden sinds ${dn(eerste)}. Vóór die datum staat de lijn op nul.</p>` : ''}
      </div>
      <div class="cols-2">
        <div class="card"><h2>Per leverancier</h2>${tabel(groepeer((r) => r.a.leveranciers?.naam || 'Zonder leverancier'), 'Leverancier')}</div>
        <div class="card"><h2>Per soort artikel</h2>${tabel(groepeer((r) => SOORT_ARTIKEL[r.a.soort] || 'Onbekend'), 'Soort')}</div>
      </div>
      <div class="card"><h2>Artikelen op voorraad op ${dn(dag)}<span class="spacer"></span><span class="muted small" style="font-weight:400">${rijen.length} artikelen, hoogste waarde eerst</span></h2>
        <div class="table-wrap"><table class="list"><thead><tr><th>Artikel</th><th>Naam</th><th>Leverancier</th><th class="num">Aantal</th><th class="num">Inkoopprijs per stuk</th><th class="num">Waarde</th></tr></thead><tbody>
          ${toon.map((r) => `<tr><td><a href="#/artikel/${r.id}">${esc(r.a.artikelnummer || '')}</a></td><td>${esc(r.a.naam || '')}</td><td>${esc(r.a.leveranciers?.naam || '')}</td><td class="num ${r.aantal < 0 ? 'neg' : ''}">${n0(r.aantal)}</td><td class="num">${r.prijs === null ? '<span class="badge orange">Onbekend</span>' : money(r.prijs)}${r.schatting ? ' <span class="badge" title="Dollarorder nog niet betaald: omgerekend met een geschatte koers">schatting</span>' : ''}</td><td class="num"><b>${money(r.waarde)}</b></td></tr>`).join('')}
          <tr class="tot"><td>Totaal</td><td></td><td></td><td class="num">${n0(stuks)}</td><td></td><td class="num">${money(waarde)}</td></tr></tbody></table></div>
        ${rijen.length > toon.length ? `<div class="meer"><button class="btn" id="alles">Toon alle ${rijen.length} artikelen</button></div>` : ''}
      </div>`;
    const al = $('#alles', c); if (al) al.onclick = () => { toonAlles = true; teken(); };
  };

  koppelZweef(c, () => tips);
  $('#datum', c).addEventListener('change', () => { toonAlles = false; teken(); });
  c.addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (b) { $('#datum', c).value = b.dataset.d; toonAlles = false; teken(); } });

  // ---- voorraadlijst van de gekozen datum als bestand (opent in Excel) ----
  $('#download', c).onclick = () => {
    const dag = $('#datum', c).value || vandaag();
    if (!huidige.length) return toast('Op deze datum ligt er niets op voorraad', 'error');
    const g = (x) => (x === null || x === undefined || x === '' ? '' : String(Number(x)).replace('.', ','));
    const cel = (x) => { const t = String(x ?? '').replace(/\r?\n/g, ' '); return /[;"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const kop = ['Artikelnummer', 'Naam', 'Soort', 'Omzetgroep', 'Lengte (cm)', 'Breedte (cm)', 'Leverancier', 'Aantal', 'Inkoopprijs per stuk (EUR)', 'Voorraadwaarde (EUR)'];
    const rijen = [...huidige].sort((x, y) => String(x.a.artikelnummer).localeCompare(String(y.a.artikelnummer), 'nl', { numeric: true }))
      .map((r) => [`="${r.a.artikelnummer ?? ''}"`, r.a.naam, SOORT_ARTIKEL[r.a.soort], r.a.omzetgroep, g(r.a.lengte_cm), g(r.a.breedte_cm), r.a.leveranciers?.naam, g(r.aantal), g(r.prijs), g(r.waarde)]);
    const tot = ['Totaal', '', '', '', '', '', '', g(r2(huidige.reduce((t, r) => t + r.aantal, 0))), '', g(r2(totaal(huidige)))];
    const csv = '﻿' + [[`Voorraadwaarde Koreman, stand op ${dn(dag)}`], kop, ...rijen, tot].map((r) => r.map(cel).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `voorraadwaarde-koreman-${dag}.csv`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(`Voorraadlijst van ${dn(dag)} gedownload (${rijen.length} artikelen)`, 'ok');
  };
  teken();
}
