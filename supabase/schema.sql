-- =====================================================================
-- Koreman Voorraad App — databaseschema voor Supabase
-- Uitvoeren: Supabase dashboard → SQL Editor → plak dit hele bestand → Run
-- Veilig om één keer uit te voeren op een lege database.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Nummering (alles start voorlopig bij 9000; later aan te passen naar
-- de IOne-reeksen met:  select setval('artikel_nr_seq', <laatste nr>); )
-- ---------------------------------------------------------------------
create sequence if not exists public.artikel_nr_seq      start 9000;
create sequence if not exists public.inkoop_nr_seq       start 9000;
create sequence if not exists public.offerte_nr_seq      start 9000;
create sequence if not exists public.orderbev_nr_seq     start 9000;
create sequence if not exists public.factuur_nr_seq      start 9000;
create sequence if not exists public.leverancier_nr_seq  start 9000;
create sequence if not exists public.klant_nr_seq        start 9000;

-- ---------------------------------------------------------------------
-- Instellingen (bedrijfsgegevens voor documenten) — één rij
-- ---------------------------------------------------------------------
create table public.instellingen (
  id            smallint primary key default 1 check (id = 1),
  bedrijfsnaam  text not null default 'Koreman',
  adres         text not null default 'Helmstraat 12',
  postcode_plaats text not null default '6211 TA MAASTRICHT',
  land          text not null default 'Nederland',
  telefoon      text default '043 321 2926',
  email         text default 'info@koremanmaastricht.nl',
  website       text default 'www.koremanmaastricht.nl',
  btw_nummer    text default 'NL856189790B01',
  kvk_nummer    text default '65620917',
  iban          text default 'NL93RABO0309129524',
  bic           text default 'RABONL2U',
  verkoper      text default 'R. Koreman',
  afleveradres_inkoop text default E'Helmstraat 12\n6211 TA MAASTRICHT\nThe Netherlands',
  voorwaarden_nl text default 'Op al onze leveringen zijn onze algemene voorwaarden van toepassing.',
  voorwaarden_en text default 'All deliveries are subject to our general terms and conditions.',
  bijgewerkt_op timestamptz not null default now()
);
insert into public.instellingen (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------
-- Leveranciers
-- ---------------------------------------------------------------------
create table public.leveranciers (
  id             bigint generated always as identity primary key,
  nummer         integer not null unique default nextval('public.leverancier_nr_seq'),
  naam           text not null,
  contactpersoon text,
  email          text,
  telefoon       text,
  adres          text,
  land           text default 'India',
  valuta         text not null default 'EUR' check (valuta in ('EUR','USD')),
  notities       text,
  actief         boolean not null default true,
  aangemaakt_op  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Klanten (incl. architecten, zakelijk, particulier)
-- ---------------------------------------------------------------------
create table public.klanten (
  id             bigint generated always as identity primary key,
  nummer         integer not null unique default nextval('public.klant_nr_seq'),
  aanhef         text,
  naam           text not null,
  soort          text not null default 'particulier'
                 check (soort in ('particulier','zakelijk','architect','agent')),
  contactpersoon text,
  email          text,
  telefoon       text,
  mobiel         text,
  adres          text,
  postcode_plaats text,
  land           text default 'Nederland',
  btw_nummer     text,
  taal           text not null default 'nl' check (taal in ('nl','en')),
  btw_regeling   text not null default 'nl21'
                 check (btw_regeling in ('nl21','eu_verlegd','export0')),
  notities       text,
  actief         boolean not null default true,
  aangemaakt_op  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Designs (bv. JO#8010 "Fawn") met foto's en CAD's
-- ---------------------------------------------------------------------
create table public.designs (
  id                 bigint generated always as identity primary key,
  naam               text not null,
  leverancier_id     bigint references public.leveranciers(id) on delete set null,
  design_code_lev    text,               -- designnaam/-code van de leverancier (staat op het staal)
  omschrijving       text,
  hoofdfoto_pad      text,               -- pad in storage-bucket 'media'
  notities           text,
  aangemaakt_op      timestamptz not null default now()
);
create index on public.designs (leverancier_id);

create table public.design_bestanden (
  id            bigint generated always as identity primary key,
  design_id     bigint not null references public.designs(id) on delete cascade,
  pad           text not null,
  bestandsnaam  text,
  soort         text not null default 'foto' check (soort in ('foto','cad','overig')),
  aangemaakt_op timestamptz not null default now()
);
create index on public.design_bestanden (design_id);

-- ---------------------------------------------------------------------
-- Artikelen
-- ---------------------------------------------------------------------
create table public.artikelen (
  id                  bigint generated always as identity primary key,
  artikelnummer       integer not null unique default nextval('public.artikel_nr_seq'),
  soort               text not null default 'voorraad'
                      check (soort in ('voorraad','maatwerk','staal','dienst')),
  naam                text not null,
  omschrijving        text,               -- aanvullende omschrijving (materiaal, designnr, maat)
  design_id           bigint references public.designs(id) on delete set null,
  leverancier_id      bigint references public.leveranciers(id) on delete set null,
  productnr_lev       text,
  breedte_cm          numeric(8,1),
  lengte_cm           numeric(8,1),
  vorm                text,               -- recht, rond, ovaal, organisch, afgeronde hoeken
  materiaal           text,
  techniek            text,
  kleurcode           text,
  poolhoogte          text,
  gewicht_kg          numeric(8,2),
  hs_code             text,
  inkoopprijs         numeric(12,2),      -- per stuk, in valuta van de leverancier
  inkoopprijs_m2      numeric(12,2),
  verkoopprijs        numeric(12,2),      -- per stuk, EUR incl. btw (winkelprijs)
  verkoopprijs_m2     numeric(12,2),
  foto_pad            text,               -- eigen foto; anders hoofdfoto van design
  actief              boolean not null default true,
  notities            text,
  aangemaakt_op       timestamptz not null default now()
);
create index on public.artikelen (design_id);
create index on public.artikelen (leverancier_id);

-- ---------------------------------------------------------------------
-- Inkooporders
-- ---------------------------------------------------------------------
create table public.inkooporders (
  id                bigint generated always as identity primary key,
  ordernummer       integer not null unique default nextval('public.inkoop_nr_seq'),
  leverancier_id    bigint not null references public.leveranciers(id),
  orderdatum        date not null default current_date,
  leverdatum        text default 'As soon as possible, unless otherwise stated',
  status            text not null default 'concept'
                    check (status in ('concept','verstuurd','bevestigd','in_productie','verzonden','ontvangen','geannuleerd')),
  voor_wie          text not null default 'voorraad' check (voor_wie in ('voorraad','klant')),
  klant_id          bigint references public.klanten(id) on delete set null,  -- INTERN, nooit op PO
  referentie        text,                 -- interne referentie, wél op PO
  verkooporder_id   bigint,               -- FK hieronder toegevoegd
  valuta            text not null default 'EUR' check (valuta in ('EUR','USD')),
  koers_schatting   numeric(10,6),        -- EUR per 1 USD, alleen schatting tot betaald
  afleveradres      text,
  opmerking_lev     text,                 -- op de PO (Engels)
  notities_intern   text,
  verstuurd_op      timestamptz,
  aangemaakt_op     timestamptz not null default now()
);
create index on public.inkooporders (leverancier_id);
create index on public.inkooporders (klant_id);
create index on public.inkooporders (status);

create table public.inkooporder_regels (
  id              bigint generated always as identity primary key,
  inkooporder_id  bigint not null references public.inkooporders(id) on delete cascade,
  artikel_id      bigint references public.artikelen(id) on delete set null,
  omschrijving    text,
  aantal          numeric(10,2) not null default 1 check (aantal > 0),
  prijs           numeric(12,2) not null default 0,   -- per stuk, valuta van de PO
  foto_pad        text,                               -- gekozen foto/CAD voor deze regel
  aantal_ontvangen numeric(10,2) not null default 0,
  volgorde        integer not null default 0
);
create index on public.inkooporder_regels (inkooporder_id);
create index on public.inkooporder_regels (artikel_id);

-- Betalingen aan leverancier (bedrag in PO-valuta + werkelijk afgeschreven EUR)
create table public.inkoop_betalingen (
  id              bigint generated always as identity primary key,
  inkooporder_id  bigint not null references public.inkooporders(id) on delete cascade,
  datum           date not null default current_date,
  bedrag          numeric(12,2) not null,          -- in valuta van de PO
  bedrag_eur      numeric(12,2) not null,          -- werkelijk afgeschreven in euro
  omschrijving    text,
  aangemaakt_op   timestamptz not null default now()
);
create index on public.inkoop_betalingen (inkooporder_id);

-- Bijkomende kosten (vracht, invoerrechten) — telt NIET mee in voorraadwaarde
create table public.inkoop_kosten (
  id              bigint generated always as identity primary key,
  inkooporder_id  bigint not null references public.inkooporders(id) on delete cascade,
  datum           date not null default current_date,
  soort           text not null default 'vracht'
                  check (soort in ('vracht','invoerrechten','inklaring','verzekering','overig')),
  bedrag_eur      numeric(12,2) not null,
  omschrijving    text
);
create index on public.inkoop_kosten (inkooporder_id);

-- ---------------------------------------------------------------------
-- Verkooporders (offerte → orderbevestiging → factuur), altijd in EUR
-- ---------------------------------------------------------------------
create table public.verkooporders (
  id                 bigint generated always as identity primary key,
  offertenummer      integer unique,
  orderbev_nummer    integer unique,
  factuurnummer      integer unique,
  klant_id           bigint not null references public.klanten(id),
  status             text not null default 'offerte'
                     check (status in ('offerte','bevestigd','geleverd','gefactureerd','betaald','geannuleerd')),
  taal               text not null default 'nl' check (taal in ('nl','en')),
  btw_regeling       text not null default 'nl21' check (btw_regeling in ('nl21','eu_verlegd','export0')),
  orderdatum         date not null default current_date,
  offerte_datum      date,
  orderbev_datum     date,
  factuur_datum      date,
  aanbetaling_pct    numeric(5,2) not null default 50,
  betaalvoorwaarden  text,
  levermethode       text,
  afleveradres       text,
  klant_referentie   text,
  opmerking          text,               -- op documenten
  notities_intern    text,
  aangemaakt_op      timestamptz not null default now()
);
create index on public.verkooporders (klant_id);
create index on public.verkooporders (status);

alter table public.inkooporders
  add constraint inkooporders_verkooporder_fk
  foreign key (verkooporder_id) references public.verkooporders(id) on delete set null;
create index on public.inkooporders (verkooporder_id);

create table public.verkooporder_regels (
  id               bigint generated always as identity primary key,
  verkooporder_id  bigint not null references public.verkooporders(id) on delete cascade,
  artikel_id       bigint references public.artikelen(id) on delete set null,
  omschrijving     text,
  aantal           numeric(10,2) not null default 1 check (aantal > 0),
  prijs            numeric(12,2) not null default 0,  -- per stuk, EUR excl. btw
  korting_pct      numeric(5,2) not null default 0,
  bestellen        boolean not null default false,    -- moet bij leverancier besteld worden
  inkoopregel_id   bigint references public.inkooporder_regels(id) on delete set null,
  geleverd         boolean not null default false,
  volgorde         integer not null default 0
);
create index on public.verkooporder_regels (verkooporder_id);
create index on public.verkooporder_regels (artikel_id);
create index on public.verkooporder_regels (inkoopregel_id);

create table public.verkoop_betalingen (
  id               bigint generated always as identity primary key,
  verkooporder_id  bigint not null references public.verkooporders(id) on delete cascade,
  datum            date not null default current_date,
  bedrag           numeric(12,2) not null,
  soort            text not null default 'aanbetaling' check (soort in ('aanbetaling','restbetaling','overig')),
  omschrijving     text
);
create index on public.verkoop_betalingen (verkooporder_id);

-- ---------------------------------------------------------------------
-- Voorraadmutaties (ontvangst +, verkoop -, correctie ±)
-- ---------------------------------------------------------------------
create table public.voorraad_mutaties (
  id               bigint generated always as identity primary key,
  artikel_id       bigint not null references public.artikelen(id) on delete cascade,
  aantal           numeric(10,2) not null,
  soort            text not null check (soort in ('ontvangst','verkoop','correctie','beginvoorraad')),
  inkoopregel_id   bigint references public.inkooporder_regels(id) on delete set null,
  verkoopregel_id  bigint references public.verkooporder_regels(id) on delete set null,
  waarde_eur_stuk  numeric(12,2),        -- alleen bij correctie/beginvoorraad
  omschrijving     text,
  datum            timestamptz not null default now()
);
create index on public.voorraad_mutaties (artikel_id);
create index on public.voorraad_mutaties (inkoopregel_id);
create index on public.voorraad_mutaties (verkoopregel_id);

-- Uitlenen / op zicht (stalen én tapijten) bij klant of architect
create table public.uitleningen (
  id               bigint generated always as identity primary key,
  artikel_id       bigint not null references public.artikelen(id) on delete cascade,
  klant_id         bigint not null references public.klanten(id) on delete cascade,
  aantal           numeric(10,2) not null default 1 check (aantal > 0),
  datum_uit        date not null default current_date,
  verwacht_terug   date,
  datum_terug      date,
  notitie          text
);
create index on public.uitleningen (artikel_id);
create index on public.uitleningen (klant_id);
create index on public.uitleningen (artikel_id) where datum_terug is null;

-- =====================================================================
-- Views
-- =====================================================================

-- Werkelijke EUR-kostprijs per inkoopregel:
--  EUR-PO: prijs.
--  USD-PO: prijs × (som betaald EUR / som betaald USD); nog niet betaald → schattingskoers.
create view public.v_inkoopregel_kostprijs with (security_invoker = true) as
select r.id as inkoopregel_id,
       r.artikel_id,
       po.valuta,
       r.prijs,
       case
         when po.valuta = 'EUR' then r.prijs
         when b.som_bedrag > 0 then round(r.prijs * b.som_eur / b.som_bedrag, 2)
         when po.koers_schatting is not null then round(r.prijs * po.koers_schatting, 2)
         else null
       end as kostprijs_eur_stuk,
       (po.valuta = 'USD' and coalesce(b.som_bedrag,0) = 0) as is_schatting
from public.inkooporder_regels r
join public.inkooporders po on po.id = r.inkooporder_id
left join lateral (
  select sum(bedrag) as som_bedrag, sum(bedrag_eur) as som_eur
  from public.inkoop_betalingen pb where pb.inkooporder_id = po.id
) b on true;

-- Voorraad per artikel: totaal, uitgeleend, in showroom, gemiddelde kostprijs en waarde
create view public.v_voorraad with (security_invoker = true) as
with mut as (
  select artikel_id, sum(aantal) as totaal from public.voorraad_mutaties group by artikel_id
),
uit as (
  select artikel_id, sum(aantal) as uitgeleend
  from public.uitleningen where datum_terug is null group by artikel_id
),
kost as (
  select m.artikel_id,
         sum(m.aantal * coalesce(k.kostprijs_eur_stuk, m.waarde_eur_stuk)) / nullif(sum(m.aantal),0) as gem_kostprijs_eur,
         bool_or(coalesce(k.is_schatting,false)) as bevat_schatting
  from public.voorraad_mutaties m
  left join public.v_inkoopregel_kostprijs k on k.inkoopregel_id = m.inkoopregel_id
  where m.aantal > 0 and m.soort in ('ontvangst','beginvoorraad','correctie')
  group by m.artikel_id
)
select a.id as artikel_id,
       coalesce(mut.totaal,0)                         as voorraad_totaal,
       coalesce(uit.uitgeleend,0)                     as uitgeleend,
       coalesce(mut.totaal,0) - coalesce(uit.uitgeleend,0) as in_showroom,
       round(kost.gem_kostprijs_eur, 2)               as gem_kostprijs_eur,
       round(coalesce(mut.totaal,0) * kost.gem_kostprijs_eur, 2) as voorraadwaarde_eur,
       coalesce(kost.bevat_schatting,false)           as bevat_schatting
from public.artikelen a
left join mut  on mut.artikel_id  = a.id
left join uit  on uit.artikel_id  = a.id
left join kost on kost.artikel_id = a.id;

-- Totalen per inkooporder
create view public.v_inkooporder_totalen with (security_invoker = true) as
select po.id as inkooporder_id,
       coalesce((select sum(aantal*prijs) from public.inkooporder_regels r where r.inkooporder_id = po.id),0) as totaal,
       coalesce((select sum(bedrag)      from public.inkoop_betalingen b where b.inkooporder_id = po.id),0) as betaald,
       coalesce((select sum(bedrag_eur)  from public.inkoop_betalingen b where b.inkooporder_id = po.id),0) as betaald_eur,
       coalesce((select sum(bedrag_eur)  from public.inkoop_kosten k where k.inkooporder_id = po.id),0) as kosten_eur
from public.inkooporders po;

-- Totalen per verkooporder
create view public.v_verkooporder_totalen with (security_invoker = true) as
select so.id as verkooporder_id,
       round(coalesce(r.netto,0),2) as netto,
       round(coalesce(r.netto,0) * case when so.btw_regeling = 'nl21' then 0.21 else 0 end, 2) as btw,
       round(coalesce(r.netto,0) * case when so.btw_regeling = 'nl21' then 1.21 else 1 end, 2) as totaal,
       coalesce(b.betaald,0) as betaald
from public.verkooporders so
left join lateral (
  select sum(aantal * prijs * (1 - korting_pct/100)) as netto
  from public.verkooporder_regels where verkooporder_id = so.id
) r on true
left join lateral (
  select sum(bedrag) as betaald from public.verkoop_betalingen where verkooporder_id = so.id
) b on true;

-- =====================================================================
-- Functies (acties)
-- =====================================================================

-- Volgend document-nummer toekennen aan verkooporder
create or replace function public.ken_nummer_toe(p_order bigint, p_soort text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare n integer;
begin
  if p_soort = 'offerte' then
    update public.verkooporders set offertenummer = coalesce(offertenummer, nextval('public.offerte_nr_seq')),
           offerte_datum = coalesce(offerte_datum, current_date)
     where id = p_order returning offertenummer into n;
  elsif p_soort = 'orderbevestiging' then
    update public.verkooporders set orderbev_nummer = coalesce(orderbev_nummer, nextval('public.orderbev_nr_seq')),
           orderbev_datum = coalesce(orderbev_datum, current_date),
           status = case when status = 'offerte' then 'bevestigd' else status end
     where id = p_order returning orderbev_nummer into n;
  elsif p_soort = 'factuur' then
    update public.verkooporders set factuurnummer = coalesce(factuurnummer, nextval('public.factuur_nr_seq')),
           factuur_datum = coalesce(factuur_datum, current_date),
           status = case when status in ('offerte','bevestigd','geleverd') then 'gefactureerd' else status end
     where id = p_order returning factuurnummer into n;
  else
    raise exception 'Onbekende documentsoort %', p_soort;
  end if;
  return n;
end $$;

-- Concept-inkooporders maken voor alle "bestellen"-regels van een verkooporder
-- (één PO per leverancier). Geeft het aantal aangemaakte PO's terug.
create or replace function public.maak_inkooporders_voor_verkoop(p_order bigint)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  so record;
  lev record;
  po_id bigint;
  aantal_po integer := 0;
  r record;
begin
  select * into so from public.verkooporders where id = p_order;
  if not found then raise exception 'Verkooporder % niet gevonden', p_order; end if;

  for lev in
    select distinct a.leverancier_id
    from public.verkooporder_regels vr
    join public.artikelen a on a.id = vr.artikel_id
    where vr.verkooporder_id = p_order and vr.bestellen and vr.inkoopregel_id is null
      and a.leverancier_id is not null
  loop
    insert into public.inkooporders (leverancier_id, voor_wie, klant_id, referentie, verkooporder_id, valuta, afleveradres)
    select lev.leverancier_id, 'klant', so.klant_id,
           'KOR-' || coalesce(so.orderbev_nummer, so.offertenummer, so.id)::text,
           so.id, l.valuta, i.afleveradres_inkoop
    from public.leveranciers l, public.instellingen i
    where l.id = lev.leverancier_id
    returning id into po_id;
    aantal_po := aantal_po + 1;

    for r in
      select vr.id as vr_id, vr.aantal, a.id as art_id, a.inkoopprijs,
             coalesce(a.foto_pad, d.hoofdfoto_pad) as foto,
             concat_ws(E'\n', a.naam, a.omschrijving,
               case when d.design_code_lev is not null then 'Design: ' || d.design_code_lev end) as oms
      from public.verkooporder_regels vr
      join public.artikelen a on a.id = vr.artikel_id
      left join public.designs d on d.id = a.design_id
      where vr.verkooporder_id = p_order and vr.bestellen and vr.inkoopregel_id is null
        and a.leverancier_id = lev.leverancier_id
    loop
      with nieuw as (
        insert into public.inkooporder_regels (inkooporder_id, artikel_id, omschrijving, aantal, prijs, foto_pad)
        values (po_id, r.art_id, r.oms, r.aantal, coalesce(r.inkoopprijs,0), r.foto)
        returning id
      )
      update public.verkooporder_regels set inkoopregel_id = (select id from nieuw) where id = r.vr_id;
    end loop;
  end loop;
  return aantal_po;
end $$;

-- Ontvangst boeken op een inkoopregel (deellevering mogelijk)
create or replace function public.ontvang_inkoopregel(p_regel bigint, p_aantal numeric)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare r record;
begin
  select * into r from public.inkooporder_regels where id = p_regel for update;
  if not found then raise exception 'Regel niet gevonden'; end if;
  if p_aantal <= 0 then raise exception 'Aantal moet groter dan 0 zijn'; end if;
  if r.aantal_ontvangen + p_aantal > r.aantal then
    raise exception 'Er wordt meer ontvangen (%) dan besteld (%)', r.aantal_ontvangen + p_aantal, r.aantal;
  end if;

  update public.inkooporder_regels set aantal_ontvangen = aantal_ontvangen + p_aantal where id = p_regel;

  if r.artikel_id is not null then
    insert into public.voorraad_mutaties (artikel_id, aantal, soort, inkoopregel_id, omschrijving)
    values (r.artikel_id, p_aantal, 'ontvangst', p_regel, 'Ontvangst inkooporder');
  end if;

  -- Hele PO ontvangen? Status bijwerken.
  if not exists (select 1 from public.inkooporder_regels
                 where inkooporder_id = r.inkooporder_id and aantal_ontvangen < aantal) then
    update public.inkooporders set status = 'ontvangen' where id = r.inkooporder_id;
  end if;
end $$;

-- Verkooporder leveren: voorraad afboeken voor alle nog niet geleverde regels
create or replace function public.lever_verkooporder(p_order bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.voorraad_mutaties (artikel_id, aantal, soort, verkoopregel_id, omschrijving)
  select vr.artikel_id, -vr.aantal, 'verkoop', vr.id, 'Levering verkooporder'
  from public.verkooporder_regels vr
  join public.artikelen a on a.id = vr.artikel_id
  where vr.verkooporder_id = p_order and not vr.geleverd and a.soort <> 'dienst';

  -- Lag het artikel op zicht bij dezelfde klant? Dan is de uitlening afgesloten.
  update public.uitleningen u set datum_terug = current_date,
         notitie = concat_ws(' – ', u.notitie, 'verkocht')
    from public.verkooporders so
   where so.id = p_order and u.klant_id = so.klant_id and u.datum_terug is null
     and u.artikel_id in (select artikel_id from public.verkooporder_regels
                          where verkooporder_id = p_order and not geleverd and artikel_id is not null);

  update public.verkooporder_regels set geleverd = true
   where verkooporder_id = p_order and not geleverd;

  update public.verkooporders set status = 'geleverd'
   where id = p_order and status in ('offerte','bevestigd');
end $$;

-- Verkooporder maken vanuit een inkooporder: regels worden overgenomen en gekoppeld
create or replace function public.maak_verkooporder_voor_inkoop(p_po bigint, p_klant bigint)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  po record;
  k record;
  so_id bigint;
begin
  select * into po from public.inkooporders where id = p_po for update;
  if not found then raise exception 'Inkooporder niet gevonden'; end if;
  if po.verkooporder_id is not null then
    raise exception 'Deze inkooporder is al gekoppeld aan een verkooporder';
  end if;
  select * into k from public.klanten where id = p_klant;
  if not found then raise exception 'Klant niet gevonden'; end if;

  insert into public.verkooporders (klant_id, taal, btw_regeling, aanbetaling_pct)
  values (k.id, k.taal, k.btw_regeling, case when k.soort = 'particulier' then 100 else 50 end)
  returning id into so_id;

  insert into public.verkooporder_regels (verkooporder_id, artikel_id, omschrijving, aantal, prijs, bestellen, inkoopregel_id, volgorde)
  select so_id, r.artikel_id,
         coalesce(nullif(concat_ws(E'\n', a.naam, a.omschrijving), ''), r.omschrijving),
         r.aantal, coalesce(round(a.verkoopprijs / 1.21, 2), 0),
         r.artikel_id is not null, r.id, r.volgorde
  from public.inkooporder_regels r
  left join public.artikelen a on a.id = r.artikel_id
  where r.inkooporder_id = p_po
    and not exists (select 1 from public.verkooporder_regels v where v.inkoopregel_id = r.id)
  order by r.volgorde, r.id;

  update public.inkooporders set verkooporder_id = so_id, voor_wie = 'klant', klant_id = k.id where id = p_po;
  return so_id;
end $$;
revoke execute on function public.maak_verkooporder_voor_inkoop(bigint, bigint) from public, anon;
grant execute on function public.maak_verkooporder_voor_inkoop(bigint, bigint) to authenticated;

-- =====================================================================
-- Beveiliging: alleen ingelogde gebruikers (iedereen ziet alles)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'instellingen','leveranciers','klanten','designs','design_bestanden','artikelen',
    'inkooporders','inkooporder_regels','inkoop_betalingen','inkoop_kosten',
    'verkooporders','verkooporder_regels','verkoop_betalingen',
    'voorraad_mutaties','uitleningen']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "ingelogd_alles" on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

revoke all on all sequences in schema public from anon;
grant usage, select on all sequences in schema public to authenticated;
revoke all on public.v_inkoopregel_kostprijs, public.v_voorraad,
              public.v_inkooporder_totalen, public.v_verkooporder_totalen from anon;
grant select on public.v_inkoopregel_kostprijs, public.v_voorraad,
                public.v_inkooporder_totalen, public.v_verkooporder_totalen to authenticated;
revoke execute on function public.ken_nummer_toe(bigint,text),
                           public.maak_inkooporders_voor_verkoop(bigint),
                           public.ontvang_inkoopregel(bigint,numeric),
                           public.lever_verkooporder(bigint) from public, anon;
grant execute on function public.ken_nummer_toe(bigint,text),
                          public.maak_inkooporders_voor_verkoop(bigint),
                          public.ontvang_inkoopregel(bigint,numeric),
                          public.lever_verkooporder(bigint) to authenticated;

-- =====================================================================
-- Opslag voor foto's en CAD's (privé bucket 'media')
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

create policy "media_lezen"     on storage.objects for select to authenticated using (bucket_id = 'media');
create policy "media_uploaden"  on storage.objects for insert to authenticated with check (bucket_id = 'media');
create policy "media_wijzigen"  on storage.objects for update to authenticated using (bucket_id = 'media');
create policy "media_verwijderen" on storage.objects for delete to authenticated using (bucket_id = 'media');


-- =====================================================================
-- IOne-import (zelfde inhoud als supabase/migraties/2026-11-14_ione_import.sql)
-- =====================================================================
-- Voorbereiding op de import uit IOne (veilig om opnieuw te draaien)

-- Artikelnummers uit IOne hebben voorloopnullen en tot 16 cijfers: tekst i.p.v. getal
alter table public.artikelen alter column artikelnummer drop default;
alter table public.artikelen alter column artikelnummer type text using artikelnummer::text;
alter table public.artikelen alter column artikelnummer set default nextval('public.artikel_nr_seq')::text;

alter table public.artikelen     add column if not exists omzetgroep text;
alter table public.artikelen     add column if not exists bron text;      -- 'ione' = overgenomen uit IOne
alter table public.inkooporders  add column if not exists bron text;
alter table public.verkooporders add column if not exists bron text;
-- IOne-orders hebben regelprijzen inclusief btw; zo blijven de totalen tot op de cent gelijk
alter table public.verkooporders add column if not exists prijzen_incl_btw boolean not null default false;
alter table public.inkooporder_regels  add column if not exists notitie text;   -- intern, niet op documenten
alter table public.verkooporder_regels add column if not exists notitie text;   -- intern, niet op documenten
create index if not exists artikelen_bron_idx     on public.artikelen (bron)     where bron is not null;
create index if not exists inkooporders_bron_idx  on public.inkooporders (bron)  where bron is not null;
create index if not exists verkooporders_bron_idx on public.verkooporders (bron) where bron is not null;

create or replace view public.v_verkooporder_totalen with (security_invoker = true) as
select so.id as verkooporder_id,
       round(case when so.prijzen_incl_btw and so.btw_regeling = 'nl21' then coalesce(r.som,0) / 1.21 else coalesce(r.som,0) end, 2) as netto,
       round(case when so.btw_regeling <> 'nl21' then 0
                  when so.prijzen_incl_btw then coalesce(r.som,0) - coalesce(r.som,0) / 1.21
                  else coalesce(r.som,0) * 0.21 end, 2) as btw,
       round(case when so.btw_regeling = 'nl21' and not so.prijzen_incl_btw then coalesce(r.som,0) * 1.21 else coalesce(r.som,0) end, 2) as totaal,
       coalesce(b.betaald,0) as betaald
from public.verkooporders so
left join lateral (
  select sum(aantal * prijs * (1 - korting_pct/100)) as som
  from public.verkooporder_regels where verkooporder_id = so.id
) r on true
left join lateral (
  select sum(bedrag) as betaald from public.verkoop_betalingen where verkooporder_id = so.id
) b on true;


-- Datums bijhouden op orders (veilig om opnieuw te draaien)
alter table public.verkooporders add column if not exists geleverd_op date;
alter table public.verkooporders add column if not exists betaald_op  date;
alter table public.inkooporders  add column if not exists bevestigd_op date;
alter table public.inkooporders  add column if not exists ontvangen_op date;

-- Datum automatisch invullen zodra de status verandert (alleen als hij nog leeg is)
create or replace function public.zet_statusdatums() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if tg_table_name = 'verkooporders' then
      if new.status = 'geleverd' and new.geleverd_op is null then new.geleverd_op := current_date; end if;
      if new.status = 'betaald'  and new.betaald_op  is null then new.betaald_op  := current_date; end if;
    else
      if new.status = 'verstuurd' and new.verstuurd_op is null then new.verstuurd_op := now(); end if;
      if new.status = 'bevestigd' and new.bevestigd_op is null then new.bevestigd_op := current_date; end if;
      if new.status = 'ontvangen' and new.ontvangen_op is null then new.ontvangen_op := current_date; end if;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.zet_statusdatums() from public, anon, authenticated;

drop trigger if exists statusdatums on public.verkooporders;
create trigger statusdatums before update on public.verkooporders
  for each row execute function public.zet_statusdatums();
drop trigger if exists statusdatums on public.inkooporders;
create trigger statusdatums before update on public.inkooporders
  for each row execute function public.zet_statusdatums();

-- Koppeling met de website (QR-code staalkaart)
alter table public.artikelen add column if not exists website_handle text;
alter table public.designs   add column if not exists website_handle text;


-- Reinigingen: tapijt van een klant laten reinigen, los van verkooporders (veilig om opnieuw te draaien)
create sequence if not exists public.reiniging_nr_seq start 9000;

create table if not exists public.reinigingen (
  id               bigint generated always as identity primary key,
  nummer           integer not null unique default nextval('public.reiniging_nr_seq'),
  klant_id         bigint not null references public.klanten(id),
  reiniger_id      bigint references public.leveranciers(id) on delete set null,   -- aan wie het is uitbesteed
  status           text not null default 'aangenomen'
                   check (status in ('aangenomen','bij_reiniger','klaar','opgehaald','geannuleerd')),
  datum_binnen     date not null default current_date,
  verwacht_klaar   date,
  naar_reiniger_op date,
  klaar_op         date,
  opgehaald_op     date,
  kosten_reiniger  numeric(12,2),              -- wat de reiniger ons rekent (excl. btw), intern
  factuurnummer    integer unique,
  factuur_datum    date,
  betaald_op       date,
  betaalwijze      text,
  opmerking        text,                       -- komt op de bon en de factuur
  notities_intern  text,
  aangemaakt_op    timestamptz not null default now()
);
create index if not exists reinigingen_klant_idx  on public.reinigingen (klant_id);
create index if not exists reinigingen_status_idx on public.reinigingen (status);

create table if not exists public.reiniging_regels (
  id            bigint generated always as identity primary key,
  reiniging_id  bigint not null references public.reinigingen(id) on delete cascade,
  omschrijving  text,                          -- welk tapijt
  lengte_cm     numeric(8,1),
  breedte_cm    numeric(8,1),
  behandeling   text,                          -- bv. reinigen, franjes herstellen
  prijs         numeric(12,2) not null default 0,   -- inclusief btw
  foto_pad      text,
  volgorde      integer not null default 0
);
create index if not exists reiniging_regels_reiniging_idx on public.reiniging_regels (reiniging_id);

do $$
declare t text;
begin
  foreach t in array array['reinigingen','reiniging_regels'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "ingelogd_alles" on public.%I', t);
    execute format('create policy "ingelogd_alles" on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
grant usage, select on sequence public.reiniging_nr_seq to authenticated;

-- Factuurnummer uit dezelfde reeks als de verkoopfacturen (één doorlopende nummering)
create or replace function public.reiniging_factuur(p_id bigint) returns integer
language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  update public.reinigingen
     set factuurnummer = coalesce(factuurnummer, nextval('public.factuur_nr_seq')),
         factuur_datum = coalesce(factuur_datum, current_date)
   where id = p_id returning factuurnummer into n;
  if n is null then raise exception 'Reiniging niet gevonden'; end if;
  return n;
end $$;
revoke execute on function public.reiniging_factuur(bigint) from public, anon;
grant execute on function public.reiniging_factuur(bigint) to authenticated;
-- Reiniging: standaard € 30 per m², extra behandelingen Scotchgard en antimot (+ € 5 per m² per stuk)
alter table public.reiniging_regels add column if not exists scotchgard boolean not null default false;
alter table public.reiniging_regels add column if not exists antimot boolean not null default false;
alter table public.reiniging_regels add column if not exists prijs_handmatig boolean not null default false;
-- Bestaande regels met een ingevulde prijs houden hun prijs
update public.reiniging_regels set prijs_handmatig = true where prijs > 0 and not prijs_handmatig;
-- Reiniging: reparatie per tapijt, prijs zelf in te vullen
alter table public.reiniging_regels add column if not exists reparatie text;
alter table public.reiniging_regels add column if not exists reparatie_prijs numeric(12,2);


-- Voorraadcontrole: bijhouden welke artikelen zijn nagelopen (veilig om opnieuw te draaien)
alter table public.artikelen add column if not exists voorraad_gecontroleerd_op date;


-- Korting in euro's op een verkoopregel, naast de korting in procenten (veilig om opnieuw te draaien).
-- Het bedrag gaat van het regeltotaal af, in dezelfde prijssoort als de regelprijs (excl. of incl. btw).
alter table public.verkooporder_regels add column if not exists korting_bedrag numeric(12,2) not null default 0;

create or replace view public.v_verkooporder_totalen with (security_invoker = true) as
select so.id as verkooporder_id,
       round(case when so.prijzen_incl_btw and so.btw_regeling = 'nl21' then coalesce(r.som,0) / 1.21 else coalesce(r.som,0) end, 2) as netto,
       round(case when so.btw_regeling <> 'nl21' then 0
                  when so.prijzen_incl_btw then coalesce(r.som,0) - coalesce(r.som,0) / 1.21
                  else coalesce(r.som,0) * 0.21 end, 2) as btw,
       round(case when so.btw_regeling = 'nl21' and not so.prijzen_incl_btw then coalesce(r.som,0) * 1.21 else coalesce(r.som,0) end, 2) as totaal,
       coalesce(b.betaald,0) as betaald
from public.verkooporders so
left join lateral (
  select sum(aantal * prijs * (1 - korting_pct/100) - korting_bedrag) as som
  from public.verkooporder_regels where verkooporder_id = so.id
) r on true
left join lateral (
  select sum(bedrag) as betaald from public.verkoop_betalingen where verkooporder_id = so.id
) b on true;


-- Websiteorder (Shopify, koremanmaastricht.nl) doorzetten naar de voorraad-app. Veilig om opnieuw te draaien.
-- De knop in de Shopify-admin stuurt de order naar de edge function "website-order"; die roept deze functie aan.
alter table public.verkooporders add column if not exists website_order text;
create unique index if not exists verkooporders_website_order_uq on public.verkooporders (website_order) where website_order is not null;

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
  if btw = 0 and totaal > 0 then regeling := 'export0'; incl := false; end if;

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
  so_nr := public.ken_nummer_toe(so_id, 'orderbevestiging');

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
    insert into public.verkooporder_regels (verkooporder_id, artikel_id, omschrijving, aantal, prijs, korting_bedrag, notitie, volgorde)
    values (so_id, art,
            nullif(trim(concat_ws(' - ', nullif(trim(r->>'titel'), ''), nullif(nullif(trim(r->>'variant'), ''), 'Default Title'))), ''),
            n, coalesce(nullif(regexp_replace(coalesce(r->>'prijs', ''), getal, '', 'g'), '')::numeric, 0),
            -- korting: verschil tussen de stuksprijs en de prijs na alle kortingen (ook kortingscodes), anders het opgegeven kortingsbedrag
            greatest(coalesce(
              (nullif(regexp_replace(coalesce(r->>'prijs', ''), getal, '', 'g'), '')::numeric
                - nullif(regexp_replace(coalesce(r->>'prijs_na_korting', ''), getal, '', 'g'), '')::numeric) * n,
              nullif(regexp_replace(coalesce(r->>'korting', ''), getal, '', 'g'), '')::numeric, 0), 0),
            case when art is null then 'Niet gekoppeld aan een artikel' || coalesce(' (artikelnummer op de website: ' || sku || ')', ' (geen artikelnummer op de website)') end,
            i);
    i := i + 1;
  end loop;
  if verzend > 0 then
    insert into public.verkooporder_regels (verkooporder_id, omschrijving, aantal, prijs, volgorde) values (so_id, 'Verzendkosten', 1, verzend, i);
  end if;

  if upper(coalesce(p->>'betaald', '')) = 'PAID' and totaal > 0 then
    insert into public.verkoop_betalingen (verkooporder_id, datum, bedrag, soort, omschrijving) values (so_id, dag, totaal, 'overig', 'Betaald via de website');
  end if;

  -- controle: komt het totaal overeen met het totaal op de website?
  select t.totaal into app_totaal from public.v_verkooporder_totalen t where t.verkooporder_id = so_id;
  if totaal > 0 and abs(coalesce(app_totaal, 0) - totaal) > 0.05 then
    update public.verkooporders set notities_intern = concat_ws(E'\n', notities_intern,
      'Let op: het totaal op de website is € ' || to_char(totaal, 'FM999G999G990D00') || ', hier € ' || to_char(coalesce(app_totaal, 0), 'FM999G999G990D00') || '. Controleer de regels.')
     where id = so_id;
  end if;

  return jsonb_build_object('nieuw', true, 'verkooporder_id', so_id, 'ordernummer', so_nr, 'website_order', nr,
                            'totaal_website', totaal, 'totaal_app', app_totaal,
                            'klant_id', kid, 'klant_nieuw', klant_nieuw, 'regels_gekoppeld', gekoppeld, 'regels_los', los);
end $$;

revoke all on function public.website_order_ontvangen(jsonb) from public, anon, authenticated;
grant execute on function public.website_order_ontvangen(jsonb) to service_role;


-- Kleuren van een artikel: een lijst met ARS-kleuren en/of zelf omschreven kleuren (veilig om opnieuw te draaien).
-- Elk item: {"soort": "ars" | "eigen", "naam": "..."}
alter table public.artikelen add column if not exists kleuren jsonb not null default '[]'::jsonb;


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
  if btw = 0 and totaal > 0 then regeling := 'export0'; incl := false; end if;

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
  so_nr := public.ken_nummer_toe(so_id, 'orderbevestiging');

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

  return jsonb_build_object('nieuw', true, 'verkooporder_id', so_id, 'ordernummer', so_nr, 'website_order', nr,
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
