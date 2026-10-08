#!/usr/bin/env python3
"""
Malé „signály“ pro rozcestník Match Center.

Pro každý zápas v `leagues/{id}.json` doplní `signals` z už uložených souborů
`matches/{fid}.json` a `sim/{fid}.json`. Prohlížeč tak nemusí stahovat celé zápasy
jen kvůli ikonkám a mini predikci ve výpisu kola. Žádná volání API.

Signály:
  referee  True, když je k zápasu delegovaný rozhodčí (ikonka píšťalky)
  probs    [domácí, remíza, hosté] v % z nového modelu (jen pokud existuje sim)

Navíc skládá `upcoming.json`: malý přehled zápasů všech zapnutých lig pro pohled „Všechny zápasy“
(prohlížeč nemusí stahovat soubory všech lig zvlášť, i při 30 ligách jde o desítky kB).

Spouští se po refresh_data.py a pitch_daily.py (viz .github/workflows/refresh-data.yml).
Soubor přepíše jen když se signály změnily.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "frontend" / "public" / "data"


def read(path: Path):
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return None


def signals_for(fid: int) -> dict | None:
    match = read(DATA / "matches" / f"{fid}.json")
    if not match:
        return None
    out: dict = {"referee": bool(match.get("referee"))}
    sim = read(DATA / "sim" / f"{fid}.json")
    if sim and sim.get("model"):
        m = sim["model"]
        out["probs"] = [round(m["home_win_pct"]), round(m["draw_pct"]), round(m["away_win_pct"])]
    return out


def build_upcoming() -> None:
    """Zápasy z `leagues/{id}.json` všech zapnutých lig do jednoho souboru. Přepíše ho jen při změně obsahu."""
    index = read(DATA / "index.json") or {}
    fixtures: list[dict] = []
    for lg in index.get("leagues", []):
        if not lg.get("enabled"):
            continue
        data = read(DATA / "leagues" / f"{lg['id']}.json")
        if not data:
            continue
        for fx in data.get("round", []):
            fixtures.append({"league_id": lg["id"], **fx})
    fixtures.sort(key=lambda f: (f["starting_at"], f["fixture_id"]))
    path = DATA / "upcoming.json"
    old = read(path) or {}
    if old.get("fixtures") == fixtures:
        print("upcoming.json: beze změny")
        return
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    path.write_text(json.dumps({"generated_at": now, "fixtures": fixtures}, ensure_ascii=False, separators=(",", ":")))
    print(f"upcoming.json: {len(fixtures)} zápasů")


def main() -> None:
    changed = 0
    for path in sorted((DATA / "leagues").glob("*.json")):
        league = read(path)
        if not league or not league.get("round"):
            continue
        dirty = False
        for fx in league["round"]:
            sig = signals_for(fx["fixture_id"])
            if sig is None:
                if "signals" in fx:
                    del fx["signals"]
                    dirty = True
                continue
            if fx.get("signals") != sig:
                fx["signals"] = sig
                dirty = True
        if dirty:
            path.write_text(json.dumps(league, ensure_ascii=False, indent=2))
            changed += 1
            print(f"  signály: {path.name}")
    print(f"round_signals: změněno {changed} souborů lig")
    build_upcoming()


if __name__ == "__main__":
    main()
