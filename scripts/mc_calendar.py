#!/usr/bin/env python3
"""
Úzký index dohraných zápasů, které mají stránku Match Center.

Slouží kalendáři na rozcestníku. Drží aktuální sezonu (od 1. 7.), ne celé JSON
zápasů — ty zůstávají v okně ~7 dní. Každý den se sloučí s už uloženým indexem,
takže den zmizí z `matches/*.json`, ale v kalendáři zůstane, dokud neskončí sezona.

Žádné API. Skóre bere z knihy predikcí a z overlay katalogu, když ho máme.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "frontend" / "public" / "data"
PRAGUE = ZoneInfo("Europe/Prague")
FINISHED_AFTER = timedelta(hours=2)


def read(path: Path):
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return None


def now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def season_of(when: datetime) -> tuple[str, datetime]:
    year = when.year if when.month >= 7 else when.year - 1
    start = datetime(year, 7, 1, tzinfo=timezone.utc)
    return f"{year}/{year + 1}", start


def parse_iso(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def day_key(dt: datetime) -> str:
    return dt.astimezone(PRAGUE).date().isoformat()


def enabled_ids(index: dict) -> set[int]:
    return {int(l["id"]) for l in index.get("leagues", []) if l.get("enabled")}


def scores_from_ledger() -> dict[int, tuple[int, int]]:
    ledger = read(DATA / "ledger" / "predictions.json") or {}
    out: dict[int, tuple[int, int]] = {}
    for e in ledger.get("entries", []):
        res = e.get("result") or {}
        if "hg" in res and "ag" in res:
            out[int(e["fid"])] = (int(res["hg"]), int(res["ag"]))
    return out


def scores_from_catalog() -> dict[int, tuple[int, int]]:
    out: dict[int, tuple[int, int]] = {}
    root = DATA / "catalog" / "teams"
    if not root.exists():
        return out
    for path in root.rglob("*.json"):
        payload = read(path)
        if not isinstance(payload, dict):
            continue
        recent = (payload.get("overlay") or {}).get("recent") or payload.get("recent") or []
        if not isinstance(recent, list):
            continue
        for row in recent:
            if not isinstance(row, dict):
                continue
            fid = row.get("fixture_id") or row.get("fid")
            gf, ga = row.get("gf"), row.get("ga")
            if fid is None or gf is None or ga is None:
                continue
            # overlay je z pohledu týmu, ne domácí–hosté
            if row.get("is_home") is False:
                out[int(fid)] = (int(ga), int(gf))
            else:
                out[int(fid)] = (int(gf), int(ga))
    return out


def row_from_match(match: dict, scores: dict[int, tuple[int, int]]) -> dict | None:
    kickoff = parse_iso(match.get("starting_at"))
    if not kickoff:
        return None
    fid = int(match["fixture_id"])
    hs, as_ = scores.get(fid, (match.get("home_score"), match.get("away_score")))
    home = match.get("home") or {}
    away = match.get("away") or {}
    return {
        "fixture_id": fid,
        "league_id": int(match.get("league_id") or 0),
        "starting_at": kickoff.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "day": day_key(kickoff),
        "home": {"id": home.get("id"), "name": home.get("name"), "image": home.get("image")},
        "away": {"id": away.get("id"), "name": away.get("name"), "image": away.get("image")},
        "home_score": hs,
        "away_score": as_,
    }


def main() -> None:
    now = now_utc()
    season, season_start = season_of(now)
    index = read(DATA / "index.json") or {}
    live = enabled_ids(index)
    scores = scores_from_catalog()
    scores.update(scores_from_ledger())

    by_id: dict[int, dict] = {}
    old = read(DATA / "mc-calendar.json") or {}
    if old.get("season") == season:
        for row in old.get("fixtures", []):
            if int(row.get("league_id") or 0) in live:
                by_id[int(row["fixture_id"])] = row

    cutoff = now - FINISHED_AFTER
    added = 0
    for path in (DATA / "matches").glob("*.json"):
        match = read(path)
        if not match:
            continue
        lid = int(match.get("league_id") or 0)
        if live and lid not in live:
            continue
        kickoff = parse_iso(match.get("starting_at"))
        if not kickoff or kickoff < season_start or kickoff > cutoff:
            continue
        row = row_from_match(match, scores)
        if not row:
            continue
        prev = by_id.get(row["fixture_id"])
        if prev and prev.get("home_score") is not None and row["home_score"] is None:
            row["home_score"] = prev["home_score"]
            row["away_score"] = prev["away_score"]
        if prev != row:
            added += 1
        by_id[row["fixture_id"]] = row

    fixtures = sorted(by_id.values(), key=lambda r: (r["starting_at"], r["fixture_id"]))
    payload = {
        "generated_at": now.isoformat().replace("+00:00", "Z"),
        "season": season,
        "fixtures": fixtures,
    }
    dest = DATA / "mc-calendar.json"
    if old.get("fixtures") == fixtures and old.get("season") == season:
        print("mc-calendar.json: beze změny")
        return
    dest.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    print(f"mc-calendar.json: {len(fixtures)} zápasů sezony {season} ({added} nových/upravených)")


if __name__ == "__main__":
    main()
