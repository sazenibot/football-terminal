#!/usr/bin/env python3
"""Ladění parametrů gólového modelu. Ladí se na 2025/26, ověřuje se na 2026/27.

Použití: python3 scripts/sim_tune.py            # sweepy po jednom parametru
Výstup je jen do konzole; nic se nezapisuje do repa.
"""

from __future__ import annotations

import math
import multiprocessing as mp
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import sim_backtest_full as bf  # noqa: E402
from sim_backtest_full import CTX, SEASONS, prep_season  # noqa: E402
from sim_v2 import P, dixon_coles, lambdas_opp, markets  # noqa: E402
from sim_v2_backtest import outcome, rest_league  # noqa: E402

BASE = dict(P)


def one(args: tuple[dict, int, int]) -> tuple[float, float, float, float, float]:
    over, si, i = args
    P.update(BASE)
    P.update(over)
    s = CTX["seasons"][si]
    games = s["games"]
    m = games[i]
    hist = [x for x in games if x["date"] < m["date"]]
    rh, ra = rest_league(hist, m["home"], m["date"]), rest_league(hist, m["away"], m["date"])
    lh, la, _ = lambdas_opp(m["home"], m["away"], hist, s["prev"], rh, ra, s["league"], m["date"])
    out = markets(dixon_coles(lh, la, P["rho"], P["max_goals"]))
    y = outcome(m["hg"], m["ag"])
    p = {"home": out["home_win_pct"], "draw": out["draw_pct"], "away": out["away_win_pct"]}
    py = max(p[y] / 100, 1e-9)
    br = sum((p[k] / 100 - (1.0 if k == y else 0.0)) ** 2 for k in p)
    tot = m["hg"] + m["ag"]
    po = min(max(out["over25_pct"] / 100, 1e-6), 1 - 1e-6)
    pb = min(max(out["btts_pct"] / 100, 1e-6), 1 - 1e-6)
    ll_o = -math.log(po if tot > 2 else 1 - po)
    ll_b = -math.log(pb if (m["hg"] > 0 and m["ag"] > 0) else 1 - pb)
    return -math.log(py), br, ll_o, ll_b, abs(lh + la - tot)


_pool = None


def evaluate(over: dict, si: int) -> dict:
    n = len(CTX["seasons"][si]["games"])
    res = _pool.map(one, [(over, si, i) for i in range(n)], chunksize=8)
    return {
        "ll": sum(r[0] for r in res) / n,
        "br": sum(r[1] for r in res) / n,
        "over": sum(r[2] for r in res) / n,
        "btts": sum(r[3] for r in res) / n,
    }


def line(label: str, over: dict) -> dict:
    a, b = evaluate(over, 0), evaluate(over, 1)
    print(
        f"{label:34} train ll {a['ll']:.4f} br {a['br']:.4f} o {a['over']:.4f} b {a['btts']:.4f}"
        f" | test ll {b['ll']:.4f} br {b['br']:.4f} o {b['over']:.4f} b {b['btts']:.4f}",
        flush=True,
    )
    return {"train": a, "test": b}


def main() -> None:
    global _pool
    CTX["seasons"] = [prep_season(*s) for s in SEASONS]
    _pool = mp.get_context("fork").Pool(os.cpu_count() or 4)
    line("baseline", {})
    print("--- opp_k")
    for v in (3, 5, 12, 20):
        line(f"opp_k={v}", {"opp_k": v})
    print("--- opp_k_def (opp_k=8)")
    for v in (16, 30, 60):
        line(f"opp_k_def={v}", {"opp_k_def": v})
    print("--- opp_xg_blend")
    for v in (0.3, 0.6, 0.8, 1.0):
        line(f"xg_blend={v}", {"opp_xg_blend": v})
    print("--- xgot blend (xg 0.45)")
    for v in (0.15, 0.3, 0.5):
        line(f"xgot_blend={v}", {"opp_xgot_blend": v})
    print("--- xgot instead of goals (xg 0.0)")
    for v in (0.3, 0.6, 1.0):
        line(f"xg=0 xgot={v}", {"opp_xg_blend": 0.0, "opp_xgot_blend": v})
    print("--- half_life")
    for v in (60, 120, 200, 365):
        line(f"half_life={v}", {"opp_half_life": v})
    print("--- prior_reg")
    for v in (0.85, 0.7, 0.5):
        line(f"prior_reg={v}", {"opp_prior_reg": v})
    print("--- lam_shrink")
    for v in (0.9, 0.8, 0.7):
        line(f"lam_shrink={v}", {"opp_lam_shrink": v})
    print("--- rho")
    for v in (0.0, -0.05, -0.12, -0.16):
        line(f"rho={v}", {"rho": v})
    print("--- rest off")
    line("rest off", {"rest_att": 1.0, "rest_def": 1.0})


if __name__ == "__main__":
    main()
