import {
  sb, check, esc, money, num, datum, $, on, toast, modal, confirmBox, formFields, readForm,
  SO_STATUS, PO_STATUS, BTW, SOORT_ARTIKEL, badge, artikelPicker, setTitle, withTotals, vandaag, refresh, klantOpt, loadImages, alles, klantKiezerHtml, klantKiezerInit, klantKiezerWaarde,
} from '../ui.js?v=20261121123748';

// Orders waarvoor de klant ons nog geld schuldig kan zijn (offertes en geannuleerde/afgeronde orders tellen niet mee)
const OPEN_STATUS = ['bevestigd', 'geleverd', 'gefactureerd'];
const openBedrag = (r) => (OPEN_STATUS.includes(r.status) ? Math.max(0, Math.round(((Number(r._t?.totaal) || 0) - (Number(r._t?.betaald) || 0)) * 100) / 100) : 0);
async function openstaandeOrders(klantId) {
  const rows = await alles(() => {
    let q = sb.from('verkooporders').select('id, klant_id, status, orderdatum, offertenummer, orderbev_nummer, factuurnummer, klanten(naam)').in('status', OPEN_STATUS);
    if (klantId) q = q.eq('klant_id', klantId);
    return q;
  });
  await withTotals(rows, 'v_verkooporder_totalen', 'verkooporder_id');
  return rows.filter((r) => openBedrag(r) > 0.005);
}

const nrLabel = (s) => s.factuurnummer ? `Factuur ${s.factuurnummer}` : s.orderbev_nummer ? `Orderbevestiging ${s.orderbev_nummer}` : s.offertenummer ? `Offerte ${s.offertenummer}` : `Verkooporder (concept #${s.id})`;

