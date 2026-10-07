#!/usr/bin/env python3
"""Vyhodnocení hranice „neprohra" proti kurzům (vstup: scripts/.cache/odds-backtest.json).

Kurzy: Bet365 `last_seen` (poslední známé před výkopem; jiný bookmaker jen když Bet365 chybí).
Sázka = 1 jednotka na tip modelu; ROI = zisk / vsazeno.
Výstup: stdout + frontend/public/data/lab/neprohra.json (pro Lab stránku).
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts/.cache/odds-backtest.json"
OUT = ROOT / "frontend/public/data/lab/neprohra.json"


def num(x):
    try:
        v = float(x)
        return v if v > 1.0 else None
    except (TypeError, ValueError):
        return None


def pick_odds(bookmakers: list[dict]) -> dict | None:
    order = sorted(bookmakers, key=lambda b: b["name"] != "Bet365")
    for b in order:
        mo = b["markets"].get("match_odds") or {}
        dc = b["markets"].get("double_chance") or {}
        g = lambda m, k: num(((m or {}).get(k) or {}).get("last_seen"))  # noqa: E731
        o = {"h": g(mo, "home"), "x": g(mo, "draw"), "a": g(mo, "away"), "1x": g(dc, "home_draw"), "x2": g(dc, "draw_away")}
        if o["h"] and o["x"] and o["a"]:
            if not o["1x"]:  # dopočet z 1X2 (bez marže se nedá, bereme férově s marží)
                o["1x"] = None
            return {"bookmaker": b["name"], **o}
    return None


def load() -> list[dict]:
    rows = []
    for r in json.loads(SRC.read_text())["rows"]:
        od = pick_odds(r["bookmakers"])
        if not od:
            continue
        m = r["opp"]
        h, x, a = m["home_win_pct"], m["draw_pct"], m["away_win_pct"]
        fav = "h" if h >= a else "a"
        pf = h if fav == "h" else a
        dc_key = "1x" if fav == "h" else "x2"
        dc_odds = od[dc_key]
        if not dc_odds:
            continue
        win_odds = od[fav]
        y = {"home": "h", "away": "a", "draw": "x"}[r["y"]]
        rows.append(
            {
                "season": r["season"], "date": r["date"], "home": r["home"], "away": r["away"],
                "p": [h, x, a], "fav": fav, "pf": pf, "pdc": pf + x,
                "o_win": win_odds, "o_dc": dc_odds, "y": y,
                "hit_win": y == fav, "hit_dc": y in (fav, "x"),
                "bk": od["bookmaker"], "o_h": od["h"], "o_x": od["x"], "o_a": od["a"],
            }
        )
    return rows


def roi(bets: list[tuple[bool, float]]):
    if not bets:
        return None
    return sum((o - 1) if hit else -1 for hit, o in bets) / len(bets) * 100


def boot(bets: list[tuple[bool, float]], n=2000, seed=7):
    if len(bets) < 10:
        return (None, None)
    rnd = random.Random(seed)
    vals = []
    for _ in range(n):
        s = [bets[rnd.randrange(len(bets))] for _ in bets]
        vals.append(roi(s))
    vals.sort()
    return (vals[int(n * 0.05)], vals[int(n * 0.95)])


def line(name: str, bets: list[tuple[bool, float]], total: int) -> dict:
    if not bets:
        return {"name": name, "n": 0}
    hit = sum(h for h, _ in bets) / len(bets) * 100
    avg_o = sum(o for _, o in bets) / len(bets)
    lo, hi = boot(bets)
    return {"name": name, "n": len(bets), "share": round(len(bets) / total * 100), "hit": round(hit, 1),
            "avg_odds": round(avg_o, 2), "breakeven": round(100 / avg_o, 1), "roi": round(roi(bets), 1),
            "roi_lo": None if lo is None else round(lo, 1), "roi_hi": None if hi is None else round(hi, 1)}


def show(d: dict) -> None:
    if d["n"] == 0:
        print(f"{d['name']:<34} n=0")
        return
    ci = "" if d["roi_lo"] is None else f"[{d['roi_lo']:+.1f}; {d['roi_hi']:+.1f}]"
    print(f"{d['name']:<34} n={d['n']:>3} ({d['share']:>3}%) hit {d['hit']:5.1f}%  kurz Ø {d['avg_odds']:.2f} (break-even {d['breakeven']:.1f}%)  ROI {d['roi']:+6.1f}% {ci}")


def main() -> None:
    R = load()
    N = len(R)
    print(f"zápasů s kurzy: {N}  (Bet365: {sum(r['bk']=='Bet365' for r in R)})\n")

    # 1) model vs trh (log-loss na 1X2, trh bez marže)
    ll_m = ll_k = 0.0
    for r in R:
        inv = [1 / r["o_h"], 1 / r["o_x"], 1 / r["o_a"]]
        s = sum(inv)
        k = [v / s for v in inv]
        m = [v / 100 for v in r["p"]]
        idx = {"h": 0, "x": 1, "a": 2}[r["y"]]
        ll_m += -math.log(max(m[idx], 1e-6))
        ll_k += -math.log(max(k[idx], 1e-6))
    print(f"log-loss 1X2: model {ll_m/N:.4f} | trh (bez marže) {ll_k/N:.4f}\n")
    r_over = sum(1 / r["o_h"] + 1 / r["o_x"] + 1 / r["o_a"] for r in R) / N
    print(f"průměrná marže 1X2: {(r_over-1)*100:.1f} %\n")

    dc = lambda sel: [(r["hit_dc"], r["o_dc"]) for r in sel]  # noqa: E731
    win = lambda sel: [(r["hit_win"], r["o_win"]) for r in sel]  # noqa: E731
    out: dict = {"n": N}

    print("== neprohra favorita: podle P(neprohra) ==")
    out["dc_by_pdc"] = []
    for lo, hi in ((0, 65), (65, 70), (70, 75), (75, 80), (80, 85), (85, 101)):
        s = [r for r in R if lo <= r["pdc"] < hi]
        d = line(f"P(neprohra) {lo}–{min(hi,100)} %", dc(s), N)
        out["dc_by_pdc"].append(d | {"lo": lo, "hi": hi})
        show(d)
    print("\n== neprohra favorita: P(neprohra) >= T ==")
    out["dc_ge"] = []
    for T in (60, 65, 70, 72, 75, 78, 80, 85):
        d = line(f"P(neprohra) ≥ {T} %", dc([r for r in R if r["pdc"] >= T]), N)
        out["dc_ge"].append(d | {"t": T})
        show(d)

    print("\n== výhra favorita: podle P(výhry) ==")
    out["win_by_pf"] = []
    for lo, hi in ((0, 45), (45, 50), (50, 55), (55, 60), (60, 65), (65, 70), (70, 101)):
        s = [r for r in R if lo <= r["pf"] < hi]
        d = line(f"P(výhry) {lo}–{min(hi,100)} %", win(s), N)
        out["win_by_pf"].append(d | {"lo": lo, "hi": hi})
        show(d)
    print("\n== srovnání na stejných zápasech: výhra vs. neprohra ==")
    out["same_games"] = []
    for lo, hi in ((0, 50), (50, 55), (55, 60), (60, 65), (65, 70), (70, 101)):
        s = [r for r in R if lo <= r["pf"] < hi]
        a = line(f"P(výhry) {lo}–{min(hi,100)} % → výhra", win(s), N)
        b = line(f"P(výhry) {lo}–{min(hi,100)} % → neprohra", dc(s), N)
        out["same_games"].append({"lo": lo, "hi": hi, "win": a, "dc": b})
        show(a)
        show(b)

    print("\n== politika vždy tip: výhra, když P(výhry) ≥ Ts, jinak neprohra ==")
    out["policy"] = []
    for Ts in (50, 55, 58, 60, 62, 65, 70, 101):
        bets = [(r["hit_win"], r["o_win"]) if r["pf"] >= Ts else (r["hit_dc"], r["o_dc"]) for r in R]
        d = line(f"Ts={Ts if Ts<101 else '∞ (vždy neprohra)'}", bets, N)
        out["policy"].append(d | {"ts": Ts})
        show(d)
    bets = [(r["hit_win"], r["o_win"]) for r in R]
    d = line("vždy výhra favorita", bets, N)
    out["always_win"] = d
    show(d)

    print("\n== hodnota (value) filtr: sázet neprohru jen když P_model × kurz ≥ 1+edge ==")
    out["value_dc"] = []
    for edge in (0.0, 0.02, 0.04, 0.06):
        s = [r for r in R if r["pdc"] / 100 * r["o_dc"] >= 1 + edge]
        d = line(f"neprohra, edge ≥ {int(edge*100)} %", dc(s), N)
        out["value_dc"].append(d | {"edge": edge})
        show(d)

    print("\n== stabilita po sezónách (neprohra ≥ 75 % / vždy neprohra) ==")
    for season in ("2025/26", "2026/27"):
        s = [r for r in R if r["season"] == season]
        show(line(f"{season} neprohra ≥75", dc([r for r in s if r["pdc"] >= 75]), len(s)))
        show(line(f"{season} vždy neprohra", dc(s), len(s)))

    # držák pro Lab: zápasy (kompaktně)
    out["rows"] = [
        {"d": r["date"], "h": r["home"], "a": r["away"], "p": r["p"], "y": r["y"], "o": [r["o_h"], r["o_x"], r["o_a"]], "dc": r["o_dc"], "w": r["o_win"], "s": r["season"]}
        for r in R
    ]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"\nuloženo {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
