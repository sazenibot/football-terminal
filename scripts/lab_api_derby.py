#!/usr/bin/env python3
"""Jednorázový TEST: Sparta–Slavia 0:3 (30. 8. 2026) — SportMonks vs TheStatsAPI.

Tokeny jen z env / .env. Výstup: frontend/public/data/lab/derby.json
Není cron, není produkt. Cíl: vidět, co která API na konkrétním zápase
opravdu vrátí, jestli se čísla shodují, a které pole je prázdné.
"""

from __future__ import annotations

import json
import os
import re
import ssl
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

try:
    import certifi

    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "frontend" / "public" / "data" / "lab" / "derby.json"
SM_BASE = "https://api.sportmonks.com/v3/football"
TS_BASE = "https://api.thestatsapi.com/api"
SM_FIXTURE = 19725063
SM_HOME = 2727  # Sparta
SM_AWAY = 216  # Slavia
KICKOFF_DATE = "2026-08-30"

# Překryv SM type_id → TheStatsAPI metric key (all / 1H / 2H u TS).
SM_TO_TS = {
    42: "total_shots",
    86: "shots_on_target",
    41: "shots_off_target",
    58: "blocked_shots",
    49: "shots_inside_box",
    50: "shots_outside_box",
    45: "ball_possession",
    34: "corner_kicks",
    56: "fouls",
    84: "yellow_cards",
    83: "red_cards",
    51: "offsides",
    80: "passes",
    82: "accurate_passes_pct",
    117: "key_passes",
    98: "total_crosses",
    99: "accurate_crosses",
    580: "big_chances",
    581: "big_chances_missed",
    78: "tackles",
    100: "interceptions",
    57: "goalkeeper_saves",
    47: "penalties",
    55: "free_kicks",
    60: "throw_ins",
    53: "goal_kicks",
    64: "hit_woodwork",
    81: "accurate_passes",
    109: "dribbles_percentage",  # TS klíč říká %, hodnoty = successful dribbles
    27264: "accurate_long_balls",
    27267: "tackles_won_percentage",
    43: None,  # attacks — SM only
    44: None,  # dangerous attacks
    314: None,  # VAR
}

METRIC_LABELS = {
    "total_shots": "Střely celkem",
    "shots_on_target": "Střely na bránu",
    "shots_off_target": "Střely mimo",
    "blocked_shots": "Zblokované střely",
    "shots_inside_box": "Střely z vápna",
    "shots_outside_box": "Střely mimo vápno",
    "hit_woodwork": "Tyče / břevna",
    "ball_possession": "Držení míče %",
    "corner_kicks": "Rohy",
    "fouls": "Fauly",
    "yellow_cards": "Žluté karty",
    "red_cards": "Červené karty",
    "offsides": "Ofsajdy",
    "passes": "Přihrávky",
    "accurate_passes": "Přesné přihrávky",
    "accurate_passes_pct": "Přesnost přihrávek %",
    "key_passes": "Klíčové přihrávky",
    "total_crosses": "Centry",
    "accurate_crosses": "Přesné centry",
    "attacks": "Útoky",
    "dangerous_attacks": "Nebezpečné útoky",
    "big_chances": "Velké šance",
    "big_chances_missed": "Velké šance mimo",
    "tackles": "Skluzy",
    "interceptions": "Interceptions",
    "goalkeeper_saves": "Zákroky",
    "penalties": "Penalty",
    "free_kicks": "Přímé kopy",
    "throw_ins": "Auty",
    "goal_kicks": "Výkopy",
    "expected_goals": "xG týmu",
    "touches_in_penalty_area": "Dotyky ve vápně",
    "fouled_in_final_third": "Fauly v finále",
    "var": "VAR zásahy",
}

LINEUP_TYPES = {
    52: "goals",
    79: "assists",
    42: "shots",
    86: "sot",
    56: "fouls",
    84: "yellow",
    83: "red",
    119: "minutes",
    57: "saves",
    88: "conceded",
    78: "tackles",
    100: "interceptions",
    80: "passes",
    82: "pass_pct",
    117: "key_passes",
    118: "rating",
}


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    path = ROOT / ".env"
    if path.exists():
        for line in path.read_text().splitlines():
            m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
            if m:
                env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    for k in ("SPORTMONKS_API_TOKEN", "THESTATSAPI_API_KEY"):
        if os.environ.get(k):
            env[k] = os.environ[k].strip()
    return env


def strip_accents(s: str) -> str:
    nfkd = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


def norm_name(s: str) -> str:
    s = strip_accents(s)
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    parts = [p for p in s.split() if p and p not in {"fc", "sk", "ac", "praha", "prague"}]
    return " ".join(parts)


def num(v):
    if v is None or v is False:
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        if isinstance(v, float) and v.is_integer():
            return int(v)
        return v
    if isinstance(v, str):
        t = v.strip().replace(",", ".")
        if t.endswith("%"):
            t = t[:-1]
        try:
            f = float(t)
            return int(f) if f.is_integer() else f
        except ValueError:
            return None
    return None


