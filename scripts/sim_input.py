#!/usr/bin/env python3
"""Vstup simulace pro 5 lig: kompaktní dohrané zápasy (skóre, xG, střely, rohy) z PitchAPI za poslední 3 sezóny.

Soubor: frontend/public/data/catalog/sim-input/{liga}.json  (katalog je v R2, ne v gitu)
  {"updated_at", "season", "teams": {pitch_id: name}  (všechny týmy aktuální sezóny), "rows": [...]}

Denně přírůstkově: seznam zápasů aktuální sezóny (1 volání na ligu) + /stats jen u nově dohraných zápasů.
Chybějící starší sezóny (první běh, přelom sezóny) se dostahují celé. Starší než 2 sezóny zpět se zahazují.
PitchAPI nemá kvótu, ale držíme 4 vlákna a žádné opakování bez důvodu.

    python scripts/sim_input.py            # všechny ligy
    python scripts/sim_input.py pl bl
"""
from __future__ import annotations

import json
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import ingest_pitchapi as ip  # noqa: E402
from league_data import pitch_row, season_label  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "public" / "data" / "catalog" / "sim-input"
# SportMonks id ligy → (slug, PitchAPI id ligy, první sezóna, kterou má PitchAPI)
LEAGUES = {
    262: ("chance", "l_0F4I4F", 2024),
    8: ("pl", "l_4WFCIZ", 2021),
    82: ("bl", "l_1Isor4", 2021),
    564: ("ll", "l_0ErfuF", 2021),
    72: ("ere", "l_4H43wr", 2021),
}
KEEP_BACK = 2  # kolik předchozích sezón držet vedle aktuální
KEY = ip.load_key()


def current_start(today: date | None = None) -> int:
    t = today or date.today()
    return t.year if t.month >= 7 else t.year - 1


def api(path: str):
    import time

    for attempt in range(6):
        code, raw = ip.http_get(ip.BASE + path, KEY)
        if code == 200:
            try:
                return json.loads(raw)
            except ValueError:
                return None
        if code == 404:
            return None
        time.sleep(2 * (attempt + 1))
    return None


def season_matches(pitch_league: str, start: int) -> list[dict]:
    body = api(f"/leagues/{pitch_league}/matches?season={start}/{start + 1}")
    return ((body or {}).get("data") or {}).get("matches") or []


def fetch_stats(mid: str):
    return api(f"/matches/{mid}/stats")


def sync(slug_arg: str | None = None) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cur = current_start()
    for lid, (slug, pitch_league, first) in LEAGUES.items():
        if slug_arg and slug != slug_arg:
            continue
        path = OUT / f"{slug}.json"
        old = json.loads(path.read_text()) if path.exists() else {}
        rows = {r["id"]: r for r in old.get("rows") or []}
        wanted = [y for y in range(cur - KEEP_BACK, cur + 1) if y >= first]
        rows = {k: r for k, r in rows.items() if r["season"] in {f"{y}/{str(y + 1)[2:]}" for y in wanted}}
        teams: dict[str, str] = {}
        todo: list[dict] = []
        for y in wanted:
            have_season = {r["id"] for r in rows.values() if r["season"] == f"{y}/{str(y + 1)[2:]}"}
            # uzavřené sezóny, které už máme, se znovu nevolají
            if y < cur and have_season:
                continue
            for m in season_matches(pitch_league, y):
                if y == cur:
                    for k in ("home_team", "away_team"):
                        teams[m[k]["id"]] = m[k]["name"]
                if m.get("status") == "finished" and m.get("score_home") is not None and m["id"] not in rows:
                    todo.append(m)
        results: dict[str, dict | None] = {}
        lock = threading.Lock()

        def work(m: dict) -> None:
            body = fetch_stats(m["id"])
            with lock:
                results[m["id"]] = body

        with ThreadPoolExecutor(4) as pool:
            list(pool.map(work, todo))
        added = 0
        for m in todo:
            body = results.get(m["id"])
            if body is None:
                continue  # stats ještě nejsou, zápas se zkusí příště (do té doby se ve výpočtu nepoužije)
            rows[m["id"]] = pitch_row(m, body)
            added += 1
        if not teams and old.get("teams"):
            teams = old["teams"]
        payload = {
            "updated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "season": season_label(date.today().isoformat()),
            "teams": teams,
            "rows": sorted(rows.values(), key=lambda r: (r["date"], r["id"])),
        }
        path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
        print(f"{slug}: {len(payload['rows'])} zápasů (+{added}, čekajících bez stats {len(todo) - added}), týmů {len(teams)}", flush=True)


def load(slug: str) -> dict:
    path = OUT / f"{slug}.json"
    return json.loads(path.read_text()) if path.exists() else {"rows": [], "teams": {}, "season": None}


if __name__ == "__main__":
    for s in sys.argv[1:] or [None]:
        sync(s)
