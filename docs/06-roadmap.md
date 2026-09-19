# Roadmapa a metriky — Football Terminal

> Status: 🔴 nezahájeno. Vyplní se po ujasnění rozsahu MVP (`01`) a
> architektury (`04`).

## Fáze projektu (návrh kostry)

- **Fáze 0 — Discovery/spec** *(právě teď)*: dokumenty `00`–`06`.
- **Fáze 1 — MVP**: web s core statistikami, bez registrace/paywallu.
- **Fáze 2 — Registrace + paywall**: účty, subscription, prémiový obsah.
- **Fáze 3 — Mobilní aplikace**: nativní/cross-platform klient nad
  existujícím API.

## Milníky (k doplnění)

❓ OPEN QUESTION — cílové datum/rychlost launchu MVP, kapacita týmu
(kdo bude programovat — jen agent/AI, nebo i lidský dev tým?).

## Metriky úspěchu (KPI)

❓ OPEN QUESTION — kandidáti: počet aktivních uživatelů, conversion rate na
placený tier, retention, průměrná doba na stránce, ...

## Rizika

❓ OPEN QUESTION — k doplnění, ale už teď víme o dvou zásadních rizicích:

1. **Licenční/nákladová rizika API dat** — pokud vybrané API nedovolí
   komerční paywall use-case, může to vyžadovat změnu providera uprostřed
   projektu.
2. **Náklady na live data při růstu uživatelů** — cena za API requesty
   může škálovat rychleji než příjmy z paywallu, pokud není dobře
   nacachovaná.
