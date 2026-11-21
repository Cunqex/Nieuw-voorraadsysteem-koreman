import { sb, check, $, toast, formFields, readForm, setTitle } from '../ui.js?v=20261121144809';

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
    <div class="card"><h2>Nummering</h2>
      <p class="small">Nieuwe artikelen, inkooporders, offertes, orderbevestigingen en facturen beginnen voorlopig bij <b>9000</b>.
      Wat uit IOne komt, houdt zijn eigen IOne-nummer.</p></div>`;
  $('#f', c).onsubmit = async (e) => {
    e.preventDefault();
    check(await sb.from('instellingen').update({ ...readForm(e.target), bijgewerkt_op: new Date().toISOString() }).eq('id', 1));
    toast('Opgeslagen', 'ok');
  };
}
