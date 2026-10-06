#!/usr/bin/env python3
"""
Malé „signály“ pro rozcestník Match Center.

Pro každý zápas v `leagues/{id}.json` doplní `signals` z už uložených souborů
`matches/{fid}.json` a `sim/{fid}.json`. Prohlížeč tak nemusí stahovat celé zápasy
jen kvůli ikonkám a mini predikci ve výpisu kola. Žádná volání API.

Signály:
  referee  True, když je k zápasu delegovaný rozhodčí (ikonka píšťalky)
  probs    [domácí, remíza, hosté] v % z nového modelu (jen pokud existuje sim)

Spouští se po refresh_data.py a pitch_daily.py (viz .github/workflows/refresh-data.yml).
Soubor přepíše jen když se signály změnily.
"""
from __future__ import annotations

import json
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


if __name__ == "__main__":
    main()
