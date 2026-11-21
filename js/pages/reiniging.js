// Reiniging: tapijt van een klant aannemen, laten reinigen en weer meegeven. Los van verkooporders.
import {
  sb, check, esc, money, datum, $, on, toast, modal, confirmBox, formFields, readForm, setTitle, vandaag, alles, refresh,
  loadImages, uploadFile, levOpt, klantKiezerHtml, klantKiezerInit, klantKiezerWaarde,
 bewaakFormulier} from '../ui.js?v=20261121154619';

export const RN_STATUS = { aangenomen: 'Aangenomen', bij_reiniger: 'Bij reiniger', klaar: 'Klaar om op te halen', opgehaald: 'Opgehaald', geannuleerd: 'Geannuleerd' };
const KLEUR = { aangenomen: 'blue', bij_reiniger: 'orange', klaar: 'green', opgehaald: '', geannuleerd: 'red' };
const pil = (s) => `<span class="badge ${KLEUR[s] || ''}">${esc(RN_STATUS[s] || s)}</span>`;
export const rnRegelTotaal = (x) => Number(x.prijs || 0) + Number(x.reparatie_prijs || 0);
const totaalVan = (r) => (r.reiniging_regels || []).reduce((s, x) => s + rnRegelTotaal(x), 0);
// Prijs: € 30 per m², elke extra behandeling (Scotchgard, antimot) + € 5 per m²
export const RN_PRIJS_M2 = 30; export const RN_EXTRA_M2 = 5;
export const rnM2 = (l, b) => (Number(l) && Number(b) ? (Number(l) * Number(b)) / 10000 : 0);
export const rnTarief = (sg, am) => RN_PRIJS_M2 + RN_EXTRA_M2 * ((sg ? 1 : 0) + (am ? 1 : 0));
export const rnPrijs = (l, b, sg, am) => Math.round(rnM2(l, b) * rnTarief(sg, am) * 100) / 100;
export const rnExtras = (r) => [r.scotchgard && 'Scotchgard', r.antimot && 'antimot'].filter(Boolean);
const maatTekst = (x) => (x.lengte_cm && x.breedte_cm ? `${Number(x.lengte_cm)} × ${Number(x.breedte_cm)} cm` : '');

