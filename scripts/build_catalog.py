#!/usr/bin/env python3
"""Datový katalog — identita týmů, hráčů a hlavních rozhodčích.

Prohlížeč SportMonks nevolá. Výstup:
  frontend/public/data/catalog/leagues/{league_id}.json
  frontend/public/data/catalog/teams/{id}.json
  frontend/public/data/catalog/players/{id}.json
  frontend/public/data/catalog/referees/{id}.json

Použití:
    python3 scripts/build_catalog.py
    python3 scripts/build_catalog.py --league 262
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(Path(__file__).parent))

from build_match_data import (  # noqa: E402
    call,
    call_stats,
    fetch_squad,
    main_referee,
    to_iso_utc,
)

CONFIG_PATH = ROOT / "scripts" / "config" / "leagues.json"
DATA_DIR = ROOT / "frontend" / "public" / "data"
CATALOG = DATA_DIR / "catalog"
MATCHES_DIR = DATA_DIR / "matches"

POSITION_CS = {
    24: "Brankář",
    25: "Obránce",
    26: "Záložník",
    27: "Útočník",
    28: "Neuvedeno",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str))
    tmp.replace(path)


def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text())


def call_pages(path: str, params: dict, max_pages: int = 20) -> list:
    out: list = []
    page = 1
    while page <= max_pages:
        body = call(path, {**params, "page": page})
        chunk = body.get("data") or []
        if isinstance(chunk, dict):
            chunk = [chunk]
        out.extend(chunk)
        pag = body.get("pagination") or {}
        if not pag.get("has_more"):
            break
        page += 1
    return out


def current_season(league: dict) -> dict | None:
    seasons = league.get("seasons") or []
    current = league.get("currentseason") or league.get("currentSeason")
    if isinstance(current, dict) and current.get("id"):
        return current
    live = [s for s in seasons if s.get("is_current")]
    if live:
        return live[0]
    if seasons:
        return max(seasons, key=lambda s: s.get("starting_at") or "")
    return None


def age_from_dob(dob: str | None) -> int | None:
    if not dob or len(str(dob)) < 8:
        return None
    try:
        born = date.fromisoformat(str(dob)[:10])
    except ValueError:
        return None
    today = date.today()
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def position_label(position_id: int | None) -> str:
    if not position_id:
        return "Neuvedeno"
    return POSITION_CS.get(int(position_id), "Neuvedeno")


def team_hook(name: str, league_name: str) -> str:
    return (
        f"{name} hraje soutěž {league_name}. "
        "Herní styl (Hook) doplníme, až bude k dispozici model pro tento klub — "
        "není tu text jiného týmu."
    )


def player_hook(name: str, team_name: str, position: str) -> str:
    return (
        f"{name} ({position}) nastupuje za {team_name}. "
        "Role badge a KPI overlay se doplní z modelu, až budou čísla pro tohoto hráče."
    )


def referee_hook(name: str, league_name: str, in_league: bool) -> str:
    if in_league:
        return (
            f"{name} píská v soutěži {league_name} jako hlavní rozhodčí. "
            "Karetní styl a tachometry doplníme, až budou spočtené ze zápasů, kde je on jediný hlavní."
        )
    return (
        f"{name} je rozhodčí ze země této ligy. "
        "V aktuálním okně ho jako hlavního na zápasech ligy ještě nemáme."
    )


def scan_stored_main_refs(league_id: int) -> dict[int, int]:
    counts: dict[int, int] = {}
    if not MATCHES_DIR.exists():
        return counts
    for path in MATCHES_DIR.glob("*.json"):
        try:
            match = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        if int(match.get("league_id") or 0) != league_id:
            continue
        ref = match.get("referee") or {}
        rid = ref.get("id") or match.get("referee_id")
        if rid:
            counts[int(rid)] = counts.get(int(rid), 0) + 1
    return counts


def fetch_season_main_refs(league_id: int, start: date, end: date) -> dict[int, int]:
    counts: dict[int, int] = {}
    window = end
    while window > start:
        chunk_start = max(start, window - timedelta(days=95))
        body = call(
            f"/fixtures/between/{chunk_start.isoformat()}/{window.isoformat()}",
            {"filters": f"fixtureLeagues:{league_id}", "include": "referees"},
        )
        for fx in body.get("data") or []:
            rid = main_referee(fx)
            if rid:
                counts[int(rid)] = counts.get(int(rid), 0) + 1
        window = chunk_start - timedelta(days=1)
    return counts


def upcoming_for_league(league_id: int, days: int = 30) -> list:
    start = date.today()
    end = start + timedelta(days=days)
    body = call(
        f"/fixtures/between/{start.isoformat()}/{end.isoformat()}",
        {"filters": f"fixtureLeagues:{league_id}", "include": "participants"},
        cache_ttl=6 * 3600,
    )
    return body.get("data") or []


def opponents_for_team(fixtures: list, team_id: int, known_matches: set[int]) -> list:
    out = []
    for fx in fixtures:
        parts = fx.get("participants") or []
        ids = [p.get("id") for p in parts]
        if team_id not in ids:
            continue
        home = next((p for p in parts if (p.get("meta") or {}).get("location") == "home"), None)
        away = next((p for p in parts if (p.get("meta") or {}).get("location") == "away"), None)
        if not home or not away:
            continue
        is_home = home.get("id") == team_id
        opp = away if is_home else home
        out.append({
            "fixture_id": fx.get("id"),
            "starting_at": to_iso_utc(fx.get("starting_at")),
            "is_home": is_home,
            "opponent": {
                "id": opp.get("id"),
                "name": opp.get("name"),
                "image": opp.get("image_path"),
            },
            "has_match_page": int(fx.get("id") or 0) in known_matches,
        })
    out.sort(key=lambda r: r.get("starting_at") or "")
    return out


def build_league_catalog(league_cfg: dict) -> dict:
    lid = int(league_cfg["id"])
    print(f"\n[catalog] {league_cfg['name']} ({lid})")
    generated = now_iso()
    raw = call(f"/leagues/{lid}", {"include": "country;currentSeason;seasons"}, cache_ttl=20 * 3600)
    league = raw.get("data") or {}
    if not league:
        print("  ⚠️ liga ze SportMonks nepřišla")
        return {
            "generated_at": generated,
            "league": {**league_cfg, "country_id": None, "season_id": None},
            "teams": [],
            "players": [],
            "referees": [],
        }

    season = current_season(league)
    country = league.get("country") or {}
    country_id = country.get("id") or league.get("country_id")
    country_name = country.get("name") or league_cfg.get("country")
    season_id = season.get("id") if season else None
    season_start = None
    if season and season.get("starting_at"):
        try:
            season_start = date.fromisoformat(str(season["starting_at"])[:10])
        except ValueError:
            season_start = None

    league_out = {
        "id": lid,
        "name": league_cfg.get("name") or league.get("name"),
        "short": league_cfg.get("short") or league.get("short_code"),
        "country": country_name,
        "country_id": country_id,
        "logo": league_cfg.get("logo") or league.get("image_path"),
        "season_id": season_id,
        "season_name": (season or {}).get("name"),
        "enabled": True,
    }

    teams_raw = []
    if season_id:
        teams_raw = call_pages(f"/teams/seasons/{season_id}", {"include": "venue;country"})
    teams_raw = [t for t in teams_raw if not t.get("placeholder")]
    teams_raw.sort(key=lambda t: (t.get("name") or "").lower())
    print(f"  týmy: {len(teams_raw)}  sezóna {season_id}")

    upcoming = upcoming_for_league(lid)
    known_matches = {int(p.stem) for p in MATCHES_DIR.glob("*.json") if p.stem.isdigit()}

    hub_teams = []
    hub_players = []
    seen_players: set[int] = set()

    for team in teams_raw:
        tid = int(team["id"])
        venue = team.get("venue") or {}
        t_country = (team.get("country") or {}).get("name") or country_name
        squad_rows = fetch_squad(tid, season_id) if season_id else []
        squad = []
        for row in squad_rows:
            player = row.get("player") or {}
            pid = player.get("id") or row.get("player_id")
            if not pid:
                continue
            pid = int(pid)
            pos_id = row.get("position_id") or player.get("position_id")
            pos = position_label(pos_id)
            number = row.get("jersey_number")
            entry = {
                "id": pid,
                "name": player.get("display_name") or player.get("name") or f"Hráč #{pid}",
                "common_name": player.get("common_name"),
                "image": player.get("image_path"),
                "number": number,
                "position": pos,
                "position_id": pos_id,
                "captain": bool(row.get("captain")),
                "date_of_birth": player.get("date_of_birth"),
                "age": age_from_dob(player.get("date_of_birth")),
                "team_id": tid,
                "team_name": team.get("name"),
                "team_image": team.get("image_path"),
                "league_id": lid,
                "league_name": league_out["name"],
            }
            squad.append(entry)
            if pid not in seen_players:
                seen_players.add(pid)
                hub_players.append({
                    "id": pid,
                    "name": entry["name"],
                    "image": entry["image"],
                    "team_id": tid,
                    "team_name": team.get("name"),
                    "position": pos,
                    "number": number,
                })
                write_json(CATALOG / "players" / f"{pid}.json", {
                    **entry,
                    "hook": player_hook(entry["name"], team.get("name") or "", pos),
                    "generated_at": generated,
                })
        squad.sort(key=lambda p: ((p.get("position_id") or 99), p.get("name") or ""))

        team_payload = {
            "id": tid,
            "name": team.get("name"),
            "short": team.get("short_code"),
            "image": team.get("image_path"),
            "country": t_country,
            "country_id": team.get("country_id") or country_id,
            "founded": team.get("founded"),
            "venue": {
                "name": venue.get("name"),
                "city": venue.get("city_name"),
                "capacity": venue.get("capacity"),
            } if venue else None,
            "league_id": lid,
            "league_name": league_out["name"],
            "season_id": season_id,
            "hook": team_hook(team.get("name") or "", league_out["name"]),
            "squad": squad,
            "upcoming": opponents_for_team(upcoming, tid, known_matches),
            "generated_at": generated,
        }
        write_json(CATALOG / "teams" / f"{tid}.json", team_payload)
        hub_teams.append({
            "id": tid,
            "name": team.get("name"),
            "short": team.get("short_code"),
            "image": team.get("image_path"),
            "secondary": t_country,
        })

    hub_players.sort(key=lambda p: (p.get("name") or "").lower())

    stored_refs = scan_stored_main_refs(lid)
    window_start = (season_start or (date.today() - timedelta(days=180))) - timedelta(days=0)
    # spec: −180 / +30 kolem sezóny
    ref_start = window_start - timedelta(days=180) if season_start else date.today() - timedelta(days=180)
    season_refs = fetch_season_main_refs(lid, ref_start, date.today() + timedelta(days=30))
    in_league_counts = dict(stored_refs)
    for rid, n in season_refs.items():
        in_league_counts[rid] = max(in_league_counts.get(rid, 0), n)

    refs_raw = []
    if country_id:
        refs_raw = call_pages(f"/referees/countries/{int(country_id)}", {}, max_pages=20)
    print(f"  rozhodčí země {country_name}: {len(refs_raw)}, v lize (hlavní): {len(in_league_counts)}")

    hub_refs = []
    for ref in refs_raw:
        rid = ref.get("id")
        if not rid:
            continue
        rid = int(rid)
        if ref.get("country_id") and country_id and int(ref["country_id"]) != int(country_id):
            continue
        in_league = rid in in_league_counts
        name = ref.get("display_name") or ref.get("name") or f"Rozhodčí #{rid}"
        dest = CATALOG / "referees" / f"{rid}.json"
        existing = {}
        if dest.exists():
            try:
                existing = json.loads(dest.read_text())
            except (json.JSONDecodeError, OSError):
                existing = {}
        leagues = [row for row in (existing.get("leagues") or []) if row.get("id") != lid]
        leagues.append({
            "id": lid,
            "name": league_out["name"],
            "in_league": in_league,
            "league_matches": in_league_counts.get(rid, 0),
        })
        leagues.sort(key=lambda r: (not r.get("in_league"), -(r.get("league_matches") or 0)))
        primary = leagues[0]
        any_in = any(r.get("in_league") for r in leagues)
        best_matches = max((r.get("league_matches") or 0) for r in leagues)
        payload = {
            "id": rid,
            "name": name,
            "common_name": ref.get("common_name"),
            "image": ref.get("image_path"),
            "country": country_name,
            "country_id": country_id,
            "date_of_birth": ref.get("date_of_birth"),
            "league_id": primary["id"],
            "league_name": primary["name"],
            "in_league": any_in,
            "league_matches": best_matches,
            "leagues": leagues,
            "hook": referee_hook(name, primary["name"], bool(primary.get("in_league"))),
            "generated_at": generated,
        }
        write_json(dest, payload)
        hub_refs.append({
            "id": rid,
            "name": name,
            "image": ref.get("image_path"),
            "country": country_name,
            "in_league": in_league,
            "league_matches": in_league_counts.get(rid, 0),
        })

    hub_refs.sort(key=lambda r: (not r["in_league"], -(r.get("league_matches") or 0), (r.get("name") or "").lower()))

    hub = {
        "generated_at": generated,
        "league": league_out,
        "teams": hub_teams,
        "players": hub_players,
        "referees": hub_refs,
    }
    write_json(CATALOG / "leagues" / f"{lid}.json", hub)
    print(f"  -> {len(hub_teams)} týmů, {len(hub_players)} hráčů, {len(hub_refs)} rozhodčích")
    return hub


def build_all(league_id: int | None = None) -> None:
    cfg = load_config()
    wanted = [l for l in cfg["leagues"] if l.get("enabled")]
    if league_id:
        wanted = [l for l in cfg["leagues"] if l["id"] == league_id]
        if not wanted:
            raise SystemExit(f"Liga {league_id} není v whitelistu")
    CATALOG.mkdir(parents=True, exist_ok=True)
    (CATALOG / "leagues").mkdir(exist_ok=True)
    (CATALOG / "teams").mkdir(exist_ok=True)
    (CATALOG / "players").mkdir(exist_ok=True)
    (CATALOG / "referees").mkdir(exist_ok=True)

    summaries = []
    for league in wanted:
        hub = build_league_catalog(league)
        summaries.append({
            "id": league["id"],
            "name": league["name"],
            "teams": len(hub.get("teams") or []),
            "players": len(hub.get("players") or []),
            "referees": len(hub.get("referees") or []),
        })
    write_json(CATALOG / "index.json", {
        "generated_at": now_iso(),
        "leagues": summaries,
    })
    stats = call_stats()
    print(f"\n✅ katalog: {stats['calls']} API volání, {stats['cache_hits']} z cache")


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest datového katalogu")
    parser.add_argument("--league", type=int, help="Jen jedna liga")
    args = parser.parse_args()
    build_all(args.league)


if __name__ == "__main__":
    main()
