#!/usr/bin/env python3
"""Blind backtest Trendmetru na 8. kole Chance Ligy (12.–13. 9. 2026).

1) Rozpis bez skóre.
2) Linie jen z dat před 12. 9.
3) Teprve potom skutečné statistiky a skóre (oba sloupce jako over).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_match_data import call, score_for
from catalog_team_overlay import fact_row, facts_by_team, fdr_rating, load_history, sides
from lab_trendmetr_kolo import (
    MIX_ID,
    MIX_TITLE,
    SCORE_METRICS,
    score_cell,
    team_card,
)

LEAGUE_ID = 262
SEASON_ID = 27984
ROUND_ID = 408241
ROUND_NAME = "8"
CUTOFF = "2026-09-12"
OUT = ROOT / "frontend/public/data/lab/trendmetr-kolo8.json"


def fetch_round_schedule(round_id: int) -> list[dict]:
    body = call(f"/rounds/{round_id}", {"include": "fixtures.participants"}, cache_ttl=6 * 3600)
    data = body.get("data") or {}
    fixtures = data.get("fixtures") or []
    if isinstance(fixtures, dict):
        fixtures = fixtures.get("data") or []
    rows = []
    for fx in fixtures:
        home, away = sides(fx)
        if not home or not away:
            continue
        rows.append(
            {
                "fixture_id": fx.get("id"),
                "kickoff": fx.get("starting_at"),
                "home": team_card(home),
                "away": team_card(away),
            }
        )
    rows.sort(key=lambda r: r["kickoff"] or "")
    return rows


def standings_before(history: list, season_id: int, cutoff: str) -> dict[int, dict]:
    tally: dict[int, dict] = {}

    def row(tid: int) -> dict:
        return tally.setdefault(tid, {"played": 0, "points": 0, "gf": 0, "ga": 0, "gd": 0})

    for fx in history:
        if fx.get("season_id") != season_id or fx.get("state_id") != 5:
            continue
        if (fx.get("starting_at") or "") >= cutoff:
            continue
        home, away = sides(fx)
        if not home or not away:
            continue
        hid, aid = int(home["id"]), int(away["id"])
        hg, ag = score_for(fx, hid), score_for(fx, aid)
        if hg is None or ag is None:
            continue
        for tid, gf, ga in ((hid, hg, ag), (aid, ag, hg)):
            r = row(tid)
            r["played"] += 1
            r["gf"] += gf
            r["ga"] += ga
            r["gd"] = r["gf"] - r["ga"]
            r["points"] += 3 if gf > ga else 1 if gf == ga else 0
            r["name"] = (home if tid == hid else away).get("name")
    ranked = sorted(tally.items(), key=lambda kv: (-kv[1]["points"], -kv[1]["gd"], -kv[1]["gf"], kv[0]))
    out = {}
    for i, (tid, r) in enumerate(ranked, start=1):
        out[tid] = {**r, "position": i}
    return out


def fetch_actual(fixture_id: int) -> dict:
    body = call(
        f"/fixtures/{fixture_id}",
        {"include": "participants;statistics;scores;state"},
        cache_ttl=6 * 3600,
    )
    return body.get("data") or {}


def band_safe(a: list, b: list, ratio: float):
    from lab_trendmetr_kolo import band_for, clean, max_floor, min_ceil

    if clean(a) and clean(b):
        return band_for(a, b, ratio, "and")
    if clean(a):
        return max_floor(a, ratio), min_ceil(a, ratio)
    if clean(b):
        return max_floor(b, ratio), min_ceil(b, ratio)
    return None, None


def and70_over(a: list, b: list) -> dict:
    t70, _ = band_safe(a, b, 0.70)
    if t70 is None:
        return {"display": "—", "pick": None, "picks": [], "kind": "empty", "lo": None, "hi": None, "usable": False}
    return {
        "display": f"≥{t70}",
        "pick": t70,
        "picks": [t70],
        "kind": "over",
        "lo": t70,
        "hi": t70,
        "usable": t70 >= 1,
    }


def mix_over(a: list, b: list) -> dict:
    t70, _ = band_safe(a, b, 0.70)
    t65, _ = band_safe(a, b, 0.65)
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


def pick_samples(rows: list[dict], home_id: int, away_id: int, is_home_side: bool, peer_ids: set[int]) -> tuple[list[dict], list[dict]]:
    usable = [r for r in rows if (r.get("starting_at") or "") < CUTOFF]
    if is_home_side:
        set_a = [r for r in usable if r.get("is_home")][:5]
        set_b = [r for r in usable if r.get("is_home") and (r.get("opponent") or {}).get("id") == away_id][:3]
    else:
        set_a = [r for r in usable if (not r.get("is_home")) and (r.get("opponent") or {}).get("id") in peer_ids][:3]
        set_b = [r for r in usable if (not r.get("is_home")) and (r.get("opponent") or {}).get("id") == home_id][:3]
    return set_a, set_b


def side_block(label: str, note: str, set_a: list, set_b: list, actual: dict | None) -> dict:
    from lab_trendmetr_kolo import sample_values

    metrics = []
    points = {"and70": 0, MIX_ID: 0}
    for key, name in SCORE_METRICS:
        a_vals = sample_values(set_a, key)
        b_vals = sample_values(set_b, key)
        actual_v = (actual or {}).get(key)
        and70 = and70_over(a_vals, b_vals)
        mix = mix_over(a_vals, b_vals)
        s70 = score_cell(and70, actual_v)
        sm = score_cell(mix, actual_v)
        points["and70"] += s70["points"]
        points[MIX_ID] += sm["points"]
        metrics.append(
            {
                "key": key,
                "name": name,
                "actual": actual_v,
                "methods": [
                    {"id": "and70", "title": "70 % A i B ≥", **and70, **s70},
                    {"id": MIX_ID, "title": MIX_TITLE, **mix, **sm},
                ],
            }
        )
    return {
        "label": label,
        "note": note,
        "cases": len(set_a) + len(set_b),
        "n_a": len(set_a),
        "n_b": len(set_b),
        "metrics": metrics,
        "points": points,
    }


def main() -> None:
    print("Fáze 1 — rozpis 8. kola (bez skóre a statistik)")
    schedule = fetch_round_schedule(ROUND_ID)
    for row in schedule:
        print(f"  {row['kickoff']}  {row['home']['name']} – {row['away']['name']}  ({row['fixture_id']})")
    if len(schedule) != 8:
        raise SystemExit(f"Očekávám 8 zápasů, mám {len(schedule)}")

    print("\nFáze 2 — linie z dat před", CUTOFF)
    seasons, history, start = load_history(LEAGUE_ID, SEASON_ID)
    table = standings_before(history, SEASON_ID, CUTOFF)
    size = max(len(table), 16)
    print("  tabulka před kolem:")
    for tid, row in sorted(table.items(), key=lambda kv: kv[1]["position"]):
        print(f"    {row['position']:2}. {row.get('name')}  {row['points']} b.")

    team_ids = {int(r["home"]["id"]) for r in schedule} | {int(r["away"]["id"]) for r in schedule}
    facts = facts_by_team(history, team_ids)

    drafted = []
    for row in schedule:
        hid, aid = int(row["home"]["id"]), int(row["away"]["id"])
        home_pos = (table.get(hid) or {}).get("position")
        home_weight = fdr_rating(home_pos, size, is_home=False)
        peers = {
            tid
            for tid, rec in table.items()
            if tid != aid and fdr_rating(rec.get("position"), size, is_home=False) == home_weight
        }
        home_a, home_b = pick_samples(facts.get(hid) or [], hid, aid, True, peers)
        away_a, away_b = pick_samples(facts.get(aid) or [], hid, aid, False, peers)
        home_side = side_block(
            f"{row['home']['name']} doma",
            "5 domácích v lize + 3 domácí proti soupeři (jen před 8. kolem).",
            home_a,
            home_b,
            None,
        )
        away_side = side_block(
            f"{row['away']['name']} venku",
            f"3 venku proti FDR {home_weight} + 3 na hřišti domácích (jen před 8. kolem).",
            away_a,
            away_b,
            None,
        )
        drafted.append(
            {
                **row,
                "home_fdr_away": home_weight,
                "home_position": home_pos,
                "sides": [home_side, away_side],
                "points": {"and70": 0, MIX_ID: 0},
                "score": {"home": None, "away": None},
            }
        )
        print(f"  tip {row['home']['short']}/{row['away']['short']}: A={len(home_a)}+{len(home_b)} B={len(away_a)}+{len(away_b)}  FDR venku {home_weight}")

    print("\nFáze 3 — skutečné statistiky a skóre")
    totals = {"and70": 0, MIX_ID: 0}
    stat_totals = {key: {"and70": 0, MIX_ID: 0} for key, _ in SCORE_METRICS}

    for item in drafted:
        fresh = fetch_actual(item["fixture_id"])
        hid, aid = int(item["home"]["id"]), int(item["away"]["id"])
        home_act = fact_row(fresh, hid) or {}
        away_act = fact_row(fresh, aid) or {}
        item["score"] = {"home": home_act.get("gf"), "away": away_act.get("gf")}
        for side, actual in zip(item["sides"], (home_act, away_act)):
            side["points"] = {"and70": 0, MIX_ID: 0}
            for metric in side["metrics"]:
                actual_v = actual.get(metric["key"])
                metric["actual"] = actual_v
                for est in metric["methods"]:
                    scored = score_cell(est, actual_v)
                    est.update(scored)
                    side["points"][est["id"]] += scored["points"]
                    totals[est["id"]] += scored["points"]
                    stat_totals[metric["key"]][est["id"]] += scored["points"]
        item["points"] = {
            "and70": item["sides"][0]["points"]["and70"] + item["sides"][1]["points"]["and70"],
            MIX_ID: item["sides"][0]["points"][MIX_ID] + item["sides"][1]["points"][MIX_ID],
        }
        print(
            f"  {item['home']['name']} {item['score']['home']}:{item['score']['away']} {item['away']['name']}"
            f"  70%={item['points']['and70']}  Mix={item['points'][MIX_ID]}"
        )

    methods = [
        {"id": "and70", "title": "70 % A i B ≥", "points": totals["and70"], "scoring": "over"},
        {"id": MIX_ID, "title": MIX_TITLE, "points": totals[MIX_ID], "scoring": "over"},
    ]
    winner_pts = max(totals.values())
    winners = [m for m in methods if m["points"] == winner_pts]
    stats = [
        {
            "key": key,
            "name": name,
            "points": stat_totals[key],
            "total": sum(stat_totals[key].values()),
        }
        for key, name in SCORE_METRICS
    ]
    best_stat = max(stats, key=lambda r: r["total"]) if stats else None

    payload = {
        "id": "trendmetr-kolo8",
        "title": "Trendmetr",
        "subtitle": "8. kolo Chance Ligy · 70 % A i B vs Mix ≥",
        "league": "Chance Liga",
        "league_id": LEAGUE_ID,
        "round": ROUND_NAME,
        "round_id": ROUND_ID,
        "day": "2026-09-12",
        "cutoff": CUTOFF,
        "rule": "Oba sloupce jsou over. 70 % A i B = podlaha T. Mix = totéž T, +1 jen když 65 % A i B ještě drží. Vzorky jen ze zápasů před 12. 9. 2026. Zelená = skutečnost ≥ tip, žlutá = o 1 pod, červená = míň. Fauly zatím zůstávají.",
        "excluded_note": "Slepé kolo: rozpis nejdřív, statistiky až po spočtení linií. Tabulka FDR je stav před 8. kolem.",
        "computed_at": "2026-09-21",
        "history_from": start.isoformat(),
        "metrics": [{"key": k, "name": n} for k, n in SCORE_METRICS],
        "methods": methods,
        "winners": winners,
        "stats": stats,
        "best_stat": {"key": best_stat["key"], "name": best_stat["name"], "total": best_stat["total"]} if best_stat else None,
        "matches": drafted,
        "table_before": [
            {"id": tid, "position": r["position"], "name": r.get("name"), "points": r["points"]}
            for tid, r in sorted(table.items(), key=lambda kv: kv[1]["position"])
        ],
        "seasons": [{"id": s.get("id"), "name": s.get("name")} for s in seasons],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nzapsáno {OUT}")
    print("součet 70% A i B:", totals["and70"], " Mix:", totals[MIX_ID], " max 240")
    print("vítěz:", ", ".join(w["title"] for w in winners))
    for s in stats:
        print(f"  {s['name']}: 70%={s['points']['and70']} Mix={s['points'][MIX_ID]}")


if __name__ == "__main__":
    main()