def same_num(a, b) -> str:
    if a is None and b is None:
        return "empty"
    if a is None:
        return "ts_only"
    if b is None:
        return "sm_only"
    try:
        fa, fb = float(a), float(b)
    except (TypeError, ValueError):
        return "diff" if a != b else "same"
    if abs(fa - fb) < 0.051:
        return "same"
    return "diff"


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

_last = 0.0
CALLS: list[dict] = []


def _sleep():
    global _last
    wait = 0.35 - (time.time() - _last)
    if wait > 0:
        time.sleep(wait)
    _last = time.time()


def http_json(url: str, headers: dict | None = None) -> tuple[int, dict | list | None, str | None, dict]:
    _sleep()
    req = urllib.request.Request(url, headers=headers or {})
    meta = {"url": re.sub(r"api_token=[^&]+", "api_token=***", url), "quota": None}
    try:
        with urllib.request.urlopen(req, timeout=30, context=SSL_CONTEXT) as resp:
            raw = resp.read()
            hdrs = {k.lower(): v for k, v in resp.headers.items()}
            quota = hdrs.get("x-monthly-quota-remaining") or hdrs.get("x-ratelimit-remaining")
            meta["quota"] = quota
            meta["bytes"] = len(raw)
            body = json.loads(raw.decode("utf-8")) if raw else None
            CALLS.append({"status": resp.status, "bytes": len(raw), "quota": quota, "path": meta["url"][-120:]})
            return resp.status, body, None, meta
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        CALLS.append({"status": e.code, "bytes": len(raw), "quota": None, "path": meta["url"][-120:]})
        try:
            parsed = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            parsed = None
        return e.code, parsed, raw[:240], meta
    except Exception as e:
        CALLS.append({"status": 0, "bytes": 0, "quota": None, "path": meta["url"][-120:]})
        return 0, None, str(e)[:240], meta


def sm_get(token: str, path: str, params: dict | None = None) -> tuple[int, dict | None, str | None]:
    q = dict(params or {})
    q["api_token"] = token
    url = f"{SM_BASE}{path}?{urllib.parse.urlencode(q)}"
    status, body, err, _ = http_json(url)
    if isinstance(body, dict):
        return status, body, err
    return status, None, err


def ts_get(key: str, path: str, params: dict | None = None) -> tuple[int, dict | list | None, str | None]:
    url = f"{TS_BASE}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    status, body, err, _ = http_json(url, headers={"Authorization": f"Bearer {key}", "Accept": "application/json"})
    return status, body, err


def ts_data(body) -> dict | list | None:
    if isinstance(body, dict) and "data" in body:
        return body["data"]
    return body


# ---------------------------------------------------------------------------
# SportMonks extract
# ---------------------------------------------------------------------------

def sm_sides(fx: dict) -> tuple[dict, dict]:
    home = away = {}
    for p in fx.get("participants") or []:
        loc = (p.get("meta") or {}).get("location")
        if loc == "home":
            home = p
        elif loc == "away":
            away = p
    return home, away


def sm_score(fx: dict, pid: int, desc: str = "CURRENT"):
    for sc in fx.get("scores") or []:
        if sc.get("participant_id") == pid and sc.get("description") == desc:
            return num((sc.get("score") or {}).get("goals"))
    return None


def sm_stats_map(fx: dict, home_id: int, away_id: int) -> dict:
    out: dict[int, dict] = {}
    for s in fx.get("statistics") or []:
        tid = s.get("type_id")
        pid = s.get("participant_id")
        val = num((s.get("data") or {}).get("value"))
        typ = s.get("type") or {}
        if tid not in out:
            out[tid] = {
                "type_id": tid,
                "name": typ.get("name") or typ.get("code") or str(tid),
                "code": typ.get("code"),
                "home": None,
                "away": None,
            }
        if pid == home_id:
            out[tid]["home"] = val
        elif pid == away_id:
            out[tid]["away"] = val
    return out


def sm_player_stats(lu: dict) -> dict:
    stats = {}
    for d in lu.get("details") or []:
        key = LINEUP_TYPES.get(d.get("type_id"))
        if not key:
            continue
        stats[key] = num((d.get("data") or {}).get("value"))
    return stats


def sm_players(fx: dict, home_id: int) -> list[dict]:
    rows = []
    for lu in fx.get("lineups") or []:
        stats = sm_player_stats(lu)
        team_id = lu.get("team_id")
        rows.append({
            "id": lu.get("player_id"),
            "name": lu.get("player_name") or lu.get("player_fullname"),
            "side": "home" if team_id == home_id else "away",
            "jersey": lu.get("jersey_number"),
            "position": lu.get("position_id"),
            "formation_field": lu.get("formation_field"),
            "starter": lu.get("type_id") == 11,
            **stats,
        })
    return rows


