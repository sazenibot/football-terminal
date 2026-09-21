#!/usr/bin/env python3
"""Slepý backtest 70 % A i B vs Mix ≥ na 1.–8. kole Chance Ligy 2026/27."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_match_data import call
from catalog_team_overlay import fact_row, facts_by_team, fdr_rating, load_history, sides
from lab_trendmetr_kolo import MIX_ID, SCORE_METRICS, sample_values, score_cell
from lab_trendmetr_kolo8 import and70_over, fetch_round_schedule, mix_over, standings_before

LEAGUE_ID = 262
SEASON_ID = 27984


def list_rounds() -> list[tuple[int, int]]:
    body = call("/rounds/seasons/27984", {}, cache_ttl=6 * 3600)
    rows = body.get("data") or []
    out = []
    for r in rows:
        try:
            num = int(str(r.get("name")))
        except (TypeError, ValueError):
            continue
        if 1 <= num <= 8:
            out.append((num, int(r["id"])))
    return sorted(out)


def pick_samples(rows: list[dict], cutoff: str, home_id: int, away_id: int, is_home_side: bool, peer_ids: set[int]):
    usable = [r for r in rows if (r.get("starting_at") or "") < cutoff]
    if is_home_side:
        set_a = [r for r in usable if r.get("is_home")][:5]
        set_b = [r for r in usable if r.get("is_home") and (r.get("opponent") or {}).get("id") == away_id][:3]
    else:
        set_a = [r for r in usable if (not r.get("is_home")) and (r.get("opponent") or {}).get("id") in peer_ids][:3]
        set_b = [r for r in usable if (not r.get("is_home")) and (r.get("opponent") or {}).get("id") == home_id][:3]
    return set_a, set_b


def score_side(set_a, set_b, actual: dict | None) -> dict[str, int]:
    pts = {"and70": 0, MIX_ID: 0}
    if not actual:
        return pts
    for key, _ in SCORE_METRICS:
        a_vals = sample_values(set_a, key)
        b_vals = sample_values(set_b, key)
        actual_v = actual.get(key)
        pts["and70"] += score_cell(and70_over(a_vals, b_vals), actual_v)["points"]
        pts[MIX_ID] += score_cell(mix_over(a_vals, b_vals), actual_v)["points"]
    return pts


def main() -> None:
    print("Fáze 1 — rozpisy 1.–8. kola (bez skóre)")
    rounds = list_rounds()
    schedules = []
    for num, rid in rounds:
        sched = fetch_round_schedule(rid)
        print(f"  {num}. kolo: {len(sched)} zápasů")
        for row in sched:
            print(f"    {row['kickoff']}  {row['home']['name']} – {row['away']['name']}")
        schedules.append((num, sched))

    print("\nFáze 2 — linie z dat před každým zápasem")
    _, history, _ = load_history(LEAGUE_ID, SEASON_ID)
    by_id = {fx.get("id"): fx for fx in history}
    team_ids = set()
    for _, sched in schedules:
        for row in sched:
            team_ids.add(int(row["home"]["id"]))
            team_ids.add(int(row["away"]["id"]))
    facts = facts_by_team(history, team_ids)

    drafted = []
    for num, sched in schedules:
        for row in sched:
            cutoff = row["kickoff"] or ""
            hid, aid = int(row["home"]["id"]), int(row["away"]["id"])
            table = standings_before(history, SEASON_ID, cutoff)
            size = max(len(table), 16)
            home_pos = (table.get(hid) or {}).get("position")
            home_weight = fdr_rating(home_pos, size, is_home=False)
            peers = {
                tid
                for tid, rec in table.items()
                if tid != aid and fdr_rating(rec.get("position"), size, is_home=False) == home_weight
            }
            home_a, home_b = pick_samples(facts.get(hid) or [], cutoff, hid, aid, True, peers)
            away_a, away_b = pick_samples(facts.get(aid) or [], cutoff, hid, aid, False, peers)
            drafted.append((num, row, home_a, home_b, away_a, away_b))

    print(f"  spočteno {len(drafted)} zápasů")
    print("\nFáze 3 — skutečné statistiky a body")
    per_round = {num: {"and70": 0, MIX_ID: 0, "n": 0} for num, _ in rounds}
    totals = {"and70": 0, MIX_ID: 0}

    for num, row, home_a, home_b, away_a, away_b in drafted:
        fx = by_id.get(row["fixture_id"])
        if not fx or fx.get("state_id") != 5:
            continue
        hid, aid = int(row["home"]["id"]), int(row["away"]["id"])
        home_act = fact_row(fx, hid)
        away_act = fact_row(fx, aid)
        if not home_act and not away_act:
            continue
        pts_h = score_side(home_a, home_b, home_act)
        pts_a = score_side(away_a, away_b, away_act)
        for mid in ("and70", MIX_ID):
            add = pts_h[mid] + pts_a[mid]
            per_round[num][mid] += add
            totals[mid] += add
        per_round[num]["n"] += 1

    print()
    for num, _ in rounds:
        row = per_round[num]
        print(
            f"{num}. kolo ({row['n']} zápasů): "
            f"výpočet 1 (70 % A i B) {row['and70']} b., "
            f"výpočet 2 (Mix ≥) {row[MIX_ID]} b."
        )
    print(
        f"\nCelkově za {len(rounds)} kol: "
        f"výpočet 1 {totals['and70']} b., výpočet 2 {totals[MIX_ID]} b."
    )
    if totals["and70"] == totals[MIX_ID]:
        print("Remíza.")
    elif totals["and70"] > totals[MIX_ID]:
        print("Vyhrává výpočet 1 (70 % A i B).")
    else:
        print("Vyhrává výpočet 2 (Mix ≥).")


if __name__ == "__main__":
    main()
