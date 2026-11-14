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
