-- Voorraadcontrole: bijhouden welke artikelen zijn nagelopen (veilig om opnieuw te draaien)
alter table public.artikelen add column if not exists voorraad_gecontroleerd_op date;
