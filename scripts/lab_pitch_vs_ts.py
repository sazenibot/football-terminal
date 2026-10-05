#!/usr/bin/env python3
"""Sestaví statické srovnání TheStatsAPI vs PitchAPI pro lab stránku.

Čte už stažená těla z /tmp/pitch (match, shots, stats, lineups, players,
advanced) a frontend/public/data/lab/derby.json. API klíč do výstupu nedává.
"""

from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PITCH_DIR = Path("/tmp/pitch")
DERBY = ROOT / "frontend/public/data/lab/derby.json"
OUT = ROOT / "frontend/public/data/lab/pitch-vs-ts.json"
HOME = "t_19pSyq"


def norm(name: str | None) -> str:
    raw = unicodedata.normalize("NFKD", name or "")
    raw = "".join(c for c in raw if not unicodedata.combining(c))
    raw = re.sub(r"[^a-zA-Z ]", "", raw).lower().strip()
    parts = raw.split()
    return parts[-1] if parts else raw


def rnd(value, digits=2):
    if value is None:
        return None
    return round(float(value), digits)


def parse_num(text):
    if text is None:
        return None
    match = re.search(r"-?\d+(?:[.,]\d+)?", str(text))
    if not match:
        return None
    return float(match.group(0).replace(",", "."))


def load(name: str) -> dict:
    return json.loads((PITCH_DIR / name).read_text())["data"]


