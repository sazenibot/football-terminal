#!/usr/bin/env python3
"""Doplní PitchAPI /stats pro starší sezonu (prior pro střely / SOT / rohy).

Použití: pitch_backfill_prev_stats.py [2025-2026]
Bez argumentu se vezme sezona těsně před aktuální. Soupisku sezony stáhne, když chybí.
Stahuje jen chybějící soubory do scripts/.cache/pitchapi, opakovaný běh nic nevolá.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from ingest_pitchapi import CACHE, SEASON, load_body, load_key  # noqa: E402
from pitch_h2h_xgot import league_season  # noqa: E402


def main() -> None:
    key = load_key()
    start = int(SEASON.split("/")[0])
    season_dash = sys.argv[1] if len(sys.argv) > 1 else f"{start - 1}-{start}"
    season = season_dash.replace("-", "/")
    matches = league_season(season, key)
    if not matches:
        raise SystemExit(f"Soupiska sezony {season} není k dispozici (cache ani klíč)")
    finished = [m for m in matches if m.get("status") == "finished"]
    todo = [m for m in finished if not (CACHE / f"matches_{m['id']}_stats.json").exists()]
    print(f"{season}: {len(finished)} dohraných, chybí stats {len(todo)}")
    if todo and not key:
        raise SystemExit("Chybí PITCHAPI_API_KEY")
    ok = fail = 0
    for i, m in enumerate(todo, 1):
        mid = m["id"]
        print(f"  {i}/{len(todo)} {mid} {m['home_team']['name']}–{m['away_team']['name']}", flush=True)
        if load_body(mid, "stats", key):
            ok += 1
        else:
            fail += 1
            print("    FAIL")
    print(f"hotovo: ok {ok}, fail {fail}")


if __name__ == "__main__":
    main()
