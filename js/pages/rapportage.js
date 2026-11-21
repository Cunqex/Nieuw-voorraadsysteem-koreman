// Rapportage: inkomsten en uitgaven per periode, vergeleken met dezelfde periode een jaar eerder.
import { sb, esc, money, $, setTitle, alles, vandaag, toast } from '../ui.js?v=20261121154619';

const MAAND = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const jaarTerug = (s) => { const [j, m, d] = s.split('-').map(Number); return iso(new Date(j - 1, m - 1, Math.min(d, new Date(j - 1, m, 0).getDate()))); };
const jaarVerder = (s) => `${Number(s.slice(0, 4)) + 1}${s.slice(4)}`;
const kort = (n) => { const a = Math.abs(n); const t = a >= 1e6 ? `${(a / 1e6).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} mln` : a >= 10000 ? `${Math.round(a / 1000).toLocaleString('nl-NL')}k` : a >= 1000 ? `${(a / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 1 })}k` : Math.round(a).toLocaleString('nl-NL'); return (n < 0 ? '−' : '') + t; };
const r2 = (x) => Math.round(x * 100) / 100;
const dn = (s) => s.split('-').reverse().join('-');

function periode(keuze, van, tot) {
  const nu = new Date(); const j = nu.getFullYear(); const m = nu.getMonth();
  if (keuze === 'maand') return [iso(new Date(j, m, 1)), iso(new Date(j, m + 1, 0))];
  if (keuze === 'vorigemaand') return [iso(new Date(j, m - 1, 1)), iso(new Date(j, m, 0))];
  if (keuze === 'kwartaal') { const k = Math.floor(m / 3) * 3; return [iso(new Date(j, k, 1)), iso(new Date(j, k + 3, 0))]; }
  if (keuze === 'vorigjaar') return [`${j - 1}-01-01`, `${j - 1}-12-31`];
  if (keuze === '12m') return [iso(new Date(j, m - 11, 1)), iso(new Date(j, m + 1, 0))];
  if (keuze === 'jaar') return [`${j}-01-01`, `${j}-12-31`];
  if (keuze === 'eigen' && van && tot) return van <= tot ? [van, tot] : [tot, van];
  return [`${j}-01-01`, vandaag()];
}

// ---------- grafieken (SVG, één as, zweeftekst per tijdvak) ----------
let W = 960; const L = 58; const R = 10; const T = 14; const B = 32;
function schaal(waarden, H) {
  const max = Math.max(1, ...waarden); const min = Math.min(0, ...waarden);
  const bereik = max - min; const ruw = bereik / 4; const macht = 10 ** Math.floor(Math.log10(ruw)); const stap = [1, 2, 2.5, 5, 10].map((f) => f * macht).find((s) => s >= ruw);
  const top = Math.ceil(max / stap) * stap; const bodem = Math.floor(min / stap) * stap;
  const y = (v) => T + (H - T - B) * (1 - (v - bodem) / (top - bodem));
  const ticks = []; for (let v = bodem; v <= top + stap / 2; v += stap) ticks.push(v);
  return { y, ticks };
}
const raster = (s) => s.ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${s.y(v).toFixed(1)}" y2="${s.y(v).toFixed(1)}" class="${v === 0 ? 'nul' : 'raster'}"/><text x="${L - 8}" y="${(s.y(v) + 4).toFixed(1)}" text-anchor="end" class="as">${kort(v)}</text>`).join('');
const asLabels = (labels, bw, H) => { const om = Math.ceil(labels.length / (W < 700 ? 8 : 14)); return labels.map((l, i) => (i % om === 0 ? `<text x="${(L + bw * i + bw / 2).toFixed(1)}" y="${H - 10}" text-anchor="middle" class="as">${esc(l)}</text>` : '')).join(''); };
const vlak = (i, bw, H) => `<rect class="raak" data-i="${i}" x="${(L + bw * i).toFixed(1)}" y="${T}" width="${bw.toFixed(1)}" height="${H - T - B}"/>`;
const legenda = (items) => `<div class="legenda">${items.map(([kl, t]) => `<span><i class="${kl}"></i>${esc(t)}</span>`).join('')}</div>`;

