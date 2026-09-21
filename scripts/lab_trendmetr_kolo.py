#!/usr/bin/env python3
"""Trendmetr pro včerejší kolo Chance Ligy: 3 metody, odhad vs skutečnost."""

from __future__ import annotations

import json
import math
import sys
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_match_data import call
from catalog_team_overlay import fact_row, facts_by_team, fdr_rating, load_history, sides
from enrich_catalog import parse_standings

SHORTS = {}
for _p in (ROOT / "frontend/public/data/catalog/teams").glob("*.json"):
    try:
        _t = json.loads(_p.read_text(encoding="utf-8"))
        if _t.get("id") and _t.get("short"):
            SHORTS[int(_t["id"])] = _t["short"]
    except (OSError, json.JSONDecodeError):
        pass

LEAGUE_ID = 262
SEASON_ID = 27984
DAY = date(2026, 9, 20)
OUT = ROOT / "frontend/public/data/lab/trendmetr-kolo.json"

SCORE_METRICS = (
    ("shots", "Střely"),
    ("sot", "Střely na branku"),
    ("corners", "Rohy"),
    ("fouls", "Fauly"),
    ("offsides", "Ofsajdy"),
)

METHODS = (
    ("and70", "70 % A i B", 0.70, "and"),
    ("pool70", "70 % z (A+B)", 0.70, "pool"),
    ("and65", "65 % A i B", 0.65, "and"),
)
MIX_ID = "mix"
MIX_TITLE = "Mix ≥"


def need_hits(n: int, ratio: float) -> int:
    return math.ceil(ratio * n - 1e-9) if n else 0


def clean(values: list) -> list[int]:
    return [int(v) for v in values if v is not None]


def max_floor(values: list, ratio: float) -> int | None:
    vals = clean(values)
    if not vals:
        return None
    need = need_hits(len(vals), ratio)
    ordered = sorted(vals)
    return ordered[len(vals) - need]


def min_ceil(values: list, ratio: float) -> int | None:
    vals = clean(values)
    if not vals:
        return None
    need = need_hits(len(vals), ratio)
    return sorted(vals)[need - 1]


def band_for(a: list, b: list, ratio: float, mode: str) -> tuple[int | None, int | None]:
    if mode == "pool":
        both = list(a) + list(b)
        return max_floor(both, ratio), min_ceil(both, ratio)
    lo_a, lo_b = max_floor(a, ratio), max_floor(b, ratio)
    hi_a, hi_b = min_ceil(a, ratio), min_ceil(b, ratio)
    if None in (lo_a, lo_b, hi_a, hi_b):
        return None, None
    return min(lo_a, lo_b), max(hi_a, hi_b)


