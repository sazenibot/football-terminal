#!/usr/bin/env python3
"""Automatické aktuality do feedu na homepage: frontend/public/data/feed_auto.json

Ručně psané aktuality jsou markdown soubory v frontend/content/news/. Tenhle skript přidává ty, které
vyplývají z dat. Záznamy se jen přidávají (podle id), starší zůstávají, ať má feed historii.

  gap-{kolo}      nejvýraznější rozdíl modelu a kurzu v nejbližším kole (ze sim/*.json)
  settled-{den}   kolik zápasů z knihy predikcí se dohrálo a jak dopadly (až budou první vypořádané)

Žádné API.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "frontend" / "public" / "data"
OUT = DATA / "feed_auto.json"
KEEP = 40


def load(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def cz(n: float) -> str:
    return f"{n:.1f}".replace(".", ",")


def en(n: float) -> str:
    return f"{n:.1f}"


def gap_item(now: datetime) -> dict | None:
    best = None
    for path in sorted((DATA / "sim").glob("*.json")):
        sim = load(path, {})
        model, market = sim.get("model") or {}, sim.get("market") or {}
        if not market.get("home_win_pct") or sim.get("starting_at", "") <= iso(now):
            continue
        for key, label, label_en in (
            ("home_win_pct", "výhra domácích", "a home win"),
            ("draw_pct", "remíza", "a draw"),
            ("away_win_pct", "výhra hostů", "an away win"),
        ):
            diff = model[key] - market[key]
            if best is None or abs(diff) > abs(best["diff"]):
                best = {"sim": sim, "key": key, "label": label, "label_en": label_en, "diff": diff}
    if not best:
        return None
    sim = best["sim"]
    key = best["key"]
    name = f'{sim["home"]["name"]} – {sim["away"]["name"]}'
    day = sim["starting_at"][:10]
    return {
        "id": f"gap-{day}-{sim['fixture_id']}",
        "date": iso(now),
        "tag": "Model",
        "title": f"Největší rozdíl modelu a kurzu v nejbližším kole: {name}",
        "text": f'U zápasu {name} dává model na „{best["label"]}“ {cz(sim["model"][key])} %, zatímco kurz odpovídá {cz(sim["market"][key])} %. Rozdíl {cz(abs(best["diff"]))} procentního bodu.',
        "link": f"/match/{sim['fixture_id']}",
        "auto": True,
        "en": {
            "tag": "Model",
            "title": f"Biggest gap between model and odds in the next round: {name}",
            "text": f'For {name} the model puts {best["label_en"]} at {en(sim["model"][key])}%, while the odds imply {en(sim["market"][key])}%. A gap of {en(abs(best["diff"]))} percentage points.',
        },
    }


def settled_item(now: datetime) -> dict | None:
    ledger = load(DATA / "ledger" / "predictions.json", {"entries": []})
    done = [e for e in ledger["entries"] if e.get("result")]
    if not done:
        return None
    last_day = max(e["kickoff"][:10] for e in done)
    day = [e for e in done if e["kickoff"][:10] == last_day]
    hits = 0
    for e in day:
        r = e["result"]
        y = "h" if r["hg"] > r["ag"] else "a" if r["hg"] < r["ag"] else "d"
        hits += max(("h", "d", "a"), key=lambda k: e["model"][k]) == y
    return {
        "id": f"settled-{last_day}",
        "date": iso(now),
        "tag": "Výsledky",
        "title": f"Kniha predikcí: dohráno {len(day)} zápasů, favorita model určil u {hits}",
        "text": f"Predikce byly zamčené před výkopem. Celkem je v knize vypořádáno {len(done)} zápasů.",
        "link": "/vysledky",
        "auto": True,
        "en": {
            "tag": "Results",
            "title": f"Prediction ledger: {len(day)} matches played, the model's favourite won in {hits}",
            "text": f"Predictions were locked before kick-off. {len(done)} matches are settled in the ledger in total.",
        },
    }


def main() -> None:
    now = datetime.now(timezone.utc)
    feed = load(OUT, {"items": []})
    items = {i["id"]: i for i in feed["items"]}
    added = 0
    for item in (gap_item(now), settled_item(now)):
        if not item:
            continue
        if item["id"] not in items:
            items[item["id"]] = item
            added += 1
        elif "en" not in items[item["id"]]:  # starší záznam bez anglické verze
            items[item["id"]]["en"] = item["en"]
            added += 1
    if not added and OUT.exists():
        print("feed: beze změny")
        return
    ordered = sorted(items.values(), key=lambda i: i["date"], reverse=True)[:KEEP]
    OUT.write_text(json.dumps({"items": ordered}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"feed: +{added}, celkem {len(ordered)}")


if __name__ == "__main__":
    main()
