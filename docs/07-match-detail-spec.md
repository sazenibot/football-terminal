# V1 Spec — Výpis kola + Detail zápasu (Chance Liga)

> Status: 🟡 detailní rozpracování zadání od produktového vlastníka
> (19.9.2026). Toto **nahrazuje/zpřesňuje** dřívější širší návrh v
> `02-requirements.md` — viz shrnutí dopadu na konci tohoto dokumentu.
>
> Značím: ✅ potvrzeno, ⚙️ technický/datový detail k rozhodnutí, ⚠️ riziko,
> ❓ otázka na tebe.

## 0. Rámec V1

✅ **Potvrzeno:** V1 = **jedna liga (Chance Liga)**, žádná registrace,
žádný paywall. Dvě obrazovky:
1. Výpis zápasů následujícího kola.
2. Detail zápasu (7 analytických sekcí níže).

✅ **Rozhodnuto (kolo 3):**
- Sestavy (lineupy) a samostatné xG → **odsunuto mimo V1** (potvrzeno).
- **Srovnání hráčů → PŘIDÁNO do V1** jako nová sekce 9 (viz níže) —
  statistiky hráčů, kteří aktuálně hrají za oba týmy.

---

## 1. Výpis zápasů následujícího kola

- Zápasy nejbližšího nadcházejícího kola Chance Ligy (round-based, ne
  jen "dnes/zítra").
- Klik na zápas → detail.

⚙️ **Datově:** API-Football `/fixtures?league=134&round=...` — potřeba
zjistit aktuální round buď z `/fixtures/rounds?current=true`, nebo
odvodit z data. Jednoduché, nízké riziko.

❓ Co když se dohrává předchozí kolo (odložené zápasy)? Zobrazit obě kola
najednou, nebo řešit později?

---

## 2. H2H — základní výsledkový přehled (posledních 10 zápasů)

- Posledních 10 vzájemných zápasů, s možností filtrovat jen
  domácí/venkovní (z pohledu aktuálního domácího týmu, předpokládám).

⚙️ **Datově:** `/fixtures/headtohead?h2h=teamA-teamB`. Nízké riziko pro
funkčnost, ale:

⚠️ **Riziko hloubky historie:** pokud spolu týmy nehrály 10× v posledních
letech (postupy/sestupy, nový klub v lize), nemusí být 10 zápasů k
dispozici. → potřebujeme fallback ("zobrazeno posledních N < 10, kolik
reálně existuje") a stejně tak ověřit, jak hluboko do historie sezón
free/placený tier API-Football sahá (viz `03-data-and-api.md`, kolonka
"season coverage").

❓ **Potvrď default:** "domácí/venkovní" filtr = z pohledu týmu, který
hraje doma v *tomto* nadcházejícím zápase? (tzn. přepínač "zápasy, kdy
hrál doma Team A" / "zápasy, kdy hrál doma Team B")

---

## 3. H2H — souhrnná statistika (filtrovatelná dle roku a trenéra)

- Agregace přes vzájemné zápasy: střely, střely na branku, rohy, fauly,
  žluté/červené karty, držení míče.
- Filtry: podle jednotlivých let (sezón) a **podle trenéra, který vedl
  daný tým** v době zápasu.

⚙️ **Datově — dvě různé obtížnosti:**
- Statistiky zápasu (shots/corners/fouls/cards/possession) — dostupné
  přes `/fixtures/statistics`, ale ⚠️ **coverage flag riziko**: u menších
  lig (a starších sezón) nemusí být tahle statistika zaznamenaná pro
  všechny historické zápasy. Nutno ověřit přímo pro Chance Ligu (viz
  API test v `03-data-and-api.md`).
- **Filtr podle trenéra** — ⚠️ **toto je nejrizikovější datový
  požadavek v celé specifikaci.** Potřebujeme vědět, kdo byl trenér
  týmu **v den konkrétního historického zápasu** (ne jen aktuálního).
  API-Football má `/coachs` endpoint s kariérní historií (tým + od–do
  data) u trenérů, ze které by se to teoreticky dalo poskládat, ale:
  - Coverage/kvalita těchto dat u Chance Ligy je neznámá — je to typ dat,
    který bývá spolehlivý u top lig, u menších lig často mezerovitý.
  - Vyžaduje to netriviální backend logiku: pro každý H2H zápas dohledat
    datum → najít, který trenér byl u kterého týmu v tom období →
    přiřadit.

  **Doporučení:** zařadit ověření dostupnosti trenérských dat pro Chance
  Ligu do stejného "rychlého API testu", co plánujeme pro odds/statistiky
  (viz `03-data-and-api.md`). Pokud data nebudou dost kvalitní/kompletní,
  tenhle filtr buď odložíme, nebo omezíme jen na **posledních N let**, kde
  si trenéra dohledáme manuálně/spolehlivěji.

❓ Když se v rámci jednoho zápasu trenér změnil týden před/po (přestupní
okno), jak přesně párovat datum zápasu s trenérským obdobím — potřebujeme
přesnost na den, nebo stačí "sezóna"?

---

## 4. Forma posledních 6 zápasů obou týmů (filtrovatelné doma/venku)

- Posledních 6 zápasů každého týmu (ne vzájemných — jejich obecná forma),
  s možností filtrovat jen doma/venku.

⚙️ **Datově:** `/fixtures?team=X&last=6` (nebo více a filtrovat po
straně, pokud chceme "posledních 6 domácích" ne "posledních 6 zápasů,
z nich některé doma"). ❓ **Potvrď, co přesně znamená "doma/venku
filtr" tady:** (a) z posledních 6 zápasů ukázat jen ty, co byly doma/
venku (může být méně než 6 řádků), nebo (b) vzít posledních 6 *domácích*
zápasů bez ohledu na to, jak dávno byly?

❓ **Co se konkrétně zobrazuje** pro "formu" — navrhuju: sled výsledků
(V/R/P), skóre, soupeř, a souhrnně body/gólový rozdíl za těch 6 zápasů.
Sedí to, nebo si formu představuješ jinak (např. i nějaké skóre 0-100)?

*(Poznámka: tohle nahrazuje dřívější složitější "hero metrika s
exponenciálním decay" z `02-requirements.md` — tvoje konkrétní zadání
"posledních 6 zápasů" je jednodušší a jasnější, doporučuju jít touto
cestou a decay-váhování nechat na později, pokud se ukáže potřeba.)*

---

## 5. Radarové srovnání týmů (3 časová okna)

- Radar graf srovnávající oba týmy v "základních metrikách" za:
  (a) celou sezónu, (b) posledních 5 zápasů, (c) poslední 3 vzájemné
  zápasy.

✅ **Rozhodnuto (kolo 3) — finální metriky pro radar:**
- Vstřelené góly / zápas
- Obdržené góly / zápas
- Střely celkem / zápas
- Střely na branku / zápas
- Rohy / zápas
- Držení míče (%)
- Karty / fauly za zápas (i když netypické pro radar výkonu — zahrnuto
  na tvé přání)

⚠️ **Škálování radaru:** metriky mají různé rozsahy (góly ~0-3, držení
míče ~30-70%) — potřebujeme je normalizovat (např. 0–100 relativně k
ligovému průměru/rozsahu), jinak bude radar vizuálně nepoužitelný. Tohle
je implementační detail, ale chci ho zmínit, ať víš, že "srovnání"
neznamená čísla 1:1 v grafu.

---

## 6. "Trendy" — vzory ≥80 % v posledních 5 zápasech týmu (obecně)

- Z dat automaticky najít situace, které nastaly v ≥80 % z posledních 5
  zápasů daného týmu (např. "oba dají gól" 80 %, "míň než 5 žlutých
  karet" 100 %).

⚠️ **Důležité statistické upozornění (tech lead pohled):** při n = 5
zápasů je 80 % = 4 z 5. Pokud testujeme **hodně kandidátních tvrzení**
(BTTS, over/under X rohů, over/under X karet, čistá konta, remízy,
comeback, atd.), je **matematicky jisté**, že najdeme několik "vzorů
≥80 %" čistě náhodou — to je klasický problém "multiple testing" /
data dredging. Není to důvod featuru nedělat (je to legitimní a
zajímavý insight pro sázkaře), ale:
- Musí být **transparentně vidět počet zápasů** (např. "4/5 zápasů", ne
  jen "80 %"), aby uživatel viděl malou vzorku.
- Doporučuju formulaci důsledně **popisnou, ne prediktivní** ("v
  posledních 5 zápasech nastalo X" — ne "X se stane příště") — souhlasí
  to s naší pozicí "čistá analytika, žádná doporučení" z
  `05-monetization-legal.md`.

⚙️ **Potřebujeme definovat katalog kandidátních tvrzení** (nejde to
generovat úplně "od nuly" bez definice, co vůbec testovat). Návrh
startovního katalogu (k doplnění/úpravě):
- Oba týmy skórovaly (BTTS) / nastalo, nenastalo
- Čisté konto (žádný gól obdržen)
- Over/Under 1.5, 2.5, 3.5 gólů v zápase
- Over/Under X rohů (kde X = zvolit rozumnou hranici, např. 9.5)
- Over/Under X žlutých karet
- Padla červená karta
- Výhra/prohra/remíza
- Vedení v poločase se udrželo/neudrželo
- ❓ Cokoli dalšího, co máš na mysli konkrétně?

✅ **Rozhodnuto (kolo 3):** širší katalog (~20+ tvrzení) — víc "objevů",
akceptujeme víc šumu (proto trváme na zobrazení "X/5 zápasů" vedle
procenta, viz upozornění výše, aby uživatel viděl velikost vzorku).

⚙️ **Návrh katalogu ~22 tvrzení pro V1** (kontrolní seznam k tvé revizi —
klidně škrtej/doplňuj přímo v souboru):

*Gólové:*
1. Oba týmy skórovaly (BTTS)
2. Čisté konto týmu (0 obdržených gólů)
3. Čisté konto soupeře (0 vstřelených gólů soupeřem)
4. Over 1.5 gólů v zápase
5. Over 2.5 gólů v zápase
6. Under 2.5 gólů v zápase
7. Tým vstřelil 2+ gólů
8. Tým vstřelil 0 gólů
9. Vedení v poločase se udrželo do konce
10. Padl gól v prvním poločase
11. Padl gól po 75. minutě

*Rohy:*
12. Over 9.5 rohů v zápase (celkem)
13. Under 9.5 rohů v zápase (celkem)
14. Tým měl víc rohů než soupeř

*Karty/fauly:*
15. Méně než 5 žlutých karet v zápase (celkem)
16. 5+ žlutých karet v zápase (celkem)
17. Padla červená karta
18. Tým dostal 2+ žluté karty

*Výsledkové:*
19. Výhra týmu
20. Remíza
21. Prohra týmu
22. Tým prohrával a otočil na výhru/remízu ("comeback")

❓ Sedí ti tenhle seznam, nebo chceš něco vyměnit/přidat (např. konkrétní
hranice u over/under rohů/karet — 9.5 je můj odhad, ne ověřený ligový
průměr pro Chance Ligu)?

---

## 7. "Trendy" — stejné, ale pro posledních 3 nebo 5 vzájemných zápasů

- Stejná logika jako sekce 6, ale nad H2H podmnožinou zápasů.

✅ **Rozhodnuto (kolo 3):** přepínač **3/5** pro uživatele. Připomínka k
zapracování do UI: u n=3 je 80% práh matematicky nedosažitelný přesně
(bude to 2/3 = 67 %, nebo 3/3 = 100 %) — v UI/textu formulovat jako
"nastalo ve X ze 3 zápasů", ne jen "%", aby to nepůsobilo zavádějícím
dojmem falešné přesnosti.

Stejný katalog tvrzení jako v sekci 6, jen na H2H datech + stejné
upozornění na malý vzorek (u H2H je to ještě výraznější, protože
vzájemných zápasů je z podstaty málo).

---

## 8. Simulace 10 000 zápasů

- Monte Carlo simulace zápasu zohledňující: domácí/venkovní prostředí,
  formu, vzájemnou formu (H2H), statistické ukazatele posledních zápasů.
- Výstup: pravděpodobnosti (výsledek, případně BTTS/over-under atd.).

⚠️ **Toto je nejnáročnější část celé specifikace — doporučuju ji brát
jako samostatný "epic", ne jako jednu z rovnocenných sekcí stránky.**
Je to v podstatě jádro naší budoucí diferenciace ("vlastní analytické
modely" z `01-product-brief.md`), takže si zaslouží vlastní
návrh/review, ne jen "naimplementovat a hotovo".

⚙️ **Navrhovaný přístup (k diskuzi, ne finální rozhodnutí):**
1. Odhadnout **útočnou a defenzivní silu** obou týmů (např. z gólů
   vstřelených/obdržených doma/venku, relativně k ligovému průměru) —
   standardní přístup v fotbalové analytice je **Poissonovo/Dixon-Coles
   model** očekávaných gólů (λ_domácí, λ_hosté).
2. Do odhadu λ zakomponovat váhy: dlouhodobá síla (sezóna) vs. aktuální
   forma (posledních 5–6) vs. H2H historie — potřebujeme se domluvit na
   **relativní váze** těchto tří vstupů (např. 50 % sezóna / 30 % forma /
   20 % H2H, ale to je jen ilustrační výchozí bod k diskuzi).
3. Z λ_domácí/λ_hosté **simulovat 10 000 náhodných výsledků** (Poisson
   sampling) → z toho spočítat rozložení: pravděpodobnost výhry/remízy/
   prohry, BTTS %, over/under %, top-N nejpravděpodobnějších skóre.
4. Výpočet běží na backendu (10 000 Poisson vzorků je řádově
   milisekundy, žádný problém na výkon) — na rozdíl od "trendů" tady není
   problém s rychlostí, problém je **kvalita/kalibrace modelu**.

⚠️ **Doporučení k procesu:** než tohle nasadíme uživatelům jako "hotovou"
featuru, měli bychom model **backtestovat** na historických zápasech
(spustit model na starých datech a porovnat predikované pravděpodobnosti
s reálnými výsledky) — jinak riskujeme, že ukážeme čísla, která vypadají
autoritativně, ale jsou nekalibrovaná. Navrhuju to oznít jako "V1.1"
krok hned po prvním nasazení modelu, ne blokovat launch, ale mít to v
roadmapě a případně featuru označit jako "beta" do doby backtestu.

✅ **Rozhodnuto (kolo 3):** Poisson/Dixon-Coles jako výchozí model.
Vzhledem k rychlému timeline a solo AI-agent implementaci je to správná
volba — ML model by potřeboval výrazně víc historických dat, delší
vývoj a náročnější validaci, což by mělo ohrozit V1 launch. Poisson
přístup zůstává **upgradovatelný** později (fáze 2), pokud budeme mít
dost dat na trénování ML modelu a ukáže se, že přinese lepší kalibraci.

---

## 9. Srovnání hráčů (přidáno v kole 3)

✅ **Rozhodnuto:** srovnání hráčů, kteří **aktuálně hrají za oba týmy**
v tomto zápase (ne historičtí hráči) — statistiky pro rozhodování
sázkaře (např. gólman vs. čistá konta, útočník vs. střely/góly).

⚙️ **Datově:** `/players?team=X&season=Y` pro seznam hráčů + jejich
sezónní statistiky (zápasy, minuty, góly, asistence, karty, u brankářů
zásahy/čistá konta). ⚠️ **Riziko:** hloubka hráčských statistik u
menších lig bývá u API-Football/SportMonks slabší než u top-5
evropských lig (např. chybí detailní pozice na hřišti, driblingy apod.)
— stejný typ rizika jako u ostatních sekcí, ověříme v rámci API testu.

❓ **Otevřené otázky k doladění:**
- **Výběr hráčů k porovnání** — uživatel si vybírá 2 konkrétní hráče
  (např. z rozevíracího seznamu soupisky), nebo systém automaticky
  navrhne "zajímavé" dvojice (např. nejlepší střelec vs. nejlepší
  střelec, brankář vs. brankář)? Navrhuju pro V1: uživatel si vybírá
  volně z obou soupisek, žádné automatické párování — jednodušší na
  implementaci a flexibilnější pro uživatele.
- **Jaké konkrétní statistiky zobrazit** — návrh: odehrané zápasy/
  minuty, góly, asistence, žluté/červené karty, (u brankářů: čistá
  konta, obdržené góly). Sedí, nebo chceš i pokročilejší metriky (např.
  góly na zápas, forma hráče v posledních N zápasech)?
- Zobrazit jako tabulku side-by-side, nebo taky radarový graf jako u
  týmů (sekce 5)?

---

## 10. Rozhodčí (nová sekce, návrh z kola 4 — tvůj nápad, ověřeno naživo)

✅ **Datově ověřeno naživo (SportMonks, Chance Liga):** fixture obsahuje
`referees` include (hlavní rozhodčí + 2 asistenti, přes `type_id`), a
existuje samostatná entita `/referees/{id}` s **per-sezónní statistikou**
(`statistics` include, rozpadá se po sezónách přes `season_id`). Navíc —
protože referees include funguje i na **historických H2H zápasech**,
získáváme "kdo pískal tento konkrétní vzájemný zápas" prakticky zadarmo
ze stejného volání, které už používáme pro sekci 2–3.

**Návrh obsahu sekce (k tvému schválení):**
- **Styl rozhodčího** (za sezónu/delší období): průměr faulů/zápas,
  průměr žlutých/červených karet/zápas, poměr faulů na kartu (jak
  "přísný" je — nízký poměr = píská hodně kartu za málo faulů).
- **Historie s danými týmy**: kolikrát už pískal zápasy Team A / Team B
  v posledních N sezónách a s jakými průměry karet/faulů u nich.
- **Historie konkrétně tohoto H2H**: pískal už některý z posledních
  vzájemných zápasů těchto dvou týmů? Pokud ano, jak ten zápas
  "odpískal" (karty, penalty, atd.) — přesně, jak jsi navrhoval.

⚠️ **Upozornění na malý vzorek** platí i tady (stejné jako u sekce 6–7) —
u rozhodčích v menší lize může být historie s konkrétním týmem jen 1-2
zápasy, takže "styl" ukazovat spíš na celkové sezónní statistice
rozhodčího než jen na střetu s jedním týmem.

✅ **Rozhodnuto (kolo 4):** rozsah sekce potvrzen přesně jak navrženo.

---

## 11. Další příležitosti, které jsem našel při testu dat (k tvému rozhodnutí)

Při ověřování API jsem narazil na data, která **nebyla v původním zadání**,
ale dávají smysl pro sázkařskou cílovku a jsou levná na implementaci,
protože už máme přístup k datům. Argumentuju je jednotlivě — je na tobě,
co z toho chceš do V1, a co je "later":

### 12. Absence hráčů (zranění/tresty) — nová sekce (potvrzeno kolo 4)

✅ **Rozhodnuto:** přidáno do V1 jako plnohodnotná sekce 12.

Chybějící klíčoví hráči (zraněný útočník, vyloučený obránce) jsou jeden z
nejsilnějších signálů, které reálně hýbou sázkovými kurzy — silnější než
většina statistických "trendů" v sekci 6-7. Datově ověřeno, že endpoint
existuje (`include=sidelined`); u testovaného *historického* zápasu
vrátil 0 položek (logické — u odehraného zápasu se absence nedohledávají
zpětně).

⚙️ **Zbývá ověřit** na **nadcházejícím** zápase (ne historickém) — první
úkol v rámci implementace této sekce: potvrdit, že se pro budoucí fixture
skutečně vyplní jméno hráče, typ absence (zranění/karta/jiné) a
očekávaný návrat.

### 11b. Predikovaná sestava před zápasem — `predictedLineups` include

✅ **Rozhodnuto:** přidáno jako drobný bonus info-box (ne samostatná
sekce) — u sekce 4 (detail zápasu) a/nebo sekce 9 (srovnání hráčů).

Na testovaném zápase vrátilo 22 hráčů (kompletní odhad základních 11 +
formace pro oba týmy) ještě **před** vydáním oficiální sestavy. Je to
*odhad* dostupný dny dopředu, ne oficiální confirmed lineup — nekoliduje
to s tím, že plnou "sestavy" featuru (oficiální lineup) jsme odložili.

### 11c. Nativní xG a SportMonks vlastní predikce (ML) — `xGFixture`,
`predictions` includes
**Zjištění, ne návrh na akci — je to spíš strategické rozhodnutí pro
sekci 8 (simulace).** Oba tyto includy vrátily **403 Forbidden** — tvůj
současný plán (Starter/Advanced + Odds add-on) na ně nemá přístup, je to
extra add-on. To znamená rozhodnutí typu "build vs. buy" pro naši hero
featuru (simulace 10 000 zápasů, sekce 8):
- **Build (náš vlastní Poisson/Dixon-Coles model)** — diferenciace,
  žádný extra náklad na add-on, ale vyžaduje vlastní práci a backtest
  (jak jsme se domluvili).
- **Buy (koupit SportMonks Predictions add-on)** — rychlejší k nasazení,
  ale (a) je to přesně to, co dělá i konkurence, takže ztrácíme
  diferenciaci, (b) další měsíční náklad, (c) nekontrolujeme metodiku.

**Moje doporučení: zůstat u plánu "build" z kola 3** — vlastní model je
přesně ta věc, která nás odlišuje (viz `01-product-brief.md` sekce 3), a
teď víme jistě, že "koupit řešení" by stejně vyžadovalo platit za další
add-on. Uvádím to jen proto, aby to bylo explicitní rozhodnutí, ne
opomenutí.

### 11d. Počasí — `weatherReport` include
Data existují (`present` v testu), ale řadím to jako nízkou prioritu /
fáze 2 nápad — vliv počasí na statistické vzory je zajímavý, ale
sekundární oproti absencím hráčů nebo rozhodčímu. Nenavrhuju to řešit
teď.

### 11e. Upřesnění: SportMonks `trends` include ≠ naše "trendy" (sekce 6-7)
Pro pořádek — SportMonks má vlastní `trends` include, ale to je
**minutová časová řada herních statistik v průběhu zápasu** (např. "ve 2.
minutě měl tým X 2 střely"), ne totéž, co plánujeme v sekcích 6-7 (vzory
≥80 % napříč posledními zápasy). Tohle si tedy stejně musíme postavit
sami z hotových zápasových statistik — žádná zkratka se nekonala, jen
upřesňuji, ať nedojde k záměně názvů.

---

## Shrnutí dopadu na `02-requirements.md`

- Tento dokument **zpřesňuje V1** na jednu ligu + tyto dvě obrazovky
  (aktuálně 10 potvrzených analytických sekcí + 3 navržené k rozhodnutí,
  viz sekce 1–11 výše).
- Sestavy, samostatné xG, tabulka ligy, profil týmu/hráče jako
  samostatné stránky → **odsunuto** z V1 (ne zrušeno). Srovnání hráčů
  **je součástí V1** (sekce 9), rozhodčí **je součástí V1** (sekce 10),
  absence hráčů **je součástí V1** (sekce 12) + drobný bonus
  predikované sestavy (viz 11b).
- "Hero metrika formy/trendu" z `02-requirements.md` sekce 2 je
  nahrazena jednodušší, konkrétní definicí v sekci 4 výše.

## ✅ Datový provider — ROZHODNUTO (kolo 4)

**SportMonks je finální volba** (aktivní placené předplatné Starter/
Advanced + Odds add-on). Naživo ověřeno na `league_id 262` (Chance
Liga): statistiky zápasu (70+ typů), trenérská historie per historický
zápas, rozhodčí per zápas (i historicky), soupisky týmů — všechno
funguje. Jediné potvrzené omezení: H2H historie reálně dává min. 5 (ne
vždy 10) vzájemných zápasů u testované dvojice — počítat s "posledních
N ≤ 10, kolik reálně existuje", jak už bylo navrženo v sekci 2. Detaily
a syrová data testu viz `scripts/sportmonks_probe_out/` (needá se do
gitu, jen lokálně pro referenci) a aktualizovaná `03-data-and-api.md`.

xG a SportMonks vlastní ML predikce **nejsou na současném plánu**
(403 Forbidden) — netýká se to naší schopnosti postavit V1, jen to
potvrzuje, že simulace v sekci 8 musí být **náš vlastní model** (viz
11c), ne převzatá data.