// ---------- lijst ----------
export async function renderList(c, _p, query = {}) {
  setTitle('Reiniging');
  c.innerHTML = `
    <div class="page-head"><h1>Reiniging</h1><span class="spacer"></span>
      <button class="btn primary" id="nieuw"><i data-lucide="plus"></i> Nieuwe reiniging</button></div>
    <div class="toolbar">
      <div class="search"><i data-lucide="search"></i><input id="q" placeholder="Zoek op nummer, klant of tapijt…"></div>
      <select id="status"><option value="open">Alle lopende</option><option value="">Alles</option>${Object.entries(RN_STATUS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
      <label class="check"><input type="checkbox" id="onbetaald"> Nog niet betaald</label>
    </div>
    <div class="card flush"><div class="table-wrap" id="tbl"></div></div>`;
  if (query.status !== undefined) $('#status', c).value = query.status;

  const load = async () => {
    const st = $('#status', c).value;
    let rows = await alles(() => {
      let q = sb.from('reinigingen').select('id, nummer, status, datum_binnen, verwacht_klaar, betaald_op, klanten(naam), leveranciers(naam), reiniging_regels(omschrijving, prijs, reparatie_prijs)').order('datum_binnen', { ascending: false }).order('id', { ascending: false });
      if (st === 'open') q = q.not('status', 'in', '(opgehaald,geannuleerd)'); else if (st) q = q.eq('status', st);
      if ($('#onbetaald', c).checked) q = q.is('betaald_op', null).neq('status', 'geannuleerd');
      return q;
    });
    const s = $('#q', c).value.trim().toLowerCase();
    if (s) rows = rows.filter((r) => `${r.nummer} ${r.klanten?.naam} ${(r.reiniging_regels || []).map((x) => x.omschrijving).join(' ')}`.toLowerCase().includes(s));
    $('#tbl', c).innerHTML = rows.length ? `<table class="list"><thead><tr><th>Nr.</th><th>Klant</th><th>Tapijt</th><th>Binnen</th><th>Verwacht klaar</th><th>Reiniger</th><th>Status</th><th class="num">Bedrag</th><th>Betaald</th></tr></thead><tbody>
      ${rows.map((r) => { const laat = r.verwacht_klaar && r.verwacht_klaar < vandaag() && ['aangenomen', 'bij_reiniger'].includes(r.status);
        return `<tr class="click" data-href="#/reiniging/${r.id}"><td><b>${r.nummer}</b></td><td>${esc(r.klanten?.naam || '')}</td>
        <td>${esc((r.reiniging_regels || []).map((x) => x.omschrijving).filter(Boolean).join(', ') || '–')}</td>
        <td>${datum(r.datum_binnen)}</td><td>${r.verwacht_klaar ? `<span class="${laat ? 'laat' : ''}">${datum(r.verwacht_klaar)}</span>` : '–'}</td>
        <td>${esc(r.leveranciers?.naam || '–')}</td><td>${pil(r.status)}</td><td class="num">${money(totaalVan(r))}</td>
        <td>${r.betaald_op ? `<span class="badge green">${datum(r.betaald_op)}</span>` : r.status === 'geannuleerd' ? '–' : '<span class="badge">Nog niet</span>'}</td></tr>`; }).join('')}
      </tbody></table>` : '<p class="empty">Geen reinigingen gevonden. Maak er een aan met "Nieuwe reiniging".</p>';
  };
  on(c, 'click', 'tr.click', (_e, tr) => { location.hash = tr.dataset.href; });
  let t; $('#q', c).addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 200); });
  ['#status', '#onbetaald'].forEach((s) => $(s, c).addEventListener('change', load));

  $('#nieuw', c).onclick = async () => {
    const klanten = await alles(() => sb.from('klanten').select('id, naam, nummer, postcode_plaats, taal, btw_regeling, soort').eq('actief', true).order('naam').order('id'));
    const id = await modal({
      title: 'Nieuwe reiniging',
      body: klantKiezerHtml(klanten, query.klant) + formFields([
        { name: 'omschrijving', label: 'Welk tapijt? *', required: true, full: true, placeholder: 'bv. Perzisch tapijt rood, handgeknoopt' },
        { name: 'lengte_cm', label: 'Lengte (cm)', type: 'number' },
        { name: 'breedte_cm', label: 'Breedte (cm)', type: 'number' },
        { name: 'behandeling', label: 'Wat moet er gebeuren?', placeholder: 'bv. Reinigen, franjes herstellen', default: 'Reinigen', full: true },
        { name: 'scotchgard', label: `Scotchgard (+ € ${RN_EXTRA_M2} per m²)`, type: 'checkbox' },
        { name: 'antimot', label: `Antimot (+ € ${RN_EXTRA_M2} per m²)`, type: 'checkbox' },
        { name: 'prijs', label: 'Prijs reiniging incl. btw (€)', type: 'number', step: '0.01', hint: `Standaard € ${RN_PRIJS_M2} per m²; wordt berekend uit de maat.` },
        { name: 'reparatie', label: 'Reparatie (optioneel)', placeholder: 'bv. franjes herstellen' },
        { name: 'reparatie_prijs', label: 'Prijs reparatie incl. btw (€)', type: 'number', step: '0.01', hint: 'Zelf invullen, verschilt per tapijt.' },
        { name: 'datum_binnen', label: 'Binnengebracht op', type: 'date', default: vandaag() },
        { name: 'verwacht_klaar', label: 'Verwacht klaar', type: 'date' },
      ]),
      submitLabel: 'Aanmaken',
      onOpen: (form) => {
        klantKiezerInit(form);
        let zelf = false;
        const bereken = () => {
          if (zelf) return;
          const p = rnPrijs(form.lengte_cm.value, form.breedte_cm.value, form.scotchgard.checked, form.antimot.checked);
          form.prijs.value = p || '';
          form._handmatig = false;
        };
        ['lengte_cm', 'breedte_cm'].forEach((n) => form[n].addEventListener('input', bereken));
        ['scotchgard', 'antimot'].forEach((n) => form[n].addEventListener('change', bereken));
        form.prijs.addEventListener('input', () => { zelf = form.prijs.value !== ''; form._handmatig = zelf; if (!zelf) bereken(); });
      },
      onSubmit: async (v, form) => {
        const k = await klantKiezerWaarde(v, form, klanten);
        const auto = rnPrijs(v.lengte_cm, v.breedte_cm, v.scotchgard, v.antimot);
        const prijs = v.prijs !== null && v.prijs !== undefined && v.prijs !== '' ? Number(v.prijs) : auto;
        const r = check(await sb.from('reinigingen').insert({ klant_id: k.id, datum_binnen: v.datum_binnen || vandaag(), verwacht_klaar: v.verwacht_klaar || null }).select('id').single());
        check(await sb.from('reiniging_regels').insert({ reiniging_id: r.id, omschrijving: v.omschrijving, lengte_cm: v.lengte_cm || null, breedte_cm: v.breedte_cm || null, behandeling: v.behandeling || null, scotchgard: !!v.scotchgard, antimot: !!v.antimot, reparatie: v.reparatie || (v.reparatie_prijs != null ? 'Reparatie' : null), reparatie_prijs: v.reparatie_prijs ?? null, prijs: prijs || 0, prijs_handmatig: !!form._handmatig && Math.abs((prijs || 0) - auto) > 0.004 }));
        return r.id;
      },
    });
    if (id) location.hash = '#/reiniging/' + id;
  };
  if (query.nieuw) $('#nieuw', c).click();
  await load();
}

