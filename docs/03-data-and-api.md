# Data a API strategie — Football Terminal

> Status: 🔴 nezahájeno.

## Klíčová rozhodnutí

❓ OPEN QUESTION — které ligy/soutěže pokryjeme (top 5 evropských lig? ČR/SK
ligy? mezinárodní poháry? všechno co API nabízí?).

❓ OPEN QUESTION — jak "živá" musí data být (real-time live skóre vs.
denní/post-match aktualizace)? Tohle silně ovlivňuje cenu API.

## Srovnání 3 konkrétních kandidátů (odzkoumáno 09/2026)

Vzhledem k tomu, že primární cílovka jsou **sázkaři**, je klíčové kritérium
dostupnost **kurzů (odds)** a jejich historie, ne jen "surová" statistika.

| | **API-Football** (api-football.com) | **SportMonks** | **Football-Data.org** |
|---|---|---|---|
| Vstupní cena | $0 (100 req/den) → $19/$29/$39/měsíc (7.5k/75k/150k req/den) | €29 (5 lig) → €99 (30 lig) → €249 (120 lig) → custom | €0 (12 soutěží, delayed) → €49/€99/€199 (30/50/100 soutěží) |
| Pre-match odds | ✅ součást **všech** plánů včetně free (historie jen 7 dní) | Standard odds jako **add-on** (€14–69), Premium odds add-on €129–699/měs (TXOdds, 50+ bookmakerů) | Add-on **€15/měs**, jen 1X2, 40 soutěží |
| Live/in-play odds | ✅ součást všech plánů (update ~5s, jen krátce před/po zápase) | ✅ v rámci odds add-onu | ❌ není |
| xG | ❌ není nativně (jen vlastní "predictions" endpoint, není totéž) | Expected Goals jako **add-on** | ❌ není |
| Pokrytí lig | Všechny ligy v každém plánu (limit je jen historie sezón) | 5/30/120/2300+ lig dle plánu | 12→100 soutěží dle plánu |
| **Licenční omezení ⚠️** | Komerční use OK, ale **resale zakázán** a "third-party **betting**, broadcasting, fantasy nebo media rights mohou vyžadovat samostatné povolení" — nutno ověřit přímo s providerem, jestli "analytika pro sázkaře" spadá do standardní licence | Nespecifikováno v rychlém průzkumu — nutno ověřit ToS pro odds redistribuci | Nutno ověřit ToS |

### ✅ FINÁLNÍ ROZHODNUTÍ (kolo 4, 19.9.2026): SportMonks

Ověřeno naživo na reálném (placeném) SportMonks tokenu — Starter/Advanced
plán + Odds add-on, `league_id 262` = Chance Liga:

| Test | Výsledek |
|---|---|
| Liga dostupná na plánu | ✅ HTTP 200 |
| Statistiky zápasu | ✅ 70+ typů/zápas, reálně vyplněné |
| Trenérská historie per historický zápas | ✅ `include=coaches` na H2H endpointu |
| Rozhodčí per zápas (i historicky) | ✅ `include=referees` + entita `/referees/{id}` s per-sezónní statistikou |
| Soupisky týmů | ✅ 28 hráčů se jménem/pozicí/DOB |
| Predikovaná sestava před zápasem | ✅ `include=predictedLineups` |
| Absence hráčů (zranění/tresty) | ⚙️ endpoint existuje, potřeba ověřit na nadcházejícím (ne historickém) zápase |
| Hloubka H2H | ⚠️ jen 5 z 10 požadovaných u testované dvojice — reálné omezení, ne chyba |
| Nativní xG / SportMonks ML predikce | ❌ 403 — mimo současný plán (extra add-on) |

**Rozhodnutí:** jdeme se SportMonks, žádný další test API-Football nebyl
potřeba — data pro Chance Ligu jsou dostatečně hluboká a kvalitní pro
celou V1 specifikaci (`07-match-detail-spec.md`). Podrobný rozbor a
argumentace pro dodatečné příležitosti (rozhodčí, absence hráčů,
predikovaná sestava, build-vs-buy pro xG/predikce) je v sekcích 10–11
`07-match-detail-spec.md`.

Token je uložen lokálně v `.env` (gitignored), probe skripty a jejich
výstupy v `scripts/sportmonks_probe.py` / `scripts/sportmonks_probe_out/`
(taky gitignored).

### ⚠️ Klíčové riziko k ověření před výběrem (historický kontext, již vyřešeno výše)

API-Football explicitně zmiňuje, že **betting use-case může vyžadovat
samostatné povolení** nad rámec standardní licence — a to je přesně náš
primární use-case (sázkařská cílovka). **Doporučení:** než podepíšeme
placený plán, napsat providerovi (API-Football i SportMonks) přímý dotaz:
"stavíme analytický web pro sázkaře, zobrazujeme kurzy a vlastní modely —
spadá to do standardní komerční licence, nebo potřebujeme
enterprise/betting licenci?" Tohle je "must resolve" bod, ne nice-to-have.

### 🇨🇿 Pokrytí české ligy (Chance Liga, dříve Fortuna:Liga) — konkrétní zjištění

