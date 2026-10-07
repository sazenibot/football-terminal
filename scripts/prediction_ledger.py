#!/usr/bin/env python3
"""Kniha predikcí: co model řekl PŘED výkopem a jak to dopadlo.

Zdroj predikce: frontend/public/data/sim/{fixture_id}.json (model i kurz z jednoho souboru)
Zdroj výsledku: frontend/public/data/catalog/leagues/{liga}.explorer.json (zápasy týmů, doplňuje se denně)
Výstup:         frontend/public/data/ledger/predictions.json

Pravidla, na kterých stojí důvěryhodnost stránky Výsledky:
  1. Zápis vzniká jen před výkopem. Dokud zápas nezačal, záznam se přepisuje nejnovější predikcí
     (kurzy a sestavy se hýbou). Po výkopu je záznam zamčený a nikdy se nemění.
  2. Zápas, který už začal a v knize není, se NEPŘIDÁVÁ zpětně. Žádné dodatečné doplňování.
  3. Výsledek se doplní až po dohrání z uložených dat a nepřepisuje se.
  4. Nic se nemaže. Záznam bez výsledku zůstane v knize i po dohrání (např. odložený zápas).

Žádné API. Spouští se denně po výpočtu simulací (viz .github/workflows/refresh-data.yml).
Historii záznamů dokládá git: každý denní běh je commit s časem.

    python scripts/prediction_ledger.py
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from tip_rule import make_tip

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "frontend" / "public" / "data"
SIM = DATA / "sim"
LEDGER = DATA / "ledger" / "predictions.json"
LEAGUES = (262, 8, 82, 564, 72)  # SportMonks id lig, pro které běží simulace
DEFAULT_LEAGUE = 262  # starší sim soubory bez league_id jsou z Chance Ligy


def now() -> datetime:
    return datetime.now(timezone.utc)


def parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def load(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def snapshot(sim: dict) -> dict | None:
    model, market = sim.get("model") or {}, sim.get("market") or {}
    if model.get("home_win_pct") is None:
        return None
    entry = {
        "fid": sim["fixture_id"],
        "league_id": int(sim.get("league_id") or DEFAULT_LEAGUE),
        "model_version": sim.get("model_version"),
        "kickoff": sim["starting_at"],
        "home": sim["home"],
        "away": sim["away"],
        "model_at": sim.get("generated_at"),
        "model": {
            "h": model["home_win_pct"],
            "d": model["draw_pct"],
            "a": model["away_win_pct"],
            "over25": model.get("over25_pct"),
            "over15": model.get("over15_pct"),
            "over35": model.get("over35_pct"),
            "xg": model.get("expected_goals"),
        },
    }
    tip = make_tip(entry["model"])
    if tip:
        entry["tip"] = tip  # tip platný v okamžiku zamčení, po výkopu se nemění
    if market.get("home_win_pct") is not None:
        entry["market"] = {
            "h": market["home_win_pct"],
            "d": market["draw_pct"],
            "a": market["away_win_pct"],
            "over25": market.get("over25_pct"),
            "odds": market.get("odds"),
        }
    return entry


def results_index() -> dict[tuple[int, str], tuple[int, int]]:
    """(id domácího týmu, datum) -> (góly domácích, góly hostů) z explorer.json všech lig (id týmu je v SportMonks unikátní)."""
    out: dict[tuple[int, str], tuple[int, int]] = {}
    for lid in LEAGUES:
        path = DATA / "catalog" / "leagues" / f"{lid}.explorer.json"
        for team in load(path, {}).get("teams", []):
            for m in team.get("matches", []):
                if m.get("h") == 1 and m.get("gf") is not None and m.get("ga") is not None:
                    out[(int(team["id"]), m["d"])] = (int(m["gf"]), int(m["ga"]))
    return out


def main() -> None:
    ledger = load(LEDGER, {"started_at": iso(now()), "entries": []})
    ledger.pop("league_id", None)
    by_fid = {e["fid"]: e for e in ledger["entries"]}
    t = now()
    added = updated = settled = 0

    for path in sorted(SIM.glob("*.json")):
        sim = load(path, {})
        if not sim.get("starting_at") or parse(sim["starting_at"]) <= t:
            continue  # po výkopu nepřidáváme ani nepřepisujeme
        snap = snapshot(sim)
        if not snap:
            continue
        old = by_fid.get(snap["fid"])
        if old and old.get("result"):
            continue
        snap["locked_at"] = iso(t)
        if old:
            if {k: v for k, v in old.items() if k != "locked_at"} != {k: v for k, v in snap.items() if k != "locked_at"}:
                old.update(snap)
                updated += 1
        else:
            ledger["entries"].append(snap)
            by_fid[snap["fid"]] = snap
            added += 1

    results = results_index()
    for e in ledger["entries"]:
        if e.get("result") or parse(e["kickoff"]) > t:
            continue
        got = results.get((int(e["home"]["id"]), e["kickoff"][:10]))
        if got:
            e["result"] = {"hg": got[0], "ag": got[1], "settled_at": iso(t)}
            settled += 1

    ledger["entries"].sort(key=lambda e: e["kickoff"])
    ledger["updated_at"] = iso(t)
    text = json.dumps(ledger, ensure_ascii=False, separators=(",", ":")) + "\n"
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    # nepřepisovat soubor jen kvůli novému času, když se nic nezměnilo
    if added or updated or settled or not LEDGER.exists():
        LEDGER.write_text(text, encoding="utf-8")
    print(f"kniha predikcí: +{added} nových, {updated} aktualizováno před výkopem, {settled} vypořádáno, celkem {len(ledger['entries'])}")


if __name__ == "__main__":
    main()
