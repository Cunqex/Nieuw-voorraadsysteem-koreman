import { sb, check, esc, money, datum, badge, PO_STATUS, SO_STATUS, setTitle, vandaag, withTotals } from '../ui.js?v=20261114163500';

export async function render(c) {
  setTitle('Overzicht');
  const [voorraad, pos, sos, uit] = await Promise.all([
    sb.from('v_voorraad').select('voorraad_totaal, voorraadwaarde_eur, bevat_schatting'),
    sb.from('inkooporders').select('id, ordernummer, status, orderdatum, verkooporder_id, leveranciers(naam)').not('status', 'in', '(ontvangen,geannuleerd)').order('orderdatum'),
    sb.from('verkooporders').select('id, offertenummer, orderbev_nummer, factuurnummer, status, orderdatum, aanbetaling_pct, klanten(naam)').not('status', 'in', '(betaald,geannuleerd)').order('orderdatum', { ascending: false }),
    sb.from('uitleningen').select('id, verwacht_terug').is('datum_terug', null),
  ]).then((r) => r.map(check));
  await withTotals(sos, 'v_verkooporder_totalen', 'verkooporder_id');

  const waarde = voorraad.reduce((s, r) => s + Number(r.voorraadwaarde_eur || 0), 0);
  const stuks = voorraad.reduce((s, r) => s + Number(r.voorraad_totaal || 0), 0);
  const schatting = voorraad.some((r) => r.bevat_schatting && Number(r.voorraad_totaal) > 0);
  const concepten = pos.filter((p) => p.status === 'concept');
  const teLaat = uit.filter((u) => u.verwacht_terug && u.verwacht_terug < vandaag());
  const totaalVan = (s) => s._t || {};
  const wachtAanbetaling = sos.filter((s) => s.status === 'bevestigd' && Number(totaalVan(s).betaald || 0) === 0);

  c.innerHTML = `
    <div class="page-head"><h1>Overzicht</h1><span class="spacer"></span>
      <a class="btn" href="#/artikel/new"><i data-lucide="plus"></i> Nieuw artikel</a>
      <a class="btn" href="#/inkoop?nieuw=1"><i data-lucide="plus"></i> Inkooporder</a>
      <a class="btn primary" href="#/verkoop?nieuw=1"><i data-lucide="plus"></i> Verkooporder</a>
    </div>
    <div class="stats">
      <a class="stat" href="#/artikelen?voorraad=1"><div class="num">${money(waarde)}</div><div class="lbl">Voorraadwaarde (${stuks} stuks)${schatting ? ' – deels geschat' : ''}</div></a>
      <a class="stat" href="#/inkoop"><div class="num">${pos.length}</div><div class="lbl">Open inkooporders</div></a>
      <a class="stat" href="#/inkoop?status=concept"><div class="num">${concepten.length}</div><div class="lbl">Inkooporders nog te versturen</div></a>
      <a class="stat" href="#/verkoop"><div class="num">${wachtAanbetaling.length}</div><div class="lbl">Wachten op aanbetaling</div></a>
      <a class="stat" href="#/stalen"><div class="num">${uit.length}</div><div class="lbl">Uitgeleend / op zicht${teLaat.length ? ` (${teLaat.length} te laat)` : ''}</div></a>
    </div>

    <div class="card"><h2>Open verkooporders</h2>
      ${sos.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Nr.</th><th>Klant</th><th>Datum</th><th>Status</th><th class="num">Totaal</th><th class="num">Betaald</th></tr></thead><tbody>
      ${sos.slice(0, 15).map((s) => { const t = totaalVan(s); return `<tr class="click" onclick="location.hash='#/verkoop/${s.id}'">
        <td>${s.factuurnummer ? 'F ' + s.factuurnummer : s.orderbev_nummer ? 'OB ' + s.orderbev_nummer : s.offertenummer ? 'OF ' + s.offertenummer : '–'}</td>
        <td>${esc(s.klanten?.naam)}</td><td>${datum(s.orderdatum)}</td><td>${badge(SO_STATUS, s.status)}</td>
        <td class="num">${money(t.totaal)}</td><td class="num">${money(t.betaald)}</td></tr>`; }).join('')}
      </tbody></table></div>` : '<p class="empty">Geen open verkooporders.</p>'}
    </div>

    <div class="card"><h2>Open inkooporders</h2>
      ${pos.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Nr.</th><th>Leverancier</th><th>Datum</th><th>Status</th></tr></thead><tbody>
      ${pos.slice(0, 15).map((p) => `<tr class="click" onclick="location.hash='#/inkoop/${p.id}'">
        <td>${p.ordernummer}</td><td>${esc(p.leveranciers?.naam)}</td><td>${datum(p.orderdatum)}</td><td>${badge(PO_STATUS, p.status)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="empty">Geen open inkooporders.</p>'}
    </div>`;
}
