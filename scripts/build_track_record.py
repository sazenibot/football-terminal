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

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "frontend" / "public" / "data"
OUT = DATA / "track_record.json"
LEDGER = DATA / "ledger" / "predictions.json"
BACKTEST = ROOT / "scripts" / ".cache" / "sim-v2-backtest.json"
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
        "matches": [
            {
                "date": r["date"],
                "home": r["home"],
                "away": r["away"],
                "score": r["score"],
                "y": r["y"],
                "p": [r["opp"]["home_win_pct"], r["opp"]["draw_pct"], r["opp"]["away_win_pct"]],
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
    rows = []
    for e in done:
        y = outcome(e["result"]["hg"], e["result"]["ag"])
        model.append(score(e["model"], y))
        if e.get("market"):
            market.append(score(e["market"], y))
        for k in KEYS:
            pairs.append((e["model"][k], y == k))
        rows.append({
            "kickoff": e["kickoff"],
            "home": e["home"]["name"],
            "away": e["away"]["name"],
            "score": f'{e["result"]["hg"]}-{e["result"]["ag"]}',
            "y": y,
            "p": [e["model"]["h"], e["model"]["d"], e["model"]["a"]],
            "market": [e["market"]["h"], e["market"]["d"], e["market"]["a"]] if e.get("market") else None,
            "locked_at": e.get("locked_at"),
        })
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
