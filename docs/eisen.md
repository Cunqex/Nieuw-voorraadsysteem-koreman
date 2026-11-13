# Koreman Voorraad App — Eisen (vastgesteld 13-11-2026)

Vervanger voor IOne. Stack: Supabase (database, auth, storage) + GitHub Pages (frontend).
Doel: eenvoudig en duidelijk, zodat iemand zonder uitleg ermee kan werken. Functioneel, niet luxe. App-schermen in het Nederlands.

## 1. Artikelen
- **Design-niveau** boven artikelen: designcode leverancier (bv. JO#8010), designnaam, leverancier, foto's, CAD's. Daaronder meerdere artikelen (staal 60x60, 365x275, maatwerk).
- Soorten artikelen: voorraadtapijt, maatwerk op bestelling, stalen, diensten (reiniging, Scotchgard, antimot, transport, luchtvracht).
- Voorraad als aantal per artikel (alles kan meerdere stuks hebben).
- Nummering: eigen reeks vanaf **9000** (oude IOne-nummers komen later via import).
- Velden: productnr. leverancier, maat, vorm, materiaal, techniek, kleurcode, poolhoogte, gewicht, HS-code.
- Prijzen per stuk én per m² (app rekent om).
- Foto op inkooporder: standaard hoofdfoto, per order te wijzigen (andere foto of CAD).

## 2. Inkooporders
- Leverancier, artikelen, prijzen, maten, leverdatum. Document in het **Engels**.
- Valuta per leverancier (EUR of USD).
- **Voor wie**: eigen voorraad of klant/architect, maar op de PO voor de leverancier alleen een **interne referentie**, nooit de naam van de opdrachtgever.
- Statussen: concept → verstuurd → bevestigd → in productie → verzonden → ontvangen.
- Deelleveringen mogelijk (per regel ontvangen).
- Betalingen aan leverancier bijhouden: soms 100% vooraf, soms deel vooraf en rest bij ontvangst.
- **Voorraadwaarde bij USD-leveranciers** = werkelijk afgeschreven eurobedrag; bij meerdere betalingen de som van de eurobedragen.
- Vracht/invoerrechten/bijkomende kosten wél registreren per PO, maar **niet** meetellen in de voorraadwaarde.
- Versturen: PDF downloaden én mailen vanuit de app.

## 3. Verkooporders
- Documenten: offerte → orderbevestiging → (rest)factuur. Taal per order NL of EN.
- **Verkoop altijd in euro.**
- Aanbetaling (bv. 50%) wordt via de orderbevestiging gevraagd; de eindfactuur trekt de aanbetaling af.
- Betaalvoorwaarden per order kiezen.
- Nummering orderbevestiging/factuur start voorlopig bij 9000, later aanpassen naar IOne-reeks.
- BTW: 21% NL, 0% verlegd EU-zakelijk, 0% export buiten EU.
- Bestelartikelen: **altijd** automatisch een concept-inkooporder, gekoppeld aan de verkooporder; versturen pas na ontvangen aanbetaling (waarschuwing anders). Artikel op voorraad: geen PO nodig.
- Architecten kopen en verkopen door (Koreman factureert de architect, zoals LVM).

## 4. Relaties en voorraad
- Aparte lijsten voor klanten/architecten en leveranciers.
- Locaties: showroom Maastricht, en "op zicht" bij klant/architect.
- Stalenlijst in de app: staal uitlenen aan relatie, terugboeken, overzicht wie wat heeft.

## 5. Gebruik en techniek
- Raymond + medewerkers, iedereen ziet alles (geen rollen nodig).
- Computer én telefoon/tablet (responsive). Geen barcodes voorlopig.
- Login via Supabase Auth; alle data afgeschermd (RLS) voor ingelogde gebruikers.
- Toekomst: koppeling met het AI-agentportaal binnen Claude. Import van IOne-data later.
