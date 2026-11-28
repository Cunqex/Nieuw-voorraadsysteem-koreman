import { sb, check, $, esc, toast, formFields, readForm, setTitle , bewaakFormulier} from '../ui.js?v=20261128132444';

export async function render(c) {
  setTitle('Instellingen');
  const s = check(await sb.from('instellingen').select('*').eq('id', 1).single());
  c.innerHTML = `
    <div class="page-head"><h1>Instellingen</h1></div>
    <form id="f">
      <div class="card"><h2>Bedrijfsgegevens (staan op alle documenten)</h2>${formFields([
        { name: 'bedrijfsnaam', label: 'Bedrijfsnaam' }, { name: 'adres', label: 'Adres' },
        { name: 'postcode_plaats', label: 'Postcode en plaats' }, { name: 'land', label: 'Land' },
        { name: 'telefoon', label: 'Telefoon' }, { name: 'email', label: 'E-mail' }, { name: 'website', label: 'Website' },
        { name: 'btw_nummer', label: 'Btw-nummer' }, { name: 'kvk_nummer', label: 'KvK-nummer' },
        { name: 'iban', label: 'IBAN' }, { name: 'bic', label: 'BIC' }, { name: 'verkoper', label: 'Verkoper (standaard)' },
      ], s)}</div>
      <div class="card"><h2>Inkoop</h2>${formFields([
        { name: 'afleveradres_inkoop', label: 'Standaard afleveradres op inkooporders (Engels)', type: 'textarea' },
      ], s)}</div>
      <div class="card"><h2>Tekst onderaan offertes, orderbevestigingen en facturen</h2>${formFields([
        { name: 'voorwaarden_nl', label: 'Nederlands', type: 'textarea' },
        { name: 'voorwaarden_en', label: 'Engels', type: 'textarea' },
      ], s)}</div>
      <button class="btn primary">Opslaan</button>
    </form>
    <div class="card" style="margin-top:16px"><h2>Gegevens uit IOne</h2>
      <p class="small" style="margin-bottom:12px">Zet artikelen, voorraad, foto's en de orderhistorie uit IOne in deze app. Je kiest de bestanden, de app controleert ze eerst en laat zien wat er gaat gebeuren.</p>
      <a class="btn" href="#/importeren"><i data-lucide="upload"></i> IOne-bestanden importeren</a></div>
    <div class="card" id="web-kaart"><h2>Website (Shopify)</h2>
      <p class="small" style="margin-bottom:12px">Een bestelling op koremanmaastricht.nl komt vanzelf als verkooporder in deze app. Wat niet op voorraad is, krijgt meteen een concept-inkooporder voor de leverancier.</p>
      <div id="web-status" class="small muted" style="margin-bottom:12px">Koppeling controleren…</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" id="web-check"><i data-lucide="refresh-cw"></i> Opnieuw controleren</button>
        <button type="button" class="btn primary" id="web-koppel" hidden><i data-lucide="link"></i> Koppeling aanzetten</button></div>
      <div id="web-log" style="margin-top:16px"></div></div>
    <div class="card"><h2>Nummering</h2>
      <p class="small">Nieuwe artikelen, inkooporders, offertes, orderbevestigingen en facturen beginnen voorlopig bij <b>9000</b>.
      Wat uit IOne komt, houdt zijn eigen IOne-nummer.</p></div>`;
  $('#f', c).onsubmit = async (e) => {
    e.preventDefault();
    check(await sb.from('instellingen').update({ ...readForm(e.target), bijgewerkt_op: new Date().toISOString() }).eq('id', 1));
    toast('Opgeslagen', 'ok');
  };
  bewaakFormulier($('#f', c), c);

  // ---- Website (Shopify) ----
  const dag = (t) => new Date(t).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const webLog = async () => {
    const { data } = await sb.from('website_meldingen').select('id, ontvangen_op, website_order, gelukt, melding, verkooporder_id').order('ontvangen_op', { ascending: false }).limit(10);
    if (!$('#web-log', c)) return;
    $('#web-log', c).innerHTML = data?.length ? `<h3 style="font-size:13px;margin:0 0 6px">Laatst binnengekomen</h3><table class="list"><tbody>${data.map((m) => `<tr>
      <td class="muted small" style="white-space:nowrap">${esc(dag(m.ontvangen_op))}</td><td><b>${esc(m.website_order || '')}</b></td>
      <td><span class="badge ${m.gelukt ? 'green' : 'red'}">${m.gelukt ? 'Gelukt' : 'Mislukt'}</span></td>
      <td>${m.verkooporder_id ? `<a href="#/verkoop/${m.verkooporder_id}">${esc(m.melding || '')}</a>` : esc(m.melding || '')}</td></tr>`).join('')}</tbody></table>`
      : '<p class="small muted">Er is nog geen bestelling van de website binnengekomen.</p>';
  };
  const webStatus = async (actie) => {
    const el = $('#web-status', c); if (!el) return;
    el.className = 'small muted'; el.textContent = actie === 'koppel' ? 'Koppeling aanzetten…' : 'Koppeling controleren…';
    let r;
    try { const { data, error } = await sb.functions.invoke('website-order', { body: { actie } }); r = error ? { fout: error.message } : data; } catch (e) { r = { fout: e.message }; }
    if (!$('#web-status', c)) return;
    if (r?.fout) { el.className = 'warnbox'; el.textContent = r.fout; $('#web-koppel', c).hidden = true; return; }
    el.className = r.actief ? 'okbox' : 'warnbox';
    el.textContent = r.actief ? `Gekoppeld met ${r.winkel}. Nieuwe bestellingen komen vanzelf binnen.` : `Verbonden met ${r.winkel}, maar bestellingen worden nog niet doorgestuurd. Klik op "Koppeling aanzetten".`;
    $('#web-koppel', c).hidden = !!r.actief;
    if (actie === 'koppel' && r.actief) toast('Koppeling met de website staat aan', 'ok');
  };
  $('#web-check', c).onclick = () => { webStatus('status'); webLog(); };
  $('#web-koppel', c).onclick = () => webStatus('koppel');
  webStatus('status'); webLog();
}
