#!/usr/bin/env python3
"""Kalibrace pravděpodobností (1X2, over 1,5/2,5/3,5, oba dají gól).

Parametry se hledají jen na predikcích sezony 2025/26 (walk-forward), sezona 2026/27 slouží
jako nezávislé ověření. Čte scripts/.cache/sim-backtest-full.json (raw, bez kalibrace).
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IN = ROOT / "scripts/.cache/sim-backtest-full.json"
EPS = 1e-4


def logit(p: float) -> float:
    p = min(max(p, EPS), 1 - EPS)
    return math.log(p / (1 - p))


def platt(p: float, a: float, b: float) -> float:
    return 1 / (1 + math.exp(-(a * logit(p) + b)))


def x12(h: float, d: float, a: float, T: float, dd: float) -> tuple[float, float, float]:
    w = [max(h, EPS) ** T, max(d, EPS) ** T * math.exp(dd), max(a, EPS) ** T]
    s = sum(w)
    return w[0] / s, w[1] / s, w[2] / s


def bin_ll(rows: list[dict], field: str, truth, a: float, b: float) -> float:
    tot = 0.0
    for r in rows:
        q = platt(r["opp"][field] / 100, a, b)
        tot += -math.log(q if truth(r) else 1 - q)
    return tot / len(rows)


def fit_bin(rows: list[dict], field: str, truth) -> tuple[float, float]:
    best = (1e9, 1.0, 0.0)
    for ai in range(0, 41):
        a = ai * 0.05
        for bi in range(-40, 41):
            b = bi * 0.02
            ll = bin_ll(rows, field, truth, a, b)
            if ll < best[0]:
                best = (ll, a, b)
    return best[1], best[2]


def ll_x12(rows: list[dict], T: float, dd: float) -> float:
    tot = 0.0
    for r in rows:
        o = r["opp"]
        p = x12(o["home_win_pct"] / 100, o["draw_pct"] / 100, o["away_win_pct"] / 100, T, dd)
        tot += -math.log(p[{"home": 0, "draw": 1, "away": 2}[r["y"]]])
    return tot / len(rows)


def main() -> None:
    rows = json.loads(IN.read_text())["rows"]
    tr = [r for r in rows if r["season"] == "2025/26"]
    te = [r for r in rows if r["season"] == "2026/27"]
    out: dict = {}
    markets = {
        "btts": ("btts_pct", lambda r: r["hg"] > 0 and r["ag"] > 0),
        "over15": ("over15_pct", lambda r: r["hg"] + r["ag"] > 1),
        "over25": ("over25_pct", lambda r: r["hg"] + r["ag"] > 2),
        "over35": ("over35_pct", lambda r: r["hg"] + r["ag"] > 3),
    }
    for name, (field, truth) in markets.items():
        a, b = fit_bin(tr, field, truth)
        out[name] = [round(a, 2), round(b, 2)]
        print(
            f"{name:7} a={a:.2f} b={b:+.2f} | train raw {bin_ll(tr, field, truth, 1, 0):.4f} → {bin_ll(tr, field, truth, a, b):.4f}"
            f" | test raw {bin_ll(te, field, truth, 1, 0):.4f} → {bin_ll(te, field, truth, a, b):.4f}"
        )
    best = (1e9, 1.0, 0.0)
    for ti in range(30, 131, 5):
        T = ti / 100
        for di in range(-60, 21, 2):
            dd = di / 100
            ll = ll_x12(tr, T, dd)
            if ll < best[0]:
                best = (ll, T, dd)
    _, T, dd = best
    out["x12"] = {"T": round(T, 2), "draw": round(dd, 2)}
    print(f"1X2     T={T:.2f} draw={dd:+.2f} | train raw {ll_x12(tr, 1, 0):.4f} → {ll_x12(tr, T, dd):.4f} | test raw {ll_x12(te, 1, 0):.4f} → {ll_x12(te, T, dd):.4f}")
    print(json.dumps(out))
    if "--write" in sys.argv:
        keep = {k: v for k, v in out.items() if k != "x12"}  # 1X2 kalibrace na ověřovací sezoně zhoršila → nepoužívá se
        (ROOT / "scripts/sim_v2_calibration.json").write_text(json.dumps(keep, indent=2) + "\n")
        print("→ scripts/sim_v2_calibration.json")


if __name__ == "__main__":
    main()
