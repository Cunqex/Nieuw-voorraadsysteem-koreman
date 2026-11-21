import { sb, check, esc, $, toast, mediaUrl, BTW } from './ui.js?v=20261121142910';

const T = {
  nl: {
    offerte: 'Offerte', orderbevestiging: 'Orderbevestiging', factuur: 'Factuur',
    nr: { offerte: 'Offertenr.', orderbevestiging: 'Orderbevestiging nr.', factuur: 'Factuurnr.' },
    datum: { offerte: 'Offertedatum', orderbevestiging: 'Datum', factuur: 'Factuurdatum' },
    klantnr: 'Klant nr.', obnr: 'Orderbevestiging nr.', levermethode: 'Levermethode', verkoper: 'Verkoper', ref: 'Uw referentie',
    adres: 'Factuuradres', aflever: 'Afleveradres', aantal: 'Aantal', oms: 'Omschrijving', stuks: 'Stuksprijs', regel: 'Regeltotaal',
    korting: 'korting', netto: 'Netto', btw: 'BTW', totaal: 'Totaal orderbedrag', aanbet: 'Aanbetaling te voldoen', aanbetaald: 'Aanbetaald',
    open: 'Nog te voldoen', voorw: 'Betaalvoorwaarden', pagina: 'Pagina 1 van 1', btwnr: 'BTW nr.', kvk: 'KvK nr.',
    verlegd: 'BTW verlegd (intracommunautaire levering)', export: 'Export buiten de EU – 0% BTW',
    betaal: (iban, nr) => `Gelieve te betalen op ${iban} onder vermelding van ${nr}.`,
    geldig: 'Deze offerte is 30 dagen geldig.',
  },
  en: {
    offerte: 'Quotation', orderbevestiging: 'Order confirmation', factuur: 'Invoice',
    nr: { offerte: 'Quotation no.', orderbevestiging: 'Order confirmation no.', factuur: 'Invoice no.' },
    datum: { offerte: 'Quotation date', orderbevestiging: 'Date', factuur: 'Invoice date' },
    klantnr: 'Customer no.', obnr: 'Order confirmation no.', levermethode: 'Delivery method', verkoper: 'Sales person', ref: 'Your reference',
    adres: 'Invoice address', aflever: 'Delivery address', aantal: 'Qty', oms: 'Description', stuks: 'Unit price', regel: 'Total',
    korting: 'discount', netto: 'Net', btw: 'VAT', totaal: 'Total order amount', aanbet: 'Down payment due', aanbetaald: 'Paid in advance',
    open: 'Balance due', voorw: 'Payment terms', pagina: 'Page 1 of 1', btwnr: 'VAT no.', kvk: 'CoC no.',
    verlegd: 'VAT reverse charged (intra-Community supply)', export: 'Export outside the EU – 0% VAT',
    betaal: (iban, nr) => `Please transfer the amount to ${iban} stating ${nr}.`,
    geldig: 'This quotation is valid for 30 days.',
  },
};