// ---------- detail ----------
export async function renderDetail(c, [id]) {
  const reload = refresh; // verse weergave, zodat klik-handlers niet dubbel blijven hangen
  const [rn, regels, levs] = await Promise.all([
    sb.from('reinigingen').select('*, klanten(*), leveranciers(naam)').eq('id', id).single(),
    sb.from('reiniging_regels').select('*').eq('reiniging_id', id).order('volgorde').order('id'),
    sb.from('leveranciers').select('id, naam, nummer').eq('actief', true).order('naam'),
  ]).then((r) => r.map(check));
  setTitle(`Reiniging ${rn.nummer}`);
  const k = rn.klanten || {}; const st = rn.status; const geannuleerd = st === 'geannuleerd';
  const totaal = regels.reduce((s, r) => s + rnRegelTotaal(r), 0);
  const netto = Math.round((totaal / 1.21) * 100) / 100;

  const STAPPEN = [['aangenomen', 'Aangenomen', rn.datum_binnen], ['bij_reiniger', 'Bij reiniger', rn.naar_reiniger_op], ['klaar', 'Klaar', rn.klaar_op], ['opgehaald', 'Opgehaald', rn.opgehaald_op]];
  const nuIdx = STAPPEN.findIndex(([s]) => s === st);
  const VOLG = {
    aangenomen: ['bij_reiniger', 'Naar de reiniger', 'Het tapijt gaat de deur uit naar de reiniger.'],
    bij_reiniger: ['klaar', 'Terug en klaar', 'Het tapijt is terug en kan door de klant worden opgehaald.'],
    klaar: ['opgehaald', 'Opgehaald door klant', 'De klant heeft het tapijt weer meegenomen.'],
  };
  const volg = geannuleerd ? null : VOLG[st];

  const tijdlijn = [];
  const gebeurd = (d, tekst, icoon) => { if (d) tijdlijn.push({ d: String(d).slice(0, 10), tekst, icoon }); };
  gebeurd(rn.datum_binnen, 'Tapijt binnengebracht', 'log-in');
  gebeurd(rn.naar_reiniger_op, `Naar de reiniger${rn.leveranciers?.naam ? ` (${rn.leveranciers.naam})` : ''}`, 'truck');
  gebeurd(rn.klaar_op, 'Terug en klaar om op te halen', 'sparkles');
  gebeurd(rn.opgehaald_op, 'Opgehaald door klant', 'log-out');
  gebeurd(rn.factuur_datum, `Factuur ${rn.factuurnummer ?? ''} gemaakt`, 'receipt');
  gebeurd(rn.betaald_op, `Betaald${rn.betaalwijze ? ` (${rn.betaalwijze})` : ''}: ${money(totaal)}`, 'badge-check');
  tijdlijn.sort((x, y) => x.d.localeCompare(y.d));

  c.innerHTML = `
    <div class="page-head"><a class="btn small" href="#/reiniging"><i data-lucide="arrow-left"></i> Reiniging</a>
      <h1>Reiniging ${rn.nummer}</h1>${pil(st)}<span class="spacer"></span>
      ${!geannuleerd && st !== 'opgehaald' ? '<button class="btn danger small" id="annuleer">Annuleren</button>' : ''}
      ${!rn.factuurnummer ? '<button class="btn danger small" id="del"><i data-lucide="trash-2"></i> Verwijderen</button>' : ''}
    </div>

    <div class="so-kop">
      <div class="so-klant"><span class="kb-l">Klant</span><b class="so-naam">${esc(k.naam || '')}</b>
        <span class="muted small">${esc([k.telefoon || k.mobiel, k.postcode_plaats].filter(Boolean).join(' · ')) || `Klantnr. ${k.nummer ?? ''}`}</span></div>
      <div><span class="kb-l">Totaal incl. btw</span><b class="so-bedrag">${money(totaal)}</b></div>
      <div><span class="kb-l">Betaald</span><b class="so-bedrag ${rn.betaald_op ? 'ok' : 'open'}">${rn.betaald_op ? datum(rn.betaald_op) : 'Nog niet'}</b></div>
      <div><span class="kb-l">Verwacht klaar</span><b class="so-bedrag">${rn.verwacht_klaar ? datum(rn.verwacht_klaar) : '–'}</b></div>
    </div>

    <div class="card"><h2>Voortgang</h2>
      <div class="stepper">${STAPPEN.map(([s, lbl, d], i) => { const cls = geannuleerd ? 'todo' : i < nuIdx || (i === nuIdx && st === 'opgehaald') ? 'done' : i === nuIdx ? 'cur' : 'todo';
        return `<button class="stp ${cls}" data-status="${s}" title="Zet op: ${lbl}"><span class="stp-dot">${cls === 'done' ? '<i data-lucide="check"></i>' : i + 1}</span><span class="stp-lbl">${lbl}</span>${d ? `<span class="stp-sub">${datum(d)}</span>` : ''}</button>`; }).join('')}</div>
      ${geannuleerd ? '<div class="volgende"><div><b>Deze reiniging is geannuleerd.</b></div></div>'
        : volg ? `<div class="volgende"><div><span class="kb-l">Volgende stap</span><b>${volg[1]}</b><span class="small muted">${volg[2]}</span></div><span class="spacer"></span>
            <button class="btn primary" data-status="${volg[0]}">${volg[1]} <i data-lucide="arrow-right"></i></button></div>`
        : !rn.betaald_op ? '<div class="volgende"><div><span class="kb-l">Volgende stap</span><b>Betaling vastleggen</b><span class="small muted">Het tapijt is opgehaald, maar de reiniging is nog niet betaald.</span></div><span class="spacer"></span><button class="btn primary" data-klik="#betaal">Betaald zetten <i data-lucide="arrow-right"></i></button></div>'
        : '<div class="volgende klaar"><div><b>Deze reiniging is afgerond.</b></div></div>'}
      <div class="docs-rij"><span class="kb-l">Documenten</span>
        <a class="btn small" href="#/doc/rn/${rn.id}/bon" target="_blank"><i data-lucide="file-text"></i> Afgiftebewijs</a>
        ${rn.factuurnummer ? `<a class="btn small" href="#/doc/rn/${rn.id}/factuur" target="_blank"><i data-lucide="receipt"></i> Factuur ${rn.factuurnummer}</a>` : '<button class="btn small" id="factuur"><i data-lucide="receipt"></i> Factuur maken</button>'}
      </div>
    </div>

    <div class="card"><h2>Tapijten</h2>
      <div class="lines">${regels.length ? regels.map((r) => { const heeftRep = r.reparatie != null || r.reparatie_prijs != null; return `<div class="line rn-line" data-regel="${r.id}">
        <div class="line-foto">${r.foto_pad ? `<img data-path="${esc(r.foto_pad)}" alt="">` : '<span class="line-nofoto"><i data-lucide="image-off"></i></span>'}
          <label class="btn small" style="cursor:pointer;justify-content:center"><i data-lucide="camera"></i> Foto<input type="file" accept="image/*" data-foto="${r.id}" hidden></label></div>
        <div class="line-main">
          <label class="line-lbl">Welk tapijt<input data-f="omschrijving" value="${esc(r.omschrijving || '')}" placeholder="bv. Perzisch tapijt rood"></label>
          <label class="line-lbl">Wat moet er gebeuren<input data-f="behandeling" value="${esc(r.behandeling || '')}" placeholder="bv. Reinigen"></label>
          <div class="rn-extras"><span>Extra behandeling <small>(+ € ${RN_EXTRA_M2} per m²)</small></span>
            <label class="check"><input type="checkbox" data-x="scotchgard" ${r.scotchgard ? 'checked' : ''}> Scotchgard</label>
            <label class="check"><input type="checkbox" data-x="antimot" ${r.antimot ? 'checked' : ''}> Antimot</label></div>
          <div class="rn-rep" ${heeftRep ? '' : 'hidden'}>
            <span class="rn-rep-kop"><i data-lucide="wrench"></i> Reparatie</span>
            <input data-f="reparatie" value="${esc(r.reparatie || '')}" placeholder="Wat moet er gerepareerd worden? bv. franjes herstellen">
            <label class="rn-rep-prijs">€<input type="number" step="0.01" data-f="reparatie_prijs" value="${r.reparatie_prijs ?? ''}" placeholder="Prijs"></label>
            <button type="button" class="line-del" data-repweg="${r.id}" title="Reparatie weghalen" aria-label="Reparatie weghalen"><i data-lucide="x"></i></button>
          </div>
          ${heeftRep ? '' : `<button type="button" class="btn small rn-rep-knop" data-reptoe><i data-lucide="wrench"></i> Reparatie toevoegen</button>`}
        </div>
        <div class="rn-rechts">
          <div class="line-nums">
            <label class="line-lbl">Lengte (cm)<input type="number" data-f="lengte_cm" value="${r.lengte_cm ?? ''}"></label>
            <label class="line-lbl">Breedte (cm)<input type="number" data-f="breedte_cm" value="${r.breedte_cm ?? ''}"></label>
            <label class="line-lbl">Reiniging incl. btw<input type="number" step="0.01" data-f="prijs" value="${r.prijs ?? 0}"></label>
          </div>
          <div class="rn-prijsinfo">${(() => { const a = rnPrijs(r.lengte_cm, r.breedte_cm, r.scotchgard, r.antimot); const m = rnM2(r.lengte_cm, r.breedte_cm);
            let t;
            if (!m) t = `Vul de maat in, dan wordt de prijs berekend (€ ${rnTarief(r.scotchgard, r.antimot)} per m²).`;
            else {
              const uitleg = `<b>${m.toLocaleString('nl-NL', { maximumFractionDigits: 2 })} m²</b> × € ${rnTarief(r.scotchgard, r.antimot)} = ${money(a)}`;
              t = r.prijs_handmatig && Math.abs(Number(r.prijs) - a) > 0.004 ? `Zelf aangepast · berekend: ${uitleg} · <a href="#" data-auto="${r.id}">gebruiken</a>` : uitleg;
            }
            if (r.reparatie_prijs != null) t += `<div class="rn-regeltot">Reiniging ${money(r.prijs)} + reparatie ${money(r.reparatie_prijs)} = <b>${money(rnRegelTotaal(r))}</b></div>`;
            return t; })()}</div>
        </div>
        <button class="line-del rn-del" data-delregel="${r.id}" title="Tapijt verwijderen" aria-label="Tapijt verwijderen"><i data-lucide="trash-2"></i></button>
      </div>`; }).join('') : '<p class="empty">Nog geen tapijt toegevoegd.</p>'}</div>
      <div class="add-line"><button class="btn" id="regel"><i data-lucide="plus"></i> Nog een tapijt toevoegen</button></div>
      <div class="regel-voet"><p class="small muted">Prijzen zijn inclusief 21% btw.</p>
        <div class="totals"><div><span>Netto</span><span>${money(netto)}</span></div><div><span>21% btw</span><span>${money(totaal - netto)}</span></div>
          <div class="strong"><span>Totaal</span><span>${money(totaal)}</span></div></div></div>
    </div>

    <div class="cols-2">
      <div class="card"><h2>Klant<span class="spacer"></span><a class="btn small" href="#/klant/${rn.klant_id}"><i data-lucide="external-link"></i> Openen</a></h2>
        <dl class="kv"><dt>Naam</dt><dd><b>${esc(k.naam || '')}</b> <span class="muted small">· klantnr. ${k.nummer ?? ''}</span></dd>
          <dt>Telefoon</dt><dd>${esc([k.telefoon, k.mobiel].filter(Boolean).join(' / ')) || '<span class="muted">Niet ingevuld</span>'}</dd>
          <dt>E-mail</dt><dd>${k.email ? `<a href="mailto:${esc(k.email)}">${esc(k.email)}</a>` : '<span class="muted">Niet ingevuld</span>'}</dd>
          <dt>Adres</dt><dd>${esc([k.adres, k.postcode_plaats].filter(Boolean).join(', ')) || '<span class="muted">Niet ingevuld</span>'}</dd></dl>
      </div>
      <div class="card"><h2>Betaling<span class="spacer"></span>${rn.betaald_op ? '<button class="btn small" id="onbetaald">Toch niet betaald</button>' : geannuleerd ? '' : '<button class="btn small primary" id="betaal"><i data-lucide="check"></i> Betaald zetten</button>'}</h2>
        ${rn.betaald_op ? `<p><span class="badge green">Betaald op ${datum(rn.betaald_op)}</span> ${rn.betaalwijze ? esc(rn.betaalwijze) : ''}</p>` : `<p class="muted">Nog niet betaald. Te betalen: <b>${money(totaal)}</b>.</p>`}
        ${rn.kosten_reiniger ? `<p class="small muted" style="margin-top:8px">Kosten reiniger: ${money(rn.kosten_reiniger)} excl. btw · marge ${money(netto - rn.kosten_reiniger)}</p>` : ''}
      </div>
    </div>

    <div class="card"><h2>Tijdlijn</h2>
      <ol class="tijdlijn">${tijdlijn.map((t) => `<li><span class="tl-ic"><i data-lucide="${t.icoon}"></i></span><span class="tl-d">${datum(t.d)}</span><span>${esc(t.tekst)}</span></li>`).join('')}</ol></div>

    <form class="card" id="kop"><h2>Gegevens</h2>
      ${formFields([
        { name: 'reiniger_id', label: 'Uitbesteed aan (reiniger)', type: 'combo', placeholder: 'Kies een leverancier…', options: levs.map(levOpt) },
        { name: 'kosten_reiniger', label: 'Kosten reiniger excl. btw (€)', type: 'number', step: '0.01', hint: 'Intern, staat niet op documenten' },
        { name: 'verwacht_klaar', label: 'Verwacht klaar', type: 'date' },
        { name: 'datum_binnen', label: 'Binnengebracht op', type: 'date' },
        { name: 'naar_reiniger_op', label: 'Naar reiniger op', type: 'date' },
        { name: 'klaar_op', label: 'Terug / klaar op', type: 'date' },
        { name: 'opgehaald_op', label: 'Opgehaald op', type: 'date' },
        { name: 'betaald_op', label: 'Betaald op', type: 'date' },
      ], rn)}
      <div class="g3">${formFields([
        { name: 'opmerking', label: 'Opmerking', type: 'textarea', narrow: true, hint: 'Komt op het afgiftebewijs en de factuur' },
        { name: 'notities_intern', label: 'Interne notities', type: 'textarea', narrow: true, hint: 'Ziet de klant niet' },
      ], rn)}</div>
      <div class="btn-row" style="margin-top:16px"><button class="btn primary">Opslaan</button></div>
    </form>`;
  loadImages(c);

  c.addEventListener('click', (e) => { const b = e.target.closest('[data-klik]'); if (b) $(b.dataset.klik, c)?.click(); });

  // ---- status: datum wordt automatisch vastgelegd ----
  const DATUMVELD = { bij_reiniger: 'naar_reiniger_op', klaar: 'klaar_op', opgehaald: 'opgehaald_op' };
  on(c, 'click', '[data-status]', async (_e, b) => {
    const s = b.dataset.status; if (s === st) return;
    const upd = { status: s };
    if (DATUMVELD[s] && !rn[DATUMVELD[s]]) upd[DATUMVELD[s]] = vandaag();
    check(await sb.from('reinigingen').update(upd).eq('id', id));
    toast(`Status: ${RN_STATUS[s]}`, 'ok'); reload();
  });
  const ann = $('#annuleer', c);
  if (ann) ann.onclick = async () => { if (await confirmBox(`Reiniging ${rn.nummer} annuleren?`, 'Annuleren')) { check(await sb.from('reinigingen').update({ status: 'geannuleerd' }).eq('id', id)); reload(); } };
  const del = $('#del', c);
  if (del) del.onclick = async () => { if (await confirmBox(`Reiniging ${rn.nummer} definitief verwijderen?`, 'Verwijderen')) { check(await sb.from('reinigingen').delete().eq('id', id)); location.hash = '#/reiniging'; } };

  // ---- tapijten ----
  on(c, 'change', '[data-regel] [data-f]', async (_e, el) => {
    const f = el.dataset.f; let v = el.value;
    if (['lengte_cm', 'breedte_cm'].includes(f)) v = v === '' ? null : Number(v);
    if (f === 'prijs') v = Number(v) || 0;
    if (f === 'reparatie_prijs') v = v === '' ? null : Number(v);
    if (f === 'reparatie') v = v.trim();
    const rid = el.closest('[data-regel]').dataset.regel;
    const r = regels.find((x) => String(x.id) === rid) || {};
    const upd = { [f]: v };
    if (f === 'prijs') upd.prijs_handmatig = Math.abs(v - rnPrijs(r.lengte_cm, r.breedte_cm, r.scotchgard, r.antimot)) > 0.004;
    if (['lengte_cm', 'breedte_cm'].includes(f) && !r.prijs_handmatig) { const n = { ...r, ...upd }; upd.prijs = rnPrijs(n.lengte_cm, n.breedte_cm, n.scotchgard, n.antimot); }
    check(await sb.from('reiniging_regels').update(upd).eq('id', rid));
    if (['omschrijving', 'behandeling', 'reparatie'].includes(f)) toast('Opgeslagen', 'ok'); else reload();
  });
  on(c, 'change', '[data-regel] [data-x]', async (_e, el) => {
    const rid = el.closest('[data-regel]').dataset.regel;
    const r = regels.find((x) => String(x.id) === rid) || {};
    const upd = { [el.dataset.x]: el.checked };
    if (!r.prijs_handmatig) { const n = { ...r, ...upd }; upd.prijs = rnPrijs(n.lengte_cm, n.breedte_cm, n.scotchgard, n.antimot); }
    check(await sb.from('reiniging_regels').update(upd).eq('id', rid));
    reload();
  });
  on(c, 'click', '[data-reptoe]', (_e, b) => {
    const blok = b.closest('[data-regel]').querySelector('.rn-rep');
    blok.hidden = false; b.remove(); blok.querySelector('[data-f=reparatie]').focus();
  });
  on(c, 'click', '[data-repweg]', async (_e, b) => {
    check(await sb.from('reiniging_regels').update({ reparatie: null, reparatie_prijs: null }).eq('id', b.dataset.repweg));
    reload();
  });
  on(c, 'click', '[data-auto]', async (e, el) => {
    e.preventDefault();
    const r = regels.find((x) => String(x.id) === el.dataset.auto) || {};
    check(await sb.from('reiniging_regels').update({ prijs: rnPrijs(r.lengte_cm, r.breedte_cm, r.scotchgard, r.antimot), prijs_handmatig: false }).eq('id', r.id));
    reload();
  });
  on(c, 'change', '[data-foto]', async (_e, el) => {
    if (!el.files[0]) return;
    const pad = await uploadFile('reiniging', el.files[0]);
    check(await sb.from('reiniging_regels').update({ foto_pad: pad }).eq('id', el.dataset.foto));
    reload();
  });
  on(c, 'click', '[data-delregel]', async (_e, b) => { if (await confirmBox('Dit tapijt van de reiniging halen?', 'Verwijderen')) { check(await sb.from('reiniging_regels').delete().eq('id', b.dataset.delregel)); reload(); } });
  $('#regel', c).onclick = async () => { check(await sb.from('reiniging_regels').insert({ reiniging_id: id, behandeling: 'Reinigen', volgorde: regels.length })); reload(); };

  // ---- betaling en factuur ----
  const bet = $('#betaal', c);
  if (bet) bet.onclick = async () => {
    const ok = await modal({ title: 'Betaling vastleggen', submitLabel: 'Betaald zetten',
      body: `<p style="margin-bottom:12px">Te betalen: <b>${money(totaal)}</b></p>` + formFields([
        { name: 'betaald_op', label: 'Betaald op', type: 'date', default: vandaag(), required: true },
        { name: 'betaalwijze', label: 'Hoe betaald', type: 'select', options: { pin: 'Pin', contant: 'Contant', overboeking: 'Overboeking', betaalverzoek: 'Betaalverzoek' } },
      ]),
      onSubmit: async (v) => { check(await sb.from('reinigingen').update({ betaald_op: v.betaald_op, betaalwijze: v.betaalwijze }).eq('id', id)); } });
    if (ok) { toast('Betaling vastgelegd', 'ok'); reload(); }
  };
  const onb = $('#onbetaald', c);
  if (onb) onb.onclick = async () => { check(await sb.from('reinigingen').update({ betaald_op: null, betaalwijze: null }).eq('id', id)); reload(); };
  const fac = $('#factuur', c);
  if (fac) fac.onclick = async () => {
    if (!regels.length || !totaal) return toast('Vul eerst een tapijt met een prijs in', 'error');
    if (!await confirmBox('Factuur maken? Er wordt een definitief factuurnummer toegekend, uit dezelfde reeks als je verkoopfacturen.', 'Factuur maken')) return;
    check(await sb.rpc('reiniging_factuur', { p_id: Number(id) }));
    window.open(`#/doc/rn/${id}/factuur`, '_blank'); reload();
  };

  // ---- gegevens ----
  $('#kop', c).onsubmit = async (e) => {
    e.preventDefault();
    const v = readForm(e.target);
    v.reiniger_id = v.reiniger_id ? Number(v.reiniger_id) : null;
    ['kosten_reiniger', 'verwacht_klaar', 'naar_reiniger_op', 'klaar_op', 'opgehaald_op', 'betaald_op'].forEach((f) => { if (v[f] === '' || v[f] === undefined) v[f] = null; });
    if (!v.datum_binnen) delete v.datum_binnen;
    check(await sb.from('reinigingen').update(v).eq('id', id));
    toast('Opgeslagen', 'ok'); reload();
  };
  bewaakFormulier($('#kop', c), c);
}
