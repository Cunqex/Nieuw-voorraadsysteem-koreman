// Rapportage: omzet per periode, vergeleken met dezelfde periode een jaar eerder.
import { sb, esc, money, $, setTitle, alles, vandaag } from '../ui.js?v=20261117141822';

const MAAND = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const jaarTerug = (s) => { const [j, m, d] = s.split('-').map(Number); return iso(new Date(j - 1, m - 1, Math.min(d, new Date(j - 1, m, 0).getDate()))); };
const kort = (n) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} mln` : Math.abs(n) >= 1000 ? `${Math.round(n / 1000).toLocaleString('nl-NL')}k` : Math.round(n).toLocaleString('nl-NL'));

function periode(keuze, van, tot) {
  const nu = new Date(); const j = nu.getFullYear(); const m = nu.getMonth();
  if (keuze === 'maand') return [iso(new Date(j, m, 1)), iso(new Date(j, m + 1, 0))];
  if (keuze === 'kwartaal') { const k = Math.floor(m / 3) * 3; return [iso(new Date(j, k, 1)), iso(new Date(j, k + 3, 0))]; }
  if (keuze === 'vorigjaar') return [`${j - 1}-01-01`, `${j - 1}-12-31`];
  if (keuze === '12m') return [iso(new Date(j, m - 11, 1)), iso(new Date(j, m + 1, 0))];
  if (keuze === 'totnu') return [`${j}-01-01`, vandaag()];
  if (keuze === 'eigen' && van && tot) return van <= tot ? [van, tot] : [tot, van];
  return [`${j}-01-01`, `${j}-12-31`];
}

// Gegroepeerde staven: deze periode naast een jaar eerder
function stavenGrafiek(labels, nu, toen, lblNu, lblToen) {
  const W = 960; const H = 300; const L = 56; const R = 8; const T = 12; const B = 34;
  const max = Math.max(1, ...nu, ...toen);
  const stap = 10 ** Math.floor(Math.log10(max)); const top = Math.ceil(max / stap) * stap;
  const lijnen = top / stap <= 2 ? 4 : top / stap <= 5 ? top / stap : 5;
  const bw = (W - L - R) / labels.length; const sw = Math.min(26, bw * 0.36);
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const staaf = (x, v, kl, titel) => `<rect class="${kl}" x="${x.toFixed(1)}" y="${y(Math.max(v, 0)).toFixed(1)}" width="${sw.toFixed(1)}" height="${Math.max(0, H - B - y(Math.max(v, 0))).toFixed(1)}" rx="3"><title>${esc(titel)}</title></rect>`;
  const om = Math.ceil(labels.length / 16);
  return `<div class="legenda"><span><i class="nu"></i>${esc(lblNu)}</span><span><i class="toen"></i>${esc(lblToen)}</span></div>
  <svg class="grafiek" viewBox="0 0 ${W} ${H}" role="img" aria-label="Omzet per periode, vergeleken met een jaar eerder">
    ${Array.from({ length: lijnen + 1 }, (_, i) => { const v = (top / lijnen) * i; return `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="raster"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="as">${kort(v)}</text>`; }).join('')}
    ${labels.map((l, i) => { const cx = L + bw * i + bw / 2;
      return `${staaf(cx - sw - 1.5, toen[i], 'toen', `${l} ${lblToen}: ${money(toen[i])}`)}${staaf(cx + 1.5, nu[i], 'nu', `${l} ${lblNu}: ${money(nu[i])}`)}
        ${i % om === 0 ? `<text x="${cx}" y="${H - 12}" text-anchor="middle" class="as">${esc(l)}</text>` : ''}`; }).join('')}
  </svg>`;
}

// Liggende balken met vergelijking
function balken(rijen, lblToen) {
  if (!rijen.length) return '<p class="muted">Geen verkopen in deze periode.</p>';
  const max = Math.max(...rijen.map((r) => Math.max(r.nu, r.toen)), 1);
  return `<div class="balken">${rijen.map((r) => `<div class="balk-rij">
    <span class="balk-naam" title="${esc(r.naam)}">${esc(r.naam)}</span>
    <span class="balk-spoor"><i class="nu" style="width:${Math.max(0, (r.nu / max) * 100).toFixed(1)}%"></i><i class="toen" style="width:${Math.max(0, (r.toen / max) * 100).toFixed(1)}%" title="${esc(lblToen)}: ${money(r.toen)}"></i></span>
    <span class="balk-bedrag">${money(r.nu)}<small>${r.toen ? money(r.toen) : '–'}</small></span></div>`).join('')}</div>`;
}

const verschil = (nu, toen) => {
  if (!toen) return nu ? '<span class="delta">geen omzet een jaar eerder</span>' : '<span class="delta">–</span>';
  const p = ((nu - toen) / Math.abs(toen)) * 100;
  return `<span class="delta ${p >= 0 ? 'op' : 'neer'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toLocaleString('nl-NL', { maximumFractionDigits: 1 })}% t.o.v. een jaar eerder</span>`;
};

