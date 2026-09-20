#!/usr/bin/env python3
"""
Stáhne reálná data ze SportMonks pro jedno kolo Chance Ligy + jeden
vybraný zápas, spočítá odvozené metriky (forma, radar, "trendy" katalog,
Poisson simulace, statistiky hráčů, rozhodčího) a uloží kompletní JSON pro
frontend prototyp do frontend/public/data/match.json.

Použití:
    python3 scripts/build_match_data.py [fixture_id]
"""

import hashlib
import json
import math
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

import certifi
import numpy as np

ROOT = Path(__file__).parent.parent
BASE_URL = "https://api.sportmonks.com/v3/football"
CORE_URL = "https://api.sportmonks.com/v3/core"
LEAGUE_ID = 262
DEFAULT_FIXTURE_ID = 19725038  # Slavia Praha vs Viktoria Plzeň
SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())

STAT_TYPE = {
    "corners": 34,
    "shots_total": 42,
    "possession": 45,
    "fouls": 56,
    "yellow": 84,
    "red": 83,
    "shots_on_target": 86,
    "offsides": 51,
}

LINEUP_STAT_TYPES = {
    52: "goals",
    79: "assists",
    42: "shots_total",
    86: "shots_on_target",
    56: "fouls",
    84: "yellow",
    83: "red",
    119: "minutes",
    57: "saves",
    88: "goals_conceded",
    78: "tackles",
    100: "interceptions",
}

# Základní český překlad nejčastějších typů absence (zranění/tresty).
# Cokoli, co v katalogu nemáme, zůstane v angličtině (lepší než nic).
INJURY_CS = {
    "Unknown Injury": "Neurčené zranění",
    "Knee Injury": "Zranění kolena",
    "Broken Leg": "Zlomená noha",
    "Cruciate Ligament Tear": "Přetržený zkřížený vaz",
    "Cruciate Ligament Injury": "Zranění zkříženého vazu",
    "Leg Injury": "Zranění nohy",
    "Thigh Problems": "Problémy se stehnem",
    "Knee Surgery": "Operace kolena",
    "Broken Ankle": "Zlomený kotník",
    "Ankle Injury": "Zranění kotníku",
    "Groin Surgery": "Operace třísla",
    "Groin Injury": "Zranění třísla",
    "Achilles tendon rupture": "Přetržená Achillova šlacha",
    "Achilles Injury": "Zranění Achillovy šlachy",
    "Yellow Card Suspension": "Trest za žluté karty",
    "No Eligibility": "Nezpůsobilost k nasazení",
    "Calf Injury": "Zranění lýtka",
    "Bruised Ribs": "Naražená žebra",
    "Broken Nose Bone": "Zlomený nosní kůstka",
    "Hamstring Injury": "Zranění hamstringu",
    "Muscle Injury": "Svalové zranění",
    "Illness": "Nemoc",
    "Suspended": "Vyloučen/trest",
    "Personal Reasons": "Osobní důvody",
    "Shoulder Injury": "Zranění ramene",
    "Back Injury": "Zranění zad",
    "Foot Injury": "Zranění nohy (chodidlo)",
    "Concussion": "Otřes mozku",
    "Ligament Damage": "Poškození vazu",
    "Red Card Suspension": "Trest za červenou kartu",
    "Fitness": "Kondiční důvody",
    "Coach Decision": "Rozhodnutí trenéra",
}
CATEGORY_CS = {
    "injury": "Zranění",
    "suspended": "Trest/disciplinární",
    "personal": "Osobní důvody",
    "coach-decision": "Rozhodnutí trenéra",
}


CACHE_DIR = ROOT / "scripts" / ".cache" / "api"
DEFAULT_CACHE_TTL = 20 * 3600  # denní job: historická data se znovu netahejí


def load_token() -> str:
    env = os.environ.get("SPORTMONKS_API_TOKEN", "").strip()
    if env:
        return env
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            m = re.match(r"^SPORTMONKS_API_TOKEN=(.+)$", line.strip())
            if m:
                return m.group(1).strip()
    raise SystemExit("Chybí SPORTMONKS_API_TOKEN (env nebo .env)")


TOKEN: str | None = None
_last_call = 0.0
_call_count = 0
_cache_hits = 0


def get_token() -> str:
    global TOKEN
    if not TOKEN:
        TOKEN = load_token()
    return TOKEN


def _cache_key(base: str, path: str, params: dict) -> Path:
    blob = json.dumps({"base": base, "path": path, "params": params}, sort_keys=True, ensure_ascii=False)
    return CACHE_DIR / f"{hashlib.sha1(blob.encode()).hexdigest()}.json"


def _do_call(base: str, path: str, params: dict, cache_ttl: int | None = DEFAULT_CACHE_TTL) -> dict:
    global _last_call, _call_count, _cache_hits
    if cache_ttl and cache_ttl > 0:
        cpath = _cache_key(base, path, params)
        if cpath.exists():
            try:
                cached = json.loads(cpath.read_text())
                age = time.time() - cached.get("cached_at", 0)
                if age < cache_ttl and cached.get("body") is not None:
                    _cache_hits += 1
                    return cached["body"]
            except (json.JSONDecodeError, OSError):
                pass
    wait = 0.3 - (time.time() - _last_call)
    if wait > 0:
        time.sleep(wait)
    query = dict(params)
    query["api_token"] = get_token()
    url = f"{base}{path}?{urllib.parse.urlencode(query)}"
    req = urllib.request.Request(url)
    retries = 0
    while True:
        _call_count += 1
        try:
            with urllib.request.urlopen(req, timeout=25, context=SSL_CONTEXT) as resp:
                _last_call = time.time()
                body = json.loads(resp.read().decode("utf-8"))
            break
        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8", errors="replace")
            if e.code == 429 and retries < 6:
                retry_after = e.headers.get("Retry-After")
                try:
                    wait_s = max(15, int(retry_after))
                except (TypeError, ValueError):
                    wait_s = min(90, 20 * (retries + 1))
                print(f"  ⏳ rate limit na {path}, čekám {wait_s}s…", file=sys.stderr)
                time.sleep(wait_s)
                retries += 1
                continue
            print(f"  ⚠️ HTTP {e.code} on {path}: {err[:150]}", file=sys.stderr)
            return {"data": None}
    if cache_ttl and cache_ttl > 0:
        try:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            _cache_key(base, path, params).write_text(
                json.dumps({"cached_at": time.time(), "body": body}, ensure_ascii=False, default=str)
            )
        except OSError:
            pass
    return body


def call(path: str, params: dict, cache_ttl: int | None = DEFAULT_CACHE_TTL) -> dict:
    return _do_call(BASE_URL, path, params, cache_ttl=cache_ttl)


def call_core(path: str, params: dict, cache_ttl: int | None = DEFAULT_CACHE_TTL) -> dict:
    return _do_call(CORE_URL, path, params, cache_ttl=cache_ttl)


def to_iso_utc(raw: str | None) -> str | None:
    """SportMonks vrací 'YYYY-MM-DD HH:MM:SS' v UTC bez značky časového
    pásma -> prohlížeč to bez opravy chybně interpretoval jako lokální čas.
    Uděláme z toho validní ISO8601 UTC řetězec."""
    if not raw:
        return raw
    if "T" in raw or raw.endswith("Z"):
        return raw
    return raw.replace(" ", "T") + "Z"


