#!/usr/bin/env python3
"""Jednorázový výpočet Trendmetru: Slavia – Plzeň (bez včerejšího zápasu)."""

from __future__ import annotations

import json
import math
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_match_data import STAT_TYPE, stat_value
from catalog_team_overlay import facts_by_team, fdr_rating, load_history, sides
from enrich_catalog import parse_standings

LEAGUE_ID = 262
SEASON_ID = 27984
SLAVIA = 216
PLZEN = 3545
SKIP_FIXTURE = 19725038
RATIO = 0.70
OUT = ROOT / "frontend/public/data/lab/trendmetr-slavia-plzen.json"

METRICS = (
    ("shots", "Střely", "shots"),
    ("sot", "Střely na branku", "sot"),
    ("corners", "Rohy získané", "corners"),
    ("opp_corners", "Rohy inkasované", "opp_corners"),
    ("fouls", "Fauly způsobené", "fouls"),
    ("opp_fouls", "Fauly získané", "opp_fouls"),
    ("offsides", "Ofsajdy", "offsides"),
)


def need_hits(n: int, ratio: float = RATIO) -> int:
    return math.ceil(ratio * n - 1e-9) if n else 0


def max_floor(values: list[int | float | None], ratio: float = RATIO) -> int | None:
    vals = [int(v) for v in values if v is not None]
    if not vals:
        return None
    need = need_hits(len(vals), ratio)
    best = None
    for t in range(0, max(vals) + 2):
        if sum(1 for v in vals if v >= t) >= need:
            best = t
    return best


def pick_line(a: list, b: list) -> int | None:
    fa = max_floor(a)
    fb = max_floor(b)
    if fa is None or fb is None:
        return None
    return min(fa, fb)


def hits(values: list, line: int | None) -> int:
    if line is None:
        return 0
    return sum(1 for v in values if v is not None and v >= line)


def enrich_rows(history: list, rows: list[dict]) -> list[dict]:
    by_id = {fx.get("id"): fx for fx in history}
    out = []
    for row in rows:
        fx = by_id.get(row.get("fixture_id"))
        opp_id = (row.get("opponent") or {}).get("id")
        extra = dict(row)
        extra["opp_corners"] = stat_value(fx, opp_id, STAT_TYPE["corners"]) if fx and opp_id else None
        out.append(extra)
    return out


def pack_match(row: dict, table: dict[int, dict], size: int) -> dict:
    opp = row.get("opponent") or {}
    oid = opp.get("id")
    pos = (table.get(int(oid)) or {}).get("position") if oid else None
    return {
        "fixture_id": row.get("fixture_id"),
        "date": (row.get("starting_at") or "")[:10],
        "is_home": bool(row.get("is_home")),
        "opponent_id": oid,
        "opponent": opp.get("name"),
        "opponent_image": opp.get("image"),
        "gf": row.get("gf"),
        "ga": row.get("ga"),
        "result": row.get("result"),
        "opponent_position": pos,
        "fdr": fdr_rating(pos, size, is_home=bool(row.get("is_home"))),
        "shots": row.get("shots"),
        "sot": row.get("sot"),
        "corners": row.get("corners"),
        "opp_corners": row.get("opp_corners"),
        "fouls": row.get("fouls"),
        "opp_fouls": row.get("opp_fouls"),
        "offsides": row.get("offsides"),
    }


def metric_values(matches: list[dict], key: str) -> list:
    return [m.get(key) for m in matches]


def side_payload(label: str, note: str, set_a: dict, set_b: dict, total_n: int) -> dict:
    metrics = []
    for key, name, _ in METRICS:
        a_vals = metric_values(set_a["matches"], key)
        b_vals = metric_values(set_b["matches"], key)
        line = pick_line(a_vals, b_vals)
        combined = a_vals + b_vals
        hit = hits(combined, line)
        n = len(combined)
        metrics.append(
            {
                "key": key,
                "name": name,
                "line": line,
                "hits": hit,
                "n": n,
                "pct": round(100 * hit / n) if n else None,
                "set_a": {
                    "hits": hits(a_vals, line),
                    "n": len(a_vals),
                    "need": need_hits(len(a_vals)),
                    "values": a_vals,
                },
                "set_b": {
                    "hits": hits(b_vals, line),
                    "n": len(b_vals),
                    "need": need_hits(len(b_vals)),
                    "values": b_vals,
                },
            }
        )
    return {
        "label": label,
        "note": note,
        "cases": total_n,
        "set_a": {k: v for k, v in set_a.items() if k != "matches"} | {"matches": set_a["matches"]},
        "set_b": {k: v for k, v in set_b.items() if k != "matches"} | {"matches": set_b["matches"]},
        "metrics": metrics,
    }


