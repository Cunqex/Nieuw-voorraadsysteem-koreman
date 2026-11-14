import { sb, check, esc, $, toast, mediaUrl, BTW } from './ui.js?v=20261114121200';

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
    <div><b>${esc(i.bedrijfsnaam)}</b><br>${esc(i.adres)}<br>${esc(i.postcode_plaats)}<br>Tel: ${esc(i.telefoon || '')}</div>
    <div>${t.btwnr}: ${esc(i.btw_nummer || '')}<br>${t.kvk}: ${esc(i.kvk_nummer || '')}<br>IBAN: ${esc(i.iban || '')}<br>BIC: ${esc(i.bic || '')}<br>${esc(i.email || '')}<br>${esc(i.website || '')}</div>
  </div>`;
}

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
    const regels = check(await sb.from('inkooporder_regels').select('*').eq('inkooporder_id', id).order('volgorde').order('id'));
    const cur = po.valuta;
    const tot = regels.reduce((s, r) => s + r.aantal * r.prijs, 0);
    const l = po.leveranciers;
    bestandsnaam = `Purchase order ${po.ordernummer}.pdf`;
    document.title = `Purchase order ${po.ordernummer}`;
    // LET OP: klantnaam staat bewust NIET op de inkooporder, alleen de referentie.
    html = `<div class="a4">${kop(inst)}
      <h1 class="d-title">Purchase order</h1>
      <div class="d-meta">
        <table>
          <tr><td>Purchase order no.</td><td>: ${po.ordernummer}</td></tr>
          <tr><td>Supplier no.</td><td>: ${l.nummer}</td></tr>
          <tr><td>Order date</td><td>: ${d(po.orderdatum)}</td></tr>
          <tr><td>Delivery date</td><td>: ${esc(po.leverdatum || '')}</td></tr>
          ${po.referentie ? `<tr><td>Reference</td><td>: <b>${esc(po.referentie)}</b></td></tr>` : ''}
          <tr><td>Sales person</td><td>: ${esc(inst.verkoper || '')}</td></tr>
        </table>
        <div class="d-addr"><b>${esc(l.naam)}</b>${l.contactpersoon ? '\nAttn. ' + esc(l.contactpersoon) : ''}${l.adres ? '\n' + esc(l.adres) : ''}${l.land ? '\n' + esc(l.land) : ''}${l.telefoon ? '\nT ' + esc(l.telefoon) : ''}${l.email ? '\n@ ' + esc(l.email) : ''}</div>
      </div>
      <table class="d-lines"><thead><tr><th style="width:12mm">Qty</th><th>Description</th><th class="num">Unit price</th><th class="num">Total price</th></tr></thead><tbody>
      ${regels.map((r) => `<tr><td>${Number(r.aantal)}</td><td><div class="d-desc">${esc(r.omschrijving || '')}</div>${r.foto_pad ? `<img class="d-img" data-path="${esc(r.foto_pad)}" alt="">` : ''}</td>
        <td class="num">${fmt(r.prijs, cur)}</td><td class="num">${fmt(r.aantal * r.prijs, cur)}</td></tr>`).join('')}
      </tbody></table>
      <div class="d-bottom">
        <div class="d-addr"><b>Delivery address</b>\n${esc(po.afleveradres || inst.afleveradres_inkoop || '')}</div>
        <table class="d-totals"><tr><td>Total (excl. VAT)</td><td class="num">${fmt(tot, cur)}</td></tr>
          <tr><td>VAT 0%</td><td class="num">${fmt(0, cur)}</td></tr>
          <tr class="strong"><td>Total order amount</td><td class="num">${fmt(tot, cur)}</td></tr></table>
      </div>
      ${po.opmerking_lev ? `<div class="d-note"><b>Remarks</b>\n${esc(po.opmerking_lev)}</div>` : ''}
      <div class="d-note">Please always mention our purchase order number${po.referentie ? ' and reference' : ''} on all correspondence, labels and invoices.</div>
      <div class="d-foot">Page 1 of 1</div></div>`;
  } else {
    const t = T[taal];
    const so = check(await sb.from('verkooporders').select('*, klanten(*)').eq('id', id).single());
    const regels = check(await sb.from('verkooporder_regels').select('*, artikelen(artikelnummer)').eq('verkooporder_id', id).order('volgorde').order('id'));
    const betalingen = check(await sb.from('verkoop_betalingen').select('*').eq('verkooporder_id', id).order('datum'));
    const k = so.klanten;
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
        <table>
          <tr><td>${t.nr[soort]}</td><td>: ${nummer || '–'}</td></tr>
          <tr><td>${t.klantnr}</td><td>: ${k.nummer}</td></tr>
          <tr><td>${t.datum[soort]}</td><td>: ${d(docDatum)}</td></tr>
          ${soort === 'factuur' && so.orderbev_nummer ? `<tr><td>${t.obnr}</td><td>: ${so.orderbev_nummer}</td></tr>` : ''}
          ${so.levermethode ? `<tr><td>${t.levermethode}</td><td>: ${esc(so.levermethode)}</td></tr>` : ''}
          ${so.klant_referentie ? `<tr><td>${t.ref}</td><td>: ${esc(so.klant_referentie)}</td></tr>` : ''}
          <tr><td>${t.verkoper}</td><td>: ${esc(inst.verkoper || '')}</td></tr>
        </table>
        <div class="d-addr"><b>${esc([k.aanhef, k.naam].filter(Boolean).join(' '))}</b>${k.contactpersoon ? '\nt.a.v. ' + esc(k.contactpersoon) : ''}${k.adres ? '\n' + esc(k.adres) : ''}${k.postcode_plaats ? '\n' + esc(k.postcode_plaats) : ''}${k.land && !/^nederland$/i.test(k.land) ? '\n' + esc(k.land) : ''}${k.telefoon ? '\nT ' + esc(k.telefoon) : ''}${k.mobiel ? '\nM ' + esc(k.mobiel) : ''}${k.email ? '\n@ ' + esc(k.email) : ''}</div>
      </div>
      <table class="d-lines"><thead><tr><th style="width:14mm">${t.aantal}</th><th>${t.oms}</th><th class="num">${t.stuks}</th><th class="num">${t.regel}</th></tr></thead><tbody>
      ${regels.map((r) => { const lt = r.aantal * r.prijs * (1 - r.korting_pct / 100); return `<tr><td>${Number(r.aantal)}</td>
        <td>${r.artikelen ? `${r.artikelen.artikelnummer}<br>` : ''}<span class="d-desc">${esc(r.omschrijving || '')}</span>${Number(r.korting_pct) ? `<br><i>${Number(r.korting_pct)}% ${t.korting}</i>` : ''}</td>
        <td class="num">${fmt(r.prijs)}</td><td class="num">${fmt(lt)}</td></tr>`; }).join('')}
      </tbody></table>
      <div class="d-bottom">
        <div>
          <table class="d-totals" style="margin-left:-16px"><tr><td>${t.netto}:</td><td class="num">${fmt(netto)}</td></tr>
            <tr><td>${t.btw} ${btwPct}%</td><td class="num">${fmt(btw)}</td></tr></table>
          ${btwNote ? `<p style="font-size:9pt">${btwNote}</p>` : ''}
          ${so.afleveradres ? `<div class="d-addr" style="margin-top:4mm"><b>${t.aflever}</b>\n${esc(so.afleveradres)}</div>` : ''}
        </div>
        <table class="d-totals">
          <tr class="strong"><td>${t.totaal}</td><td class="num">${fmt(totaal)}</td></tr>
          ${soort === 'orderbevestiging' && Number(so.aanbetaling_pct) > 0 ? `<tr><td>${t.aanbet} (${Number(so.aanbetaling_pct)}%)</td><td class="num">${fmt(aanbet)}</td></tr>` : ''}
          ${soort !== 'offerte' && betaald ? `<tr><td>${t.aanbetaald}${laatsteBet ? ' ' + d(laatsteBet.datum) : ''}:</td><td class="num">${fmt(betaald)}</td></tr>
            <tr class="strong"><td>${t.open}</td><td class="num">${fmt(totaal - betaald)}</td></tr>` : ''}
        </table>
      </div>
      ${so.betaalvoorwaarden ? `<div class="d-note"><b>${t.voorw}:</b> ${esc(so.betaalvoorwaarden)}</div>` : ''}
      ${soort !== 'offerte' && totaal - betaald > 0 ? `<div class="d-note">${esc(t.betaal(inst.iban, `${t.nr[soort]} ${nummer}`))}</div>` : ''}
      ${soort === 'offerte' ? `<div class="d-note">${t.geldig}</div>` : ''}
      ${so.opmerking ? `<div class="d-note">${esc(so.opmerking)}</div>` : ''}
      <div class="d-note">${esc(taal === 'en' ? inst.voorwaarden_en : inst.voorwaarden_nl)}</div>
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
