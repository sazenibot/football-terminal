#!/usr/bin/env python3
"""Tipy nad vylepšenou simulací: kalibrace gólových trhů (společná, fit TRAIN) a vyhodnocení pravidla tipu po ligách.

    python scripts/sim_tips_lab.py            # základ i kandidát B
Výstup: spolehlivost (zobrazená pravděpodobnost tipu vs. skutečná úspěšnost) a úspěšnost podle hranic.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

sys.path.insert(0, str(Path(__file__).parent))
import sim_lab as L  # noqa: E402

CAND = {"hfa_k": 80, "prior_xg_blend": 0.5, "_prev_seasons": 2, "draw_boost": 0.10, "rho": 0.0, "opp_k": 16, "opp_lam_shrink": 0.9}
COLS = {k: 6 + i for i, k in enumerate(L.KEYS)}


def calibrated(rows: list) -> tuple[np.ndarray, dict]:
    a = np.array([r[6:13] for r in rows])
    season = np.array([r[1] for r in rows])
    hg, ag = np.array([r[2] for r in rows]), np.array([r[3] for r in rows])
    tr = season <= L.TRAIN_UNTIL
    out = a.copy()
    params = {}
    for j, (k, test) in enumerate(L.GOAL_TESTS.items()):
        col = 3 + j
        t = test(hg, ag).astype(float)
        z = L.logit(a[:, col])
        w = minimize(lambda w: L.ll(L.sig(w[0] * z[tr] + w[1]), t[tr]), [1.0, 0.0], method="Nelder-Mead").x
        out[:, col] = L.sig(w[0] * z + w[1])
        params[k] = [round(float(w[0]), 3), round(float(w[1]), 3)]
    return out, params


def tips(rows: list, P: np.ndarray, win_from=0.65, main_from=0.60):
    """Vrací pole úspěšností: (x12 hit, x12 win?, x12 shown p, goals hit, goals line key, goals shown p)."""
    res = []
    for r, p in zip(rows, P):
        hg, ag = r[2], r[3]
        h, d, a = p[0], p[1], p[2]
        side = "h" if h >= a else "a"
        win = max(h, a)
        y = "h" if hg > ag else "a" if hg < ag else "d"
        if win >= win_from:
            kind, shown, hit = "win", win, y == side
        else:
            kind, shown, hit = "dc", win + d, y in (side, "d")
        o15, o25, o35 = p[4], p[5], p[6]
        conf = max(o25, 1 - o25)
        tot = hg + ag
        if conf >= main_from:
            over = o25 >= 0.5
            line, gshown, ghit = ("o25" if over else "u25"), (o25 if over else 1 - o25), (tot > 2 if over else tot < 3)
        elif o25 >= 0.5:
            line, gshown, ghit = "o15", o15, tot > 1
        else:
            line, gshown, ghit = "u35", 1 - o35, tot < 4
        res.append((hit, kind, shown, ghit, line, gshown))
    return res


def report(title: str, rows: list, P: np.ndarray) -> None:
    slug = np.array([r[0] for r in rows])
    season = np.array([r[1] for r in rows])
    valid = season > L.TRAIN_UNTIL
    t = tips(rows, P)
    hit = np.array([x[0] for x in t], float)
    shown = np.array([x[2] for x in t])
    ghit = np.array([x[3] for x in t], float)
    gshown = np.array([x[5] for x in t])
    kind = np.array([x[1] for x in t])
    line = np.array([x[4] for x in t])
    print(f"\n##### {title}")
    print(f"{'liga':8}{'část':7}{'n':>5} | tip 1X2: úspěšnost / zobrazeno | výhra: n úsp / zobr | DC: n úsp / zobr | tip góly: úsp / zobr")
    for s in L.LEAGUES + ("VŠE",):
        for part, m in (("train", ~valid), ("valid", valid)):
            sel = m if s == "VŠE" else m & (slug == s)
            if not sel.any():
                continue
            w, dc = sel & (kind == "win"), sel & (kind == "dc")
            print(
                f"{s:8}{part:7}{sel.sum():>5} | {100 * hit[sel].mean():5.1f}% / {100 * shown[sel].mean():5.1f}% | "
                f"{w.sum():>4} {100 * hit[w].mean():5.1f}% / {100 * shown[w].mean():5.1f}% | {dc.sum():>4} {100 * hit[dc].mean():5.1f}% / {100 * shown[dc].mean():5.1f}% | "
                f"{100 * ghit[sel].mean():5.1f}% / {100 * gshown[sel].mean():5.1f}%"
            )
    print("tipy na góly podle čáry (VŠE valid): " + ", ".join(f"{k}: {int((valid & (line == k)).sum())}× {100 * ghit[valid & (line == k)].mean():.0f}% (zobr. {100 * gshown[valid & (line == k)].mean():.0f}%)" for k in ("o15", "o25", "u25", "u35") if (valid & (line == k)).any()))


def main() -> None:
    L.build()
    for title, ov in (("ZÁKLAD (dnešní model + společná kalibrace)", {}), ("KANDIDÁT B", CAND)):
        rows = L.run_variant(ov)
        P, params = calibrated(rows)
        print(f"\nkalibrace gólových trhů [a, b]: {params}")
        report(title, rows, P)
        if title.startswith("KAND"):
            Path(L.OUT / "candidate_rows.json").write_text(json.dumps({"overrides": CAND, "calibration": params, "rows": [list(map(lambda x: x if not isinstance(x, (np.floating, np.integer)) else float(x), r)) for r in rows]}))
            for wf in (0.55, 0.60, 0.65, 0.70, 0.75):
                t = tips(rows, P, win_from=wf)
                season = np.array([r[1] for r in rows])
                v = season > L.TRAIN_UNTIL
                kinds = np.array([x[1] for x in t])
                hit = np.array([x[0] for x in t], float)
                print(f"  WIN_FROM {wf:.2f}: tip 1X2 celkem valid {100 * hit[v].mean():.1f}% | výher {int((v & (kinds == 'win')).sum())} ({100 * hit[v & (kinds == 'win')].mean():.1f}%), DC {int((v & (kinds == 'dc')).sum())} ({100 * hit[v & (kinds == 'dc')].mean():.1f}%)")
            for mf in (0.55, 0.60, 0.65, 0.70):
                t = tips(rows, P, main_from=mf)
                g = np.array([x[3] for x in t], float)
                ln = np.array([x[4] for x in t])
                print(f"  GOALS_MAIN_FROM {mf:.2f}: tip góly valid {100 * g[v].mean():.1f}% | 2,5: {int((v & np.isin(ln, ('o25', 'u25'))).sum())} ({100 * g[v & np.isin(ln, ('o25', 'u25'))].mean():.1f}%)")


if __name__ == "__main__":
    main()
