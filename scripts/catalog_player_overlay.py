"""Ligový overlay hráčů: zápasy ze soupisek, kluby, loňské třetiny tabulky."""

from __future__ import annotations

from collections import defaultdict
from datetime import date

from build_match_data import score_for, to_iso_utc
from catalog_team_overlay import call_pages, last_seasons, sides

LINEUP_IDS = {
    "mn": 119,
    "g": 52,
    "a": 79,
    "sh": 42,
    "sot": 86,
    "f": 56,
    "y": 84,
    "r": 83,
    "dw": 106,
    "aw": 107,
    "tk": 78,
    "it": 100,
    "cl": 101,
    "sv": 57,
    "gc": 88,
    "kp": 117,
    "dr": 108,
    "ps": 111,
    "cr": 98,
}

ROLE_FROM_POS = {24: "gk", 25: "def", 26: "mid", 27: "att"}
ROLE_CS = {"gk": "Brankář", "def": "Obránce", "mid": "Záložník", "att": "Útočník"}


def lineup_value(detail: dict):
    raw = (detail.get("data") or {}).get("value")
    if raw is None:
        raw = detail.get("value")
    if isinstance(raw, dict):
        return raw.get("total", raw.get("count", raw.get("average")))
    return raw


def lineup_stats(row: dict) -> dict:
    out = {}
    for d in row.get("details") or []:
        tid = d.get("type_id")
        if tid is None:
            continue
        val = lineup_value(d)
        if val is None:
            continue
        try:
            out[int(tid)] = float(val)
        except (TypeError, ValueError):
            continue
    return out


def band_from_pos(pos) -> int:
    if pos is None:
        return 3
    try:
        p = int(pos)
    except (TypeError, ValueError):
        return 3
    if p <= 5:
        return 1
    if p <= 11:
        return 2
    return 3


def role_of(position_id) -> str:
    return ROLE_FROM_POS.get(int(position_id or 0), "mid")


def compact_player_match(fx: dict, lu: dict, known: set[int], prev_pos: dict[int, int]) -> dict | None:
    home, away = sides(fx)
    tid = lu.get("team_id")
    pid = lu.get("player_id")
    if not home or not away or not tid or not pid:
        return None
    hid, aid = int(home["id"]), int(away["id"])
    tid = int(tid)
    is_home = tid == hid
    if not is_home and tid != aid:
        return None
    oid = aid if is_home else hid
    hs = score_for(fx, hid)
    aws = score_for(fx, aid)
    if hs is None or aws is None:
        return None
    gf = hs if is_home else aws
    ga = aws if is_home else hs
    raw = lineup_stats(lu)
    st = {}
    for key, type_id in LINEUP_IDS.items():
        if type_id in raw:
            val = raw[type_id]
            st[key] = int(val) if float(val).is_integer() else round(val, 2)
    if "mn" not in st or st["mn"] <= 0:
        return None
    st.setdefault("g", 0)
    st.setdefault("a", 0)
    st.setdefault("y", 0)
    st.setdefault("r", 0)
    st["cs"] = 1 if ga == 0 else 0
    fid = int(fx.get("id"))
    pos = prev_pos.get(oid)
    return {
        "fid": fid,
        "s": fx.get("season_id"),
        "d": (to_iso_utc(fx.get("starting_at")) or "")[:10],
        "h": 1 if is_home else 0,
        "tid": tid,
        "tn": (home if is_home else away).get("name"),
        "oid": oid,
        "on": (away if is_home else home).get("name"),
        "hs": hs,
        "as": aws,
        "ob": band_from_pos(pos),
        "st": st,
        "mp": fid in known,
        "pid": int(pid),
        "pn": lu.get("player_name"),
        "pos": lu.get("position_id"),
        "no": lu.get("jersey_number"),
    }


def fetch_history_with_lineups(league_id: int, start: date, end: date) -> list:
    """Stejné okno jako týmová historie, ale se soupiskami."""
    from datetime import timedelta

    all_fx = []
    window = end
    while window > start:
        chunk_start = max(start, window - timedelta(days=95))
        chunk = call_pages(
            f"/fixtures/between/{chunk_start.isoformat()}/{window.isoformat()}",
            {
                "filters": f"fixtureLeagues:{league_id}",
                "include": "participants;scores;state;lineups.details",
            },
        )
        all_fx.extend(chunk)
        window = chunk_start - timedelta(days=1)
    finished = [fx for fx in all_fx if fx.get("state_id") == 5]
    print(f"  hráčská historie ligy {league_id}: {len(finished)} zápasů se soupiskami ({start} → {end})")
    return finished


def club_spans(matches: list) -> list:
    by_team: dict[int, list] = defaultdict(list)
    for m in matches:
        by_team[int(m["tid"])].append(m)
    out = []
    for tid, rows in by_team.items():
        rows.sort(key=lambda r: r.get("d") or "")
        out.append({
            "id": tid,
            "name": rows[0].get("tn") or f"Tým #{tid}",
            "from": (rows[0].get("d") or "")[:10] or None,
            "to": (rows[-1].get("d") or "")[:10] or None,
            "matches": len(rows),
        })
    out.sort(key=lambda c: c.get("from") or "", reverse=True)
    return out


def prev_tables_for_seasons(seasons: list[dict], parse_standings) -> dict[int, dict[int, int]]:
    """season_id -> {team_id: position} z konečné tabulky předchozí sezony."""
    ordered = [s for s in seasons if s.get("id") and s.get("starting_at")]
    ordered.sort(key=lambda s: s.get("starting_at") or "", reverse=True)
    out: dict[int, dict[int, int]] = {}
    for i, s in enumerate(ordered):
        sid = int(s["id"])
        if i + 1 >= len(ordered):
            out[sid] = {}
            continue
        prev_id = int(ordered[i + 1]["id"])
        table = parse_standings(prev_id) or {}
        out[sid] = {int(tid): row.get("position") for tid, row in table.items() if row.get("position") is not None}
        print(f"  loňská tabulka pro sezonu {s.get('name')}: {len(out[sid])} týmů (z {ordered[i+1].get('name')})")
    return out


