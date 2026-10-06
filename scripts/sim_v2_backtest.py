#!/usr/bin/env python3
"""Walk-forward test obou modelů na dohraných zápasech Chance Ligy 2026/2027.

U každého zápasu se berou jen ligové zápasy s dřívějším datem. Výsledek
samotného zápasu do výpočtu nevstupuje.
"""

from __future__ import annotations

import json
import math
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from ingest_pitchapi import ROOT, load_sm, map_team  # noqa: E402
from sim_v2 import (  # noqa: E402
    P,
    SIM_OUT,
    attach_xg,
    dixon_coles,
    lambdas_opp,
    league_mu,
    load_league,
    load_pitch_xg,
    markets,
    shrink,
    splits,
    team_block,
)

OUT = ROOT / "scripts/.cache/sim-v2-backtest.json"


def rest_league(history: list[dict], pid: str, kick: str) -> int | None:
    prev = [m["date"] for m in history if m["home"] == pid or m["away"] == pid]
    if not prev:
        return None
    return (date.fromisoformat(kick) - date.fromisoformat(max(prev))).days


def outcome(hg: int, ag: int) -> str:
    if hg > ag:
        return "home"
    if hg == ag:
        return "draw"
    return "away"


def predict_v2(m: dict, history: list[dict], prev_all: list[dict], prev_splits: dict, mu_prev: tuple, xg_lookup: dict, pitch_to_sm: dict) -> dict:
    cutoff = m["date"]
    cur_splits = splits(history)
    mu_cur = league_mu(history)
    mu_h = shrink(mu_cur[0], mu_prev[0], mu_cur[2], P["k_league"])
    mu_a = shrink(mu_cur[1], mu_prev[1], mu_cur[2], P["k_league"])
    sm_h, sm_a = pitch_to_sm[m["home"]], pitch_to_sm[m["away"]]
    rest_h = rest_league(history, m["home"], cutoff)
    rest_a = rest_league(history, m["away"], cutoff)
    home = team_block(m["home"], sm_h, "home", cur_splits, prev_splits, prev_all, xg_lookup, cutoff, rest_h)
    away = team_block(m["away"], sm_a, "away", cur_splits, prev_splits, prev_all, xg_lookup, cutoff, rest_a)
    lh = max(0.3, min(4.0, home["att"] * away["def"] / mu_h))
    la = max(0.3, min(4.0, away["att"] * home["def"] / mu_a))
    out = markets(dixon_coles(lh, la, P["rho"], P["max_goals"]))
    out["expected_goals"] = {"home": round(lh, 2), "away": round(la, 2)}
    return out


def predict_opp(m: dict, history: list[dict], prev_all: list[dict], league: set[str] | None = None) -> dict:
    rest_h = rest_league(history, m["home"], m["date"])
    rest_a = rest_league(history, m["away"], m["date"])
    lh, la, _ = lambdas_opp(m["home"], m["away"], history, prev_all, rest_h, rest_a, league)
    out = markets(dixon_coles(lh, la, P["rho"], P["max_goals"]))
    out["expected_goals"] = {"home": round(lh, 2), "away": round(la, 2)}
    return out


def score_row(pred: dict, y: str, hg: int, ag: int) -> dict:
    p = {"home": pred["home_win_pct"] / 100, "draw": pred["draw_pct"] / 100, "away": pred["away_win_pct"] / 100}
    py = max(p[y], 1e-9)
    brier = sum((p[k] - (1.0 if k == y else 0.0)) ** 2 for k in p)
    fav = max(p, key=p.get)
    lam_h, lam_a = pred["expected_goals"]["home"], pred["expected_goals"]["away"]
    return {
        "logloss": -math.log(py),
        "brier": brier,
        "hit": fav == y,
        "p_y": py,
        "mae_goals": (abs(lam_h - hg) + abs(lam_a - ag)) / 2,
    }


