-- Websitegegevens (koremanmaastricht.nl) en collecties per artikel
-- Uitgevoerd via Supabase op 17-11-2026.
create table if not exists public.website_producten (
  handle text primary key, titel text not null, product_type text, tags text[] default '{}', collecties text[] default '{}',
  compositie text, maakwijze text, knoopdichtheid text, foto_urls text[] default '{}', b2b boolean default false,
  omschrijving text, skus text[] default '{}', prijs numeric, beschikbaar boolean, opgehaald_op timestamptz default now()
);
alter table public.artikelen add column if not exists collecties text[] default '{}';
create table if not exists public.artikel_website (
  artikel_id bigint primary key references public.artikelen(id) on delete cascade,
  handle text not null references public.website_producten(handle) on delete cascade,
  via text not null
);
-- Functies materiaal_uit_tekst(text, proza) en techniek_uit_tekst(text): zie Supabase.
-- Backup van materiaal/techniek/foto/website/design vóór de koppeling: public.backup_artikelen_20261117

-- Custom (maatwerk) prijzen
alter table public.website_producten add column if not exists custom_m2 numeric, add column if not exists b2b_prijs_m2 numeric, add column if not exists b2b_custom_m2 numeric;
alter table public.artikelen add column if not exists custom boolean not null default false, add column if not exists custom_prijs_m2 numeric;
alter table public.artikelen add column if not exists custom_prijs_handmatig boolean not null default false;
alter table public.artikelen add column if not exists std_verkoopprijs numeric, add column if not exists std_verkoopprijs_m2 numeric;
-- 18-11-2026: factor voor verkoopprijs (inkoop per m2 x factor), namen opgeschoond (backup: public.backup_namen_20261118)
alter table public.artikelen add column if not exists factor numeric default 6.5;