# ---------------------------------------------------------------------------
# Fetch helpers
# ---------------------------------------------------------------------------

def fetch_round_fixtures(league_id: int | None = None, days_ahead: int = 10) -> list:
    start = date.today()
    end = start + timedelta(days=days_ahead)
    lid = league_id or LEAGUE_ID
    data = call(
        f"/fixtures/between/{start.isoformat()}/{end.isoformat()}",
        {"filters": f"fixtureLeagues:{lid}", "include": "participants;venue;round"},
        cache_ttl=6 * 3600,
    )
    return data.get("data") or []


def fetch_fixture_detail(fixture_id: int, cache_ttl: int | None = DEFAULT_CACHE_TTL) -> dict:
    includes = "participants;venue;referees;sidelined;predictedLineups;round.season;league;scores;state"
    data = call(f"/fixtures/{fixture_id}", {"include": includes}, cache_ttl=cache_ttl)
    return data.get("data") or {}


def call_stats() -> dict:
    return {"calls": _call_count, "cache_hits": _cache_hits}


def predicted_lineups_from_fixture(fixture: dict, home_id: int, away_id: int) -> dict:
    out: dict[str, list] = {"home": [], "away": []}
    for pl in fixture.get("predictedlineups", []) or []:
        side = "home" if pl.get("team_id") == home_id else "away"
        out[side].append({
            "player_name": pl.get("player_name"),
            "jersey_number": pl.get("jersey_number"),
            "formation_field": pl.get("formation_field"),
        })
    return out


def fetch_season(season_id: int) -> dict:
    data = call(f"/seasons/{season_id}", {})
    return data.get("data") or {}


def fetch_league(league_id: int) -> dict:
    data = call(f"/leagues/{league_id}", {}, cache_ttl=7 * 24 * 3600)
    return data.get("data") or {}


def fetch_h2h(team_a: int, team_b: int) -> list:
    data = call(
        f"/fixtures/head-to-head/{team_a}/{team_b}",
        {"include": "participants;statistics;coaches;scores;state;referees"},
    )
    fixtures = data.get("data") or []
    fixtures = [f for f in fixtures if f.get("state_id") == 5]
    fixtures.sort(key=lambda f: f.get("starting_at", ""), reverse=True)
    return fixtures


def fetch_team_matches(team_id: int, min_date: date, hard_days_back: int = 400) -> list:
    """Všechny odehrané zápasy týmu (všechny soutěže) od `min_date` (typicky
    začátek aktuální sezóny), sesbírané po 95denních oknech (limit API)."""
    end = date.today()
    start = max(min_date, end - timedelta(days=hard_days_back))
    all_fx = []
    window = end
    while window > start:
        chunk_start = max(start, window - timedelta(days=95))
        data = call(
            f"/fixtures/between/{chunk_start.isoformat()}/{window.isoformat()}/{team_id}",
            {"include": "participants;statistics;scores;state;league;referees"},
        )
        all_fx.extend(data.get("data") or [])
        window = chunk_start - timedelta(days=1)
    finished = [f for f in all_fx if f.get("state_id") == 5 and f.get("starting_at", "") >= min_date.isoformat()]
    finished.sort(key=lambda f: f.get("starting_at", ""), reverse=True)
    return finished


def fetch_league_matches(league_id: int, start: date, end: date) -> list:
    """Všechny odehrané zápasy CELÉ ligy (ne jednoho týmu) v daném období —
    používá se pro ligové průměry (fauly/karty na zápas) jako kontext k
    profilu rozhodčího."""
    all_fx = []
    window = end
    while window > start:
        chunk_start = max(start, window - timedelta(days=95))
        data = call(
            f"/fixtures/between/{chunk_start.isoformat()}/{window.isoformat()}",
            {"filters": f"fixtureLeagues:{league_id}", "include": "statistics"},
        )
        all_fx.extend(data.get("data") or [])
        window = chunk_start - timedelta(days=1)
    return [f for f in all_fx if f.get("state_id") == 5]


def league_average_stats(fixtures: list) -> dict | None:
    n = 0
    total_fouls = total_yellow = total_red = 0.0
    for fx in fixtures:
        ids = sorted({s.get("participant_id") for s in fx.get("statistics", []) or [] if s.get("participant_id")})
        if len(ids) < 2:
            continue
        fouls = sum((stat_value(fx, pid, STAT_TYPE["fouls"]) or 0) for pid in ids)
        yellow = sum((stat_value(fx, pid, STAT_TYPE["yellow"]) or 0) for pid in ids)
        red = sum((stat_value(fx, pid, STAT_TYPE["red"]) or 0) for pid in ids)
        if fouls == 0 and yellow == 0:
            continue  # zápas bez naplněných statistik -> nezkresluje průměr
        total_fouls += fouls
        total_yellow += yellow
        total_red += red
        n += 1
    if n == 0:
        return None
    return {
        "fouls_per_match": round(total_fouls / n, 1),
        "yellow_per_match": round(total_yellow / n, 2),
        "red_per_match": round(total_red / n, 2),
        "matches_sampled": n,
    }


def fetch_squad(team_id: int, season_id: int) -> list:
    data = call(f"/squads/seasons/{season_id}/teams/{team_id}", {"include": "player"})
    return data.get("data") or []


def fetch_referee_profile(referee_id: int) -> dict:
    data = call(f"/referees/{referee_id}", {"include": "statistics.details.type"})
    return data.get("data") or {}


_TYPE_NAME_CACHE: dict = {}


def type_name(type_id: int) -> str:
    if type_id not in _TYPE_NAME_CACHE:
        data = call_core(f"/types/{type_id}", {})
        _TYPE_NAME_CACHE[type_id] = (data.get("data") or {}).get("name", f"Typ #{type_id}")
    return _TYPE_NAME_CACHE[type_id]


_PLAYER_NAME_CACHE: dict = {}


def fetch_player_name(player_id: int) -> str:
    if player_id not in _PLAYER_NAME_CACHE:
        data = call(f"/players/{player_id}", {})
        _PLAYER_NAME_CACHE[player_id] = (data.get("data") or {}).get("name", f"Hráč #{player_id}")
    return _PLAYER_NAME_CACHE[player_id]


def fetch_player_season_stats(player_id: int, season_id: int) -> dict:
    data = call(f"/players/{player_id}", {"include": "statistics.details.type"})
    blocks = (data.get("data") or {}).get("statistics", []) or []
    block = next((b for b in blocks if b.get("season_id") == season_id), None)
    out = {}
    if not block:
        return out
    for d in block.get("details", []):
        tname = (d.get("type") or {}).get("name")
        val = d.get("value") or {}
        if isinstance(val, dict):
            num = val.get("total", val.get("count"))
        else:
            num = val
        if tname and num is not None:
            out[tname] = num
    return out


_LINEUP_CACHE: dict = {}