export async function render(c) {
  setTitle('Rapportage');
  c.innerHTML = `
    <div class="page-head"><h1>Rapportage</h1></div>
    <div class="toolbar">
      <select id="periode" aria-label="Periode">
        <option value="totnu">Dit jaar tot vandaag</option><option value="jaar">Heel dit jaar</option><option value="kwartaal">Dit kwartaal</option><option value="maand">Deze maand</option>
        <option value="12m">Laatste 12 maanden</option><option value="vorigjaar">Vorig jaar</option><option value="eigen">Zelf kiezen…</option>
      </select>
      <span id="eigen" hidden style="display:none;gap:8px;align-items:center"><input type="date" id="van" aria-label="Van"> t/m <input type="date" id="tot" aria-label="Tot en met"></span>
      <select id="btw" aria-label="Bedragen"><option value="excl">Bedragen excl. btw</option><option value="incl">Bedragen incl. btw</option></select>
      <span class="spacer"></span><span class="muted small" id="bereik"></span>
    </div>
    <div id="inhoud"><p class="muted">Gegevens laden…</p></div>`;

  // ---- alles één keer ophalen, daarna rekenen in de browser ----
  const [orders, totalen, regels, inkoop, inkoopTot] = await Promise.all([
    alles(() => sb.from('verkooporders').select('id, orderdatum, status, btw_regeling, prijzen_incl_btw, klant_id, klanten(naam)').not('status', 'in', '(offerte,geannuleerd)').order('id')),
    alles(() => sb.from('v_verkooporder_totalen').select('verkooporder_id, netto, totaal').order('verkooporder_id')),
    alles(() => sb.from('verkooporder_regels').select('id, verkooporder_id, aantal, prijs, korting_pct, artikelen(omzetgroep, soort)').order('id')),
    alles(() => sb.from('inkooporders').select('id, orderdatum, status, valuta').neq('status', 'geannuleerd').order('id')),
    alles(() => sb.from('v_inkooporder_totalen').select('inkooporder_id, totaal').order('inkooporder_id')),
  ]);
  const tot = new Map(totalen.map((t) => [t.verkooporder_id, t]));
  const ordMap = new Map(orders.map((o) => [o.id, o]));
  const poTot = new Map(inkoopTot.map((t) => [t.inkooporder_id, Number(t.totaal)]));

  const teken = () => {
    const keuze = $('#periode', c).value; const incl = $('#btw', c).value === 'incl';
    const [van, tm] = periode(keuze, $('#van', c).value, $('#tot', c).value);
    const [van0, tm0] = [jaarTerug(van), jaarTerug(tm)];
    const lblNu = 'Deze periode'; const lblToen = 'Een jaar eerder';
    const dn = (s) => s.split('-').reverse().join('-');
    $('#bereik', c).textContent = `${dn(van)} t/m ${dn(tm)}, vergeleken met ${dn(van0)} t/m ${dn(tm0)}`;
    const bedrag = (o) => Number(tot.get(o.id)?.[incl ? 'totaal' : 'netto'] || 0);
    const inP = (d, a, b) => d >= a && d <= b;
    const nuO = orders.filter((o) => inP(o.orderdatum, van, tm)); const toenO = orders.filter((o) => inP(o.orderdatum, van0, tm0));
    const som = (l) => l.reduce((s, o) => s + bedrag(o), 0);
    const omzet = som(nuO); const omzet0 = som(toenO);
    const poSom = (a, b) => inkoop.filter((p) => inP(p.orderdatum, a, b)).reduce((s, p) => s + (poTot.get(p.id) || 0), 0);
    const ink = poSom(van, tm); const ink0 = poSom(van0, tm0);

    // tijdvakken: per dag bij een korte periode, anders per maand
    const dagen = (new Date(tm) - new Date(van)) / 864e5 + 1;
    const perDag = dagen <= 45;
    const vakken = []; const start = new Date(van);
    if (perDag) for (let i = 0; i < dagen; i++) { const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i); vakken.push({ k: iso(d), l: `${d.getDate()} ${MAAND[d.getMonth()]}` }); }
    else for (let d = new Date(start.getFullYear(), start.getMonth(), 1); iso(d) <= tm; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) vakken.push({ k: iso(d).slice(0, 7), l: `${MAAND[d.getMonth()]}${dagen > 366 || start.getFullYear() !== new Date(tm).getFullYear() ? ` '${String(d.getFullYear()).slice(2)}` : ''}` });
    const sleutel = (datum, jaarErbij) => { const s = jaarErbij ? `${Number(datum.slice(0, 4)) + 1}${datum.slice(4)}` : datum; return perDag ? s : s.slice(0, 7); };
    const reeks = (lijst, jaarErbij) => { const m = new Map(); lijst.forEach((o) => { const k = sleutel(o.orderdatum, jaarErbij); m.set(k, (m.get(k) || 0) + bedrag(o)); }); return vakken.map((v) => m.get(v.k) || 0); };

    // per jaar (alle jaren)
    const perJaar = new Map(); orders.forEach((o) => { const j = o.orderdatum.slice(0, 4); perJaar.set(j, (perJaar.get(j) || 0) + bedrag(o)); });
    const jaren = [...perJaar.keys()].sort(); const maxJ = Math.max(1, ...perJaar.values());

    // top klanten en productgroepen
    const groepeer = (lijst, sleutelFn, waardeFn) => { const m = new Map(); lijst.forEach((x) => { const k = sleutelFn(x); m.set(k, (m.get(k) || 0) + waardeFn(x)); }); return m; };
    const kNu = groepeer(nuO, (o) => o.klant_id, bedrag); const kToen = groepeer(toenO, (o) => o.klant_id, bedrag);
    const naamVan = new Map(orders.map((o) => [o.klant_id, o.klanten?.naam || 'Onbekend']));
    const topKlanten = [...kNu.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, v]) => ({ naam: naamVan.get(id), nu: v, toen: kToen.get(id) || 0 }));
    const regelBedrag = (r) => {
      const o = ordMap.get(r.verkooporder_id); const b = r.aantal * r.prijs * (1 - r.korting_pct / 100); const nl = o.btw_regeling === 'nl21';
      return incl ? (nl && !o.prijzen_incl_btw ? b * 1.21 : b) : (nl && o.prijzen_incl_btw ? b / 1.21 : b);
    };
    const groepNaam = (r) => { const g = r.artikelen?.omzetgroep; return !g ? 'Zonder groep' : /^\d+$/.test(g) ? `Groep ${g}` : g; };
    const rNu = regels.filter((r) => { const o = ordMap.get(r.verkooporder_id); return o && inP(o.orderdatum, van, tm); });
    const rToen = regels.filter((r) => { const o = ordMap.get(r.verkooporder_id); return o && inP(o.orderdatum, van0, tm0); });
    const gNu = groepeer(rNu, groepNaam, regelBedrag); const gToen = groepeer(rToen, groepNaam, regelBedrag);
    const topGroepen = [...gNu.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([naam, v]) => ({ naam, nu: v, toen: gToen.get(naam) || 0 }));

    const kpi = (lbl, waarde, d) => `<div class="stat kpi"><div class="num">${waarde}</div><div class="lbl">${lbl}</div>${d}</div>`;
    $('#inhoud', c).innerHTML = `
      <div class="stats">
        ${kpi(`Omzet ${incl ? 'incl.' : 'excl.'} btw`, money(omzet), verschil(omzet, omzet0))}
        ${kpi('Aantal orders', nuO.length.toLocaleString('nl-NL'), verschil(nuO.length, toenO.length))}
        ${kpi('Gemiddelde orderwaarde', money(nuO.length ? omzet / nuO.length : 0), verschil(nuO.length ? omzet / nuO.length : 0, toenO.length ? omzet0 / toenO.length : 0))}
        ${kpi('Inkoop (bestellingen)', money(ink), verschil(ink, ink0))}
      </div>
      <div class="card"><h2>Omzet per ${perDag ? 'dag' : 'maand'}</h2>
        ${stavenGrafiek(vakken.map((v) => v.l), reeks(nuO, false), reeks(toenO, true), lblNu, lblToen)}
        <details class="small" style="margin-top:8px"><summary>Cijfers als tabel</summary>
          <table class="list" style="margin-top:8px"><thead><tr><th>${perDag ? 'Dag' : 'Maand'}</th><th class="num">${lblNu}</th><th class="num">${lblToen}</th><th class="num">Verschil</th></tr></thead><tbody>
          ${vakken.map((v, i) => { const a = reeks(nuO, false)[i]; const b = reeks(toenO, true)[i]; return `<tr><td>${esc(v.l)}</td><td class="num">${money(a)}</td><td class="num">${money(b)}</td><td class="num">${money(a - b)}</td></tr>`; }).join('')}
          <tr><td><b>Totaal</b></td><td class="num"><b>${money(omzet)}</b></td><td class="num"><b>${money(omzet0)}</b></td><td class="num"><b>${money(omzet - omzet0)}</b></td></tr></tbody></table></details>
      </div>
      <div class="cols-2">
        <div class="card"><h2>Top 10 klanten</h2>${balken(topKlanten, lblToen)}</div>
        <div class="card"><h2>Omzet per productgroep</h2>${balken(topGroepen, lblToen)}</div>
      </div>
      <div class="card"><h2>Omzet per jaar</h2>
        <div class="jaren">${jaren.map((j) => `<div class="jaar"><span class="jaar-bedrag">${kort(perJaar.get(j))}</span><i style="height:${Math.max(2, (perJaar.get(j) / maxJ) * 140).toFixed(0)}px" title="${j}: ${money(perJaar.get(j))}"></i><span class="as">${j}</span></div>`).join('')}</div>
        <p class="small muted" style="margin-top:12px">Het lopende jaar is nog niet compleet. Een order telt mee op zijn orderdatum; offertes en geannuleerde orders tellen niet mee.</p>
      </div>`;
  };

  $('#periode', c).addEventListener('change', () => {
    const eigen = $('#periode', c).value === 'eigen'; const el = $('#eigen', c);
    el.hidden = !eigen; el.style.display = eigen ? 'inline-flex' : 'none';
    if (eigen && !$('#van', c).value) { $('#van', c).value = `${new Date().getFullYear()}-01-01`; $('#tot', c).value = vandaag(); }
    teken();
  });
  ['#btw', '#van', '#tot'].forEach((s) => $(s, c).addEventListener('change', teken));
  teken();
}