def sm_events(fx: dict, home_id: int) -> list[dict]:
    out = []
    for ev in fx.get("events") or []:
        typ = ev.get("type") or {}
        pid = ev.get("participant_id") or ev.get("team_id")
        out.append({
            "minute": ev.get("minute"),
            "extra": ev.get("extra_minute"),
            "type": typ.get("name") or typ.get("code") or ev.get("type_id"),
            "player": ev.get("player_name"),
            "side": "home" if pid == home_id else "away" if pid else None,
            "info": ev.get("info") or ev.get("addition"),
        })
    return out


def compact_sm_odds(body: dict | None) -> list[dict]:
    if not body:
        return []
    rows = body.get("data") if isinstance(body, dict) else body
    if not isinstance(rows, list):
        return []
    # SM pre-match odds: list of market rows. Keep a short sample.
    by_book: dict[str, dict] = {}
    for row in rows[:400]:
        bm = (row.get("bookmaker") or {}).get("name") or row.get("label") or "book"
        market = (row.get("market") or {}).get("name") or row.get("name") or "?"
        slot = by_book.setdefault(bm, {"bookmaker": bm, "markets": {}})
        vals = slot["markets"].setdefault(market, [])
        if len(vals) < 8:
            vals.append({
                "label": row.get("label") or row.get("name"),
                "value": num(row.get("value") or row.get("dp3") or (row.get("odd") if isinstance(row.get("odd"), (int, float, str)) else None)),
            })
    return list(by_book.values())[:8]


# ---------------------------------------------------------------------------
# TheStatsAPI extract
# ---------------------------------------------------------------------------

def ha_period(node) -> dict:
    if not isinstance(node, dict):
        return {"home": None, "away": None, "home_1h": None, "away_1h": None, "home_2h": None, "away_2h": None}
    all_ = node.get("all") or {}
    h1 = node.get("first_half") or {}
    h2 = node.get("second_half") or {}
    return {
        "home": num(all_.get("home")),
        "away": num(all_.get("away")),
        "home_1h": num(h1.get("home")),
        "away_1h": num(h1.get("away")),
        "home_2h": num(h2.get("home")),
        "away_2h": num(h2.get("away")),
    }


def flatten_ts_stats(stats: dict | None) -> dict[str, dict]:
    out: dict[str, dict] = {}
    if not isinstance(stats, dict):
        return out
    for _section, metrics in stats.items():
        if not isinstance(metrics, dict):
            continue
        # period-shaped metric
        if "all" in metrics or "first_half" in metrics:
            continue  # this is a metric itself at section level? rare
        for key, node in metrics.items():
            if isinstance(node, dict) and ("all" in node or "home" in node):
                if "all" in node or "first_half" in node:
                    out[key] = ha_period(node)
                elif "home" in node and "away" in node and not any(isinstance(v, dict) for v in node.values()):
                    out[key] = {
                        "home": num(node.get("home")),
                        "away": num(node.get("away")),
                        "home_1h": None,
                        "away_1h": None,
                        "home_2h": None,
                        "away_2h": None,
                    }
    return out


def pick_ts_match(rows: list, home_needles: list[str], away_needles: list[str]) -> dict | None:
    def hit(name: str, needles: list[str]) -> bool:
        n = norm_name(name)
        return any(k in n for k in needles)

    for m in rows:
        home = ((m.get("home_team") or {}).get("name")) or ""
        away = ((m.get("away_team") or {}).get("name")) or ""
        if hit(home, home_needles) and hit(away, away_needles):
            return m
        if hit(home, away_needles) and hit(away, home_needles):
            return m
    return None


def compact_ts_odds(body) -> list[dict]:
    data = ts_data(body) if isinstance(body, dict) else body
    if not isinstance(data, dict):
        return []
    out = []
    for bm in data.get("bookmakers") or []:
        markets = bm.get("markets") or {}
        compact = {}
        for mname, mval in markets.items():
            compact[mname] = _odds_leaf(mval)
        out.append({"bookmaker": bm.get("bookmaker"), "markets": compact})
    return out


def _odds_leaf(node):
    if not isinstance(node, dict):
        return node
    if "last_seen" in node or "opening" in node:
        return {"opening": node.get("opening"), "last_seen": node.get("last_seen")}
    return {k: _odds_leaf(v) for k, v in node.items() if k not in ("available_to_back", "available_to_lay")}