def fetch_lineup_stats(fixture_id: int) -> dict:
    """Vrátí {player_id: {type_name: value}} pro daný zápas."""
    if fixture_id in _LINEUP_CACHE:
        return _LINEUP_CACHE[fixture_id]
    data = call(f"/fixtures/{fixture_id}", {"include": "lineups.details.type"})
    lineups = (data.get("data") or {}).get("lineups", []) or []
    out = {}
    for lu in lineups:
        pid = lu.get("player_id")
        stats = {}
        for d in lu.get("details", []) or []:
            tname = (d.get("type") or {}).get("name")
            val = (d.get("data") or {}).get("value")
            if tname and val is not None:
                stats[tname] = val
        out[pid] = {"stats": stats, "player_name": lu.get("player_name"), "jersey_number": lu.get("jersey_number")}
    _LINEUP_CACHE[fixture_id] = out
    return out


AVERAGE_STAT_NAMES = {"Rating"}


def _is_percentage_stat(name: str) -> bool:
    return "Percentage" in name


def aggregate_lineup_stats(fixture_ids: list) -> dict:
    """Sečte/zprůměruje statistiky hráčů přes seznam zápasů ->
    {player_id: {name, appearances, sums: {type_name: hodnota}}}.
    Sčítá počty (góly, střely, minuty…), ale u Rating/% stat počítá průměr
    přes zápasy, kde hráč danou statistiku měl (jinak by "Rating" a "%" pole
    dávala smysluprázdné součty přes víc zápasů)."""
    agg: dict = {}
    counts: dict = defaultdict(lambda: defaultdict(int))
    for fid in fixture_ids:
        per_player = fetch_lineup_stats(fid)
        for pid, info in per_player.items():
            entry = agg.setdefault(pid, {"player_name": info["player_name"], "appearances": 0, "sums": defaultdict(float)})
            entry["appearances"] += 1
            for k, v in info["stats"].items():
                if isinstance(v, (int, float)):
                    entry["sums"][k] += v
                    counts[pid][k] += 1
    for pid, entry in agg.items():
        for k in list(entry["sums"].keys()):
            if k in AVERAGE_STAT_NAMES or _is_percentage_stat(k):
                n = counts[pid][k] or 1
                entry["sums"][k] = round(entry["sums"][k] / n, 1)
    return agg


# ---------------------------------------------------------------------------
# Derived-data computation
# ---------------------------------------------------------------------------

def stat_value(fixture: dict, participant_id: int, type_id: int):
    for s in fixture.get("statistics", []) or []:
        if s.get("participant_id") == participant_id and s.get("type_id") == type_id:
            return s.get("data", {}).get("value")
    return None


def score_for(fixture: dict, participant_id: int, description: str = "CURRENT"):
    for sc in fixture.get("scores", []) or []:
        if sc.get("participant_id") == participant_id and sc.get("description") == description:
            return sc.get("score", {}).get("goals")
    return None


def main_referee(fixture: dict):
    for r in fixture.get("referees", []) or []:
        if r.get("type_id") == 6:
            return r.get("referee_id")
    return None


def match_facts(fixture: dict, focal_team_id: int, opp_team_id: int, competition_id: int | None = None) -> dict:
    """Vrátí slovník faktů o zápase z pohledu `focal_team_id`."""
    gf = score_for(fixture, focal_team_id) or 0
    ga = score_for(fixture, opp_team_id) or 0
    ht_gf = score_for(fixture, focal_team_id, "1ST_HALF")
    ht_ga = score_for(fixture, opp_team_id, "1ST_HALF")
    is_home = False
    opp_name = None
    for p in fixture.get("participants", []) or []:
        if p["id"] == focal_team_id:
            is_home = p["meta"]["location"] == "home"
        if p["id"] == opp_team_id:
            opp_name = p.get("name")
    league = fixture.get("league") or {}
    return {
        "date": to_iso_utc(fixture.get("starting_at")),
        "fixture_id": fixture.get("id"),
        "is_home": is_home,
        "opponent": opp_name,
        "league_id": league.get("id"),
        "league_name": league.get("name"),
        "is_league_match": league.get("id") == (competition_id or LEAGUE_ID),
        "gf": gf,
        "ga": ga,
        "ht_gf": ht_gf,
        "ht_ga": ht_ga,
        "shots": stat_value(fixture, focal_team_id, STAT_TYPE["shots_total"]) or 0,
        "sot": stat_value(fixture, focal_team_id, STAT_TYPE["shots_on_target"]) or 0,
        "corners": stat_value(fixture, focal_team_id, STAT_TYPE["corners"]) or 0,
        "opp_corners": stat_value(fixture, opp_team_id, STAT_TYPE["corners"]) or 0,
        "possession": stat_value(fixture, focal_team_id, STAT_TYPE["possession"]),
        "fouls": stat_value(fixture, focal_team_id, STAT_TYPE["fouls"]) or 0,
        "opp_fouls": stat_value(fixture, opp_team_id, STAT_TYPE["fouls"]) or 0,
        "offsides": stat_value(fixture, focal_team_id, STAT_TYPE["offsides"]) or 0,
        "opp_offsides": stat_value(fixture, opp_team_id, STAT_TYPE["offsides"]) or 0,
        "yellow": stat_value(fixture, focal_team_id, STAT_TYPE["yellow"]) or 0,
        "opp_yellow": stat_value(fixture, opp_team_id, STAT_TYPE["yellow"]) or 0,
        "red": stat_value(fixture, focal_team_id, STAT_TYPE["red"]) or 0,
        "opp_red": stat_value(fixture, opp_team_id, STAT_TYPE["red"]) or 0,
        "referee_id": main_referee(fixture),
    }


# --- pevný katalog (kategorická tvrzení) ------------------------------------
FIXED_TREND_CATALOG = [
    ("btts", "Oba týmy skórovaly (BTTS)", lambda f: f["gf"] > 0 and f["ga"] > 0),
    ("clean_sheet", "Čisté konto (0 obdržených gólů)", lambda f: f["ga"] == 0),
    ("scoreless", "Tým nevstřelil gól", lambda f: f["gf"] == 0),
    ("over15", "Over 1.5 gólů v zápase", lambda f: f["gf"] + f["ga"] > 1.5),
    ("over25", "Over 2.5 gólů v zápase", lambda f: f["gf"] + f["ga"] > 2.5),
    ("under25", "Under 2.5 gólů v zápase", lambda f: f["gf"] + f["ga"] < 2.5),
    ("scored2plus", "Tým vstřelil 2+ gólů", lambda f: f["gf"] >= 2),
    ("corners_over95", "Over 9.5 rohů v zápase (celkem)", lambda f: f["corners"] + f["opp_corners"] > 9.5),
    ("corners_under95", "Under 9.5 rohů v zápase (celkem)", lambda f: f["corners"] + f["opp_corners"] < 9.5),
    ("more_corners", "Tým měl víc rohů než soupeř", lambda f: f["corners"] > f["opp_corners"]),
    ("yellow_under5", "Méně než 5 žlutých karet v zápase (celkem)", lambda f: f["yellow"] + f["opp_yellow"] < 5),
    ("yellow_5plus", "5+ žlutých karet v zápase (celkem)", lambda f: f["yellow"] + f["opp_yellow"] >= 5),
    ("red_card", "Padla červená karta (kterýkoli tým)", lambda f: (f["red"] + f["opp_red"]) > 0),
    ("team_2plus_yellow", "Tým dostal 2+ žluté karty", lambda f: f["yellow"] >= 2),
    ("ht_leading", "Tým vedl po 1. poločase", lambda f: f["ht_gf"] is not None and f["ht_ga"] is not None and f["ht_gf"] > f["ht_ga"]),
    ("ht_draw", "Remíza v poločase", lambda f: f["ht_gf"] is not None and f["ht_ga"] is not None and f["ht_gf"] == f["ht_ga"]),
    ("ht_behind", "Tým prohrával po 1. poločase", lambda f: f["ht_gf"] is not None and f["ht_ga"] is not None and f["ht_gf"] < f["ht_ga"]),
]

