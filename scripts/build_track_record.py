#!/usr/bin/env python3
"""Podklad pro stránku Výsledky: frontend/public/data/track_record.json (rozcestník) + živá kniha po ligách.

Dvě části, které se nesmí míchat:
  live      predikce zamčené před výkopem (ledger/predictions.json), počítá se z nich při každém běhu, po ligách
  backtest  zpětný test po ligách a sezónách: samostatné soubory track_record/{liga}/{sezóna}.json
            (scripts/build_backtest.py). Tady se jen vypíše, které existují.

Model je ve všech částech tentýž (sim_v2, verze v2.1). Žádné API.

    python scripts/build_track_record.py
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

import tip_rule
from build_backtest import calibration, tip_summary

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "frontend" / "public" / "data"
OUT = DATA / "track_record.json"
SHARDS = DATA / "track_record"
LEDGER = DATA / "ledger" / "predictions.json"
KEYS = ("h", "d", "a")
LEAGUES = [  # pořadí v přepínači; id = SportMonks
    (262, "chance", "Chance Liga"),
    (8, "pl", "Premier League"),
    (82, "bl", "Bundesliga"),
    (564, "ll", "La Liga"),
    (72, "ere", "Eredivisie"),
]


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


def build_live(entries: list[dict], since: str | None) -> dict:
    done = [e for e in entries if e.get("result")]
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    out: dict = {
        "since": since,
        "locked": len(entries),
        "settled": len(done),
        "upcoming": [
            {"fid": e["fid"], "kickoff": e["kickoff"], "home": e["home"]["name"], "away": e["away"]["name"], "locked_at": e.get("locked_at")}
            for e in entries
            if not e.get("result") and e["kickoff"] > now
        ][:10],
    }
    if not done:
        return out
    model, market, pairs, rows, tip_items = [], [], [], [], []
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
        rows.append(
            {
                "kickoff": e["kickoff"],
                "home": e["home"]["name"],
                "away": e["away"]["name"],
                "score": f'{e["result"]["hg"]}-{e["result"]["ag"]}',
                "y": y,
                "p": [e["model"]["h"], e["model"]["d"], e["model"]["a"]],
                "market": [e["market"]["h"], e["market"]["d"], e["market"]["a"]] if e.get("market") else None,
                "locked_at": e.get("locked_at"),
                **({"tip": {"x": tip["x"], "ou": tip.get("ou")}} if tip else {}),
            }
        )
    if tip_items:
        out["tips"] = tip_summary(tip_items)
    out["model"] = block(model)
    if len(market) == len(model):
        out["market"] = block(market)
    out["calibration"] = calibration(pairs)
    out["matches"] = sorted(rows, key=lambda r: r["kickoff"], reverse=True)
    return out


def seasons_of(slug: str) -> list[dict]:
    out = []
    for path in sorted((SHARDS / slug).glob("*.json"), reverse=True):
        d = json.loads(path.read_text(encoding="utf-8"))
        out.append({"season": d["season"], "file": path.stem, "n": d["n"], "phase": d.get("phase")})
    return out


def main() -> None:
    prev = load(OUT, {})
    ledger = load(LEDGER, {"entries": []})
    entries = ledger.get("entries", [])
    leagues = []
    for lid, slug, name in LEAGUES:
        mine = [e for e in entries if int(e.get("league_id") or 262) == lid]
        leagues.append({"id": lid, "slug": slug, "name": name, "seasons": seasons_of(slug), "live": build_live(mine, ledger.get("started_at"))})
    payload = {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "model_version": "v2.1", "default_league": 262, "leagues": leagues}
    old = {k: v for k, v in prev.items() if k != "generated_at"}
    new = {k: v for k, v in payload.items() if k != "generated_at"}
    if old == new:
        print("výsledky: beze změny")
        return
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print("výsledky: " + ", ".join(f"{l['slug']} {len(l['seasons'])} sezón, živě {l['live']['locked']}/{l['live']['settled']}" for l in leagues))


if __name__ == "__main__":
    main()
