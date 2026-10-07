#!/usr/bin/env python3
"""Lehká kalibrace simulace pro jednu ligu nad výstupem sim_walk.py (scripts/.cache/walk/{liga}.json).

Čestný postup: kalibrace se fituje jen na starších sezónách (train) a ověřuje na novějších (valid), které při
fitu nikdo neviděl. Varianty gólových trhů (BTTS, Over 1,5 / 2,5 / 3,5):
  raw      model beze změny
  chance   kalibrace laděná na Chance Lize (dnešní výchozí)
  shift    jen posun úrovně (a = 1, fituje se b)       – 1 parametr na trh
  platt    posun i sklon (a, b)                        – 2 parametry na trh
Výsledky 1X2: model beze změny vs. teplota T (p^T, normalizace) + posun remízy.

    python scripts/league_calibrate.py pl --train-until 2024/25
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

sys.path.insert(0, str(Path(__file__).parent))
from sim_walk import OUT, outcome  # noqa: E402
from sim_v2 import CAL  # noqa: E402

MARKETS = {
    "btts": ("btts_pct", lambda r: r["hg"] > 0 and r["ag"] > 0),
    "over15": ("over15_pct", lambda r: r["hg"] + r["ag"] > 1),
    "over25": ("over25_pct", lambda r: r["hg"] + r["ag"] > 2),
    "over35": ("over35_pct", lambda r: r["hg"] + r["ag"] > 3),
}


def logit(p: np.ndarray) -> np.ndarray:
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def sig(z):
    return 1 / (1 + np.exp(-z))


def ll(p: np.ndarray, y: np.ndarray) -> float:
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def fit_binary(x: np.ndarray, y: np.ndarray, slope: bool) -> tuple[float, float]:
    z = logit(x)
    if slope:
        f = lambda w: ll(sig(w[0] * z + w[1]), y)  # noqa: E731
        w = minimize(f, [1.0, 0.0], method="Nelder-Mead").x
        return float(w[0]), float(w[1])
    f = lambda w: ll(sig(z + w[0]), y)  # noqa: E731
    return 1.0, float(minimize(f, [0.0], method="Nelder-Mead").x[0])


def apply(x: np.ndarray, ab: tuple[float, float]) -> np.ndarray:
    return sig(ab[0] * logit(x) + ab[1])


def probs(rows: list[dict], variant: str) -> np.ndarray:
    return np.array([[r[variant]["home_win_pct"], r[variant]["draw_pct"], r[variant]["away_win_pct"]] for r in rows]) / 100


def y3(rows: list[dict]) -> np.ndarray:
    idx = {"h": 0, "d": 1, "a": 2}
    return np.array([idx[outcome(r["hg"], r["ag"])] for r in rows])


def calib3(p: np.ndarray, t: float, dshift: float) -> np.ndarray:
    q = np.clip(p, 1e-6, 1) ** t
    q[:, 1] *= math.exp(dshift)
    return q / q.sum(axis=1, keepdims=True)


def ll3(p: np.ndarray, y: np.ndarray) -> float:
    return float(-np.mean(np.log(np.clip(p[np.arange(len(y)), y], 1e-9, 1))))


def main() -> None:
    slug = sys.argv[1]
    until = sys.argv[sys.argv.index("--train-until") + 1] if "--train-until" in sys.argv else "2024/25"
    res = json.loads((OUT / f"{slug}.json").read_text())
    rows = res["rows"]
    train = [r for r in rows if r["season"] <= until]
    valid = [r for r in rows if r["season"] > until]
    print(f"{slug}: train {len(train)} ({sorted({r['season'] for r in train})}), valid {len(valid)} ({sorted({r['season'] for r in valid})})")

    out: dict = {"fit_seasons": sorted({r["season"] for r in train})}
    print(f"\n{'trh':8} {'varianta':8} {'a':>5} {'b':>6} | {'LL train':>8} {'LL valid':>8} | {'průměr pred/real valid':>24}")
    for key, (field, test) in MARKETS.items():
        xt = np.array([r["raw"][field] for r in train]) / 100
        yt = np.array([float(test(r)) for r in train])
        xv = np.array([r["raw"][field] for r in valid]) / 100
        yv = np.array([float(test(r)) for r in valid])
        variants = {"raw": (1.0, 0.0), "chance": tuple(CAL.get(key, (1.0, 0.0))), "shift": fit_binary(xt, yt, False), "platt": fit_binary(xt, yt, True)}
        for name, ab in variants.items():
            print(f"{key:8} {name:8} {ab[0]:>5.2f} {ab[1]:>6.2f} | {ll(apply(xt, ab), yt):>8.4f} {ll(apply(xv, ab), yv):>8.4f} | {100 * apply(xv, ab).mean():>10.1f} / {100 * yv.mean():<10.1f}")
        out[key] = {k: [round(v[0], 3), round(v[1], 3)] for k, v in variants.items()}

    # 1X2: teplota a posun remízy
    pt, yt3 = probs(train, "raw"), y3(train)
    pv, yv3 = probs(valid, "raw"), y3(valid)
    w = minimize(lambda w: ll3(calib3(pt, w[0], w[1]), yt3), [1.0, 0.0], method="Nelder-Mead").x
    w1 = minimize(lambda w: ll3(calib3(pt, w[0], 0.0), yt3), [1.0], method="Nelder-Mead").x
    print("\n1X2        varianta        T  d-shift | LL train  LL valid | mean pred H/D/A valid | real H/D/A valid")
    real = np.bincount(yv3, minlength=3) / len(yv3)
    for name, (t, d) in {"raw": (1.0, 0.0), "teplota": (float(w1[0]), 0.0), "teplota+remíza": (float(w[0]), float(w[1]))}.items():
        qt, qv = calib3(pt, t, d), calib3(pv, t, d)
        print(f"          {name:14} {t:>5.2f} {d:>7.2f} | {ll3(qt, yt3):>8.4f} {ll3(qv, yv3):>8.4f} | {qv.mean(0).round(3)} | {real.round(3)}")
        out.setdefault("x12", {})[name] = [round(t, 3), round(d, 3)]
    (OUT / f"{slug}.calibration.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