def median_int(vals: list[int]) -> int:
    ordered = sorted(vals)
    n = len(ordered)
    if n % 2:
        return ordered[n // 2]
    return int(math.floor((ordered[n // 2 - 1] + ordered[n // 2]) / 2 + 0.5))


def estimate(values: list, lo: int | None, hi: int | None) -> dict:
    if lo is None or hi is None:
        return {"display": "—", "pick": None, "picks": [], "kind": "empty", "lo": lo, "hi": hi}
    if lo > hi:
        lo, hi = hi, lo
    band = [v for v in clean(values) if lo <= v <= hi]
    if lo == hi:
        return {"display": str(lo), "pick": lo, "picks": [lo], "kind": "point", "lo": lo, "hi": hi}
    if not band:
        mid = int(math.floor((lo + hi) / 2 + 0.5))
        return {"display": f"{lo}–{hi}", "pick": mid, "picks": [mid], "kind": "range", "lo": lo, "hi": hi}
    counts = Counter(band)
    top = max(counts.values())
    modes = sorted(k for k, n in counts.items() if n == top)
    if len(modes) == 1:
        return {"display": str(modes[0]), "pick": modes[0], "picks": modes, "kind": "mode", "lo": lo, "hi": hi}
    if len(modes) == 2:
        return {
            "display": f"{modes[0]} nebo {modes[1]}",
            "pick": None,
            "picks": modes,
            "kind": "bimodal",
            "lo": lo,
            "hi": hi,
        }
    pick = median_int(band)
    return {"display": f"{lo}–{hi}", "pick": pick, "picks": [pick], "kind": "range", "lo": lo, "hi": hi}


def score_cell(est: dict, actual: int | None) -> dict:
    if actual is None or est["kind"] == "empty":
        return {"diff": None, "points": 0, "tone": "none"}
    if est["kind"] == "over":
        pick = est["pick"]
        if pick is None:
            return {"diff": None, "points": 0, "tone": "none"}
        if actual >= pick:
            return {"diff": actual - pick, "points": 3, "tone": "hit"}
        gap = pick - actual
        if gap == 1:
            return {"diff": -1, "points": 1, "tone": "close"}
        return {"diff": -gap, "points": 0, "tone": "miss"}
    if est["kind"] == "bimodal":
        diff = min(abs(actual - p) for p in est["picks"])
    else:
        pick = est["pick"]
        if pick is None:
            return {"diff": None, "points": 0, "tone": "none"}
        diff = abs(actual - pick)
    if diff == 0:
        points, tone = 3, "hit"
    elif diff == 1:
        points, tone = 1, "close"
    else:
        points, tone = 0, "miss"
    return {"diff": diff, "points": points, "tone": tone}


def mix_estimate(a: list, b: list) -> dict:
    """70 % A∧B jako podlaha, +1 jen když 65 % A∧B pořád drží."""
    t70, _ = band_for(a, b, 0.70, "and")
    t65, _ = band_for(a, b, 0.65, "and")
    if t70 is None:
        return {"display": "—", "pick": None, "picks": [], "kind": "empty", "lo": None, "hi": None, "usable": False}
    tip = t70
    if t65 is not None and t65 > t70:
        tip = min(t70 + 1, t65)
    return {
        "display": f"≥{tip}",
        "pick": tip,
        "picks": [tip],
        "kind": "over",
        "lo": t70,
        "hi": t65,
        "usable": tip >= 1,
    }


def team_card(part: dict | None) -> dict:
    part = part or {}
    tid = part.get("id")
    name = part.get("name") or "?"
    words = [w for w in name.replace(".", "").split() if w.lower() not in {"fc", "fk", "sk", "ac", "mfk"}]
    short = SHORTS.get(int(tid) if tid else 0) or (
        "".join(w[0] for w in words)[:3].upper() if words else name[:3].upper()
    )
    return {
        "id": tid,
        "name": name,
        "short": short,
        "image": part.get("image_path"),
    }


def fetch_actual_fx(fixture_id: int) -> dict:
    body = call(
        f"/fixtures/{fixture_id}",
        {"include": "participants;statistics;scores;state"},
        cache_ttl=6 * 3600,
    )
    return body.get("data") or {}


def sample_values(rows: list[dict], key: str) -> list:
    return [r.get(key) for r in rows]


def pick_samples(rows: list[dict], fixture_id: int, home_id: int, away_id: int, is_home_side: bool, peer_ids: set[int]) -> tuple[list[dict], list[dict]]:
    usable = [r for r in rows if r.get("fixture_id") != fixture_id]
    if is_home_side:
        set_a = [r for r in usable if r.get("is_home")][:5]
        set_b = [r for r in usable if r.get("is_home") and (r.get("opponent") or {}).get("id") == away_id][:3]
    else:
        set_a = [r for r in usable if (not r.get("is_home")) and (r.get("opponent") or {}).get("id") in peer_ids][:3]
        set_b = [r for r in usable if (not r.get("is_home")) and (r.get("opponent") or {}).get("id") == home_id][:3]
    return set_a, set_b


def side_payload(label: str, note: str, set_a: list[dict], set_b: list[dict], actual: dict) -> dict:
    metrics = []
    method_points = {mid: 0 for mid, *_ in METHODS}
    method_points[MIX_ID] = 0
    for key, name in SCORE_METRICS:
        a_vals = sample_values(set_a, key)
        b_vals = sample_values(set_b, key)
        combined = a_vals + b_vals
        actual_v = actual.get(key)
        methods = []
        for mid, title, ratio, mode in METHODS:
            lo, hi = band_for(a_vals, b_vals, ratio, mode)
            est = estimate(combined, lo, hi)
            scored = score_cell(est, actual_v)
            method_points[mid] += scored["points"]
            methods.append(
                {
                    "id": mid,
                    "title": title,
                    **est,
                    **scored,
                }
            )
        mix = mix_estimate(a_vals, b_vals)
        mix_scored = score_cell(mix, actual_v)
        method_points[MIX_ID] += mix_scored["points"]
        methods.append({"id": MIX_ID, "title": MIX_TITLE, **mix, **mix_scored})
        metrics.append(
            {
                "key": key,
                "name": name,
                "actual": actual_v,
                "methods": methods,
            }
        )
    return {
        "label": label,
        "note": note,
        "cases": len(set_a) + len(set_b),
        "n_a": len(set_a),
        "n_b": len(set_b),
        "metrics": metrics,
        "points": method_points,
    }


def main() -> None:
    print("Trendmetr kolo: načítám historii Chance Ligy…")
    seasons, history, start = load_history(LEAGUE_ID, SEASON_ID)
    table = parse_standings(SEASON_ID)
    size = max(len(table), 16)

    day_fx = []
    for fx in history:
        when = (fx.get("starting_at") or "")[:10]
        if when != DAY.isoformat() or fx.get("state_id") != 5:
            continue
        home, away = sides(fx)
        if home and away:
            day_fx.append(fx)
    day_fx.sort(key=lambda fx: fx.get("starting_at") or "")
    print(f"  {len(day_fx)} dohraných zápasů {DAY.isoformat()}")

    team_ids = set()
    for fx in day_fx:
        home, away = sides(fx)
        team_ids.add(int(home["id"]))
        team_ids.add(int(away["id"]))
    facts = facts_by_team(history, team_ids)

    matches = []
    totals = {mid: 0 for mid, *_ in METHODS}
    totals[MIX_ID] = 0
    stat_totals = {key: {mid: 0 for mid, *_ in METHODS} | {MIX_ID: 0} for key, _ in SCORE_METRICS}

    for fx in day_fx:
        home, away = sides(fx)
        hid, aid = int(home["id"]), int(away["id"])
        fid = fx.get("id")
        home_pos = (table.get(hid) or {}).get("position")
        home_weight = fdr_rating(home_pos, size, is_home=False)
        peers = {
            tid
            for tid, row in table.items()
            if tid != aid and fdr_rating(row.get("position"), size, is_home=False) == home_weight
        }
        fresh = fetch_actual_fx(fid)
        actual_fx = fresh if fresh.get("statistics") else fx
        home_actual = fact_row(actual_fx, hid) or {}
        away_actual = fact_row(actual_fx, aid) or {}
        home_a, home_b = pick_samples(facts.get(hid) or [], fid, hid, aid, True, peers)
        away_a, away_b = pick_samples(facts.get(aid) or [], fid, hid, aid, False, peers)

        home_side = side_payload(
            f"{home.get('name')} doma",
            "5 domácích v lize + 3 domácí proti soupeři.",
            home_a,
            home_b,
            home_actual,
        )
        away_side = side_payload(
            f"{away.get('name')} venku",
            f"3 venku proti FDR {home_weight} + 3 na hřišti domácích.",
            away_a,
            away_b,
            away_actual,
        )
        points = {
            mid: home_side["points"][mid] + away_side["points"][mid]
            for mid in [m[0] for m in METHODS] + [MIX_ID]
        }
        for mid in totals:
            totals[mid] += points[mid]
        for side in (home_side, away_side):
            for metric in side["metrics"]:
                for method in metric["methods"]:
                    stat_totals[metric["key"]][method["id"]] += method["points"]

        matches.append(
            {
                "fixture_id": fid,
                "date": DAY.isoformat(),
                "kickoff": fx.get("starting_at"),
                "home": team_card(home),
                "away": team_card(away),
                "score": {"home": home_actual.get("gf"), "away": away_actual.get("gf")},
                "home_fdr_away": home_weight,
                "home_position": home_pos,
                "sides": [home_side, away_side],
                "points": points,
            }
        )
        print(f"  {home.get('name')} {home_actual.get('gf')}:{away_actual.get('gf')} {away.get('name')}  body {points}")

    method_rows = []
    for mid, title, *_ in METHODS:
        method_rows.append({"id": mid, "title": title, "points": totals[mid], "scoring": "exact"})
    method_rows.append({"id": MIX_ID, "title": MIX_TITLE, "points": totals[MIX_ID], "scoring": "over"})
    exact_rows = [m for m in method_rows if m["scoring"] == "exact"]
    best_points = max(m["points"] for m in exact_rows) if exact_rows else 0
    winners = [m for m in exact_rows if m["points"] == best_points]

    exact_ids = [m[0] for m in METHODS]
    stat_rows = []
    for key, name in SCORE_METRICS:
        pts = stat_totals[key]
        stat_rows.append(
            {
                "key": key,
                "name": name,
                "points": pts,
                "total": sum(pts[i] for i in exact_ids),
            }
        )
    best_stat = max(stat_rows, key=lambda r: r["total"]) if stat_rows else None

    payload = {
        "id": "trendmetr-kolo",
        "title": "Trendmetr",
        "subtitle": "Včerejší Chance Liga · odhad vs skutečnost",
        "league": "Chance Liga",
        "league_id": LEAGUE_ID,
        "day": DAY.isoformat(),
        "rule": "První tři sloupce: modus v pásmu, přesně = 3 b., ±1 = 1 b. Mix ≥: podlaha 70 % A i B, +1 když 65 % A i B ještě drží. Zelená = skutečnost ≥ tip (over), žlutá = o 1 pod, červená = míň.",
        "excluded_note": "Hodnocený zápas není ve svých vzorcích.",
        "computed_at": date.today().isoformat(),
        "history_from": start.isoformat(),
        "metrics": [{"key": k, "name": n} for k, n in SCORE_METRICS],
        "methods": method_rows,
        "winners": winners,
        "stats": stat_rows,
        "best_stat": {"key": best_stat["key"], "name": best_stat["name"], "total": best_stat["total"]} if best_stat else None,
        "matches": matches,
        "seasons": [{"id": s.get("id"), "name": s.get("name")} for s in seasons],
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"zapsáno {OUT}")
    print("metody:", {m["title"]: m["points"] for m in method_rows})
    print("statistiky:", {s["name"]: s["total"] for s in stat_rows})
    print("vítěz:", ", ".join(w["title"] for w in winners), f"({best_points} b.)")


if __name__ == "__main__":
    main()
