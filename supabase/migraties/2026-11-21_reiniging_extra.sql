-- Reiniging: standaard € 30 per m², extra behandelingen Scotchgard en antimot (+ € 5 per m² per stuk)
alter table public.reiniging_regels add column if not exists scotchgard boolean not null default false;
alter table public.reiniging_regels add column if not exists antimot boolean not null default false;
alter table public.reiniging_regels add column if not exists prijs_handmatig boolean not null default false;
-- Bestaande regels met een ingevulde prijs houden hun prijs
update public.reiniging_regels set prijs_handmatig = true where prijs > 0 and not prijs_handmatig;
