#!/usr/bin/env python3
"""
Rychlý průzkumný test SportMonks v3 API pro Chance Ligu (Česko,
league_id 262 v SportMonks katalogu).

Cíl: ověřit před rozhodnutím o placeném plánu, jak hluboká/kvalitní jsou
data, na kterých stavíme spec v docs/07-match-detail-spec.md:
  1. Je liga 262 vůbec dostupná na tomto tokenu/plánu?
  2. Hloubka vzájemných zápasů (H2H) mezi dvěma kluby + jsou tam coaches?
  3. Vyplněnost statistik zápasu (střely, rohy, karty, držení míče).
  4. Dostupnost trenérské historie (pro filtr "podle trenéra").
  5. Dostupnost hráčských/sestavových dat (pro srovnání hráčů).

Použití:
    export SPORTMONKS_API_TOKEN="..."   (nebo nech token v .env v rootu)
    python3 scripts/sportmonks_probe.py

Výstup: shrnutí do konzole + syrové JSON odpovědi do
scripts/sportmonks_probe_out/ pro detailní ruční prohlídku. Na rozdíl od
API-Football probe skriptu je tenhle odolný vůči chybám (403/404) na
jednotlivých krocích a pokračuje dál, protože SportMonks přístup je
plán-based (liga/entita může být mimo tvůj vybraný balíček lig).
"""

import json
import os
import re
import ssl
import sys
import time
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path

try:
    import certifi

    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

BASE_URL = "https://api.sportmonks.com/v3/football"
LEAGUE_ID = 262  # Czech First League (Fortuna/Chance Liga) v SportMonks katalogu
ROOT = Path(__file__).parent.parent
OUT_DIR = Path(__file__).parent / "sportmonks_probe_out"
SLEEP_BETWEEN_CALLS = 0.8


def load_token() -> str:
    token = os.environ.get("SPORTMONKS_API_TOKEN")
    if token:
        return token
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            m = re.match(r"^SPORTMONKS_API_TOKEN=(.+)$", line.strip())
            if m:
                return m.group(1).strip()
    print(
        "CHYBA: chybí SPORTMONKS_API_TOKEN (env proměnná nebo .env v rootu projektu).",
        file=sys.stderr,
    )
    sys.exit(1)


def call(path: str, params: dict, token: str):
    """Vrátí (status_code, data_dict_nebo_None, error_text_nebo_None)."""
    query = dict(params)
    query["api_token"] = token
    url = f"{BASE_URL}{path}?{urllib.parse.urlencode(query)}"
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=20, context=SSL_CONTEXT) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body), None
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return e.code, None, body
    except Exception as e:
        return None, None, str(e)


def save_raw(name: str, data) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{name}.json"
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"  -> uloženo do {path}")


def report_step(title: str, status, data, err):
    print(f"\n{title}")
    print(f"  HTTP status: {status}")
    if err:
        print(f"  ⚠️ Chyba/tělo odpovědi: {err[:500]}")
    return status, data


