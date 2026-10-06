#!/usr/bin/env python3
"""Walk-forward test modelů na dvou sezonách Chance Ligy (2025/26 a 2026/27).

Pro každý zápas se použijí jen ligové zápasy s dřívějším datem + loňská sezona jako prior.
Porovnává se se skutečným výsledkem a skutečnými střelami / střelami na branku / rohy.

Modely:
  base = model bez síly soupeřů (venue splity + xG regrese, jako v2)
  opp  = Maher se silou soupeřů (góly + xG)
Střely/SOT/rohy: base (jednoduchý), opp (Maher), a dvě referenční čáry:
  league = ligový průměr doma/venku, prior = jen loňská sezona.

Výstup jde do scripts/.cache/sim-backtest-full.json (mimo git).
"""

from __future__ import annotations

import json
import math
import os
import sys
from collections import defaultdict
import multiprocessing as mp
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from ingest_pitchapi import CACHE, ROOT, stat_num  # noqa: E402
from sim_v2 import (  # noqa: E402
    P,
    bottom_ids,
    attach_pitch_stats as attach_stats,
    calibrate_markets,
    dixon_coles,
    lambdas_opp,
    league_metric_mu,
    load_league,
    markets,
    shrink,
    splits,
    team_block,
    volume_simple,
    VOL_DEFAULT_MU,
    VOL_UNTUNED,
)
from sim_v2_backtest import outcome, rest_league, score_row  # noqa: E402

OUT = ROOT / "scripts/.cache/sim-backtest-full.json"

SEASONS = [
    ("2025/26", "league-matches-2025-2026.json", "league-matches-2024-2025.json"),
    ("2026/27", "league-matches.json", "league-matches-2025-2026.json"),
]
VOLUME = (
    ("shots", "hshots", "ashots"),
    ("sot", "hsot", "asot"),
    ("corners", "hcorners", "acorners"),
)

CTX: dict = {}
VOL_BY_METRIC: dict[str, dict] = {}


def xg_lookup_for(matches: list[dict]) -> dict:
    out: dict[str, dict] = {}
    for m in matches:
        if m.get("hxg") is None or m.get("axg") is None:
            continue
        out[m["id"]] = {
            m["home"]: {"xg": float(m["hxg"]), "gf": m["hg"], "ga": m["ag"], "date": m["date"]},
            m["away"]: {"xg": float(m["axg"]), "gf": m["ag"], "ga": m["hg"], "date": m["date"]},
        }
    return out


def predict_one(args: tuple[int, int]) -> dict:
    si, i = args
    s = CTX["seasons"][si]
    games, prev, league = s["games"], s["prev"], s["league"]
    m = games[i]
    history = [x for x in games if x["date"] < m["date"]]
    rest_h, rest_a = rest_league(history, m["home"], m["date"]), rest_league(history, m["away"], m["date"])

    # --- góly: base (v2) ---
    cur_sp = splits(history)
    mu_cur = (
        (sum(x["hg"] for x in history) / len(history), sum(x["ag"] for x in history) / len(history), len(history))
        if history
        else (1.4, 1.15, 0)
    )
    mu_prev = s["mu_prev"]
    mu_h = shrink(mu_cur[0], mu_prev[0], mu_cur[2], P["k_league"])
    mu_a = shrink(mu_cur[1], mu_prev[1], mu_cur[2], P["k_league"])
    hb = team_block(m["home"], m["home"], "home", cur_sp, s["prev_splits"], prev, s["xg_lookup"], m["date"], rest_h)
    ab = team_block(m["away"], m["away"], "away", cur_sp, s["prev_splits"], prev, s["xg_lookup"], m["date"], rest_a)
    lh = max(0.3, min(4.0, hb["steps"]["final"]["att"] * ab["steps"]["final"]["def"] / mu_h))
    la = max(0.3, min(4.0, ab["steps"]["final"]["att"] * hb["steps"]["final"]["def"] / mu_a))
    base = markets(dixon_coles(lh, la, P["rho"], P["max_goals"]))
    base["expected_goals"] = {"home": lh, "away": la}

    # --- góly: opp ---
    lho, lao, _ = lambdas_opp(m["home"], m["away"], history, prev, rest_h, rest_a, league, m["date"])
    opp = markets(dixon_coles(lho, lao, P["rho"], P["max_goals"]))
    opp["expected_goals"] = {"home": lho, "away": lao}

    y = outcome(m["hg"], m["ag"])
    row = {
        "season": s["label"],
        "id": m["id"],
        "date": m["date"],
        "home": m["home_name"],
        "away": m["away_name"],
        "hg": m["hg"],
        "ag": m["ag"],
        "y": y,
        "n_before": len(history),
        "base": {k: base[k] for k in ("home_win_pct", "draw_pct", "away_win_pct", "over15_pct", "over25_pct", "over35_pct", "btts_pct")},
        "opp": {k: opp[k] for k in ("home_win_pct", "draw_pct", "away_win_pct", "over15_pct", "over25_pct", "over35_pct", "btts_pct")},
        "lam_base": [lh, la],
        "lam_opp": [lho, lao],
        "opp_cal": {k: v for k, v in calibrate_markets(opp).items() if k in ("over15_pct", "over25_pct", "over35_pct", "btts_pct")},
        "s_base": score_row(base, y, m["hg"], m["ag"]),
        "s_opp": score_row(opp, y, m["hg"], m["ag"]),
    }

    # --- střely / SOT / rohy ---
    vol: dict[str, dict] = {}
    for name, hk, ak in VOLUME:
        if m.get(hk) is None or m.get(ak) is None:
            continue
        dmu = VOL_DEFAULT_MU[name]
        mh, ma = volume_simple(m["home"], m["away"], history, prev, hk, ak, dmu)
        uh, ua = volume_simple(m["home"], m["away"], history, prev, hk, ak, dmu, VOL_UNTUNED)
        ph, pa = volume_simple(m["home"], m["away"], [], prev, hk, ak, dmu)
        mu_p = league_metric_mu(prev, hk, ak) if prev else dmu
        mu_c = league_metric_mu(history, hk, ak)
        n_c = sum(1 for x in history if x.get(hk) is not None and x.get(ak) is not None)
        vol[name] = {
            "actual": [m[hk], m[ak]],
            "model": [mh, ma],
            "untuned": [uh, ua],
            "league": [shrink(mu_c[0], mu_p[0], n_c, P["k_league"]), shrink(mu_c[1], mu_p[1], n_c, P["k_league"])],
            "prior": [ph, pa],
        }
    row["vol"] = vol
    return row


