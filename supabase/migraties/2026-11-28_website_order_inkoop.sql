-- Websiteorder: regels die niet op voorraad zijn krijgen 'Bestellen' en er wordt meteen een concept-inkooporder gemaakt.
-- Veilig om opnieuw te draaien.
create or replace function public.website_order_ontvangen(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  nr      text := nullif(trim(p->>'order'), '');
  mail    text := lower(nullif(trim(p->>'email'), ''));
  fa      jsonb := coalesce(nullif(p->'factuuradres', 'null'::jsonb), '{}'::jsonb);
  aa      jsonb := coalesce(nullif(p->'afleveradres', 'null'::jsonb), '{}'::jsonb);
  adr     jsonb;
  naam    text;
  bedrijf text;
  land    text;
  so_id   bigint;
  so_nr   integer;
  f_nr    integer;
  kid     bigint;
  klant_nieuw boolean := false;
  dag     date;
  totaal  numeric;
  app_totaal numeric;
  btw     numeric;
  verzend numeric;
  incl    boolean;
  regeling text := 'nl21';
  r       jsonb;
  i       integer := 0;
  sku     text;
  art     bigint;
  n       numeric;
  gekoppeld integer := 0;
  los     integer := 0;
  moet_bestellen boolean;
  n_po    integer := 0;
  getal   constant text := '[^0-9.\-]';
begin
  if nr is null then raise exception 'Het ordernummer van de website ontbreekt'; end if;

  select id, orderbev_nummer into so_id, so_nr from public.verkooporders where website_order = nr;
  if found then
    return jsonb_build_object('nieuw', false, 'verkooporder_id', so_id, 'ordernummer', so_nr, 'website_order', nr);
  end if;

  adr := case when fa <> '{}'::jsonb then fa else aa end;
  bedrijf := nullif(trim(coalesce(adr->>'bedrijf', p#>>'{klant,bedrijf}', '')), '');
  naam := nullif(trim(coalesce(nullif(trim(adr->>'naam'), ''), concat_ws(' ', p#>>'{klant,voornaam}', p#>>'{klant,achternaam}'), '')), '');
  land := nullif(trim(coalesce(adr->>'land', '')), '');
  dag := coalesce((nullif(p->>'datum', '')::timestamptz at time zone 'Europe/Amsterdam')::date, current_date);
  totaal  := coalesce(nullif(regexp_replace(coalesce(p->>'totaal', ''), getal, '', 'g'), '')::numeric, 0);
  btw     := coalesce(nullif(regexp_replace(coalesce(p->>'btw', ''), getal, '', 'g'), '')::numeric, 0);
  verzend := coalesce(nullif(regexp_replace(coalesce(p->>'verzendkosten', ''), getal, '', 'g'), '')::numeric, 0);
  incl := coalesce(lower(p->>'incl_btw') in ('true', 't', '1', 'ja'), true);
  -- De webshop rekent prijzen inclusief btw en legt zelf geen btw-bedrag vast: altijd 21% inbegrepen (uitzonderingen pas je op de order aan)

  -- klant: bestaande klant met hetzelfde e-mailadres, anders een nieuwe
  if mail is not null then
    select id into kid from public.klanten where lower(email) = mail order by id limit 1;
  end if;
  if kid is null then
    insert into public.klanten (naam, soort, contactpersoon, email, telefoon, adres, postcode_plaats, land, taal, btw_regeling, notities)
    values (coalesce(bedrijf, naam, mail, 'Websiteklant ' || nr),
            case when bedrijf is not null then 'zakelijk' else 'particulier' end,
            case when bedrijf is not null then naam end,
            mail, nullif(trim(coalesce(nullif(adr->>'telefoon', ''), p->>'telefoon', '')), ''),
            nullif(trim(concat_ws(' ', adr->>'adres1', adr->>'adres2')), ''),
            nullif(trim(concat_ws(' ', adr->>'postcode', adr->>'plaats')), ''),
            case when land is null or land ~* '^(nederland|netherlands|the netherlands)$' then 'Nederland' else land end,
            case when land is null or land ~* '^(nederland|netherlands|the netherlands|belgi)' then 'nl' else 'en' end,
            regeling, 'Aangemaakt vanuit websiteorder ' || nr)
    returning id into kid;
    klant_nieuw := true;
  end if;

  begin
    insert into public.verkooporders (klant_id, status, taal, btw_regeling, prijzen_incl_btw, orderdatum, orderbev_datum, klant_referentie,
                                      afleveradres, opmerking, notities_intern, bron, website_order, aanbetaling_pct)
    values (kid, 'offerte', (select taal from public.klanten where id = kid), regeling, incl, dag, dag, 'Website ' || nr,
            case when aa <> '{}'::jsonb and aa is distinct from fa then
              nullif(trim(concat_ws(E'\n', nullif(trim(aa->>'naam'), ''), nullif(trim(aa->>'bedrijf'), ''),
                nullif(trim(concat_ws(' ', aa->>'adres1', aa->>'adres2')), ''), nullif(trim(concat_ws(' ', aa->>'postcode', aa->>'plaats')), ''), nullif(trim(aa->>'land'), ''))), '') end,
            null, nullif(trim(concat_ws(E'\n', 'Doorgezet vanaf de website (order ' || nr || ').', nullif(trim(p->>'opmerking'), ''))), ''),
            'website', nr, 100)
    returning id into so_id;
  exception when unique_violation then
    select id, orderbev_nummer into so_id, so_nr from public.verkooporders where website_order = nr;
    return jsonb_build_object('nieuw', false, 'verkooporder_id', so_id, 'ordernummer', so_nr, 'website_order', nr);
  end;
  -- Op de website betaald: geen orderbevestiging nodig, de factuur staat meteen klaar. Nog niet betaald: gewone orderbevestiging.
  if upper(coalesce(p->>'betaald', '')) = 'PAID' and totaal > 0 then
    f_nr := public.ken_nummer_toe(so_id, 'factuur');
    update public.verkooporders set factuur_datum = dag, orderbev_datum = null where id = so_id;
  else
    so_nr := public.ken_nummer_toe(so_id, 'orderbevestiging');
  end if;

  -- regels: artikel zoeken op artikelnummer (SKU), ook als de voorloopnullen ontbreken
  for r in select value from jsonb_array_elements(case when jsonb_typeof(p->'regels') = 'array' then p->'regels' else '[]'::jsonb end) loop
    n := coalesce(nullif(regexp_replace(coalesce(r->>'aantal', ''), getal, '', 'g'), '')::numeric, 1);
    if n <= 0 then continue; end if;
    sku := nullif(trim(r->>'sku'), ''); art := null;
    if sku is not null then
      select id into art from public.artikelen where upper(artikelnummer) = upper(sku) limit 1;
      if art is null and sku ~ '^[0-9]+$' then
        select id into art from public.artikelen where artikelnummer ~ '^[0-9]+$' and ltrim(artikelnummer, '0') = ltrim(sku, '0') order by id limit 1;
      end if;
    end if;
    if art is null then los := los + 1; else gekoppeld := gekoppeld + 1; end if;
    -- niet (genoeg) op voorraad in de showroom: bestellen bij de leverancier
    moet_bestellen := art is not null
      and exists (select 1 from public.artikelen a where a.id = art and a.soort in ('voorraad', 'maatwerk'))
      and coalesce((select v.in_showroom from public.v_voorraad v where v.artikel_id = art), 0) < n;
    insert into public.verkooporder_regels (verkooporder_id, artikel_id, omschrijving, aantal, prijs, korting_bedrag, notitie, volgorde, bestellen)
    values (so_id, art,
            nullif(trim(concat_ws(' - ', nullif(trim(r->>'titel'), ''), nullif(nullif(trim(r->>'variant'), ''), 'Default Title'))), ''),
            n, coalesce(nullif(regexp_replace(coalesce(r->>'prijs', ''), getal, '', 'g'), '')::numeric, 0),
            -- korting: verschil tussen de stuksprijs en de prijs na alle kortingen (ook kortingscodes), anders het opgegeven kortingsbedrag
            greatest(coalesce(
              (nullif(regexp_replace(coalesce(r->>'prijs', ''), getal, '', 'g'), '')::numeric
                - nullif(regexp_replace(coalesce(r->>'prijs_na_korting', ''), getal, '', 'g'), '')::numeric) * n,
              nullif(regexp_replace(coalesce(r->>'korting', ''), getal, '', 'g'), '')::numeric, 0), 0),
            case when art is null then 'Niet gekoppeld aan een artikel' || coalesce(' (artikelnummer op de website: ' || sku || ')', ' (geen artikelnummer op de website)') end,
            i, moet_bestellen);
    i := i + 1;
  end loop;
  if verzend > 0 then
    insert into public.verkooporder_regels (verkooporder_id, omschrijving, aantal, prijs, volgorde) values (so_id, 'Verzendkosten', 1, verzend, i);
  end if;

  if upper(coalesce(p->>'betaald', '')) = 'PAID' and totaal > 0 then
    insert into public.verkoop_betalingen (verkooporder_id, datum, bedrag, soort, omschrijving) values (so_id, dag, totaal, 'overig', 'Betaald via de website');
  end if;

  -- te bestellen regels: meteen een concept-inkooporder per leverancier (de leverancier ziet alleen de referentie, nooit de klant)
  n_po := public.maak_inkooporders_voor_verkoop(so_id);

  -- controle: komt het totaal overeen met het totaal op de website?
  select t.totaal into app_totaal from public.v_verkooporder_totalen t where t.verkooporder_id = so_id;
  if totaal > 0 and abs(coalesce(app_totaal, 0) - totaal) > 0.05 then
    update public.verkooporders set notities_intern = concat_ws(E'\n', notities_intern,
      'Let op: het totaal op de website is € ' || to_char(totaal, 'FM999G999G990D00') || ', hier € ' || to_char(coalesce(app_totaal, 0), 'FM999G999G990D00') || '. Controleer de regels.')
     where id = so_id;
  end if;

  return jsonb_build_object('nieuw', true, 'verkooporder_id', so_id, 'ordernummer', so_nr, 'factuurnummer', f_nr, 'website_order', nr,
                            'melding', case when f_nr is not null then 'Betaald op de website: factuur ' || f_nr || ' staat klaar' else 'Verkooporder ' || so_nr || ' aangemaakt' end,
                            'totaal_website', totaal, 'totaal_app', app_totaal,
                            'klant_id', kid, 'klant_nieuw', klant_nieuw, 'regels_gekoppeld', gekoppeld, 'regels_los', los, 'inkooporders', n_po);
end $$;

revoke all on function public.website_order_ontvangen(jsonb) from public, anon, authenticated;
grant execute on function public.website_order_ontvangen(jsonb) to service_role;

-- Logboek van wat er van de website binnenkomt (zichtbaar bij Instellingen)
create table if not exists public.website_meldingen (
  id              bigint generated always as identity primary key,
  ontvangen_op    timestamptz not null default now(),
  website_order   text,
  gelukt          boolean not null,
  melding         text,
  verkooporder_id bigint references public.verkooporders(id) on delete set null
);
alter table public.website_meldingen enable row level security;
drop policy if exists ingelogd_lezen on public.website_meldingen;
create policy ingelogd_lezen on public.website_meldingen for select to authenticated using (true);
create index if not exists website_meldingen_tijd on public.website_meldingen (ontvangen_op desc);
create index if not exists website_meldingen_order on public.website_meldingen (verkooporder_id);