def attach_player_overlays(
    league_id: int,
    current_season_id: int | None,
    seasons: list[dict],
    known: set[int],
    load_json,
    write_json,
    catalog,
    now_iso,
    league_name: str,
    parse_standings,
) -> None:
    if not seasons:
        seasons = last_seasons(league_id)
    start = date.fromisoformat(seasons[-1]["starting_at"][:10]) if seasons and seasons[-1].get("starting_at") else date.today().replace(year=date.today().year - 5)
    history = fetch_history_with_lineups(league_id, start, date.today())
    prev_by_season = prev_tables_for_seasons(seasons, parse_standings)

    by_player: dict[int, list] = defaultdict(list)
    meta: dict[int, dict] = {}
    for fx in history:
        sid = fx.get("season_id")
        prev_pos = prev_by_season.get(int(sid), {}) if sid else {}
        for lu in fx.get("lineups") or []:
            row = compact_player_match(fx, lu, known, prev_pos)
            if not row:
                continue
            pid = row.pop("pid")
            name = row.pop("pn")
            pos = row.pop("pos")
            no = row.pop("no")
            by_player[pid].append(row)
            hit = meta.setdefault(pid, {"name": None, "pos": None, "no": None, "tid": None, "tn": None})
            if name:
                hit["name"] = name
            if pos:
                hit["pos"] = pos
            if no is not None:
                hit["no"] = no
            if row.get("d") and (not hit.get("last") or row["d"] >= hit.get("last")):
                hit["last"] = row["d"]
                hit["tid"] = row.get("tid")
                hit["tn"] = row.get("tn")

    season_meta = {
        int(s["id"]): {"id": int(s["id"]), "name": s.get("name"), "starting_at": s.get("starting_at")}
        for s in seasons
        if s.get("id")
    }
    games_by_season: dict[int, int] = defaultdict(int)
    seen_fx: dict[int, set] = defaultdict(set)
    for fx in history:
        sid = fx.get("season_id")
        fid = fx.get("id")
        if sid and fid and fid not in seen_fx[int(sid)]:
            seen_fx[int(sid)].add(fid)
            games_by_season[int(sid)] += 1

    players_dir = catalog / "players"
    players_dir.mkdir(parents=True, exist_ok=True)
    index_players = []

    for pid, matches in sorted(by_player.items()):
        matches.sort(key=lambda m: m.get("d") or "", reverse=True)
        path = players_dir / f"{pid}.json"
        info = meta.get(pid) or {}
        role = role_of(info.get("pos"))
        player = load_json(path) or {
            "id": pid,
            "name": info.get("name") or f"Hráč #{pid}",
            "league_id": league_id,
            "league_name": league_name,
            "team_id": info.get("tid"),
            "team_name": info.get("tn"),
            "in_league": True,
        }
        if info.get("name") and not player.get("name"):
            player["name"] = info["name"]
        if info.get("no") is not None and player.get("number") is None:
            player["number"] = info["no"]
        if not player.get("position"):
            player["position"] = ROLE_CS.get(role)
        player["league_id"] = player.get("league_id") or league_id
        if not player.get("league_name") or str(player.get("league_name") or "").startswith("20"):
            player["league_name"] = league_name
        if info.get("tid") and not player.get("team_id"):
            player["team_id"] = info["tid"]
            player["team_name"] = info.get("tn")

        counts: dict[int, int] = defaultdict(int)
        for m in matches:
            if m.get("s"):
                counts[int(m["s"])] += 1
        season_rows = []
        for sid, n in sorted(counts.items(), key=lambda kv: season_meta.get(kv[0], {}).get("starting_at") or "", reverse=True):
            sm = season_meta.get(sid) or {"id": sid, "name": str(sid)}
            season_rows.append({
                "id": sid,
                "name": sm.get("name"),
                "starting_at": sm.get("starting_at"),
                "matches": n,
                "games": games_by_season.get(sid),
            })

        overlay = player.get("overlay") or {}
        overlay.update({
            "generated_at": now_iso(),
            "current_season_id": current_season_id,
            "role": role,
            "career_matches": len(matches),
            "clubs": club_spans(matches),
            "seasons": season_rows,
            "matches": matches,
        })
        player["overlay"] = overlay
        write_json(path, player)
        index_players.append({
            "id": pid,
            "name": player.get("name"),
            "image": player.get("image"),
            "role": role,
            "team_id": player.get("team_id"),
            "team_name": player.get("team_name"),
            "number": player.get("number"),
            "matches": matches,
        })
        print(f"  hráč {player.get('name')}: {len(matches)} zápasů, kluby={len(overlay['clubs'])}")

    explorer_path = catalog / "leagues" / f"{league_id}.players.json"
    explorer_path.parent.mkdir(parents=True, exist_ok=True)
    import json

    payload = {
        "generated_at": now_iso(),
        "league_id": league_id,
        "league_name": league_name,
        "current_season_id": current_season_id,
        "seasons": [
            {
                "id": int(s["id"]),
                "name": s.get("name"),
                "starting_at": s.get("starting_at"),
                "games": games_by_season.get(int(s["id"])),
            }
            for s in seasons
            if s.get("id")
        ],
        "players": index_players,
    }
    explorer_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"  index hráčů: {len(index_players)} ({explorer_path.name})")
