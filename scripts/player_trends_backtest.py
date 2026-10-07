#!/usr/bin/env python3
"""Zpětný test hráčských trendů: predikuje série hráče jeho další zápas?

Zdroj: frontend/public/data/catalog/player_matches/{liga}/*.json (jen odehrané zápasy, chybějící klíč ve statistice = 0).
Série se hledá v posledních N ligových zápasech týmu ve stejné sezóně. Hráč musí nastoupit ve všech.
Cíl: jestli hráč v dalším zápase týmu (pokud nastoupí) splní podmínku. Porovnává se se třemi základnami:
  control = hráči, kteří ve stejném okně všude nastoupili, ale sérii nemají,
  level   = jeho dlouhodobá míra před oknem (min. 8 startů),
  rozdíl proti level je ten skutečný přínos série.

Použití: python scripts/player_trends_backtest.py [league_id]
"""
from __future__ import annotations

import bisect
import json
import random
import sys
from collections import defaultdict
from math import sqrt
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEAGUE = int(sys.argv[1]) if len(sys.argv) > 1 else 262
SRC = ROOT / "frontend/public/data/catalog/player_matches" / str(LEAGUE)
OUT = ROOT / "scripts/.cache/player-trends-backtest.json"
MIN_HIST = 8
VALIDATION_FROM = "2025-07-01"  # dvě sezóny: 2025/26 a 2026/27

# (id, stat, práh, N, režim): režim "all" = splněno v každém z N, ("k", m) = alespoň m z N
RULES = [
    ("sh2_n3", "sh", 2, 3, "all"),
    ("sh2_n4", "sh", 2, 4, "all"),
    ("sh2_n5", "sh", 2, 5, "all"),
    ("sh3_n3", "sh", 3, 3, "all"),
    ("sh3_n4", "sh", 3, 4, "all"),
    ("sot1_n3", "sot", 1, 3, "all"),
    ("sot1_n4", "sot", 1, 4, "all"),
    ("sot1_n5", "sot", 1, 5, "all"),
    ("sot2_n3", "sot", 2, 3, "all"),
    ("g1_n2", "g", 1, 2, "all"),
    ("g1_n3", "g", 1, 3, "all"),
    ("y1_4of5", "y", 1, 5, 4),
    ("y1_3of3", "y", 1, 3, "all"),
    ("y1_3of4", "y", 1, 4, 3),
    ("y1_3of5", "y", 1, 5, 3),
    ("y1_2of2", "y", 1, 2, "all"),
]
# cíle pro každý stat: stejný práh a o jedna víc (pro sázku „2.5+ střel“ = práh 3)
TARGETS = {
    "sh": [2, 3],
    "sot": [1, 2],
    "g": [1],
    "y": [1],
}


def load():
    team_matches = defaultdict(dict)  # (tid, sezona) -> {fid: datum}
    players = {}
    for f in SRC.glob("*.json"):
        for p in json.load(open(f))["players"]:
            if p["role"] == "gk":
                continue
            apps = {}
            for m in p["matches"]:
                apps[m["fid"]] = m
                team_matches[(m["tid"], m["s"])][m["fid"]] = m["d"]
            players[p["id"]] = {"role": p["role"], "apps": apps}
    ordered = {k: [fid for fid, _ in sorted(v.items(), key=lambda kv: (kv[1], kv[0]))] for k, v in team_matches.items()}
    dates = {fid: d for v in team_matches.values() for fid, d in v.items()}
    return players, ordered, dates


def hit(st, stat, thr):
    return st.get(stat, 0) >= thr


def window_ok(sts, stat, thr, mode):
    flags = [hit(st, stat, thr) for st in sts]
    if mode == "all":
        return all(flags)
    return sum(flags) >= mode