# --- dynamický katalog (číselné metriky, threshold se dopočítá z dat) ------
DYNAMIC_METRICS = [
    ("shots", "Střely", lambda f: f["shots"]),
    ("sot", "Střely na branku", lambda f: f["sot"]),
    ("fouls", "Fauly", lambda f: f["fouls"]),
    ("offsides", "Ofsajdy", lambda f: f["offsides"]),
]


def _best_over(values: list):
    n = len(values)
    if n == 0:
        return None
    best = None
    for t in sorted(set(v - 0.5 for v in values)):
        hits = sum(1 for v in values if v > t)
        if hits / n >= 0.8:
            best = (t, hits, n)
    return best


def _best_under(values: list):
    n = len(values)
    if n == 0:
        return None
    best = None
    for t in sorted(set(v + 0.5 for v in values), reverse=True):
        hits = sum(1 for v in values if v < t)
        if hits / n >= 0.8:
            best = (t, hits, n)
    return best


def compute_trends(facts_list: list) -> list:
    n = len(facts_list)
    if n == 0:
        return []
    out = []
    for key, label, fn in FIXED_TREND_CATALOG:
        applicable = [f for f in facts_list if not key.startswith("ht_") or (f["ht_gf"] is not None)]
        if not applicable:
            continue
        hits = sum(1 for f in applicable if fn(f))
        out.append({
            "key": key,
            "label": label,
            "hits": hits,
            "total": len(applicable),
            "pct": round(100 * hits / len(applicable), 1),
        })
    for key, label, extractor in DYNAMIC_METRICS:
        values = [extractor(f) for f in facts_list]
        over = _best_over(values)
        under = _best_under(values)
        if over:
            t, hits, total = over
            out.append({
                "key": f"{key}_over",
                "label": f"{label}: {t}+ v zápase",
                "hits": hits, "total": total, "pct": round(100 * hits / total, 1),
            })
        if under:
            t, hits, total = under
            out.append({
                "key": f"{key}_under",
                "label": f"{label}: méně než {t} v zápase",
                "hits": hits, "total": total, "pct": round(100 * hits / total, 1),
            })
    out.sort(key=lambda x: x["pct"], reverse=True)
    return out


def compute_form(facts_list: list) -> dict:
    pts = sum(3 if f["gf"] > f["ga"] else 1 if f["gf"] == f["ga"] else 0 for f in facts_list)
    gf = sum(f["gf"] for f in facts_list)
    ga = sum(f["ga"] for f in facts_list)
    results = ["V" if f["gf"] > f["ga"] else "R" if f["gf"] == f["ga"] else "P" for f in facts_list]
    return {
        "matches": facts_list,
        "results_sequence": results,
        "points": pts,
        "goals_for": gf,
        "goals_against": ga,
        "played": len(facts_list),
    }


RADAR_CATEGORIES = [
    ("goals_for", "Vstřelené góly"),
    ("goals_against", "Obdržené góly"),
    ("shots", "Střely celkem"),
    ("sot", "Střely na branku"),
    ("corners", "Rohy"),
    ("possession", "Držení míče (%)"),
    ("cards", "Karty"),
    ("fouls_committed", "Fauly způsobené"),
    ("fouls_received", "Fauly získané"),
]


def radar_averages(facts_list: list) -> dict:
    n = len(facts_list) or 1
    poss = [f["possession"] for f in facts_list if f["possession"] is not None]
    return {
        "goals_for": round(sum(f["gf"] for f in facts_list) / n, 2),
        "goals_against": round(sum(f["ga"] for f in facts_list) / n, 2),
        "shots": round(sum(f["shots"] for f in facts_list) / n, 1),
        "sot": round(sum(f["sot"] for f in facts_list) / n, 1),
        "corners": round(sum(f["corners"] for f in facts_list) / n, 1),
        "possession": round(sum(poss) / len(poss), 1) if poss else 50.0,
        "cards": round(sum(f["yellow"] + f["red"] for f in facts_list) / n, 2),
        "fouls_committed": round(sum(f["fouls"] for f in facts_list) / n, 1),
        "fouls_received": round(sum(f["opp_fouls"] for f in facts_list) / n, 1),
    }


def _mean_gf(facts: list) -> float:
    if not facts:
        return 0.0
    return sum(f.get("gf") or 0 for f in facts) / len(facts)


def _mean_ga(facts: list) -> float:
    if not facts:
        return 0.0
    return sum(f.get("ga") or 0 for f in facts) / len(facts)


def _shrink(obs: float, prior: float, n: int, k: int = 12) -> float:
    if n <= 0:
        return prior
    return (n * obs + k * prior) / (n + k)


def simulate_from_facts(home_facts: list, away_facts: list, h2h_home: list | None = None, h2h_away: list | None = None) -> dict:
    """1X2 z Poissonu, ale s silným priorom — 3–6 zápasů nesmí udělat 70% favorita."""
    prior_home, prior_away = 1.40, 1.15
    home_lg = [f for f in home_facts if f.get("is_league_match")] or home_facts
    away_lg = [f for f in away_facts if f.get("is_league_match")] or away_facts
    att_h = _shrink(_mean_gf(home_lg), prior_home, len(home_lg))
    def_h = _shrink(_mean_ga(home_lg), prior_away, len(home_lg))
    att_a = _shrink(_mean_gf(away_lg), prior_away, len(away_lg))
    def_a = _shrink(_mean_ga(away_lg), prior_home, len(away_lg))
    last5_h = home_lg[:5]
    last5_a = away_lg[:5]
    h2h_h = (h2h_home or [])[:3]
    h2h_a = (h2h_away or [])[:3]
    att_h = 0.78 * att_h + 0.14 * (_mean_gf(last5_h) or att_h) + 0.08 * (_mean_gf(h2h_h) or att_h)
    def_h = 0.78 * def_h + 0.14 * (_mean_ga(last5_h) or def_h) + 0.08 * (_mean_ga(h2h_h) or def_h)
    att_a = 0.78 * att_a + 0.14 * (_mean_gf(last5_a) or att_a) + 0.08 * (_mean_gf(h2h_a) or att_a)
    def_a = 0.78 * def_a + 0.14 * (_mean_ga(last5_a) or def_a) + 0.08 * (_mean_ga(h2h_a) or def_a)
    lambda_home = max(0.75, min(2.10, att_h * (def_a / prior_home) * 1.08))
    lambda_away = max(0.65, min(1.95, att_a * (def_h / prior_away) * 0.92))
    raw = run_poisson_simulation(lambda_home, lambda_away, n=10000)
    prior_1x2 = (42.0, 28.0, 30.0)
    w = 0.55
    home_p = w * raw["home_win_pct"] + (1 - w) * prior_1x2[0]
    draw_p = w * raw["draw_pct"] + (1 - w) * prior_1x2[1]
    away_p = w * raw["away_win_pct"] + (1 - w) * prior_1x2[2]
    total = home_p + draw_p + away_p
    raw["home_win_pct"] = round(100 * home_p / total, 1)
    raw["draw_pct"] = round(100 * draw_p / total, 1)
    raw["away_win_pct"] = round(100 * away_p / total, 1)
    return raw


