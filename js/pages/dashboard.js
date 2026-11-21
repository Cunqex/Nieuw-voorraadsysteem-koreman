// Overzicht: kerncijfers, wat er vandaag aandacht nodig heeft, en de lopende orders.
import { sb, check, esc, money, datum, badge, PO_STATUS, SO_STATUS, setTitle, vandaag, withTotals, alles } from '../ui.js?v=20261121124712';

const nrVan = (s) => (s.factuurnummer ? 'F ' + s.factuurnummer : s.orderbev_nummer ? 'OB ' + s.orderbev_nummer : s.offertenummer ? 'OF ' + s.offertenummer : 'Concept');
const groet = () => { const u = new Date().getHours(); return u < 12 ? 'Goedemorgen' : u < 18 ? 'Goedemiddag' : 'Goedenavond'; };

export async function render(c) {
  setTitle('Overzicht');
  const [voorraad, pos, sos, uit] = await Promise.all([
    alles(() => sb.from('v_voorraad').select('artikel_id, voorraad_totaal, voorraadwaarde_eur, bevat_schatting').order('artikel_id')),
    alles(() => sb.from('inkooporders').select('id, ordernummer, status, orderdatum, leveranciers(naam)').not('status', 'in', '(ontvangen,geannuleerd)').order('orderdatum', { ascending: false })),
    alles(() => sb.from('verkooporders').select('id, offertenummer, orderbev_nummer, factuurnummer, status, orderdatum, klanten(naam)').not('status', 'in', '(betaald,geannuleerd)').order('orderdatum', { ascending: false })),
    sb.from('uitleningen').select('id, aantal, datum_uit, verwacht_terug, klanten(naam), artikelen(id, artikelnummer, naam)').is('datum_terug', null).order('verwacht_terug').then(check),
  ]);
  await withTotals(sos, 'v_verkooporder_totalen', 'verkooporder_id');

  const metVoorraad = voorraad.filter((r) => Number(r.voorraad_totaal) > 0);
  const waarde = metVoorraad.reduce((s, r) => s + Number(r.voorraadwaarde_eur || 0), 0);
  const stuks = metVoorraad.reduce((s, r) => s + Number(r.voorraad_totaal || 0), 0);
  const schatting = metVoorraad.some((r) => r.bevat_schatting);
  const t = (s) => s._t || {};
  const openBedrag = (s) => Math.max(0, Number(t(s).totaal || 0) - Number(t(s).betaald || 0));
  const orders = sos.filter((s) => s.status !== 'offerte');
  const offertes = sos.filter((s) => s.status === 'offerte');
  const nogTeOntvangen = orders.reduce((x, s) => x + openBedrag(s), 0);
  const wachtAanbetaling = sos.filter((s) => s.status === 'bevestigd' && Number(t(s).betaald || 0) === 0);
  const teFactureren = sos.filter((s) => s.status === 'geleverd');
  const concepten = pos.filter((p) => p.status === 'concept');
  const onderweg = pos.filter((p) => ['in_productie', 'verzonden'].includes(p.status));
  const teLaat = uit.filter((u) => u.verwacht_terug && u.verwacht_terug < vandaag());

  const tegel = (href, icoon, label, waardeHtml, sub, cls = '') => `<a class="vr-tegel db-tegel ${cls}" href="${href}"><span><i data-lucide="${icoon}"></i> ${label}</span><b>${waardeHtml}</b><small>${sub}</small></a>`;
  const actie = (href, icoon, n, tekst, kleur) => `<a class="db-actie ${n ? kleur : 'rustig'}" href="${href}"><i data-lucide="${icoon}"></i><span>${tekst}</span><b>${n}</b></a>`;
  const voortgang = (s) => { const tot = Number(t(s).totaal || 0); const bet = Number(t(s).betaald || 0); const p = tot ? Math.min(100, Math.round((bet / tot) * 100)) : 0; return `<div class="db-balk" title="${p}% betaald"><i style="width:${p}%"></i></div>`; };

  const nu = new Date();
  c.innerHTML = `
    <div class="page-head db-kop"><div><h1>${groet()}</h1><p class="muted db-datum">${nu.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div><span class="spacer"></span>
      <a class="btn" href="#/artikel/new"><i data-lucide="plus"></i> Nieuw artikel</a>
      <a class="btn" href="#/inkoop?nieuw=1"><i data-lucide="plus"></i> Inkooporder</a>
      <a class="btn primary" href="#/verkoop?nieuw=1"><i data-lucide="plus"></i> Verkooporder</a>
    </div>

    <div class="db-tegels">
      ${tegel('#/artikelen?voorraad=1', 'package', 'Voorraad', `${stuks.toLocaleString('nl-NL')} <em>stuks</em>`, `${metVoorraad.length.toLocaleString('nl-NL')} artikelen · ${money(waarde)}${schatting ? ' (deels geschat)' : ''}`, 'vr-ok')}
      ${tegel('#/verkoop', 'receipt', 'Nog te ontvangen', money(nogTeOntvangen), `van ${orders.length} lopende verkooporder${orders.length === 1 ? '' : 's'}`)}
      ${tegel('#/verkoop', 'file-text', 'Open offertes', offertes.length, `samen ${money(offertes.reduce((x, s) => x + Number(t(s).totaal || 0), 0))}`)}
      ${tegel('#/inkoop', 'truck', 'Open inkoop', pos.length, `${onderweg.length} in productie of onderweg`)}
      ${tegel('#/stalen', 'arrow-left-right', 'Uitgeleend / op zicht', uit.length, teLaat.length ? `${teLaat.length} te laat terug` : 'alles op tijd', teLaat.length ? 'vr-let' : '')}
    </div>

    <div class="db-grid">
      <div class="card db-acties"><h2>Actie nodig</h2>
        ${actie('#/verkoop', 'hourglass', wachtAanbetaling.length, 'Wachten op aanbetaling', 'oranje')}
        ${actie('#/verkoop', 'file-check', teFactureren.length, 'Geleverd, nog factureren', 'oranje')}
        ${actie('#/inkoop?status=concept', 'send', concepten.length, 'Inkooporders nog versturen', 'blauw')}
        ${actie('#/stalen', 'alarm-clock', teLaat.length, 'Uitgeleend en te laat terug', 'rood')}
      </div>
      <div class="card"><h2>Uitgeleend / op zicht<span class="spacer"></span><a class="small" href="#/stalen">Alles bekijken</a></h2>
        ${uit.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Artikel</th><th>Bij</th><th>Terug op</th></tr></thead><tbody>
          ${uit.slice(0, 6).map((u) => `<tr class="click" onclick="location.hash='#/artikel/${u.artikelen?.id}'"><td><b>${esc(u.artikelen?.artikelnummer || '')}</b> ${esc(u.artikelen?.naam || '')}</td><td>${esc(u.klanten?.naam || '–')}</td>
            <td>${u.verwacht_terug ? (u.verwacht_terug < vandaag() ? `<span class="badge red">${datum(u.verwacht_terug)}</span>` : datum(u.verwacht_terug)) : '<span class="muted">–</span>'}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="empty">Niets uitgeleend.</p>'}
      </div>
    </div>

    <div class="card"><h2>Lopende verkooporders<span class="spacer"></span>
        <span class="db-filter">${[['alle', 'Alle'], ['offerte', 'Offertes'], ['orders', 'Orders']].map(([k, l], i) => `<button type="button" class="chip ${i ? '' : 'aan'}" data-f="${k}">${l}</button>`).join('')}</span>
        <a class="small" href="#/verkoop">Alles bekijken</a></h2>
      <div class="table-wrap"><table class="list"><thead><tr><th>Nr.</th><th>Klant</th><th>Datum</th><th>Status</th><th class="num">Totaal</th><th class="num">Nog open</th><th style="width:110px">Betaald</th></tr></thead><tbody id="db-so"></tbody></table></div>
    </div>

    <div class="card"><h2>Open inkooporders<span class="spacer"></span><a class="small" href="#/inkoop">Alles bekijken</a></h2>
      ${pos.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Nr.</th><th>Leverancier</th><th>Datum</th><th>Status</th></tr></thead><tbody>
      ${pos.slice(0, 10).map((p) => `<tr class="click" onclick="location.hash='#/inkoop/${p.id}'"><td>${p.ordernummer}</td><td>${esc(p.leveranciers?.naam)}</td><td>${datum(p.orderdatum)}</td><td>${badge(PO_STATUS, p.status)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="empty">Geen open inkooporders.</p>'}
    </div>`;

  const tekenSo = (f) => {
    const lijst = sos.filter((s) => f === 'alle' || (f === 'offerte' ? s.status === 'offerte' : s.status !== 'offerte')).slice(0, 12);
    c.querySelector('#db-so').innerHTML = lijst.length ? lijst.map((s) => `<tr class="click" onclick="location.hash='#/verkoop/${s.id}'">
      <td><b>${nrVan(s)}</b></td><td>${esc(s.klanten?.naam || '–')}</td><td>${datum(s.orderdatum)}</td><td>${badge(SO_STATUS, s.status)}</td>
      <td class="num">${money(t(s).totaal)}</td><td class="num">${s.status === 'offerte' ? '<span class="muted">–</span>' : (openBedrag(s) > 0.005 ? `<b>${money(openBedrag(s))}</b>` : '<span class="badge green">voldaan</span>')}</td>
      <td>${s.status === 'offerte' ? '' : voortgang(s)}</td></tr>`).join('') : '<tr><td colspan="7" class="empty">Niets gevonden.</td></tr>';
  };
  tekenSo('alle');
  c.querySelector('.db-filter').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; c.querySelectorAll('.db-filter .chip').forEach((x) => x.classList.toggle('aan', x === b)); tekenSo(b.dataset.f); });
}
