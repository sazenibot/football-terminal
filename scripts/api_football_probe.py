#!/usr/bin/env python3
"""
Rychlý průzkumný test API-Football pro Chance Ligu (Česko, league ID 134).

Cíl: ověřit před placeným plánem, jak hluboká/kvalitní jsou data, na
kterých stavíme spec v docs/07-match-detail-spec.md:
  1. Coverage flags ligy/sezóny (co je vůbec dostupné).
  2. Hloubka vzájemných zápasů (H2H) mezi dvěma kluby.
  3. Vyplněnost statistik zápasu (střely, rohy, karty, držení míče).
  4. Dostupnost kariérní historie trenérů (potřebné pro filtr "podle
     trenéra" v H2H statistikách).
  5. Hloubka hráčských statistik (potřebné pro srovnání hráčů).

Použití:
    1. Zaregistruj se zdarma na https://dashboard.api-football.com/register
       (free tier, 100 requestů/den, bez platební karty).
    2. V dashboardu najdi svůj API klíč (přímý přístup přes
       v3.football.api-sports.io, ne přes RapidAPI).
    3. export API_FOOTBALL_KEY="tvůj_klíč"
    4. python3 scripts/api_football_probe.py

Výstup: shrnutí do konzole + syrové JSON odpovědi do scripts/api_probe_out/
pro detailní ruční prohlídku.
"""

import json
import os
import ssl
import sys
import time
import urllib.request
import urllib.parse
from pathlib import Path

try:
    import certifi

    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

BASE_URL = "https://v3.football.api-sports.io"
LEAGUE_ID = 134  # Chance Liga / Fortuna Liga (Czech Republic), dle API-Football coverage listu
OUT_DIR = Path(__file__).parent / "api_probe_out"
SLEEP_BETWEEN_CALLS = 1.2  # ať jsme v klidu i vůči per-minute limitu na free tieru


def get_api_key() -> str:
    key = os.environ.get("API_FOOTBALL_KEY")
    if not key:
        print(
            "CHYBA: chybí API_FOOTBALL_KEY v prostředí.\n"
            "Zaregistruj se zdarma na https://dashboard.api-football.com/register,\n"
            "najdi API klíč v dashboardu, a spusť:\n"
            '  export API_FOOTBALL_KEY="tvůj_klíč"\n'
            "  python3 scripts/api_football_probe.py",
            file=sys.stderr,
        )
        sys.exit(1)
    return key


def call(endpoint: str, params: dict, key: str) -> dict:
    url = f"{BASE_URL}{endpoint}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"x-apisports-key": key})
    with urllib.request.urlopen(req, timeout=20, context=SSL_CONTEXT) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    remaining = resp.headers.get("x-ratelimit-requests-remaining")
    if remaining is not None:
        print(f"  (zbývá dnes requestů: {remaining})")
    return data


def save_raw(name: str, data: dict) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{name}.json"
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"  -> uloženo do {path}")


def main() -> None:
    key = get_api_key()
    current_season = None

    # 1) Coverage flags ligy/sezóny
    print(f"\n[1/5] /leagues?id={LEAGUE_ID} — coverage flags Chance Ligy")
    data = call("/leagues", {"id": LEAGUE_ID}, key)
    save_raw("01_league_coverage", data)
    try:
        seasons = data["response"][0]["seasons"]
        current = next(s for s in seasons if s.get("current"))
        current_season = current["year"]
        print(f"  Aktuální sezóna: {current_season}")
        print(f"  Coverage flags: {json.dumps(current.get('coverage', {}), indent=2, ensure_ascii=False)}")
        seasons_available = [s["year"] for s in seasons]
        print(f"  Dostupné sezóny (kolik historie máme): {sorted(seasons_available)}")
    except Exception as e:
        print(f"  ⚠️ Nepodařilo se rozparsovat coverage: {e}")
    time.sleep(SLEEP_BETWEEN_CALLS)

    # 2) Najít dva kluby k testu H2H (vezmeme první dva týmy z ligy)
    print(f"\n[2/5] /teams?league={LEAGUE_ID}&season={current_season} — seznam týmů")
    data = call("/teams", {"league": LEAGUE_ID, "season": current_season}, key)
    save_raw("02_teams", data)
    teams = [t["team"] for t in data.get("response", [])]
    for t in teams:
        print(f"  {t['id']}: {t['name']}")
    time.sleep(SLEEP_BETWEEN_CALLS)

    if len(teams) < 2:
        print("⚠️ Nedostatek týmů k testu H2H, končím zde.")
        return

    team_a, team_b = teams[0], teams[1]
    print(f"\n>>> Pro testy H2H/statistik/trenérů použiji: {team_a['name']} vs {team_b['name']}")

    # 3) H2H hloubka
    print(f"\n[3/5] /fixtures/headtohead?h2h={team_a['id']}-{team_b['id']}&last=10")
    data = call(
        "/fixtures/headtohead",
        {"h2h": f"{team_a['id']}-{team_b['id']}", "last": 10},
        key,
    )
    save_raw("03_h2h", data)
    fixtures = data.get("response", [])
    print(f"  Počet vrácených vzájemných zápasů: {len(fixtures)} (potřebujeme ~10)")
    time.sleep(SLEEP_BETWEEN_CALLS)

    # 4) Statistiky konkrétního (dohraného) zápasu, pokud nějaký H2H fixture existuje
    finished = [f for f in fixtures if f["fixture"]["status"]["short"] == "FT"]
    if finished:
        fixture_id = finished[0]["fixture"]["id"]
        print(f"\n[4/5] /fixtures/statistics?fixture={fixture_id} — vyplněnost statistik")
        data = call("/fixtures/statistics", {"fixture": fixture_id}, key)
        save_raw("04_fixture_statistics", data)
        stats_resp = data.get("response", [])
        if stats_resp:
            for team_stats in stats_resp:
                print(f"  Tým: {team_stats['team']['name']}")
                for s in team_stats.get("statistics", []):
                    print(f"    {s['type']}: {s['value']}")
        else:
            print("  ⚠️ Statistiky prázdné — pro tento zápas nejsou k dispozici.")
    else:
        print("\n[4/5] Žádný dohraný H2H zápas k testu statistik, přeskakuji.")
    time.sleep(SLEEP_BETWEEN_CALLS)

    # 5) Trenérská historie (klíčové riziko ze specifikace)
    print(f"\n[5/5] /coachs?team={team_a['id']} — kariérní historie trenéra")
    data = call("/coachs", {"team": team_a["id"]}, key)
    save_raw("05_coachs", data)
    coachs = data.get("response", [])
    print(f"  Počet trenérů v odpovědi: {len(coachs)}")
    for c in coachs:
        careers = c.get("career", [])
        print(f"  {c.get('name')}: {len(careers)} položek kariéry")
        for entry in careers[:5]:
            team_name = entry.get("team", {}).get("name")
            print(f"    - {team_name}: {entry.get('start')} → {entry.get('end')}")

    print(
        "\n=== HOTOVO ===\n"
        "Zkontroluj scripts/api_probe_out/*.json pro detailní data.\n"
        "Klíčové otázky k zodpovězení z výstupu:\n"
        "  - Je coverage.statistics=true a coverage.fixtures.statistics vyplněné pro Chance Ligu?\n"
        "  - Vrátilo H2H skutečně ~10 zápasů, nebo méně?\n"
        "  - Obsahuje /fixtures/statistics reálné hodnoty (ne prázdné pole)?\n"
        "  - Má /coachs smysluplnou kariérní historii s daty od-do?\n"
    )


if __name__ == "__main__":
    main()