def main() -> None:
    print("Trendmetr: načítám historii Chance Ligy…")
    seasons, history, start = load_history(LEAGUE_ID, SEASON_ID)
    history = [fx for fx in history if fx.get("id") != SKIP_FIXTURE]
    facts = facts_by_team(history, {SLAVIA, PLZEN})
    slavia = enrich_rows(history, facts.get(SLAVIA) or [])
    plzen = enrich_rows(history, facts.get(PLZEN) or [])

    table = parse_standings(SEASON_ID)
    size = max(len(table), 16)
    hard_ids = {
        tid
        for tid, row in table.items()
        if tid != PLZEN and fdr_rating(row.get("position"), size, is_home=False) == 5
    }

    slavia_home = [r for r in slavia if r.get("is_home")][:5]
    slavia_h2h = [r for r in slavia if r.get("is_home") and (r.get("opponent") or {}).get("id") == PLZEN][:3]
    plzen_hard_away = [
        r
        for r in plzen
        if (not r.get("is_home")) and (r.get("opponent") or {}).get("id") in hard_ids
    ][:3]
    plzen_at_slavia = [r for r in plzen if (not r.get("is_home")) and (r.get("opponent") or {}).get("id") == SLAVIA][:3]

    hard_names = sorted(
        ((table.get(tid) or {}).get("position") or 99, tid)
        for tid in hard_ids
    )

    def team_name(tid: int) -> str:
        for fx in history:
            home, away = sides(fx)
            for part in (home, away):
                if part and part.get("id") == tid:
                    return part.get("name") or str(tid)
        return str(tid)

    hard_table = [
        {
            "id": tid,
            "name": team_name(tid),
            "position": pos,
            "fdr_away": 5,
        }
        for pos, tid in hard_names
    ]

    slavia_a = {
        "id": "home5",
        "title": "Posledních 5 domácích v lize",
        "matches": [pack_match(r, table, size) for r in slavia_home],
    }
    slavia_b = {
        "id": "h2h3",
        "title": "Poslední 3 domácí proti Plzni",
        "matches": [pack_match(r, table, size) for r in slavia_h2h],
    }
    plzen_a = {
        "id": "away_fdr5",
        "title": "Poslední 3 venku proti FDR 5",
        "matches": [pack_match(r, table, size) for r in plzen_hard_away],
    }
    plzen_b = {
        "id": "at_slavia",
        "title": "Poslední 3 na hřišti Slavie",
        "matches": [pack_match(r, table, size) for r in plzen_at_slavia],
    }

    payload = {
        "id": "trendmetr-slavia-plzen",
        "title": "Trendmetr",
        "subtitle": "Slavia Praha – Viktoria Plzeň",
        "league": "Chance Liga",
        "league_id": LEAGUE_ID,
        "season_id": SEASON_ID,
        "excluded_fixture_id": SKIP_FIXTURE,
        "excluded_note": "Včerejší Slavia – Plzeň (20. 9. 2026) není ve vzorcích.",
        "rule": "Linie je nejvyšší celé číslo T, které platí v ≥70 % vzorku A i v ≥70 % vzorku B (alespoň T). Pravděpodobnost = zásahy / (A+B).",
        "ratio": RATIO,
        "computed_at": date.today().isoformat(),
        "history_from": start.isoformat(),
        "teams": {
            "home": {
                "id": SLAVIA,
                "name": "Slavia Praha",
                "short": "SLA",
                "image": "https://cdn.sportmonks.com/images/soccer/teams/24/216.png",
            },
            "away": {
                "id": PLZEN,
                "name": "Viktoria Plzeň",
                "short": "PLZ",
                "image": "https://cdn.sportmonks.com/images/soccer/teams/25/3545.png",
            },
        },
        "fdr": {
            "size": size,
            "away_band_5": "aktuální tabulka, venku: 1.–4. = 5",
            "hard_opponents": hard_table,
        },
        "sides": [
            side_payload(
                "Slavia doma",
                "5 domácích ligových + 3 domácí proti Plzni. 70 % z 5 = 4/5, 70 % ze 3 = 3/3.",
                slavia_a,
                slavia_b,
                len(slavia_a["matches"]) + len(slavia_b["matches"]),
            ),
            side_payload(
                "Plzeň venku",
                "3 venkovní proti soupeři z váhy 5 (jako Slavia) + 3 na hřišti Slavie.",
                plzen_a,
                plzen_b,
                len(plzen_a["matches"]) + len(plzen_b["matches"]),
            ),
        ],
        "seasons": [{"id": s.get("id"), "name": s.get("name")} for s in seasons],
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"zapsáno {OUT}")
    for side in payload["sides"]:
        print(f"\n{side['label']} ({side['cases']} případů)")
        for m in side["metrics"]:
            print(
                f"  {m['name']}: ≥{m['line']}  {m['hits']}/{m['n']} ({m['pct']} %)"
                f"  A {m['set_a']['hits']}/{m['set_a']['n']}  B {m['set_b']['hits']}/{m['set_b']['n']}"
            )


if __name__ == "__main__":
    main()
