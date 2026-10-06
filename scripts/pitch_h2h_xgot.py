#!/usr/bin/env python3
"""xGOT vzájemných zápasů z PitchAPI — jen utkání v aktuálním okně Chance Ligy.

Pro každý zápas z frontend/public/data/leagues/262.json projde jeho H2H,
najde ligové utkání v PitchAPI (stejné týmy, datum ±1 den) a uloží xGOT obou týmů:
  frontend/public/data/catalog/pitch/h2h.json  {sm_fixture_id: {sm_team_id: xgot}}

Poháry v PitchAPI lize nejsou, zůstanou bez xGOT. Stahuje jen chybějící
stats do scripts/.cache/pitchapi; opakovaný běh volá API jen pro nová H2H.
Do denního cronu ne × 30 lig.
"""

from __future__ import annotations

import json
import urllib.parse
from datetime import date, timedelta

from ingest_pitchapi import (
    BASE,
    CACHE,
    LEAGUE,
    OUT,
    SEASON,
    ROOT,
    cache_fresh,
    http_get,
    load_body,
    load_key,
    load_sm,
    map_team,
    stat_num,
    write_json,
)

ROUND = ROOT / "frontend/public/data/leagues/262.json"
MATCHES = ROOT / "frontend/public/data/matches"
H2H_OUT = OUT / "h2h.json"


def season_of(day: date) -> str:
    start = day.year if day.month >= 7 else day.year - 1
    return f"{start}/{start + 1}"


def league_season(season: str, key: str) -> list[dict]:
    """Soupiska sezony. Starší sezony se stáhnou jednou, aktuální se po 6 h obnoví."""
    dest = CACHE / f"league-matches-{season.replace('/', '-')}.json"
    current = season == SEASON
    if dest.exists() and (not current or cache_fresh(dest) or not key):
        body = json.loads(dest.read_text())
    else:
        if not key:
            return []
        url = f"{BASE}/leagues/{LEAGUE}/matches?{urllib.parse.urlencode({'season': season})}"
        code, raw = http_get(url, key)
        if code != 200:
            print(f"  PitchAPI sezona {season} HTTP {code}")
            return []
        body = json.loads(raw)
        dest.write_text(json.dumps(body, ensure_ascii=False))
    return (body.get("data") or {}).get("matches") or []


def main() -> None:
    key = load_key()
    teams_sm, _, _ = load_sm()
    fixtures = json.loads(ROUND.read_text()).get("round") or []
    seasons: dict[str, list[dict]] = {}
    out: dict[str, dict[str, float]] = {}
    found = missing = 0

    for fx in fixtures:
        path = MATCHES / f"{fx['fixture_id']}.json"
        if not path.exists():
            continue
        match = json.loads(path.read_text())
        ids = {match["home"]["id"], match["away"]["id"]}
        for h in match.get("h2h") or []:
            fid = str(h["fixture_id"])
            if fid in out:
                continue
            day = date.fromisoformat(h["date"][:10])
            season = season_of(day)
            if season not in seasons:
                seasons[season] = league_season(season, key)
            hit = None
            for pm in seasons[season]:
                if pm.get("status") != "finished":
                    continue
                pdate = date.fromisoformat(pm["date"])
                if abs(pdate - day) > timedelta(days=1):
                    continue
                home_sm = map_team(pm["home_team"]["name"], teams_sm)
                away_sm = map_team(pm["away_team"]["name"], teams_sm)
                if home_sm and away_sm and {home_sm["id"], away_sm["id"]} == ids:
                    hit = (pm, home_sm["id"], away_sm["id"])
                    break
            if not hit:
                missing += 1
                continue
            pm, home_id, away_id = hit
            stats_body = load_body(pm["id"], "stats", key)
            if not stats_body:
                missing += 1
                continue
            periods = (stats_body.get("data") or stats_body).get("periods") or []
            out[fid] = {
                str(home_id): round(stat_num(periods, "expected_goals_on_target", "home"), 2),
                str(away_id): round(stat_num(periods, "expected_goals_on_target", "away"), 2),
            }
            found += 1

    write_json(H2H_OUT, {"league_id": 262, "source": "PitchAPI", "matches": out})
    print(f"H2H s xGOT: {found}, bez dat (poháry / starší sezony / nenalezeno): {missing}")


if __name__ == "__main__":
    main()
