#!/usr/bin/env python3
"""Archiv dat z TheStatsAPI (přístup končí, proto stahujeme všechno, co se bude hodit).

Pro každou ligu: seznam zápasů od 2021-08-01, a po zápasech surové odpovědi:
Co umí PitchAPI (stats vč. xG, shots, lineups, events, players; PL/BL/LL/ERE od 2021/22, Chance od 2024/25), z TheStatsAPI
neberu. Tady zůstává jen to, co PitchAPI nemá: odds, referee a u Chance celá starší historie (do 2024/25).

Výstup (mimo git, viz .gitignore):  data-archive/thestatsapi/{liga}/
  matches.json        seznam zápasů (skóre, stav, sezóna)
  meta.json           soutěž, sezóny, týmy
  {druh}.jsonl        jeden řádek na zápas: {"id": ..., "status": 200, "body": ...}

Idempotentní a přerušitelné: co už je v souboru, se znovu nevolá. Sériově (429 → čekání podle retry-after).

    python scripts/ts_archive.py --leagues chance,pl,bl,ll,ere --kinds stats,odds
    python scripts/ts_archive.py --leagues chance,pl,bl,ll,ere --kinds lineups,player-stats,shotmap,referee
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
import urllib.parse
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data-archive" / "thestatsapi"
BASE = "https://api.thestatsapi.com/api"
LEAGUES = {
    "chance": ("comp_9766", "Chance Liga"),
    "pl": ("comp_3039", "Premier League"),
    "bl": ("comp_4643", "Bundesliga"),
    "ll": ("comp_8814", "LaLiga"),
    "ere": ("comp_3809", "Eredivisie"),
}
DATE_FROM = "2021-08-01"
PAUSE = 0.45


def key() -> str:
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("THESTATSAPI_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"')
    sys.exit("THESTATSAPI_API_KEY chybí")


KEY = key()
quota = {"remaining": None}


def get(path: str, params: dict | None = None) -> tuple[int, object]:
    url = BASE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    for attempt in range(10):
        res = subprocess.run(
            ["curl", "-sS", "-i", "-m", "60", "-H", f"Authorization: Bearer {KEY}", "-H", "Accept: application/json", url],
            capture_output=True,
            text=True,
        )
        head, _, body = res.stdout.replace("\r\n", "\n").partition("\n\n")
        status = int(head.split(None, 2)[1]) if head.startswith("HTTP") else 0
        m = re.search(r"x-monthly-quota-remaining:\s*(\d+)", head, re.I)
        if m:
            quota["remaining"] = int(m.group(1))
        if status == 429:
            r = re.search(r"retry-after:\s*(\d+)", head, re.I)
            time.sleep(int(r.group(1)) + 1 if r else 15)
            continue
        if status in (200, 404, 400):
            try:
                return status, json.loads(body)
            except ValueError:
                return status, {"raw": body[:500]}
        time.sleep(3 * (attempt + 1))
    return 0, {"error": "failed"}


def paged(path: str, params: dict) -> list:
    rows, page = [], 1
    while True:
        status, d = get(path, {**params, "per_page": 100, "page": page})
        data = d.get("data") if isinstance(d, dict) else None
        if status != 200 or not data:
            break
        rows += data
        if len(data) < 100:
            break
        page += 1
        time.sleep(PAUSE)
    return rows


def ensure_meta(slug: str, comp: str) -> list[dict]:
    d = OUT / slug
    d.mkdir(parents=True, exist_ok=True)
    mpath = d / "matches.json"
    # seznam zápasů se obnoví vždy (jedno až dvě desítky volání), ať jsou v něm i čerstvě dohrané
    rows = paged("/football/matches", {"competition_id": comp, "date_from": DATE_FROM, "date_to": date.today().isoformat()})
    if rows:
        mpath.write_text(json.dumps(rows, ensure_ascii=False))
    elif mpath.exists():
        rows = json.loads(mpath.read_text())
    meta = d / "meta.json"
    if not meta.exists():
        _, c = get(f"/football/competitions/{comp}")
        _, s = get(f"/football/competitions/{comp}/seasons")
        teams = paged("/football/teams", {"competition_id": comp})
        meta.write_text(json.dumps({"competition": c, "seasons": s, "teams": teams}, ensure_ascii=False))
    return rows


def done_ids(path: Path) -> set[str]:
    ids: set[str] = set()
    if path.exists():
        with path.open(encoding="utf-8") as f:
            for line in f:
                try:
                    ids.add(json.loads(line)["id"])
                except (ValueError, KeyError):
                    pass  # poslední neúplný řádek po přerušení
    return ids


def run(slug: str, kinds: list[str], before: str | None = None) -> None:
    comp, name = LEAGUES[slug]
    rows = ensure_meta(slug, comp)
    if before:  # jen starší zápasy (např. Chance před sezónou 2024/25, kterou pokrývá PitchAPI)
        rows = [m for m in rows if m["utc_date"][:10] < before]
    finished = [m for m in rows if m.get("status") == "finished"]
    print(f"[{name}] {len(rows)} zápasů, dohraných {len(finished)}, kvóta {quota['remaining']}", flush=True)
    for kind in kinds:
        path = OUT / slug / f"{kind}.jsonl"
        have = done_ids(path)
        # kurzy má smysl brát i u nadcházejících zápasů, ostatní jen u dohraných
        todo = [m for m in (rows if kind == "odds" else finished) if m["id"] not in have]
        print(f"[{name}] {kind}: hotovo {len(have)}, zbývá {len(todo)}", flush=True)
        with path.open("a", encoding="utf-8") as f:
            for i, m in enumerate(todo, 1):
                status, body = get(f"/football/matches/{m['id']}/{kind}")
                f.write(json.dumps({"id": m["id"], "status": status, "body": body}, ensure_ascii=False) + "\n")
                f.flush()
                if i % 100 == 0:
                    print(f"[{name}] {kind}: {i}/{len(todo)}, kvóta {quota['remaining']}", flush=True)
                time.sleep(PAUSE)
    print(f"[{name}] hotovo, kvóta {quota['remaining']}", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--leagues", default="chance,pl,bl,ll,ere")
    ap.add_argument("--kinds", default="stats,odds")
    ap.add_argument("--before", default=None, help="jen zápasy před datem YYYY-MM-DD")
    a = ap.parse_args()
    for slug in a.leagues.split(","):
        run(slug.strip(), [k.strip() for k in a.kinds.split(",")], a.before)


if __name__ == "__main__":
    main()