def prep_season(label: str, cur_name: str, prev_name: str) -> dict:
    cur_all, prev_all = load_league(cur_name), load_league(prev_name)
    attach_stats(cur_all)
    attach_stats(prev_all)
    return {
        "label": label,
        "games": cur_all,
        "prev": prev_all,
        "league": {m["home"] for m in cur_all} | {m["away"] for m in cur_all},
        "prev_splits": splits(prev_all),
        "mu_prev": (
            sum(m["hg"] for m in prev_all) / len(prev_all),
            sum(m["ag"] for m in prev_all) / len(prev_all),
            len(prev_all),
        ),
        "xg_lookup": xg_lookup_for(cur_all),
    }


def agg_1x2(rows: list[dict], key: str) -> dict:
    n = len(rows)
    sc = [r[key] for r in rows]
    return {
        "n": n,
        "logloss": round(sum(x["logloss"] for x in sc) / n, 4),
        "brier": round(sum(x["brier"] for x in sc) / n, 4),
        "accuracy": round(100 * sum(x["hit"] for x in sc) / n, 1),
        "mae_goals": round(sum(x["mae_goals"] for x in sc) / n, 3),
    }


def bin_scores(rows: list[dict], model: str, field: str, truth) -> dict:
    ll = br = 0.0
    for r in rows:
        p = min(max(r[model][field] / 100, 1e-6), 1 - 1e-6)
        t = 1.0 if truth(r) else 0.0
        ll += -(t * math.log(p) + (1 - t) * math.log(1 - p))
        br += (p - t) ** 2
    return {"logloss": round(ll / len(rows), 4), "brier": round(br / len(rows), 4)}


def agg_volume(rows: list[dict], metric: str) -> dict:
    out: dict[str, dict] = {}
    items = [r["vol"][metric] for r in rows if metric in r["vol"]]
    if not items:
        return out
    for model in ("model", "untuned", "league", "prior"):
        errs, tot_errs = [], []
        for it in items:
            for side in (0, 1):
                errs.append(it[model][side] - it["actual"][side])
            tot_errs.append(sum(it[model]) - sum(it["actual"]))
        n = len(errs)
        out[model] = {
            "n": len(items),
            "mae": round(sum(abs(e) for e in errs) / n, 3),
            "rmse": round(math.sqrt(sum(e * e for e in errs) / n), 3),
            "bias": round(sum(errs) / n, 3),
            "mae_total": round(sum(abs(e) for e in tot_errs) / len(tot_errs), 3),
        }
    return out


def summarize(rows: list[dict]) -> dict:
    return {
        "n": len(rows),
        "1x2": {"base": agg_1x2(rows, "s_base"), "opp": agg_1x2(rows, "s_opp")},
        "over25": {m: bin_scores(rows, m, "over25_pct", lambda r: r["hg"] + r["ag"] > 2) for m in ("base", "opp", "opp_cal")},
        "btts": {m: bin_scores(rows, m, "btts_pct", lambda r: r["hg"] > 0 and r["ag"] > 0) for m in ("base", "opp", "opp_cal")},
        "volume": {name: agg_volume(rows, name) for name, _, _ in VOLUME},
        "goals_bias": {
            "base": round(sum(r["lam_base"][0] + r["lam_base"][1] - r["hg"] - r["ag"] for r in rows) / len(rows), 3),
            "opp": round(sum(r["lam_opp"][0] + r["lam_opp"][1] - r["hg"] - r["ag"] for r in rows) / len(rows), 3),
        },
    }


def main() -> None:
    CTX["seasons"] = [prep_season(*s) for s in SEASONS]
    jobs = [(si, i) for si, s in enumerate(CTX["seasons"]) for i in range(len(s["games"]))]
    print(f"zápasů celkem {len(jobs)}", [(s["label"], len(s["games"]), len(s["prev"])) for s in CTX["seasons"]], flush=True)
    with mp.get_context("fork").Pool(os.cpu_count() or 4) as pool:
        rows = []
        for k, r in enumerate(pool.imap(predict_one, jobs, chunksize=4), 1):
            rows.append(r)
            if k % 50 == 0:
                print(f"  {k}/{len(jobs)}", flush=True)

    summary: dict[str, dict] = {}
    for label in [s[0] for s in SEASONS]:
        sub = [r for r in rows if r["season"] == label]
        summary[label] = {"all": summarize(sub)}
        summary[label]["rounds_1_4"] = summarize([r for r in sub if r["n_before"] < 32])
        summary[label]["rounds_5_plus"] = summarize([r for r in sub if r["n_before"] >= 32])
    summary["both"] = {"all": summarize(rows)}

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"summary": summary, "rows": rows}, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"→ {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