def h2h(players, dates):
    """Série ve vzájemných zápasech: posledních N zápasů týmu proti stejnému soupeři (napříč sezonami)."""
    opp, tm = {}, defaultdict(list)  # (tid, fid)->oid ; (tid, oid)->[fid]
    for p in players.values():
        for m in p["apps"].values():
            if (m["tid"], m["fid"]) not in opp:
                opp[(m["tid"], m["fid"])] = m["oid"]
                tm[(m["tid"], m["oid"])].append(m["fid"])
    for v in tm.values():
        v.sort(key=lambda f: (dates[f], f))
    rules = [r for r in RULES if r[0] in ("sh2_n3", "sot1_n3", "g1_n2", "g1_n3", "y1_2of2", "y1_3of4")]
    inst, ctrl = defaultdict(list), defaultdict(list)
    for pid, p in players.items():
        apps = p["apps"]
        ds = sorted(m["d"] for m in apps.values())
        pref = {(st, th): _prefix(sorted(apps.values(), key=lambda m: (m["d"], m["fid"])), st, th) for st, ths in TARGETS.items() for th in ths}
        for fid, m in apps.items():
            seq = tm[(m["tid"], m["oid"])]
            i = seq.index(fid)
            for rid, stat, thr, n, mode in rules:
                n = min(n, 3) if mode == "all" else n
                if i < n:
                    continue
                win = seq[i - n : i]
                if not all(w in apps for w in win):
                    continue
                streak = window_ok([apps[w]["st"] for w in win], stat, thr, mode)
                k = bisect.bisect_left(ds, dates[win[0]])
                for tthr in TARGETS[stat]:
                    row = {"pid": pid, "hit": hit(m["st"], stat, tthr)}
                    if k >= MIN_HIST:
                        row["lvl"] = pref[(stat, tthr)][k] / k
                    (inst if streak else ctrl)[(rid, stat, tthr)].append(row)
    print("\nVZÁJEMNÉ ZÁPASY (hráč nastoupil ve všech N posledních zápasech týmu proti stejnému soupeři)")
    print(f"{'pravidlo':9} {'cíl':8} {'n':>5} {'série':>6} {'kontrola':>8} {'level':>6} {'přínos':>7}")
    for key, rows in sorted(inst.items()):
        if len(rows) < 15:
            continue
        lv = [r for r in rows if "lvl" in r]
        c = ctrl[key]
        print(f"{key[0]:9} {key[1]}>={key[2]:<4} {len(rows):>5} {sum(r['hit'] for r in rows)/len(rows):>6.1%} "
              f"{sum(r['hit'] for r in c)/len(c):>8.1%} {sum(r['lvl'] for r in lv)/len(lv):>6.1%} "
              f"{(sum(r['hit'] for r in lv)-sum(r['lvl'] for r in lv))/len(lv):>+7.1%}")


