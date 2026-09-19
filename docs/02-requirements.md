# Požadavky — Football Terminal

> Status: 🟡 draft z kol 1–2, **z velké části zpřesněn/nahrazen**
> konkrétní specifikací od produktového vlastníka v
> [`07-match-detail-spec.md`](07-match-detail-spec.md) (19.9.2026) — V1
> je teď ostřejší: **jedna liga (Chance Liga)**, **výpis kola + detail
> zápasu** se 7 analytickými sekcemi (H2H, forma, radar, trendy,
> simulace). Sestavy, xG jako samostatná featura, tabulka ligy, profil
> týmu/hráče jako samostatné stránky a srovnávání hráčů jsou **odsunuty
> mimo V1** (viz shrnutí na konci `07-match-detail-spec.md`).
>
> Tento dokument zůstává jako širší backlog/kontext pro fázi po V1.
> Značím ✅ potvrzené, ❓ otevřené k tvé reakci — klidně edituj přímo v
> tomto souboru (přeškrtni/doplň) a probereme rozdíl v dalším kole.

## Kontext, ze kterého vycházím

- Cílovka: sázkaři/tipsteři.
- Pozice: čistá analytika — **žádné** "doporučujeme vsadit na X", žádné
  affiliate odkazy na sázkovky, žádné přímé prediction-picks. Kurzy se
  zobrazují jen jako informace k datům, ne jako call-to-action k sázení.
- Geo scope: top evropské ligy + ČR/SK (Chance Liga), čeština.
- Bez registrace/paywallu v MVP (fáze 2+).
- MVP hero features: **Detail zápasu** (statistiky, sestavy, xG) +
  **Srovnávání týmů/hráčů (head-to-head)**, s hero metrikou **pokročilé
  analýzy formy/trendu týmu**.

## 1. Obrazovky MVP (návrh)

❓ OPEN QUESTION — Detail zápasu a Srovnávání jsou potvrzené jako "hero"
featury, ale aby k nim uživatel vůbec došel, potřebuje navigační/vstupní
obrazovky. Navrhuju je považovat za **implicitní součást MVP** (ne scope
creep, ale nutnou "cestu k datu") — potvrď, prosím:

1. **Přehled / Domovská stránka**
   - Seznam dnešních + nadcházejících zápasů (napříč sledovanými
     ligami), rychlý přístup k detailu zápasu.
   - ❓ Řešíme na startu i "dnes žádné zápasy" stav, filtrování podle ligy.

2. **Tabulka ligy**
   - Standardní žebříček (výhry/prohry/skóre/body), filtrovatelné podle
     ligy/soutěže ze scope.
   - ❓ Zahrnout i doma/venku split v tabulce (relevantní pro sázkaře a
     navazuje na hero metriku formy)?

3. **Rozpis zápasů / kalendář**
   - Filtrování podle ligy, týmu, data.

4. **Detail zápasu** *(hero feature, potvrzeno)*
   - Základní info: datum, čas, stadion, rozhodčí.
   - Sestavy (lineups) — základní 11 + náhradníci.
   - Statistiky zápasu: střely (na branku/mimo), rohy, fauly, karty,
     držení míče — ❓ přesný seznam k doplnění dle toho, co reálně vrátí
     vybrané API (viz `03-data-and-api.md`).
   - **xG** — protože žádné ze srovnaných API nemá nativní xG (kromě
     SportMonks add-onu), pravděpodobně **vlastní model** nad vstupními
     daty o střelách (pozice, typ situace). ❓ To je netriviální
     analytická práce — chceme to řešit v MVP, nebo pro launch dočasně
     převzít xG z API (pokud dostupné) a vlastní model doladit ve fázi 2?
   - Kurzy bookmakerů k zápasu (1X2 + případně O/U) — čistě informativně,
     bez CTA k sázení.
   - Head-to-head historie mezi oběma týmy (posledních N vzájemných
     zápasů).
   - Forma/trend obou týmů (hero metrika, viz níže) přímo v kontextu
     zápasu.

5. **Profil týmu**
   - Statistiky týmu za sezónu, historie posledních zápasů.
   - Forma/trend (hero metrika) v detailním zobrazení (graf/trend přes
     delší období, ne jen posledních 5 zápasů).
   - Kádr/soupiska.

6. **Profil hráče**
   - ❓ OPEN QUESTION — "Srovnávání" bylo zvoleno jako "týmů/hráčů", ale
     hloubka hráčských dat (kompletní statistiky za sezónu, forma
     jednotlivce) je u některých API slabší než týmová data. Chceme v
     MVP plnohodnotné hráčské profily, nebo jen základní údaje (jméno,
     pozice, počet zápasů/gólů) dostatečné pro srovnávací obrazovku?

7. **Srovnávání (Comparisons)** *(hero feature, potvrzeno)*
   - Výběr 2 týmů → side-by-side: aktuální forma/trend, vzájemná historie,
     klíčové statistiky sezóny, případně kurzy na nadcházející vzájemný
     zápas (pokud existuje).
   - Výběr 2 hráčů → side-by-side základní statistiky (dle hloubky dat,
     viz bod 6).

## 2. Hero metrika: pokročilá analýza formy/trendu týmu

❓ OPEN QUESTION — potřebujeme upřesnit definici, než se pustíme do
implementace. Návrh k diskuzi/doplnění:

- **Časové okno:** delší než posledních 5 zápasů — kolik přesně? (např.
  posledních 10–15, nebo celá sezóna s klesající váhou starších zápasů?)
- **Váhování:** novější zápasy váží víc než starší (exponenciální
  decay?) — jaký decay faktor?
- **Home/away split:** samostatný trend pro domácí/venkovní zápasy, nebo
  kombinovaný trend s home/away korekcí?
- **Vstupní veličiny:** jen výsledky (výhra/remíza/prohra), nebo i
  gólový rozdíl, xG (pokud dostupné), síla soupeře (např. váženo podle
  postavení soupeře v tabulce)?
- **Výstup:** jedno skóre (0–100?), nebo vícerozměrný profil (útočná
  forma, defenzivní forma, celková forma)?

## 3. Nefunkční požadavky

- **Výkon:** MVP nepotřebuje real-time live data (live skóre/in-play
  odds jsou explicitně mimo MVP scope — ❓ potvrď, že souhlasíš). Denní/
  post-match aktualizace dat je pro sázkařský pre-match use-case
  dostatečná.
- **Responsivita:** web musí dobře fungovat na mobilním webu (mobile
  app je fáze 3, ale hodně sázkařů bude MVP používat z telefonu přes
  prohlížeč) — mobile-first nebo min. plně responsivní design.
- **Lokalizace:** čeština jako primární jazyk pro MVP; struktura textů
  by ale měla umožnit snadné přidání dalšího jazyka později (i18n-ready,
  ne hardcoded stringy).
- **Bezpečnost:** bez registrace v MVP → menší attack surface, ale API
  klíč k datovému provideru musí být jen na backendu (nikdy ve frontend
  kódu).
- **Škálovatelnost:** MVP nemusí řešit vysoký nápor, ale cachování dat z
  externího API (viz `03-data-and-api.md`) je nutné od začátku kvůli
  rate limitům a nákladům, ne jen kvůli výkonu.

## 4. Explicitně MIMO scope MVP (fáze 2/3)

- Registrace, uživatelské účty, oblíbené týmy/notifikace.
- Paywall a placené tiery.
- Live skóre / in-play odds.
- Affiliate odkazy na sázkové kanceláře, přímá "tipařská" doporučení.
- Mobilní aplikace.
- Vícejazyčnost (jen připravit strukturu, ne dodat další jazyk).