// Staven naast elkaar. reeksen: [{ kl, waarden }]
function staven(id, labels, reeksen, H = 280, breedte = 960) {
  W = breedte;
  const s = schaal(reeksen.flatMap((r) => r.waarden), H); const bw = (W - L - R) / labels.length;
  const n = reeksen.length; const sw = Math.min(24, (bw * 0.7) / n); const groep = sw * n + 2 * (n - 1);
  return `<svg class="grafiek" data-grafiek="${id}" viewBox="0 0 ${W} ${H}" role="img">${raster(s)}
    ${labels.map((_, i) => reeksen.map((r, k) => { const v = r.waarden[i]; const y0 = s.y(0); const y1 = s.y(v); const h = Math.abs(y1 - y0);
      return h < 0.5 ? '' : `<rect class="${r.kl}" x="${(L + bw * i + (bw - groep) / 2 + k * (sw + 2)).toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${sw.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(3, h / 2).toFixed(1)}"/>`; }).join('')).join('')}
    ${asLabels(labels, bw, H)}${labels.map((_, i) => vlak(i, bw, H)).join('')}</svg>`;
}
// Lijnen. reeksen: [{ kl, waarden }]
function lijnen(id, labels, reeksen, H = 240) {
  W = 960;
  const s = schaal(reeksen.flatMap((r) => r.waarden), H); const bw = (W - L - R) / labels.length;
  const x = (i) => L + bw * i + bw / 2;
  return `<svg class="grafiek" data-grafiek="${id}" viewBox="0 0 ${W} ${H}" role="img">${raster(s)}
    ${reeksen.map((r) => `<polyline class="lijn ${r.kl}" points="${r.waarden.map((v, i) => `${x(i).toFixed(1)},${s.y(v).toFixed(1)}`).join(' ')}"/>${labels.length <= 31 ? r.waarden.map((v, i) => `<circle class="punt ${r.kl}" cx="${x(i).toFixed(1)}" cy="${s.y(v).toFixed(1)}" r="3.5"/>`).join('') : ''}`).join('')}
    ${asLabels(labels, bw, H)}${labels.map((_, i) => vlak(i, bw, H)).join('')}</svg>`;
}

const delta = (nu, toen, omgekeerd) => {
  if (!toen) return '<span class="delta">geen cijfer een jaar eerder</span>';
  const p = ((nu - toen) / Math.abs(toen)) * 100; const goed = omgekeerd ? p <= 0 : p >= 0;
  return `<span class="delta ${goed ? 'op' : 'neer'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toLocaleString('nl-NL', { maximumFractionDigits: 1 })}%</span>`;
};