def run_poisson_simulation(lambda_home: float, lambda_away: float, n: int = 10000) -> dict:
    rng = np.random.default_rng(42)
    home_goals = rng.poisson(lambda_home, n)
    away_goals = rng.poisson(lambda_away, n)
    home_win = float(np.mean(home_goals > away_goals) * 100)
    draw = float(np.mean(home_goals == away_goals) * 100)
    away_win = float(np.mean(home_goals < away_goals) * 100)
    btts = float(np.mean((home_goals > 0) & (away_goals > 0)) * 100)
    total = home_goals + away_goals
    over25 = float(np.mean(total > 2.5) * 100)
    under25 = float(np.mean(total < 2.5) * 100)
    scorelines = defaultdict(int)
    for h, a in zip(home_goals, away_goals):
        h, a = min(h, 5), min(a, 5)
        scorelines[f"{h}-{a}"] += 1
    top = sorted(scorelines.items(), key=lambda kv: kv[1], reverse=True)[:6]
    return {
        "n": n,
        "expected_goals": {"home": round(lambda_home, 2), "away": round(lambda_away, 2)},
        "home_win_pct": round(home_win, 1),
        "draw_pct": round(draw, 1),
        "away_win_pct": round(away_win, 1),
        "btts_pct": round(btts, 1),
        "over25_pct": round(over25, 1),
        "under25_pct": round(under25, 1),
        "top_scorelines": [{"score": s, "pct": round(100 * c / n, 1)} for s, c in top],
    }


def team_brief(p: dict) -> dict:
    return {"id": p["id"], "name": p["name"], "image": p.get("image_path")}


_LEAGUE_CONTEXT_CACHE: dict = {}


def cached_league_context(season_start: date, league_id: int | None = None) -> dict | None:
    """Ligové průměry (fauly/karty na zápas) se pro všechny zápasy stejné
    sezóny/soutěže shodují -> nepočítat pořád znovu při buildění více zápasů
    najednou."""
    competition_id = league_id or LEAGUE_ID
    key = f"{competition_id}:{season_start.isoformat()}"
    if key not in _LEAGUE_CONTEXT_CACHE:
        league_fixtures = fetch_league_matches(competition_id, season_start, date.today())
        _LEAGUE_CONTEXT_CACHE[key] = league_average_stats(league_fixtures)
    return _LEAGUE_CONTEXT_CACHE[key]


