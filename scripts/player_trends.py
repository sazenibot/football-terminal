#!/usr/bin/env python3
"""Hráčské trendy pro Match Center: série střel a střel na bránu v posledních ligových zápasech týmu.

Vstup:  catalog/player_matches/{liga}/*.json   (zápasy hráčů, doplňuje se denně)
Výstup: frontend/public/data/player_trends/{liga}.json   (malý soubor, jen aktuální stav týmů)

Pravidla (ověřená zpětným testem, viz player_trends_backtest.py):
  střely            >= 2 v každém z posledních N ligových zápasů týmu v aktuální sezóně
  střely na bránu   >= 1 v každém z posledních N ligových zápasů týmu v aktuální sezóně
  N >= 3. Hráč musí v každém z těch zápasů nastoupit, jinak série není.
Góly a karty se záměrně nesledují: gólové série zpětný test neprokázal, karty se po sérii opakují méně než běžně.

Žádné API, jen uložené JSON. Idempotentní.

    python scripts/player_trends.py [--league 262]
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "frontend" / "public" / "data" / "catalog"
OUT_DIR = ROOT / "frontend" / "public" / "data" / "player_trends"

RULES = {"sh": 2, "sot": 1}  # stat -> minimum za zápas
MIN_LEN = 3
MAX_PER_TEAM = 8


def load(league: int):
    base = CATALOG / "player_matches" / str(league)
    team_matches = defaultdict(dict)  # (tid, sezóna) -> {fid: datum}
    players = {}
    current = None
    for f in sorted(base.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        current = d.get("current_season_id") or current
        for p in d["players"]:
            if p.get("role") == "gk":
                continue
            apps = {}
            for m in p["matches"]:
                apps[m["fid"]] = m
                team_matches[(m["tid"], m["s"])][m["fid"]] = m["d"]
            players[p["id"]] = {"name": p["name"], "role": p.get("role"), "apps": apps}
    ordered = {k: sorted(v, key=lambda fid: (v[fid], fid)) for k, v in team_matches.items()}
    dates = {fid: d for v in team_matches.values() for fid, d in v.items()}
    return players, ordered, dates, current


POSITION = {25: "def", 26: "mid", 27: "att"}  # SportMonks position_id


def profile(pid: int, fallback_name: str, fallback_role: str | None) -> tuple[str, str | None]:
    """Zobrazované jméno (např. „T. Chorý“) a pozice z katalogu hráče; bez katalogu jméno a role z indexu."""
    path = CATALOG / "players" / f"{pid}.json"
    if path.exists():
        try:
            p = json.loads(path.read_text(encoding="utf-8"))
            return p.get("common_name") or p.get("name") or fallback_name, POSITION.get(p.get("position_id")) or fallback_role
        except (OSError, ValueError):
            pass
    return fallback_name, fallback_role


def build(league: int) -> dict | None:
    players, ordered, dates, current = load(league)
    if not players or current is None:
        return None
    teams: dict[str, dict] = {}
    by_team = defaultdict(list)  # tid -> hráči, kteří nastoupili v posledním zápase týmu
    for (tid, season), seq in ordered.items():
        if season != current or len(seq) < MIN_LEN:
            continue
        by_team[tid] = seq
    for tid, seq in by_team.items():
        items = []
        last = seq[-1]
        for pid, p in players.items():
            apps = p["apps"]
            if last not in apps or apps[last]["tid"] != tid:
                continue
            row = {}
            for stat, thr in RULES.items():
                vals = []
                for fid in reversed(seq):
                    m = apps.get(fid)
                    if m is None or m["st"].get(stat, 0) < thr:
                        break
                    vals.append(m["st"].get(stat, 0))
                if len(vals) >= MIN_LEN:
                    row[stat] = {"len": len(vals), "v": vals[::-1]}
            if row:
                name, role = profile(pid, p["name"], p["role"])
                items.append({"id": pid, "n": name, "r": role, **row})
        items.sort(key=lambda r: (-max(r.get(s, {"len": 0})["len"] for s in RULES), -sum(r.get(s, {"len": 0})["len"] for s in RULES), r["n"]))
        teams[str(tid)] = {"asof": dates[last], "last_fid": last, "items": items[:MAX_PER_TEAM]}
    return {
        "v": 1,
        "league_id": league,
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "rules": RULES,
        "min_len": MIN_LEN,
        "teams": teams,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--league", type=int)
    args = ap.parse_args()
    leagues = [args.league] if args.league else sorted(int(p.name) for p in (CATALOG / "player_matches").iterdir() if p.is_dir())
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for lid in leagues:
        data = build(lid)
        if not data:
            print(f"liga {lid}: bez dat")
            continue
        path = OUT_DIR / f"{lid}.json"
        # beze změny dat neměnit soubor (generated_at by zbytečně dělal commit)
        if path.exists():
            old = json.loads(path.read_text(encoding="utf-8"))
            if {k: v for k, v in old.items() if k != "generated_at"} == {k: v for k, v in data.items() if k != "generated_at"}:
                print(f"liga {lid}: beze změny")
                continue
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        n = sum(len(t["items"]) for t in data["teams"].values())
        print(f"liga {lid}: {len(data['teams'])} týmů, {n} hráčů se sérií → {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