def main() -> None:
    derby = json.loads(DERBY.read_text())
    match = load("match.json")
    shots_body = load("shots.json")
    stats = load("stats.json")
    lineups = load("lineups.json")
    players = load("players.json")
    advanced = load("advanced.json")

    pitch_shots = []
    for period in shots_body["periods"]:
        for shot in period["shots"]:
            pitch_shots.append(
                {
                    "player": shot["player"]["name"],
                    "side": "home" if shot["team_id"] == HOME else "away",
                    "minute": shot["minute"],
                    "depth_m": rnd(105 - shot["x"], 2),
                    "y_m": rnd(shot["y"], 2),
                    "xg": rnd(shot.get("expected_goals"), 3),
                    "xgot": rnd(shot.get("expected_goals_on_target"), 3),
                    "on_target": bool(shot.get("is_on_target")),
                    "result": shot.get("event_type"),
                    "situation": shot.get("situation"),
                    "body": shot.get("shot_type"),
                    "goal_y": rnd(shot.get("goal_crossed_y"), 2),
                    "goal_z": rnd(shot.get("goal_crossed_z"), 2),
                }
            )

    ts_shots = []
    for shot in derby["ts"]["shotmap"]:
        ts_shots.append(
            {
                "player": shot["player"],
                "side": shot["side"],
                "minute": shot["minute"],
                "depth_m": rnd(shot["x"], 2),
                "y_m": rnd(68 * (1 - float(shot["y"]) / 100), 2),
                "xg": rnd(shot.get("xg"), 3),
                "goal": bool(shot.get("goal")),
                "on_target": bool(shot.get("on_target")),
                "result": shot.get("result"),
            }
        )

    used: set[int] = set()
    pairs: list[tuple[int, int]] = []
    for i, pitch in enumerate(pitch_shots):
        cands = []
        for j, ts in enumerate(ts_shots):
            if j in used:
                continue
            if ts["side"] != pitch["side"] or ts["minute"] != pitch["minute"]:
                continue
            if norm(ts["player"]) != norm(pitch["player"]):
                continue
            cands.append(j)
        if not cands:
            continue
        best = min(cands, key=lambda j: abs((ts_shots[j]["xg"] or 0) - (pitch["xg"] or 0)))
        used.add(best)
        pairs.append((i, best))

    shot_rows = []
    xg_abs = []
    depth_abs = []
    for i, j in pairs:
        pitch, ts = pitch_shots[i], ts_shots[j]
        delta = None
        if pitch["xg"] is not None and ts["xg"] is not None:
            delta = rnd(pitch["xg"] - ts["xg"], 3)
            xg_abs.append(abs(delta))
        if pitch["depth_m"] is not None and ts["depth_m"] is not None:
            depth_abs.append(abs(pitch["depth_m"] - ts["depth_m"]))
        shot_rows.append(
            {
                "minute": pitch["minute"],
                "player": pitch["player"],
                "side": pitch["side"],
                "result_pitch": pitch["result"],
                "result_ts": ts["result"],
                "xg_pitch": pitch["xg"],
                "xg_ts": ts["xg"],
                "xg_delta": delta,
                "xgot": pitch["xgot"],
                "depth_pitch": pitch["depth_m"],
                "depth_ts": ts["depth_m"],
                "y_pitch": pitch["y_m"],
                "y_ts": ts["y_m"],
                "goal_y": pitch["goal_y"],
                "goal_z": pitch["goal_z"],
            }
        )

    lookup: dict[str, tuple] = {}
    for period in stats["periods"]:
        if period["period"] != "All":
            continue
        for group in period["groups"]:
            for item in group.get("items") or group.get("stats") or []:
                lookup.setdefault(item.get("key"), (item.get("home"), item.get("away")))

    sm_by = {row["id"]: row for row in derby["compare"]}

    def sides(source: str, key: str | None, digits: int):
        if not key or key not in sm_by:
            return None
        row = sm_by[key]
        return [rnd(row[f"{source}_home"], digits), rnd(row[f"{source}_away"], digits)]

    def pitch_sides(key: str, digits: int):
        home, away = lookup.get(key, (None, None))
        return [rnd(parse_num(home), digits), rnd(parse_num(away), digits)]

    def metric(label, sm_key, pitch_key, digits=0, note=None, ts_key=None):
        return {
            "label": label,
            "sm": sides("sm", sm_key, digits),
            "ts": sides("ts", ts_key or sm_key, digits),
            "pitch": pitch_sides(pitch_key, digits) if pitch_key else None,
            "note": note,
        }

    xgot = pitch_sides("expected_goals_on_target", 2)
    rows = [
        metric("Střely", "total_shots", "total_shots"),
        metric("Střely na branku", "shots_on_target", "ShotsOnTarget"),
        metric("Střely mimo", "shots_off_target", "ShotsOffTarget"),
        metric("Zblokované", "blocked_shots", "blocked_shots"),
        metric("Rohy", "corner_kicks", "corners"),
        metric("Držení %", "ball_possession", "BallPossesion"),
        metric("Fauly", "fouls", "fouls"),
        metric("Žluté", "yellow_cards", "yellow_cards"),
        metric("Ofsajdy", "offsides", "Offsides"),
        metric("Velké šance", "big_chances", "big_chance"),
        metric("Zákroky brankáře", "goalkeeper_saves", "keeper_saves"),
        metric(
            "xG",
            "expected_goals",
            "expected_goals",
            digits=2,
            note="SportMonks na Starteru xG nevrací.",
        ),
        {
            "label": "xGOT",
            "sm": None,
            "ts": None,
            "pitch": xgot,
            "note": "Hodnota po střele. TheStatsAPI ji na střele nemá.",
        },
        {
            "label": "Góly zabráněné",
            "sm": None,
            "ts": sides("ts", "goals_prevented", 2),
            "pitch": [rnd((xgot[1] or 0) - 3, 2), rnd((xgot[0] or 0) - 0, 2)],
            "note": "U PitchAPI dopočet: xGOT soupeře minus inkasované góly. TheStatsAPI vrací vlastní PSxG.",
        },
    ]

    def stat_value(player, key):
        for group in player["stats"]:
            block = group.get("stats") or {}
            if isinstance(block, dict):
                for item in block.values():
                    if item.get("key") == key:
                        return (item.get("stat") or {}).get("value")
        return None

    ts_players = {(row["side"], norm(row["name"])): row for row in derby["ts"]["players_rows"]}
    player_rows = []
    seen = set()
    for player in players:
        name = player["player"]["name"]
        side = "home" if player["team_id"] == HOME else "away"
        key = (side, norm(name))
        shots_n = stat_value(player, "total_shots") or 0
        xg = stat_value(player, "expected_goals")
        if not shots_n and not xg:
            continue
        ts = ts_players.get(key)
        seen.add(key)
        player_rows.append(
            {
                "name": name,
                "side": side,
                "goals": stat_value(player, "goals"),
                "shots": shots_n,
                "xg_pitch": rnd(xg, 2) if xg is not None else None,
                "xg_ts": rnd(ts.get("xg"), 2) if ts and ts.get("xg") is not None else None,
            }
        )
    player_rows.sort(key=lambda row: (-(row["xg_pitch"] or 0), row["side"], row["name"]))

    def xi(block):
        return [{"name": p["name"], "jersey": p.get("shirt_number")} for p in block.get("starters") or []]

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "note": "TEST. Základ zůstává SportMonks. Tohle srovnává jen doplněk na Sparta–Slavia 30. 8. 2026.",
        "match": {
            "date": "2026-08-30",
            "kickoff": match["time_utc"],
            "score": f"{match['score_home']}:{match['score_away']}",
            "home": "Sparta Praha",
            "away": "Slavia Praha",
            "pitch_id": match["id"],
            "league_pitch": match["league"]["name"],
            "season_pitch": match["season"],
            "round_pitch": match["round_name"],
            "stadium_pitch": match.get("stadium"),
            "stadium_sm": derby["match"].get("venue"),
            "referee_pitch": match.get("referee"),
            "referee_ts": ((derby["ts"].get("referee") or {}).get("referee") or {}).get("name"),
            "coach_home_pitch": (lineups["home"].get("coach") or {}).get("name"),
            "coach_away_pitch": (lineups["away"].get("coach") or {}).get("name"),
            "coach_home_ts": ((derby["ts"].get("managers") or {}).get("home") or {}).get("name"),
            "coach_away_ts": ((derby["ts"].get("managers") or {}).get("away") or {}).get("name"),
            "formation_pitch": [lineups["home"].get("formation"), lineups["away"].get("formation")],
            "formation_ts": [
                derby["ts"]["lineups"]["home"]["formation"],
                derby["ts"]["lineups"]["away"]["formation"],
            ],
            "xi_pitch": {"home": xi(lineups["home"]), "away": xi(lineups["away"])},
        },
        "summary": {
            "pitch_shots": len(pitch_shots),
            "ts_shots": len(ts_shots),
            "paired": len(pairs),
            "xg_mae": None,
            "depth_mae_m": None,
            "xgot_nonzero": sum(1 for shot in pitch_shots if (shot["xgot"] or 0) > 0),
            "goal_coords": sum(1 for shot in pitch_shots if shot["goal_y"] is not None),
        },
        "rows": rows,
        "shots": shot_rows,
        "unmatched": {
            "pitch": [
                f"{pitch_shots[i]['player']} {pitch_shots[i]['minute']}'"
                for i in range(len(pitch_shots))
                if i not in {a for a, _ in pairs}
            ],
            "ts": [
                f"{ts_shots[j]['player']} {ts_shots[j]['minute']}'"
                for j in range(len(ts_shots))
                if j not in used
            ],
        },
        "players": player_rows,
        "advanced": [
            {
                "name": team["team"]["name"],
                "possession_pct": team["territory"].get("possession_pct"),
                "field_tilt": team["territory"].get("field_tilt"),
                "ppda": team["defending"].get("ppda"),
            }
            for team in advanced["teams"]
        ],
    }
    # walrus above is awkward if lists were built earlier — recompute MAE from shot_rows
    deltas = [abs(row["xg_delta"]) for row in shot_rows if row["xg_delta"] is not None]
    depths = [
        abs(row["depth_pitch"] - row["depth_ts"])
        for row in shot_rows
        if row["depth_pitch"] is not None and row["depth_ts"] is not None
    ]
    out["summary"]["xg_mae"] = rnd(sum(deltas) / len(deltas), 3) if deltas else None
    out["summary"]["depth_mae_m"] = rnd(sum(depths) / len(depths), 2) if depths else None
    out["shots_pitch"] = [
        {"player": s["player"], "side": s["side"], "minute": s["minute"], "depth_m": s["depth_m"], "y_m": s["y_m"], "xg": s["xg"], "xgot": s["xgot"], "result": s["result"]}
        for s in pitch_shots
    ]
    out["shots_ts"] = [
        {"player": s["player"], "side": s["side"], "minute": s["minute"], "depth_m": s["depth_m"], "y_m": s["y_m"], "xg": s["xg"], "result": s["result"]}
        for s in ts_shots
    ]

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
    print(out["summary"])
    print("unmatched", out["unmatched"])
    print("xG", next(r for r in rows if r["label"] == "xG"))
    print("xGOT", next(r for r in rows if r["label"] == "xGOT"))


if __name__ == "__main__":
    main()
