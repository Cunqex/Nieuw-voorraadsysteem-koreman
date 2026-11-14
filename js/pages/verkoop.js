import {
  sb, check, esc, money, num, datum, $, on, toast, modal, confirmBox, formFields, readForm,
  SO_STATUS, PO_STATUS, BTW, SOORT_ARTIKEL, badge, artikelPicker, setTitle, withTotals, vandaag, refresh, klantOpt,
} from '../ui.js?v=20261114112056';

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
      <input type="search" id="q" placeholder="Zoek op nummer, klant of referentie…">
      <select id="status"><option value="open">Alle open</option><option value="">Alles</option>
        ${Object.entries(SO_STATUS).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select>
    </div>
    <div class="card flush"><div class="table-wrap" id="tbl"></div></div>`;
  const load = async () => {
    let q = sb.from('verkooporders').select('id, offertenummer, orderbev_nummer, factuurnummer, status, orderdatum, klant_referentie, klanten(naam)').order('id', { ascending: false }).limit(500);
    const st = $('#status', c).value;
    if (st === 'open') q = q.not('status', 'in', '(betaald,geannuleerd)'); else if (st) q = q.eq('status', st);
    let rows = check(await q);
    const s = $('#q', c).value.trim().toLowerCase();
    if (s) rows = rows.filter((r) => `${r.offertenummer} ${r.orderbev_nummer} ${r.factuurnummer} ${r.klanten?.naam} ${r.klant_referentie}`.toLowerCase().includes(s));
    await withTotals(rows, 'v_verkooporder_totalen', 'verkooporder_id');
    $('#tbl', c).innerHTML = rows.length ? `<table class="list"><thead><tr><th>Offerte</th><th>Orderbev.</th><th>Factuur</th><th>Klant</th><th>Referentie</th><th>Datum</th><th>Status</th><th class="num">Totaal</th><th class="num">Betaald</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="click" onclick="location.hash='#/verkoop/${r.id}'"><td>${r.offertenummer || '–'}</td><td>${r.orderbev_nummer || '–'}</td><td>${r.factuurnummer || '–'}</td>
        <td><b>${esc(r.klanten?.naam)}</b></td><td>${esc(r.klant_referentie || '')}</td><td>${datum(r.orderdatum)}</td><td>${badge(SO_STATUS, r.status)}</td>
        <td class="num">${money(r._t.totaal)}</td><td class="num">${money(r._t.betaald)}</td></tr>`).join('')}
    </tbody></table>` : '<p class="empty">Geen verkooporders gevonden.</p>';
  };
  const nieuw = async () => {
    const klanten = check(await sb.from('klanten').select('id, naam, nummer, postcode_plaats, taal, btw_regeling, soort').eq('actief', true).order('naam'));
    if (!klanten.length) { toast('Maak eerst een klant aan bij "Klanten & architecten"', 'error'); return; }
    const id = await modal({
      title: 'Nieuwe verkooporder',
      body: formFields([
        { name: 'klant_id', label: 'Klant / architect *', type: 'combo', required: true, placeholder: 'Kies…', options: klanten.map(klantOpt), default: query.klant },
        { name: 'klant_referentie', label: 'Referentie klant (optioneel)', placeholder: 'bv. LVM-06032026-KEEMAN' },
      ]) + '<p class="small"><a href="#/klanten">Klant staat er niet tussen? Maak hem eerst aan.</a></p>',
      submitLabel: 'Aanmaken',
      onSubmit: async (v) => {
        const k = klanten.find((x) => String(x.id) === v.klant_id);
        const pct = k.soort === 'particulier' ? 100 : 50;
        return check(await sb.from('verkooporders').insert({
          klant_id: k.id, klant_referentie: v.klant_referentie, taal: k.taal, btw_regeling: k.btw_regeling, aanbetaling_pct: pct,
        }).select('id').single()).id;
      },
    });
    if (id) location.hash = '#/verkoop/' + id;
  };
  $('#nieuw', c).onclick = nieuw;
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
    sb.from('verkooporder_regels').select('*, artikelen(id, artikelnummer, naam, soort, leverancier_id), inkooporder_regels(id, inkooporders(id, ordernummer, status))').eq('verkooporder_id', id).order('volgorde').order('id'),
    sb.from('verkoop_betalingen').select('*').eq('verkooporder_id', id).order('datum'),
    sb.from('inkooporders').select('id, ordernummer, status, leveranciers(naam)').eq('verkooporder_id', id),
  ]).then((r) => r.map(check));
  const artIds = regels.map((r) => r.artikel_id).filter(Boolean);
  const vrd = artIds.length ? check(await sb.from('v_voorraad').select('artikel_id, in_showroom, voorraad_totaal').in('artikel_id', artIds)) : [];
  const vmap = new Map(vrd.map((v) => [v.artikel_id, v]));

  const netto = regels.reduce((s, r) => s + r.aantal * r.prijs * (1 - r.korting_pct / 100), 0);
  const btwPct = so.btw_regeling === 'nl21' ? 0.21 : 0;
  const btw = Math.round(netto * btwPct * 100) / 100;
  const totaal = Math.round((netto + btw) * 100) / 100;
  const betaald = betalingen.reduce((s, b) => s + Number(b.bedrag), 0);
  const aanbetaling = Math.round(totaal * so.aanbetaling_pct) / 100;
  const nogBestellen = regels.filter((r) => r.bestellen && !r.inkoopregel_id);
  const zonderLev = nogBestellen.filter((r) => !r.artikelen?.leverancier_id);
  const allesGeleverd = regels.length && regels.every((r) => r.geleverd);
  const st = so.status;
  const taal = so.taal;
  const docLink = (soort) => `#/doc/so/${so.id}/${soort}?taal=${taal}`;

  c.innerHTML = `
    <div class="page-head"><a class="btn small" href="#/verkoop"><i data-lucide="arrow-left"></i> Verkooporders</a>
      <h1>${esc(nrLabel(so))}</h1>${badge(SO_STATUS, st)}<span class="spacer"></span>
      <span class="muted">${esc(so.klanten?.naam)}</span></div>

    <div class="card"><h2>Stappen</h2>
      <div class="steps">
        <button class="btn step ${so.offertenummer ? 'done' : st === 'offerte' ? 'primary' : ''}" data-doc="offerte"><span class="step-n">Stap 1</span>${so.offertenummer ? `Offerte ${so.offertenummer} bekijken` : 'Offerte maken'}</button>
        <button class="btn step ${so.orderbev_nummer ? 'done' : st === 'offerte' ? 'primary' : ''}" id="bevestig"><span class="step-n">Stap 2</span>${so.orderbev_nummer ? `Orderbevestiging ${so.orderbev_nummer} bekijken` : 'Order bevestigen'}</button>
        <button class="btn step ${betaald >= totaal && totaal > 0 ? 'done' : st === 'bevestigd' && !betaald ? 'primary' : ''}" id="betaling"><span class="step-n">Stap 3</span>Betaling registreren</button>
        <button class="btn step ${allesGeleverd ? 'done' : st === 'bevestigd' && betaald ? 'primary' : ''}" id="lever" ${allesGeleverd ? 'disabled' : ''}><span class="step-n">Stap 4</span>${allesGeleverd ? 'Geleverd' : 'Leveren (voorraad afboeken)'}</button>
        <button class="btn step ${so.factuurnummer ? 'done' : st === 'geleverd' ? 'primary' : ''}" data-doc="factuur"><span class="step-n">Stap 5</span>${so.factuurnummer ? `Factuur ${so.factuurnummer} bekijken` : 'Factuur maken'}</button>
        ${st === 'gefactureerd' ? `<button class="btn step primary" id="betaald"><span class="step-n">Stap 6</span>Markeer als betaald</button>` : ''}
      </div>
      <div class="btn-row" style="margin-top:14px">
        <span class="small muted">Documenten in het ${taal === 'en' ? 'Engels' : 'Nederlands'} (wijzig "Taal" bij Gegevens).
        ${so.offerte_datum ? `Offerte ${datum(so.offerte_datum)}. ` : ''}${so.orderbev_datum ? `Bevestigd ${datum(so.orderbev_datum)}. ` : ''}${so.factuur_datum ? `Gefactureerd ${datum(so.factuur_datum)}.` : ''}</span>
        <span class="spacer"></span>
        ${st !== 'geannuleerd' ? '<button class="btn danger small" id="annuleer">Annuleren</button>' : ''}
        ${!so.offertenummer && !so.orderbev_nummer && !so.factuurnummer ? '<button class="btn danger small" id="del">Verwijderen</button>' : ''}
      </div>
      ${nogBestellen.length && so.orderbev_nummer ? `<div class="warnbox">${nogBestellen.length} regel(s) moeten nog besteld worden. <button class="btn small" id="maakpo">Inkooporder(s) aanmaken</button></div>` : ''}
      ${zonderLev.length ? `<div class="warnbox">Let op: ${zonderLev.length} te bestellen artikel(en) hebben geen leverancier. Vul die in bij het artikel, anders kan er geen inkooporder gemaakt worden.</div>` : ''}
    </div>

    <div class="card"><h2>Regels</h2>
      <div class="table-wrap"><table class="list edit"><thead><tr><th>Artikel</th><th>Omschrijving</th><th class="num">Aantal</th><th class="num">Prijs excl. btw</th><th class="num">Korting %</th><th class="num">Totaal</th><th>In showroom</th><th>Bestellen?</th><th>Inkooporder</th><th></th></tr></thead><tbody>
      ${regels.map((r) => { const v = vmap.get(r.artikel_id); const po = r.inkooporder_regels?.inkooporders; return `<tr data-regel="${r.id}">
        <td>${r.artikelen ? `<a href="#/artikel/${r.artikelen.id}"><b>${r.artikelen.artikelnummer}</b></a><br><span class="small muted">${esc(SOORT_ARTIKEL[r.artikelen.soort])}</span>` : '<span class="muted">vrije regel</span>'}</td>
        <td style="min-width:220px"><textarea data-f="omschrijving" rows="3">${esc(r.omschrijving || '')}</textarea></td>
        <td class="num" style="width:80px"><input type="number" step="any" data-f="aantal" value="${r.aantal}"></td>
        <td class="num" style="width:120px"><input type="number" step="0.01" data-f="prijs" value="${r.prijs}"></td>
        <td class="num" style="width:80px"><input type="number" step="0.01" data-f="korting_pct" value="${r.korting_pct}"></td>
        <td class="num">${money(r.aantal * r.prijs * (1 - r.korting_pct / 100))}</td>
        <td>${r.artikelen && r.artikelen.soort !== 'dienst' ? num(v?.in_showroom ?? 0) : ''}${r.geleverd ? '<br><span class="badge green">geleverd</span>' : ''}</td>
        <td>${r.artikelen && r.artikelen.soort !== 'dienst' ? `<input type="checkbox" data-f="bestellen" ${r.bestellen ? 'checked' : ''} ${r.inkoopregel_id ? 'disabled' : ''} style="width:auto">` : ''}</td>
        <td>${po ? `<a href="#/inkoop/${po.id}">${po.ordernummer}</a><br>${badge(PO_STATUS, po.status)}` : ''}</td>
        <td>${r.geleverd || r.inkoopregel_id ? '' : `<button class="btn small danger" data-delregel="${r.id}"><i data-lucide="trash-2"></i></button>`}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="add-line">
        <div class="search"><i data-lucide="search"></i><input id="zoek" placeholder="Artikel toevoegen: typ artikelnummer of naam…" autocomplete="off"></div>
        <button class="btn" id="vrij"><i data-lucide="plus"></i> Vrije regel</button>
      </div>
      <p class="small muted" style="margin-bottom:16px">De prijs wordt overgenomen van het artikel (verkoopprijs incl. btw ÷ 1,21). "Bestellen?" staat automatisch aan voor maatwerk en als er te weinig in de showroom ligt.</p>
      <div class="totals">
        <div><span>Netto</span><span>${money(netto)}</span></div>
        <div><span>${esc(BTW[so.btw_regeling])}</span><span>${money(btw)}</span></div>
        <div class="strong"><span>Totaal</span><span>${money(totaal)}</span></div>
        <div><span>Aanbetaling ${num(so.aanbetaling_pct)}%</span><span>${money(aanbetaling)}</span></div>
        <div><span>Betaald</span><span>${money(betaald)}</span></div>
        <div class="strong"><span>Nog te voldoen</span><span>${money(totaal - betaald)}</span></div>
      </div>
    </div>

    <form class="card" id="kop"><h2>Gegevens</h2>
      ${formFields([
        { name: 'klant_id', label: 'Klant', type: 'combo', options: klanten.map(klantOpt) },
        { name: 'klant_referentie', label: 'Referentie klant' },
        { name: 'orderdatum', label: 'Orderdatum', type: 'date' },
        { name: 'taal', label: 'Taal documenten', type: 'select', options: { nl: 'Nederlands', en: 'Engels' } },
        { name: 'btw_regeling', label: 'Btw', type: 'select', options: BTW },
        { name: 'aanbetaling_pct', label: 'Aanbetaling (%)', type: 'number', hint: 'bv. 50 of 100; 0 = geen aanbetaling' },
        { name: 'betaalvoorwaarden', label: 'Betaalvoorwaarden (op document)', placeholder: 'bv. 50% bij bestelling, 50% na levering' },
        { name: 'levermethode', label: 'Levermethode', placeholder: 'bv. Afhalen / Bezorgen / Verzenden' },
        { name: 'afleveradres', label: 'Afleveradres (als anders dan klantadres)', type: 'textarea' },
        { name: 'opmerking', label: 'Opmerking (op documenten)', type: 'textarea' },
        { name: 'notities_intern', label: 'Interne notities', type: 'textarea' },
      ], so)}
      <div class="btn-row" style="margin-top:12px"><button class="btn primary">Opslaan</button></div>
    </form>

    <div class="card"><h2>Betalingen van klant</h2>
      ${betalingen.length ? `<table class="list"><thead><tr><th>Datum</th><th>Soort</th><th>Omschrijving</th><th class="num">Bedrag</th><th></th></tr></thead><tbody>
      ${betalingen.map((b) => `<tr><td>${datum(b.datum)}</td><td>${esc(b.soort)}</td><td>${esc(b.omschrijving || '')}</td><td class="num">${money(b.bedrag)}</td><td><button class="btn small danger" data-delbet="${b.id}"><i data-lucide="trash-2"></i></button></td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">Nog niets ontvangen.</p>'}
    </div>

    ${pos.length ? `<div class="card"><h2>Gekoppelde inkooporders</h2><table class="list"><tbody>
      ${pos.map((p) => `<tr class="click" onclick="location.hash='#/inkoop/${p.id}'"><td><b>${p.ordernummer}</b></td><td>${esc(p.leveranciers?.naam)}</td><td>${badge(PO_STATUS, p.status)}</td></tr>`).join('')}
    </tbody></table></div>` : ''}`;

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

  // ---- kop ----
  $('#kop', c).onsubmit = async (e) => {
    e.preventDefault();
    const v = readForm(e.target);
    v.klant_id = Number(v.klant_id);
    v.aanbetaling_pct = v.aanbetaling_pct ?? 0;
    check(await sb.from('verkooporders').update(v).eq('id', so.id));
    toast('Opgeslagen', 'ok'); reload();
  };

  // ---- regels ----
  artikelPicker($('#zoek', c), async (a) => {
    const v = check(await sb.from('v_voorraad').select('in_showroom').eq('artikel_id', a.id).maybeSingle());
    const bestellen = a.soort === 'maatwerk' || ((a.soort === 'voorraad') && Number(v?.in_showroom || 0) < 1);
    const prijsExcl = a.verkoopprijs ? Math.round((a.verkoopprijs / 1.21) * 100) / 100 : 0;
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
