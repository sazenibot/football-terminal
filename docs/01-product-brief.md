# Product Brief — Football Terminal

> Status: 🟡 rozpracováno. Doplňujeme v rámci discovery diskuze (viz
> `00-process.md`).

## 1. Vize (elevator pitch)

❓ OPEN QUESTION — v jedné až dvou větách: co Football Terminal dělá a pro
koho, čím se liší od existujících fotbalových statistických webů
(FotMob, WhoScored, Sofascore, FBref...)?

## 2. Cílové skupiny (personas)

✅ **Rozhodnuto (kolo 1):** primární cílovka jsou **sázkaři / tipsteři** —
uživatelé, kteří potřebují data a analýzy pro rozhodování o sázkách.

⚠️ **Důležitý dopad tohoto rozhodnutí** (viz `05-monetization-legal.md`):
- Obsah orientovaný na sázkaře může spadat pod regulaci hazardu/reklamy na
  hazard v ČR/SK a EU (věková verifikace, povinné disclaimery, omezení
  reklamy). Nutno ověřit, zda web pouze *analyzuje* data (legální) nebo
  přímo *doporučuje sázky* (citlivější kategorie).
- Ne všechny datové API dovolují použití dat pro "betting" účely v rámci
  standardní licence — viz `03-data-and-api.md`.

❓ OPEN QUESTION — sekundární cílovky (nice-to-have, ne blokující MVP)?
Např. zapálení fanoušci, fantasy football hráči.

## 3. Problém a hodnota (proč by uživatel platil)

✅ **Rozhodnuto (kolo 1):** diferenciace přes **unikátní metriky a vlastní
analytické modely** (ne jen agregace toho, co API vrátí "z krabice").

✅ **Rozhodnuto (kolo 2) — hero metrika pro MVP:** pokročilá analýza
formy/trendu týmu — víc než posledních 5 zápasů, vážený trend, home/away
split. Konkrétní definici metriky (jak přesně se počítá, jaké váhy, jaké
časové okno) doplníme v `02-requirements.md` jako detailní funkční
požadavek — tohle už je otázka na datového/produktového detail-design, ne
na strategické rozhodnutí.

## 4. Rozsah MVP

✅ **Rozhodnuto (kolo 1 + doplnění) — jistě v MVP:**
- Detail zápasu (statistiky, sestavy, xG)
- Srovnávání týmů/hráčů (head-to-head)

✅ **Rozhodnuto (kolo 2):**
- Pozice vůči sázkám: **čistá analytika**, žádné affiliate odkazy na
  sázkovky, žádná přímá doporučení sázek (viz `05-monetization-legal.md`).
- Monetizace: **vícetierové předplatné** (Free/Pro/Premium apod.) —
  detaily tierů doplníme v `05-monetization-legal.md`.
- Kapacita týmu: primárně **AI agent (Cursor)** jako implementátor, ty
  jako PM/review — ovlivňuje `04-architecture.md` (preferovat konvenční,
  dobře zdokumentované a managed řešení, aby údržba nebyla závislá na
  hlubokých DevOps znalostech).

Návrh struktury (k potvrzení):
- **MVP (fáze 1):** web, bez registrace, ohnisko na sázkařsky relevantní
  data (zápasy top evropských lig + ČR/SK) + hero metrika formy/trendu.
- **Fáze 2:** registrace + vícetierový paywall (prémiové metriky/predikce).
- **Fáze 3:** mobilní aplikace.

## 5. Konkurence a diferenciace

Hlavní konkurenti (orientačně): FotMob, Sofascore, WhoScored, FBref —
obecné statistické weby/appky. Specializovanější "betting analytics" hráči
(např. Forebet, BetExplorer) jsou blíž k naší cílovce sázkařů.

✅ **Rozhodnuto (kolo 2):** profilujeme se jako **analytický nástroj pro
sázkaře** (ne "obecný stat web"), ale s **čistě analytickým** rámováním —
bez affiliate odkazů na sázkovky a bez přímých "vsaď na..." doporučení.
Branding/texty by měly komunikovat "data a modely pro tvoje rozhodování",
ne "tipy na výhru".

## 6. Geografický a jazykový scope

✅ **Rozhodnuto (kolo 1):** top evropské ligy + ČR/SK, čeština jako
primární jazyk (AJ případně později).
