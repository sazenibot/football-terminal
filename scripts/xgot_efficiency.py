"""xGOT efektivita — štítky týmů.

Stateless výpočet z kumulativních gólů a xGOT. Data bere z uloženého JSON
(PitchAPI ingest), ne z API v prohlížeči.

Zatím jen Chance Liga a jen týmy, pro které už máme match JSON v labu.
Denní stahování PitchAPI pro celou ligu = samostatný ingest, ne kopírovat × 30 lig.
"""

from __future__ import annotations

import json
from pathlib import Path

MIN_XGOT = 5.0
THRESHOLD_PCT = 20.0
ROOT = Path(__file__).resolve().parents[1]
PITCH_TEAMS = ROOT / "frontend/public/data/catalog/pitch/teams"
PITCH_MODELS = ROOT / "frontend/public/data/lab/pitch-models.json"
OUT = ROOT / "frontend/public/data/lab/xgot-efficiency.json"

# SportMonks team id → PitchAPI snapshot v labu
PITCH_TO_SM = {
    "t_41GCDg": 216,  # Slavia Praha
}


def efficiency_pct(goals: float, xgot: float) -> float | None:
    if xgot < MIN_XGOT:
        return None
    return (goals / xgot - 1) * 100


def badge_id(goals: float, xgot: float) -> str | None:
    pct = efficiency_pct(goals, xgot)
    if pct is None:
        return None
    if pct >= THRESHOLD_PCT:
        return "lucky_scoring_team"
    if pct <= -THRESHOLD_PCT:
        return "unlucky_finishing_team"
    return None


def window_totals(matches: list[dict], last_n: int | None = None) -> dict:
    rows = matches[-last_n:] if last_n else matches
    return {
        "goals": int(sum(m.get("gf") or 0 for m in rows)),
        "xgot": round(sum(float(m.get("xgot") or 0) for m in rows), 2),
        "matches": len(rows),
    }


def from_catalog_pitch() -> dict | None:
    files = sorted(PITCH_TEAMS.glob("*.json")) if PITCH_TEAMS.exists() else []
    if not files:
        return None
    teams = {}
    season = "2026/2027"
    for path in files:
        payload = json.loads(path.read_text())
        season = payload.get("season") or season
        team = payload.get("team") or {}
        matches = payload.get("matches") or []
        tid = team.get("id") or path.stem
        teams[str(tid)] = {
            "name": team.get("name"),
            "season": window_totals(matches),
            "last5": window_totals(matches, 5),
        }
    return {
        "season": season,
        "source": "PitchAPI",
        "teams": teams,
    }


def from_pitch_models() -> dict:
    payload = json.loads(PITCH_MODELS.read_text())
    matches = payload.get("matches") or []
    team = payload.get("team") or {}
    sm_id = PITCH_TO_SM.get(team.get("id"))
    if sm_id is None:
        raise SystemExit(f"Chybí mapování PitchAPI {team.get('id')} → SportMonks")
    return {
        "league_id": 262,
        "season": payload.get("season"),
        "source": "PitchAPI",
        "note": "Zatím jen Slavia z labu. Další týmy Chance Ligy po denním PitchAPI ingestu.",
        "teams": {
            str(sm_id): {
                "name": team.get("name"),
                "season": window_totals(matches),
                "last5": window_totals(matches, 5),
            }
        },
    }


def main() -> None:
    data = from_catalog_pitch() or from_pitch_models()
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}")
    for tid, row in data["teams"].items():
        s, l5 = row["season"], row["last5"]
        print(
            f"  {tid} {row['name']}: sezona {s['goals']}/{s['xgot']} → {badge_id(s['goals'], s['xgot'])}"
            f" | last5 {l5['goals']}/{l5['xgot']} → {badge_id(l5['goals'], l5['xgot'])}"
        )


if __name__ == "__main__":
    main()
