import {
  sb, check, esc, money, num, datum, $, on, toast, modal, confirmBox, formFields, readForm,
  PO_STATUS, badge, artikelPicker, artikelKiezer, loadImages, setTitle, withTotals, vandaag, isImage, refresh, klantOpt, levOpt, comboHtml, alles, klantKiezerHtml, klantKiezerInit, klantKiezerWaarde , bewaakFormulier} from '../ui.js?v=20261121172428';
import { metRegels, ikKaart } from '../orderkaart.js?v=20261121172428';

// =============================== LIJST ===============================
export async function renderList(c, _p, query) {
  setTitle('Inkooporders');
  const levs = check(await sb.from('leveranciers').select('id, naam, nummer, land, valuta').order('naam'));
  c.innerHTML = `
    <div class="page-head"><h1>Inkooporders</h1><span class="spacer"></span>
      <button class="btn primary" id="nieuw"><i data-lucide="plus"></i> Nieuwe inkooporder</button></div>
    <div class="toolbar">
      <input type="search" id="q" placeholder="Zoek op nummer of referentie…">
      <select id="status"><option value="open">Alle open</option><option value="">Alles</option>
        ${Object.entries(PO_STATUS).map(([k, [l]]) => `<option value="${k}" ${query.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      ${comboHtml({ name: 'lev', id: 'lev', options: levs.map(levOpt), empty: 'Alle leveranciers' })}
    </div>
    <div id="tbl"></div>`;

  let lijstRows = [], toon = 24;
  const teken = async () => {
    const rows = lijstRows.slice(0, toon);
    await Promise.all([withTotals(rows.filter((r) => !r._t), 'v_inkooporder_totalen', 'inkooporder_id'), metRegels(rows, 'inkooporder_regels', 'inkooporder_id')]);
    $('#tbl', c).innerHTML = rows.length ? `<p class="ord-samen">${lijstRows.length} inkooporder${lijstRows.length === 1 ? '' : 's'}</p>
      <div class="art-grid ord-grid">${rows.map(ikKaart).join('')}</div>
      ${lijstRows.length > toon ? `<button type="button" class="db-meer" id="meer">Toon meer (nog ${lijstRows.length - toon})</button>` : ''}`
      : '<div class="card"><p class="empty">Geen inkooporders gevonden.</p></div>';
    loadImages($('#tbl', c));
    const m = $('#meer', c); if (m) m.onclick = () => { toon += 24; teken(); };
  };
  const load = async () => {
    const st = $('#status', c).value;
    const s = $('#q', c).value.trim().replace(/[%,()]/g, '');
    const rows = await alles(() => {
      let q = sb.from('inkooporders').select('id, ordernummer, status, orderdatum, leverdatum, voor_wie, referentie, valuta, leveranciers(naam), klanten(naam), verkooporders(id, orderbev_nummer, offertenummer, klanten(naam))').order('orderdatum', { ascending: false }).order('ordernummer', { ascending: false });
      if (st === 'open') q = q.not('status', 'in', '(ontvangen,geannuleerd)'); else if (st) q = q.eq('status', st);
      if ($('#lev input', c).value) q = q.eq('leverancier_id', $('#lev input', c).value);
      if (s) q = /^\d+$/.test(s) ? q.eq('ordernummer', Number(s)) : q.ilike('referentie', `%${s}%`);
      return q;
    });
    lijstRows = rows; toon = 24;
    await teken();
  };
  const nieuw = async () => {
    const klanten = check(await sb.from('klanten').select('id, naam, nummer, postcode_plaats').eq('actief', true).order('naam'));
    const id = await modal({
      title: 'Nieuwe inkooporder',
      body: formFields([
        { name: 'leverancier_id', label: 'Leverancier *', type: 'combo', required: true, placeholder: 'Kies…', options: levs.map(levOpt), default: query.leverancier },
        { name: 'voor_wie', label: 'Voor wie?', type: 'select', options: { voorraad: 'Eigen voorraad', klant: 'In opdracht van klant / architect' } },
        { name: 'klant_id', label: 'Klant / architect (intern, niet op PO)', type: 'combo', empty: '– geen –', options: klanten.map(klantOpt) },
        { name: 'referentie', label: 'Referentie op PO (bv. projectcode)', hint: 'De leverancier ziet alleen deze referentie, nooit de klantnaam' },
      ]),
      submitLabel: 'Aanmaken',
      onOpen: (form) => klantVeld(form),
      onSubmit: async (v) => {
        if (v.voor_wie !== 'klant') v.klant_id = null;
        const lev = levs.find((l) => String(l.id) === v.leverancier_id);
        const inst = check(await sb.from('instellingen').select('afleveradres_inkoop').eq('id', 1).single());
        return check(await sb.from('inkooporders').insert({
          ...v, leverancier_id: Number(v.leverancier_id), klant_id: v.klant_id ? Number(v.klant_id) : null,
          valuta: lev.valuta, afleveradres: inst.afleveradres_inkoop,
        }).select('id').single()).id;
      },
    });
    if (id) location.hash = '#/inkoop/' + id;
  };
  $('#nieuw', c).onclick = nieuw;
  let t; $('#q', c).addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
  ['#status', '#lev'].forEach((s) => $(s, c).addEventListener('change', load));
  await load();
  if (query.nieuw) { history.replaceState(null, '', '#/inkoop'); nieuw(); }
}

const STAPPEN = ['concept', 'verstuurd', 'bevestigd', 'in_productie', 'verzonden', 'ontvangen'];

// Toon het klantveld alleen als de order in opdracht van een klant is
function klantVeld(form) {
  const veld = form.querySelector('[name=klant_id]')?.closest('.field');
  if (!veld) return;
  const sync = () => { veld.style.display = form.voor_wie.value === 'klant' ? '' : 'none'; };
  form.voor_wie.addEventListener('change', sync);
  sync();
}

// =============================== DETAIL ===============================
export async function renderDetail(c, [id]) {
  const reload = refresh;
  const po = check(await sb.from('inkooporders').select('*, leveranciers(*), klanten(id, naam), verkooporders(id, orderbev_nummer, offertenummer, klant_id)').eq('id', id).single());
  setTitle(`Inkooporder ${po.ordernummer}`);
  const [levs, klanten, regels, betalingen, kosten] = await Promise.all([
    sb.from('leveranciers').select('id, naam, nummer, land, valuta').order('naam'),
    sb.from('klanten').select('id, naam, nummer, postcode_plaats').order('naam'),
    sb.from('inkooporder_regels').select('*, artikelen(id, artikelnummer, naam, design_id, foto_pad, designs(hoofdfoto_pad, design_code_lev))').eq('inkooporder_id', id).order('volgorde').order('id'),
    sb.from('inkoop_betalingen').select('*').eq('inkooporder_id', id).order('datum'),
    sb.from('inkoop_kosten').select('*').eq('inkooporder_id', id).order('datum'),
  ]).then((r) => r.map(check));

  // beschikbare foto's per design
  const designIds = [...new Set(regels.map((r) => r.artikelen?.design_id).filter(Boolean))];
  const files = designIds.length ? check(await sb.from('design_bestanden').select('design_id, pad, bestandsnaam, soort').in('design_id', designIds)) : [];
  // foto van de regel; niets gekozen → foto van het artikel of het design; '' = bewust geen foto
  const regelFoto = (r) => (r.foto_pad === '' ? '' : r.foto_pad || r.artikelen?.foto_pad || r.artikelen?.designs?.hoofdfoto_pad || '');
  const fotoOpties = (r) => {
    const opts = [];
    if (r.artikelen?.foto_pad) opts.push([r.artikelen.foto_pad, 'Foto artikel']);
    if (r.artikelen?.designs?.hoofdfoto_pad && r.artikelen.designs.hoofdfoto_pad !== r.artikelen.foto_pad) opts.push([r.artikelen.designs.hoofdfoto_pad, 'Foto design']);
    files.filter((f) => f.design_id === r.artikelen?.design_id && isImage(f.pad) && !opts.some((o) => o[0] === f.pad)).forEach((f) => opts.push([f.pad, `${f.soort}: ${f.bestandsnaam}`]));
    if (r.foto_pad && !opts.some((o) => o[0] === r.foto_pad)) opts.push([r.foto_pad, 'Huidige foto']);
    return opts;
  };

  // aanbetaling gekoppelde verkooporder
  let aanbetaald = null;
  if (po.verkooporder_id) {
    const b = check(await sb.from('verkoop_betalingen').select('bedrag').eq('verkooporder_id', po.verkooporder_id));
    aanbetaald = b.reduce((s, x) => s + Number(x.bedrag), 0);
  }
  const cur = po.valuta;
  const totaal = regels.reduce((s, r) => s + r.aantal * r.prijs, 0);
  const betaald = betalingen.reduce((s, b) => s + Number(b.bedrag), 0);
  const betaaldEur = betalingen.reduce((s, b) => s + Number(b.bedrag_eur), 0);

  // ---- tijdlijn: wat is wanneer gebeurd ----
  const tijdlijn = [];
  const gebeurd = (d, tekst, icoon = 'circle') => { if (d) tijdlijn.push({ d: String(d).slice(0, 10), tekst, icoon }); };
  gebeurd(po.aangemaakt_op, po.bron === 'ione' ? 'Overgenomen uit IOne' : 'Inkooporder aangemaakt', 'plus');
  gebeurd(po.verstuurd_op, 'Verstuurd naar leverancier', 'send');
  gebeurd(po.bevestigd_op, 'Bevestigd door leverancier', 'check');
  let loopBet = 0; let volBet = false;
  [...betalingen].sort((x, y) => String(x.datum).localeCompare(String(y.datum))).forEach((b) => {
    loopBet += Number(b.bedrag);
    gebeurd(b.datum, `Betaald aan leverancier: ${money(b.bedrag, po.valuta)}`, 'banknote');
    if (!volBet && totaal > 0 && loopBet >= totaal - 0.005) { volBet = true; gebeurd(b.datum, 'Volledig betaald', 'badge-check'); }
  });
  gebeurd(po.ontvangen_op, 'Alles ontvangen', 'package-check');
  tijdlijn.sort((x, y) => x.d.localeCompare(y.d));
  const kostenEur = kosten.reduce((s, k) => s + Number(k.bedrag_eur), 0);
  const isConcept = po.status === 'concept';
  const geenAanbetaling = po.verkooporder_id && !aanbetaald;

  c.innerHTML = `
    <div class="page-head"><a class="btn small" href="#/inkoop"><i data-lucide="arrow-left"></i> Inkooporders</a>
      <h1>Inkooporder ${po.ordernummer}</h1>${badge(PO_STATUS, po.status)}<span class="spacer"></span>
      ${po.verkooporder_id ? `<a class="btn" href="#/verkoop/${po.verkooporder_id}"><i data-lucide="receipt"></i> Verkooporder ${po.verkooporders?.orderbev_nummer || po.verkooporders?.offertenummer || ''}</a>`
        : po.status !== 'geannuleerd' ? '<button class="btn" id="maakso"><i data-lucide="file-plus"></i> Verkooporder maken</button>' : ''}
      <a class="btn" href="#/doc/po/${po.id}" target="_blank"><i data-lucide="file-text"></i> Document / PDF</a>
      <button class="btn primary" id="mail"><i data-lucide="mail"></i> Mail naar leverancier</button>
    </div>
    ${geenAanbetaling ? `<div class="warnbox">Deze inkooporder hoort bij <a href="#/verkoop/${po.verkooporder_id}">verkooporder ${po.verkooporders?.orderbev_nummer || ''}</a>, maar daar is <b>nog geen aanbetaling</b> ontvangen. Verstuur pas na ontvangst van de aanbetaling.</div>` : ''}
    ${po.verkooporder_id && aanbetaald ? `<div class="help">Gekoppeld aan <a href="#/verkoop/${po.verkooporder_id}">verkooporder ${po.verkooporders?.orderbev_nummer || ''}</a> · aanbetaling ontvangen: ${money(aanbetaald)}</div>` : ''}

    <div class="card"><h2>Status<span class="spacer"></span>
        ${po.status !== 'geannuleerd' ? '<button class="btn small danger" data-status="geannuleerd">Annuleren</button>' : '<span class="badge red">Geannuleerd</span>'}
        ${isConcept && !betalingen.length ? '<button class="btn small danger" id="del"><i data-lucide="trash-2"></i> Verwijderen</button>' : ''}</h2>
      <div class="stepper">${STAPPEN.map((k, i) => { const nu = STAPPEN.indexOf(po.status); const cls = nu < 0 ? 'todo' : i < nu ? 'done' : i === nu ? 'cur' : 'todo';
        return `<button class="stp ${cls}" data-status="${k}" title="Zet status op: ${PO_STATUS[k][0]}"><span class="stp-dot">${cls === 'done' ? '<i data-lucide="check"></i>' : i + 1}</span><span class="stp-lbl">${PO_STATUS[k][0]}</span></button>`; }).join('')}</div>
      <p class="small muted" style="margin-top:12px">Klik op een stap om de status te wijzigen. De datum wordt vastgelegd in de tijdlijn.</p>
    </div>

    <div class="card"><h2>Regels</h2>
      <div class="lines">
      ${regels.length ? regels.map((r) => { const opts = fotoOpties(r); const rest = r.aantal - r.aantal_ontvangen; return `<div class="line" data-regel="${r.id}">
        <div class="line-foto">${regelFoto(r) ? `<img data-path="${esc(regelFoto(r))}" alt="">` : '<span class="line-nofoto"><i data-lucide="image-off"></i></span>'}
          ${opts.length ? `<select data-f="foto_pad" title="Foto op de inkooporder"><option value="">Geen foto</option>${opts.map(([p, l]) => `<option value="${esc(p)}" ${p === regelFoto(r) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}</div>
        <div class="line-main">
          <div class="line-kop">${r.artikelen ? `<a href="#/artikel/${r.artikelen.id}" class="line-nr">${r.artikelen.artikelnummer}</a><span class="line-naam">${esc(r.artikelen.naam)}</span>${r.artikelen.designs?.design_code_lev ? `<span class="badge blue">Design ${esc(r.artikelen.designs.design_code_lev)}</span>` : ''}` : '<span class="line-naam muted">Vrije regel</span>'}</div>
          <label class="line-lbl">Omschrijving op de inkooporder (Engels)<textarea data-f="omschrijving" rows="2">${esc(r.omschrijving || '')}</textarea></label>
          ${r.notitie ? `<p class="line-notitie" title="Interne notitie, staat niet op de inkooporder"><i data-lucide="sticky-note"></i> ${esc(r.notitie)}</p>` : ''}
        </div>
        <div class="line-nums">
          <label class="line-lbl">Aantal<input type="number" step="any" data-f="aantal" value="${r.aantal}"></label>
          <label class="line-lbl">Prijs (${cur})<input type="number" step="0.01" data-f="prijs" value="${r.prijs}"></label>
          <div class="line-lbl">Totaal<b class="line-tot">${money(r.aantal * r.prijs, cur)}</b></div>
        </div>
        <div class="line-side">
          ${rest <= 0 ? '<span class="badge green">Ontvangen</span>' : r.aantal_ontvangen > 0 ? `<span class="badge orange">${num(r.aantal_ontvangen)} van ${num(r.aantal)} ontvangen</span>` : '<span class="badge">Nog niet ontvangen</span>'}
          ${rest > 0 && po.status !== 'geannuleerd' ? `<button class="btn small ok-soft" data-ontvang="${r.id}" data-rest="${rest}"><i data-lucide="package-check"></i> Ontvangst boeken</button>` : ''}
          ${r.aantal_ontvangen > 0 ? '' : `<button class="line-del" data-delregel="${r.id}" title="Regel verwijderen" aria-label="Regel verwijderen"><i data-lucide="trash-2"></i></button>`}
        </div></div>`; }).join('') : '<p class="empty">Nog geen regels. Zoek hieronder een artikel om toe te voegen.</p>'}
      </div>
      <div class="add-line">
        <div class="search"><i data-lucide="search"></i><input id="zoek" placeholder="Artikel toevoegen: klik om te zoeken en te kiezen…" autocomplete="off"></div>
        <button class="btn" id="vrij"><i data-lucide="plus"></i> Vrije regel</button>
      </div>
      <div class="totals"><div class="strong"><span>Totaal</span><span>${money(totaal, cur)}</span></div></div>
    </div>

    <div class="cols-2">
    <div class="card"><h2>Betalingen aan leverancier<span class="spacer"></span><button class="btn small primary" id="betaling"><i data-lucide="plus"></i> Betaling</button></h2>
      ${betalingen.length ? `<table class="list"><thead><tr><th>Datum</th><th>Omschrijving</th><th class="num">Bedrag (${cur})</th>${cur === 'USD' ? '<th class="num">Afgeschreven (€)</th><th class="num">Koers</th>' : ''}<th></th></tr></thead><tbody>
      ${betalingen.map((b) => `<tr><td>${datum(b.datum)}</td><td>${esc(b.omschrijving || '')}</td><td class="num">${money(b.bedrag, cur)}</td>
        ${cur === 'USD' ? `<td class="num">${money(b.bedrag_eur)}</td><td class="num">${(b.bedrag_eur / b.bedrag).toFixed(4)}</td>` : ''}
        <td><button class="btn small danger" data-delbet="${b.id}"><i data-lucide="trash-2"></i></button></td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">Nog niets betaald.</p>'}
      <div class="kv" style="margin-top:12px">
        <div><span>Ordertotaal</span><b>${money(totaal, cur)}</b></div>
        <div><span>Betaald</span><b>${money(betaald, cur)}${cur === 'USD' ? ` (= ${money(betaaldEur)})` : ''}</b></div>
        <div><span>Nog te betalen</span><b>${money(totaal - betaald, cur)}</b></div>
      </div>
      ${cur === 'USD' ? '<p class="small muted">De voorraadwaarde wordt berekend met het werkelijk afgeschreven eurobedrag.</p>' : ''}
    </div>

    <div class="card"><h2>Bijkomende kosten (vracht, invoerrechten…)<span class="spacer"></span><button class="btn small" id="kost"><i data-lucide="plus"></i> Kosten</button></h2>
      <p class="small muted">Alleen ter registratie – telt <b>niet</b> mee in de voorraadwaarde.</p>
      ${kosten.length ? `<table class="list"><thead><tr><th>Datum</th><th>Soort</th><th>Omschrijving</th><th class="num">Bedrag (€)</th><th></th></tr></thead><tbody>
      ${kosten.map((k) => `<tr><td>${datum(k.datum)}</td><td>${esc(k.soort)}</td><td>${esc(k.omschrijving || '')}</td><td class="num">${money(k.bedrag_eur)}</td><td><button class="btn small danger" data-delkost="${k.id}"><i data-lucide="trash-2"></i></button></td></tr>`).join('')}
      </tbody></table>` : ''}
      ${kosten.length ? `<div class="totals"><div class="strong"><span>Totaal kosten</span><span>${money(kostenEur)}</span></div></div>` : ''}
    </div>
    </div>

    <div class="card"><h2>Tijdlijn</h2>
      ${tijdlijn.length ? `<ol class="tijdlijn">${tijdlijn.map((t) => `<li><span class="tl-ic"><i data-lucide="${t.icoon}"></i></span><span class="tl-d">${datum(t.d)}</span><span>${esc(t.tekst)}</span></li>`).join('')}</ol>` : '<p class="muted">Nog niets vastgelegd.</p>'}
      <p class="small muted" style="margin-top:12px">Datums worden automatisch ingevuld als je de status wijzigt. Aanpassen of toevoegen kan bij Gegevens.</p>
    </div>

    <form class="card" id="kop"><h2>Gegevens</h2>
      ${formFields([
        { name: 'leverancier_id', label: 'Leverancier', type: 'combo', options: levs.map(levOpt) },
        { name: 'orderdatum', label: 'Orderdatum', type: 'date' },
        { name: 'leverdatum', label: 'Leverdatum (op PO, Engels)' },
        { name: 'voor_wie', label: 'Voor wie?', type: 'select', options: { voorraad: 'Eigen voorraad', klant: 'In opdracht van klant / architect' } },
        { name: 'klant_id', label: 'Klant / architect (alleen intern)', type: 'combo', empty: '– geen –', options: klanten.map(klantOpt) },
        { name: 'referentie', label: 'Referentie (staat op PO)', hint: 'Leverancier ziet nooit de klantnaam' },
        { name: 'valuta', label: 'Valuta', type: 'select', options: { EUR: 'Euro (€)', USD: 'Dollar ($)' } },
        ...(cur === 'USD' ? [{ name: 'koers_schatting', label: 'Schattingskoers (€ per $1)', type: 'number', step: '0.000001', hint: 'Alleen voor voorraadwaarde tot er betaald is' }] : []),
        { name: 'verstuurd_op', label: 'Verstuurd op', type: 'date' },
        { name: 'bevestigd_op', label: 'Bevestigd op', type: 'date' },
        { name: 'ontvangen_op', label: 'Ontvangen op', type: 'date' },
        { name: 'afleveradres', label: 'Afleveradres (op PO)', type: 'textarea' },
        { name: 'opmerking_lev', label: 'Opmerking voor leverancier (op PO, Engels)', type: 'textarea' },
        { name: 'notities_intern', label: 'Interne notities (niet op PO)', type: 'textarea' },
      ], { ...po, verstuurd_op: po.verstuurd_op ? String(po.verstuurd_op).slice(0, 10) : '' })}
      <div class="btn-row" style="margin-top:12px"><button class="btn primary">Opslaan</button>
        ${cur === 'USD' ? '<button class="btn" type="button" id="ecb">ECB-dagkoers ophalen</button>' : ''}</div>
    </form>`;
  loadImages(c);
  klantVeld($('#kop', c));

  // ---- kop opslaan ----
  $('#kop', c).onsubmit = async (e) => {
    e.preventDefault();
    const v = readForm(e.target);
    v.leverancier_id = Number(v.leverancier_id);
    v.klant_id = v.voor_wie === 'klant' && v.klant_id ? Number(v.klant_id) : null;
    check(await sb.from('inkooporders').update(v).eq('id', po.id));
    toast('Opgeslagen', 'ok'); reload();
  };
  bewaakFormulier($('#kop', c), c);
  $('#ecb', c)?.addEventListener('click', async () => {
    try {
      const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR').then((x) => x.json());
      $('#kop', c).koers_schatting.value = r.rates.EUR;
      toast(`ECB-koers ${r.date}: €${r.rates.EUR} per $1 – klik Opslaan`);
    } catch { toast('Koers ophalen mislukt', 'error'); }
  });

  // ---- status ----
  const zetStatus = async (status) => {
    if (status === 'verstuurd' && geenAanbetaling && !await confirmBox('Er is nog geen aanbetaling ontvangen op de gekoppelde verkooporder. Toch als verstuurd markeren?', 'Toch versturen')) return;
    const upd = { status };
    if (status === 'verstuurd' && !po.verstuurd_op) upd.verstuurd_op = new Date().toISOString();
    check(await sb.from('inkooporders').update(upd).eq('id', po.id));
    toast('Status bijgewerkt', 'ok'); reload();
  };
  on(c, 'click', '[data-status]', (_e, b) => zetStatus(b.dataset.status));
  $('#del', c)?.addEventListener('click', async () => {
    if (!await confirmBox(`Inkooporder ${po.ordernummer} verwijderen?`, 'Verwijderen')) return;
    check(await sb.from('verkooporder_regels').update({ inkoopregel_id: null }).in('inkoopregel_id', regels.map((r) => r.id).concat([0])));
    check(await sb.from('inkooporders').delete().eq('id', po.id));
    location.hash = '#/inkoop';
  });

  // ---- verkooporder maken vanuit deze inkooporder ----
  $('#maakso', c)?.addEventListener('click', async () => {
    if (!regels.length) { toast('Voeg eerst regels toe aan de inkooporder', 'error'); return; }
    const actief = check(await sb.from('klanten').select('id, naam, nummer, postcode_plaats').eq('actief', true).order('naam'));
    const soId = await modal({
      title: 'Verkooporder maken van deze inkooporder',
      body: `<p>De ${regels.length} regel${regels.length === 1 ? '' : 's'} worden overgenomen op een nieuwe verkooporder en aan deze inkooporder gekoppeld.
        De verkoopprijs komt van het artikel; je kunt hem daarna aanpassen.</p>` + klantKiezerHtml(actief, po.klant_id) + '<p class="small muted">De leverancier ziet de klantnaam niet; die staat nooit op de inkooporder.</p>',
      submitLabel: 'Verkooporder maken',
      onOpen: klantKiezerInit,
      onSubmit: async (v, form) => { const k = await klantKiezerWaarde(v, form, actief); return check(await sb.rpc('maak_verkooporder_voor_inkoop', { p_po: po.id, p_klant: k.id })); },
    });
    if (soId) { toast('Verkooporder aangemaakt', 'ok'); location.hash = '#/verkoop/' + soId; }
  });

  // ---- mailen ----
  $('#mail', c).onclick = async () => {
    if (geenAanbetaling && !await confirmBox('Er is nog geen aanbetaling ontvangen op de gekoppelde verkooporder. Toch mailen?', 'Toch mailen')) return;
    const email = po.leveranciers?.email || '';
    const ok = await modal({
      title: 'Mail naar leverancier',
      body: `<ol><li>Er opent een nieuw tabblad met de inkooporder; de PDF wordt automatisch gedownload.</li>
        <li>Je mailprogramma opent met een kant-en-klare mail aan <b>${esc(email || '(geen e-mailadres bekend)')}</b>.</li>
        <li>Voeg de gedownloade PDF toe als bijlage en verstuur.</li></ol>
        <p class="small muted">De status wordt op "Verstuurd" gezet.</p>`,
      submitLabel: 'Doorgaan',
      onSubmit: () => true,
    });
    if (!ok) return;
    window.open(`#/doc/po/${po.id}?pdf=1`, '_blank');
    const subject = `Purchase order ${po.ordernummer}${po.referentie ? ' – ref. ' + po.referentie : ''} – Koreman`;
    const body = `Dear ${po.leveranciers?.contactpersoon || 'Sir/Madam'},\n\nPlease find attached our purchase order ${po.ordernummer}.\nKindly confirm the order and the expected delivery date.\n\nKind regards,\nKoreman Exclusive Carpets`;
    setTimeout(() => { location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; }, 600);
    if (po.status === 'concept') {
      check(await sb.from('inkooporders').update({ status: 'verstuurd', verstuurd_op: new Date().toISOString() }).eq('id', po.id));
      setTimeout(reload, 1500);
    }
  };

  // ---- regels ----
  artikelKiezer($('#zoek', c), async (a) => {
    const oms = [a.naam, a.omschrijving, a.designs?.design_code_lev ? 'Design: ' + a.designs.design_code_lev : null].filter(Boolean).join('\n');
    check(await sb.from('inkooporder_regels').insert({
      inkooporder_id: po.id, artikel_id: a.id, omschrijving: oms, aantal: 1, prijs: a.inkoopprijs || 0,
      foto_pad: a.foto_pad || a.designs?.hoofdfoto_pad || null, volgorde: regels.length,
    }));
    reload();
  });
  $('#vrij', c).onclick = async () => {
    check(await sb.from('inkooporder_regels').insert({ inkooporder_id: po.id, omschrijving: '', aantal: 1, prijs: 0, volgorde: regels.length }));
    reload();
  };
  on(c, 'change', '[data-regel] [data-f]', async (_e, el) => {
    const rid = el.closest('[data-regel]').dataset.regel;
    const f = el.dataset.f;
    let val = el.value;
    if (f === 'aantal' || f === 'prijs') val = Number(val);
    if (f === 'foto_pad' && !val) val = ''; // '' = bewust geen foto op deze regel
    check(await sb.from('inkooporder_regels').update({ [f]: val }).eq('id', rid));
    if (f !== 'omschrijving') reload(); else toast('Opgeslagen', 'ok');
  });
  on(c, 'click', '[data-delregel]', async (_e, b) => {
    if (!await confirmBox('Regel verwijderen?', 'Verwijderen')) return;
    check(await sb.from('verkooporder_regels').update({ inkoopregel_id: null }).eq('inkoopregel_id', b.dataset.delregel));
    check(await sb.from('inkooporder_regels').delete().eq('id', b.dataset.delregel));
    reload();
  });
  on(c, 'click', '[data-ontvang]', async (_e, b) => {
    const rest = Number(b.dataset.rest);
    const ok = await modal({
      title: 'Ontvangst boeken',
      body: `<p>Hoeveel stuks zijn binnengekomen? Ze worden bij de voorraad opgeteld.</p>` +
        formFields([{ name: 'aantal', label: `Aantal (max ${num(rest)})`, type: 'number', default: rest, required: true }]),
      submitLabel: 'Ontvangst boeken',
      onSubmit: async (v) => { check(await sb.rpc('ontvang_inkoopregel', { p_regel: Number(b.dataset.ontvang), p_aantal: v.aantal })); },
    });
    if (ok) { toast('Ontvangst geboekt, voorraad bijgewerkt', 'ok'); reload(); }
  });

  // ---- betalingen ----
  $('#betaling', c).onclick = async () => {
    const ok = await modal({
      title: 'Betaling aan leverancier',
      body: formFields([
        { name: 'datum', label: 'Datum', type: 'date', default: vandaag() },
        { name: 'bedrag', label: `Bedrag (${cur})`, type: 'number', step: '0.01', required: true, default: (totaal - betaald).toFixed(2) },
        ...(cur === 'USD' ? [{ name: 'bedrag_eur', label: 'Werkelijk afgeschreven in euro (€)', type: 'number', step: '0.01', required: true, hint: 'Zie je bankafschrift – dit telt voor de voorraadwaarde' }] : []),
        { name: 'omschrijving', label: 'Omschrijving', placeholder: 'bv. aanbetaling 50% / restbetaling' },
      ]),
      onSubmit: async (v) => {
        if (cur === 'EUR') v.bedrag_eur = v.bedrag;
        check(await sb.from('inkoop_betalingen').insert({ ...v, inkooporder_id: po.id }));
      },
    });
    if (ok) { toast('Betaling vastgelegd', 'ok'); reload(); }
  };
  on(c, 'click', '[data-delbet]', async (_e, b) => {
    if (!await confirmBox('Betaling verwijderen?', 'Verwijderen')) return;
    check(await sb.from('inkoop_betalingen').delete().eq('id', b.dataset.delbet)); reload();
  });
  $('#kost', c).onclick = async () => {
    const ok = await modal({
      title: 'Bijkomende kosten',
      body: formFields([
        { name: 'datum', label: 'Datum', type: 'date', default: vandaag() },
        { name: 'soort', label: 'Soort', type: 'select', options: { vracht: 'Vracht', invoerrechten: 'Invoerrechten', inklaring: 'Inklaring', verzekering: 'Verzekering', overig: 'Overig' } },
        { name: 'bedrag_eur', label: 'Bedrag (€)', type: 'number', step: '0.01', required: true },
        { name: 'omschrijving', label: 'Omschrijving' },
      ]),
      onSubmit: async (v) => { check(await sb.from('inkoop_kosten').insert({ ...v, inkooporder_id: po.id })); },
    });
    if (ok) reload();
  };
  on(c, 'click', '[data-delkost]', async (_e, b) => {
    check(await sb.from('inkoop_kosten').delete().eq('id', b.dataset.delkost)); reload();
  });
}
