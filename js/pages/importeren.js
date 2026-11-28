// Gegevens uit IOne overnemen: artikelen, beginvoorraad, foto's, inkoop- en verkooporders.
// De import voegt alleen toe. Wat al in de app staat (zelfde artikel- of ordernummer) blijft ongemoeid,
// dus opnieuw importeren kan geen werk overschrijven.
import { sb, check, esc, $, toast, setTitle, alles, confirmBox } from '../ui.js?v=20261128145602';

const BEGIN = 'Beginvoorraad uit IOne';

// ---------- bestanden lezen ----------
function parseCsv(tekst) {
  tekst = tekst.replace(/^﻿/, '');
  const kop = tekst.slice(0, tekst.indexOf('\n'));
  const sep = (kop.match(/;/g) || []).length >= (kop.match(/,/g) || []).length ? ';' : ',';
  const rijen = []; let rij = []; let veld = ''; let q = false;
  for (let i = 0; i < tekst.length; i++) {
    const ch = tekst[i];
    if (q) {
      if (ch === '"') { if (tekst[i + 1] === '"') { veld += '"'; i++; } else q = false; } else veld += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { rij.push(veld); veld = ''; }
    else if (ch === '\n') { rij.push(veld); rijen.push(rij); rij = []; veld = ''; }
    else if (ch !== '\r') veld += ch;
  }
  if (veld !== '' || rij.length) { rij.push(veld); rijen.push(rij); }
  const hoofd = rijen.shift().map((h) => h.trim());
  return rijen.filter((r) => r.some((v) => v.trim() !== '')).map((r) => Object.fromEntries(hoofd.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const SOORTEN = {
  export: ['Artikelen uit je IOne-export', (k) => k.includes('ARTIKELNR') && k.includes('LEVNAAM')],
  niet: ['Artikelen die niet in de export staan', (k) => k.includes('Productnummer leverancier') && k.includes('Omzetgroep')],
  inkoop: ['Inkooporders', (k) => k.includes('Status Ontvangen') && k.includes('Ordernr')],
  verkoop: ['Verkooporders', (k) => k.includes('Status Gefactureerd') && k.includes('Ordernr')],
  fotos: ["Foto's van artikelen", () => false],
};

async function leesBestand(file) {
  const tekst = await file.text();
  if (/\.html?$/i.test(file.name) || tekst.trimStart().startsWith('<!DOCTYPE')) {
    const van = tekst.indexOf('const D=[');
    if (van < 0) return null;
    const tot = tekst.indexOf('];', van);
    const lijst = JSON.parse(tekst.slice(van + 8, tot + 1));
    return { soort: 'fotos', rijen: lijst.filter((d) => d.nr && d.ph?.length) };
  }
  const rijen = parseCsv(tekst);
  if (!rijen.length) return null;
  const kol = Object.keys(rijen[0]);
  const soort = Object.keys(SOORTEN).find((s) => SOORTEN[s][1](kol));
  return soort ? { soort, rijen } : null;
}

// ---------- hulpjes ----------
const eur = (s) => {
  const t = String(s ?? '').replace(/[€\s ]/g, '');
  if (!/\d/.test(t)) return null;
  const neg = t.startsWith('-');
  const n = Number(t.replace(/^-+/, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
};
const getal = (s) => { const n = Number(String(s ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const r2 = (x) => Math.round(x * 100) / 100;
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const isoDatum = (s) => { const m = String(s ?? '').match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };
const pct = (s) => parseInt(s, 10) || 0;
const geld = (n) => '€ ' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const groepeer = (rijen, sleutel) => { const m = new Map(); rijen.forEach((r) => { const k = r[sleutel]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return m; };

// "250 x 200" → lengte 250, breedte 200 (niet bij drie maten zoals 144x48x9)
function maatUit(tekst) {
  const m = String(tekst).match(/(?<![\dx×]\s?)(\d{2,4})(?:[.,]\d)?\s*(?:cm)?\s*[x×]\s*(\d{2,4})(?:[.,]\d)?(?!\s*(?:cm)?\s*[x×]\s*\d)/i);
  if (!m) return {};
  const a = Number(m[1]); const b = Number(m[2]);
  return { lengte_cm: Math.max(a, b), breedte_cm: Math.min(a, b) };
}
function soortUit(tekst) {
  if (/\b(sample|staal|stalen)\b/i.test(tekst)) return 'staal';
  if (/\b(custom|maatwerk)\b/i.test(tekst)) return 'maatwerk';
  return 'voorraad';
}
function contactUit(comm) {
  const delen = String(comm ?? '').split(',').map((d) => d.trim()).filter(Boolean);
  const email = delen.find((d) => /@/.test(d)) || null;
  const tel = delen.filter((d) => !/@/.test(d));
  return { email, telefoon: tel[0] || null, mobiel: tel[1] || null };
}
function adresUit(adres) {
  const a = String(adres ?? '').trim();
  const m = a.match(/^(.*?)\s+(\d{4}\s?[A-Z]{2})\s+(.+)$/);
  return m ? { adres: m[1], postcode_plaats: `${m[2]} ${m[3]}` } : { adres: a || null, postcode_plaats: null };
}

async function inDelen(rijen, grootte, fn, voortgang) {
  const uit = [];
  for (let i = 0; i < rijen.length; i += grootte) {
    uit.push(...(await fn(rijen.slice(i, i + grootte)) || []));
    voortgang?.(Math.min(i + grootte, rijen.length), rijen.length);
  }
  return uit;
}

// Stuksprijs van een orderregel: de IOne-prijs als die klopt met het regeltotaal, anders regeltotaal ÷ aantal.
function stuksprijs(r) {
  const aantal = getal(r.Aantal) || 1; const rt = eur(r.Regeltotaal) || 0; const p = eur(r.Prijs);
  if (aantal > 0 && p !== null && Math.abs(p * aantal - rt) < 0.005) return p;
  return r2(Math.abs(rt / aantal) * (rt < 0 ? -1 : 1));
}

// ---------- plan maken (nog niets opslaan) ----------
async function maakPlan(b) {
  const [levs, klanten, artBestaand, poBestaand, soBestaand, mutBestaand] = await Promise.all([
    alles(() => sb.from('leveranciers').select('id, naam').order('id')),
    alles(() => sb.from('klanten').select('id, naam, postcode_plaats, email').order('id')),
    alles(() => sb.from('artikelen').select('id, artikelnummer, foto_pad, inkoopprijs').order('id')),
    alles(() => sb.from('inkooporders').select('id, ordernummer, inkooporder_regels(count)').order('id')),
    alles(() => sb.from('verkooporders').select('id, orderbev_nummer, klant_id, verkooporder_regels(count)').not('orderbev_nummer', 'is', null).order('id')),
    alles(() => sb.from('voorraad_mutaties').select('artikel_id').eq('soort', 'beginvoorraad').eq('omschrijving', BEGIN).order('id')),
  ]);
  const plan = { waarschuwingen: [] };

  // --- orders groeperen, testregels eruit ---
  const echteRegel = (r) => !(r.Artikelnr === '' && /^testartikel$/i.test(r.Omschrijving) && !eur(r.Regeltotaal)) && getal(r.Aantal) !== null && r.Aantal !== '';
  const poMap = groepeer((b.inkoop || []).filter(echteRegel), 'Ordernr');
  const soMap = groepeer((b.verkoop || []).filter(echteRegel), 'Ordernr');
  plan.testregels = (b.inkoop || []).length + (b.verkoop || []).length - [...poMap.values(), ...soMap.values()].reduce((s, r) => s + r.length, 0);

  // --- leveranciers ---
  const levIdx = new Map(); levs.forEach((l) => { const k = norm(l.naam); if (!levIdx.has(k)) levIdx.set(k, l.id); });
  const levContact = new Map(); (b.inkoop || []).forEach((r) => { if (r.Relatie && !levContact.has(r.Relatie)) levContact.set(r.Relatie, r.Communicatie); });
  const levNamen = new Set([...(b.export || []).map((r) => r.LEVNAAM), ...(b.niet || []).map((r) => r.Leverancier), ...poMap.values()].flatMap((x) => (Array.isArray(x) ? [x[0].Relatie] : [x])).filter(Boolean));
  plan.nieuweLevs = [...levNamen].filter((n) => !levIdx.has(norm(n))).filter((n, i, a) => a.findIndex((x) => norm(x) === norm(n)) === i)
    .map((naam) => ({ naam, ...(({ email, telefoon }) => ({ email, telefoon }))(contactUit(levContact.get(naam))), notities: 'Overgenomen uit IOne' }));

  // --- klanten koppelen ---
  const klIdx = new Map(); klanten.forEach((k) => { const n = norm(k.naam); if (!klIdx.has(n)) klIdx.set(n, []); klIdx.get(n).push(k); });
  const mailIdx = new Map(); klanten.forEach((k) => { if (k.email) mailIdx.set(k.email.toLowerCase(), k); });
  plan.klantVan = new Map(); plan.nieuweKlanten = []; let gekoppeld = 0;
  const nieuwIdx = new Map();
  for (const rs of soMap.values()) {
    const r = rs[0]; const sleutel = `${r.Relatie}|${r.Adres}`;
    if (plan.klantVan.has(sleutel)) continue;
    const naam = r.Relatie.replace(/^[-\s]+/, '').trim() || r.Relatie;
    const c = contactUit(r.Communicatie);
    const kand = klIdx.get(norm(naam)) || [];
    const adresN = norm(r.Adres);
    let hit = kand.length === 1 ? kand[0] : kand.find((k) => k.postcode_plaats && adresN.includes(norm(k.postcode_plaats.split(' ')[0])))
      || kand.find((k) => c.email && k.email && k.email.toLowerCase() === c.email.toLowerCase()) || null;
    if (!hit && !kand.length && c.email) hit = mailIdx.get(c.email.toLowerCase()) || null;
    if (hit) { plan.klantVan.set(sleutel, { id: hit.id }); gekoppeld++; continue; }
    const nk = `${norm(naam)}|${adresN}`;
    if (!nieuwIdx.has(nk)) {
      nieuwIdx.set(nk, plan.nieuweKlanten.length);
      plan.nieuweKlanten.push({ naam, ...adresUit(r.Adres), ...c, notities: 'Overgenomen uit IOne-orders' });
    }
    plan.klantVan.set(sleutel, { nieuw: nieuwIdx.get(nk) });
  }
  plan.klantenGekoppeld = gekoppeld;

  // --- artikelen ---
  const laatstePrijs = (map, veld) => { // nieuwste order eerst → eerste prijs per artikel
    const uit = new Map();
    [...map.values()].sort((x, y) => (isoDatum(y[0].Orderdatum) || '').localeCompare(isoDatum(x[0].Orderdatum) || ''))
      .forEach((rs) => rs.forEach((r) => { const p = eur(r[veld]); if (r.Artikelnr && p > 0 && !uit.has(r.Artikelnr)) uit.set(r.Artikelnr, p); }));
    return uit;
  };
  const ipOrder = laatstePrijs(poMap, 'Prijs'); const vpOrder = laatstePrijs(soMap, 'Prijs');
  const fotoInfo = new Map((b.fotos || []).map((d) => [d.nr, d]));
  const artikelen = new Map();
  (b.niet || []).forEach((r) => {
    const tekst = `${r.Omschrijving} ${r['Aanvullende omschrijving']}`;
    artikelen.set(r.Artikelnr, {
      artikelnummer: r.Artikelnr, naam: r.Omschrijving || `Artikel ${r.Artikelnr}`, omschrijving: r['Aanvullende omschrijving'] || null,
      lev: r.Leverancier, productnr_lev: r['Productnummer leverancier'] || null, inkoopprijs: eur(r['Netto inkoopprijs']) ?? eur(r.Inkoopprijs), verkoopprijs: eur(r.Verkoopprijs),
      omzetgroep: r.Omzetgroep || null, soort: soortUit(tekst), ...maatUit(tekst), voorraad: getal(r.Voorraad) || 0,
    });
  });
  (b.export || []).forEach((r) => {
    const tekst = `${r.ART_OMSCHR} ${r.AANV_OMSCHR}`; const f = fotoInfo.get(r.ARTIKELNR);
    artikelen.set(r.ARTIKELNR, {
      artikelnummer: r.ARTIKELNR, naam: r.ART_OMSCHR || `Artikel ${r.ARTIKELNR}`, omschrijving: r.AANV_OMSCHR || null,
      lev: r.LEVNAAM, productnr_lev: null, inkoopprijs: (f && eur(f.ip)) || ipOrder.get(r.ARTIKELNR) || null, verkoopprijs: (f && eur(f.vp)) || vpOrder.get(r.ARTIKELNR) || null,
      omzetgroep: r.OMZETGROEP || null, soort: soortUit(tekst), ...maatUit(tekst), voorraad: getal(r.VOORRAAD) || 0,
    });
  });
  const artNr = new Map(artBestaand.map((a) => [a.artikelnummer, a]));
  plan.artikelen = artikelen;
  plan.nieuweArtikelen = [...artikelen.values()].filter((a) => !artNr.has(a.artikelnummer));
  plan.artBestaand = artNr;
  const metBegin = new Set(mutBestaand.map((m) => m.artikel_id));
  plan.voorraad = [...artikelen.values()].filter((a) => a.voorraad > 0 && !(artNr.has(a.artikelnummer) && metBegin.has(artNr.get(a.artikelnummer).id)));
  plan.voorraadStuks = plan.voorraad.reduce((s, a) => s + a.voorraad, 0);
  plan.voorraadWaarde = plan.voorraad.reduce((s, a) => s + a.voorraad * (a.inkoopprijs || 0), 0);
  plan.voorraadZonderPrijs = plan.voorraad.filter((a) => !a.inkoopprijs).length;
  plan.negatief = [...artikelen.values()].filter((a) => a.voorraad < 0).length;
  plan.fotos = (b.fotos || []).filter((d) => (artikelen.has(d.nr) || artNr.has(d.nr)) && !artNr.get(d.nr)?.foto_pad);

  // --- orders ---
  const onbekend = new Set();
  const artOk = (nr) => { if (!nr) return true; if (artikelen.has(nr) || artNr.has(nr)) return true; onbekend.add(nr); return true; };
  const poNr = new Map(poBestaand.map((p) => [String(p.ordernummer), p]));
  const soNr = new Map(soBestaand.map((s) => [String(s.orderbev_nummer), s]));
  const leeg = (o, rel) => !o || !(o[rel]?.[0]?.count);
  plan.pos = [...poMap.entries()].filter(([nr]) => leeg(poNr.get(nr), 'inkooporder_regels')).map(([nr, rs]) => ({ nr, rs, id: poNr.get(nr)?.id }));
  plan.sos = [...soMap.entries()].filter(([nr]) => leeg(soNr.get(nr), 'verkooporder_regels')).map(([nr, rs]) => ({ nr, rs, id: soNr.get(nr)?.id }));
  plan.poOver = poMap.size - plan.pos.length; plan.soOver = soMap.size - plan.sos.length;
  plan.soBestaand = soNr;
  [...plan.pos, ...plan.sos].forEach((o) => o.rs.forEach((r) => artOk(r.Artikelnr)));
  if (onbekend.size) plan.waarschuwingen.push(`${onbekend.size} artikelnummer(s) op orders staan niet in de artikelbestanden; die regels komen erin zonder koppeling aan een artikel.`);
  plan.soTotaal = plan.sos.reduce((s, o) => s + o.rs.reduce((t, r) => t + (eur(r.Regeltotaal) || 0), 0), 0);
  plan.poTotaal = plan.pos.reduce((s, o) => s + o.rs.reduce((t, r) => t + (eur(r.Regeltotaal) || 0), 0), 0);
  return plan;
}

// ---------- uitvoeren ----------
async function voerUit(plan, b, log, balk) {
  const stap = (i, n) => balk(i / n);
  // 1. leveranciers
  if (plan.nieuweLevs.length) {
    check(await sb.from('leveranciers').insert(plan.nieuweLevs));
    log(`${plan.nieuweLevs.length} leveranciers toegevoegd`);
  }
  const levs = await alles(() => sb.from('leveranciers').select('id, naam').order('id'));
  const levIdx = new Map(); levs.forEach((l) => { const k = norm(l.naam); if (!levIdx.has(k)) levIdx.set(k, l.id); });
  stap(1, 10);

  // 2. klanten
  let nieuweIds = [];
  if (plan.nieuweKlanten.length) {
    nieuweIds = (await inDelen(plan.nieuweKlanten, 300, async (d) => check(await sb.from('klanten').insert(d).select('id')))).map((k) => k.id);
    log(`${nieuweIds.length} klanten toegevoegd`);
  }
  const klantId = (r) => { const k = plan.klantVan.get(`${r.Relatie}|${r.Adres}`); return k.id ?? nieuweIds[k.nieuw]; };
  stap(2, 10);

  // 3. artikelen
  if (plan.nieuweArtikelen.length) {
    const rijen = plan.nieuweArtikelen.map(({ lev, voorraad, ...a }) => ({
      lengte_cm: null, breedte_cm: null, ...a, leverancier_id: levIdx.get(norm(lev)) ?? null, bron: 'ione',
    }));
    await inDelen(rijen, 400, async (d) => { check(await sb.from('artikelen').upsert(d, { onConflict: 'artikelnummer', ignoreDuplicates: true })); }, (i, n) => stap(2 + i / n, 10));
    log(`${rijen.length} artikelen toegevoegd`);
  }
  const arts = await alles(() => sb.from('artikelen').select('id, artikelnummer, foto_pad').order('id'));
  const artId = new Map(arts.map((a) => [a.artikelnummer, a]));
  stap(3, 10);

  // 4. beginvoorraad
  if (plan.voorraad.length) {
    const rijen = plan.voorraad.filter((a) => artId.has(a.artikelnummer)).map((a) => ({
      artikel_id: artId.get(a.artikelnummer).id, aantal: a.voorraad, soort: 'beginvoorraad', waarde_eur_stuk: a.inkoopprijs || null, omschrijving: BEGIN,
    }));
    await inDelen(rijen, 500, async (d) => { check(await sb.from('voorraad_mutaties').insert(d)); });
    log(`Beginvoorraad geboekt voor ${rijen.length} artikelen (${plan.voorraadStuks} stuks)`);
  }
  stap(4, 10);

  // 5. verkooporders
  const soId = new Map([...plan.soBestaand.entries()].map(([nr, s]) => [nr, s.id]));
  const soKlant = new Map([...plan.soBestaand.entries()].map(([nr, s]) => [nr, s.klant_id]));
  const soRegelVan = new Map(); // "ordernr|artikelnr" → verkoopregel-id
  if (plan.sos.length) {
    const kop = (o) => {
      const r = o.rs[0];
      const totaal = r2(o.rs.reduce((t, x) => t + (eur(x.Regeltotaal) || 0), 0));
      const betaald = eur(r.Aanbetaald) || 0; const aan = eur(r['Aan te betalen']);
      const gefact = pct(r['Status Gefactureerd']) >= 100; const gelev = pct(r['Status Geleverd']) >= 100;
      o.totaal = totaal; o.betaald = betaald; o.klaar = gefact || gelev;
      const btws = new Set(o.rs.map((x) => x.BTW).filter(Boolean));
      return {
        orderbev_nummer: Number(o.nr), klant_id: klantId(r), bron: 'ione', prijzen_incl_btw: true, taal: 'nl',
        status: gefact ? (totaal !== 0 && betaald * Math.sign(totaal) >= Math.abs(totaal) - 0.02 ? 'betaald' : 'gefactureerd') : gelev ? 'geleverd' : 'bevestigd',
        btw_regeling: btws.size === 1 && btws.has('0% BTW') ? 'export0' : 'nl21',
        orderdatum: isoDatum(r.Orderdatum), orderbev_datum: isoDatum(r.Orderdatum),
        aanbetaling_pct: aan !== null && totaal > 0 ? Math.max(0, Math.min(100, Math.round((aan / totaal) * 10000) / 100)) : 0,
        notities_intern: ['Overgenomen uit IOne', r.Behandelaar && `behandelaar ${r.Behandelaar}`, r.Leverdatum && `leverdatum ${r.Leverdatum}`].filter(Boolean).join(' · '),
      };
    };
    const nieuw = plan.sos.filter((o) => !o.id);
    plan.sos.filter((o) => o.id).forEach((o) => kop(o));
    await inDelen(nieuw, 300, async (d) => {
      const res = check(await sb.from('verkooporders').insert(d.map(kop)).select('id, orderbev_nummer, klant_id'));
      res.forEach((x) => { soId.set(String(x.orderbev_nummer), x.id); soKlant.set(String(x.orderbev_nummer), x.klant_id); });
    }, (i, n) => stap(4 + i / n, 10));
    const regels = plan.sos.flatMap((o) => o.rs.map((r) => {
      const aantal = getal(r.Aantal); const rt = eur(r.Regeltotaal) || 0; const p = eur(r.Prijs); const k = eur(r.Korting);
      const notitie = [r['Opmerking / referentie'], k ? `Lijstprijs ${geld(p)}, korting ${geld(Math.abs(k))}` : '', aantal < 0 ? 'Retour (aantal -1 in IOne)' : ''].filter(Boolean).join(' · ');
      return {
        verkooporder_id: soId.get(o.nr), artikel_id: artId.get(r.Artikelnr)?.id ?? null, omschrijving: r.Omschrijving || null,
        aantal: Math.abs(aantal) || 1, prijs: stuksprijs(r), geleverd: o.klaar, volgorde: Number(r.Regel) || 0, notitie: notitie || null,
        _sleutel: `${o.nr}|${r.Artikelnr}`,
      };
    }));
    await inDelen(regels, 500, async (d) => {
      const res = check(await sb.from('verkooporder_regels').insert(d.map(({ _sleutel, ...x }) => x)).select('id'));
      res.forEach((x, i) => { if (!soRegelVan.has(d[i]._sleutel)) soRegelVan.set(d[i]._sleutel, x.id); });
    }, (i, n) => stap(5 + i / n, 10));
    const bet = plan.sos.filter((o) => o.betaald !== 0).map((o) => ({
      verkooporder_id: soId.get(o.nr), datum: isoDatum(o.rs[0].Orderdatum), bedrag: o.betaald,
      soort: o.betaald < 0 || o.betaald >= o.totaal - 0.02 ? 'overig' : 'aanbetaling', omschrijving: o.betaald < 0 ? 'Terugbetaald volgens IOne' : 'Betaald volgens IOne',
    }));
    await inDelen(bet, 500, async (d) => { check(await sb.from('verkoop_betalingen').insert(d)); });
    log(`${plan.sos.length} verkooporders toegevoegd (${regels.length} regels, ${bet.length} betalingen)`);
  }
  stap(6, 10);

  // 6. inkooporders
  if (plan.pos.length) {
    const poId = new Map(plan.pos.filter((o) => o.id).map((o) => [o.nr, o.id]));
    const kop = (o) => {
      const r = o.rs[0];
      const so = o.rs.map((x) => x.Verkooporder).find(Boolean);
      const ontv = pct(r['Status Ontvangen']) >= 100; const bev = pct(r['Status Bevestigd']) >= 100; const best = pct(r['Status Besteld']) >= 100;
      return {
        ordernummer: Number(o.nr), leverancier_id: levIdx.get(norm(r.Relatie)), bron: 'ione', valuta: 'EUR',
        orderdatum: isoDatum(r.Orderdatum), leverdatum: r.Leverdatum || null,
        status: ontv ? 'ontvangen' : bev ? 'bevestigd' : best ? 'verstuurd' : 'concept',
        voor_wie: so && soId.has(so) ? 'klant' : 'voorraad', verkooporder_id: (so && soId.get(so)) || null, klant_id: (so && soKlant.get(so)) || null,
        verstuurd_op: ontv || bev || best ? isoDatum(r.Orderdatum) : null,
        notities_intern: ['Overgenomen uit IOne', r.Behandelaar && `behandelaar ${r.Behandelaar}`].filter(Boolean).join(' · '),
      };
    };
    await inDelen(plan.pos.filter((o) => !o.id), 300, async (d) => {
      const res = check(await sb.from('inkooporders').insert(d.map(kop)).select('id, ordernummer'));
      res.forEach((x) => poId.set(String(x.ordernummer), x.id));
    }, (i, n) => stap(6 + i / n, 10));
    const regels = plan.pos.flatMap((o) => {
      const ontv = pct(o.rs[0]['Status Ontvangen']) >= 100;
      return o.rs.map((r) => {
        const aantal = getal(r.Aantal); const rt = eur(r.Regeltotaal) || 0; const k = eur(r.Korting);
        // klantnaam en opmerking zijn intern: nooit in de omschrijving, die staat op de inkooporder
        const notitie = [r['Opmerking / referentie'], r['Verkocht aan'] && `Verkocht aan ${r['Verkocht aan'].replace(/^[-\s]+/, '')}`, k ? `Korting ${geld(Math.abs(k))}` : '', aantal < 0 ? 'Retour (aantal -1 in IOne)' : ''].filter(Boolean).join(' · ');
        return {
          inkooporder_id: poId.get(o.nr), artikel_id: artId.get(r.Artikelnr)?.id ?? null, omschrijving: r.Omschrijving || null,
          aantal: Math.abs(aantal) || 1, prijs: stuksprijs(r), aantal_ontvangen: ontv ? Math.abs(aantal) || 1 : 0,
          volgorde: Number(r.Regel) || 0, notitie: notitie || null, _so: r.Verkooporder ? `${r.Verkooporder}|${r.Artikelnr}` : null,
        };
      });
    });
    const koppel = [];
    await inDelen(regels, 500, async (d) => {
      const res = check(await sb.from('inkooporder_regels').insert(d.map(({ _so, ...x }) => x)).select('id'));
      res.forEach((x, i) => { const v = d[i]._so && soRegelVan.get(d[i]._so); if (v) koppel.push([v, x.id]); });
    }, (i, n) => stap(7 + i / n, 10));
    for (const [verkoopregel, inkoopregel] of koppel) check(await sb.from('verkooporder_regels').update({ inkoopregel_id: inkoopregel }).eq('id', verkoopregel));
    log(`${plan.pos.length} inkooporders toegevoegd (${regels.length} regels, ${koppel.length} gekoppeld aan een verkoopregel)`);
  }
  stap(8, 10);

  // 7. foto's
  if (plan.fotos.length) {
    let n = 0; let i = 0;
    for (const d of plan.fotos) {
      i++; balk((8 + 2 * i / plan.fotos.length) / 10);
      const a = artId.get(d.nr);
      if (!a || a.foto_pad) continue;
      const blob = await (await fetch(d.ph[0])).blob();
      const pad = `artikelen/ione-${String(d.nr).replace(/[^0-9a-zA-Z]/g, '')}-${Date.now()}.jpg`;
      check(await sb.storage.from('media').upload(pad, blob, { contentType: 'image/jpeg', upsert: false }));
      check(await sb.from('artikelen').update({ foto_pad: pad }).eq('id', a.id));
      n++;
    }
    log(`${n} foto's toegevoegd`);
  }
  balk(1);
}

// ---------- pagina ----------
export async function render(c) {
  setTitle('IOne importeren');
  const bestanden = {};
  c.innerHTML = `
    <div class="page-head"><a class="btn small" href="#/instellingen"><i data-lucide="arrow-left"></i> Instellingen</a><h1>Gegevens uit IOne overnemen</h1></div>
    <div class="card"><h2>1. Kies de bestanden</h2>
      <p class="small">Kies de vijf bestanden tegelijk (of een deel ervan). De app herkent zelf welk bestand wat is.</p>
      <div class="imp-files" id="lijst"></div>
      <label class="btn primary" style="cursor:pointer"><i data-lucide="folder-open"></i> Bestanden kiezen<input type="file" id="kies" multiple accept=".csv,.html,.htm" hidden></label>
    </div>
    <div class="card" id="controle" hidden><h2>2. Controle</h2><div id="plan"></div></div>
    <div class="card" id="uitvoer" hidden><h2>3. Importeren</h2>
      <div class="imp-balk"><i id="balk"></i></div><div class="imp-log" id="log"></div></div>`;

  const tekenLijst = () => {
    $('#lijst', c).innerHTML = Object.entries(SOORTEN).map(([k, [naam]]) => {
      const f = bestanden[k];
      return `<div class="imp-file ${f ? 'ok' : ''}"><i data-lucide="${f ? 'check-circle-2' : 'circle'}"></i><b>${naam}</b>
        <span class="small ${f ? '' : 'muted'}">${f ? `${esc(f.naam)} · ${f.rijen.length.toLocaleString('nl-NL')} ${k === 'fotos' ? 'artikelen met foto' : 'regels'}` : 'Nog niet gekozen'}</span></div>`;
    }).join('');
  };
  tekenLijst();

  let plan = null;
  const tekenPlan = async () => {
    const kaart = $('#controle', c); kaart.hidden = false;
    $('#plan', c).innerHTML = '<p class="muted">Bestanden worden vergeleken met wat al in de app staat…</p>';
    try {
      plan = await maakPlan(Object.fromEntries(Object.entries(bestanden).map(([k, v]) => [k, v.rijen])));
    } catch (e) { console.error(e); $('#plan', c).innerHTML = `<div class="warnbox">Controle mislukt: ${esc(e.message || e)}</div>`; return; }
    const n = (x) => Number(x).toLocaleString('nl-NL');
    const rijen = [
      ['Artikelen toevoegen', n(plan.nieuweArtikelen.length), plan.artikelen.size - plan.nieuweArtikelen.length ? `${n(plan.artikelen.size - plan.nieuweArtikelen.length)} staan er al in en blijven zoals ze zijn` : ''],
      ['Beginvoorraad boeken', `${n(plan.voorraad.length)} artikelen · ${n(plan.voorraadStuks)} stuks`, [`inkoopwaarde ${geld(plan.voorraadWaarde)}`, plan.voorraadZonderPrijs ? `${plan.voorraadZonderPrijs} zonder inkoopprijs` : '', plan.negatief ? `${plan.negatief} met negatieve voorraad worden 0` : ''].filter(Boolean).join(' · ')],
      ["Foto's toevoegen", n(plan.fotos.length), ''],
      ['Leveranciers toevoegen', n(plan.nieuweLevs.length), plan.nieuweLevs.slice(0, 6).map((l) => l.naam).join(', ') + (plan.nieuweLevs.length > 6 ? '…' : '')],
      ['Klanten', `${n(plan.klantenGekoppeld)} gekoppeld · ${n(plan.nieuweKlanten.length)} nieuw`, 'gekoppeld op naam, postcode of e-mail'],
      ['Verkooporders toevoegen', n(plan.sos.length), [`samen ${geld(plan.soTotaal)}`, plan.soOver ? `${n(plan.soOver)} staan er al in` : ''].filter(Boolean).join(' · ')],
      ['Inkooporders toevoegen', n(plan.pos.length), [`samen ${geld(plan.poTotaal)}`, plan.poOver ? `${n(plan.poOver)} staan er al in` : ''].filter(Boolean).join(' · ')],
    ];
    const iets = plan.nieuweArtikelen.length + plan.voorraad.length + plan.fotos.length + plan.sos.length + plan.pos.length;
    $('#plan', c).innerHTML = `
      <table class="list imp-tbl"><tbody>${rijen.map(([a, b2, d]) => `<tr><td><b>${a}</b>${d ? `<br><span class="small muted">${esc(d)}</span>` : ''}</td><td>${b2}</td></tr>`).join('')}</tbody></table>
      ${plan.testregels ? `<p class="small muted" style="margin-top:10px">${plan.testregels} lege testregels ("Testartikel", € 0) worden overgeslagen.</p>` : ''}
      ${plan.waarschuwingen.map((w) => `<div class="warnbox">${esc(w)}</div>`).join('')}
      <p class="small muted" style="margin:12px 0">De import voegt alleen toe. Wat al in de app staat wordt niet gewijzigd of verwijderd, dus je kunt hem veilig opnieuw draaien. De oude orders tellen niet mee in de voorraad; alleen de beginvoorraad doet dat.</p>
      ${iets ? '<button class="btn primary" id="start"><i data-lucide="upload"></i> Importeren</button>' : '<div class="help" style="margin:0">Alles uit deze bestanden staat al in de app. Er valt niets meer te importeren.</div>'}`;
  };

  $('#kies', c).addEventListener('change', async (e) => {
    const onbekend = [];
    for (const f of e.target.files) {
      try {
        const res = await leesBestand(f);
        if (res) bestanden[res.soort] = { naam: f.name, rijen: res.rijen }; else onbekend.push(f.name);
      } catch (err) { console.error(err); onbekend.push(f.name); }
    }
    e.target.value = '';
    if (onbekend.length) toast(`Niet herkend: ${onbekend.join(', ')}`, 'error');
    tekenLijst();
    if (Object.keys(bestanden).length) tekenPlan();
  });

  c.addEventListener('click', async (e) => {
    const knop = e.target.closest('#start');
    if (!knop || knop.disabled) return;
    if (!await confirmBox('De gegevens uit IOne nu in de app zetten? Dit duurt een paar minuten. Laat dit tabblad open tot de import klaar is.', 'Importeren')) return;
    knop.disabled = true;
    $('#uitvoer', c).hidden = false;
    const logEl = $('#log', c); logEl.innerHTML = '';
    const log = (t, fout) => { const d = document.createElement('div'); d.textContent = t; if (fout) d.className = 'fout'; logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight; };
    const balk = (f) => { $('#balk', c).style.width = `${Math.round(f * 100)}%`; };
    balk(0);
    try {
      await voerUit(plan, Object.fromEntries(Object.entries(bestanden).map(([k, v]) => [k, v.rijen])), log, balk);
      log('Klaar. Alles staat in de app.');
      toast('Import klaar', 'ok');
    } catch (err) {
      console.error(err);
      log(`Gestopt door een fout: ${err.message || err}. Wat al is toegevoegd blijft staan; kies "Importeren" opnieuw om de rest aan te vullen.`, true);
    }
    await tekenPlan();
  });
}
