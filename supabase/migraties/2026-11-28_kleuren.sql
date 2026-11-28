-- Kleuren van een artikel: een lijst met ARS-kleuren en/of zelf omschreven kleuren (veilig om opnieuw te draaien).
-- Elk item: {"soort": "ars" | "eigen", "naam": "..."}
alter table public.artikelen add column if not exists kleuren jsonb not null default '[]'::jsonb;
