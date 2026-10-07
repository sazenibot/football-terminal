#!/usr/bin/env python3
"""Walk-forward test nové simulace (sim_v2: Maher se sílou soupeřů + xG + Dixon-Coles) na libovolné lize.

Pro každý zápas se použijí jen ligové zápasy s dřívějším datem ve stejné sezóně a loňská sezóna jako prior.
Parametry jsou pro všechny ligy stejné (sim_v2.P a sim_v2_calibration.json), nic se po lize neladí.
Vyhodnocuje se model proti výsledku a (kde jsou) proti tržním kurzům bez marže.

    python scripts/sim_walk.py chance            # výstup scripts/.cache/walk/chance.json + souhrn
    python scripts/sim_walk.py chance --first 2023/24   # hodnotit od dané sezóny
"""
from __future__ import annotations

import json
import math
import multiprocessing as mp
import os
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from league_data import load_matches, load_odds  # noqa: E402
from sim_v2 import P, calibrate_markets, dixon_coles, lambdas_opp, markets  # noqa: E402
from tip_rule import hit_1x2, hit_ou, make_tip, ou_key  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "scripts" / ".cache" / "walk"
KEYS = ("home_win_pct", "draw_pct", "away_win_pct", "over15_pct", "over25_pct", "over35_pct", "btts_pct")
CTX: dict = {}


def rest_days(history: list[dict], team: str, kick: str) -> int | None:
    prev = [m["date"] for m in history if m["home"] == team or m["away"] == team]
    return (date.fromisoformat(kick) - date.fromisoformat(max(prev))).days if prev else None


def predict(args: tuple[int, int]) -> dict:
    si, i = args
    s = CTX["seasons"][si]
    m = s["games"][i]
    history = [x for x in s["games"] if x["date"] < m["date"]]
    rh, ra = rest_days(history, m["home"], m["date"]), rest_days(history, m["away"], m["date"])
    lh, la, _ = lambdas_opp(m["home"], m["away"], history, s["prev"], rh, ra, s["teams"], m["date"])
    raw = markets(dixon_coles(lh, la, P["rho"], P["max_goals"]))
    cal = calibrate_markets(raw)
    return {
        "season": s["label"],
        "id": m["id"],
        "date": m["date"],
        "stage": m["stage"],
        "home": m["home_name"],
        "away": m["away_name"],
        "hg": m["hg"],
        "ag": m["ag"],
        "n_before": len(history),
        "has_xg": sum(1 for x in history if x.get("hxg") is not None),
        "lam": [round(lh, 3), round(la, 3)],
        "raw": {k: raw[k] for k in KEYS},
        "cal": {k: cal[k] for k in KEYS},
    }


def implied(o: dict | None) -> dict | None:
    if not o:
        return None
    out: dict = {}
    trio = [o.get("home"), o.get("draw"), o.get("away")]
    if all(x and x > 1 for x in trio):
        inv = [1 / x for x in trio]
        s = sum(inv)
        out.update(h=100 * inv[0] / s, d=100 * inv[1] / s, a=100 * inv[2] / s, margin=100 * (s - 1))
    for tag in ("15", "25", "35"):
        ov, un = o.get(f"over{tag}"), o.get(f"under{tag}")
        if ov and un and ov > 1 and un > 1:
            out[f"over{tag}"] = 100 * (1 / ov) / (1 / ov + 1 / un)
    return out or None


def outcome(hg: int, ag: int) -> str:
    return "h" if hg > ag else "d" if hg == ag else "a"


def ll_1x2(p: dict, y: str) -> float:
    return -math.log(max(p[y] / 100, 1e-9))


def brier_1x2(p: dict, y: str) -> float:
    return sum((p[k] / 100 - (1.0 if k == y else 0.0)) ** 2 for k in "hda")


def ll_bin(p: float, hit: bool) -> float:
    p = min(max(p / 100, 1e-6), 1 - 1e-6)
    return -math.log(p if hit else 1 - p)


