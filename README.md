# Koreman Voorraad App

Eigen voorraad- en ordersysteem voor Koreman Exclusive Carpets (vervanger van IOne).
Draait als statische website op **GitHub Pages** met **Supabase** als database, login en opslag voor foto's/CAD's.

## Wat zit erin

| Onderdeel | Wat je ermee doet |
|---|---|
| **Designs** | Ontwerp van de leverancier (designcode zoals op het staal, bv. `JO#8010`) met foto's en CAD's. Kies de hoofdfoto die op de inkooporder komt. |
| **Artikelen** | Tapijt per maat, maatwerk, staal of dienst. Nummering vanaf 9000. m²-prijs ↔ stukprijs rekent automatisch. Voorraad, kostprijs en voorraadwaarde per artikel. |
| **Inkooporders** | Engelstalige PO voor de leverancier (EUR of USD), met foto en designcode per regel. "Voor wie" (eigen voorraad of klant) is intern; de leverancier ziet alleen de referentie. Statussen, deelleveringen, betalingen, bijkomende kosten. PDF + mailen. |
| **Verkooporders** | Offerte → orderbevestiging (met aanbetaling %) → levering → factuur, in NL of EN, altijd in euro. Te bestellen regels krijgen bij bevestigen automatisch een concept-inkooporder; waarschuwing als je die verstuurt zonder aanbetaling. |
| **Uitgeleend / op zicht** | Stalen en tapijten bij klanten/architecten (vervangt de Excel-stalenlijst). |
| **Klanten & leveranciers** | Aparte lijsten, met orderhistorie per relatie. |

### Voorraadwaarde
- EUR-leverancier: inkoopprijs.
- USD-leverancier: het **werkelijk afgeschreven eurobedrag** van de betalingen (bij deelbetalingen opgeteld). Nog niet betaald → schattingskoers (ECB-knop), gemarkeerd als "geschat".
- Vracht, invoerrechten e.d. worden per inkooporder vastgelegd maar tellen **niet** mee in de voorraadwaarde.

## Installatie (eenmalig)

1. **Database** – Supabase → *SQL Editor* → plak de inhoud van [`supabase/schema.sql`](supabase/schema.sql) → *Run*.
2. **Gebruikers** – Supabase → *Authentication* → *Users* → *Add user* (e-mail + wachtwoord) voor jezelf en medewerkers.
   Zet daarna onder *Authentication → Sign In / Providers* **"Allow new users to sign up" uit**, zodat niemand zelf een account kan maken.
3. **Koppeling** – vul in [`js/config.js`](js/config.js) de *Project URL* en *anon / publishable key* in (Supabase → *Project Settings* → *API*).
4. **GitHub Pages** – repository → *Settings* → *Pages* → *Deploy from a branch* → `main` / root. De app staat daarna op
   `https://cunqex.github.io/Nieuw-voorraadsysteem-koreman/`.

## Nummering aanpassen naar IOne (later)
Alles start nu bij 9000. Zodra de IOne-export er is, in de SQL Editor bijvoorbeeld:
```sql
select setval('artikel_nr_seq',  5600);   -- laatste IOne-artikelnummer
select setval('inkoop_nr_seq',   3460);
select setval('orderbev_nr_seq', 3470);
select setval('factuur_nr_seq',  9420);
```

## Techniek
- Geen build-stap: gewone HTML/CSS/JavaScript-modules, `supabase-js` via CDN.
- Beveiliging: Row Level Security op alle tabellen – alleen ingelogde gebruikers kunnen lezen/schrijven. Foto's staan in een privé-bucket `media`.
- Database-acties als functies: `ken_nummer_toe`, `maak_inkooporders_voor_verkoop`, `ontvang_inkoopregel`, `lever_verkooporder`.
- Toekomst: import IOne-data, koppeling met het AI-agentportaal.