def main():
    players, ordered, dates = load()
    if "--h2h" in sys.argv:
        h2h(players, dates)
        return
    # historie po datech pro základnu level
    hist = {}
    for pid, p in players.items():
        apps = sorted(p["apps"].values(), key=lambda m: (m["d"], m["fid"]))
        hist[pid] = (
            [m["d"] for m in apps],
            {(stat, thr): _prefix(apps, stat, thr) for stat, thrs in TARGETS.items() for thr in thrs},
        )

    # instance[(rule, target)] = list of dicts
    inst = defaultdict(list)
    ctrl = defaultdict(list)
    for pid, p in players.items():
        apps = p["apps"]
        # týmy / sezóny, kde hrál
        keys = {(m["tid"], m["s"]) for m in apps.values()}
        for key in keys:
            seq = ordered[key]
            for i in range(1, len(seq)):
                nxt = seq[i]
                for rid, stat, thr, n, mode in RULES:
                    if i < n:
                        continue
                    win = seq[i - n : i]
                    if not all(fid in apps for fid in win):
                        continue
                    sts = [apps[fid]["st"] for fid in win]
                    streak = window_ok(sts, stat, thr, mode)
                    played = nxt in apps
                    start_date = dates[win[0]]
                    for tthr in TARGETS[stat]:
                        row = {"pid": pid, "d": dates[nxt], "played": played}
                        if played:
                            row["hit"] = hit(apps[nxt]["st"], stat, tthr)
                        # level před oknem
                        ds, pref = hist[pid]
                        k = bisect.bisect_left(ds, start_date)
                        if k >= MIN_HIST:
                            row["lvl"] = pref[(stat, tthr)][k] / k
                        k2 = bisect.bisect_left(ds, dates[nxt])  # vše před cílovým zápasem, včetně okna
                        if k2 >= 10:
                            row["lvl10"] = (pref[(stat, tthr)][k2] - pref[(stat, tthr)][k2 - 10]) / 10
                        (inst if streak else ctrl)[(rid, stat, tthr)].append(row)

    report = []
    rng = random.Random(7)
    for (rid, stat, tthr), rows in sorted(inst.items()):
        played = [r for r in rows if r["played"]]
        cpl = [r for r in ctrl[(rid, stat, tthr)] if r["played"]]
        if len(played) < 15:
            continue
        rate = sum(r["hit"] for r in played) / len(played)
        crate = sum(r["hit"] for r in cpl) / len(cpl) if cpl else None
        lv = [r for r in played if "lvl" in r]
        lvl = sum(r["lvl"] for r in lv) / len(lv) if lv else None
        lv_rate = sum(r["hit"] for r in lv) / len(lv) if lv else None
        l10 = [r for r in played if "lvl10" in r]
        lvl10 = sum(r["lvl10"] for r in l10) / len(l10) if l10 else None
        l10_rate = sum(r["hit"] for r in l10) / len(l10) if l10 else None
        # clusterový bootstrap po hráčích: rozdíl proti level
        by_pl = defaultdict(list)
        for r in lv:
            by_pl[r["pid"]].append(r)
        pids = list(by_pl)
        diffs = []
        for _ in range(400):
            samp = [rng.choice(pids) for _ in pids]
            rs = [r for q in samp for r in by_pl[q]]
            diffs.append(sum(r["hit"] - r["lvl"] for r in rs) / len(rs))
        diffs.sort()
        lo, hi = diffs[int(0.025 * len(diffs))], diffs[int(0.975 * len(diffs))]

        def split(sel):
            a = [r for r in played if sel(r["d"])]
            return (round(sum(r["hit"] for r in a) / len(a), 3), len(a)) if a else None

        report.append(
            {
                "rule": rid,
                "target": f"{stat}>={tthr}",
                "instances": len(rows),
                "play_next": round(len(played) / len(rows), 3),
                "n": len(played),
                "players": len({r["pid"] for r in played}),
                "hit": round(rate, 3),
                "control": round(crate, 3) if crate is not None else None,
                "level": round(lvl, 3) if lvl is not None else None,
                "hit_on_level_subset": round(lv_rate, 3) if lv_rate is not None else None,
                "excess_vs_level": round(lv_rate - lvl, 3) if lvl is not None else None,
                "excess_ci95": [round(lo, 3), round(hi, 3)],
                "recent10": round(lvl10, 3) if lvl10 is not None else None,
                "excess_vs_recent10": round(l10_rate - lvl10, 3) if lvl10 is not None else None,
                "train": split(lambda d: d < VALIDATION_FROM),
                "valid": split(lambda d: d >= VALIDATION_FROM),
            }
        )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=1))
    print(f"{'pravidlo':9} {'cíl':8} {'n':>5} {'hráčů':>5} {'hraje':>5} {'série':>6} {'kontrola':>8} {'level':>6} {'přínos':>7} {'vs10':>6}  95% CI           train / valid")
    for r in report:
        ci = r["excess_ci95"]
        print(
            f"{r['rule']:9} {r['target']:8} {r['n']:>5} {r['players']:>5} {r['play_next']:>5.0%} "
            f"{r['hit']:>6.1%} {_f(r['control']):>8} {_f(r['level']):>6} {r['excess_vs_level']:>+7.1%} {r['excess_vs_recent10']:>+6.1%}  "
            f"[{ci[0]:+.1%}, {ci[1]:+.1%}]  {r['train']} / {r['valid']}"
        )


def _f(x):
    return f"{x:.1%}" if x is not None else "-"


def _prefix(apps, stat, thr):
    out = [0]
    for m in apps:
        out.append(out[-1] + (1 if m["st"].get(stat, 0) >= thr else 0))
    return out


if __name__ == "__main__":
    main()
