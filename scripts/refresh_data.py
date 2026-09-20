#!/usr/bin/env python3
"""Denní ingest pro katalog ~30 lig.

Plný analytický balík (~stovky API volání) se staví jen jednou na zápas.
Každý den se v okně N dní:
  - doplní nové zápasy (full),
  - u už postavených se obnoví jen volatilní pole (kickoff, rozhodčí, absence, sestavy).

Výstup je rozdělený, ať 30 lig neskončí v jednom megabajtovém JSON:
  frontend/public/data/index.json
  frontend/public/data/leagues/{id}.json
  frontend/public/data/matches/{id}.json

Použití:
    python3 scripts/refresh_data.py
    python3 scripts/refresh_data.py --league 262
    python3 scripts/refresh_data.py --full
    python3 scripts/refresh_data.py --migrate-only
    python3 scripts/refresh_data.py --max-new 2
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(Path(__file__).parent))

from build_match_data import (  # noqa: E402
    build_match,
    call_stats,
    fetch_league,
    fetch_round_fixtures,
    refresh_volatile,
    team_brief,
    to_iso_utc,
)
from match_extras import enrich_match  # noqa: E402

CONFIG_PATH = ROOT / "scripts" / "config" / "leagues.json"
DATA_DIR = ROOT / "frontend" / "public" / "data"
LEGACY_MATCH = DATA_DIR / "match.json"


def league_public(league: dict, extra: dict | None = None) -> dict:
    out = {
        "id": league["id"],
        "name": league["name"],
        "short": league.get("short"),
        "country": league.get("country"),
        "enabled": league.get("enabled", True),
        "logo": league.get("logo"),
    }
    if extra:
        out.update(extra)
    return out


def hydrate_logos(cfg: dict) -> None:
    """Doplní image_path ze SportMonks u zapnutých lig (7denní cache)."""
    changed = False
    for league in cfg["leagues"]:
        if not league.get("enabled"):
            continue
        if league.get("logo"):
            continue
        meta = fetch_league(league["id"])
        logo = meta.get("image_path")
        if logo:
            league["logo"] = logo
            changed = True
            print(f"  logo {league['name']}: {logo}")
    if changed:
        write_json(CONFIG_PATH, cfg)


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text())


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str))
    tmp.replace(path)


def read_json(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return None


def match_path(fixture_id: int) -> Path:
    return DATA_DIR / "matches" / f"{fixture_id}.json"


def league_path(league_id: int) -> Path:
    return DATA_DIR / "leagues" / f"{league_id}.json"


def migrate_legacy_match_json() -> int:
    """Rozdělí starý frontend/public/data/match.json na per-match soubory."""
    legacy = read_json(LEGACY_MATCH)
    if not legacy or not legacy.get("matches"):
        return 0
    moved = 0
    for match in legacy["matches"]:
        fid = match.get("fixture_id")
        if not fid:
            continue
        dest = match_path(fid)
        if dest.exists():
            continue
        match.setdefault("league_id", (legacy.get("league") or {}).get("id"))
        match.setdefault("league_name", (legacy.get("league") or {}).get("name"))
        match.setdefault("build_mode", "full")
        match.setdefault("built_at", legacy.get("generated_at"))
        write_json(dest, match)
        moved += 1
    print(f"  migrace match.json → {moved} nových souborů v matches/")
    return moved


def summarize_round(fixtures: list, built_ids: set[int]) -> list:
    round_out = []
    for fx in fixtures:
        parts = fx.get("participants") or []
        home = next((p for p in parts if (p.get("meta") or {}).get("location") == "home"), None)
        away = next((p for p in parts if (p.get("meta") or {}).get("location") == "away"), None)
        if not home or not away:
            continue
        fid = fx["id"]
        round_out.append({
            "fixture_id": fid,
            "starting_at": to_iso_utc(fx.get("starting_at")),
            "venue": (fx.get("venue") or {}).get("name"),
            "home": team_brief(home),
            "away": team_brief(away),
            "has_full_data": fid in built_ids or match_path(fid).exists(),
        })
    round_out.sort(key=lambda f: f["starting_at"] or "")
    return round_out


def process_league(league: dict, days: int, force_full: bool, max_new: int | None, new_counter: list[int]) -> dict:
    lid = league["id"]
    print(f"\n=== {league['name']} ({lid}) ===")
    fixtures = fetch_round_fixtures(league_id=lid, days_ahead=days)
    print(f"  okno {days} dní: {len(fixtures)} zápasů")

    built_ids: set[int] = set()
    errors = 0
    refreshed = 0
    created = 0

    for fx in fixtures:
        fid = fx["id"]
        dest = match_path(fid)
        existing = read_json(dest)
        try:
            if existing and not force_full:
                print(f"  refresh {fid}")
                payload = refresh_volatile(existing)
                refreshed += 1
            else:
                if existing is None and max_new is not None and new_counter[0] >= max_new:
                    print(f"  skip {fid} (limit --max-new {max_new})")
                    continue
                print(f"  full {fid}")
                payload = build_match(fid, lid)
                if existing is None:
                    new_counter[0] += 1
                    created += 1
            try:
                payload = enrich_match(payload)
            except Exception as extra_exc:
                print(f"  ⚠️ extras {fid}: {extra_exc}", file=sys.stderr)
            write_json(dest, payload)
            built_ids.add(fid)
        except Exception as exc:  # jeden zápas nesmí shodit ligu
            print(f"  ⚠️ {fid}: {exc}", file=sys.stderr)
            errors += 1
            if existing:
                built_ids.add(fid)

    round_out = summarize_round(fixtures, built_ids)
    generated_at = now_iso()
    write_json(league_path(lid), {
        "generated_at": generated_at,
        "league": league_public(league),
        "round": round_out,
        "stats": {
            "created": created,
            "refreshed": refreshed,
            "errors": errors,
        },
    })
    print(f"  -> {len(round_out)} v kole, +{created} full, {refreshed} refresh, {errors} chyb")
    return league_public(league, {
        "match_count": sum(1 for r in round_out if r["has_full_data"]),
        "round_count": len(round_out),
    })


def write_empty_league(league: dict, generated_at: str) -> None:
    dest = league_path(league["id"])
    if dest.exists():
        return
    write_json(dest, {
        "generated_at": generated_at,
        "league": league_public(league),
        "round": [],
    })


def write_index(cfg: dict, enabled_summaries: list[dict]) -> None:
    by_id = {row["id"]: row for row in enabled_summaries}
    leagues = []
    for league in cfg["leagues"]:
        if league.get("enabled"):
            leagues.append(by_id.get(league["id"], league_public(league, {
                "match_count": 0,
                "round_count": 0,
            })))
        else:
            leagues.append(league_public(league, {
                "match_count": 0,
                "round_count": 0,
            }))
    write_json(DATA_DIR / "index.json", {
        "generated_at": now_iso(),
        "default_league_id": cfg.get("default_league_id", 262),
        "stale_after_hours": cfg.get("stale_after_hours", 26),
        "window_days": cfg.get("window_days", 7),
        "leagues": leagues,
    })


def write_compat_match_json(cfg: dict) -> None:
    """Tenký match.json, ať starý frontend/URL nespadne na 404."""
    default_id = cfg.get("default_league_id", 262)
    league_data = read_json(league_path(default_id)) or {}
    write_json(LEGACY_MATCH, {
        "generated_at": league_data.get("generated_at") or now_iso(),
        "league": league_data.get("league") or {"id": default_id, "name": "Chance Liga"},
        "round": league_data.get("round") or [],
        "matches": [],
        "relocated_to": "/data/leagues/ a /data/matches/",
    })


def main() -> None:
    parser = argparse.ArgumentParser(description="Denní refresh Football Terminal dat")
    parser.add_argument("--league", type=int, help="Jen jedna liga (SportMonks id)")
    parser.add_argument("--days", type=int, help="Okno dopředu (default z leagues.json)")
    parser.add_argument("--full", action="store_true", help="Vynutit plný rebuild všech zápasů v okně")
    parser.add_argument("--migrate-only", action="store_true", help="Jen rozdělit starý match.json")
    parser.add_argument("--max-new", type=int, default=None, help="Max. nových full buildů za běh")
    args = parser.parse_args()

    cfg = load_config()
    hydrate_logos(cfg)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "matches").mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "leagues").mkdir(parents=True, exist_ok=True)

    print(f"[0] migrace legacy match.json (pokud existuje)…")
    migrate_legacy_match_json()

    if args.migrate_only:
        summaries = []
        for league in cfg["leagues"]:
            if not league.get("enabled"):
                continue
            existing = read_json(league_path(league["id"]))
            if existing:
                summaries.append(league_public(league, {
                    "match_count": sum(1 for r in existing.get("round", []) if r.get("has_full_data")),
                    "round_count": len(existing.get("round", [])),
                }))
        # když ještě není leagues/262.json, složíme ho z legacy round + matches/
        if not summaries:
            legacy = read_json(LEGACY_MATCH) or {}
            default = next((l for l in cfg["leagues"] if l["id"] == cfg.get("default_league_id")), cfg["leagues"][0])
            built = {p.stem for p in (DATA_DIR / "matches").glob("*.json")}
            round_out = []
            for fx in legacy.get("round") or []:
                fid = fx.get("fixture_id")
                fx = dict(fx)
                fx["has_full_data"] = str(fid) in built
                round_out.append(fx)
            write_json(league_path(default["id"]), {
                "generated_at": legacy.get("generated_at") or now_iso(),
                "league": {
                    "id": default["id"],
                    "name": default["name"],
                    "short": default.get("short"),
                    "country": default.get("country"),
                    "enabled": True,
                },
                "round": round_out,
            })
            summaries.append({
                "id": default["id"],
                "name": default["name"],
                "short": default.get("short"),
                "country": default.get("country"),
                "enabled": True,
                "match_count": sum(1 for r in round_out if r["has_full_data"]),
                "round_count": len(round_out),
            })
        for league in cfg["leagues"]:
            if league.get("enabled"):
                write_empty_league(league, now_iso())
        write_index(cfg, summaries)
        write_compat_match_json(cfg)
        print("✅ jen migrace, hotovo")
        return

    days = args.days or cfg.get("window_days", 7)
    wanted = [l for l in cfg["leagues"] if l.get("enabled")]
    if args.league:
        wanted = [l for l in cfg["leagues"] if l["id"] == args.league]
        if not wanted:
            raise SystemExit(f"Liga {args.league} není v katalogu")
        if not wanted[0].get("enabled"):
            print(f"⚠️ liga {args.league} je v katalogu vypnutá — stahuju ji jen kvůli --league", file=sys.stderr)

    new_counter = [0]
    summaries = []
    for league in wanted:
        summaries.append(process_league(league, days, args.full, args.max_new, new_counter))

    for league in cfg["leagues"]:
        if league.get("enabled"):
            write_empty_league(league, now_iso())
    write_index(cfg, summaries)
    write_compat_match_json(cfg)
    stats = call_stats()
    print(f"\n✅ denní refresh hotov: {stats['calls']} API volání, {stats['cache_hits']} z cache")


if __name__ == "__main__":
    main()
