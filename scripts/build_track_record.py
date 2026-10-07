#!/usr/bin/env python3
"""Podklad pro stránku Výsledky: frontend/public/data/track_record.json

Dvě části, které se nesmí míchat:
  live      predikce zamčené před výkopem (ledger/predictions.json), počítá se z nich při každém běhu
  backtest  zpětný test na dohraných zápasech sezóny (scripts/.cache/sim-v2-backtest.json, walk-forward).
            Cache není v gitu. Když chybí, zůstane v souboru poslední uložený backtest.

Model v obou částech je ten, který používá Match Center (soupeř-adjustovaný Maher + Dixon-Coles, klíč `opp`).
Žádné API.

    python scripts/build_track_record.py
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

import tip_rule

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "frontend" / "public" / "data"
OUT = DATA / "track_record.json"
LEDGER = DATA / "ledger" / "predictions.json"
BACKTEST = ROOT / "scripts" / ".cache" / "sim-v2-backtest.json"
BACKTEST_FULL = ROOT / "scripts" / ".cache" / "sim-backtest-full.json"  # góly + kalibrované trhy, dvě sezóny
BINS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 100]
KEYS = ("h", "d", "a")


def load(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def outcome(hg: int, ag: int) -> str:
    return "h" if hg > ag else "a" if hg < ag else "d"


def score(probs: dict, y: str) -> dict:
    p = {k: max(probs[k], 0.01) / 100 for k in KEYS}
    total = sum(p.values())
    p = {k: v / total for k, v in p.items()}
    return {
        "logloss": -math.log(p[y]),
        "brier": sum((p[k] - (1.0 if k == y else 0.0)) ** 2 for k in KEYS),
        "hit": max(p, key=p.get) == y,
    }


def mean(rows: list[dict], key: str) -> float:
    return sum(r[key] for r in rows) / len(rows)


def tip_summary(items: list[dict]) -> dict:
    """items: {"x": tip 1X2, "ou": tip gólů nebo None, "hg", "ag"} -> počty trefených tipů."""
    def cnt(sel):
        return {"n": len(sel), "hits": sum(sel)}
    x_all = [tip_rule.hit_1x2(i["x"], i["hg"], i["ag"]) for i in items]
    x_win = [tip_rule.hit_1x2(i["x"], i["hg"], i["ag"]) for i in items if i["x"]["k"] == "win"]
    x_dc = [tip_rule.hit_1x2(i["x"], i["hg"], i["ag"]) for i in items if i["x"]["k"] == "dc"]
    ou_items = [i for i in items if i.get("ou")]
    ou_all = [tip_rule.hit_ou(i["ou"], i["hg"], i["ag"]) for i in ou_items]
    ou_over = [tip_rule.hit_ou(i["ou"], i["hg"], i["ag"]) for i in ou_items if i["ou"]["k"] == "over"]
    ou_under = [tip_rule.hit_ou(i["ou"], i["hg"], i["ag"]) for i in ou_items if i["ou"]["k"] == "under"]
    ou_strong = [tip_rule.hit_ou(i["ou"], i["hg"], i["ag"]) for i in ou_items if i["ou"]["p"] >= 60]
    return {
        "x12": {**cnt(x_all), "win": cnt(x_win), "dc": cnt(x_dc)},
        "ou25": {
            **cnt(ou_all),
            "over": cnt(ou_over),
            "under": cnt(ou_under),
            "strong": cnt(ou_strong),
            "actual_over": sum(1 for i in ou_items if i["hg"] + i["ag"] > tip_rule.OU_LINE),
        },
    }


def block(scored: list[dict]) -> dict:
    return {
        "n": len(scored),
        "accuracy": round(100 * sum(r["hit"] for r in scored) / len(scored), 1),
        "logloss": round(mean(scored, "logloss"), 4),
        "brier": round(mean(scored, "brier"), 4),
    }


def calibration(pairs: list[tuple[float, bool]]) -> list[dict]:
    out = []
    for lo, hi in zip(BINS, BINS[1:]):
        sel = [(p, hit) for p, hit in pairs if lo <= p < hi or (hi == 100 and p == 100)]
        if sel:
            out.append({
                "lo": lo,
                "hi": hi,
                "n": len(sel),
                "predicted": round(sum(p for p, _ in sel) / len(sel), 1),
                "actual": round(100 * sum(hit for _, hit in sel) / len(sel), 1),
            })
    return out


def build_backtest(prev: dict | None) -> dict | None:
    if not BACKTEST.exists():
        return prev
    raw = json.loads(BACKTEST.read_text(encoding="utf-8"))
    rows = raw["matches"]
    scored, pairs, always_home = [], [], 0
    for r in rows:
        s = r["s_opp"]
        scored.append({"logloss": s["logloss"], "brier": s["brier"], "hit": s["hit"]})
        p = r["opp"]
        for k, key in zip(KEYS, ("home_win_pct", "draw_pct", "away_win_pct")):
            pairs.append((p[key], r["y"] == {"h": "home", "d": "draw", "a": "away"}[k]))
        always_home += r["y"] == "home"
    n = len(rows)
    full = json.loads(BACKTEST_FULL.read_text(encoding="utf-8"))["rows"] if BACKTEST_FULL.exists() else []
    full_idx = {(r["date"], r["home"]): r for r in full if r["season"] == "2026/27"}

    def tipped(r: dict, src: dict | None) -> dict | None:
        """Tip podle stejného pravidla jako v živé knize; goly a Over 2,5 z kalibrovaného modelu (opp_cal)."""
        if not src:
            return None
        o, c = src["opp"], src["opp_cal"]
        model = {"h": o["home_win_pct"], "d": o["draw_pct"], "a": o["away_win_pct"], "over25": c.get("over25_pct")}
        tip = tip_rule.make_tip(model)
        tip["hg"], tip["ag"] = src["hg"], src["ag"]
        return tip

    tips_by_key = {(r["date"], r["home"]): tipped(r, full_idx.get((r["date"], r["home"]))) for r in rows}
    tuning = None
    prev_season = [r for r in full if r["season"] == "2025/26"]
    if prev_season:
        pt = [tipped(r, r) for r in prev_season]
        tuning = {"season": "2025/26", "n": len(pt), **tip_summary(pt)}
    cur_tips = [t for t in tips_by_key.values() if t]
    return {
        "season": raw.get("season"),
        "league": raw.get("league"),
        "method": raw.get("walk_forward"),
        "n": n,
        "from": min(r["date"] for r in rows),
        "to": max(r["date"] for r in rows),
        "actual_1x2": raw.get("actual_1x2"),
        "model": block(scored),
        "baselines": {
            "frequency_logloss": raw.get("naive_logloss_frequency"),
            "always_home_accuracy": round(100 * always_home / n, 1),
        },
        "calibration": calibration(pairs),
        "tips": tip_summary(cur_tips) if cur_tips else None,
        "tips_tuning": tuning,
        "matches": [
            {
                "date": r["date"],
                "home": r["home"],
                "away": r["away"],
                "score": r["score"],
                "y": r["y"],
                "p": [r["opp"]["home_win_pct"], r["opp"]["draw_pct"], r["opp"]["away_win_pct"]],
                **({"tip": {"x": tips_by_key[(r["date"], r["home"])]["x"], "ou": tips_by_key[(r["date"], r["home"])].get("ou")}} if tips_by_key.get((r["date"], r["home"])) else {}),
            }
            for r in sorted(rows, key=lambda r: r["date"], reverse=True)
        ],
    }


def build_live() -> dict:
    ledger = load(LEDGER, {"entries": []})
    entries = ledger.get("entries", [])
    done = [e for e in entries if e.get("result")]
    out: dict = {
        "since": ledger.get("started_at"),
        "locked": len(entries),
        "settled": len(done),
        "upcoming": [
            {"fid": e["fid"], "kickoff": e["kickoff"], "home": e["home"]["name"], "away": e["away"]["name"], "locked_at": e.get("locked_at")}
            for e in entries
            if not e.get("result") and e["kickoff"] > datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        ][:10],
    }
    if not done:
        return out
    model, market, pairs = [], [], []
    rows, tip_items = [], []
    for e in done:
        y = outcome(e["result"]["hg"], e["result"]["ag"])
        model.append(score(e["model"], y))
        if e.get("market"):
            market.append(score(e["market"], y))
        for k in KEYS:
            pairs.append((e["model"][k], y == k))
        tip = e.get("tip") or tip_rule.make_tip(e["model"])
        if tip:
            tip_items.append({"x": tip["x"], "ou": tip.get("ou"), "hg": e["result"]["hg"], "ag": e["result"]["ag"]})
        rows.append({
            "kickoff": e["kickoff"],
            "home": e["home"]["name"],
            "away": e["away"]["name"],
            "score": f'{e["result"]["hg"]}-{e["result"]["ag"]}',
            "y": y,
            "p": [e["model"]["h"], e["model"]["d"], e["model"]["a"]],
            "market": [e["market"]["h"], e["market"]["d"], e["market"]["a"]] if e.get("market") else None,
            "locked_at": e.get("locked_at"),
            **({"tip": {"x": tip["x"], "ou": tip.get("ou")}} if tip else {}),
        })
    if tip_items:
        out["tips"] = tip_summary(tip_items)
    out["model"] = block(model)
    if len(market) == len(model):
        out["market"] = block(market)
    out["calibration"] = calibration(pairs)
    out["matches"] = sorted(rows, key=lambda r: r["kickoff"], reverse=True)
    return out


def main() -> None:
    prev = load(OUT, {})
    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "league": "Chance Liga",
        "live": build_live(),
        "backtest": build_backtest(prev.get("backtest")),
    }
    old = {k: v for k, v in prev.items() if k != "generated_at"}
    new = {k: v for k, v in payload.items() if k != "generated_at"}
    if old == new:
        print("výsledky: beze změny")
        return
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    bt = payload["backtest"]
    print(f"výsledky: live {payload['live']['locked']} zamčeno / {payload['live']['settled']} vypořádáno; backtest n={bt['n'] if bt else 0}")


if __name__ == "__main__":
    main()