def ts_players(rows: list | None, home_id: str | None) -> list[dict]:
    out = []
    for p in rows or []:
        shooting = p.get("shooting") or {}
        passing = p.get("passing") or {}
        defending = p.get("defending") or {}
        general = p.get("general") or {}
        gk = p.get("goalkeeping") or {}
        tid = p.get("team_id")
        out.append({
            "id": p.get("player_id"),
            "name": p.get("player_name"),
            "side": "home" if home_id and tid == home_id else "away",
            "position": p.get("position"),
            "rating": num(p.get("rating")),
            "minutes": num(p.get("minutes_played")),
            "starter": bool(p.get("started")),
            "goals": num(shooting.get("goals")),
            "assists": num(passing.get("assists")),
            "shots": num(shooting.get("total_shots")),
            "sot": num(shooting.get("shots_on_target")),
            "xg": num(shooting.get("expected_goals")),
            "xa": num(shooting.get("expected_assists")),
            "npxg": num(shooting.get("np_expected_goals")),
            "key_passes": num(passing.get("key_passes")),
            "passes": num(passing.get("total_passes")),
            "tackles": num(defending.get("tackles")),
            "interceptions": num(defending.get("interceptions")),
            "fouls": num(general.get("fouls")),
            "yellow": num(general.get("yellow_cards")),
            "red": num(general.get("red_cards")),
            "saves": num(gk.get("saves")),
        })
    return out


def pick_heatmap_players(players: list[dict]) -> list[dict]:
    chosen = []
    for side in ("home", "away"):
        pool = [p for p in players if p.get("side") == side and p.get("id")]
        pool.sort(key=lambda p: (p.get("shots") or 0, p.get("minutes") or 0), reverse=True)
        if pool:
            chosen.append(pool[0])
    return chosen


# ---------------------------------------------------------------------------
# Compare
# ---------------------------------------------------------------------------

def build_compare(sm_stats: dict, ts_stats: dict) -> list[dict]:
    rows = []
    seen_ts = set()
    sm_name_to_id = {v["code"] or v["name"]: k for k, v in sm_stats.items()}

    # known SM types first
    ordered_ids = list(SM_TO_TS.keys()) + [tid for tid in sm_stats if tid not in SM_TO_TS]
    for tid in ordered_ids:
        sm = sm_stats.get(tid)
        ts_key = SM_TO_TS.get(tid)
        ts = ts_stats.get(ts_key) if ts_key else None
        if ts_key:
            seen_ts.add(ts_key)
        if not sm and not ts:
            continue
        label = METRIC_LABELS.get(ts_key or "", None)
        if not label and sm:
            label = sm.get("name") or str(tid)
        if not label:
            label = ts_key or str(tid)
        sh, sa = (sm or {}).get("home"), (sm or {}).get("away")
        th = ts.get("home") if ts else None
        ta = ts.get("away") if ts else None
        rows.append({
            "id": ts_key or f"sm_{tid}",
            "label": label,
            "group": "Tým · zápas",
            "sm_type_id": tid if sm else None,
            "sm_home": sh,
            "sm_away": sa,
            "ts_home": th,
            "ts_away": ta,
            "ts_home_1h": ts.get("home_1h") if ts else None,
            "ts_away_1h": ts.get("away_1h") if ts else None,
            "ts_home_2h": ts.get("home_2h") if ts else None,
            "ts_away_2h": ts.get("away_2h") if ts else None,
            "home_verdict": same_num(sh, th),
            "away_verdict": same_num(sa, ta),
        })

    for key, ts in ts_stats.items():
        if key in seen_ts:
            continue
        rows.append({
            "id": key,
            "label": METRIC_LABELS.get(key, key.replace("_", " ")),
            "group": "Tým · zápas",
            "sm_type_id": None,
            "sm_home": None,
            "sm_away": None,
            "ts_home": ts.get("home"),
            "ts_away": ts.get("away"),
            "ts_home_1h": ts.get("home_1h"),
            "ts_away_1h": ts.get("away_1h"),
            "ts_home_2h": ts.get("home_2h"),
            "ts_away_2h": ts.get("away_2h"),
            "home_verdict": same_num(None, ts.get("home")),
            "away_verdict": same_num(None, ts.get("away")),
        })
    _ = sm_name_to_id
    return rows


def match_players(sm_ps: list, ts_ps: list) -> list[dict]:
    def key(name: str) -> str:
        parts = norm_name(name).split()
        return parts[-1] if parts else ""

    ts_by = {}
    for p in ts_ps:
        ts_by.setdefault(key(p.get("name") or ""), []).append(p)
    used = set()
    out = []
    for s in sm_ps:
        k = key(s.get("name") or "")
        cand = [p for p in ts_by.get(k, []) if p.get("id") not in used and p.get("side") == s.get("side")]
        t = cand[0] if cand else None
        if t:
            used.add(t.get("id"))
        fields = ["minutes", "goals", "assists", "shots", "sot", "fouls", "yellow", "red", "tackles", "saves", "rating"]
        cmp = {}
        for f in fields:
            sv = s.get(f)
            tv = t.get(f) if t else None
            cmp[f] = {"sm": sv, "ts": tv, "verdict": same_num(sv, tv)}
        if t:
            cmp["xg"] = {"sm": None, "ts": t.get("xg"), "verdict": same_num(None, t.get("xg"))}
            cmp["xa"] = {"sm": None, "ts": t.get("xa"), "verdict": same_num(None, t.get("xa"))}
        out.append({
            "name": s.get("name"),
            "side": s.get("side"),
            "sm_id": s.get("id"),
            "ts_id": t.get("id") if t else None,
            "matched": bool(t),
            "fields": cmp,
        })
    return out


