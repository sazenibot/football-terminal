#!/usr/bin/env python3
"""Tip na výsledek: model sám vs. tip s kurzem. Zápasy s kurzem (Bet365 closing) z ověřovací části a ladění zvlášť.

Varianty:
  V0  model: výhra favorita od 65 %, jinak neprohra (současné pravidlo)
  V1  shoda: stejný favorit u modelu i trhu, trh >= 65 % a model >= MIN_MODEL, jinak V0
  V2  mix w model + (1-w) trh, stejná hranice 65 %
  V3  trh sám, hranice 65 %
Výstup: počet ostrých tipů (1/2), jejich úspěšnost, úspěšnost neprohry, celková úspěšnost, průměrný férový kurz ostrého tipu.
    python scripts/sim_tip_odds.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from league_data import load_odds  # noqa: E402
from sim_walk import implied  # noqa: E402

ROWS = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / ".cache" / "lab" / "candidate_rows.json"
WIN = 0.65


def load():
    rows = json.loads(ROWS.read_text())["rows"]
    odds = {s: load_odds(s) for s in {r[0] for r in rows}}
    out = []
    for r in rows:
        m = implied(odds[r[0]].get(r[13]))
        if not (m and "h" in m):
            continue
        p = np.array(r[6:9]); p = p / p.sum()
        k = np.array([m["h"], m["d"], m["a"]]) / 100
        raw = odds[r[0]].get(r[13])
        o = np.array([raw["home"], raw["draw"], raw["away"]], dtype=float)
        y = 0 if r[2] > r[3] else 1 if r[2] == r[3] else 2
        out.append((r[0], r[1], p, k, y, o))
    return out


def tip(p, k, kind, **kw):
    """vrací (strana 0/2, 'win'/'dc')"""
    if kind == "V0":
        q = p
    elif kind == "V2":
        q = kw["w"] * p + (1 - kw["w"]) * k
    elif kind == "V3":
        q = k
    elif kind == "V1":
        q = p
        s = 0 if k[0] >= k[2] else 2
        if (0 if p[0] >= p[2] else 2) == s and k[s] >= WIN and p[s] >= kw["min_model"]:
            return s, "win"
    s = 0 if q[0] >= q[2] else 2
    return s, ("win" if q[s] >= kw.get("thr", WIN) else "dc")


def score(items, kind, **kw):
    n = w = wh = d = dh = 0
    fair = []
    profit = 0.0
    for _, _, p, k, y, o in items:
        s, t = tip(p, k, kind, **kw)
        hit = y == s if t == "win" else y in (s, 1)
        n += 1
        if t == "win":
            w += 1; wh += hit; fair.append(1 / k[s]); profit += (o[s] - 1) if hit else -1
        else:
            d += 1; dh += hit
    return n, w, 100 * wh / max(w, 1), 100 * dh / max(d, 1), 100 * (wh + dh) / n, float(np.mean(fair)) if fair else 0, 100 * profit / max(w, 1)


def main() -> None:
    items = load()
    tr = [i for i in items if i[1] <= "2024/25"]
    va = [i for i in items if i[1] > "2024/25"]
    print(f"zápasů s kurzem: ladění {len(tr)}, ověření {len(va)}")
    variants = [("V0 model (dnes)", "V0", {})]
    for mm in (0.35, 0.45, 0.50):
        variants.append((f"V1 shoda, model >= {int(mm * 100)} %", "V1", {"min_model": mm}))
    for w in (0.25, 0.5, 0.75):
        variants.append((f"V2 mix model {int(w * 100)} %", "V2", {"w": w}))
    variants.append(("V3 jen trh", "V3", {}))
    print(f"{'varianta':30}{'část':8}{'tipů':>6}{'1/2':>6}{'1/2 trefa':>11}{'10/02 trefa':>13}{'celkem':>9}{'fér. kurz 1/2':>15}{'ROI 1/2':>9}")
    for label, kind, kw in variants:
        for part, data in (("ladění", tr), ("ověření", va)):
            n, w, wh, dh, tot, fair, roi = score(data, kind, **kw)
            print(f"{label:30}{part:8}{n:>6}{w:>6}{wh:>10.1f}%{dh:>12.1f}%{tot:>8.1f}%{fair:>15.2f}{roi:>8.1f}%")
    # hranice pro mix i pro model sám: co se stane, když ji snížíme
    print("\nCitlivost hranice ostrého tipu (ověření)")
    for kind, kw in (("V0", {}), ("V2", {"w": 0.5})):
        for thr in (0.55, 0.60, 0.65):
            n, w, wh, dh, tot, fair, roi = score(va, kind, thr=thr, **kw)
            print(f"  {kind} {kw} hranice {int(thr * 100)} %: ostrých {w}, trefa {wh:.1f}%, 10/02 {dh:.1f}%, celkem {tot:.1f}%, fér. kurz {fair:.2f}, ROI {roi:.1f}%")
    # shoda modelu s trhem u zápasů, kde se rozcházejí
    print("\nKdyž trh dává favoritu >= 65 %, a model < 65 %: kdo měl pravdu (ověření + ladění)")
    for name, data in (("ladění", tr), ("ověření", va)):
        rows = [(p, k, y) for _, _, p, k, y, _o in data if max(k[0], k[2]) >= WIN and max(p[0], p[2]) < WIN and (0 if k[0] >= k[2] else 2) == (0 if p[0] >= p[2] else 2)]
        if rows:
            ms = [0 if k[0] >= k[2] else 2 for p, k, y in rows]
            print(f"  {name}: n={len(rows)}, model v průměru {np.mean([p[s] for (p, k, y), s in zip(rows, ms)]) * 100:.1f} %, trh {np.mean([k[s] for (p, k, y), s in zip(rows, ms)]) * 100:.1f} %, skutečně {np.mean([y == s for (p, k, y), s in zip(rows, ms)]) * 100:.1f} %")


if __name__ == "__main__":
    main()