Protože ČR/SK je náš klíčový geografický scope (viz `01`), ověřil jsem
pokrytí přímo:

- **API-Football**: má Chance Ligu jako league ID `134` (+ 2. liga #131,
  MSFL #133, Cup #350, ženská liga #460...), **zahrnuto v každém plánu
  včetně free**. ⚠️ Ale: API-Football má u každé soutěže/sezóny `coverage`
  flags (bool per data-typ: odds, predictions, lineups, statistics...) —
  u menších lig bývá hloubka dat nižší než u top-5 evropských lig. Nutno
  ověřit konkrétně přes `/leagues?id=134` v free tieru, **než** se
  rozhodneme platit.
- **SportMonks**: má Chance/Fortuna Ligu explicitně jako
  marketingově zmiňovanou soutěž s "plnou výbavou" — live skóre, sestavy,
  statistiky, **xG i predikce/odds jako add-on**. Vypadá to na nejlepší
  *hloubku* dat pro ČR ligu, ale je potřeba, aby byla v rámci vybraných
  lig na tvém plánu (Starter = jen 5 lig, Growth = 30 lig — pro "top
  evropské ligy + ČR + SK" pravděpodobně potřebuješ **Growth (€99/měs)**,
  plus odds/xG add-ony navíc → reálně **€150–250+/měsíc**).
- **Football-Data.org**: nižší tiery (Free/Standard) pokrývají jen 12–30
  převážně západoevropských soutěží (Premier League, La Liga, Bundesliga,
  Serie A, Ligue 1, Champions League...) — **Chance Liga na seznamu
  free-tier soutěží není** a nemám jistotu, zda je zahrnuta ani ve vyšších
  tierech (50/100 soutěží). Pro náš use-case je tenhle provider **rizikový
  kandidát**, pokud je ČR liga must-have.

**Doporučení (tech lead pohled):** začít s **API-Football** (nejlevnější,
kurzy součástí od free tieru, ČR liga formálně podporována) — ale **před
platbou** si na free tieru (100 req/den zdarma) ověřit přes `/leagues` a
`/odds` endpoint, jaká je reálná hloubka dat (odds, statistiky) konkrétně
pro Chance Ligu. Pokud by hloubka byla nedostatečná, SportMonks Growth je
záložní varianta s vyšší jistotou kvality, ale ~4–6× vyšší cenou. Tohle je
levný a rychlý test (pár hodin), který doporučuju udělat jako první úkol
před finálním výběrem — nemá smysl rozhodovat najisto bez ověření na
reálných datech.

### ✅ Checklist pro rychlý API test (rozšířeno po `07-match-detail-spec.md`)

Konkrétní věci k ověření na free tieru API-Football pro **Chance Ligu**,
než se zaváže rozpočet — vzniklo z detailní specifikace zápasové stránky:

1. `/fixtures/statistics` u historických zápasů Chance Ligy — jsou
   opravdu vyplněné shots/corners/fouls/cards/possession, nebo jen u
   části sezón?
2. `/fixtures/headtohead` — kolik reálně vzájemných zápasů je k
   dispozici pro běžnou dvojici týmů (potřebujeme ~10 pro sekci H2H)?
3. **`/coachs`** — ⚠️ nejrizikovější bod: existuje spolehlivá kariérní
   historie trenérů (tým + časové období) pro kluby v Chance Lize, se
   kterou by šlo párovat "trenér v době konkrétního historického
   zápasu"? Tohle je nutné ověřit **před** slibováním filtru "podle
   trenéra" v H2H statistikách.
4. Jak hluboko do historie sezón sahá free/nejlevnější placený tier
   (kolik sezón zpět) — ovlivňuje, kolik dat máme na "celou sezónu" v
   radaru a na trenérský filtr.

### Další kandidáti (neprozkoumáno do hloubky, k případnému zvážení)

- Opta / Stats Perform — enterprise, nejkvalitnější data (vč. xG), ale
  drahé a se sales procesem — pravděpodobně nad rozpočet pro MVP.
- StatsBomb — pokročilé metriky (xG), spíš B2B/enterprise.
- Dedikovaní odds provideři (The Odds API, Betfair Exchange API) — pokud
  by hlavní API nemělo dostatečnou kvalitu kurzů, dá se kombinovat.

## Obecná kritéria pro finální výběr

- Cenu / tiery (počet requestů, počet lig) — pro MVP s rychlým timeline
  pravděpodobně stačí nejnižší platený tier.
- **Licenční podmínky pro betting use-case (viz výše — kritické)**
- Rate limity a SLA
- Formát a šíři dat (statistiky, sestavy, xG, historická data, kurzy)
- Dostupnost webhooků / push notifikací pro live data

## Datový model (návrh, k doplnění)

❓ OPEN QUESTION — entity: liga, sezóna, tým, hráč, zápas, statistika
zápasu, statistika hráče... (doplníme po volbě providera, protože struktura
se odvíjí od toho, co API vrací).

## Caching a náklady

❓ OPEN QUESTION — strategie cachování dat (abychom neplatili za opakované
requesty), interní datový sklad vs. živé proxy na API.