def mean(xs):
    xs = list(xs)
    return sum(xs) / len(xs) if xs else None


def summarize(rows: list[dict]) -> dict:
    """Souhrn modelu (raw, kalibrované trhy), tržního srovnání a úspěšnosti tipů."""
    n = len(rows)
    out: dict = {"n": n}
    if not n:
        return out
    for variant in ("raw", "cal"):
        ll = br = acc = 0.0
        for r in rows:
            p = {"h": r[variant]["home_win_pct"], "d": r[variant]["draw_pct"], "a": r[variant]["away_win_pct"]}
            y = outcome(r["hg"], r["ag"])
            ll += ll_1x2(p, y)
            br += brier_1x2(p, y)
            acc += max(p, key=p.get) == y
        out[f"{variant}_1x2"] = {"logloss": round(ll / n, 4), "brier": round(br / n, 4), "accuracy": round(100 * acc / n, 1)}
    # Over/Under a BTTS logloss, surově a kalibrovaně
    for tag, field, test in (
        ("o15", "over15_pct", lambda r: r["hg"] + r["ag"] > 1.5),
        ("o25", "over25_pct", lambda r: r["hg"] + r["ag"] > 2.5),
        ("o35", "over35_pct", lambda r: r["hg"] + r["ag"] > 3.5),
        ("btts", "btts_pct", lambda r: r["hg"] > 0 and r["ag"] > 0),
    ):
        out[f"{tag}_logloss"] = {v: round(mean(ll_bin(r[v][field], test(r)) for r in rows), 4) for v in ("raw", "cal")}
        out[f"{tag}_mean_pred_vs_actual"] = [round(mean(r["cal"][field] for r in rows), 1), round(100 * mean(test(r) for r in rows), 1)]
    # tipy (pravidlo z tip_rule, nad kalibrovanými trhy jako v produkci)
    tips = {"x12": {"n": 0, "hits": 0, "win": [0, 0], "dc": [0, 0]}, "goals": {"n": 0, "hits": 0, "by_line": defaultdict(lambda: [0, 0])}}
    for r in rows:
        c = r["cal"]
        tip = make_tip({"h": c["home_win_pct"], "d": c["draw_pct"], "a": c["away_win_pct"], "over25": c["over25_pct"], "over15": c["over15_pct"], "over35": c["over35_pct"]})
        h = hit_1x2(tip["x"], r["hg"], r["ag"])
        tips["x12"]["n"] += 1
        tips["x12"]["hits"] += h
        tips["x12"][tip["x"]["k"]][0] += 1
        tips["x12"][tip["x"]["k"]][1] += h
        g = hit_ou(tip["ou"], r["hg"], r["ag"])
        tips["goals"]["n"] += 1
        tips["goals"]["hits"] += g
        b = tips["goals"]["by_line"][ou_key(tip["ou"])]
        b[0] += 1
        b[1] += g
    tips["goals"]["by_line"] = dict(tips["goals"]["by_line"])
    out["tips"] = tips
    # trh
    mk = [r for r in rows if r.get("market")]
    if mk:
        both = {"n": len(mk), "model_cal": 0.0, "model_raw": 0.0, "market": 0.0, "margin": round(mean(r["market"]["margin"] for r in mk if "margin" in r["market"]) or 0, 2)}
        for r in mk:
            y = outcome(r["hg"], r["ag"])
            mkp = {k: r["market"][k] for k in "hda"}
            both["market"] += ll_1x2(mkp, y)
            both["model_cal"] += ll_1x2({"h": r["cal"]["home_win_pct"], "d": r["cal"]["draw_pct"], "a": r["cal"]["away_win_pct"]}, y)
        for k in ("model_cal", "market"):
            both[k] = round(both[k] / len(mk), 4)
        both.pop("model_raw")
        out["vs_market_1x2"] = both
        ou = [r for r in rows if r.get("market") and "over25" in r["market"]]
        if ou:
            out["vs_market_o25"] = {
                "n": len(ou),
                "model_cal": round(mean(ll_bin(r["cal"]["over25_pct"], r["hg"] + r["ag"] > 2.5) for r in ou), 4),
                "market": round(mean(ll_bin(r["market"]["over25"], r["hg"] + r["ag"] > 2.5) for r in ou), 4),
            }
    # kalibrace favorita (po 10 p. b.)
    bins: dict[int, list[float]] = defaultdict(lambda: [0, 0.0, 0])
    for r in rows:
        c = r["cal"]
        p = {"h": c["home_win_pct"], "d": c["draw_pct"], "a": c["away_win_pct"]}
        k = max(p, key=p.get)
        b = bins[int(p[k] // 10) * 10]
        b[0] += 1
        b[1] += p[k]
        b[2] += outcome(r["hg"], r["ag"]) == k
    out["calibration_fav"] = {str(k): {"n": v[0], "pred": round(v[1] / v[0], 1), "actual": round(100 * v[2] / v[0], 1)} for k, v in sorted(bins.items())}
    return out


def run(slug: str, first: str | None) -> None:
    games = load_matches(slug)
    odds = load_odds(slug)
    by_season: dict[str, list[dict]] = defaultdict(list)
    for g in games:
        by_season[g["season"]].append(g)
    labels = sorted(by_season)
    seasons = []
    for idx, label in enumerate(labels):
        if idx == 0 or (first and label < first):
            continue
        g = by_season[label]
        seasons.append(
            {
                "label": label,
                "games": g,
                "prev": by_season[labels[idx - 1]],
                "teams": {t for x in g for t in (x["home"], x["away"])},
            }
        )
    CTX["seasons"] = seasons
    jobs = [(si, i) for si, s in enumerate(seasons) for i in range(len(s["games"]))]
    print(f"{slug}: zápasů {len(jobs)}, sezóny {[(s['label'], len(s['games'])) for s in seasons]}", flush=True)
    with mp.get_context("fork").Pool(os.cpu_count() or 4) as pool:
        rows = pool.map(predict, jobs, chunksize=8)
    for r in rows:
        r["market"] = implied(odds.get(r["id"]))
    OUT.mkdir(parents=True, exist_ok=True)
    result = {"league": slug, "seasons": {s["label"]: summarize([r for r in rows if r["season"] == s["label"]]) for s in seasons}, "all": summarize(rows), "rows": rows}
    (OUT / f"{slug}.json").write_text(json.dumps(result, ensure_ascii=False))
    show(result)


def show(res: dict) -> None:
    print(f"\n=== {res['league']} ===")
    print(f"{'sezóna':8} {'n':>5} {'LL raw':>7} {'LL cal':>7} {'Brier':>6} {'acc%':>5} | {'LL model':>8} {'LL trh':>7} {'n trh':>5} | {'tip 1X2':>8} {'tip góly':>9}")
    for label, s in {**res["seasons"], "VŠE": res["all"]}.items():
        if not s.get("n"):
            continue
        vm = s.get("vs_market_1x2") or {}
        t = s["tips"]
        print(
            f"{label:8} {s['n']:>5} {s['raw_1x2']['logloss']:>7} {s['cal_1x2']['logloss']:>7} {s['cal_1x2']['brier']:>6} {s['cal_1x2']['accuracy']:>5} | "
            f"{vm.get('model_cal', '-'):>8} {vm.get('market', '-'):>7} {vm.get('n', 0):>5} | "
            f"{100 * t['x12']['hits'] / t['x12']['n']:>7.1f}% {100 * t['goals']['hits'] / t['goals']['n']:>8.1f}%"
        )


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    first = sys.argv[sys.argv.index("--first") + 1] if "--first" in sys.argv else None
    run(args[0], first)
