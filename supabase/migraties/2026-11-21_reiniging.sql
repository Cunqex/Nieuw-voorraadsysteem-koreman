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
