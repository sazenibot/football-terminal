#!/usr/bin/env python3
"""xGOT vzájemných zápasů z PitchAPI — zápasy v aktuálním okně zapnutých lig.

Pro každý zápas z frontend/public/data/leagues/{id}.json projde jeho H2H,
najde ligové utkání v PitchAPI (stejné týmy, datum ±1 den) a uloží xGOT obou týmů:
  frontend/public/data/catalog/pitch/h2h.json  {sm_fixture_id: {sm_team_id: xgot}}

Poháry v PitchAPI lize nejsou, zůstanou bez xGOT. Stahuje jen chybějící
stats do scripts/.cache/pitchapi; opakovaný běh volá API jen pro nová H2H.
Jen 5 zapnutých lig, ne × 30.
"""

from __future__ import annotations

import json
import urllib.parse
from datetime import date, timedelta

from ingest_pitchapi import (
    BASE,
    CACHE,
    OUT,
    PITCH_LEAGUES,
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

MATCHES = ROOT / "frontend/public/data/matches"
ROUNDS = ROOT / "frontend/public/data/leagues"
H2H_OUT = OUT / "h2h.json"


def season_of(day: date) -> str:
    start = day.year if day.month >= 7 else day.year - 1
    return f"{start}/{start + 1}"


def league_season(season: str, key: str, pitch_id: str | None = None) -> list[dict]:
    from ingest_pitchapi import LEAGUE
    pitch_id = pitch_id or LEAGUE
    """Soupiska sezony. Starší sezony se stáhnou jednou, aktuální se po 6 h obnoví."""
    dest = CACHE / f"league-matches-{pitch_id}-{season.replace('/', '-')}.json"
    current = season == SEASON
    if dest.exists() and (not current or cache_fresh(dest) or not key):
        body = json.loads(dest.read_text())
    else:
        if not key:
            return []
        url = f"{BASE}/leagues/{pitch_id}/matches?{urllib.parse.urlencode({'season': season})}"
        code, raw = http_get(url, key)
        if code != 200:
            print(f"  PitchAPI {pitch_id} sezona {season} HTTP {code}")
            return []
        body = json.loads(raw)
        dest.write_text(json.dumps(body, ensure_ascii=False))
    return (body.get("data") or {}).get("matches") or []


def main() -> None:
    key = load_key()
    out: dict[str, dict[str, float]] = {}
    if H2H_OUT.exists():
        prev = json.loads(H2H_OUT.read_text())
        out.update(prev.get("matches") or {})
    found = missing = 0

    for lid, (_slug, pitch_id, name, _first) in PITCH_LEAGUES.items():
        teams_sm, _, _ = load_sm(lid)
        round_path = ROUNDS / f"{lid}.json"
        if not round_path.exists():
            print(f"{name}: chybí kolo ({round_path.name})")
            continue
        fixtures = json.loads(round_path.read_text()).get("round") or []
        seasons: dict[str, list[dict]] = {}
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
                    seasons[season] = league_season(season, key, pitch_id)
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
        print(f"{name}: H2H +{found} (průběžně), bez dat {missing}")

    write_json(H2H_OUT, {"leagues": sorted(PITCH_LEAGUES), "source": "PitchAPI", "matches": out})
    print(f"H2H s xGOT: {found} nových, bez dat (poháry / starší sezony / nenalezeno): {missing}")


if __name__ == "__main__":
    main()
