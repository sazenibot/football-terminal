#!/usr/bin/env python3
"""Laboratoř simulace: spustí walk-forward nad všemi 5 ligami s přepsanými parametry a vyhodnotí metriky.

Protokol (aby se nepřeladilo):
  * ladí se na sezónách 2022/23–2024/25 (TRAIN), potvrzuje na 2025/26 a novějších (VALID), kterou ladění nevidí
  * gólové trhy (BTTS, Over 1,5 / 2,5 / 3,5) se vždy hodnotí po společné Platt kalibraci (fit TRAIN všech lig),
    takže varianta nezíská výhodu jen tím, že "náhodou" lépe sedí úroveň
  * souhrnné skóre = součet logloss 1X2 + čtyř gólových trhů (nižší je lepší), rozdíl proti základu

    python scripts/sim_lab.py base
    python scripts/sim_lab.py sweep opp_k 4,8,16,32
"""
from __future__ import annotations

import json
import multiprocessing as mp
import os
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

sys.path.insert(0, str(Path(__file__).parent))
import sim_v2  # noqa: E402
from league_data import load_matches  # noqa: E402
from sim_v2 import dixon_coles, lambdas_opp, markets  # noqa: E402
from sim_walk import rest_days  # noqa: E402

LEAGUES = ("chance", "pl", "bl", "ll", "ere")
TRAIN_UNTIL = "2024/25"
KEYS = ("home_win_pct", "draw_pct", "away_win_pct", "btts_pct", "over15_pct", "over25_pct", "over35_pct")
GOAL_TESTS = {
    "btts_pct": lambda hg, ag: (hg > 0) & (ag > 0),
    "over15_pct": lambda hg, ag: hg + ag > 1,
    "over25_pct": lambda hg, ag: hg + ag > 2,
    "over35_pct": lambda hg, ag: hg + ag > 3,
}
BASE_P = dict(sim_v2.P)
CTX: dict = {}
OUT = Path(__file__).resolve().parents[1] / "scripts" / ".cache" / "lab"


def build() -> None:
    data = {}
    for slug in LEAGUES:
        games = load_matches(slug)
        by: dict[str, list[dict]] = defaultdict(list)
        for g in games:
            by[g["season"]].append(g)
        labels = sorted(by)
        seasons = []
        for i, label in enumerate(labels):
            if i == 0 or label < "2022/23":
                continue
            seasons.append({"label": label, "games": by[label], "prev": by[labels[i - 1]], "prev2": by[labels[i - 2]] if i >= 2 else [], "teams": {t for x in by[label] for t in (x["home"], x["away"])}})
        data[slug] = seasons
    CTX["data"] = data
    CTX["jobs"] = [(slug, si, i) for slug, ss in data.items() for si, s in enumerate(ss) for i in range(len(s["games"]))]


def predict(job):
    slug, si, i = job
    s = CTX["data"][slug][si]
    m = s["games"][i]
    hist = [x for x in s["games"] if x["date"] < m["date"]]
    rh, ra = rest_days(hist, m["home"], m["date"]), rest_days(hist, m["away"], m["date"])
    prev, last = s["prev"], None
    if sim_v2.P.get("_prev_seasons") == 2 and s["prev2"]:
        prev, last = s["prev2"] + s["prev"], s["prev"]
    lh, la, _ = lambdas_opp(m["home"], m["away"], hist, prev, rh, ra, s["teams"], m["date"], prev_last=last)
    mk = markets(dixon_coles(lh, la, sim_v2.P["rho"], sim_v2.P["max_goals"]))
    return [slug, s["label"], m["hg"], m["ag"], lh, la] + [mk[k] / 100 for k in KEYS] + [m["id"], m["date"]]


def run_variant(overrides: dict, pool_size: int | None = None) -> np.ndarray:
    sim_v2.P.clear()
    sim_v2.P.update(BASE_P)
    sim_v2.P.update(overrides)
    with mp.get_context("fork").Pool(pool_size or os.cpu_count() or 4) as pool:
        rows = pool.map(predict, CTX["jobs"], chunksize=16)
    return rows


def logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def sig(z):
    return 1 / (1 + np.exp(-z))


def ll(p, y):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def evaluate(rows: list, label: str = "") -> dict:
    slug = np.array([r[0] for r in rows])
    season = np.array([r[1] for r in rows])
    hg = np.array([r[2] for r in rows])
    ag = np.array([r[3] for r in rows])
    P = np.array([r[6:13] for r in rows])
    tr = season <= TRAIN_UNTIL
    va = ~tr
    y = np.where(hg > ag, 0, np.where(hg == ag, 1, 2))
    p3 = P[:, :3]

    def ll3(mask):
        return float(-np.mean(np.log(np.clip(p3[mask][np.arange(mask.sum()), y[mask]], 1e-9, 1))))

    out = {"label": label, "n_train": int(tr.sum()), "n_valid": int(va.sum()), "x12_train": ll3(tr), "x12_valid": ll3(va)}
    out["x12_by_league_valid"] = {s: float(ll3(va & (slug == s))) for s in LEAGUES}
    out["x12_by_league_train"] = {s: float(ll3(tr & (slug == s))) for s in LEAGUES}
    tot_tr = out["x12_train"]
    tot_va = out["x12_valid"]
    for j, (k, test) in enumerate(GOAL_TESTS.items()):
        x = P[:, 3 + j]
        t = test(hg, ag).astype(float)
        z = logit(x)
        w = minimize(lambda w: ll(sig(w[0] * z[tr] + w[1]), t[tr]), [1.0, 0.0], method="Nelder-Mead").x
        cal = sig(w[0] * z + w[1])
        out[k] = {"raw_train": ll(x[tr], t[tr]), "raw_valid": ll(x[va], t[va]), "cal_train": ll(cal[tr], t[tr]), "cal_valid": ll(cal[va], t[va]), "a": float(w[0]), "b": float(w[1])}
        tot_tr += out[k]["cal_train"]
        tot_va += out[k]["cal_valid"]
    out["score_train"] = tot_tr
    out["score_valid"] = tot_va
    draw = P[:, 1]
    out["draw_pred_actual_valid"] = [float(draw[va].mean()), float((y[va] == 1).mean())]
    out["draw_pred_actual_train"] = [float(draw[tr].mean()), float((y[tr] == 1).mean())]
    return out


def show(res: dict, base: dict | None) -> None:
    d = lambda k: f"{res[k] - base[k]:+.4f}" if base else ""  # noqa: E731
    print(
        f"{res['label']:34} score tr {res['score_train']:.4f} {d('score_train'):>8} | va {res['score_valid']:.4f} {d('score_valid'):>8} | "
        f"1X2 tr {res['x12_train']:.4f} va {res['x12_valid']:.4f} | o25 va {res['over25_pct']['cal_valid']:.4f} btts va {res['btts_pct']['cal_valid']:.4f}",
        flush=True,
    )


def cached(overrides: dict) -> dict | None:
    f = OUT / "results.jsonl"
    if f.exists():
        for line in f.read_text().splitlines():
            r = json.loads(line)
            if r["overrides"] == overrides:
                return r["result"]
    return None


def experiment(label: str, overrides: dict, base: dict | None = None) -> dict:
    res = cached(overrides)
    if res is None:
        t0 = time.time()
        rows = run_variant(overrides)
        res = evaluate(rows, label)
        res["seconds"] = round(time.time() - t0, 1)
        OUT.mkdir(parents=True, exist_ok=True)
        with (OUT / "results.jsonl").open("a") as f:
            f.write(json.dumps({"overrides": overrides, "result": res}) + "\n")
    res["label"] = label
    show(res, base)
    return res


def main() -> None:
    build()
    base = experiment("base", {})
    if len(sys.argv) > 1 and sys.argv[1] == "sweep":
        key = sys.argv[2]
        for v in sys.argv[3].split(","):
            val = None if v == "None" else float(v)
            experiment(f"{key}={v}", {key: val}, base)


if __name__ == "__main__":
    main()