def build_match(fixture_id: int, league_id: int | None = None) -> dict:
    """Stáhne a spočítá kompletní analytický balíček dat pro jeden zápas
    (H2H, forma, radar, trendy, simulace, hráči, rozhodčí, absence)."""
    competition_id = league_id or LEAGUE_ID
    print(f"[2] Detail zápasu {fixture_id}…")
    fixture = fetch_fixture_detail(fixture_id)
    parts = fixture.get("participants", [])
    home_p = next(p for p in parts if p["meta"]["location"] == "home")
    away_p = next(p for p in parts if p["meta"]["location"] == "away")
    home_id, away_id = home_p["id"], away_p["id"]
    season_id = (fixture.get("round") or {}).get("season_id")
    season = fetch_season(season_id) if season_id else {}
    season_start = date.fromisoformat(season["starting_at"]) if season.get("starting_at") else date.today() - timedelta(days=240)
    print(f"    -> {home_p['name']} vs {away_p['name']} ({fixture.get('starting_at')}), sezóna od {season_start}")

    print("[3] H2H historie (statistiky + trenéři + rozhodčí)…")
    h2h_fixtures_all = fetch_h2h(home_id, away_id)
    print(f"    -> {len(h2h_fixtures_all)} vzájemných zápasů celkem v datech, berem posledních 10")
    h2h_fixtures = h2h_fixtures_all[:10]

    h2h_out = []
    h2h_facts_home = []  # fakta z pohledu home_id přes VŠECH h2h_fixtures (pro sekci 2 a trendy)
    h2h_facts_away = []  # fakta z pohledu away_id
    for fx in h2h_fixtures:
        fx_parts = fx.get("participants", [])
        fx_home = next((p for p in fx_parts if p["meta"]["location"] == "home"), None)
        fx_away = next((p for p in fx_parts if p["meta"]["location"] == "away"), None)
        if not fx_home or not fx_away:
            continue
        coaches = {c["meta"]["participant_id"]: c.get("name") for c in fx.get("coaches", []) or []}
        opp_of_home = fx_away["id"] if fx_home["id"] == home_id else fx_home["id"]
        opp_of_away = fx_away["id"] if fx_home["id"] == away_id else fx_home["id"]
        facts_home = match_facts(fx, home_id, opp_of_home, competition_id)
        facts_away = match_facts(fx, away_id, opp_of_away, competition_id)
        h2h_facts_home.append(facts_home)
        h2h_facts_away.append(facts_away)

        result_for_home_team = "V" if facts_home["gf"] > facts_home["ga"] else "R" if facts_home["gf"] == facts_home["ga"] else "P"
        ref_id = main_referee(fx)
        h2h_out.append({
            "fixture_id": fx["id"],
            "date": to_iso_utc(fx["starting_at"]),
            "home": team_brief(fx_home),
            "away": team_brief(fx_away),
            "home_score": score_for(fx, fx_home["id"]),
            "away_score": score_for(fx, fx_away["id"]),
            "result_for_home_team": result_for_home_team,
            "is_home_team_at_home": fx_home["id"] == home_id,
            "team_home_stats": {
                "shots": facts_home["shots"], "sot": facts_home["sot"], "corners": facts_home["corners"],
                "fouls": facts_home["fouls"], "possession": facts_home["possession"],
                "yellow": facts_home["yellow"], "red": facts_home["red"],
            },
            "team_away_stats": {
                "shots": facts_away["shots"], "sot": facts_away["sot"], "corners": facts_away["corners"],
                "fouls": facts_away["fouls"], "possession": facts_away["possession"],
                "yellow": facts_away["yellow"], "red": facts_away["red"],
            },
            "coach_home": coaches.get(fx_home["id"]),
            "coach_away": coaches.get(fx_away["id"]),
            "referee_id": ref_id,
        })
    print(f"    -> {len(h2h_out)} vzájemných zápasů v sekci 1/2")

    # Podmnožina H2H, kde byl `home_id` (domácí příštího zápasu) skutečně
    # domácí i tehdy -> pro radar tab "Poslední 3 zápasy [domácí] doma".
    _home_venue_idx = [i for i, m in enumerate(h2h_out) if m["is_home_team_at_home"]][:3]
    h2h_facts_home_venue_home = [h2h_facts_home[i] for i in _home_venue_idx]
    h2h_facts_home_venue_away = [h2h_facts_away[i] for i in _home_venue_idx]

    print("[4] Forma — zápasy aktuální sezóny obou týmů (+ širší historie pro rozhodčího)…")
    # Stahujeme rovnou ~2 sezóny zpět (REF_LOOKBACK_DAYS) a sezónní podmnožinu
    # (pro Formu/Radar/Trendy/Simulaci) pak jen vyfiltrujeme podle data —
    # ať máme z jednoho fetchu i dost historie na "kolikrát tento rozhodčí
    # pískal tenhle konkrétní tým", což v prvních týdnech sezóny (pár
    # odehraných zápasů) jinak dá falešně "ještě nepískal".
    REF_LOOKBACK_DAYS = 730
    lookback_start = date.today() - timedelta(days=REF_LOOKBACK_DAYS)

    def fetch_team_facts(tid: int, min_date: date, hard_days_back: int) -> list:
        matches = fetch_team_matches(tid, min_date=min_date, hard_days_back=hard_days_back)
        facts_all = []
        for fx in matches:
            fx_parts = fx.get("participants", [])
            opp = next((p for p in fx_parts if p["id"] != tid), None)
            if not opp:
                continue
            facts_all.append(match_facts(fx, tid, opp["id"], competition_id))
        return facts_all

    team_matches_wide = {}
    for label, tid in (("home", home_id), ("away", away_id)):
        team_matches_wide[label] = fetch_team_facts(tid, min_date=lookback_start, hard_days_back=REF_LOOKBACK_DAYS)
    team_matches = {
        label: [f for f in team_matches_wide[label] if f["date"] >= season_start.isoformat()]
        for label in ("home", "away")
    }
    facts_last5 = {l: team_matches[l][:5] for l in ("home", "away")}
    facts_last6 = {l: team_matches[l][:6] for l in ("home", "away")}
    # jen ligové zápasy (bez pohárů/mezistátních přátelských) — pro sekci Trendy
    facts_last5_league = {l: [f for f in team_matches[l] if f["is_league_match"]][:5] for l in ("home", "away")}

    form_out = {}
    for label in ("home", "away"):
        form_out[label] = compute_form(facts_last6[label])
        form_out[label]["recent_all"] = team_matches[label]
        form_out[label]["season_start"] = season_start.isoformat()

    print("[5] Radar (sezóna / posledních 5 / poslední 3 H2H)…")
    radar_out = {
        "categories": [c[1] for c in RADAR_CATEGORIES],
        "season": {l: radar_averages(team_matches[l][:15]) for l in ("home", "away")},
        "last5": {l: radar_averages(facts_last5[l]) for l in ("home", "away")},
        "last3_h2h": {
            "home": radar_averages(h2h_facts_home[:3]),
            "away": radar_averages(h2h_facts_away[:3]),
        },
        "last3_h2h_home_venue": {
            "home": radar_averages(h2h_facts_home_venue_home) if h2h_facts_home_venue_home else None,
            "away": radar_averages(h2h_facts_home_venue_away) if h2h_facts_home_venue_away else None,
            "sample_size": len(h2h_facts_home_venue_home),
        },
    }

    print("[6] Trend katalog (obecně posledních 5 ligových + H2H 3/5)…")
    trends_out = {
        "team_last5": {
            "home": compute_trends(facts_last5_league["home"]),
            "away": compute_trends(facts_last5_league["away"]),
        },
        "h2h": {
            "last3": compute_trends(h2h_facts_home[:3]),
            "last5": compute_trends(h2h_facts_home[:5]),
        },
    }

    print("[7] Poisson simulace (stažená k ligovému průměru)…")
    simulation_out = simulate_from_facts(
        team_matches["home"],
        team_matches["away"],
        h2h_facts_home,
        h2h_facts_away,
    )

    print("[8] Soupisky + sezónní statistiky hráčů (může trvat déle)…")
    players_out = {"home": [], "away": []}
    if season_id:
        for label, tid in (("home", home_id), ("away", away_id)):
            squad = fetch_squad(tid, season_id)
            for s in squad:
                p = s.get("player")
                if not p:
                    continue
                season_stats = fetch_player_season_stats(p["id"], season_id)
                players_out[label].append({
                    "id": p["id"],
                    "name": p["name"],
                    "position_id": s.get("position_id") or p.get("position_id"),
                    "is_gk": (s.get("position_id") or p.get("position_id")) == 24,
                    "jersey_number": s.get("jersey_number"),
                    "season_stats": season_stats,
                })
    print(f"    -> {len(players_out['home'])} + {len(players_out['away'])} hráčů se sezónní statistikou")

    print("[9] Statistiky hráčů — posledních 5 zápasů + H2H (lineups)…")
    last5_fixture_ids = {
        "home": [f["fixture_id"] for f in facts_last5["home"]],
        "away": [f["fixture_id"] for f in facts_last5["away"]],
    }
    h2h_fixture_ids = [fx["fixture_id"] for fx in h2h_out]
    lineup_agg = {
        "home_last5": aggregate_lineup_stats(last5_fixture_ids["home"]),
        "away_last5": aggregate_lineup_stats(last5_fixture_ids["away"]),
        "h2h": aggregate_lineup_stats(h2h_fixture_ids),
    }

    def attach_lineup_view(view_key: str, agg_key: str):
        for label in ("home", "away"):
            key = agg_key if agg_key != "h2h" else "h2h"
            agg = lineup_agg[f"{label}_last5"] if agg_key == "last5" else lineup_agg["h2h"]
            for p in players_out[label]:
                entry = agg.get(p["id"])
                p[view_key] = {
                    "appearances": entry["appearances"] if entry else 0,
                    "stats": dict(entry["sums"]) if entry else {},
                }

    attach_lineup_view("last5_stats", "last5")
    attach_lineup_view("h2h_stats", "h2h")

    print("[10] Rozhodčí — kompletní profil…")
    referee_out = None
    ref_id = main_referee(fixture)
    if ref_id:
        profile = fetch_referee_profile(ref_id)
        blocks = profile.get("statistics", []) or []
        season_block = next((b for b in blocks if b.get("season_id") == season_id), None)

        def block_summary(block):
            if not block:
                return None
            out = {}
            for d in block.get("details", []):
                tname = (d.get("type") or {}).get("name")
                val = d.get("value") or {}
                out[tname] = val
            return out

        # kariérní součet přes všechny sezónní bloky (jednoduché sečtení počtů zápasů/karet)
        career_matches = 0
        career_yellow = 0
        career_red = 0
        for b in blocks:
            for d in b.get("details", []):
                tname = (d.get("type") or {}).get("name")
                val = d.get("value") or {}
                if tname == "Season Matches":
                    career_matches += val.get("count", 0)
                elif tname == "Yellowcards":
                    career_yellow += (val.get("all") or {}).get("count", 0)
                elif tname == "Redcards":
                    career_red += (val.get("all") or {}).get("count", 0)

        # "Vzájemné zápasy, které pískal" — bez omezení počtu, prohledáváme
        # VŠECHNY dostupné H2H zápasy (h2h_fixtures_all), ne jen posledních
        # 10 použitých v sekci 1/2.
        def h2h_officiated_entry(fx):
            fx_parts = fx.get("participants", [])
            fx_home = next((p for p in fx_parts if p["meta"]["location"] == "home"), None)
            fx_away = next((p for p in fx_parts if p["meta"]["location"] == "away"), None)
            if not fx_home or not fx_away:
                return None
            home_score = score_for(fx, fx_home["id"])
            away_score = score_for(fx, fx_away["id"])
            # výsledek z pohledu domácího týmu NADCHÁZEJÍCÍHO zápasu
            if fx_home["id"] == home_id:
                gf, ga = home_score or 0, away_score or 0
            else:
                gf, ga = away_score or 0, home_score or 0
            result = "V" if gf > ga else "R" if gf == ga else "P"
            return {
                "fixture_id": fx["id"],
                "date": to_iso_utc(fx["starting_at"]),
                "home": fx_home.get("name"),
                "away": fx_away.get("name"),
                "home_score": home_score,
                "away_score": away_score,
                "result_for_home_team": result,
            }

        h2h_officiated = [
            e for e in (h2h_officiated_entry(fx) for fx in h2h_fixtures_all if main_referee(fx) == ref_id) if e
        ]

        # Pozor: čerpáme z team_matches_wide (~2 sezóny zpět), NE z sezónně
        # omezeného team_matches — jinak by na začátku sezóny (pár odehraných
        # zápasů) vycházelo falešně "rozhodčí ještě nikdy nepískal tento tým".
        home_team_officiated = [f for f in team_matches_wide["home"] if f.get("referee_id") == ref_id]
        away_team_officiated = [f for f in team_matches_wide["away"] if f.get("referee_id") == ref_id]

        def team_ref_summary(facts, team_name):
            if not facts:
                return None
            n = len(facts)
            return {
                "matches": n,
                "avg_fouls_by_team": round(sum(f["fouls"] for f in facts) / n, 1),
                "avg_fouls_total": round(sum(f["fouls"] + f["opp_fouls"] for f in facts) / n, 1),
                "avg_yellow_by_team": round(sum(f["yellow"] for f in facts) / n, 2),
                "avg_red_by_team": round(sum(f["red"] for f in facts) / n, 2),
                "recent_matches": [
                    {
                        "fixture_id": f["fixture_id"],
                        "date": f["date"],
                        "home_name": team_name if f["is_home"] else f["opponent"],
                        "away_name": f["opponent"] if f["is_home"] else team_name,
                        "home_score": f["gf"] if f["is_home"] else f["ga"],
                        "away_score": f["ga"] if f["is_home"] else f["gf"],
                        "result": "V" if f["gf"] > f["ga"] else "R" if f["gf"] == f["ga"] else "P",
                        "total_fouls": f["fouls"] + f["opp_fouls"],
                    }
                    for f in facts
                ],
            }

        print("    -> ligové průměry (kontext pro sezónní statistiky rozhodčího)…")
        league_context = cached_league_context(season_start, competition_id)

        referee_out = {
            "id": ref_id,
            "name": profile.get("name"),
            "season_stats": block_summary(season_block),
            "league_context": league_context,
            "career_stats": {
                "total_seasons_tracked": len(blocks),
                "matches": career_matches,
                "yellow_cards": career_yellow,
                "red_cards": career_red,
                "avg_yellow_per_match": round(career_yellow / career_matches, 2) if career_matches else None,
            },
            "h2h_matches_officiated": h2h_officiated,
            "home_team_matches_officiated": team_ref_summary(home_team_officiated, home_p["name"]),
            "away_team_matches_officiated": team_ref_summary(away_team_officiated, away_p["name"]),
        }

    print("[11] Absence hráčů (zranění/tresty) — s daty a heuristikou dostupnosti…")
    player_name_lookup = {}
    for side in ("home", "away"):
        for p in players_out.get(side, []):
            player_name_lookup[p["id"]] = p["name"]

    def fetch_team_sidelined(team_id: int) -> list:
        data = call(f"/teams/{team_id}", {"include": "sidelined"})
        return (data.get("data") or {}).get("sidelined", []) or []

    fixture_date = date.fromisoformat((fixture.get("starting_at") or "2100-01-01")[:10])
    stale_cutoff = fixture_date - timedelta(days=300)
    # Pozor: "hrál v posledních 5 zápasech" NENÍ důkaz, že není zraněný TEĎ
    # (mohl se zranit v průběhu tohoto okna) — nejsilnější signál "stale"
    # dat je, že nastoupil v úplně POSLEDNÍM odehraném zápase týmu.
    recently_playing = set()
    for label, ids in last5_fixture_ids.items():
        if not ids:
            continue
        latest_lineup = fetch_lineup_stats(ids[0])
        recently_playing.update(latest_lineup.keys())

    sidelined_out = []
    for label, tid in (("home", home_id), ("away", away_id)):
        for s in fetch_team_sidelined(tid):
            if s.get("completed"):
                continue
            pid = s.get("player_id")
            start_date = s.get("start_date")
            end_date = s.get("end_date")
            # Obranná hygiena dat: SportMonks občas nezavře staré záznamy
            # (viz "aktivní" zranění staré přes rok u hráče, co teď reálně
            # nastupuje). Vyřadíme záznamy, které jsou evidentně zastaralé:
            # hráč má letos zápasy NEBO je start_date starý >300 dní a
            # nemá stanovený (tedy sledovaný/aktuální) konec.
            if pid in recently_playing:
                continue
            if start_date:
                try:
                    is_old = date.fromisoformat(start_date) < stale_cutoff
                except ValueError:
                    is_old = False
                if is_old and not end_date:
                    continue
            tname_en = type_name(s.get("type_id"))
            likely_available = False
            if end_date:
                try:
                    likely_available = date.fromisoformat(end_date) < fixture_date
                except ValueError:
                    pass
            name = player_name_lookup.get(pid) or fetch_player_name(pid)
            sidelined_out.append({
                "side": label,
                "player_id": pid,
                "player_name": name,
                "type_id": s.get("type_id"),
                "type_name": tname_en,
                "type_name_cs": INJURY_CS.get(tname_en, tname_en),
                "category": s.get("category"),
                "category_cs": CATEGORY_CS.get(s.get("category"), s.get("category")),
                "start_date": s.get("start_date"),
                "end_date": end_date,
                "games_missed": s.get("games_missed"),
                "likely_available": likely_available,
            })
    print(f"    -> {len(sidelined_out)} absencí ({_call_count} API volání celkem)")

    predicted_lineups_out = predicted_lineups_from_fixture(fixture, home_id, away_id)

    print(f"    -> hotovo: {home_p['name']} vs {away_p['name']}")
    return {
        "fixture_id": fixture_id,
        "league_id": competition_id,
        "league_name": (fixture.get("league") or {}).get("name"),
        "built_at": datetime.now().isoformat() + "Z",
        "build_mode": "full",
        "starting_at": to_iso_utc(fixture.get("starting_at")),
        "venue": (fixture.get("venue") or {}).get("name"),
        "home": team_brief(home_p),
        "away": team_brief(away_p),
        "referee": referee_out,
        "sidelined": sidelined_out,
        "predicted_lineups": predicted_lineups_out,
        "h2h": h2h_out,
        "h2h_total_available": len(h2h_fixtures_all),
        "form": form_out,
        "radar": radar_out,
        "trends": trends_out,
        "simulation": simulation_out,
        "players": players_out,
    }


