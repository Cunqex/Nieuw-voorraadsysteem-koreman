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