def main() -> None:
    token = load_token()

    # 1) Liga dostupná na plánu? + current season id
    status, data, err = call(
        "/leagues/" + str(LEAGUE_ID), {"include": "currentSeason"}, token
    )
    report_step(f"[1/5] GET /leagues/{LEAGUE_ID}?include=currentSeason", status, data, err)
    season_id = None
    if data and "data" in data:
        save_raw("01_league", data)
        season_id = data["data"].get("currentseason", {}).get("id")
        print(f"  Liga: {data['data'].get('name')}  |  current season_id: {season_id}")
    else:
        print("  ⚠️ Liga 262 není na tomto tokenu/plánu dostupná (nebo jiná chyba) — "
              "zkontroluj scripts/sportmonks_probe_out/ / chybovou hlášku výše.")
        if err:
            save_raw("01_league_error", {"status": status, "body": err})
    time.sleep(SLEEP_BETWEEN_CALLS)

    # 2) Fixtures v širokém datovém rozsahu pro tuto ligu -> najít 2 týmy k H2H testu
    from datetime import date, timedelta

    # SportMonks limituje date range na max 100 dní za request -> jdeme po 90denních
    # oknech zpátky, dokud nenajdeme aspoň jeden zápas se 2 participanty.
    team_a = team_b = None
    all_fixtures = []
    end = date.today()
    for chunk in range(4):  # ~360 dní zpátky celkem
        chunk_end = end - timedelta(days=90 * chunk)
        chunk_start = chunk_end - timedelta(days=90)
        status, data, err = call(
            f"/fixtures/between/{chunk_start.isoformat()}/{chunk_end.isoformat()}",
            {"filters": f"fixtureLeagues:{LEAGUE_ID}", "include": "participants"},
            token,
        )
        report_step(
            f"[2/5] GET /fixtures/between/{chunk_start}/{chunk_end}"
            f"?filters=fixtureLeagues:{LEAGUE_ID}",
            status, data, err,
        )
        if data and data.get("data"):
            all_fixtures.extend(data["data"])
        else:
            if err:
                save_raw(f"02_fixtures_range_error_chunk{chunk}", {"status": status, "body": err})
        time.sleep(SLEEP_BETWEEN_CALLS)
        if team_a and team_b:
            break
        for fx in data.get("data", []) if data else []:
            participants = fx.get("participants", [])
            if len(participants) == 2:
                team_a, team_b = participants[0], participants[1]
                break

    if all_fixtures:
        save_raw("02_fixtures_range", all_fixtures)
        print(f"  Celkem nalezeno zápasů Chance Ligy v prohledaném okně: {len(all_fixtures)}")
    if team_a and team_b:
        print(f"  Zvoleno pro H2H test: {team_a.get('name')} vs {team_b.get('name')}")
    else:
        print("  ⚠️ Nepodařilo se najít 2 týmy k H2H testu — přeskočím kroky 3–5.")
    time.sleep(SLEEP_BETWEEN_CALLS)

    # 3) Head-to-head + coaches + statistics
    if team_a and team_b:
        status, data, err = call(
            f"/fixtures/head-to-head/{team_a['id']}/{team_b['id']}",
            {"include": "participants;coaches;statistics"},
            token,
        )
        report_step(
            f"[3/5] GET /fixtures/head-to-head/{team_a['id']}/{team_b['id']}"
            "?include=participants;coaches;statistics",
            status, data, err,
        )
        if data and data.get("data"):
            save_raw("03_h2h", data)
            h2h_fixtures = data["data"]
            print(f"  Počet vzájemných zápasů vrácených: {len(h2h_fixtures)} (potřebujeme ~10)")
            sample = h2h_fixtures[0] if h2h_fixtures else None
            if sample:
                stats = sample.get("statistics", [])
                coaches = sample.get("coaches", [])
                print(f"  Statistiky u prvního H2H zápasu: {len(stats)} položek "
                      f"({'VYPLNĚNO' if stats else 'PRÁZDNÉ'})")
                print(f"  Coaches u prvního H2H zápasu: {len(coaches)} "
                      f"({'VYPLNĚNO' if coaches else 'PRÁZDNÉ'})")
        else:
            if err:
                save_raw("03_h2h_error", {"status": status, "body": err})
    else:
        print("\n[3/5] Přeskočeno (chybí týmy z kroku 2).")
    time.sleep(SLEEP_BETWEEN_CALLS)

    # 4) Samostatná trenérská historie týmu (career), pokud existuje
    if team_a:
        status, data, err = call(
            f"/coaches/teams/{team_a['id']}", {}, token
        )
        report_step(
            f"[4/5] GET /coaches/teams/{team_a['id']} — kariérní historie trenérů týmu",
            status, data, err,
        )
        if data and data.get("data"):
            save_raw("04_coaches_team", data)
            print(f"  Počet trenérských záznamů: {len(data['data'])}")
        else:
            if err:
                save_raw("04_coaches_team_error", {"status": status, "body": err})
    time.sleep(SLEEP_BETWEEN_CALLS)

    # 5) Hráčská data / sestava týmu (pro srovnání hráčů, sekce 9 spec)
    if team_a and season_id:
        status, data, err = call(
            f"/squads/seasons/{season_id}/teams/{team_a['id']}", {"include": "player"}, token
        )
        report_step(
            f"[5/5] GET /squads/seasons/{season_id}/teams/{team_a['id']}?include=player",
            status, data, err,
        )
        if data and data.get("data"):
            save_raw("05_squad", data)
            print(f"  Počet hráčů v soupisce: {len(data['data'])}")
        else:
            if err:
                save_raw("05_squad_error", {"status": status, "body": err})
    else:
        print("\n[5/5] Přeskočeno (chybí team_a nebo season_id).")

    print(
        "\n=== HOTOVO ===\n"
        "Zkontroluj scripts/sportmonks_probe_out/*.json pro detailní data.\n"
        "Klíčové otázky k zodpovězení z výstupu:\n"
        "  - Vrátil krok 1 ligu 262, nebo 403/404 (liga mimo tvůj plán)?\n"
        "  - Kolik zápasů/H2H reálně existuje a jsou u nich vyplněné statistics/coaches?\n"
        "  - Vrátil krok 4 smysluplnou trenérskou historii s daty od-do?\n"
        "  - Vrátil krok 5 reálnou soupisku hráčů?\n"
    )


if __name__ == "__main__":
    main()