const fmt = (v, cur = 'EUR') => (cur === 'USD' ? '$ ' : '€ ') + Number(v || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const d = (v) => (v ? new Date(v).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

function kop(i, taal = 'en') {
  const t = T[taal];
  return `<div class="d-head">
    <img class="d-logo" src="img/logo-koreman.jpg" alt="${esc(i.bedrijfsnaam)}">
    <div><b>${esc((i.bedrijfsnaam || '').split(' ')[0])}</b><br>${esc(i.adres)}<br>${esc(i.postcode_plaats)}<br>Tel: ${esc(i.telefoon || '')}</div>
    <div>${t.btwnr}: ${esc(i.btw_nummer || '')}<br>${t.kvk}: ${esc(i.kvk_nummer || '')}<br>IBAN: ${esc(i.iban || '')}<br>BIC: ${esc(i.bic || '')}<br>${esc(i.email || '')}<br>${esc(i.website || '')}</div>
  </div>`;
}
// bedrag zonder valutateken (regels) en adresblok met kopje, T / M / @
const getal = (v) => Number(v || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const teken = (cur) => (cur === 'USD' ? '$' : '€');
const meta = (rijen) => `<table class="d-kv">${rijen.filter(Boolean).map(([l, v], i) => `<tr><td>${l}</td><td>: ${i === 0 ? `<b>${v}</b>` : v}</td></tr>`).join('')}</table>`;
function adresblok(kopje, regels, contact) {
  const c = contact.filter(([, v]) => v);
  return `<div class="d-addr"><b>${kopje}</b>${regels.filter(Boolean).map((r) => `<div>${esc(r)}</div>`).join('')}
    ${c.length ? `<table class="d-contact">${c.map(([l, v]) => `<tr><td>${l}</td><td>${esc(v)}</td></tr>`).join('')}</table>` : ''}</div>`;
}
const totRij = (label, bedrag, cur, vet) => `<tr class="${vet ? 'strong' : ''}"><td>${label}</td><td>${teken(cur)}</td><td class="num">${getal(bedrag)}</td></tr>`;

async function loadHtml2pdf() {
  if (window.html2pdf) return window.html2pdf;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.2/dist/html2pdf.bundle.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  return window.html2pdf;
}

async function fillImages(root) {
  await Promise.all([...root.querySelectorAll('img[data-path]')].map(async (img) => {
    const url = await mediaUrl(img.dataset.path);
    if (!url) { img.remove(); return; }
    img.crossOrigin = 'anonymous';
    await new Promise((res) => { img.onload = res; img.onerror = () => { img.remove(); res(); }; img.src = url; });
  }));
}

export async function render(el, type, id, soort, query) {
  const inst = check(await sb.from('instellingen').select('*').eq('id', 1).single());
  let html; let bestandsnaam; let taal = query.taal || 'nl';

  if (type === 'po') {
    taal = 'en';
    const po = check(await sb.from('inkooporders').select('*, leveranciers(*)').eq('id', id).single());
    const regels = check(await sb.from('inkooporder_regels').select('*, artikelen(foto_pad, designs(hoofdfoto_pad))').eq('inkooporder_id', id).order('volgorde').order('id'));
    // foto van de regel; niets gekozen → foto van het artikel of het design; '' = bewust geen foto
    regels.forEach((r) => { r.foto = r.foto_pad === '' ? null : r.foto_pad || r.artikelen?.foto_pad || r.artikelen?.designs?.hoofdfoto_pad || null; });
    const cur = po.valuta;
    const tot = regels.reduce((s, r) => s + r.aantal * r.prijs, 0);
    const l = po.leveranciers;
    bestandsnaam = `Purchase order ${po.ordernummer}.pdf`;
    document.title = `Purchase order ${po.ordernummer}`;
    // LET OP: klantnaam staat bewust NIET op de inkooporder, alleen de referentie.
    const metFoto = regels.some((r) => r.foto);
    html = `<div class="a4">${kop(inst)}
      <h1 class="d-title">Purchase order</h1>
      <div class="d-meta">
        ${meta([
          ['Purchase order no.', po.ordernummer],
          ['Supplier no.', l.nummer],
          ['Order date', d(po.orderdatum)],
          ['Delivery date', esc(po.leverdatum || '')],
          po.referentie && ['Reference', `<b>${esc(po.referentie)}</b>`],
          ['Sales person', esc(inst.verkoper || '')],
        ])}
        ${adresblok('Supplier', [l.naam, l.contactpersoon && 'Attn. ' + l.contactpersoon, l.adres, l.postcode_plaats, l.land], [['T', l.telefoon], ['@', l.email]])}
      </div>
      <table class="d-lines"><thead><tr>${metFoto ? '<th class="d-fotokol"></th>' : ''}<th class="d-qty">Qty</th><th>Description</th><th class="num">Unit price${cur === 'USD' ? ' (USD)' : ''}</th><th class="num">Total price</th></tr></thead><tbody>
      ${regels.map((r) => `<tr>${metFoto ? `<td class="d-fotokol">${r.foto ? `<img class="d-img" data-path="${esc(r.foto)}" alt="">` : ''}</td>` : ''}
        <td class="d-qty">${Number(r.aantal)}</td><td><div class="d-desc">${esc(r.omschrijving || '')}</div></td>
        <td class="num">${getal(r.prijs)}</td><td class="num">${getal(r.aantal * r.prijs)}</td></tr>`).join('')}
      </tbody></table>
      ${po.opmerking_lev ? `<div class="d-note"><b>Remarks</b>\n${esc(po.opmerking_lev)}</div>` : ''}
      <div class="d-note">Please always mention our purchase order number${po.referentie ? ' and reference' : ''} on all correspondence, labels and invoices.</div>
      <div class="d-bottom">
        <div class="d-addr"><b>Delivery address</b><div class="d-pre">${esc(po.afleveradres || inst.afleveradres_inkoop || '')}</div></div>
        <table class="d-totals">${totRij('Total (excl. VAT)', tot, cur, true)}${totRij('VAT 0%', 0, cur)}${totRij('Total order amount', tot, cur, true)}</table>
      </div>
      <div class="d-foot">Page 1 of 1</div></div>`;
  } else if (type === 'rn') {
    taal = 'nl';
    const rn = check(await sb.from('reinigingen').select('*, klanten(*)').eq('id', id).single());
    const regels = check(await sb.from('reiniging_regels').select('*').eq('reiniging_id', id).order('volgorde').order('id'));
    const k = rn.klanten; const isFactuur = soort === 'factuur';
    const totaal = regels.reduce((s, r) => s + Number(r.prijs || 0), 0);
    const netto = Math.round((totaal / 1.21) * 100) / 100;
    const metFoto = regels.some((r) => r.foto_pad);
    if (isFactuur && !rn.factuurnummer) {
      el.innerHTML = `<div class="doc-bar"><b>Nog geen factuur</b><span style="flex:1"></span><button class="btn small" onclick="history.back()">Terug</button></div>
        <div class="a4"><h1 class="d-title">Factuur</h1><p>Voor deze reiniging is nog geen factuur gemaakt. Gebruik de knop "Factuur maken" bij de reiniging.</p></div>`;
      return;
    }
    document.title = isFactuur ? `Factuur ${rn.factuurnummer}` : `Afgiftebewijs reiniging ${rn.nummer}`;
    bestandsnaam = `${isFactuur ? 'Factuur-' + rn.factuurnummer : 'Reiniging-' + rn.nummer}.pdf`;
    html = `<div class="a4">${kop(inst, 'nl')}
      <h1 class="d-title">${isFactuur ? 'Factuur' : 'Afgiftebewijs reiniging'}</h1>
      <div class="d-meta">
        ${meta([
          isFactuur ? ['Factuurnr.', rn.factuurnummer] : ['Reiniging nr.', rn.nummer],
          ['Klant nr.', k.nummer],
          isFactuur ? ['Factuurdatum', d(rn.factuur_datum)] : ['Binnengebracht', d(rn.datum_binnen)],
          isFactuur && ['Reiniging nr.', rn.nummer],
          !isFactuur && rn.verwacht_klaar && ['Verwacht klaar', d(rn.verwacht_klaar)],
          ['Verkoper', esc(inst.verkoper || '')],
        ])}
        ${adresblok(isFactuur ? 'Factuuradres' : 'Klant', [[k.aanhef, k.naam].filter(Boolean).join(' '), k.adres, k.postcode_plaats], [['T', k.telefoon], ['M', k.mobiel], ['@', k.email]])}
      </div>
      <table class="d-lines"><thead><tr>${metFoto ? '<th class="d-fotokol"></th>' : ''}<th>Tapijt</th><th>Behandeling</th><th class="num">Prijs</th></tr></thead><tbody>
      ${regels.map((r) => `<tr>${metFoto ? `<td class="d-fotokol">${r.foto_pad ? `<img class="d-img" data-path="${esc(r.foto_pad)}" alt="">` : ''}</td>` : ''}
        <td>${esc(r.omschrijving || '')}${r.lengte_cm && r.breedte_cm ? `<br>${Number(r.lengte_cm)} x ${Number(r.breedte_cm)} cm` : ''}</td>
        <td>${esc(r.behandeling || '')}</td><td class="num">${getal(r.prijs)}</td></tr>`).join('')}
      </tbody></table>
      ${rn.opmerking ? `<div class="d-note">${esc(rn.opmerking)}</div>` : ''}
      ${isFactuur
        ? (rn.betaald_op ? `<div class="d-note">Voldaan op ${d(rn.betaald_op)}${rn.betaalwijze ? ' (' + esc(rn.betaalwijze) + ')' : ''}.</div>` : `<div class="d-note">Gelieve te betalen op ${esc(inst.iban || '')} onder vermelding van factuurnr. ${rn.factuurnummer}.</div>`)
        : '<div class="d-note">Bewaar dit bewijs en neem het mee als u het tapijt komt ophalen.</div>'}
      <div class="d-bottom">
        <table class="d-totals d-links"><tr><td>Netto:</td><td>€</td><td class="num">${getal(netto)}</td></tr><tr><td>BTW 21%</td><td>€</td><td class="num">${getal(totaal - netto)}</td></tr></table>
        <table class="d-totals">${totRij(isFactuur ? 'Totaal factuurbedrag' : 'Totaal incl. btw', totaal, 'EUR', true)}
          ${isFactuur && rn.betaald_op ? totRij(`Betaald ${d(rn.betaald_op)}:`, totaal, 'EUR') + totRij('Nog te voldoen', 0, 'EUR', true) : ''}</table>
      </div>
      ${isFactuur && inst.voorwaarden_nl ? `<div class="d-klein">${esc(inst.voorwaarden_nl)}</div>` : ''}
      <div class="d-foot">Pagina 1 van 1</div></div>`;
  } else {
    const t = T[taal];
    const so = check(await sb.from('verkooporders').select('*, klanten(*)').eq('id', id).single());
    const regels = check(await sb.from('verkooporder_regels').select('*, artikelen(artikelnummer, foto_pad, designs(hoofdfoto_pad))').eq('verkooporder_id', id).order('volgorde').order('id'));
    const betalingen = check(await sb.from('verkoop_betalingen').select('*').eq('verkooporder_id', id).order('datum'));
    const k = so.klanten;
    regels.forEach((r) => { r.foto = r.artikelen?.foto_pad || r.artikelen?.designs?.hoofdfoto_pad || null; });
    const metFoto = regels.some((r) => r.foto);
    const nummer = { offerte: so.offertenummer, orderbevestiging: so.orderbev_nummer, factuur: so.factuurnummer }[soort];
    const docDatum = { offerte: so.offerte_datum, orderbevestiging: so.orderbev_datum, factuur: so.factuur_datum }[soort] || so.orderdatum;
    const som = regels.reduce((s, r) => s + r.aantal * r.prijs * (1 - r.korting_pct / 100), 0);
    const btwPct = so.btw_regeling === 'nl21' ? 21 : 0;
    const r2 = (x) => Math.round(x * 100) / 100;
    // orders uit IOne: regelprijzen zijn inclusief btw
    const totaal = r2(btwPct && !so.prijzen_incl_btw ? som * 1.21 : som);
    const netto = r2(btwPct && so.prijzen_incl_btw ? som / 1.21 : som);
    const btw = r2(totaal - netto);
    const betaald = betalingen.reduce((s, b) => s + Number(b.bedrag), 0);
    const aanbet = Math.round(totaal * so.aanbetaling_pct) / 100;
    const laatsteBet = betalingen.at(-1);
    if (!nummer) {
      el.innerHTML = `<div class="doc-bar"><b>Nog geen nummer</b><span style="flex:1"></span><button class="btn small" onclick="history.back()">Terug</button></div>
        <div class="a4"><h1 class="d-title">${t[soort]}</h1><p>Voor dit document is nog geen nummer toegekend. Maak het aan via de knoppen bij "Stappen" in de verkooporder.</p></div>`;
      return;
    }
    bestandsnaam = `${t[soort]} ${nummer}.pdf`;
    document.title = `${t[soort]} ${nummer}`;
    const btwNote = so.btw_regeling === 'eu_verlegd' ? `${t.verlegd}${k.btw_nummer ? ` – ${t.btwnr} ${esc(k.btw_nummer)}` : ''}` : so.btw_regeling === 'export0' ? t.export : '';

    html = `<div class="a4">${kop(inst, taal)}
      <h1 class="d-title">${t[soort]}</h1>
      <div class="d-meta">
        ${meta([
          [t.nr[soort], nummer],
          [t.klantnr, k.nummer],
          [t.datum[soort], d(docDatum)],
          soort === 'factuur' && so.orderbev_nummer && [t.obnr, so.orderbev_nummer],
          so.levermethode && [t.levermethode, esc(so.levermethode)],
          so.klant_referentie && [t.ref, esc(so.klant_referentie)],
          [t.verkoper, esc(inst.verkoper || '')],
        ])}
        ${adresblok(t.adres, [[k.aanhef, k.naam].filter(Boolean).join(' '), k.contactpersoon && (taal === 'en' ? 'Attn. ' : 't.a.v. ') + k.contactpersoon, k.adres, k.postcode_plaats, k.land && !/^nederland$/i.test(k.land) ? k.land : null],
          [['T', k.telefoon], ['M', k.mobiel], ['@', k.email]])}
      </div>
      <table class="d-lines"><thead><tr>${metFoto ? '<th class="d-fotokol"></th>' : ''}<th class="d-qty">${t.aantal}</th><th>${t.oms}</th><th class="num">${t.stuks}</th><th class="num">${t.regel}</th></tr></thead><tbody>
      ${regels.map((r) => { const lt = r.aantal * r.prijs * (1 - r.korting_pct / 100); return `<tr>${metFoto ? `<td class="d-fotokol">${r.foto ? `<img class="d-img" data-path="${esc(r.foto)}" alt="">` : ''}</td>` : ''}<td class="d-qty">${Number(r.aantal)}</td>
        <td>${r.artikelen ? `${esc(r.artikelen.artikelnummer)}<br>` : ''}<span class="d-desc">${esc(r.omschrijving || '')}</span>${Number(r.korting_pct) ? `<br><i>${Number(r.korting_pct)}% ${t.korting}</i>` : ''}</td>
        <td class="num">${getal(r.prijs)}</td><td class="num">${getal(lt)}</td></tr>`; }).join('')}
      </tbody></table>
      ${so.opmerking ? `<div class="d-note">${esc(so.opmerking)}</div>` : ''}
      ${so.afleveradres ? `<div class="d-note"><b>${t.aflever}</b>\n${esc(so.afleveradres)}</div>` : ''}
      ${so.betaalvoorwaarden ? `<div class="d-note"><b>${t.voorw}:</b> ${esc(so.betaalvoorwaarden)}</div>` : ''}
      ${soort !== 'offerte' && totaal - betaald > 0.005 ? `<div class="d-note">${esc(t.betaal(inst.iban, `${t.nr[soort]} ${nummer}`))}</div>` : ''}
      ${soort === 'offerte' ? `<div class="d-note">${t.geldig}</div>` : ''}
      ${btwNote ? `<div class="d-note">${btwNote}</div>` : ''}
      <div class="d-bottom">
        <table class="d-totals d-links"><tr><td>${t.netto}:</td><td>€</td><td class="num">${getal(netto)}</td></tr>
          <tr><td>${t.btw} ${btwPct}%</td><td>€</td><td class="num">${getal(btw)}</td></tr></table>
        <table class="d-totals">
          ${totRij(t.totaal, totaal, 'EUR', true)}
          ${soort === 'orderbevestiging' && Number(so.aanbetaling_pct) > 0 && !betaald ? totRij(`${t.aanbet} (${Number(so.aanbetaling_pct)}%)`, aanbet, 'EUR') : ''}
          ${soort !== 'offerte' && betaald ? totRij(`${t.aanbetaald}${laatsteBet ? ' ' + d(laatsteBet.datum) : ''}:`, betaald, 'EUR') + totRij(t.open, totaal - betaald, 'EUR', true) : ''}
        </table>
      </div>
      ${(taal === 'en' ? inst.voorwaarden_en : inst.voorwaarden_nl) ? `<div class="d-klein">${esc(taal === 'en' ? inst.voorwaarden_en : inst.voorwaarden_nl)}</div>` : ''}
      <div class="d-foot">${t.pagina}</div></div>`;
  }

  const taalKnoppen = type === 'so'
    ? `<a class="btn small" href="#/doc/so/${id}/${soort}?taal=nl">NL</a><a class="btn small" href="#/doc/so/${id}/${soort}?taal=en">EN</a>`
    : '';
  el.innerHTML = `<div class="doc-bar">
      <b>${esc(document.title)}</b><span style="flex:1"></span>${taalKnoppen}
      <button class="btn small" id="pdf"><i data-lucide="download"></i> PDF downloaden</button>
      <button class="btn small" id="print"><i data-lucide="printer"></i> Afdrukken</button>
      <button class="btn small" id="sluit">Sluiten</button>
    </div>${html}`;
  await fillImages(el);

  const pdf = async () => {
    try {
      toast('PDF maken…');
      const h2p = await loadHtml2pdf();
      await h2p().set({
        margin: 0, filename: bestandsnaam, image: { type: 'jpeg', quality: 0.92 },
        html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }).from($('.a4', el)).save();
    } catch (e) { console.error(e); toast('PDF maken mislukt – gebruik Afdrukken → Opslaan als PDF', 'error'); }
  };
  $('#pdf', el).onclick = pdf;
  $('#print', el).onclick = () => window.print();
  $('#sluit', el).onclick = () => { if (window.opener) window.close(); else history.back(); };
  if (query.pdf) pdf();
  void BTW;
}
