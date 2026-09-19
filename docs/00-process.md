# Proces cizelování zadání

Cíl: dostat se od nápadu ("fotbalový analytický web") k zadání, které je
**neprůstřelné** – tj. jasně definuje rozsah, uživatele, data, monetizaci a
architekturu tak, aby se dalo bezpečně odhadnout, naplánovat a postavit MVP,
aniž bychom po 2 měsících zjistili, že jsme si nerozuměli.

## Proč "spec sprint" před kódem

- Fotbalová data jsou **licenčně a nákladově citlivá** (API providers mají
  různá pravidla pro komerční/redistribuční use-case, real-time data jsou
  dražší než "denní" data) – tohle musí být vyřešené dřív, než postavíme
  datový model.
- Paywall + registrace = platby, GDPR, bezpečnost účtů – lehce podceňovaná
  komplexita, kterou je levnější vyřešit na papíře.
- Mobilní appka "case pro rozvoj" – pokud o ní víme dopředu, ovlivní to
  volbu backendu (API-first design) i frontendu (např. React Native /
  Flutter kompatibilní datové kontrakty).

## Fáze diskuze (workshopy)

Každá fáze = jeden tematický blok diskuze, výstupem je aktualizace
příslušného dokumentu v `docs/`. Nemusíme jít striktně lineárně, ale
doporučené pořadí:

1. **Vize a cílové skupiny** → `01-product-brief.md`
   - Kdo je uživatel, jaký problém mu řešíme, proč by platil.
2. **Rozsah MVP vs. pozdější fáze** → `01-product-brief.md`, `06-roadmap.md`
   - Co je "must have" pro launch, co je "nice to have"/fáze 2/3.
3. **Funkční požadavky** → `02-requirements.md`
   - Konkrétní featury (statistiky, srovnání týmů/hráčů, live zápasy,
     predikce, ...).
4. **Data a API strategie** → `03-data-and-api.md`
   - Který provider, jaké ligy/soutěže, cena, licenční podmínky, aktuálnost
     dat (live vs. denní), rate limity.
5. **Monetizace a legislativa** → `05-monetization-legal.md`
   - Freemium/subscription/paywall model, platební brána, GDPR.
6. **Architektura a tech stack** → `04-architecture.md`
   - Backend, frontend, DB, infrastruktura, API-first design pro budoucí
     mobilní appku.
7. **Nefunkční požadavky** → `02-requirements.md`
   - Performance, škálovatelnost, dostupnost, bezpečnost.
8. **Roadmapa a metriky** → `06-roadmap.md`
   - Milníky, timeline, KPI pro úspěch.

## Jak budeme pracovat

- Diskutujeme v chatu, já se ptám na klíčová rozhodnutí (často formou
  výběru z variant), ty rozhoduješ nebo doplňuješ kontext.
- Po každém bloku aktualizuji příslušný `docs/*.md` – dokumenty jsou "živé"
  a verzované v gitu, takže vidíš historii rozhodnutí.
- Sporné/otevřené body značíme `❓ OPEN QUESTION` přímo v dokumentu, ať
  nezapadnou.
- Spec považujeme za "neprůstřelnou", až budou všechny dokumenty bez
  otevřených otázek a budeš schopný description MVP featur odsouhlasit
  jednou větou za feature.
- Teprve po odsouhlasení `01`–`06` navrhnu breakdown na epiky/tasky a
  založíme backlog (a až pak začneme s kódem/architekturou v repu).

## Doporučený další krok

Začneme blokem 1 (vize a cílové skupiny) a blokem 2 (rozsah MVP) – to jsou
rozhodnutí, která ovlivní úplně všechno ostatní (data, architekturu i
monetizaci). Otevřu k tomu první kolo otázek v chatu.
