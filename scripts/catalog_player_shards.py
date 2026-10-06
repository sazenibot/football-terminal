#!/usr/bin/env python3
"""Rozdělení velkého ligového indexu hráčů na malé soubory pro stránku hráče.

Vstup:  catalog/leagues/{id}.players.json  (všechny zápasy všech hráčů, ~8 MB u Chance Ligy;
        zapisuje ho enrich_catalog.py, denně ho doplňuje přírůstek)
Výstup: catalog/player_matches/{id}/{shard}.json   zápasy hráčů, shard = id hráče % 32
        catalog/player_pools/{id}/{sezona|all}.json souhrny hráčů pro pořadí a srovnání

Prohlížeč si pro stránku hráče stáhne jeden shard (~250 kB) a jeden pool vybrané sezóny (~50 kB),
ne celý index. Pořadí se počítá z pool souborů, které už mají hráče sečtené podle sezóny,
domácí/venku a podzimu/jara. Žádné API, jen uložené JSON. Idempotentní.

    python scripts/catalog_player_shards.py [--league 262]
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "frontend" / "public" / "data" / "catalog"

SHARDS = 32
ROLES = ["att", "mid", "def", "gk"]
# Pořadí musí sedět s POOL_KEYS ve frontend/src/lib/playerCatalog.ts
KEYS = ["mn", "g", "a", "sh", "sot", "kp", "dr", "ps", "cr", "dw", "aw", "tk", "it", "cl", "sv", "gc", "cs", "f", "y", "r"]


def write(path: Path, payload: dict) -> bool:
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return True


def num(v: float) -> float | int:
    v = round(float(v), 2)
    return int(v) if v.is_integer() else v


def cells_of(match: dict) -> list[tuple[str, str]]:
    """Ve kterých buňkách (doma/venku × podzim/jaro) zápas je. Stejná pravidla jako filterMatches ve frontendu."""
    venues = ["all"] + (["home"] if match.get("h") == 1 else ["away"] if match.get("h") == 0 else [])
    month = int((match.get("d") or "0000-00")[5:7] or 0)
    halves = ["all"]
    if not month or month >= 7:
        halves.append("autumn")
    if not month or month < 7:
        halves.append("spring")
    return [(v, h) for v in venues for h in halves]


def games_for(season_key: str, seasons: list[dict], players: list[dict]) -> int:
    """Počet zápasů soutěže ve výběru. Jako gamesInSlice: hodnota ze sezóny, jinak unikátní zápasy z indexu."""
    if season_key != "all":
        hit = next((s.get("games") for s in seasons if str(s["id"]) == season_key), None)
        if hit:
            return int(hit)
    else:
        total = sum(s.get("games") or 0 for s in seasons)
        if total:
            return int(total)
    fids = {m["fid"] for p in players for m in p["matches"] if season_key == "all" or str(m.get("s")) == season_key}
    return len(fids)


def build_league(path: Path) -> None:
    index = json.loads(path.read_text(encoding="utf-8"))
    lid = int(index["league_id"])
    players = index.get("players", [])
    seasons = index.get("seasons", [])
    role_idx = {r: i for i, r in enumerate(ROLES)}

    # 1) shardy se zápasy
    shards: dict[int, list] = defaultdict(list)
    for p in players:
        shards[p["id"] % SHARDS].append(p)
    changed = 0
    for shard in range(SHARDS):
        payload = {
            "league_id": lid,
            "current_season_id": index.get("current_season_id"),
            "seasons": seasons,
            "players": sorted(shards.get(shard, []), key=lambda p: p["id"]),
        }
        changed += write(CATALOG / "player_matches" / str(lid) / f"{shard}.json", payload)

    # 2) pooly: součty hráčů v buňkách sezóna × doma/venku × podzim/jaro
    acc: dict[tuple[str, str, str], dict[int, list]] = defaultdict(dict)
    for p in players:
        for m in p["matches"]:
            st = m.get("st") or {}
            for season_key in (str(m.get("s")), "all"):
                for venue, half in cells_of(m):
                    row = acc[(season_key, venue, half)].setdefault(
                        p["id"], [p["id"], role_idx.get(p.get("role"), 1), p.get("team_id") or 0, 0] + [0.0] * len(KEYS)
                    )
                    row[3] += 1
                    for i, key in enumerate(KEYS):
                        row[4 + i] += st.get(key, 0) or 0

    season_keys = sorted({k[0] for k in acc})
    for season_key in season_keys:
        cells = {}
        for (sk, venue, half), rows in acc.items():
            if sk != season_key:
                continue
            cells[f"{venue}.{half}"] = [[row[0], row[1], row[2], row[3]] + [num(v) for v in row[4:]] for row in sorted(rows.values())]
        payload = {
            "league_id": lid,
            "season": season_key,
            "games": games_for(season_key, seasons, players),
            "keys": KEYS,
            "cells": dict(sorted(cells.items())),
        }
        changed += write(CATALOG / "player_pools" / str(lid) / f"{season_key}.json", payload)
    print(f"liga {lid}: {len(players)} hráčů, {SHARDS} shardů, {len(season_keys)} poolů, změněno souborů: {changed}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--league", type=int)
    args = parser.parse_args()
    for path in sorted((CATALOG / "leagues").glob("*.players.json")):
        if args.league and not path.name.startswith(f"{args.league}."):
            continue
        build_league(path)


if __name__ == "__main__":
    main()
