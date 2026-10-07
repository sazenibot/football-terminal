#!/usr/bin/env python3
"""Potvrzení varianty B proti trhu (kurzy bez marže) na všech 5 ligách, základ vs. B.

Čím nižší logloss, tím lepší. Gólové trhy po společné kalibraci (fit na sezónách ≤ 2024/25).
    python scripts/sim_final_check.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

sys.path.insert(0, str(Path(__file__).parent))
import sim_lab as L  # noqa: E402
from league_data import load_odds  # noqa: E402
from sim_walk import implied  # noqa: E402

FINAL = {"hfa_k": 80, "prior_xg_blend": 0.5, "_prev_seasons": 2, "draw_boost": 0.10, "rho": 0.0, "opp_k": 16, "opp_lam_shrink": 0.9}


def prepare(rows: list) -> dict:
    slug = np.array([r[0] for r in rows])
    season = np.array([r[1] for r in rows])
    hg, ag = np.array([r[2] for r in rows]), np.array([r[3] for r in rows])
    P = np.array([r[6:13] for r in rows])
    tr = season <= L.TRAIN_UNTIL
    o25 = P[:, 5].copy()
    t = (hg + ag > 2).astype(float)
    z = L.logit(o25)
    w = minimize(lambda w: L.ll(L.sig(w[0] * z[tr] + w[1]), t[tr]), [1.0, 0.0], method="Nelder-Mead").x
    return {"slug": slug, "season": season, "hg": hg, "ag": ag, "P": P, "o25": L.sig(w[0] * z + w[1]), "tr": tr}


def main() -> None:
    L.build()
    odds = {s: load_odds(s) for s in L.LEAGUES}
    res = {}
    for name, ov in (("základ", {}), ("B", FINAL)):
        rows = L.run_variant(ov)
        res[name] = (rows, prepare(rows))
    ids = [r[13] for r in res["základ"][0]]
    mk = [implied(odds[r[0]].get(r[13])) for r in res["základ"][0]]
    has = np.array([bool(m and "h" in m) for m in mk])
    M = np.array([[m["h"], m["d"], m["a"]] if (m and "h" in m) else [np.nan] * 3 for m in mk]) / 100
    Mo = np.array([m["over25"] / 100 if (m and "over25" in m) else np.nan for m in mk])
    d0 = res["základ"][1]
    y = np.where(d0["hg"] > d0["ag"], 0, np.where(d0["hg"] == d0["ag"], 1, 2))
    tot = (d0["hg"] + d0["ag"] > 2).astype(float)

    def l3(p, idx):
        return float(-np.mean(np.log(np.clip(p[idx][np.arange(idx.sum()), y[idx]], 1e-9, 1))))

    print(f"{'liga':8}{'část':7}{'n s kurzy':>10} | {'1X2 základ':>11}{'1X2 B':>8}{'1X2 trh':>9}{'B−trh':>8} | {'O2,5 základ':>12}{'B':>8}{'trh':>8}")
    for s in L.LEAGUES + ("VŠE",):
        for part in ("train", "valid"):
            part_m = d0["tr"] if part == "train" else ~d0["tr"]
            sel = part_m & has & (True if s == "VŠE" else d0["slug"] == s)
            if sel.sum() < 30:
                continue
            a, b = res["základ"][1], res["B"][1]
            so = sel & ~np.isnan(Mo)
            print(
                f"{s:8}{part:7}{sel.sum():>10} | {l3(a['P'][:, :3], sel):>11.4f}{l3(b['P'][:, :3], sel):>8.4f}{l3(M, sel):>9.4f}{l3(b['P'][:, :3], sel) - l3(M, sel):>+8.4f} | "
                f"{L.ll(a['o25'][so], tot[so]):>12.4f}{L.ll(b['o25'][so], tot[so]):>8.4f}{L.ll(Mo[so], tot[so]):>8.4f}"
            )


if __name__ == "__main__":
    main()
