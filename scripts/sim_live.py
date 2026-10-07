#!/usr/bin/env python3
"""Živá simulace v2.2 pro zápasy v okně kola, všech 5 lig: frontend/public/data/sim/{fixture_id}.json

Vstup: sim-input/{liga}.json (scripts/sim_input.py), kolo ligy (data/leagues/{id}.json) a zápas (data/matches/{fid}.json).
Model je tentýž jako ve zpětném testu: sim_v2.lambdas_opp s parametry sim_v2.P a společnou kalibrací
gólových trhů (sim_v2_calibration.json). Prior = dvě předchozí sezóny, aktuální sezóna jen zápasy před výkopem.
Týmy SportMonks ↔ PitchAPI se párují podle názvu v rámci ligy (team_match.py). Nespárovaný tým = zápas se nepočítá
a ohlásí se, nehádá se.

    python scripts/sim_live.py            # všechny ligy
    python scripts/sim_live.py 19725030   # jen zadané fixture id
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import sim_v2  # noqa: E402
from sim_input import LEAGUES, load  # noqa: E402
from sim_v2 import P, calibrate_markets, dixon_coles, implied, lambdas_opp, markets, project_volume, rest_days  # noqa: E402
from team_match import match_teams  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "frontend" / "public" / "data"
MODEL_VERSION = "v2.2"


def season_start_label(season: str) -> tuple[str, str]:
    y = int(season[:4])
    return f"{y - 1}/{str(y)[2:]}", f"{y - 2}/{str(y - 1)[2:]}"


def league_fixtures(lid: int) -> list[dict]:
    path = DATA / "leagues" / f"{lid}.json"
    return (json.loads(path.read_text()).get("round") or []) if path.exists() else []


def main() -> int:
    only = {int(a) for a in sys.argv[1:] if a.isdigit()}
    sim_v2.SIM_OUT.mkdir(parents=True, exist_ok=True)
    keep: set[str] = set()
    done = skipped = 0
    for lid, (slug, _, _) in LEAGUES.items():
        fixtures = league_fixtures(lid)
        keep |= {f"{fx['fixture_id']}.json" for fx in fixtures}
        if not fixtures:
            continue
        inp = load(slug)
        rows, season = inp["rows"], inp.get("season")
        if not rows or not season:
            print(f"{slug}: chybí vstup simulace (sim_input.py), liga se přeskakuje")
            skipped += len(fixtures)
            continue
        prev1, prev2 = season_start_label(season)
        cur_all = [r for r in rows if r["season"] == season]
        last = [r for r in rows if r["season"] == prev1]
        prior = [r for r in rows if r["season"] == prev2] + last
        league_ids = set(inp.get("teams") or {}) | {r["home"] for r in cur_all} | {r["away"] for r in cur_all}
        pitch_names = dict(inp.get("teams") or {})
        for r in rows:
            pitch_names.setdefault(r["home"], r["home_name"])
            pitch_names.setdefault(r["away"], r["away_name"])
        sm_names = {fx["home"]["id"]: fx["home"]["name"] for fx in fixtures} | {fx["away"]["id"]: fx["away"]["name"] for fx in fixtures}
        mapping, unmapped = match_teams(sm_names, {pid: n for pid, n in pitch_names.items() if pid in league_ids})
        if unmapped:
            print(f"{slug}: nespárované týmy {[sm_names[u] for u in unmapped]} — zápasy s nimi se nepočítají")
        for fx in fixtures:
            fid = fx["fixture_id"]
            if only and fid not in only:
                continue
            path = DATA / "matches" / f"{fid}.json"
            if not path.exists():
                continue
            match = json.loads(path.read_text())
            hid, aid = match["home"]["id"], match["away"]["id"]
            if hid not in mapping or aid not in mapping:
                skipped += 1
                continue
            cutoff = match["starting_at"][:10]
            cur = [r for r in cur_all if r["date"] < cutoff]
            rest_h, rest_a = rest_days(match, "home"), rest_days(match, "away")
            hp, ap = mapping[hid], mapping[aid]
            lam_h, lam_a, meta = lambdas_opp(hp, ap, cur, prior, rest_h, rest_a, league_ids, cutoff, prev_last=last)
            model = calibrate_markets(markets(dixon_coles(lam_h, lam_a, P["rho"], P["max_goals"])))
            model["expected_goals"] = {"home": round(lam_h, 2), "away": round(lam_a, 2)}
            volume = project_volume(hp, ap, cur, last)
            model["expected_shots"], model["expected_sot"], model["expected_corners"] = volume["shots"], volume["sot"], volume["corners"]
            payload = {
                "fixture_id": fid,
                "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
                "starting_at": match["starting_at"],
                "league_id": lid,
                "home": {"id": hid, "name": match["home"]["name"]},
                "away": {"id": aid, "name": match["away"]["name"]},
                "method": "maher_opp_dixon_coles",
                "model_version": MODEL_VERSION,
                "params": P,
                "league": {"matches_current": len(cur), "matches_prev": len(prior), "prev_stats": sum(1 for r in prior if r.get("hshots") is not None)},
                "opp_meta": {**meta, "rest": {"home": rest_h, "away": rest_a}},
                "model": model,
                "market": implied(match.get("odds") or {}),
            }
            out = sim_v2.SIM_OUT / f"{fid}.json"
            if out.exists():
                try:
                    old = json.loads(out.read_text())
                except json.JSONDecodeError:
                    old = {}
                if {k: v for k, v in old.items() if k != "generated_at"} == {k: v for k, v in payload.items() if k != "generated_at"}:
                    payload["generated_at"] = old["generated_at"]  # beze změny: soubor zůstane stejný
            out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
            done += 1
            print(f"  {slug} {fid} {match['home']['name']}–{match['away']['name']}: 1X2 {model['home_win_pct']}/{model['draw_pct']}/{model['away_win_pct']} · λ {lam_h:.2f}:{lam_a:.2f}")
    if not only:  # soubory zápasů mimo okno kola všech lig se mažou
        for old in sim_v2.SIM_OUT.glob("*.json"):
            if old.name not in keep:
                old.unlink()
    print(f"sim live {MODEL_VERSION}: {done} zápasů, přeskočeno {skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
