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
