import {
  sb, check, esc, money, num, datum, $, on, toast, modal, confirmBox, formFields, readForm,
  PO_STATUS, badge, artikelPicker, loadImages, setTitle, withTotals, vandaag, isImage,
} from '../ui.js';

// =============================== LIJST ===============================
export async function renderList(c, _p, query) {
  setTitle('Inkooporders');
  const levs = check(await sb.from('leveranciers').select('id, naam, valuta').order('naam'));
  c.innerHTML = `
    <div class="page-head"><h1>Inkooporders</h1><span class="spacer"></span>
      <button class="btn primary" id="nieuw">+ Nieuwe inkooporder</button></div>
    <div class="toolbar">
      <input type="search" id="q" placeholder="Zoek op nummer of referentie…">
      <select id="status"><option value="open">Alle open</option><option value="">Alles</option>
        ${Object.entries(PO_STATUS).map(([k, [l]]) => `<option value="${k}" ${query.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select id="lev"><option value="">Alle leveranciers</option>${levs.map((l) => `<option value="${l.id}">${esc(l.naam)}</option>`).join('')}</select>
    </div>
    <div class="card" style="padding:0"><div class="table-wrap" id="tbl"></div></div>`;

  const load = async () => {
    let q = sb.from('inkooporders').select('id, ordernummer, status, orderdatum, voor_wie, referentie, valuta, leveranciers(naam), klanten(naam)').order('ordernummer', { ascending: false }).limit(500);
    const st = $('#status', c).value;
    if (st === 'open') q = q.not('status', 'in', '(ontvangen,geannuleerd)'); else if (st) q = q.eq('status', st);
    if ($('#lev', c).value) q = q.eq('leverancier_id', $('#lev', c).value);
    const s = $('#q', c).value.trim().replace(/[%,()]/g, '');
    if (s) q = /^\d+$/.test(s) ? q.eq('ordernummer', Number(s)) : q.ilike('referentie', `%${s}%`);
    const rows = check(await q);
    await withTotals(rows, 'v_inkooporder_totalen', 'inkooporder_id');
    $('#tbl', c).innerHTML = rows.length ? `<table class="list"><thead><tr><th>Nr.</th><th>Leverancier</th><th>Voor</th><th>Referentie</th><th>Datum</th><th>Status</th><th class="num">Totaal</th><th class="num">Betaald</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="click" onclick="location.hash='#/inkoop/${r.id}'"><td><b>${r.ordernummer}</b></td><td>${esc(r.leveranciers?.naam)}</td>
        <td>${r.voor_wie === 'klant' ? esc(r.klanten?.naam || 'klant') : 'Eigen voorraad'}</td><td>${esc(r.referentie || '')}</td>
        <td>${datum(r.orderdatum)}</td><td>${badge(PO_STATUS, r.status)}</td>
        <td class="num">${money(r._t.totaal, r.valuta)}</td><td class="num">${money(r._t.betaald, r.valuta)}</td></tr>`).join('')}
    </tbody></table>` : '<p class="empty">Geen inkooporders gevonden.</p>';
  };
  const nieuw = async () => {
    const klanten = check(await sb.from('klanten').select('id, naam').eq('actief', true).order('naam'));
    const id = await modal({
      title: 'Nieuwe inkooporder',
      body: formFields([
        { name: 'leverancier_id', label: 'Leverancier *', type: 'select', required: true, empty: '– kies –', options: levs.map((l) => [l.id, `${l.naam} (${l.valuta})`]), default: query.leverancier },
        { name: 'voor_wie', label: 'Voor wie?', type: 'select', options: { voorraad: 'Eigen voorraad', klant: 'In opdracht van klant / architect' } },
        { name: 'klant_id', label: 'Klant / architect (intern, niet op PO)', type: 'select', empty: '– geen –', options: klanten.map((k) => [k.id, k.naam]) },
        { name: 'referentie', label: 'Referentie op PO (bv. projectcode)', hint: 'De leverancier ziet alleen deze referentie, nooit de klantnaam' },
      ]),
      submitLabel: 'Aanmaken',
      onSubmit: async (v) => {
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

// =============================== DETAIL ===============================
export async function renderDetail(c, [id]) {
  const reload = () => renderDetail(c, [id]);
  const po = check(await sb.from('inkooporders').select('*, leveranciers(*), klanten(id, naam), verkooporders(id, orderbev_nummer, offertenummer, klant_id)').eq('id', id).single());
  setTitle(`Inkooporder ${po.ordernummer}`);
  const [levs, klanten, regels, betalingen, kosten] = await Promise.all([
    sb.from('leveranciers').select('id, naam, valuta').order('naam'),
    sb.from('klanten').select('id, naam').order('naam'),
    sb.from('inkooporder_regels').select('*, artikelen(id, artikelnummer, naam, design_id, foto_pad, designs(hoofdfoto_pad, design_code_lev))').eq('inkooporder_id', id).order('volgorde').order('id'),
    sb.from('inkoop_betalingen').select('*').eq('inkooporder_id', id).order('datum'),
    sb.from('inkoop_kosten').select('*').eq('inkooporder_id', id).order('datum'),
  ]).then((r) => r.map(check));

  // beschikbare foto's per design
  const designIds = [...new Set(regels.map((r) => r.artikelen?.design_id).filter(Boolean))];
  const files = designIds.length ? check(await sb.from('design_bestanden').select('design_id, pad, bestandsnaam, soort').in('design_id', designIds)) : [];
  const fotoOpties = (r) => {
    const opts = [];
    if (r.artikelen?.foto_pad) opts.push([r.artikelen.foto_pad, 'Foto artikel']);
    files.filter((f) => f.design_id === r.artikelen?.design_id && isImage(f.pad)).forEach((f) => opts.push([f.pad, `${f.soort}: ${f.bestandsnaam}`]));
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
  const kostenEur = kosten.reduce((s, k) => s + Number(k.bedrag_eur), 0);
  const isConcept = po.status === 'concept';
  const geenAanbetaling = po.verkooporder_id && !aanbetaald;

  c.innerHTML = `
    <div class="page-head"><a class="btn small" href="#/inkoop">← Inkooporders</a>
      <h1>Inkooporder ${po.ordernummer}</h1>${badge(PO_STATUS, po.status)}<span class="spacer"></span>
      <a class="btn" href="#/doc/po/${po.id}" target="_blank">📄 Document / PDF</a>
      <button class="btn primary" id="mail">✉️ Mail naar leverancier</button>
    </div>
    ${geenAanbetaling ? `<div class="warnbox">⚠️ Deze inkooporder hoort bij <a href="#/verkoop/${po.verkooporder_id}">verkooporder ${po.verkooporders?.orderbev_nummer || ''}</a>, maar daar is <b>nog geen aanbetaling</b> ontvangen. Verstuur pas na ontvangst van de aanbetaling.</div>` : ''}
    ${po.verkooporder_id && aanbetaald ? `<div class="help">Gekoppeld aan <a href="#/verkoop/${po.verkooporder_id}">verkooporder ${po.verkooporders?.orderbev_nummer || ''}</a> · aanbetaling ontvangen: ${money(aanbetaald)}</div>` : ''}

    <div class="card"><h2>Status</h2>
      <div class="btn-row">${Object.entries(PO_STATUS).filter(([k]) => k !== 'geannuleerd').map(([k, [l]]) =>
        `<button class="btn small ${po.status === k ? 'primary' : ''}" data-status="${k}">${l}</button>`).join('')}
        <span class="spacer" style="flex:1"></span>
        ${po.status !== 'geannuleerd' ? '<button class="btn small danger" data-status="geannuleerd">Annuleren</button>' : ''}
        ${isConcept && !betalingen.length ? '<button class="btn small danger" id="del">Verwijderen</button>' : ''}
      </div>
      ${po.verstuurd_op ? `<p class="small muted">Verstuurd op ${datum(po.verstuurd_op)}</p>` : ''}
    </div>

    <form class="card" id="kop"><h2>Gegevens</h2>
      ${formFields([
        { name: 'leverancier_id', label: 'Leverancier', type: 'select', options: levs.map((l) => [l.id, l.naam]) },
        { name: 'orderdatum', label: 'Orderdatum', type: 'date' },
        { name: 'leverdatum', label: 'Leverdatum (op PO, Engels)' },
        { name: 'voor_wie', label: 'Voor wie?', type: 'select', options: { voorraad: 'Eigen voorraad', klant: 'In opdracht van klant / architect' } },
        { name: 'klant_id', label: 'Klant / architect (alleen intern)', type: 'select', empty: '– geen –', options: klanten.map((k) => [k.id, k.naam]) },
        { name: 'referentie', label: 'Referentie (staat op PO)', hint: 'Leverancier ziet nooit de klantnaam' },
        { name: 'valuta', label: 'Valuta', type: 'select', options: { EUR: 'Euro (€)', USD: 'Dollar ($)' } },
        ...(cur === 'USD' ? [{ name: 'koers_schatting', label: 'Schattingskoers (€ per $1)', type: 'number', step: '0.000001', hint: 'Alleen voor voorraadwaarde tot er betaald is' }] : []),
        { name: 'afleveradres', label: 'Afleveradres (op PO)', type: 'textarea' },
        { name: 'opmerking_lev', label: 'Opmerking voor leverancier (op PO, Engels)', type: 'textarea' },
        { name: 'notities_intern', label: 'Interne notities (niet op PO)', type: 'textarea' },
      ], po)}
      <div class="btn-row" style="margin-top:12px"><button class="btn primary">Opslaan</button>
        ${cur === 'USD' ? '<button class="btn" type="button" id="ecb">ECB-dagkoers ophalen</button>' : ''}</div>
    </form>

    <div class="card"><h2>Regels</h2>
      <div class="table-wrap"><table class="list"><thead><tr><th>Foto op PO</th><th>Artikel</th><th>Omschrijving (Engels)</th><th class="num">Aantal</th><th class="num">Prijs (${cur})</th><th class="num">Totaal</th><th class="num">Ontvangen</th><th></th></tr></thead><tbody>
      ${regels.map((r) => { const opts = fotoOpties(r); return `<tr data-regel="${r.id}">
        <td style="width:150px">${r.foto_pad ? `<img class="thumb" data-path="${esc(r.foto_pad)}" alt="">` : ''}
          ${opts.length ? `<select data-f="foto_pad" style="margin-top:4px;font-size:12px;padding:3px"><option value="">geen foto</option>${opts.map(([p, l]) => `<option value="${esc(p)}" ${p === r.foto_pad ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}</td>
        <td>${r.artikelen ? `<a href="#/artikel/${r.artikelen.id}"><b>${r.artikelen.artikelnummer}</b></a>${r.artikelen.designs?.design_code_lev ? `<br><span class="small muted">${esc(r.artikelen.designs.design_code_lev)}</span>` : ''}` : '<span class="muted">vrije regel</span>'}</td>
        <td><textarea data-f="omschrijving" rows="3">${esc(r.omschrijving || '')}</textarea></td>
        <td class="num" style="width:90px"><input type="number" step="any" data-f="aantal" value="${r.aantal}"></td>
        <td class="num" style="width:120px"><input type="number" step="0.01" data-f="prijs" value="${r.prijs}"></td>
        <td class="num">${money(r.aantal * r.prijs, cur)}</td>
        <td class="num">${num(r.aantal_ontvangen)} / ${num(r.aantal)}
          ${r.aantal_ontvangen < r.aantal && po.status !== 'geannuleerd' ? `<br><button class="btn small ok" data-ontvang="${r.id}" data-rest="${r.aantal - r.aantal_ontvangen}" style="margin-top:4px">Ontvangen</button>` : ''}</td>
        <td>${r.aantal_ontvangen > 0 ? '' : `<button class="btn small danger" data-delregel="${r.id}">✕</button>`}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="toolbar" style="margin-top:12px">
        <div style="flex:1;min-width:260px"><input id="zoek" placeholder="+ Artikel toevoegen: typ artikelnummer of naam…"></div>
        <button class="btn" id="vrij">+ Vrije regel</button>
      </div>
      <p style="text-align:right"><b>Totaal: ${money(totaal, cur)}</b></p>
    </div>

    <div class="card"><h2>Betalingen aan leverancier<span class="spacer"></span><button class="btn small primary" id="betaling">+ Betaling</button></h2>
      ${betalingen.length ? `<table class="list"><thead><tr><th>Datum</th><th>Omschrijving</th><th class="num">Bedrag (${cur})</th>${cur === 'USD' ? '<th class="num">Afgeschreven (€)</th><th class="num">Koers</th>' : ''}<th></th></tr></thead><tbody>
      ${betalingen.map((b) => `<tr><td>${datum(b.datum)}</td><td>${esc(b.omschrijving || '')}</td><td class="num">${money(b.bedrag, cur)}</td>
        ${cur === 'USD' ? `<td class="num">${money(b.bedrag_eur)}</td><td class="num">${(b.bedrag_eur / b.bedrag).toFixed(4)}</td>` : ''}
        <td><button class="btn small danger" data-delbet="${b.id}">✕</button></td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">Nog niets betaald.</p>'}
      <div class="kv" style="margin-top:12px">
        <div><span>Ordertotaal</span><b>${money(totaal, cur)}</b></div>
        <div><span>Betaald</span><b>${money(betaald, cur)}${cur === 'USD' ? ` (= ${money(betaaldEur)})` : ''}</b></div>
        <div><span>Nog te betalen</span><b>${money(totaal - betaald, cur)}</b></div>
      </div>
      ${cur === 'USD' ? '<p class="small muted">De voorraadwaarde wordt berekend met het werkelijk afgeschreven eurobedrag.</p>' : ''}
    </div>

    <div class="card"><h2>Bijkomende kosten (vracht, invoerrechten…)<span class="spacer"></span><button class="btn small" id="kost">+ Kosten</button></h2>
      <p class="small muted">Alleen ter registratie – telt <b>niet</b> mee in de voorraadwaarde.</p>
      ${kosten.length ? `<table class="list"><thead><tr><th>Datum</th><th>Soort</th><th>Omschrijving</th><th class="num">Bedrag (€)</th><th></th></tr></thead><tbody>
      ${kosten.map((k) => `<tr><td>${datum(k.datum)}</td><td>${esc(k.soort)}</td><td>${esc(k.omschrijving || '')}</td><td class="num">${money(k.bedrag_eur)}</td><td><button class="btn small danger" data-delkost="${k.id}">✕</button></td></tr>`).join('')}
      </tbody></table><p style="text-align:right">Totaal kosten: <b>${money(kostenEur)}</b></p>` : ''}
    </div>`;
  loadImages(c);

  // ---- kop opslaan ----
  $('#kop', c).onsubmit = async (e) => {
    e.preventDefault();
    const v = readForm(e.target);
    v.leverancier_id = Number(v.leverancier_id);
    v.klant_id = v.klant_id ? Number(v.klant_id) : null;
    check(await sb.from('inkooporders').update(v).eq('id', po.id));
    toast('Opgeslagen', 'ok'); reload();
  };
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
  artikelPicker($('#zoek', c), async (a) => {
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
    if (f === 'foto_pad' && !val) val = null;
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
