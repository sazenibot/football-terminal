#!/usr/bin/env python3
"""Pilotní overlay katalogu — fakta, ne model.

Default: SK Slavia Praha + soupiska + Rouček, Machálek, Volek.
Prohlížeč SportMonks nevolá.

    python3 scripts/enrich_catalog.py
    python3 scripts/enrich_catalog.py --team 216 --referees 75582,15436,75577
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(Path(__file__).parent))

from build_match_data import (  # noqa: E402
    call,
    call_stats,
    cached_league_context,
    fetch_player_season_stats,
    fetch_referee_profile,
    fetch_season,
)
from catalog_player_overlay import attach_player_overlays  # noqa: E402
from catalog_referee_overlay import attach_referee_overlays  # noqa: E402
from catalog_team_overlay import (  # noqa: E402
    HOOK_MOCK,
    attach_context,
    build_eras,
    compact_match,
    current_season_rows,
    facts_by_team,
    fdr_band,
    fdr_rating,
    league_pools,
    last_seasons,
    load_history,
    summarize,
)

LOAN_TYPE = 218
SALE_TYPES = {219, 220}
RETURN_TYPES = {218, 219, 220, 9688}

DATA_DIR = ROOT / "frontend" / "public" / "data"
CATALOG = DATA_DIR / "catalog"
MATCHES_DIR = DATA_DIR / "matches"

PILOT_TEAMS = [216]
PILOT_REFS = [75582, 15436, 75577]

PLAYER_KEYS = {
    "Appearances": "appearances",
    "Lineups": "lineups",
    "Minutes Played": "minutes",
    "Goals": "goals",
    "Assists": "assists",
    "Yellowcards": "yellow",
    "Redcards": "red",
    "Rating": "rating",
    "Shots Total": "shots",
    "Shots": "shots",
    "Shots On Target": "sot",
    "Clean Sheets": "clean_sheets",
    "Saves": "saves",
    "Goals Conceded": "goals_conceded",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def load_json(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None


def known_match_ids() -> set[int]:
    if not MATCHES_DIR.exists():
        return set()
    return {int(p.stem) for p in MATCHES_DIR.glob("*.json") if p.stem.isdigit()}


def num(val):
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return val
    if isinstance(val, dict):
        for key in ("total", "count", "average", "avg"):
            if val.get(key) is not None:
                return val[key]
        nested = val.get("all") or val.get("home") or val.get("away")
        if isinstance(nested, dict):
            return num(nested)
    return None


def standing_detail_map(row: dict) -> dict:
    out = {}
    for d in row.get("details") or []:
        tname = (d.get("type") or {}).get("name") or ""
        if tname:
            out[tname] = d.get("value")
    return out


def parse_standings(season_id: int) -> dict[int, dict]:
    body = call(
        f"/standings/seasons/{season_id}",
        {"include": "details.type;participant"},
        cache_ttl=6 * 3600,
    )
    rows = body.get("data") or []
    if isinstance(rows, dict):
        rows = rows.get("data") or []
    table = {}
    for row in rows:
        pid = row.get("participant_id") or (row.get("participant") or {}).get("id")
        if not pid:
            continue
        details = standing_detail_map(row)

        def pick(*names):
            for name in names:
                if name in details:
                    parsed = num(details[name])
                    if parsed is not None:
                        return parsed
            return None

        table[int(pid)] = {
            "position": row.get("position"),
            "points": row.get("points") if row.get("points") is not None else pick("Points"),
            "played": pick("Overall Matches Played", "Games Played", "Played"),
            "won": pick("Overall Won", "Won", "Wins"),
            "drawn": pick("Overall Draw", "Draw", "Drawn"),
            "lost": pick("Overall Lost", "Lost", "Losses"),
            "gf": pick("Overal Goals Scored", "Overall Goals Scored", "Goals For"),
            "ga": pick("Overall Goals Conceded", "Goals Against"),
            "form": row.get("form"),
        }
    return table


def result_code(gf: int, ga: int) -> str:
    if gf > ga:
        return "V"
    if gf == ga:
        return "R"
    return "P"


def recent_from_rows(rows: list[dict], known: set[int], limit: int = 10) -> list:
    out = []
    for row in rows[:limit]:
        fid = int(row.get("fixture_id") or 0)
        out.append({
            "fixture_id": fid,
            "starting_at": row.get("starting_at"),
            "is_home": row.get("is_home"),
            "opponent": row.get("opponent"),
            "gf": row.get("gf"),
            "ga": row.get("ga"),
            "result": row.get("result"),
            "has_match_page": fid in known,
        })
    return out


def team_hook(name: str, league: str, table: dict | None) -> str:
    if not table or table.get("position") is None:
        return (
            f"{name} hraje soutěž {league}. Herní styl (Hook) doplníme, až bude k dispozici model "
            "pro tento klub — není tu text jiného týmu."
        )
    extra = []
    if table.get("points") is not None and table.get("played") is not None:
        extra.append(f"{table['points']} b. z {table['played']} zápasů")
    if table.get("gf") is not None and table.get("ga") is not None:
        extra.append(f"skóre {table['gf']}:{table['ga']}")
    suffix = f" ({', '.join(extra)})" if extra else ""
    return f"{name} je {table['position']}. v tabulce {league}{suffix}."


def map_player_stats(raw: dict) -> dict:
    out = {}
    for src, dest in PLAYER_KEYS.items():
        if src in raw and dest not in out:
            val = num(raw[src])
            if val is not None:
                out[dest] = val
    return out


def cs_count(n, one: str, few: str, many: str) -> str:
    n = int(n)
    if n == 1:
        word = one
    elif 2 <= n <= 4:
        word = few
    else:
        word = many
    return f"{n} {word}"


def player_hook(name: str, position: str | None, team: str, season: dict) -> str:
    if not season:
        return (
            f"{name} ({position or 'hráč'}) nastupuje za {team}. "
            "Role badge a KPI overlay se doplní z modelu, až budou čísla pro tohoto hráče."
        )
    apps = season.get("appearances") or season.get("lineups")
    facts = []
    if apps is not None:
        facts.append(cs_count(apps, "start", "starty", "startů"))
    if season.get("minutes") is not None:
        facts.append(f"{int(season['minutes'])} min")
    if season.get("goals") is not None:
        facts.append(cs_count(season["goals"], "gól", "góly", "gólů"))
    if season.get("assists") is not None:
        facts.append(cs_count(season["assists"], "asistence", "asistence", "asistencí"))
    if not facts:
        return f"{name} ({position or 'hráč'}) nastupuje za {team}. Sezónní KPI zatím SportMonks neposlal."
    return f"{name} v této sezóně za {team}: " + ", ".join(facts) + "."


def referee_block_summary(block: dict | None) -> dict | None:
    if not block:
        return None
    out = {}
    for d in block.get("details") or []:
        tname = (d.get("type") or {}).get("name")
        val = d.get("value") or {}
        if tname:
            out[tname] = val
    return out or None


def stat_avg(stat) -> float | None:
    if not stat:
        return None
    if isinstance(stat, dict):
        if stat.get("all") and isinstance(stat["all"], dict) and stat["all"].get("average") is not None:
            return stat["all"]["average"]
        if stat.get("average") is not None:
            return stat["average"]
    return num(stat)


def stat_count(stat) -> int | None:
    if not stat:
        return None
    if isinstance(stat, dict):
        if stat.get("all") and isinstance(stat["all"], dict) and stat["all"].get("count") is not None:
            return stat["all"]["count"]
        if stat.get("count") is not None:
            return stat["count"]
    val = num(stat)
    return int(val) if val is not None else None


def referee_recent(rid: int, league_id: int, known: set[int]) -> list:
    out = []
    if not MATCHES_DIR.exists():
        return out
    for path in MATCHES_DIR.glob("*.json"):
        try:
            match = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        if int(match.get("league_id") or 0) != league_id:
            continue
        ref = match.get("referee") or {}
        if int(ref.get("id") or match.get("referee_id") or 0) != rid:
            continue
        home = match.get("home") or {}
        away = match.get("away") or {}
        out.append({
            "fixture_id": match.get("fixture_id"),
            "starting_at": match.get("starting_at"),
            "home": home.get("name"),
            "away": away.get("name"),
            "has_match_page": True,
        })
    out.sort(key=lambda r: r.get("starting_at") or "", reverse=True)
    return out[:12]


def squad_status(transfers: list, team_id: int) -> str:
    last_away = None
    for move in sorted(transfers or [], key=lambda t: t.get("date") or ""):
        if not move.get("completed"):
            continue
        typ = move.get("type_id")
        frm = move.get("from_team_id")
        to = move.get("to_team_id")
        if frm == team_id and to != team_id and typ in {LOAN_TYPE, *SALE_TYPES}:
            last_away = "loan" if typ == LOAN_TYPE else "left"
        elif to == team_id and typ in RETURN_TYPES:
            last_away = None
    return last_away or "active"


def annotate_squad(team: dict) -> None:
    tid = team.get("id")
    season_id = team.get("season_id")
    if not tid or not season_id:
        return
    rows = call(
        f"/squads/seasons/{season_id}/teams/{tid}",
        {"include": "player.transfers"},
    ).get("data") or []
    by_pid = {}
    for row in rows:
        pid = (row.get("player") or {}).get("id") or row.get("player_id")
        if pid:
            by_pid[int(pid)] = row
    for player in team.get("squad") or []:
        pid = player.get("id")
        row = by_pid.get(int(pid)) if pid else None
        if not row:
            player["status"] = player.get("status") or "active"
            continue
        player["status"] = squad_status((row.get("player") or {}).get("transfers") or [], int(tid))


def attach_coach(team: dict) -> None:
    tid = team.get("id")
    if not tid:
        return
    data = (call(f"/teams/{tid}", {"include": "coaches.coach"}).get("data") or {})
    coaches = data.get("coaches") or []
    active = next((c for c in coaches if c.get("active")), coaches[0] if coaches else None)
    if not active:
        team["coach"] = None
    else:
        person = active.get("coach") or {}
        team["coach"] = {
            "id": person.get("id") or active.get("coach_id"),
            "name": person.get("display_name") or person.get("name"),
            "image": person.get("image_path"),
            "start": active.get("start"),
            "end": active.get("end"),
            "active": bool(active.get("active")),
        }
    if not (team.get("coach") or {}).get("name"):
        era = ((team.get("overlay") or {}).get("eras") or [None])[0] or {}
        if era.get("coach_name"):
            team["coach"] = {
                "id": era.get("coach_id"),
                "name": era.get("coach_name"),
                "image": None,
                "start": (era.get("from") or "")[:10] or None,
                "end": (era.get("to") or "")[:10] or None,
                "active": True,
            }
    if team.get("overlay") is not None:
        team["overlay"]["coach"] = team.get("coach")


def apply_team_overlay(
    team: dict,
    table: dict | None,
    current_rows: list,
    history_rows: list,
    league_avgs: dict,
    pools: dict,
    table_map: dict,
    known: set[int],
    season_name: str | None,
) -> dict:
    size = len(table_map)
    recent = recent_from_rows(current_rows, known)
    avgs = summarize(current_rows)
    if table and current_rows:
        if table.get("played") is None:
            table["played"] = len(current_rows)
        if table.get("won") is None:
            table["won"] = avgs.get("won")
            table["drawn"] = avgs.get("drawn")
            table["lost"] = avgs.get("lost")
        if table.get("gf") is None:
            table["gf"] = sum(r["gf"] for r in current_rows)
            table["ga"] = sum(r["ga"] for r in current_rows)
        if not table.get("form"):
            table["form"] = "".join(r["result"] for r in current_rows[:5])

    now = now_iso()
    played_ids = {int(r["fixture_id"]) for r in current_rows if r.get("fixture_id")}
    upcoming = [
        fx
        for fx in (team.get("upcoming") or [])
        if (fx.get("starting_at") or "") > now and int(fx.get("fixture_id") or 0) not in played_ids
    ]
    team["upcoming"] = upcoming
    for fx in upcoming:
        opp_id = (fx.get("opponent") or {}).get("id")
        row = table_map.get(int(opp_id)) if opp_id else None
        pos = row.get("position") if row else None
        rating = fdr_rating(pos, size, bool(fx.get("is_home")))
        if pos:
            fx["opponent_position"] = pos
        fx["fdr_rating"] = rating
        fx["fdr"] = fdr_band(rating)

    tid = int(team["id"])
    if tid in HOOK_MOCK:
        team["hook"] = HOOK_MOCK[tid]
        hook_kind = "mock"
    else:
        team["hook"] = team_hook(team.get("name") or "", team.get("league_name") or "", table)
        hook_kind = "facts"

    eras = build_eras(history_rows)
    team["overlay"] = {
        "generated_at": now_iso(),
        "hook_kind": hook_kind,
        "season_name": season_name,
        "table": table,
        "recent": recent,
        "season_avgs": avgs,
        "profile": attach_context(avgs, league_avgs, pools),
        "eras": eras,
    }
    return team


def enrich_players(team: dict, season_id: int | None) -> int:
    if not season_id:
        return 0
    n = 0
    for player in team.get("squad") or []:
        pid = player.get("id")
        if not pid:
            continue
        raw = fetch_player_season_stats(int(pid), int(season_id))
        season_stats = map_player_stats(raw)
        if season_stats:
            player["season"] = season_stats
            n += 1
        enrich_player_file(int(pid), season_stats, team)
        print(f"    hráč {player.get('name')}: {season_stats or 'bez sezónních čísel'}")
    return n


def enrich_league_teams(league_id: int, team_ids: list[int], known: set[int], player_ids: set[int]) -> None:
    sample = None
    for tid in team_ids:
        sample = load_json(CATALOG / "teams" / f"{tid}.json")
        if sample:
            break
    if not sample:
        print(f"  ⚠️ v katalogu není žádný tým ligy {league_id}")
        return
    season_id = sample.get("season_id")
    season = fetch_season(season_id) if season_id else {}
    season_start = date.fromisoformat(season["starting_at"]) if season.get("starting_at") else date.today().replace(month=7, day=1)
    season_name = season.get("name") or sample.get("league_name")
    print(f"  liga {league_id} · sezóna {season_id} {season_name} · 5 sezon od {season_start}")

    seasons, history, _hist_start = load_history(league_id, season_id)
    by_team = facts_by_team(history, set(team_ids))
    current_by_team = {
        tid: current_season_rows(rows, season_id, season_start) for tid, rows in by_team.items()
    }
    _avgs_by_team, league_avgs, pools = league_pools(current_by_team)
    table_map = parse_standings(season_id) if season_id else {}

    explorer_teams = []
    for tid in team_ids:
        path = CATALOG / "teams" / f"{tid}.json"
        team = load_json(path)
        if not team:
            continue
        team = apply_team_overlay(
            team,
            table_map.get(tid),
            current_by_team.get(tid, []),
            by_team.get(tid, []),
            league_avgs,
            pools,
            table_map,
            known,
            season_name,
        )
        annotate_squad(team)
        attach_coach(team)
        if tid in player_ids:
            enrich_players(team, season_id)
        write_json(path, team)
        eras = team["overlay"]["eras"]
        explorer_teams.append({
            "id": tid,
            "name": team.get("name"),
            "short": team.get("short"),
            "image": team.get("image"),
            "matches": [compact_match(r) for r in by_team.get(tid, [])],
            "eras": [
                {
                    "coach_id": e["coach_id"],
                    "coach_name": e["coach_name"],
                    "matches": e["matches"],
                    "from": e["from"],
                    "to": e["to"],
                    "all": e["all"],
                    "home": e["home"],
                    "away": e["away"],
                    "radar": e["radar"],
                }
                for e in eras
            ],
        })
        print(f"  {team.get('name')}: éry={len(eras)} recent={len(team['overlay']['recent'])} tabulka={team['overlay']['table']}")

    attach_referee_overlays(
        history,
        seasons,
        season_id,
        known,
        load_json,
        write_json,
        CATALOG,
        now_iso,
        league_id,
        sample.get("league_name") or season_name or "",
    )
    attach_player_overlays(
        league_id,
        season_id,
        seasons,
        known,
        load_json,
        write_json,
        CATALOG,
        now_iso,
        sample.get("league_name") or season_name or "",
        parse_standings,
    )

    write_json(
        CATALOG / "leagues" / f"{league_id}.explorer.json",
        {
            "generated_at": now_iso(),
            "league_id": league_id,
            "season_id": season_id,
            "season_name": season_name,
            "seasons": [{"id": s.get("id"), "name": s.get("name"), "starting_at": s.get("starting_at")} for s in seasons],
            "league_avgs": league_avgs,
            "teams": explorer_teams,
        },
    )


def enrich_player_file(player_id: int, season_stats: dict, team: dict) -> None:
    path = CATALOG / "players" / f"{player_id}.json"
    player = load_json(path)
    if not player:
        return
    player["hook"] = player_hook(
        player.get("name") or "",
        player.get("position"),
        player.get("team_name") or team.get("name") or "",
        season_stats,
    )
    overlay = player.get("overlay") or {}
    overlay.update({
        "generated_at": now_iso(),
        "season": season_stats,
    })
    player["overlay"] = overlay
    write_json(path, player)


def enrich_referee(rid: int, known: set[int]) -> None:
    path = CATALOG / "referees" / f"{rid}.json"
    ref = load_json(path)
    if not ref:
        print(f"  ⚠️ rozhodčí {rid} v katalogu není")
        return
    profile = fetch_referee_profile(rid)
    if profile.get("name"):
        ref["name"] = profile.get("display_name") or profile.get("name") or ref.get("name")
        ref["common_name"] = profile.get("common_name") or ref.get("common_name")
        ref["image"] = profile.get("image_path") or ref.get("image")
        ref["date_of_birth"] = profile.get("date_of_birth") or ref.get("date_of_birth")

    team = load_json(CATALOG / "teams" / "216.json") or {}
    season_id = team.get("season_id")
    league_id = ref.get("league_id") or team.get("league_id") or 262
    blocks = profile.get("statistics") or []
    season_block = next((b for b in blocks if b.get("season_id") == season_id), None)
    season_stats = referee_block_summary(season_block)

    career_matches = career_yellow = career_red = 0
    for b in blocks:
        for d in b.get("details") or []:
            tname = (d.get("type") or {}).get("name")
            val = d.get("value") or {}
            if tname == "Season Matches":
                career_matches += val.get("count", 0) or 0
            elif tname == "Yellowcards":
                career_yellow += (val.get("all") or {}).get("count", 0) or 0
            elif tname == "Redcards":
                career_red += (val.get("all") or {}).get("count", 0) or 0

    season = fetch_season(season_id) if season_id else {}
    season_start = date.fromisoformat(season["starting_at"]) if season.get("starting_at") else date.today().replace(month=7, day=1)
    league_context = cached_league_context(season_start, league_id)

    compact = {
        "matches": stat_count((season_stats or {}).get("Season Matches")),
        "fouls_avg": stat_avg((season_stats or {}).get("Fouls")),
        "yellow_avg": stat_avg((season_stats or {}).get("Yellowcards")),
        "red_avg": stat_avg((season_stats or {}).get("Redcards")),
        "penalties_avg": stat_avg((season_stats or {}).get("Penalties")),
    }
    career = {
        "seasons": len(blocks),
        "matches": career_matches,
        "yellow": career_yellow,
        "red": career_red,
        "yellow_avg": round(career_yellow / career_matches, 2) if career_matches else None,
    }
    recent = referee_recent(rid, int(league_id), known)

    in_league = bool(compact.get("matches") or recent or ref.get("in_league"))
    name = ref.get("name") or f"Rozhodčí #{rid}"
    league_name = ref.get("league_name") or "této lize"
    if compact.get("matches"):
        ref["hook"] = (
            f"{name} píská v soutěži {league_name} jako hlavní. "
            f"V této sezóně {int(compact['matches'])} zápasů"
            + (f", {compact['yellow_avg']} žlutých na zápas" if compact.get("yellow_avg") is not None else "")
            + "."
        )
    elif in_league:
        ref["hook"] = (
            f"{name} píská v soutěži {league_name} jako hlavní rozhodčí. "
            "Karetní styl a tachometry doplníme, až budou spočtené ze zápasů, kde je on jediný hlavní."
        )

    overlay = ref.get("overlay") or {}
    overlay.update({
        "generated_at": now_iso(),
        "season": compact,
        "season_raw": season_stats,
        "career": career,
        "league_context": league_context,
        "recent": recent,
    })
    ref["overlay"] = overlay
    write_json(path, ref)
    print(f"  rozhodčí {name}: sezóna={compact}, kariéra={career['matches']} zápasů, warehouse={len(recent)}")


def parse_ids(raw: str | None, fallback: list[int]) -> list[int]:
    if not raw:
        return list(fallback)
    return [int(x) for x in raw.split(",") if x.strip().isdigit()]


def hub_team_ids(league_id: int) -> list[int]:
    hub = load_json(CATALOG / "leagues" / f"{league_id}.json") or {}
    return [int(t["id"]) for t in hub.get("teams") or [] if t.get("id")]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--team", help="id týmů čárkou; default všichni z ligy 262")
    parser.add_argument("--league", type=int, default=262)
    parser.add_argument("--referees", help="id rozhodčích čárkou")
    parser.add_argument("--skip-players", action="store_true")
    parser.add_argument("--players-only", action="store_true")
    args = parser.parse_args()
    known = known_match_ids()
    if args.players_only:
        sample = load_json(CATALOG / "teams" / "216.json") or load_json(CATALOG / "leagues" / f"{args.league}.json") or {}
        season_id = sample.get("season_id")
        seasons = last_seasons(args.league)
        league_name = sample.get("league_name") or "Chance Liga"
        print(f"[catalog-overlay] jen hráči liga={args.league} sezona={season_id}")
        attach_player_overlays(
            args.league,
            season_id,
            seasons,
            known,
            load_json,
            write_json,
            CATALOG,
            now_iso,
            league_name,
            parse_standings,
        )
        stats = call_stats()
        print(f"[catalog-overlay] hotovo · API {stats['calls']} volání, cache {stats['cache_hits']}")
        return
    teams = parse_ids(args.team, hub_team_ids(args.league) or PILOT_TEAMS)
    refs = parse_ids(args.referees, PILOT_REFS)
    player_ids = set() if args.skip_players else set(teams)
    known = known_match_ids()
    print(f"[catalog-overlay] liga={args.league} týmy={teams} hráči={sorted(player_ids)}")
    enrich_league_teams(args.league, teams, known, player_ids)
    for rid in refs:
        enrich_referee(rid, known)
    stats = call_stats()
    print(f"[catalog-overlay] hotovo · API {stats['calls']} volání, cache {stats['cache_hits']}")


if __name__ == "__main__":
    main()
