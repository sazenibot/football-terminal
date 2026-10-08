#!/usr/bin/env python3
"""PitchAPI ingest — jen Chance Liga (262).

Stáhne dohrané zápasy sezóny, spočte góly/xG/xGOT a střely, namapuje na
SportMonks id a zapíše:
  frontend/public/data/catalog/pitch/teams/{sm_id}.json
  frontend/public/data/catalog/pitch/players/{sm_id}.json
  frontend/public/data/catalog/pitch/index.json
  frontend/public/data/lab/xgot-efficiency.json

Klíč: PITCHAPI_API_KEY v env nebo .env. Do gitu nepatří.
Denní cron sem zatím nedávej — jen Chance Liga, přírůstek, ne × 5 / × 30.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import time
import unicodedata
from datetime import date
import urllib.parse
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend/public/data/catalog/pitch"
HUB = ROOT / "frontend/public/data/catalog/leagues/262.json"
XGOT_OUT = ROOT / "frontend/public/data/lab/xgot-efficiency.json"
CACHE = ROOT / "scripts/.cache/pitchapi"
LEGACY = Path("/tmp/pitch/slavia-season")
ENV = ROOT / ".env"
BASE = "https://api.pitchapi.dev/v1"
LEAGUE = "l_0F4I4F"
_today = date.today()
_start = _today.year if _today.month >= 7 else _today.year - 1
SEASON = f"{_start}/{_start + 1}"  # PitchAPI formát sezony, mění se samo 1. července
SHORT_FIX = {
    "1. FC Slovácko": "SLK",
    "FC Slovácko": "SLK",
    "Slovácko": "SLK",
    "FC Slovan Liberec": "SLL",
    "Slovan Liberec": "SLL",
}
SM_LEAGUE = 262

SET_SIT = {
    "setpiece",
    "throwinsetpiece",
    "penalty",
    "freekick",
    "directfreekick",
    "indirectfreekick",
    "fromcorner",
    "corner",
    "fromthrowin",
    "fromfreekick",
    "fromfk",
}

TEAM_ALIAS = {
    "slavia prague": "slavia praha",
    "sparta prague": "sparta praha",
    "artis brno": "sk artis brno",
}


def load_key() -> str:
    env = os.environ.get("PITCHAPI_API_KEY", "").strip()
    if env:
        return env
    if ENV.exists():
        for line in ENV.read_text().splitlines():
            m = re.match(r"^PITCHAPI_API_KEY=(.+)$", line.strip())
            if m:
                return m.group(1).strip().strip('"').strip("'")
    return ""


def fold(name: str | None) -> str:
    raw = unicodedata.normalize("NFKD", name or "")
    raw = "".join(c for c in raw if not unicodedata.combining(c))
    raw = re.sub(r"[^a-z0-9 ]", " ", raw.lower())
    return re.sub(r"\s+", " ", raw).strip()


def tokens(name: str | None) -> list[str]:
    return [t for t in fold(name).split() if t]


def last_name(name: str | None) -> str:
    parts = tokens(name)
    return parts[-1] if parts else ""


def seed_legacy_cache() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    sources = [CACHE, LEGACY]
    for folder in sources:
        if not folder.exists():
            continue
        for src in folder.glob("m_*-*.json"):
            mid, kind = src.name[:-5].split("-", 1)
            dest = CACHE / f"matches_{mid}_{kind}.json"
            if not dest.exists():
                dest.write_text(src.read_text())


def cache_path(mid: str, kind: str) -> Path:
    return CACHE / f"matches_{mid}_{kind}.json"


def http_get(url: str, key: str) -> tuple[int, str]:
    """curl — Cloudflare u urllib často vrací 1010."""
    r = subprocess.run(
        [
            "curl",
            "-sS",
            "-o",
            "-",
            "-w",
            "\n%{http_code}",
            "-H",
            f"X-API-KEY: {key}",
            "-H",
            "Accept: application/json",
            "-H",
            "User-Agent: FootballTerminal/1.0",
            url,
        ],
        capture_output=True,
        text=True,
        timeout=90,
    )
    out = r.stdout or ""
    if "\n" not in out:
        return 0, out
    body, _, code = out.rpartition("\n")
    try:
        return int(code.strip() or "0"), body
    except ValueError:
        return 0, out


def load_body(mid: str, kind: str, key: str) -> dict | None:
    dest = cache_path(mid, kind)
    if dest.exists():
        return json.loads(dest.read_text())
    legacy = CACHE / f"{mid}-{kind}.json"
    if legacy.exists():
        dest.write_text(legacy.read_text())
        return json.loads(legacy.read_text())
    tmp = LEGACY / f"{mid}-{kind}.json"
    if tmp.exists():
        dest.write_text(tmp.read_text())
        return json.loads(tmp.read_text())
    if not key:
        return None
    url = f"{BASE}/matches/{mid}/{kind}"
    for attempt in range(5):
        code, raw = http_get(url, key)
        if code == 200:
            body = json.loads(raw)
            dest.write_text(json.dumps(body, ensure_ascii=False))
            time.sleep(0.12)
            return body
        if code in {429, 502, 503} and attempt < 4:
            time.sleep(1.5 * (attempt + 1))
            continue
        print(f"    PitchAPI /matches/{mid}/{kind} HTTP {code}")
        return None
    return None


def cache_fresh(path: Path, hours: float = 6) -> bool:
    return path.exists() and (time.time() - path.stat().st_mtime) < hours * 3600


def call_league(key: str) -> dict:
    """Soupiska zápasů aktuální sezony. Cache starší než 6 h se obnoví (1 volání), ať denní job vidí nové zápasy."""
    dest = CACHE / "league-matches.json"
    if cache_fresh(dest) or (dest.exists() and not key):
        return json.loads(dest.read_text())
    if not key:
        raise SystemExit("Chybí PITCHAPI_API_KEY i cache soupisky zápasů.")
    params = {"season": SEASON}
    url = f"{BASE}/leagues/{LEAGUE}/matches?{urllib.parse.urlencode(params)}"
    code, raw = http_get(url, key)
    if code != 200:
        if dest.exists():
            print(f"  PitchAPI league matches HTTP {code}, beru cache")
            return json.loads(dest.read_text())
        raise SystemExit(f"PitchAPI league matches HTTP {code}: {raw[:240]}")
    body = json.loads(raw)
    dest.write_text(json.dumps(body, ensure_ascii=False))
    return body


def stat_num(periods: list, key: str, side: str) -> float:
    for period in periods or []:
        if period.get("period") != "All":
            continue
        for group in period.get("groups") or []:
            for item in group.get("items") or []:
                if item.get("key") == key:
                    raw = str(item.get(side) or "0").split(" ")[0].replace(",", ".")
                    try:
                        return float(raw)
                    except ValueError:
                        return 0.0
    return 0.0


def is_set(situation: str | None) -> bool:
    folded = fold(situation).replace(" ", "")
    return folded in SET_SIT or "set" in folded


def load_sm() -> tuple[dict[str, dict], list[dict], dict[int, dict]]:
    hub = json.loads(HUB.read_text())
    teams: dict[str, dict] = {}
    unique: dict[int, dict] = {}
    for t in hub.get("teams") or []:
        unique[t["id"]] = t
        teams[fold(t["name"])] = t
        if t.get("short"):
            teams[fold(t["short"])] = t
    for alias, target in TEAM_ALIAS.items():
        if target in teams:
            teams[alias] = teams[target]
    return teams, hub.get("players") or [], unique


def map_team(name: str, teams: dict[str, dict]) -> dict | None:
    folded = fold(name)
    return teams.get(folded) or teams.get(fold(TEAM_ALIAS.get(folded, name)))


def map_player(name: str, team_id: int, players: list[dict]) -> dict | None:
    parts = tokens(name)
    last = parts[-1] if parts else ""
    first = parts[0] if parts else ""
    pool = [p for p in players if p.get("team_id") == team_id]
    cands = [p for p in pool if last_name(p.get("name")) == last]
    if not cands:
        cands = [p for p in pool if last in tokens(p.get("name")) or last_name(p.get("name")) in parts]
    if not cands:
        cands = [p for p in players if last_name(p.get("name")) == last]
    if len(cands) == 1:
        return cands[0]
    tight = [p for p in cands if (tokens(p.get("name")) or [""])[0][:1] == first[:1]]
    if len(tight) == 1:
        return tight[0]
    full = [p for p in cands if fold(p.get("name")) == fold(name)]
    if len(full) == 1:
        return full[0]
    return None


def flatten_shots(body: dict) -> list[dict]:
    out = []
    data = body.get("data") or body
    for period in data.get("periods") or []:
        for shot in period.get("shots") or []:
            out.append(shot)
    return out


def compact_shot(shot: dict) -> dict:
    player = shot.get("player") or {}
    return {
        "player_id": player.get("id"),
        "player": player.get("name") or "",
        "minute": int(shot.get("minute") or 0),
        "depth": round(105 - float(shot.get("x") or 0), 2),
        "y": round(float(shot.get("y") or 0), 2),
        "xg": round(float(shot.get("expected_goals") or 0), 3),
        "goal": shot.get("event_type") == "Goal",
        "on_target": bool(shot.get("is_on_target")),
        "kind": "set" if is_set(shot.get("situation")) else "play",
    }


def gk_of(lineups: dict, side: str) -> dict | None:
    data = lineups.get("data") or lineups
    block = data.get(side) or {}
    for p in block.get("starters") or []:
        if p.get("position_id") == 11:
            return p
    return None


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")


def match_shell(row: dict) -> dict:
    return {k: row[k] for k in row if k != "shots"}


def main() -> None:
    seed_legacy_cache()
    key = load_key()
    teams_sm, players_sm, sm_by_id = load_sm()
    league_body = call_league(key)
    matches = (league_body.get("data") or {}).get("matches") or []
    finished = [m for m in matches if m.get("status") == "finished"]
    print(f"Chance Liga {SEASON}: {len(finished)} dohraných zápasů" + ("" if key else " (bez klíče — jen cache)"))

    needed: dict[int, int] = defaultdict(int)
    for m in finished:
        home_sm = map_team(m["home_team"]["name"], teams_sm)
        away_sm = map_team(m["away_team"]["name"], teams_sm)
        if home_sm:
            needed[home_sm["id"]] += 1
        if away_sm:
            needed[away_sm["id"]] += 1

    team_rows: dict[int, list[dict]] = defaultdict(list)
    player_rows: dict[int, list[dict]] = defaultdict(list)
    player_meta: dict[int, dict] = {}
    unmatched_players: set[str] = set()
    skipped = 0

    for i, m in enumerate(finished, 1):
        mid = m["id"]
        print(f"  {i}/{len(finished)} {mid} {m['home_team']['name']}–{m['away_team']['name']}", flush=True)
        shots_body = load_body(mid, "shots", key)
        stats_body = load_body(mid, "stats", key)
        lineups_body = load_body(mid, "lineups", key)
        if not shots_body or not stats_body or not lineups_body:
            skipped += 1
            print("    skip — chybí shots/stats/lineups")
            continue

        home_sm = map_team(m["home_team"]["name"], teams_sm)
        away_sm = map_team(m["away_team"]["name"], teams_sm)
        if not home_sm or not away_sm:
            skipped += 1
            print(f"    skip map {m['home_team']['name']} / {m['away_team']['name']}")
            continue

        stats = (stats_body.get("data") or stats_body).get("periods") or []
        raw_shots = flatten_shots(shots_body)
        sides = {
            "home": {
                "sm": home_sm,
                "pitch_id": m["home_team"]["id"],
                "opp": away_sm,
                "gf": int(m.get("score_home") or 0),
                "ga": int(m.get("score_away") or 0),
            },
            "away": {
                "sm": away_sm,
                "pitch_id": m["away_team"]["id"],
                "opp": home_sm,
                "gf": int(m.get("score_away") or 0),
                "ga": int(m.get("score_home") or 0),
            },
        }

        for side, info in sides.items():
            opp_side = "away" if side == "home" else "home"
            team_shots = [compact_shot(s) for s in raw_shots if s.get("team_id") == info["pitch_id"]]
            opp_goals = sum(
                1
                for s in raw_shots
                if s.get("team_id") == sides[opp_side]["pitch_id"] and s.get("event_type") == "Goal"
            )
            row = {
                "id": mid,
                "date": m.get("date"),
                "home": side == "home",
                "opponent": info["opp"]["name"],
                "opponent_short": SHORT_FIX.get(info["opp"]["name"]) or info["opp"].get("short") or info["opp"]["name"][:3].upper(),
                "gf": info["gf"],
                "ga": info["ga"],
                "goals": sum(1 for s in team_shots if s["goal"]),
                "goals_against": opp_goals,
                "xg": round(stat_num(stats, "expected_goals", side), 2),
                "xgot": round(stat_num(stats, "expected_goals_on_target", side), 2),
                "xg_open": round(stat_num(stats, "expected_goals_open_play", side), 2),
                "xg_set": round(stat_num(stats, "expected_goals_set_play", side), 2),
                "npxg": round(stat_num(stats, "expected_goals_non_penalty", side), 2),
                "xgot_faced": round(stat_num(stats, "expected_goals_on_target", opp_side), 2),
                "sot_faced": round(stat_num(stats, "ShotsOnTarget", opp_side), 1),
                "saves": round(stat_num(stats, "keeper_saves", side), 1),
                "shots": team_shots,
            }
            team_rows[info["sm"]["id"]].append(row)

            gk = gk_of(lineups_body, side)
            if gk:
                sm_p = map_player(gk.get("name"), info["sm"]["id"], players_sm)
                if sm_p:
                    player_meta[sm_p["id"]] = {"name": sm_p["name"], "team_id": info["sm"]["id"], "keeper": True}
                    player_rows[sm_p["id"]].append({**match_shell(row), "shots": [], "saves": row["saves"]})
                else:
                    unmatched_players.add(f"GK|{info['sm']['name']}|{gk.get('name')}")

            seen: set[int] = set()
            for s in team_shots:
                sm_p = map_player(s["player"], info["sm"]["id"], players_sm)
                if not sm_p:
                    unmatched_players.add(f"{info['sm']['name']}|{s['player']}")
                    continue
                meta = player_meta.setdefault(
                    sm_p["id"],
                    {"name": sm_p["name"], "team_id": info["sm"]["id"], "keeper": False},
                )
                if sm_p["id"] not in seen:
                    player_rows[sm_p["id"]].append({**match_shell(row), "shots": []})
                    seen.add(sm_p["id"])
                player_rows[sm_p["id"]][-1]["shots"].append(s)
                if meta.get("keeper"):
                    meta["keeper"] = True

    (OUT / "teams").mkdir(parents=True, exist_ok=True)
    (OUT / "players").mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("teams/*.json"):
        old.unlink()
    for old in OUT.glob("players/*.json"):
        old.unlink()

    index_teams = {}
    xgot_teams = {}
    incomplete = []
    for sm_id, expect in sorted(needed.items()):
        rows = sorted(team_rows.get(sm_id) or [], key=lambda r: r["date"] or "")
        sm = sm_by_id[sm_id]
        if len(rows) != expect:
            incomplete.append(f"{sm['name']} {len(rows)}/{expect}")
            continue
        payload = {
            "source": "PitchAPI",
            "league_id": SM_LEAGUE,
            "league": "Chance Liga",
            "season": SEASON,
            "team": {"id": sm_id, "name": sm["name"], "short": sm.get("short"), "image": sm.get("image")},
            "matches": rows,
        }
        write_json(OUT / "teams" / f"{sm_id}.json", payload)
        last5 = rows[-5:]
        index_teams[str(sm_id)] = {
            "name": sm["name"],
            "matches": len(rows),
            "shots": sum(len(r["shots"]) for r in rows),
        }
        xgot_teams[str(sm_id)] = {
            "name": sm["name"],
            "season": {
                "goals": sum(r["gf"] for r in rows),
                "xgot": round(sum(r["xgot"] for r in rows), 2),
                "matches": len(rows),
            },
            "last5": {
                "goals": sum(r["gf"] for r in last5),
                "xgot": round(sum(r["xgot"] for r in last5), 2),
                "matches": len(last5),
            },
        }

    complete_teams = {int(tid) for tid in index_teams}
    index_players = {}
    for sm_id, rows in sorted(player_rows.items()):
        meta = player_meta[sm_id]
        if meta["team_id"] not in complete_teams:
            continue
        by_id: dict[str, dict] = {}
        for row in rows:
            cur = by_id.get(row["id"])
            if not cur:
                by_id[row["id"]] = dict(row)
                by_id[row["id"]]["shots"] = list(row.get("shots") or [])
            else:
                cur["shots"].extend(row.get("shots") or [])
                if row.get("saves") is not None:
                    cur["saves"] = row["saves"]
        merged = sorted(by_id.values(), key=lambda r: r["date"] or "")
        payload = {
            "source": "PitchAPI",
            "league_id": SM_LEAGUE,
            "season": SEASON,
            "player": {"id": sm_id, "name": meta["name"], "team_id": meta["team_id"]},
            "keeper": bool(meta.get("keeper")),
            "matches": merged,
        }
        write_json(OUT / "players" / f"{sm_id}.json", payload)
        index_players[str(sm_id)] = {
            "name": meta["name"],
            "team_id": meta["team_id"],
            "shots": sum(len(r.get("shots") or []) for r in merged),
            "keeper": bool(meta.get("keeper")),
        }

    write_json(
        OUT / "index.json",
        {"league_id": SM_LEAGUE, "season": SEASON, "source": "PitchAPI", "teams": index_teams, "players": index_players},
    )
    write_json(
        XGOT_OUT,
        {"league_id": SM_LEAGUE, "season": SEASON, "source": "PitchAPI", "teams": xgot_teams},
    )
    print(f"týmy {len(index_teams)}, hráči {len(index_players)}, přeskočeno zápasů {skipped}")
    if incomplete:
        print("neúplné týmy (soubor nezapsán):")
        for line in incomplete:
            print(" ", line)
        if not key:
            print("Doplň PITCHAPI_API_KEY do .env a spusť znovu scripts/ingest_pitchapi.py")
    if unmatched_players:
        print(f"nenamapovaní hráči ({len(unmatched_players)}):")
        for line in sorted(unmatched_players)[:40]:
            print(" ", line)


if __name__ == "__main__":
    main()
