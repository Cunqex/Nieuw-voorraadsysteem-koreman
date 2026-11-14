-- Koppeling artikel/design -> product op koremanmaastricht.nl (Shopify-handle, bv. 'terra-umber').
-- Gebruikt voor de QR-code op de staalkaart (B2B). Veilig om opnieuw te draaien.
alter table public.artikelen add column if not exists website_handle text;
alter table public.designs   add column if not exists website_handle text;