def aggregate(rows: list[dict], key: str) -> dict:
    n = len(rows)
    s = [r[key] for r in rows]
    return {
        "n": n,
        "logloss": round(sum(x["logloss"] for x in s) / n, 4),
        "brier": round(sum(x["brier"] for x in s) / n, 4),
        "accuracy": round(100 * sum(x["hit"] for x in s) / n, 1),
        "mae_goals": round(sum(x["mae_goals"] for x in s) / n, 3),
        "avg_p_actual": round(100 * sum(x["p_y"] for x in s) / n, 1),
    }


def main() -> None:
    teams_sm, _, _ = load_sm()
    cur_all = load_league("league-matches.json")
    prev_all = load_league("league-matches-2025-2026.json")
    pitch_by_sm: dict[int, str] = {}
    for m in cur_all:
        for pid, name in ((m["home"], m["home_name"]), (m["away"], m["away_name"])):
            sm = map_team(name, teams_sm)
            if sm:
                pitch_by_sm[sm["id"]] = pid
    pitch_to_sm = {v: k for k, v in pitch_by_sm.items()}
    skip = [m for m in cur_all if m["home"] not in pitch_to_sm or m["away"] not in pitch_to_sm]
    games = [m for m in cur_all if m["home"] in pitch_to_sm and m["away"] in pitch_to_sm]
    prev_splits = splits(prev_all)
    mu_prev = league_mu(prev_all)
    xg_lookup = load_pitch_xg(list(pitch_by_sm))
    attach_xg(games, xg_lookup, pitch_to_sm)

    rows = []
    for i, m in enumerate(games, 1):
        history = [x for x in games if x["date"] < m["date"]]
        v2 = predict_v2(m, history, prev_all, prev_splits, mu_prev, xg_lookup, pitch_to_sm)
        opp = predict_opp(m, history, prev_all, set(pitch_to_sm))
        y = outcome(m["hg"], m["ag"])
        rec = {
            "id": m["id"],
            "date": m["date"],
            "home": m["home_name"],
            "away": m["away_name"],
            "score": f"{m['hg']}-{m['ag']}",
            "y": y,
            "n_before": len(history),
            "v2": {**{k: v2[k] for k in ("home_win_pct", "draw_pct", "away_win_pct")}, "xg": v2["expected_goals"]},
            "opp": {**{k: opp[k] for k in ("home_win_pct", "draw_pct", "away_win_pct")}, "xg": opp["expected_goals"]},
            "s_v2": score_row(v2, y, m["hg"], m["ag"]),
            "s_opp": score_row(opp, y, m["hg"], m["ag"]),
        }
        rows.append(rec)
        if i % 10 == 0 or i == len(games):
            print(f"  {i}/{len(games)} {m['date']} {m['home_name']}–{m['away_name']} {m['hg']}:{m['ag']}", flush=True)

    halves = [
        ("všechna kola", rows),
        ("první 4 kola (málo dat)", [r for r in rows if r["n_before"] < 32]),
        ("od 5. kola dál", [r for r in rows if r["n_before"] >= 32]),
    ]
    summary = {}
    for label, subset in halves:
        if not subset:
            continue
        summary[label] = {"v2": aggregate(subset, "s_v2"), "opp": aggregate(subset, "s_opp")}

    actual = defaultdict(int)
    for r in rows:
        actual[r["y"]] += 1
    n = len(rows)
    naive_p = {k: actual[k] / n for k in ("home", "draw", "away")}
    naive_ll = -sum(math.log(naive_p[r["y"]]) for r in rows) / n

    payload = {
        "season": "2026/2027",
        "league": "Chance Liga",
        "n": n,
        "skipped": len(skip),
        "walk_forward": "jen zápasy s dřívějším datem, výsledek zápasu do modelu nevstupuje",
        "naive_logloss_frequency": round(naive_ll, 4),
        "actual_1x2": {k: round(100 * actual[k] / n, 1) for k in ("home", "draw", "away")},
        "summary": summary,
        "matches": rows,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"n={n} skip={len(skip)} naive_ll={naive_ll:.4f}")
    for label, block in summary.items():
        print(f"{label}: v2 {block['v2']} | opp {block['opp']}")
    print(f"→ {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