// =============================== LIJST ===============================
export async function renderList(c, _p, query) {
  setTitle('Verkooporders');
  c.innerHTML = `
    <div class="page-head"><h1>Verkooporders</h1><span class="spacer"></span>
      <button class="btn primary" id="nieuw"><i data-lucide="plus"></i> Nieuwe verkooporder</button></div>
    <div class="help">Een verkooporder doorloopt: <b>offerte</b> → <b>orderbevestiging</b> (met aanbetaling) → <b>levering</b> → <b>factuur</b>.
      Artikelen die besteld moeten worden, krijgen bij het bevestigen automatisch een concept-inkooporder voor de leverancier.</div>
    <div class="toolbar">
      <div class="seg" style="display:flex;gap:4px"><button class="btn small" data-modus="orders">Orders</button><button class="btn small" data-modus="klanten"><i data-lucide="wallet"></i> Openstaand per klant</button></div>
      <input type="search" id="q" placeholder="Zoek op nummer, klant of referentie…">
      <select id="status"><option value="open">Alle open</option><option value="">Alles</option>
        ${Object.entries(SO_STATUS).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select>
    </div>
    <div id="klantfilter"></div>
    <div class="card flush"><div class="table-wrap" id="tbl"></div></div>`;
  let modus = query.modus === 'klanten' ? 'klanten' : 'orders';
  const klantFilter = query.klant_id ? Number(query.klant_id) : null;
  const zetModus = () => {
    c.querySelectorAll('[data-modus]').forEach((b) => b.classList.toggle('primary', b.dataset.modus === modus));
    $('#status', c).hidden = modus === 'klanten';
  };
  // ---- weergave: per klant hoeveel er nog openstaat ----
  const loadKlanten = async () => {
    const rows = await openstaandeOrders();
    const per = new Map();
    rows.forEach((r) => {
      const k = per.get(r.klant_id) || { id: r.klant_id, naam: r.klanten?.naam || '(onbekend)', orders: 0, open: 0, oudste: r.orderdatum };
      k.orders += 1; k.open += openBedrag(r); if (r.orderdatum && (!k.oudste || r.orderdatum < k.oudste)) k.oudste = r.orderdatum;
      per.set(r.klant_id, k);
    });
    const s = $('#q', c).value.trim().toLowerCase();
    const lijst = [...per.values()].filter((k) => !s || k.naam.toLowerCase().includes(s)).sort((a2, b2) => b2.open - a2.open);
    const tot = lijst.reduce((x, k) => x + k.open, 0);
    $('#tbl', c).innerHTML = lijst.length ? `<table class="list"><thead><tr><th>Klant</th><th class="num">Open orders</th><th>Oudste order</th><th class="num">Nog te betalen</th></tr></thead><tbody>
      ${lijst.map((k) => `<tr class="click" onclick="location.hash='#/verkoop?klant_id=${k.id}'"><td><b>${esc(k.naam)}</b></td><td class="num">${k.orders}</td><td>${datum(k.oudste)}</td><td class="num"><b>${money(k.open)}</b></td></tr>`).join('')}
      </tbody><tfoot><tr><td><b>Totaal</b> <span class="muted small">(${lijst.length} klant${lijst.length === 1 ? '' : 'en'})</span></td><td class="num">${lijst.reduce((x, k) => x + k.orders, 0)}</td><td></td><td class="num"><b>${money(tot)}</b></td></tr></tfoot></table>
      <p class="small muted" style="padding:10px 16px">Telt bevestigde, geleverde en gefactureerde orders waarop nog niet alles is betaald. Klik op een klant voor de orders.</p>`
      : '<p class="empty">Er staat bij geen enkele klant nog iets open.</p>';
  };
  const load = async () => {
    if (modus === 'klanten') return loadKlanten();
    const st = klantFilter ? '' : $('#status', c).value;
    let rows = await alles(() => {
      let q = sb.from('verkooporders').select('id, klant_id, offertenummer, orderbev_nummer, factuurnummer, status, orderdatum, klant_referentie, klanten(naam)').order('orderdatum', { ascending: false }).order('id', { ascending: false });
      if (klantFilter) q = q.eq('klant_id', klantFilter);
      if (st === 'open') q = q.not('status', 'in', '(betaald,geannuleerd)'); else if (st) q = q.eq('status', st);
      return q;
    });
    const s = $('#q', c).value.trim().toLowerCase();
    if (s) rows = rows.filter((r) => `${r.offertenummer} ${r.orderbev_nummer} ${r.factuurnummer} ${r.klanten?.naam} ${r.klant_referentie}`.toLowerCase().includes(s));
    const aantal = rows.length;
    rows = rows.slice(0, 400);
    await withTotals(rows, 'v_verkooporder_totalen', 'verkooporder_id');
    $('#tbl', c).innerHTML = rows.length ? `<table class="list"><thead><tr><th>Offerte</th><th>Orderbev.</th><th>Factuur</th><th>Klant</th><th>Referentie</th><th>Datum</th><th>Status</th><th class="num">Totaal</th><th class="num">Betaald</th><th class="num">Openstaand</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="click" onclick="location.hash='#/verkoop/${r.id}'"><td>${r.offertenummer || '–'}</td><td>${r.orderbev_nummer || '–'}</td><td>${r.factuurnummer || '–'}</td>
        <td><b>${esc(r.klanten?.naam)}</b></td><td>${esc(r.klant_referentie || '')}</td><td>${datum(r.orderdatum)}</td><td>${badge(SO_STATUS, r.status)}</td>
        <td class="num">${money(r._t.totaal)}</td><td class="num">${money(r._t.betaald)}</td><td class="num">${openBedrag(r) > 0.005 ? `<b class="open-bedrag">${money(openBedrag(r))}</b>` : '<span class="muted">–</span>'}</td></tr>`).join('')}
    </tbody></table>${aantal > rows.length ? `<p class="small muted" style="padding:12px 16px">De nieuwste ${rows.length} van ${aantal} orders. Zoek op nummer of klant om een oudere order te vinden.</p>` : ''}` : '<p class="empty">Geen verkooporders gevonden.</p>';
  };
  const nieuw = async () => {
    const klanten = check(await sb.from('klanten').select('id, naam, nummer, postcode_plaats, taal, btw_regeling, soort').eq('actief', true).order('naam'));
    const id = await modal({
      title: 'Nieuwe verkooporder',
      body: klantKiezerHtml(klanten, query.klant) + formFields([
        { name: 'klant_referentie', label: 'Referentie klant (optioneel)', placeholder: 'bv. LVM-06032026-KEEMAN', full: true },
      ]),
      submitLabel: 'Aanmaken',
      onOpen: klantKiezerInit,
      onSubmit: async (v, form) => {
        const k = await klantKiezerWaarde(v, form, klanten);
        const pct = k.soort === 'particulier' ? 100 : 50;
        return check(await sb.from('verkooporders').insert({
          klant_id: k.id, klant_referentie: v.klant_referentie, taal: k.taal, btw_regeling: k.btw_regeling, aanbetaling_pct: pct,
        }).select('id').single()).id;
      },
    });
    if (id) location.hash = '#/verkoop/' + id;
  };
  $('#nieuw', c).onclick = nieuw;
  c.querySelectorAll('[data-modus]').forEach((b) => { b.onclick = () => { modus = b.dataset.modus; zetModus(); load(); }; });
  if (klantFilter) {
    const open = await openstaandeOrders(klantFilter);
    const kn = check(await sb.from('klanten').select('naam').eq('id', klantFilter).single()).naam;
    const som = open.reduce((x, r) => x + openBedrag(r), 0);
    $('#klantfilter', c).innerHTML = `<div class="card" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><div>Orders van <b>${esc(kn)}</b> · nog te betalen: <b class="open-bedrag">${money(som)}</b>${open.length ? ` over ${open.length} order${open.length === 1 ? '' : 's'}` : ''}</div><span class="spacer"></span><a class="btn small" href="#/klant/${klantFilter}">Klantkaart</a><a class="btn small" href="#/verkoop">Alle klanten</a></div>`;
    $('#status', c).value = '';
  }
  zetModus();
  let t; $('#q', c).addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
  $('#status', c).addEventListener('change', load);
  await load();
  if (query.nieuw) { history.replaceState(null, '', '#/verkoop'); nieuw(); }
}

// =============================== DETAIL ===============================
export async function renderDetail(c, [id]) {
  const reload = refresh;
  const so = check(await sb.from('verkooporders').select('*, klanten(*)').eq('id', id).single());
  setTitle(nrLabel(so));
  const [klanten, regels, betalingen, pos] = await Promise.all([
    sb.from('klanten').select('id, naam, nummer, postcode_plaats').order('naam'),
    sb.from('verkooporder_regels').select('*, artikelen(id, artikelnummer, naam, soort, leverancier_id, foto_pad, designs(hoofdfoto_pad, design_code_lev)), inkooporder_regels(id, inkooporders(id, ordernummer, status))').eq('verkooporder_id', id).order('volgorde').order('id'),
    sb.from('verkoop_betalingen').select('*').eq('verkooporder_id', id).order('datum'),
    sb.from('inkooporders').select('id, ordernummer, status, aangemaakt_op, verstuurd_op, ontvangen_op, leveranciers(naam)').eq('verkooporder_id', id),
  ]).then((r) => r.map(check));
  const artIds = regels.map((r) => r.artikel_id).filter(Boolean);
  const vrd = artIds.length ? check(await sb.from('v_voorraad').select('artikel_id, in_showroom, voorraad_totaal').in('artikel_id', artIds)) : [];
  const vmap = new Map(vrd.map((v) => [v.artikel_id, v]));

  const som = regels.reduce((s, r) => s + r.aantal * r.prijs * (1 - r.korting_pct / 100), 0);
  const r2 = (x) => Math.round(x * 100) / 100;
  const nl21 = so.btw_regeling === 'nl21';
  const incl = so.prijzen_incl_btw; // orders uit IOne: regelprijzen zijn inclusief btw
  const totaal = r2(nl21 && !incl ? som * 1.21 : som);
  const netto = r2(nl21 && incl ? som / 1.21 : som);
  const btw = r2(totaal - netto);
  const betaald = betalingen.reduce((s, b) => s + Number(b.bedrag), 0);
  const aanbetaling = Math.round(totaal * so.aanbetaling_pct) / 100;
  const nogBestellen = regels.filter((r) => r.bestellen && !r.inkoopregel_id);
  const zonderLev = nogBestellen.filter((r) => !r.artikelen?.leverancier_id);
  const allesGeleverd = regels.length && regels.every((r) => r.geleverd);
  const st = so.status;
  const taal = so.taal;
  const docLink = (soort) => `#/doc/so/${so.id}/${soort}?taal=${taal}`;

  // ---- voortgang: welke stap is klaar, welke is nu aan de beurt ----
  const volBetaald = totaal > 0 && betaald >= totaal;
  const stappen = [
    { k: 'offerte', attr: 'data-doc="offerte"', lbl: 'Offerte', klaar: !!so.offertenummer, over: !so.offertenummer && !!so.orderbev_nummer,
      sub: so.offertenummer ? `${so.offertenummer}${so.offerte_datum ? ' · ' + datum(so.offerte_datum) : ''}` : so.orderbev_nummer ? 'Overgeslagen' : '' },
    { k: 'bevestig', attr: 'id="bevestig"', lbl: 'Orderbevestiging', klaar: !!so.orderbev_nummer,
      sub: so.orderbev_nummer ? `${so.orderbev_nummer}${so.orderbev_datum ? ' · ' + datum(so.orderbev_datum) : ''}` : '' },
    { k: 'betaling', attr: 'id="betaling"', lbl: 'Betaling', klaar: volBetaald,
      sub: betaald ? `${money(betaald)} ontvangen` : '' },
    { k: 'lever', attr: `id="lever" ${allesGeleverd ? 'disabled' : ''}`, lbl: 'Levering', klaar: !!allesGeleverd, sub: allesGeleverd ? 'Geleverd' : '' },
    { k: 'factuur', attr: 'data-doc="factuur"', lbl: 'Factuur', klaar: !!so.factuurnummer,
      sub: so.factuurnummer ? `${so.factuurnummer}${so.factuur_datum ? ' · ' + datum(so.factuur_datum) : ''}` : '' },
  ];
  const geannuleerd = st === 'geannuleerd';
  // Aanbetaling binnen? Dan eerst leveren en factureren; de restbetaling komt daarna.
  const aanbetaald = (betaald > 0 || Number(so.aanbetaling_pct) === 0) && betaald >= aanbetaling - 0.005;
  let nu = geannuleerd ? null : stappen.find((x) => !x.klaar && !x.over && !(x.k === 'betaling' && aanbetaald && !so.factuurnummer));
  if (!nu && !geannuleerd && !volBetaald) nu = stappen[2];
  const VOLGENDE = {
    offerte: ['Offerte maken', 'Maak de offerte voor de klant. Is de klant al akkoord? Dan kun je de order ook direct bevestigen.'],
    bevestig: ['Order bevestigen', `De klant is akkoord. Je krijgt een orderbevestiging${nogBestellen.length ? ` en er wordt automatisch een concept-inkooporder gemaakt voor ${nogBestellen.length} te bestellen regel${nogBestellen.length === 1 ? '' : 's'}` : ''}.`],
    betaling: ['Betaling registreren', betaald ? `Er staat nog ${money(totaal - betaald)} open.` : so.aanbetaling_pct > 0 ? `Leg de aanbetaling van ${money(aanbetaling)} (${num(so.aanbetaling_pct)}%) vast zodra die binnen is.` : `Leg de betaling van ${money(totaal)} vast zodra die binnen is.`],
    lever: ['Leveren', 'Het tapijt gaat naar de klant; de voorraad wordt afgeboekt.'],
    factuur: ['Factuur maken', 'Er wordt een definitief factuurnummer toegekend.'],
  };
  // ---- documenten die al bestaan: altijd te openen ----
  const documenten = [
    so.offertenummer && ['offerte', `Offerte ${so.offertenummer}`],
    so.orderbev_nummer && ['orderbevestiging', `Orderbevestiging ${so.orderbev_nummer}`],
    so.factuurnummer && ['factuur', `Factuur ${so.factuurnummer}`],
  ].filter(Boolean);

  // ---- tijdlijn: wat is wanneer gebeurd ----
  const tijdlijn = [];
  const gebeurd = (d, tekst, icoon = 'circle') => { if (d) tijdlijn.push({ d: String(d).slice(0, 10), tekst, icoon }); };
  gebeurd(so.aangemaakt_op, so.bron === 'ione' ? 'Overgenomen uit IOne' : 'Order aangemaakt', 'plus');
  gebeurd(so.offerte_datum, `Offerte ${so.offertenummer ?? ''} gemaakt`, 'file-text');
  gebeurd(so.orderbev_datum, `Order bevestigd (orderbevestiging ${so.orderbev_nummer ?? ''})`, 'check');
  let loop = 0; let volOp = null;
  betalingen.forEach((b) => {
    loop += Number(b.bedrag);
    gebeurd(b.datum, `${b.soort === 'aanbetaling' ? 'Aanbetaling' : b.soort === 'restbetaling' ? 'Restbetaling' : 'Betaling'} ontvangen: ${money(b.bedrag)}`, 'banknote');
    if (!volOp && totaal > 0 && loop >= totaal - 0.005) { volOp = b.datum; gebeurd(b.datum, 'Volledig betaald', 'badge-check'); }
  });
  pos.forEach((p) => {
    gebeurd(p.aangemaakt_op, `Inkooporder ${p.ordernummer} aangemaakt`, 'shopping-cart');
    gebeurd(p.verstuurd_op, `Inkooporder ${p.ordernummer} verstuurd naar leverancier`, 'send');
    gebeurd(p.ontvangen_op, `Inkooporder ${p.ordernummer} ontvangen`, 'package-check');
  });
  gebeurd(so.geleverd_op, 'Geleverd aan klant', 'truck');
  gebeurd(so.factuur_datum, `Factuur ${so.factuurnummer ?? ''} gemaakt`, 'receipt');
  gebeurd(so.betaald_op, 'Order afgerond (als betaald gemarkeerd)', 'badge-check');
  tijdlijn.sort((x, y) => x.d.localeCompare(y.d));

  const kId = { offerte: '[data-doc=offerte]', bevestig: '#bevestig', betaling: '#betaling', lever: '#lever', factuur: '[data-doc=factuur]' };
  const k = so.klanten || {};

  c.innerHTML = `
    <div class="page-head"><a class="btn small" href="#/verkoop"><i data-lucide="arrow-left"></i> Verkooporders</a>
      <h1>${esc(nrLabel(so))}</h1>${badge(SO_STATUS, st)}<span class="spacer"></span>
      ${!geannuleerd ? '<button class="btn danger small" id="annuleer">Annuleren</button>' : ''}
      ${!so.offertenummer && !so.orderbev_nummer && !so.factuurnummer ? '<button class="btn danger small" id="del"><i data-lucide="trash-2"></i> Verwijderen</button>' : ''}
    </div>

    <div class="so-kop">
      <div class="so-klant">
        <span class="kb-l">Klant</span>
        <b class="so-naam">${esc(k.naam || '')}</b>
        <span class="muted small">${esc([k.postcode_plaats, so.klant_referentie ? 'ref. ' + so.klant_referentie : ''].filter(Boolean).join(' · ')) || `Klantnr. ${k.nummer ?? ''}`}</span>
        <a class="small" id="klant-open" href="#/verkoop?klant_id=${so.klant_id}" style="margin-top:4px"></a>
      </div>
      <div><span class="kb-l">Totaal incl. btw</span><b class="so-bedrag">${money(totaal)}</b></div>
      <div><span class="kb-l">Betaald</span><b class="so-bedrag ${betaald ? 'ok' : ''}">${money(betaald)}</b></div>
      <div><span class="kb-l">Nog te voldoen</span><b class="so-bedrag ${totaal - betaald > 0.005 ? 'open' : 'ok'}">${money(totaal - betaald)}</b></div>
    </div>

    <div class="card"><h2>Voortgang</h2>
      <div class="stepper">${stappen.map((x, i) => { const cls = x.klaar ? 'done' : nu === x ? 'cur' : 'todo';
        return `<button class="stp ${cls}" ${x.attr} title="${x.klaar && x.k !== 'betaling' && x.k !== 'lever' ? 'Document bekijken' : esc(VOLGENDE[x.k][0])}"><span class="stp-dot">${x.klaar ? '<i data-lucide="check"></i>' : i + 1}</span><span class="stp-lbl">${x.lbl}</span>${x.sub ? `<span class="stp-sub">${esc(x.sub)}</span>` : ''}</button>`; }).join('')}</div>
      ${geannuleerd ? '<div class="volgende"><div><b>Deze order is geannuleerd.</b></div></div>'
        : nu ? `<div class="volgende"><div><span class="kb-l">Volgende stap</span><b>${VOLGENDE[nu.k][0]}</b><span class="small muted">${esc(VOLGENDE[nu.k][1])}</span></div>
            <span class="spacer"></span>
            ${nu.k === 'offerte' ? '<button class="btn" data-klik="#bevestig">Direct bevestigen</button>' : ''}
            <button class="btn primary" data-klik="${kId[nu.k]}">${VOLGENDE[nu.k][0]} <i data-lucide="arrow-right"></i></button></div>`
        : st === 'gefactureerd' ? '<div class="volgende"><div><span class="kb-l">Volgende stap</span><b>Order afronden</b><span class="small muted">Alles is betaald en gefactureerd.</span></div><span class="spacer"></span><button class="btn primary" id="betaald">Markeer als betaald</button></div>'
        : '<div class="volgende klaar"><div><b>Deze order is afgerond.</b><span class="small muted">Klik op een stap om het document nog eens te openen.</span></div></div>'}
      <div class="docs-rij"><span class="kb-l">Documenten</span>
        ${documenten.length ? documenten.map(([soort, lbl]) => `<a class="btn small" href="${docLink(soort)}" target="_blank"><i data-lucide="file-text"></i> ${esc(lbl)}</a>`).join('')
          : '<span class="small muted">Nog geen documenten. Maak eerst een offerte of bevestig de order.</span>'}
        ${documenten.length ? `<span class="small muted">in het ${taal === 'en' ? 'Engels' : 'Nederlands'}</span>` : ''}
      </div>
      ${nogBestellen.length && so.orderbev_nummer ? `<div class="warnbox">${nogBestellen.length} regel(s) moeten nog besteld worden. <button class="btn small" id="maakpo">Inkooporder(s) aanmaken</button></div>` : ''}
      ${zonderLev.length ? `<div class="warnbox">Let op: ${zonderLev.length} te bestellen artikel(en) hebben geen leverancier. Vul die in bij het artikel, anders kan er geen inkooporder gemaakt worden.</div>` : ''}
    </div>

    <div class="card"><h2>Regels</h2>
      <div class="lines">
      ${regels.length ? regels.map((r) => { const v = vmap.get(r.artikel_id); const po = r.inkooporder_regels?.inkooporders; const a = r.artikelen; const fysiek = a && a.soort !== 'dienst';
        const foto = a?.foto_pad || a?.designs?.hoofdfoto_pad; return `<div class="line" data-regel="${r.id}">
        <div class="line-foto">${foto ? `<img data-path="${esc(foto)}" alt="">` : '<span class="line-nofoto"><i data-lucide="image-off"></i></span>'}</div>
        <div class="line-main">
          <div class="line-kop">${a ? `<a href="#/artikel/${a.id}" class="line-nr">${a.artikelnummer}</a><span class="line-naam">${esc(a.naam)}</span><span class="badge">${esc(SOORT_ARTIKEL[a.soort])}</span>` : '<span class="line-naam muted">Vrije regel</span>'}</div>
          <label class="line-lbl">Omschrijving op documenten<textarea data-f="omschrijving" rows="2">${esc(r.omschrijving || '')}</textarea></label>
          ${r.notitie ? `<p class="line-notitie"><i data-lucide="sticky-note"></i> ${esc(r.notitie)}</p>` : ''}
        </div>
        <div class="line-nums">
          <label class="line-lbl">Aantal<input type="number" step="any" data-f="aantal" value="${r.aantal}"></label>
          <label class="line-lbl">Prijs ${incl ? 'incl.' : 'excl.'} btw<input type="number" step="0.01" data-f="prijs" value="${r.prijs}"></label>
          <label class="line-lbl">Korting %<input type="number" step="0.01" data-f="korting_pct" value="${r.korting_pct}"></label>
          <div class="line-lbl">Totaal<b class="line-tot">${money(r.aantal * r.prijs * (1 - r.korting_pct / 100))}</b></div>
        </div>
        <div class="line-side">
          ${r.geleverd ? '<span class="badge green">Geleverd</span>' : fysiek ? `<span class="badge ${Number(v?.in_showroom ?? 0) >= r.aantal ? 'green' : ''}">${num(v?.in_showroom ?? 0)} in showroom</span>` : ''}
          ${po ? `<a class="badge blue" href="#/inkoop/${po.id}">Inkooporder ${po.ordernummer} · ${esc(PO_STATUS[po.status][0])}</a>`
            : fysiek && !r.geleverd ? `<label class="check small"><input type="checkbox" data-f="bestellen" ${r.bestellen ? 'checked' : ''}> Bestellen bij leverancier</label>` : ''}
          ${r.geleverd || r.inkoopregel_id ? '' : `<button class="line-del" data-delregel="${r.id}" title="Regel verwijderen" aria-label="Regel verwijderen"><i data-lucide="trash-2"></i></button>`}
        </div></div>`; }).join('') : '<p class="empty">Nog geen regels. Zoek hieronder een artikel om toe te voegen.</p>'}
      </div>
      <div class="add-line">
        <div class="search"><i data-lucide="search"></i><input id="zoek" placeholder="Artikel toevoegen: typ artikelnummer of naam…" autocomplete="off"></div>
        <button class="btn" id="vrij"><i data-lucide="plus"></i> Vrije regel</button>
      </div>
      <div class="regel-voet">
        <p class="small muted">${incl ? 'Deze order komt uit IOne: de regelprijzen zijn inclusief btw.' : 'De prijs komt van het artikel (verkoopprijs incl. btw ÷ 1,21) en kun je per regel aanpassen.'} "Bestellen bij leverancier" staat automatisch aan voor maatwerk en als er te weinig in de showroom ligt.</p>
        <div class="totals">
          <div><span>Netto</span><span>${money(netto)}</span></div>
          <div><span>${esc(BTW[so.btw_regeling])}</span><span>${money(btw)}</span></div>
          <div class="strong"><span>Totaal</span><span>${money(totaal)}</span></div>
          ${so.aanbetaling_pct > 0 && so.aanbetaling_pct < 100 ? `<div><span>Waarvan aanbetaling ${num(so.aanbetaling_pct)}%</span><span>${money(aanbetaling)}</span></div>` : ''}
        </div>
      </div>
    </div>

    <div class="cols-2">
    <div class="card"><h2>Klant<span class="spacer"></span><button class="btn small" id="klantwissel"><i data-lucide="repeat"></i> Andere klant</button><button class="btn small" id="klantbewerk"><i data-lucide="pencil"></i> Wijzigen</button></h2>
      <dl class="kv">
        <dt>Naam</dt><dd><a href="#/klant/${so.klant_id}"><b>${esc(k.naam || '')}</b></a> <span class="muted small">· klantnr. ${k.nummer ?? ''}</span></dd>
        <dt>E-mail</dt><dd>${k.email ? `<a href="mailto:${esc(k.email)}">${esc(k.email)}</a>` : '<span class="muted">Niet ingevuld</span>'}</dd>
        <dt>Telefoon</dt><dd>${esc([k.telefoon, k.mobiel].filter(Boolean).join(' / ')) || '<span class="muted">Niet ingevuld</span>'}</dd>
        <dt>Adres</dt><dd>${esc([k.adres, k.postcode_plaats, k.land].filter(Boolean).join(', ')) || '<span class="muted">Niet ingevuld</span>'}</dd>
      </dl>
    </div>

    <div class="card"><h2>Betalingen van klant<span class="spacer"></span>${geannuleerd ? '' : '<button class="btn small primary" data-klik="#betaling"><i data-lucide="plus"></i> Betaling</button>'}</h2>
      ${betalingen.length ? `<table class="list"><thead><tr><th>Datum</th><th>Soort</th><th>Omschrijving</th><th class="num">Bedrag</th><th></th></tr></thead><tbody>
      ${betalingen.map((b) => `<tr><td>${datum(b.datum)}</td><td>${esc(b.soort)}</td><td>${esc(b.omschrijving || '')}</td><td class="num">${money(b.bedrag)}</td><td><button class="line-del" data-delbet="${b.id}" title="Betaling verwijderen" aria-label="Betaling verwijderen"><i data-lucide="trash-2"></i></button></td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">Nog niets ontvangen.</p>'}
      <div class="totals" style="margin-top:12px">
        <div><span>Betaald</span><span>${money(betaald)}</span></div>
        <div class="strong"><span>Nog te voldoen</span><span>${money(totaal - betaald)}</span></div>
      </div>
    </div>
    </div>

    <div class="card"><h2>Tijdlijn</h2>
      ${tijdlijn.length ? `<ol class="tijdlijn">${tijdlijn.map((t) => `<li><span class="tl-ic"><i data-lucide="${t.icoon}"></i></span><span class="tl-d">${datum(t.d)}</span><span>${esc(t.tekst)}</span></li>`).join('')}</ol>` : '<p class="muted">Nog niets vastgelegd.</p>'}
      <p class="small muted" style="margin-top:12px">Datums worden automatisch ingevuld. Klopt er een niet, of wil je er een toevoegen? Pas hem aan bij Ordergegevens.</p>
    </div>

    <form class="card" id="kop"><h2>Ordergegevens</h2>
      ${formFields([
        { name: 'klant_referentie', label: 'Referentie klant' },
        { name: 'orderdatum', label: 'Orderdatum', type: 'date' },
        { name: 'taal', label: 'Taal documenten', type: 'select', options: { nl: 'Nederlands', en: 'Engels' } },
        { name: 'btw_regeling', label: 'Btw', type: 'select', options: BTW },
        { name: 'aanbetaling_pct', label: 'Aanbetaling (%)', type: 'number', hint: 'bv. 50 of 100; 0 = geen aanbetaling' },
        { name: 'levermethode', label: 'Levermethode', placeholder: 'bv. Afhalen / Bezorgen / Verzenden' },
        { name: 'betaalvoorwaarden', label: 'Betaalvoorwaarden (op document)', placeholder: 'bv. 50% bij bestelling, 50% na levering', full: true },
      ], so)}
      <h3 class="sub">Datums</h3>
      ${formFields([
        { name: 'offerte_datum', label: 'Offerte gemaakt', type: 'date' },
        { name: 'orderbev_datum', label: 'Order bevestigd', type: 'date' },
        { name: 'geleverd_op', label: 'Geleverd', type: 'date' },
        { name: 'factuur_datum', label: 'Factuur gemaakt', type: 'date' },
        { name: 'betaald_op', label: 'Afgerond / betaald gezet', type: 'date' },
      ], so)}
      <div class="g3">${formFields([
        { name: 'afleveradres', label: 'Afleveradres', type: 'textarea', narrow: true, hint: 'Alleen als het afwijkt van het klantadres' },
        { name: 'opmerking', label: 'Opmerking', type: 'textarea', narrow: true, hint: 'Komt op de documenten' },
        { name: 'notities_intern', label: 'Interne notities', type: 'textarea', narrow: true, hint: 'Ziet de klant niet' },
      ], so)}</div>
      <div class="btn-row" style="margin-top:16px"><button class="btn primary">Opslaan</button></div>
    </form>

    ${pos.length ? `<div class="card"><h2>Gekoppelde inkooporders</h2><table class="list"><tbody>
      ${pos.map((p) => `<tr class="click" onclick="location.hash='#/inkoop/${p.id}'"><td><b>${p.ordernummer}</b></td><td>${esc(p.leveranciers?.naam)}</td><td>${badge(PO_STATUS, p.status)}</td></tr>`).join('')}
    </tbody></table></div>` : ''}`;

  loadImages(c);
  // Hoeveel moet deze klant in totaal nog betalen (alle open orders)?
  if (so.klant_id) openstaandeOrders(so.klant_id).then((open) => {
    const el = $('#klant-open', c); if (!el) return;
    const som = open.reduce((x, r) => x + openBedrag(r), 0);
    el.innerHTML = som > 0.005 ? `Klant moet in totaal nog <b class="open-bedrag">${money(som)}</b> betalen (${open.length} order${open.length === 1 ? '' : 's'}) ›` : 'Klant heeft verder niets openstaan';
  }).catch(() => {});

  // ---- documenten ----
  const openDoc = async (soort) => {
    if (!regels.length) { toast('Voeg eerst regels toe', 'error'); return; }
    check(await sb.rpc('ken_nummer_toe', { p_order: so.id, p_soort: soort }));
    window.open(docLink(soort), '_blank');
    reload();
  };
  on(c, 'click', '[data-doc]', async (_e, b) => {
    const soort = b.dataset.doc;
    if (soort === 'factuur' && !so.factuurnummer) {
      if (!await confirmBox('Factuur maken? Er wordt een definitief factuurnummer toegekend; dat kan niet meer ongedaan gemaakt worden.', 'Factuur maken')) return;
    }
    openDoc(soort);
  });
  $('#bevestig', c).onclick = async () => {
    if (so.orderbev_nummer) { window.open(docLink('orderbevestiging'), '_blank'); return; }
    if (!regels.length) { toast('Voeg eerst regels toe', 'error'); return; }
    const bestel = regels.filter((r) => r.bestellen && !r.inkoopregel_id);
    if (!await confirmBox(`Order bevestigen? Er wordt een orderbevestigingsnummer toegekend${bestel.length ? ` en er worden concept-inkooporders gemaakt voor ${bestel.length} te bestellen regel(s)` : ''}.`, 'Bevestigen')) return;
    check(await sb.rpc('ken_nummer_toe', { p_order: so.id, p_soort: 'orderbevestiging' }));
    if (bestel.length) {
      const n = check(await sb.rpc('maak_inkooporders_voor_verkoop', { p_order: so.id }));
      if (n) toast(`${n} concept-inkooporder(s) aangemaakt. Versturen kan na ontvangst van de aanbetaling.`, 'ok');
    }
    window.open(docLink('orderbevestiging'), '_blank');
    reload();
  };
  $('#maakpo', c)?.addEventListener('click', async () => {
    const n = check(await sb.rpc('maak_inkooporders_voor_verkoop', { p_order: so.id }));
    toast(n ? `${n} concept-inkooporder(s) aangemaakt` : 'Geen inkooporders aangemaakt (leverancier ontbreekt?)', n ? 'ok' : 'error');
    reload();
  });
  $('#lever', c).onclick = async () => {
    const tekort = regels.filter((r) => !r.geleverd && r.artikelen && r.artikelen.soort !== 'dienst' && Number(vmap.get(r.artikel_id)?.voorraad_totaal || 0) < r.aantal);
    const msg = tekort.length
      ? `Let op: voor ${tekort.length} regel(s) is er niet genoeg voorraad (is de inkooporder al ontvangen?). Toch leveren? De voorraad wordt dan negatief.`
      : 'Order als geleverd markeren? De artikelen worden van de voorraad afgeboekt.';
    if (!await confirmBox(msg, 'Leveren')) return;
    check(await sb.rpc('lever_verkooporder', { p_order: so.id }));
    check(await sb.from('verkooporders').update({ geleverd_op: vandaag() }).eq('id', so.id).is('geleverd_op', null));
    toast('Geleverd, voorraad bijgewerkt', 'ok'); reload();
  };
  $('#betaald', c)?.addEventListener('click', async () => {
    if (betaald < totaal && !await confirmBox(`Er is ${money(betaald)} van ${money(totaal)} ontvangen. Toch als betaald markeren?`, 'Markeren')) return;
    check(await sb.from('verkooporders').update({ status: 'betaald' }).eq('id', so.id)); reload();
  });
  $('#annuleer', c)?.addEventListener('click', async () => {
    if (!await confirmBox('Verkooporder annuleren?', 'Annuleren')) return;
    check(await sb.from('verkooporders').update({ status: 'geannuleerd' }).eq('id', so.id)); reload();
  });
  $('#del', c)?.addEventListener('click', async () => {
    if (!await confirmBox('Deze concept-verkooporder verwijderen?', 'Verwijderen')) return;
    check(await sb.from('verkooporders').delete().eq('id', so.id)); location.hash = '#/verkoop';
  });

  // ---- betaling ----
  $('#betaling', c).onclick = async () => {
    const ok = await modal({
      title: 'Betaling van klant',
      body: formFields([
        { name: 'datum', label: 'Datum ontvangen', type: 'date', default: vandaag() },
        { name: 'soort', label: 'Soort', type: 'select', options: { aanbetaling: 'Aanbetaling', restbetaling: 'Restbetaling', overig: 'Overig' }, default: betaald ? 'restbetaling' : 'aanbetaling' },
        { name: 'bedrag', label: 'Bedrag (€)', type: 'number', step: '0.01', required: true, default: (betaald ? totaal - betaald : aanbetaling).toFixed(2) },
        { name: 'omschrijving', label: 'Omschrijving' },
      ]),
      onSubmit: async (v) => { check(await sb.from('verkoop_betalingen').insert({ ...v, verkooporder_id: so.id })); },
    });
    if (ok) {
      toast(pos.some((p) => p.status === 'concept') ? 'Betaling vastgelegd. De concept-inkooporder kan nu verstuurd worden.' : 'Betaling vastgelegd', 'ok');
      reload();
    }
  };
  on(c, 'click', '[data-delbet]', async (_e, b) => {
    if (!await confirmBox('Betaling verwijderen?', 'Verwijderen')) return;
    check(await sb.from('verkoop_betalingen').delete().eq('id', b.dataset.delbet)); reload();
  });

  // ---- knoppen die een stap uit de voortgang starten ----
  c.addEventListener('click', (e) => { const b = e.target.closest('[data-klik]'); if (b) $(b.dataset.klik, c)?.click(); });

  // ---- andere klant kiezen (bestaand of nieuw intypen) ----
  $('#klantwissel', c).onclick = async () => {
    const actief = klanten;
    const ok = await modal({
      title: 'Andere klant voor deze order',
      body: klantKiezerHtml(actief, so.klant_id),
      submitLabel: 'Klant wijzigen',
      onOpen: klantKiezerInit,
      onSubmit: async (v, form) => { const nk = await klantKiezerWaarde(v, form, actief); check(await sb.from('verkooporders').update({ klant_id: nk.id }).eq('id', so.id)); },
    });
    if (ok) { toast('Klant gewijzigd', 'ok'); reload(); }
  };

  // ---- klantgegevens direct op de order aanpassen ----
  $('#klantbewerk', c).onclick = async () => {
    const ok = await modal({
      title: 'Klantgegevens wijzigen',
      body: formFields([
        { name: 'naam', label: 'Naam *', required: true, full: true },
        { name: 'email', label: 'E-mailadres', type: 'email' },
        { name: 'telefoon', label: 'Telefoonnummer' },
        { name: 'adres', label: 'Adres' },
        { name: 'postcode_plaats', label: 'Postcode en plaats' },
        { name: 'land', label: 'Land' },
        { name: 'btw_nummer', label: 'Btw-nummer' },
      ], so.klanten) + '<p class="small muted" style="margin-top:8px">Je past hiermee de klant zelf aan; de wijziging geldt ook voor zijn andere orders.</p>',
      onSubmit: async (v) => { check(await sb.from('klanten').update(v).eq('id', so.klant_id)); },
    });
    if (ok) { toast('Klantgegevens opgeslagen', 'ok'); reload(); }
  };

  // ---- kop ----
  $('#kop', c).onsubmit = async (e) => {
    e.preventDefault();
    const v = readForm(e.target);
    v.aanbetaling_pct = v.aanbetaling_pct ?? 0;
    check(await sb.from('verkooporders').update(v).eq('id', so.id));
    toast('Opgeslagen', 'ok'); reload();
  };

  // ---- regels ----
  artikelPicker($('#zoek', c), async (a) => {
    const v = check(await sb.from('v_voorraad').select('in_showroom').eq('artikel_id', a.id).maybeSingle());
    const bestellen = a.soort === 'maatwerk' || ((a.soort === 'voorraad') && Number(v?.in_showroom || 0) < 1);
    const prijsExcl = a.verkoopprijs ? (incl ? Number(a.verkoopprijs) : Math.round((a.verkoopprijs / 1.21) * 100) / 100) : 0;
    check(await sb.from('verkooporder_regels').insert({
      verkooporder_id: so.id, artikel_id: a.id, omschrijving: [a.naam, a.omschrijving].filter(Boolean).join('\n'),
      aantal: 1, prijs: prijsExcl, bestellen, volgorde: regels.length,
    }));
    if (bestellen) toast(a.soort === 'maatwerk' ? 'Maatwerk: wordt besteld bij de leverancier' : 'Niet op voorraad in showroom: "Bestellen" staat aan');
    reload();
  });
  $('#vrij', c).onclick = async () => {
    check(await sb.from('verkooporder_regels').insert({ verkooporder_id: so.id, omschrijving: '', aantal: 1, prijs: 0, volgorde: regels.length }));
    reload();
  };
  on(c, 'change', '[data-regel] [data-f]', async (_e, el) => {
    const rid = el.closest('[data-regel]').dataset.regel;
    const f = el.dataset.f;
    let val = el.type === 'checkbox' ? el.checked : el.value;
    if (['aantal', 'prijs', 'korting_pct'].includes(f)) val = Number(val);
    check(await sb.from('verkooporder_regels').update({ [f]: val }).eq('id', rid));
    if (f !== 'omschrijving') reload(); else toast('Opgeslagen', 'ok');
  });
  on(c, 'click', '[data-delregel]', async (_e, b) => {
    if (!await confirmBox('Regel verwijderen?', 'Verwijderen')) return;
    check(await sb.from('verkooporder_regels').delete().eq('id', b.dataset.delregel)); reload();
  });
}