REFRESH_TTL = 2 * 3600  # volatilní pole (rozhodčí, absence, kickoff) bereme čerstvější


def _form_recent_fixture_id(existing: dict, side: str) -> int | None:
    block = (existing.get("form") or {}).get(side) or {}
    facts = block.get("recent_all") or block.get("matches") or []
    if facts and facts[0].get("fixture_id"):
        return facts[0]["fixture_id"]
    return None


def collect_sidelined_lightweight(fixture: dict, home_id: int, away_id: int, existing: dict) -> list:
    """Absence bez plného rebuildu — jména z uloženého zápasu, „hrál naposledy“ z formy."""
    player_name_lookup = {}
    for side in ("home", "away"):
        for p in (existing.get("players") or {}).get(side, []) or []:
            player_name_lookup[p["id"]] = p["name"]
        for s in existing.get("sidelined") or []:
            if s.get("player_id") and s.get("player_name"):
                player_name_lookup[s["player_id"]] = s["player_name"]

    recently_playing = set()
    for side in ("home", "away"):
        fid = _form_recent_fixture_id(existing, side)
        if fid:
            recently_playing.update(fetch_lineup_stats(fid).keys())

    fixture_date = date.fromisoformat((fixture.get("starting_at") or "2100-01-01")[:10])
    stale_cutoff = fixture_date - timedelta(days=300)
    sidelined_out = []
    seen = set()
    for label, tid in (("home", home_id), ("away", away_id)):
        data = call(f"/teams/{tid}", {"include": "sidelined"}, cache_ttl=REFRESH_TTL)
        for s in (data.get("data") or {}).get("sidelined", []) or []:
            if s.get("completed"):
                continue
            pid = s.get("player_id")
            key = (pid, s.get("type_id"), label)
            if key in seen:
                continue
            seen.add(key)
            start_date = s.get("start_date")
            end_date = s.get("end_date")
            if pid in recently_playing:
                continue
            if start_date:
                try:
                    is_old = date.fromisoformat(start_date) < stale_cutoff
                except ValueError:
                    is_old = False
                if is_old and not end_date:
                    continue
            tname_en = type_name(s.get("type_id"))
            likely_available = False
            if end_date:
                try:
                    likely_available = date.fromisoformat(end_date) < fixture_date
                except ValueError:
                    pass
            name = player_name_lookup.get(pid) or fetch_player_name(pid)
            sidelined_out.append({
                "side": label,
                "player_id": pid,
                "player_name": name,
                "type_id": s.get("type_id"),
                "type_name": tname_en,
                "type_name_cs": INJURY_CS.get(tname_en, tname_en),
                "category": s.get("category"),
                "category_cs": CATEGORY_CS.get(s.get("category"), s.get("category")),
                "start_date": start_date,
                "end_date": end_date,
                "games_missed": s.get("games_missed"),
                "likely_available": likely_available,
            })
    return sidelined_out