export async function render(c) {
  setTitle('Rapportage');
  c.innerHTML = `
    <div class="page-head"><h1>Inkomsten en uitgaven</h1></div>
    <div class="toolbar">
      <select id="periode" aria-label="Periode">
        <option value="totnu">Dit jaar tot vandaag</option><option value="jaar">Heel dit jaar</option><option value="kwartaal">Dit kwartaal</option><option value="maand">Deze maand</option><option value="vorigemaand">Vorige maand</option>
        <option value="12m">Laatste 12 maanden</option><option value="vorigjaar">Vorig jaar</option><option value="eigen">Zelf kiezen…</option>
      </select>
      <span id="eigen" style="display:none;gap:8px;align-items:center"><input type="date" id="van" aria-label="Van"> t/m <input type="date" id="tot" aria-label="Tot en met"></span>
      <select id="basis" aria-label="Wat telt mee">
        <option value="order">Wat is verkocht en besteld</option><option value="kas">Wat is echt ontvangen en betaald</option>
      </select>
      <span class="spacer"></span><span class="muted small" id="bereik"></span>
    </div>
    <div id="inhoud"><p class="muted">Gegevens laden…</p></div>
    <div class="zweef" id="zweef" hidden></div>`;

  // ---- alles één keer ophalen, daarna rekenen in de browser ----
  const [orders, soTot, soBet, pos, poTot, poBet, kosten, reinig] = await Promise.all([
    alles(() => sb.from('verkooporders').select('id, orderdatum, status, bron').not('status', 'in', '(offerte,geannuleerd)').order('id')),
    alles(() => sb.from('v_verkooporder_totalen').select('verkooporder_id, netto, totaal, betaald').order('verkooporder_id')),
    alles(() => sb.from('verkoop_betalingen').select('verkooporder_id, datum, bedrag').order('id')),
    alles(() => sb.from('inkooporders').select('id, orderdatum, status, bron, valuta, leveranciers(naam)').neq('status', 'geannuleerd').order('id')),
    alles(() => sb.from('v_inkooporder_totalen').select('inkooporder_id, totaal, betaald, betaald_eur').order('inkooporder_id')),
    alles(() => sb.from('inkoop_betalingen').select('inkooporder_id, datum, bedrag_eur').order('id')),
    alles(() => sb.from('inkoop_kosten').select('inkooporder_id, datum, soort, bedrag_eur').order('id')),
    alles(() => sb.from('reinigingen').select('id, status, datum_binnen, factuur_datum, naar_reiniger_op, betaald_op, kosten_reiniger, leveranciers(naam), reiniging_regels(prijs, reparatie_prijs)').neq('status', 'geannuleerd').order('id')),
  ]);
  const soT = new Map(soTot.map((t) => [t.verkooporder_id, t])); const soMap = new Map(orders.map((o) => [o.id, o]));
  const poT = new Map(poTot.map((t) => [t.inkooporder_id, t])); const poMap = new Map(pos.map((p) => [p.id, p]));
  const KOSTEN = { vracht: 'Vracht', invoerrechten: 'Invoerrechten', inklaring: 'Inklaring', verzekering: 'Verzekering', overig: 'Overige kosten' };
  const rnTotaal = (r) => (r.reiniging_regels || []).reduce((s, x) => s + Number(x.prijs || 0) + Number(x.reparatie_prijs || 0), 0);

  // Boekingen: { d: datum, b: bedrag excl. btw, g: groep }
  const boekingen = (basis) => {
    const ink = []; const uit = [];
    if (basis === 'order') {
      orders.forEach((o) => ink.push({ d: o.orderdatum, b: Number(soT.get(o.id)?.netto || 0), g: 'Verkoop tapijten' }));
      reinig.forEach((r) => ink.push({ d: r.factuur_datum || r.datum_binnen, b: rnTotaal(r) / 1.21, g: 'Reiniging' }));
      pos.forEach((p) => { const t = poT.get(p.id) || {}; uit.push({ d: p.orderdatum, b: p.valuta === 'EUR' ? Number(t.totaal || 0) : Number(t.betaald_eur || 0), g: 'Inkoop', lev: p.leveranciers?.naam || 'Onbekend' }); });
    } else {
      soBet.forEach((b) => { const o = soMap.get(b.verkooporder_id); const t = soT.get(b.verkooporder_id); if (!o || !t) return; const f = Number(t.totaal) ? Number(t.netto) / Number(t.totaal) : 1; ink.push({ d: b.datum, b: Number(b.bedrag) * f, g: 'Verkoop tapijten' }); });
      reinig.filter((r) => r.betaald_op).forEach((r) => ink.push({ d: r.betaald_op, b: rnTotaal(r) / 1.21, g: 'Reiniging' }));
      poBet.forEach((b) => { const p = poMap.get(b.inkooporder_id); if (p) uit.push({ d: b.datum, b: Number(b.bedrag_eur), g: 'Inkoop', lev: p.leveranciers?.naam || 'Onbekend' }); });
    }
    kosten.forEach((k) => { if (poMap.has(k.inkooporder_id)) uit.push({ d: k.datum, b: Number(k.bedrag_eur), g: KOSTEN[k.soort] || 'Overige kosten' }); });
    reinig.filter((r) => Number(r.kosten_reiniger)).forEach((r) => uit.push({ d: r.naar_reiniger_op || r.datum_binnen, b: Number(r.kosten_reiniger), g: 'Reiniging (uitbesteed)', lev: r.leveranciers?.naam }));
    return { ink, uit };
  };

  let tips = {}; // per grafiek: zweeftekst per tijdvak
  const teken = () => {
    const keuze = $('#periode', c).value; const basis = $('#basis', c).value;
    const [van, tm] = periode(keuze, $('#van', c).value, $('#tot', c).value);
    const [van0, tm0] = [jaarTerug(van), jaarTerug(tm)];
    $('#bereik', c).textContent = `${dn(van)} t/m ${dn(tm)} · vergeleken met ${dn(van0)} t/m ${dn(tm0)} · excl. btw`;
    const { ink, uit } = boekingen(basis);
    const inP = (x, a, b) => x.d && x.d >= a && x.d <= b;
    const som = (l) => l.reduce((s, x) => s + x.b, 0);
    const iNu = ink.filter((x) => inP(x, van, tm)); const iToen = ink.filter((x) => inP(x, van0, tm0));
    const uNu = uit.filter((x) => inP(x, van, tm)); const uToen = uit.filter((x) => inP(x, van0, tm0));
    const I = som(iNu); const I0 = som(iToen); const U = som(uNu); const U0 = som(uToen); const Res = I - U; const Res0 = I0 - U0;
    const marge = I ? (Res / I) * 100 : 0; const marge0 = I0 ? (Res0 / I0) * 100 : 0;

    // tijdvakken: per dag bij een korte periode, anders per maand
    const dagen = Math.round((new Date(tm) - new Date(van)) / 864e5) + 1; const perDag = dagen <= 45; const start = new Date(van);
    const vakken = [];
    if (perDag) for (let i = 0; i < dagen; i++) { const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i); vakken.push({ k: iso(d), l: `${d.getDate()} ${MAAND[d.getMonth()]}` }); }
    else for (let d = new Date(start.getFullYear(), start.getMonth(), 1); iso(d) <= tm; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) vakken.push({ k: iso(d).slice(0, 7), l: `${MAAND[d.getMonth()]}${start.getFullYear() !== new Date(tm).getFullYear() ? ` '${String(d.getFullYear()).slice(2)}` : ''}` });
    const reeks = (lijst, eerder) => { const m = new Map(); lijst.forEach((x) => { const s = eerder ? jaarVerder(x.d) : x.d; const k = perDag ? s : s.slice(0, 7); m.set(k, (m.get(k) || 0) + x.b); }); return vakken.map((v) => r2(m.get(v.k) || 0)); };
    const rI = reeks(iNu); const rU = reeks(uNu); const rI0 = reeks(iToen, true); const rU0 = reeks(uToen, true);
    const rRes = rI.map((v, i) => r2(v - rU[i])); const rRes0 = rI0.map((v, i) => r2(v - rU0[i]));
    const opgeteld = (r) => { let s = 0; return r.map((v) => r2(s += v)); };
    const cRes = opgeteld(rRes); const cRes0 = opgeteld(rRes0);
    const labels = vakken.map((v) => v.l);

    const rij = (kl, naam, v) => `<div><span><i class="${kl}"></i>${naam}</span><b>${money(v)}</b></div>`;
    tips = {
      beide: labels.map((l, i) => `<b>${esc(l)}</b>${rij('ink', 'Inkomsten', rI[i])}${rij('uit', 'Uitgaven', rU[i])}<div class="tip-som"><span>Resultaat</span><b>${money(rRes[i])}</b></div>`),
      ink: labels.map((l, i) => `<b>${esc(l)}</b>${rij('ink', 'Deze periode', rI[i])}${rij('toen', 'Een jaar eerder', rI0[i])}<div class="tip-som"><span>Verschil</span><b>${money(rI[i] - rI0[i])}</b></div>`),
      uit: labels.map((l, i) => `<b>${esc(l)}</b>${rij('uit', 'Deze periode', rU[i])}${rij('toen', 'Een jaar eerder', rU0[i])}<div class="tip-som"><span>Verschil</span><b>${money(rU[i] - rU0[i])}</b></div>`),
      res: labels.map((l, i) => `<b>t/m ${esc(l)}</b>${rij('res', 'Deze periode', cRes[i])}${rij('toen', 'Een jaar eerder', cRes0[i])}`),
    };

    // waar het vandaan komt en heen gaat
    const groepeer = (lijst, fn) => { const m = new Map(); lijst.forEach((x) => { const k = fn(x); m.set(k, (m.get(k) || 0) + x.b); }); return m; };
    const tabel = (nuM, toenM, kl, max = 8) => {
      const namen = [...new Set([...nuM.keys(), ...toenM.keys()])].sort((a, b) => (nuM.get(b) || 0) - (nuM.get(a) || 0) || (toenM.get(b) || 0) - (toenM.get(a) || 0));
      const top = namen.slice(0, max); const rest = namen.slice(max);
      const rijen = top.map((n) => [n, nuM.get(n) || 0, toenM.get(n) || 0]);
      if (rest.length) rijen.push([`Overig (${rest.length})`, rest.reduce((s, n) => s + (nuM.get(n) || 0), 0), rest.reduce((s, n) => s + (toenM.get(n) || 0), 0)]);
      const mx = Math.max(1, ...rijen.map((r) => r[1]));
      const tNu = rijen.reduce((s, r) => s + r[1], 0); const tToen = rijen.reduce((s, r) => s + r[2], 0);
      return rijen.length ? `<table class="list rap-tbl"><thead><tr><th>Post</th><th></th><th class="num">Deze periode</th><th class="num">Een jaar eerder</th></tr></thead><tbody>
        ${rijen.map(([n, a, b]) => `<tr><td>${esc(n)}</td><td class="rap-balk"><i class="${kl}" style="width:${Math.max(0, (a / mx) * 100).toFixed(1)}%"></i></td><td class="num"><b>${money(a)}</b></td><td class="num muted">${b ? money(b) : '–'}</td></tr>`).join('')}
        <tr class="tot"><td>Totaal</td><td></td><td class="num">${money(tNu)}</td><td class="num">${money(tToen)}</td></tr></tbody></table>` : '<p class="muted">Niets in deze periode.</p>';
    };
    const uGroep = (x) => (x.g === 'Inkoop' ? `Inkoop · ${x.lev}` : x.g);

    // openstaand (stand van nu, los van de gekozen periode)
    const teOntv = orders.filter((o) => o.status !== 'betaald').map((o) => Number(soT.get(o.id)?.totaal || 0) - Number(soT.get(o.id)?.betaald || 0)).filter((v) => v > 0.005);
    const rnOpen = reinig.filter((r) => !r.betaald_op).map(rnTotaal).filter((v) => v > 0);
    const teBet = pos.filter((p) => p.bron !== 'ione').map((p) => Number(poT.get(p.id)?.totaal || 0) - Number(poT.get(p.id)?.betaald || 0)).filter((v) => v > 0.005);

    const kpi = (kl, lbl, waarde, toen, d, uitleg) => `<div class="rap-kpi ${kl}"><span class="rap-lbl">${lbl}</span><b class="rap-num">${waarde}</b>
      <span class="rap-sub">${d} <span class="muted">${toen}</span></span>${uitleg ? `<span class="rap-uitleg">${uitleg}</span>` : ''}</div>`;
    const leeg = !ink.length && !uit.length;
    $('#inhoud', c).innerHTML = `
      ${basis === 'kas' ? '<div class="help" style="margin-bottom:16px">Je ziet nu wat er echt is ontvangen en betaald, op de datum van de betaling. Bij orders uit IOne is alleen bekend wat klanten betaald hebben; betalingen aan leveranciers staan er pas in vanaf het moment dat je ze in deze app vastlegt.</div>' : ''}
      <div class="rap-kpis">
        ${kpi('ink', 'Inkomsten', money(I), `was ${money(I0)}`, delta(I, I0), basis === 'order' ? 'Verkoop en reiniging' : 'Ontvangen van klanten')}
        ${kpi('uit', 'Uitgaven', money(U), `was ${money(U0)}`, delta(U, U0, true), basis === 'order' ? 'Inkoop, vracht en invoer' : 'Betaald aan leveranciers')}
        ${kpi(Res >= 0 ? 'plus' : 'min', 'Resultaat', money(Res), `was ${money(Res0)}`, delta(Res, Res0), 'Inkomsten min uitgaven')}
        ${kpi('', 'Blijft over van elke euro', I ? `${marge.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}%` : '–', I0 ? `was ${marge0.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}%` : '', I && I0 ? `<span class="delta ${marge >= marge0 ? 'op' : 'neer'}">${marge >= marge0 ? '▲' : '▼'} ${Math.abs(marge - marge0).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} punt</span>` : '', 'Resultaat als deel van de inkomsten')}
      </div>
      ${leeg ? '<div class="card"><p class="empty">Er zijn nog geen orders om te tonen. Importeer eerst de gegevens uit IOne (Instellingen) of maak een order aan.</p></div>' : `
      <div class="card"><h2>Inkomsten en uitgaven per ${perDag ? 'dag' : 'maand'}</h2>
        ${legenda([['ink', 'Inkomsten'], ['uit', 'Uitgaven']])}
        ${staven('beide', labels, [{ kl: 'ink', waarden: rI }, { kl: 'uit', waarden: rU }], 300)}
      </div>
      <div class="cols-2">
        <div class="card"><h2>Inkomsten naast een jaar eerder</h2>${legenda([['ink', 'Deze periode'], ['toen', 'Een jaar eerder']])}${staven('ink', labels, [{ kl: 'toen', waarden: rI0 }, { kl: 'ink', waarden: rI }], 250, 560)}</div>
        <div class="card"><h2>Uitgaven naast een jaar eerder</h2>${legenda([['uit', 'Deze periode'], ['toen', 'Een jaar eerder']])}${staven('uit', labels, [{ kl: 'toen', waarden: rU0 }, { kl: 'uit', waarden: rU }], 250, 560)}</div>
      </div>
      <div class="card"><h2>Resultaat opgeteld door de periode heen</h2>
        ${legenda([['res', 'Deze periode'], ['toen', 'Een jaar eerder']])}
        ${lijnen('res', labels, [{ kl: 'toen', waarden: cRes0 }, { kl: 'res', waarden: cRes }])}
        <p class="small muted" style="margin-top:8px">De lijn telt per ${perDag ? 'dag' : 'maand'} het resultaat op. Ligt de donkere lijn boven de grijze, dan sta je er beter voor dan een jaar geleden.</p>
      </div>
      <div class="cols-2">
        <div class="card"><h2>Waar de inkomsten vandaan komen</h2>${tabel(groepeer(iNu, (x) => x.g), groepeer(iToen, (x) => x.g), 'ink')}</div>
        <div class="card"><h2>Waar het geld heen gaat</h2>${tabel(groepeer(uNu, uGroep), groepeer(uToen, uGroep), 'uit')}</div>
      </div>
      <div class="card"><h2>Nog openstaand <span class="muted small" style="font-weight:400">· stand van vandaag</span></h2>
        <div class="rap-open">
          <div><span class="rap-lbl">Nog te ontvangen van klanten</span><b class="rap-num">${money(teOntv.reduce((s, v) => s + v, 0) + rnOpen.reduce((s, v) => s + v, 0))}</b><span class="small muted">${teOntv.length} verkooporder${teOntv.length === 1 ? '' : 's'}${rnOpen.length ? ` en ${rnOpen.length} reiniging${rnOpen.length === 1 ? '' : 'en'}` : ''} · incl. btw</span><a class="small" href="#/verkoop">Naar verkooporders</a></div>
          <div><span class="rap-lbl">Nog te betalen aan leveranciers</span><b class="rap-num">${money(teBet.reduce((s, v) => s + v, 0))}</b><span class="small muted">${teBet.length} inkooporder${teBet.length === 1 ? '' : 's'} · orders uit IOne tellen hier niet mee</span><a class="small" href="#/inkoop">Naar inkooporders</a></div>
        </div>
      </div>
      <div class="card"><h2>Cijfers per ${perDag ? 'dag' : 'maand'}<span class="spacer"></span><button class="btn small" id="download"><i data-lucide="download"></i> Download als bestand</button></h2>
        <div class="table-wrap"><table class="list rap-cijfers"><thead><tr><th rowspan="2">${perDag ? 'Dag' : 'Maand'}</th><th colspan="3" class="mid">Deze periode</th><th colspan="3" class="mid">Een jaar eerder</th></tr>
          <tr><th class="num">Inkomsten</th><th class="num">Uitgaven</th><th class="num">Resultaat</th><th class="num">Inkomsten</th><th class="num">Uitgaven</th><th class="num">Resultaat</th></tr></thead><tbody>
          ${labels.map((l, i) => `<tr><td>${esc(l)}</td><td class="num">${money(rI[i])}</td><td class="num">${money(rU[i])}</td><td class="num"><b class="${rRes[i] < 0 ? 'neg' : ''}">${money(rRes[i])}</b></td><td class="num muted">${money(rI0[i])}</td><td class="num muted">${money(rU0[i])}</td><td class="num muted">${money(rRes0[i])}</td></tr>`).join('')}
          <tr class="tot"><td>Totaal</td><td class="num">${money(I)}</td><td class="num">${money(U)}</td><td class="num">${money(Res)}</td><td class="num">${money(I0)}</td><td class="num">${money(U0)}</td><td class="num">${money(Res0)}</td></tr></tbody></table></div>
      </div>`}
      <p class="small muted" style="margin:4px 4px 24px">Alle bedragen zijn exclusief btw. ${basis === 'order' ? 'Een verkoop telt mee op de orderdatum, een inkoop op de datum van de inkooporder. Offertes en geannuleerde orders tellen niet mee.' : ''} Vaste lasten zoals huur, personeel en energie staan niet in deze app en zitten dus niet in de uitgaven.</p>`;

    const dl = $('#download', c);
    if (dl) dl.onclick = () => {
      const g = (x) => String(r2(x)).replace('.', ',');
      const rijen = [[perDag ? 'Dag' : 'Maand', 'Inkomsten', 'Uitgaven', 'Resultaat', 'Inkomsten jaar eerder', 'Uitgaven jaar eerder', 'Resultaat jaar eerder'],
        ...labels.map((l, i) => [l, g(rI[i]), g(rU[i]), g(rRes[i]), g(rI0[i]), g(rU0[i]), g(rRes0[i])]), ['Totaal', g(I), g(U), g(Res), g(I0), g(U0), g(Res0)]];
      const url = URL.createObjectURL(new Blob(['﻿' + rijen.map((r) => r.join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = `inkomsten-uitgaven-${van}-tm-${tm}.csv`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000); toast('Bestand gedownload', 'ok');
    };
  };

  // ---- zweeftekst bij de grafieken ----
  const zweef = $('#zweef', c);
  c.addEventListener('mousemove', (e) => {
    const r = e.target.closest?.('.raak');
    if (!r) { zweef.hidden = true; return; }
    const id = r.closest('svg').dataset.grafiek;
    zweef.innerHTML = tips[id]?.[Number(r.dataset.i)] || ''; zweef.hidden = false;
    const br = zweef.offsetWidth; const x = e.clientX + 16 + br > window.innerWidth ? e.clientX - br - 16 : e.clientX + 16;
    zweef.style.left = `${Math.max(8, x)}px`; zweef.style.top = `${Math.max(8, e.clientY - zweef.offsetHeight - 12)}px`;
  });
  c.addEventListener('mouseleave', () => { zweef.hidden = true; });

  $('#periode', c).addEventListener('change', () => {
    const eigen = $('#periode', c).value === 'eigen'; $('#eigen', c).style.display = eigen ? 'inline-flex' : 'none';
    if (eigen && !$('#van', c).value) { $('#van', c).value = `${new Date().getFullYear()}-01-01`; $('#tot', c).value = vandaag(); }
    teken();
  });
  ['#basis', '#van', '#tot'].forEach((s) => $(s, c).addEventListener('change', teken));
  teken();
}