def verdict_summary(rows: list[dict]) -> dict:
    c = {"same": 0, "diff": 0, "sm_only": 0, "ts_only": 0, "empty": 0}
    for r in rows:
        for side in ("home_verdict", "away_verdict"):
            v = r.get(side)
            if v in c:
                c[v] += 1
    overlap = c["same"] + c["diff"]
    return {
        **c,
        "overlap": overlap,
        "same_pct": round(100 * c["same"] / overlap, 1) if overlap else None,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    env = load_env()
    sm_token = env.get("SPORTMONKS_API_TOKEN")
    ts_key = env.get("THESTATSAPI_API_KEY")
    if not sm_token:
        sys.exit("Chybí SPORTMONKS_API_TOKEN")
    if not ts_key:
        sys.exit("Chybí THESTATSAPI_API_KEY")

    errors: list[str] = []
    endpoints: dict[str, dict] = {}

    def rec(name: str, status: int, err: str | None, extra: dict | None = None):
        endpoints[name] = {"status": status, "ok": 200 <= status < 300, "error": err, **(extra or {})}

    print("== SportMonks fixture", SM_FIXTURE)
    includes = (
        "participants;venue;referees;sidelined;predictedLineups;lineups.details.type;"
        "coaches;statistics.type;events.type;scores;state;league;formations;weatherReport"
    )
    st, body, err = sm_get(sm_token, f"/fixtures/{SM_FIXTURE}", {"include": includes})
    rec("sm.fixture", st, err)
    fx = (body or {}).get("data") if body else None
    if not fx:
        # fallback without weather/formations
        st, body, err = sm_get(
            sm_token,
            f"/fixtures/{SM_FIXTURE}",
            {"include": "participants;venue;referees;sidelined;lineups.details.type;coaches;statistics.type;events.type;scores;state;league"},
        )
        rec("sm.fixture_fallback", st, err)
        fx = (body or {}).get("data") if body else None
    if not fx:
        errors.append("SportMonks fixture se nenačetl")
        fx = {}

    home_p, away_p = sm_sides(fx)
    home_id = home_p.get("id") or SM_HOME
    away_id = away_p.get("id") or SM_AWAY
    sm_stats = sm_stats_map(fx, home_id, away_id)
    sm_ps = sm_players(fx, home_id)
    sm_ev = sm_events(fx, home_id)

    # extra SM probes (odds / xG / H2H / referee) — failure is a finding
    st, odds_body, err = sm_get(sm_token, f"/odds/pre-match/fixtures/{SM_FIXTURE}", {})
    rec("sm.odds_pre", st, err, {"n": len((odds_body or {}).get("data") or []) if isinstance(odds_body, dict) else 0})
    if st >= 400:
        st2, odds_body2, err2 = sm_get(sm_token, f"/fixtures/{SM_FIXTURE}", {"include": "odds"})
        rec("sm.odds_include", st2, err2)
        if st2 < 400:
            odds_body = odds_body2
            st = st2
    sm_odds = compact_sm_odds(odds_body) if st and st < 400 else []

    st, inplay_body, err = sm_get(sm_token, f"/odds/inplay/fixtures/{SM_FIXTURE}", {})
    rec("sm.odds_inplay", st, err)
    sm_inplay = compact_sm_odds(inplay_body) if st and st < 400 else []

    st, xg_body, err = sm_get(sm_token, f"/fixtures/{SM_FIXTURE}", {"include": "xgfixture"})
    rec("sm.xgfixture", st, err)
    sm_xg = None
    if xg_body and isinstance(xg_body.get("data"), dict):
        sm_xg = xg_body["data"].get("xgfixture") or xg_body["data"].get("xGFixture")

    st, h2h_body, err = sm_get(
        sm_token,
        f"/fixtures/head-to-head/{home_id}/{away_id}",
        {"include": "participants;scores;state"},
    )
    rec("sm.h2h", st, err)
    h2h_rows = []
    for h in (h2h_body or {}).get("data") or []:
        if h.get("state_id") != 5:
            continue
        hp, ap = sm_sides(h)
        h2h_rows.append({
            "id": h.get("id"),
            "date": h.get("starting_at"),
            "home": hp.get("name"),
            "away": ap.get("name"),
            "score": f"{sm_score(h, hp.get('id'))}-{sm_score(h, ap.get('id'))}",
        })
        if len(h2h_rows) >= 8:
            break

    ref = None
    for r in fx.get("referees") or []:
        if r.get("type_id") == 6 or not ref:
            ref = r
    sm_ref_career = None
    ref_id = (ref or {}).get("referee_id") or (ref or {}).get("id")
    if ref_id:
        st, ref_body, err = sm_get(sm_token, f"/referees/{ref_id}", {"include": "statistics"})
        rec("sm.referee", st, err)
        if ref_body and ref_body.get("data"):
            d = ref_body["data"]
            stats = d.get("statistics") or []
            sm_ref_career = {
                "id": d.get("id"),
                "name": d.get("name") or d.get("display_name"),
                "stat_rows": len(stats) if isinstance(stats, list) else 0,
            }

    coaches = []
    for c in fx.get("coaches") or []:
        coaches.append({
            "id": c.get("coach_id") or c.get("id"),
            "name": c.get("name") or (c.get("coach") or {}).get("name"),
            "team_id": c.get("participant_id") or c.get("team_id"),
            "side": "home" if (c.get("participant_id") or c.get("team_id")) == home_id else "away",
        })

    sidelined = []
    for s in fx.get("sidelined") or []:
        sidelined.append({
            "player": s.get("player_name") or (s.get("player") or {}).get("name"),
            "reason": s.get("reason") or (s.get("type") or {}).get("name"),
            "team_id": s.get("team_id") or s.get("participant_id"),
        })

    venue = fx.get("venue") or {}
    weather = fx.get("weatherreport") or fx.get("weatherReport")

    print("== TheStatsAPI discover")
    st, cov_body, err = ts_get(ts_key, "/coverage/leagues", {"search": "Chance", "per_page": 20})
    rec("ts.coverage_chance", st, err)
    if st >= 400 or not ts_data(cov_body):
        st, cov_body, err = ts_get(ts_key, "/coverage/leagues", {"search": "Czech", "per_page": 50})
        rec("ts.coverage_czech", st, err)
    coverage_rows = ts_data(cov_body) if isinstance(ts_data(cov_body), list) else []
    if not coverage_rows:
        coverage_rows = []

    st, comp_body, err = ts_get(ts_key, "/football/competitions", {"search": "Chance", "per_page": 20})
    rec("ts.competitions_chance", st, err)
    comps = ts_data(comp_body) if isinstance(ts_data(comp_body), list) else []
    if not comps:
        st, comp_body, err = ts_get(ts_key, "/football/competitions", {"country_code": "CZ", "per_page": 50})
        rec("ts.competitions_cz", st, err)
        comps = ts_data(comp_body) if isinstance(ts_data(comp_body), list) else []

    chance_comp = None
    for c in comps or []:
        name = (c.get("name") or "")
        if "chance" in name.lower() or "fortuna" in name.lower() or "czech first" in name.lower():
            chance_comp = c
            break
    if not chance_comp and comps:
        for c in comps:
            if (c.get("country_code") or "") == "CZ" and c.get("type") == "league":
                chance_comp = c
                break

    st, match_body, err = ts_get(
        ts_key,
        "/football/matches",
        {"date_from": KICKOFF_DATE, "date_to": KICKOFF_DATE, "per_page": 100, "status": "finished"},
    )
    rec("ts.matches_date", st, err)
    matches = ts_data(match_body) if isinstance(ts_data(match_body), list) else []
    ts_match = pick_ts_match(matches or [], ["sparta"], ["slavia"])

    if not ts_match and chance_comp:
        params = {"competition_id": chance_comp["id"], "date_from": KICKOFF_DATE, "date_to": KICKOFF_DATE, "per_page": 50}
        st, match_body, err = ts_get(ts_key, "/football/matches", params)
        rec("ts.matches_comp", st, err)
        matches = ts_data(match_body) if isinstance(ts_data(match_body), list) else []
        ts_match = pick_ts_match(matches or [], ["sparta"], ["slavia"])

    if not ts_match:
        st, tbody, err = ts_get(ts_key, "/football/teams", {"search": "Sparta Praha", "per_page": 10})
        rec("ts.team_sparta", st, err)
        teams = ts_data(tbody) if isinstance(ts_data(tbody), list) else []
        sparta = next((t for t in (teams or []) if "sparta" in norm_name(t.get("name") or "")), None)
        if sparta:
            st, match_body, err = ts_get(
                ts_key,
                "/football/matches",
                {"team_id": sparta["id"], "date_from": "2026-08-01", "date_to": "2026-09-15", "per_page": 50},
            )
            rec("ts.matches_sparta", st, err)
            matches = ts_data(match_body) if isinstance(ts_data(match_body), list) else []
            ts_match = pick_ts_match(matches or [], ["sparta"], ["slavia"])

    ts_id = (ts_match or {}).get("id")
    ts_home_id = ((ts_match or {}).get("home_team") or {}).get("id")
    ts_away_id = ((ts_match or {}).get("away_team") or {}).get("id")
    print("  TS match:", ts_id, (ts_match or {}).get("utc_date"))

    ts_stats_flat: dict = {}
    ts_ps: list = []
    ts_lineups = None
    ts_shotmap = []
    ts_timeline = []
    ts_ref = None
    ts_odds = []
    ts_odds_live = []
    ts_odds_players_n = 0
    ts_heatmaps = []
    ts_np_xg = None

    if ts_id:
        st, body, err = ts_get(ts_key, f"/football/matches/{ts_id}")
        rec("ts.match", st, err)
        if isinstance(ts_data(body), dict):
            ts_match = ts_data(body)

        st, body, err = ts_get(ts_key, f"/football/matches/{ts_id}/stats")
        rec("ts.stats", st, err)
        stats_obj = ts_data(body) if isinstance(ts_data(body), dict) else None
        ts_stats_flat = flatten_ts_stats(stats_obj)

        st, body, err = ts_get(ts_key, f"/football/matches/{ts_id}/player-stats")
        rec("ts.player_stats", st, err)
        ps = ts_data(body)
        ts_ps = ts_players(ps if isinstance(ps, list) else [], ts_home_id)

        st, body, err = ts_get(ts_key, f"/football/matches/{ts_id}/lineups")
        rec("ts.lineups", st, err)
        ts_lineups = ts_data(body) if isinstance(ts_data(body), dict) else None

        st, body, err = ts_get(ts_key, f"/football/matches/{ts_id}/shotmap")
        rec("ts.shotmap", st, err)
        if isinstance(body, dict):
            shots = body.get("data") if isinstance(body.get("data"), list) else ts_data(body)
            ts_np_xg = body.get("np_xg_summary")
            if isinstance(shots, list):
                ts_shotmap = []
                for sh in shots:
                    ts_shotmap.append({
                        "player": sh.get("player_name"),
                        "team_id": sh.get("team_id"),
                        "side": "home" if sh.get("team_id") == ts_home_id else "away",
                        "x": num(sh.get("x")),
                        "y": num(sh.get("y")),
                        "xg": num(sh.get("expected_goals")),
                        "minute": sh.get("minute"),
                        "result": sh.get("result"),
                        "goal": bool(sh.get("is_goal")),
                        "on_target": bool(sh.get("is_on_target")),
                        "penalty": bool(sh.get("is_penalty")),
                        "body": sh.get("body_part"),
                        "situation": sh.get("situation"),
                    })

        st, body, err = ts_get(ts_key, f"/football/matches/{ts_id}/timeline")
        rec("ts.timeline", st, err)
        tl = ts_data(body)
        events = (tl or {}).get("events") if isinstance(tl, dict) else None
        for ev in events or []:
            team = ev.get("team") or {}
            player = ev.get("player") or {}
            ts_timeline.append({
                "minute": ev.get("minute"),
                "extra": ev.get("extra_time"),
                "type": ev.get("type"),
                "player": player.get("name") if isinstance(player, dict) else player,
                "side": "home" if team.get("id") == ts_home_id else "away" if team.get("id") else None,
            })

        st, body, err = ts_get(ts_key, f"/football/matches/{ts_id}/referee")
        rec("ts.referee", st, err)
        ts_ref = ts_data(body) if isinstance(ts_data(body), dict) else None

        st, body, err = ts_get(ts_key, f"/football/matches/{ts_id}/odds")
        rec("ts.odds", st, err)
        if st < 400:
            ts_odds = compact_ts_odds(body)

        st, body, err = ts_get(ts_key, f"/football/matches/{ts_id}/odds/live")
        rec("ts.odds_live", st, err)
        if st < 400:
            ts_odds_live = compact_ts_odds(body)

        st, body, err = ts_get(ts_key, f"/v2/football/matches/{ts_id}/odds/players")
        rec("ts.odds_players", st, err)
        pdata = ts_data(body)
        if isinstance(pdata, dict):
            ts_odds_players_n = len(pdata.get("players") or pdata.get("bookmakers") or [])
        elif isinstance(pdata, list):
            ts_odds_players_n = len(pdata)

        for hp in pick_heatmap_players(ts_ps):
            st, body, err = ts_get(ts_key, f"/football/matches/{ts_id}/players/{hp['id']}/heatmap")
            rec(f"ts.heatmap.{hp['side']}", st, err)
            hm = ts_data(body) if isinstance(ts_data(body), dict) else None
            points = (hm or {}).get("points") if hm else None
            ts_heatmaps.append({
                "side": hp["side"],
                "player_id": hp["id"],
                "name": hp["name"],
                "shots": hp.get("shots"),
                "ok": st == 200 and bool(points),
                "points": [{"x": num(p.get("x")), "y": num(p.get("y"))} for p in (points or [])] if st == 200 else [],
            })
    else:
        errors.append("TheStatsAPI nenašlo zápas Sparta–Slavia 30. 8. 2026 — coverage Chance Ligy?")

    # SM lineup XI compact
    def xi(side: str) -> list[dict]:
        return [
            {
                "name": p.get("name"),
                "jersey": p.get("jersey"),
                "formation_field": p.get("formation_field"),
                "minutes": p.get("minutes"),
                "goals": p.get("goals"),
            }
            for p in sm_ps
            if p.get("side") == side and p.get("starter")
        ]

    ts_xi = {"home": [], "away": []}
    if isinstance(ts_lineups, dict):
        for side in ("home", "away"):
            block = ts_lineups.get(side) or {}
            ts_xi[side] = {
                "formation": block.get("formation"),
                "xi": [
                    {"id": p.get("id"), "name": p.get("name"), "position": p.get("position"), "jersey": p.get("jersey_number")}
                    for p in (block.get("starting_xi") or [])
                ],
                "bench": len(block.get("substitutes") or block.get("bench") or []),
            }

    compare = build_compare(sm_stats, ts_stats_flat)
    players_cmp = match_players(sm_ps, ts_ps)
    summary = verdict_summary(compare)

    ts_score = ((ts_match or {}).get("score") or {}) if ts_match else {}
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "note": "TEST Lab — neprodukt. Prázdná buňka = API pole nemá, tarif to nepustí, nebo Chance Liga coverage chybí.",
        "match": {
            "date": KICKOFF_DATE,
            "kickoff_sm": fx.get("starting_at") or fx.get("starting_at_timestamp"),
            "competition_sm": (fx.get("league") or {}).get("name"),
            "venue": venue.get("name"),
            "home": {"sm_id": home_id, "ts_id": ts_home_id, "name": home_p.get("name") or "Sparta Praha"},
            "away": {"sm_id": away_id, "ts_id": ts_away_id, "name": away_p.get("name") or "SK Slavia Praha"},
            "score_sm": {"home": sm_score(fx, home_id), "away": sm_score(fx, away_id), "ht_home": sm_score(fx, home_id, "1ST_HALF"), "ht_away": sm_score(fx, away_id, "1ST_HALF")},
            "score_ts": {"home": ts_score.get("home"), "away": ts_score.get("away")},
        },
        "summary": summary,
        "endpoints": endpoints,
        "coverage_ts": [
            {
                "id": c.get("id"),
                "name": c.get("name"),
                "country": c.get("country"),
                "data_types": c.get("data_types"),
            }
            for c in (coverage_rows or [])[:12]
        ],
        "ts_competition": chance_comp,
        "compare": compare,
        "sm": {
            "fixture_id": SM_FIXTURE,
            "stats_types": len(sm_stats),
            "players": len(sm_ps),
            "events": sm_ev,
            "coaches": coaches,
            "sidelined": sidelined,
            "referee": {
                "id": ref_id,
                "name": (ref or {}).get("name") or ((ref or {}).get("referee") or {}).get("name"),
                "career": sm_ref_career,
            },
            "weather": weather,
            "xg": sm_xg,
            "odds": sm_odds,
            "odds_inplay": sm_inplay,
            "h2h": h2h_rows,
            "xi": {"home": xi("home"), "away": xi("away")},
            "formations": fx.get("formations"),
            "players_rows": [
                {k: p.get(k) for k in ("id", "name", "side", "jersey", "starter", "minutes", "goals", "assists", "shots", "sot", "fouls", "yellow", "red", "tackles", "saves", "rating", "key_passes", "passes")}
                for p in sm_ps
            ],
        },
        "ts": {
            "match_id": ts_id,
            "flags": {
                "odds_available": (ts_match or {}).get("odds_available"),
                "live_odds_available": (ts_match or {}).get("live_odds_available"),
                "xg_available": (ts_match or {}).get("xg_available"),
                "shotmap_available": (ts_match or {}).get("shotmap_available"),
                "xg_quality": (ts_match or {}).get("xg_quality"),
            } if ts_match else None,
            "managers": {
                "home": (ts_match or {}).get("home_manager"),
                "away": (ts_match or {}).get("away_manager"),
            } if ts_match else None,
            "np_xg": ts_np_xg,
            "shotmap": ts_shotmap,
            "heatmaps": ts_heatmaps,
            "timeline": ts_timeline,
            "referee": ts_ref,
            "odds": ts_odds,
            "odds_live": ts_odds_live,
            "odds_players_n": ts_odds_players_n,
            "lineups": ts_xi,
            "lineups_meta": {"confirmed": (ts_lineups or {}).get("confirmed"), "type": (ts_lineups or {}).get("type")} if ts_lineups else None,
            "players_rows": ts_ps,
        },
        "players_compare": players_cmp,
        "errors": errors,
        "calls": CALLS,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")
    print("summary", json.dumps(summary))
    print("endpoints", json.dumps({k: v.get("status") for k, v in endpoints.items()}))
    if errors:
        print("errors:", errors)


if __name__ == "__main__":
    main()
