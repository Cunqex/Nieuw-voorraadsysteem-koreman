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
