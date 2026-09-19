# Football Terminal (pracovní název)

Fotbalový analytický web s možným přesahem do registrace/paywallu a mobilní
aplikace. Projekt je ve fázi **product discovery** – před psaním kódu si
vycizelujeme zadání tak, aby architektura i rozsah MVP daly smysl.

## Stav projektu

🟡 **Discovery / specifikace + první klikatelný prototyp** – viz
[`docs/00-process.md`](docs/00-process.md) pro postup a
[`docs/01-product-brief.md`](docs/01-product-brief.md) pro aktuální (živý)
zadávací dokument. V `frontend/` teď navíc běží první UI prototyp na reálných
datech ze SportMonks — viz sekce níže.

## Struktura `docs/`

| Dokument | Obsah |
|---|---|
| `00-process.md` | Jak postupujeme při cizelování zadání (workshopy, milníky) |
| `01-product-brief.md` | Vize, cílové skupiny, monetizace, rozsah MVP vs. dalších fází |
| `02-requirements.md` | Funkční a nefunkční požadavky |
| `03-data-and-api.md` | Strategie datového zdroje (API), datový model, licenční omezení |
| `04-architecture.md` | Návrh architektury backend/frontend/mobile, tech stack |
| `05-monetization-legal.md` | Paywall, platby, GDPR, licence dat |
| `06-roadmap.md` | Fáze projektu, milníky, metriky úspěchu |
| `07-match-detail-spec.md` | **Aktuálně nejdůležitější dokument** — detailní V1 spec (výpis kola + 9 analytických sekcí detailu zápasu pro Chance Ligu) |

Dokumenty jsou živé, plníme je postupně v rámci diskuze — `07` je teď
nejaktuálnější zdroj pravdy pro V1 scope.

## `scripts/`

- `api_football_probe.py` — průzkumný test API-Football pro Chance Ligu
  (coverage, H2H hloubka, statistiky, trenérská historie, hráčská data).
  Potřebuje `API_FOOTBALL_KEY` v prostředí (zdarma na
  dashboard.api-football.com). Viz komentář v souboru pro návod.
- `build_match_data.py` — stáhne ze SportMonks kompletní data pro jedno kolo +
  jeden detailně rozebraný zápas Chance Ligy (H2H, forma, radar, "trendy"
  katalog, Poisson simulace 10 000 zápasů, soupisky, rozhodčí, absence) a
  vygeneruje `frontend/public/data/match.json`. Spusť
  `python3 scripts/build_match_data.py [fixture_id]` pro obnovení dat na jiný
  zápas.

## `frontend/`

První klikatelný prototyp (Vite + React + TypeScript + Tailwind + Recharts)
podle [`docs/07-match-detail-spec.md`](docs/07-match-detail-spec.md), na
reálných datech jednoho zápasu (Slavia Praha – Viktoria Plzeň) stažených ze
SportMonks.

```
cd frontend
npm install
npm run dev
```

Otevři `http://localhost:5173` — uvidíš výpis nejbližšího kola Chance Ligy;
zápas se zeleným štítkem "plná data" má rozklikávací detail se všemi 10
implementovanými sekcemi (H2H, souhrnné H2H statistiky, forma, radar, trendy
obecné i H2H, simulace, srovnání hráčů, rozhodčí, absence). Sekce mají
poznámky (⚠️), kde je logika prototypová/zjednodušená a co je potřeba doladit
dál (viz shrnutí v chatu / `docs/07-match-detail-spec.md`).
