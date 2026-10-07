#!/usr/bin/env python3
"""Backtest hranice „neprohra" proti skutečným kurzům (TheStatsAPI, Bet365).

1) stáhne zápasy Chance Ligy (comp_9766) od 2025-07-01 a spáruje je s řádky
   scripts/.cache/sim-backtest-full.json (datum ±1 den + název týmů),
2) pro každý spárovaný zápas stáhne /odds (cache scripts/.cache/ts-odds/),
3) uloží scripts/.cache/odds-backtest.json (modelové p + kurzy + výsledek).

Stahuje se jednorázově, ~350 volání; kvóta TheStatsAPI je 100 000 / měsíc.
Spuštění: python scripts/odds_backtest.py
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts/.cache"
ODDS_DIR = CACHE / "ts-odds"
BASE = "https://api.thestatsapi.com/api"
COMP = "comp_9766"
STOP = {"fc", "sk", "fk", "mfk", "ac", "as", "1", "bohemians", "sfc", "fcb"}


def env_key() -> str:
    key = os.environ.get("THESTATSAPI_API_KEY", "")
    if not key:
        for line in (ROOT / ".env").read_text().splitlines():
            if line.startswith("THESTATSAPI_API_KEY="):
                key = line.split("=", 1)[1].strip().strip('"')
    if not key:
        sys.exit("THESTATSAPI_API_KEY chybí")
    return key


KEY = env_key()


def get(path: str, params: dict | None = None) -> dict:
    url = BASE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    for attempt in range(8):
        # curl: python.org build na macOS nemá systémové certifikáty
        res = subprocess.run(
            ["curl", "-sS", "-i", "-m", "30", "-H", f"Authorization: Bearer {KEY}", "-H", "Accept: application/json", url],
            capture_output=True,
            text=True,
        )
        head, _, body = res.stdout.replace("\r\n", "\n").partition("\n\n")
        status = int(head.split(None, 2)[1]) if head.startswith("HTTP") else 0
        if status == 429:
            m = re.search(r"retry-after:\s*(\d+)", head, re.I)
            time.sleep(int(m.group(1)) + 1 if m else 12)
            continue
        if status == 200:
            return json.loads(body)
        if status in (400, 404):
            return {"error": body[:200], "status": status}
        time.sleep(2 * (attempt + 1))
    return {"error": "failed"}


def toks(name: str) -> set[str]:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return {t for t in re.split(r"[^a-z0-9]+", s) if t and t not in STOP}


def sim(a: str, b: str) -> float:
    ta, tb = toks(a), toks(b)
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    # prefix shoda (Plzeň ~ Plzen, Liberec ~ Slovan Liberec)
    for x in ta:
        for y in tb:
            if x != y and len(x) >= 4 and len(y) >= 4 and (x.startswith(y[:5]) or y.startswith(x[:5])):
                inter += 0.7
                break
    return inter / max(len(ta), len(tb))


def list_matches() -> list[dict]:
    out, page = [], 1
    while True:
        d = get("/football/matches", {"competition_id": COMP, "date_from": "2025-07-01", "date_to": date.today().isoformat(), "per_page": 100, "page": page})
        rows = d.get("data") or []
        out += rows
        if len(rows) < 100:
            break
        page += 1
    return out


def main() -> None:
    ODDS_DIR.mkdir(parents=True, exist_ok=True)
    rows = json.loads((CACHE / "sim-backtest-full.json").read_text())["rows"]
    ts = [m for m in list_matches() if m.get("status") == "finished"]
    print(f"TS finished: {len(ts)}, backtest rows: {len(rows)}")
    used: set[str] = set()
    pairs, miss = [], []
    for r in rows:
        d0 = date.fromisoformat(r["date"])
        best, best_s = None, 0.0
        for m in ts:
            if m["id"] in used:
                continue
            dm = date.fromisoformat(m["utc_date"][:10])
            if abs((dm - d0).days) > 1:
                continue
            s = sim(r["home"], m["home_team"]["name"]) + sim(r["away"], m["away_team"]["name"])
            if s > best_s:
                best, best_s = m, s
        if best and best_s >= 1.0:
            used.add(best["id"])
            pairs.append((r, best))
        else:
            miss.append(r)
    print(f"spárováno {len(pairs)}, nespárováno {len(miss)}")
    for r in miss[:15]:
        print("  ?", r["date"], r["home"], "-", r["away"])

    def fetch(pair):
        r, m = pair
        f = ODDS_DIR / f"{m['id']}.json"
        if f.exists():
            return json.loads(f.read_text())
        body = get(f"/football/matches/{m['id']}/odds")
        f.write_text(json.dumps(body))
        return body

    odds = []
    for i, pr in enumerate(pairs):
        odds.append(fetch(pr))
        if i % 25 == 0:
            print(f'  odds {i}/{len(pairs)}', flush=True)
        time.sleep(0.4)

    out = []
    for (r, m), body in zip(pairs, odds):
        bks = ((body or {}).get("data") or {}).get("bookmakers") or []
        out.append(
            {
                "season": r["season"],
                "date": r["date"],
                "home": r["home"],
                "away": r["away"],
                "ts_home": m["home_team"]["name"],
                "ts_away": m["away_team"]["name"],
                "y": r["y"],
                "opp": r["opp"],
                "n_before": r["n_before"],
                "bookmakers": [{"name": b["bookmaker"], "markets": {k: b["markets"].get(k) for k in ("match_odds", "double_chance")}} for b in bks],
            }
        )
    (CACHE / "odds-backtest.json").write_text(json.dumps({"rows": out, "unmatched": len(miss)}, ensure_ascii=False))
    n_odds = sum(1 for o in out if o["bookmakers"])
    print(f"uloženo {len(out)} zápasů, s kurzy {n_odds}")


if __name__ == "__main__":
    main()
