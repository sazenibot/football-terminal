#!/usr/bin/env python3
"""Archiv dat z PitchAPI (bez kvóty): hlavní zdroj xG, střel, sestav a hráčských statistik pro všech 5 lig.

Pokrytí: PL / Bundesliga / La Liga / Eredivisie od 2021/22, Chance Liga od 2024/25 (starší jen v TheStatsAPI).
Pro každou ligu a sezónu seznam zápasů a po zápasech surové odpovědi:
  stats (týmové statistiky vč. xG), shots (střely se souřadnicemi a xG), lineups, events, players (hráčské statistiky)

Výstup (mimo git):  data-archive/pitchapi/{liga}/
  matches-{sezóna}.json   seznam zápasů
  {druh}.jsonl            jeden řádek na zápas: {"id", "status", "body"}
Přerušitelné (co je v souboru, se nevolá znovu). Paralelně 4 vlákna.

    python scripts/pitch_archive.py --leagues pl,bl,ll,ere,chance --kinds stats
    python scripts/pitch_archive.py --leagues pl,bl,ll,ere,chance --kinds shots,lineups,events,players
"""
from __future__ import annotations

import argparse
import json
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import ingest_pitchapi as ip  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data-archive" / "pitchapi"
LEAGUES = {
    "chance": ("l_0F4I4F", "Chance Liga", 2024),
    "pl": ("l_4WFCIZ", "Premier League", 2021),
    "bl": ("l_1Isor4", "Bundesliga", 2021),
    "ll": ("l_0ErfuF", "LaLiga", 2021),
    "ere": ("l_4H43wr", "Eredivisie", 2021),
}
WORKERS = 4
KEY = ip.load_key()


def get(path: str) -> tuple[int, object]:
    for attempt in range(8):
        code, raw = ip.http_get(ip.BASE + path, KEY)
        if code == 200:
            try:
                return 200, json.loads(raw)
            except ValueError:
                return 200, {"raw": raw[:300]}
        if code == 404:
            return 404, {}
        time.sleep(2 * (attempt + 1))
    return 0, {}


def current_start() -> int:
    t = date.today()
    return t.year if t.month >= 7 else t.year - 1


def matches_of(slug: str) -> list[dict]:
    lid, _, first = LEAGUES[slug]
    out: list[dict] = []
    for y in range(first, current_start() + 1):
        label = f"{y}/{y + 1}"
        path = OUT / slug / f"matches-{y}-{y + 1}.json"
        # současná sezóna se obnovuje vždy, uzavřené stačí jednou
        if path.exists() and y < current_start():
            rows = json.loads(path.read_text())
        else:
            code, body = get(f"/leagues/{lid}/matches?season={label}")
            rows = ((body or {}).get("data") or {}).get("matches") or [] if code == 200 else []
            if rows:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(rows, ensure_ascii=False))
            elif path.exists():
                rows = json.loads(path.read_text())
        for r in rows:
            r["season"] = label
        out += rows
    return out


def done_ids(path: Path) -> set[str]:
    ids: set[str] = set()
    if path.exists():
        with path.open(encoding="utf-8") as f:
            for line in f:
                try:
                    ids.add(json.loads(line)["id"])
                except (ValueError, KeyError):
                    pass
    return ids


def run(slug: str, kinds: list[str]) -> None:
    _, name, _ = LEAGUES[slug]
    rows = matches_of(slug)
    finished = [m for m in rows if m.get("status") == "finished"]
    print(f"[{name}] zápasů {len(rows)}, dohraných {len(finished)}", flush=True)
    for kind in kinds:
        path = OUT / slug / f"{kind}.jsonl"
        have = done_ids(path)
        todo = [m for m in finished if m["id"] not in have]
        print(f"[{name}] {kind}: hotovo {len(have)}, zbývá {len(todo)}", flush=True)
        lock = threading.Lock()
        counter = {"n": 0}
        with path.open("a", encoding="utf-8") as f:

            def work(m: dict) -> None:
                status, body = get(f"/matches/{m['id']}/{kind}")
                line = json.dumps({"id": m["id"], "status": status, "body": body}, ensure_ascii=False) + "\n"
                with lock:
                    f.write(line)
                    f.flush()
                    counter["n"] += 1
                    if counter["n"] % 200 == 0:
                        print(f"[{name}] {kind}: {counter['n']}/{len(todo)}", flush=True)

            with ThreadPoolExecutor(WORKERS) as pool:
                list(pool.map(work, todo))
    print(f"[{name}] hotovo", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--leagues", default="pl,bl,ll,ere,chance")
    ap.add_argument("--kinds", default="stats")
    a = ap.parse_args()
    for slug in a.leagues.split(","):
        run(slug.strip(), [k.strip() for k in a.kinds.split(",")])


if __name__ == "__main__":
    main()
