#!/usr/bin/env python3
"""Ladění modelu střel / SOT / rohů. Ladí se na 2025/26, ověřuje na 2026/27. Výstup jen do konzole."""

from __future__ import annotations

import itertools
import math
import multiprocessing as mp
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sim_backtest_full import CTX, SEASONS, VOLUME, prep_season  # noqa: E402
from sim_v2 import VOL_DEFAULT_MU, league_metric_mu, shrink, volume_simple, P  # noqa: E402

_pool = None


def one(args):
    name, hk, ak, par, si, i = args
    s = CTX["seasons"][si]
    games, prev = s["games"], s["prev"]
    m = games[i]
    if m.get(hk) is None or m.get(ak) is None:
        return None
    hist = [x for x in games if x["date"] < m["date"]]
    lh, la = volume_simple(m["home"], m["away"], hist, prev, hk, ak, VOL_DEFAULT_MU[name], par)
    return (lh - m[hk], la - m[ak])


def score(name, hk, ak, par, si):
    n = len(CTX["seasons"][si]["games"])
    res = [r for r in _pool.map(one, [(name, hk, ak, par, si, i) for i in range(n)], chunksize=8) if r]
    errs = [e for r in res for e in r]
    return math.sqrt(sum(e * e for e in errs) / len(errs)), sum(abs(e) for e in errs) / len(errs), sum(errs) / len(errs)


def league_score(name, hk, ak, si):
    s = CTX["seasons"][si]
    games, prev = s["games"], s["prev"]
    errs = []
    for m in games:
        if m.get(hk) is None:
            continue
        hist = [x for x in games if x["date"] < m["date"]]
        mu_p, mu_c = league_metric_mu(prev, hk, ak), league_metric_mu(hist, hk, ak)
        n = sum(1 for x in hist if x.get(hk) is not None)
        errs += [shrink(mu_c[0], mu_p[0], n, 40) - m[hk], shrink(mu_c[1], mu_p[1], n, 40) - m[ak]]
    return math.sqrt(sum(e * e for e in errs) / len(errs)), sum(abs(e) for e in errs) / len(errs)


def main():
    global _pool
    CTX["seasons"] = [prep_season(*s) for s in SEASONS]
    _pool = mp.get_context("fork").Pool(os.cpu_count() or 4)
    grid = list(itertools.product((0.0, 0.5, 1.0), (0.5, 0.75, 1.0), (4, 8, 16, 32), (0.3, 0.7, 1.0)))
    for name, hk, ak in VOLUME:
        lt, ls = league_score(name, hk, ak, 0), league_score(name, hk, ak, 1)
        d_tr, d_te = score(name, hk, ak, {}, 0), score(name, hk, ak, {}, 1)
        print(f"\n== {name}: liga Ø train rmse {lt[0]:.3f} mae {lt[1]:.3f} | test rmse {ls[0]:.3f} mae {ls[1]:.3f}")
        print(f"   default       train rmse {d_tr[0]:.3f} mae {d_tr[1]:.3f} | test rmse {d_te[0]:.3f} mae {d_te[1]:.3f}")
        res = []
        for g, al, kv, vw in grid:
            par = {"gamma": g, "alpha": al, "k_venue": kv, "k_overall": kv, "venue_weight": vw}
            res.append((score(name, hk, ak, par, 0), par))
        res.sort(key=lambda r: r[0][0])
        for (tr, par) in res[:5]:
            te = score(name, hk, ak, par, 1)
            print(f"   γ{par['gamma']} α{par['alpha']} k{par['k_venue']} vw{par['venue_weight']}  train rmse {tr[0]:.3f} mae {tr[1]:.3f} bias {tr[2]:+.2f} | test rmse {te[0]:.3f} mae {te[1]:.3f} bias {te[2]:+.2f}")


if __name__ == "__main__":
    main()