def refresh_volatile(existing: dict) -> dict:
    """Denní delta: kickoff, stadion, rozhodčí, absence, predikované sestavy.
    Historie (H2H, forma, radar, trendy, simulace, hráči) zůstává z plného buildu.
    Pokud se změnil rozhodčí, přestaví se celý zápas — jeho profil je drahý a vzácný."""
    fixture_id = existing["fixture_id"]
    league_id = existing.get("league_id") or LEAGUE_ID
    fixture = fetch_fixture_detail(fixture_id, cache_ttl=REFRESH_TTL)
    if not fixture:
        print(f"    ⚠️ refresh {fixture_id}: prázdný fixture, nechávám uložená data")
        return existing

    new_ref = main_referee(fixture)
    old_ref = (existing.get("referee") or {}).get("id")
    if new_ref and new_ref != old_ref:
        print(f"    rozhodčí se změnil ({old_ref} → {new_ref}), plný rebuild")
        return build_match(fixture_id, league_id)

    parts = fixture.get("participants") or []
    home_p = next((p for p in parts if (p.get("meta") or {}).get("location") == "home"), None)
    away_p = next((p for p in parts if (p.get("meta") or {}).get("location") == "away"), None)
    if not home_p or not away_p:
        return existing

    existing["starting_at"] = to_iso_utc(fixture.get("starting_at"))
    existing["venue"] = (fixture.get("venue") or {}).get("name")
    existing["league_id"] = existing.get("league_id") or (fixture.get("league") or {}).get("id") or league_id
    existing["league_name"] = existing.get("league_name") or (fixture.get("league") or {}).get("name")
    existing["predicted_lineups"] = predicted_lineups_from_fixture(fixture, home_p["id"], away_p["id"])
    existing["sidelined"] = collect_sidelined_lightweight(fixture, home_p["id"], away_p["id"], existing)
    existing["refreshed_at"] = datetime.now().isoformat() + "Z"
    existing["build_mode"] = "refresh"
    return existing


def resolve_target_fixture_ids(round_fixtures: list) -> list:
    """Bez argumentů -> všechny zápasy, které se hrají ZÍTRA (podle dnešního
    data stroje, na kterém se skript pouští). S číselnými argumenty -> přesně
    ty fixture_id (užitečné pro znovu-přebuildění jednoho zápasu)."""
    explicit_ids = [int(a) for a in sys.argv[1:] if a.isdigit()]
    if explicit_ids:
        return explicit_ids

    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    ids = [fx["id"] for fx in round_fixtures if (fx.get("starting_at") or "")[:10] == tomorrow]
    if not ids:
        print(f"  (žádný zápas nenalezen na zítra {tomorrow}, padám zpět na výchozí demo zápas)")
        return [DEFAULT_FIXTURE_ID]
    return ids


def main() -> None:
    print("[1] Fixtures dalšího kola…")
    round_fixtures = fetch_round_fixtures()
    round_out = []
    for fx in round_fixtures:
        parts = fx.get("participants", [])
        home = next((p for p in parts if p["meta"]["location"] == "home"), None)
        away = next((p for p in parts if p["meta"]["location"] == "away"), None)
        if not home or not away:
            continue
        round_out.append({
            "fixture_id": fx["id"],
            "starting_at": to_iso_utc(fx["starting_at"]),
            "venue": (fx.get("venue") or {}).get("name"),
            "home": team_brief(home),
            "away": team_brief(away),
        })
    round_out.sort(key=lambda f: f["starting_at"])
    print(f"    -> {len(round_out)} zápasů v kole")

    target_ids = resolve_target_fixture_ids(round_fixtures)
    print(f"== Buildím plná data pro {len(target_ids)} zápas(ů): {target_ids} ==")

    matches_out = []
    for i, fixture_id in enumerate(target_ids, start=1):
        print(f"\n--- Zápas {i}/{len(target_ids)} (fixture_id={fixture_id}) ---")
        try:
            matches_out.append(build_match(fixture_id))
        except Exception as e:  # jeden neúspěšný zápas nesmí shodit celý build
            print(f"  ⚠️ Zápas {fixture_id} se nepodařilo sestavit: {e}", file=sys.stderr)

    output = {
        "generated_at": datetime.now().isoformat() + "Z",
        "league": {"id": LEAGUE_ID, "name": "Chance Liga"},
        "round": round_out,
        "matches": matches_out,
    }

    out_path = ROOT / "frontend" / "public" / "data" / "match.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(output, indent=2, ensure_ascii=False, default=str))
    print(f"\n✅ Hotovo: {len(matches_out)}/{len(target_ids)} zápasů, {_call_count} API volání celkem -> {out_path}")


if __name__ == "__main__":
    main()
