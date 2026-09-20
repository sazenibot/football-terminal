#!/usr/bin/env python3
"""Ligový overlay katalogu: tabulka, FDR 1–5, percentily, éry trenérů (5 sezon)."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from build_match_data import STAT_TYPE, call, fetch_season, score_for, stat_value, to_iso_utc

SEASONS_BACK = 5
HOOK_MOCK = {
    216: (
        "Slavia pod Trpišovským žije z PPDA 8.4 — nejvyšší lis v datasetu. "
        "Vysoký blok, vstupy do boxu a tresty ze zisku. Proti přechodové Spartě "
        "je to souboj tempa, ne držení."
    ),
}

RADAR_KEYS = (
    "goals_for",
    "goals_against",
    "shots",
    "sot",
    "corners",
    "possession",
    "cards",
    "fouls_committed",
    "fouls_received",
)

EVENT_IDS = {
    "shots_off": 41,
    "shots_blocked": 58,
    "shots_inside": 49,
    "shots_outside": 50,
    "attacks": 43,
    "dangerous_attacks": 44,
    "big_chances": 580,
    "big_chances_missed": 581,
    "assists": 79,
    "key_passes": 117,
    "passes": 80,
    "pass_pct": 82,
    "dribbles": 108,
    "dribbles_ok": 109,
    "dribble_pct": 1605,
    "saves": 57,
    "tackles": 78,
    "tackles_won": 27267,
    "interceptions": 100,
    "duels_won": 106,
    "offsides": 51,
    "free_kicks": 55,
    "throwins": 60,
    "goal_kicks": 53,
    "crosses": 98,
    "accurate_crosses": 99,
    "penalties": 47,
}

STAT_META = [
    ("goals_for", "Góly/zápas", True, "attack"),
    ("shots", "Střely/zápas", True, "attack"),
    ("sot", "Na bránu/zápas", True, "attack"),
    ("shots_off", "Mimo/zápas", True, "attack"),
    ("shots_inside", "Z vápna/zápas", True, "attack"),
    ("shots_outside", "Mimo vápno/zápas", True, "attack"),
    ("shots_blocked", "Zblokované soupeřem/zápas", False, "attack"),
    ("possession", "Držení %", True, "attack"),
    ("attacks", "Útoky/zápas", True, "attack"),
    ("dangerous_attacks", "Nebezpečné útoky/zápas", True, "attack"),
    ("big_chances", "Velké šance/zápas", True, "attack"),
    ("big_chances_missed", "Zahozené velké šance/zápas", False, "attack"),
    ("assists", "Asistence/zápas", True, "attack"),
    ("key_passes", "Klíčové přihrávky/zápas", True, "attack"),
    ("passes", "Přihrávky/zápas", True, "attack"),
    ("pass_pct", "Úspěšnost přihrávek %", True, "attack"),
    ("dribbles", "Driblingy/zápas", True, "attack"),
    ("dribbles_ok", "Úspěšné driblingy/zápas", True, "attack"),
    ("dribble_pct", "Úspěšnost driblingu %", True, "attack"),
    ("failed_to_score_pct", "Zápasy bez gólu %", False, "attack"),
    ("goals_against", "Obdrženo/zápas", False, "defense"),
    ("saves", "Zákroky/zápas", True, "defense"),
    ("tackles", "Skluzy/zápas", True, "defense"),
    ("tackles_won", "Vyhrané skluzy/zápas", True, "defense"),
    ("interceptions", "Zachycené přihrávky/zápas", True, "defense"),
    ("duels_won", "Vyhrané souboje/zápas", True, "defense"),
    ("clean_sheet_pct", "Čistá konta %", True, "defense"),
    ("fouls", "Fauly/zápas", False, "discipline"),
    ("fouls_received", "Fauly proti/zápas", True, "discipline"),
    ("yellow", "Žluté/zápas", False, "discipline"),
    ("red", "Červené/zápas", False, "discipline"),
    ("cards", "Karty/zápas", False, "discipline"),
    ("corners", "Rohy/zápas", True, "setpiece"),
    ("free_kicks", "Standardky/zápas", True, "setpiece"),
    ("throwins", "Auty/zápas", True, "setpiece"),
    ("goal_kicks", "Výkopy/zápas", True, "setpiece"),
    ("crosses", "Centry/zápas", True, "setpiece"),
    ("accurate_crosses", "Přesné centry/zápas", True, "setpiece"),
    ("offsides", "Ofsajdy/zápas", False, "setpiece"),
    ("penalties", "Penalty/zápas", True, "setpiece"),
]


def call_pages(path: str, params: dict, max_pages: int = 20) -> list:
    out: list = []
    page = 1
    while page <= max_pages:
        body = call(path, {**params, "page": page})
        chunk = body.get("data") or []
        if isinstance(chunk, dict):
            chunk = [chunk]
        out.extend(chunk)
        if not (body.get("pagination") or {}).get("has_more"):
            break
        page += 1
    return out


def last_seasons(league_id: int, n: int = SEASONS_BACK) -> list[dict]:
    raw = call(f"/leagues/{league_id}", {"include": "seasons;currentSeason"}, cache_ttl=20 * 3600)
    seasons = (raw.get("data") or {}).get("seasons") or []
    seasons = [s for s in seasons if s.get("starting_at")]
    seasons.sort(key=lambda s: s.get("starting_at") or "", reverse=True)
    return seasons[:n]


def fetch_league_history(league_id: int, start: date, end: date) -> list:
    all_fx = []
    window = end
    while window > start:
        chunk_start = max(start, window - timedelta(days=95))
        chunk = call_pages(
            f"/fixtures/between/{chunk_start.isoformat()}/{window.isoformat()}",
            {
                "filters": f"fixtureLeagues:{league_id}",
                "include": "participants;statistics;scores;state;league;coaches",
            },
        )
        all_fx.extend(chunk)
        window = chunk_start - timedelta(days=1)
    finished = [fx for fx in all_fx if fx.get("state_id") == 5]
    print(f"  historie ligy {league_id}: {len(finished)} odehraných zápasů ({start} → {end})")
    return finished


def sides(fx: dict) -> tuple[dict | None, dict | None]:
    parts = fx.get("participants") or []
    home = next((p for p in parts if (p.get("meta") or {}).get("location") == "home"), None)
    away = next((p for p in parts if (p.get("meta") or {}).get("location") == "away"), None)
    return home, away


def coach_of(fx: dict, team_id: int) -> tuple[int | None, str | None]:
    for c in fx.get("coaches") or []:
        pid = (c.get("meta") or {}).get("participant_id") or c.get("participant_id")
        if pid != team_id:
            continue
        cid = c.get("coach_id") or c.get("id")
        name = c.get("name") or c.get("display_name")
        return (int(cid) if cid else None), name
    return None, None


def fact_row(fx: dict, team_id: int) -> dict | None:
    home, away = sides(fx)
    if not home or not away:
        return None
    is_home = home.get("id") == team_id
    if not is_home and away.get("id") != team_id:
        return None
    opp = away if is_home else home
    gf = score_for(fx, team_id)
    ga = score_for(fx, opp.get("id"))
    if gf is None or ga is None:
        return None
    yellow = stat_value(fx, team_id, STAT_TYPE["yellow"]) or 0
    red = stat_value(fx, team_id, STAT_TYPE["red"]) or 0
    cid, cname = coach_of(fx, team_id)
    return {
        "fixture_id": fx.get("id"),
        "starting_at": to_iso_utc(fx.get("starting_at")),
        "season_id": fx.get("season_id"),
        "is_home": is_home,
        "opponent": {"id": opp.get("id"), "name": opp.get("name"), "image": opp.get("image_path")},
        "gf": gf,
        "ga": ga,
        "result": "V" if gf > ga else "R" if gf == ga else "P",
        "shots": stat_value(fx, team_id, STAT_TYPE["shots_total"]),
        "sot": stat_value(fx, team_id, STAT_TYPE["shots_on_target"]),
        "corners": stat_value(fx, team_id, STAT_TYPE["corners"]),
        "possession": stat_value(fx, team_id, STAT_TYPE["possession"]),
        "fouls": stat_value(fx, team_id, STAT_TYPE["fouls"]),
        "opp_fouls": stat_value(fx, opp.get("id"), STAT_TYPE["fouls"]),
        "yellow": yellow,
        "red": red,
        "cards": (yellow or 0) + (red or 0),
        "coach_id": cid,
        "coach_name": cname,
        **{key: stat_value(fx, team_id, type_id) for key, type_id in EVENT_IDS.items()},
    }


def mean(values: list) -> float | None:
    clean = [v for v in values if v is not None]
    if not clean:
        return None
    return round(sum(clean) / len(clean), 2)


def summarize(rows: list[dict]) -> dict:
    if not rows:
        return {"matches": 0}
    n = len(rows)
    out = {
        "matches": n,
        "won": sum(1 for r in rows if r["result"] == "V"),
        "drawn": sum(1 for r in rows if r["result"] == "R"),
        "lost": sum(1 for r in rows if r["result"] == "P"),
        "goals_for": mean([r["gf"] for r in rows]),
        "goals_against": mean([r["ga"] for r in rows]),
        "shots": mean([r["shots"] for r in rows]),
        "sot": mean([r["sot"] for r in rows]),
        "corners": mean([r["corners"] for r in rows]),
        "possession": mean([r["possession"] for r in rows]),
        "fouls": mean([r["fouls"] for r in rows]),
        "fouls_committed": mean([r["fouls"] for r in rows]),
        "fouls_received": mean([r["opp_fouls"] for r in rows]),
        "yellow": mean([r["yellow"] for r in rows]),
        "red": mean([r["red"] for r in rows]),
        "cards": mean([r["cards"] for r in rows]),
        "clean_sheet_pct": round(100 * sum(1 for r in rows if r["ga"] == 0) / n, 1),
        "failed_to_score_pct": round(100 * sum(1 for r in rows if r["gf"] == 0) / n, 1),
    }
    for key in EVENT_IDS:
        out[key] = mean([r.get(key) for r in rows])
    return out


def radar_from_summary(summary: dict) -> dict:
    return {key: summary.get(key) if summary.get(key) is not None else 0 for key in RADAR_KEYS}


def fdr_rating(position: int | None, size: int, is_home: bool) -> int | None:
    if not position or size < 8:
        return None
    if size <= 16:
        edges = (3, 6, 9, 12, 16) if is_home else (4, 7, 10, 13, 16)
    else:
        raw = (3, 6, 9, 12, 16) if is_home else (4, 7, 10, 13, 16)
        edges = tuple(max(1, round(e * size / 16)) for e in raw)
    for cap, rating in zip(edges, (5, 4, 3, 2, 1)):
        if position <= cap:
            return rating
    return 1


def fdr_band(rating: int | None) -> str | None:
    if rating is None:
        return None
    if rating <= 2:
        return "easy"
    if rating >= 4:
        return "hard"
    return "mid"


def percentile(value, pool: list, higher_better: bool) -> int | None:
    vals = [v for v in pool if v is not None]
    if value is None or len(vals) < 2:
        return None
    if higher_better:
        beat = sum(1 for v in vals if v < value)
    else:
        beat = sum(1 for v in vals if v > value)
    return int(round(100 * beat / (len(vals) - 1))) if len(vals) > 1 else 50


def league_rank(value, pool: list, higher_better: bool) -> int | None:
    vals = [v for v in pool if v is not None]
    if value is None or not vals:
        return None
    better = sum(1 for v in vals if (v > value if higher_better else v < value))
    return better + 1


def compact_match(row: dict) -> dict:
    return {
        "s": row.get("season_id"),
        "d": (row.get("starting_at") or "")[:10],
        "h": 1 if row.get("is_home") else 0,
        "gf": row.get("gf"),
        "ga": row.get("ga"),
        "sh": row.get("shots"),
        "sot": row.get("sot"),
        "c": row.get("corners"),
        "p": row.get("possession"),
        "f": row.get("fouls"),
        "of": row.get("opp_fouls"),
        "y": row.get("yellow"),
        "r": row.get("red"),
    }


def build_eras(rows: list[dict]) -> list[dict]:
    buckets: dict[tuple, list] = defaultdict(list)
    for row in rows:
        cid, cname = row.get("coach_id"), row.get("coach_name")
        if not cid and not cname:
            continue
        buckets[(cid, cname or f"Trenér #{cid}")].append(row)
    eras = []
    for (cid, cname), group in buckets.items():
        group = sorted(group, key=lambda r: r.get("starting_at") or "")
        home = [r for r in group if r["is_home"]]
        away = [r for r in group if not r["is_home"]]
        all_s = summarize(group)
        eras.append({
            "coach_id": cid,
            "coach_name": cname,
            "from": group[0].get("starting_at"),
            "to": group[-1].get("starting_at"),
            "matches": len(group),
            "all": all_s,
            "home": summarize(home),
            "away": summarize(away),
            "radar": {
                "all": radar_from_summary(all_s),
                "home": radar_from_summary(summarize(home)),
                "away": radar_from_summary(summarize(away)),
            },
        })
    eras.sort(key=lambda e: e.get("to") or "", reverse=True)
    return eras


def attach_context(avgs: dict, league_avgs: dict, pools: dict) -> dict:
    out = {"matches": avgs.get("matches", 0), "stats": []}
    for key, label, higher, group in STAT_META:
        value = avgs.get(key)
        pool = pools.get(key, [])
        if value is None and not pool:
            continue
        card = {
            "key": key,
            "group": group,
            "label": label,
            "value": value,
            "league_avg": league_avgs.get(key),
            "percentile": percentile(value, pool, higher),
            "rank": league_rank(value, pool, higher),
            "league_size": len([v for v in pool if v is not None]),
            "higher_better": higher,
        }
        out[key] = card
        out["stats"].append(card)
    return out


def load_history(league_id: int, season_id: int | None) -> tuple[list[dict], list[dict], date]:
    seasons = last_seasons(league_id, SEASONS_BACK)
    if not seasons:
        current = fetch_season(season_id) if season_id else {}
        start = date.fromisoformat(current["starting_at"]) if current.get("starting_at") else date.today().replace(month=7, day=1)
        seasons = [{"id": season_id, "starting_at": start.isoformat(), "name": ""}]
    start = date.fromisoformat(seasons[-1]["starting_at"][:10])
    history = fetch_league_history(league_id, start, date.today())
    return seasons, history, start


def facts_by_team(history: list, team_ids: set[int]) -> dict[int, list[dict]]:
    out: dict[int, list] = {tid: [] for tid in team_ids}
    for fx in history:
        home, away = sides(fx)
        for part in (home, away):
            if not part or part.get("id") not in out:
                continue
            row = fact_row(fx, int(part["id"]))
            if row:
                out[int(part["id"])].append(row)
    for tid in out:
        out[tid].sort(key=lambda r: r.get("starting_at") or "", reverse=True)
    return out


def current_season_rows(rows: list[dict], season_id: int | None, season_start: date) -> list[dict]:
    if season_id:
        matched = [r for r in rows if r.get("season_id") == season_id]
        if matched:
            return matched
    start = season_start.isoformat()
    return [r for r in rows if (r.get("starting_at") or "") >= start]


def league_pools(current_by_team: dict[int, list]) -> tuple[dict, dict, dict]:
    pools = {key: [] for key, *_ in STAT_META}
    avgs_by_team = {}
    for tid, rows in current_by_team.items():
        summary = summarize(rows)
        avgs_by_team[tid] = summary
        for key, *_ in STAT_META:
            if summary.get(key) is not None:
                pools[key].append(summary[key])
    league_avgs = {key: mean(vals) for key, vals in pools.items()}
    return avgs_by_team, league_avgs, pools
