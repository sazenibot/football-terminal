"""Ligový overlay rozhodčích: zápasy, sezóny, tendence z historie ligy."""

from __future__ import annotations

from collections import defaultdict

from build_match_data import STAT_TYPE, fetch_referee_profile, main_referee, score_for, stat_value, to_iso_utc
from catalog_team_overlay import EVENT_IDS, sides

REF_STATS = [
    ("fouls", 56, "Fauly", "discipline"),
    ("yellow", 84, "Žluté karty", "discipline"),
    ("red", 83, "Červené karty", "discipline"),
    ("yellowred", 85, "Druhá žlutá", "discipline"),
    ("penalties", 47, "Penalty", "discipline"),
    ("var", 314, "Použití VAR", "discipline"),
    ("shots", STAT_TYPE["shots_total"], "Střely", "attack"),
    ("sot", STAT_TYPE["shots_on_target"], "Na bránu", "attack"),
    ("shots_off", EVENT_IDS["shots_off"], "Mimo", "attack"),
    ("shots_inside", EVENT_IDS["shots_inside"], "Z vápna", "attack"),
    ("shots_outside", EVENT_IDS["shots_outside"], "Mimo vápno", "attack"),
    ("shots_blocked", EVENT_IDS["shots_blocked"], "Zblokované", "attack"),
    ("attacks", EVENT_IDS["attacks"], "Útoky", "attack"),
    ("dangerous_attacks", EVENT_IDS["dangerous_attacks"], "Nebezpečné útoky", "attack"),
    ("big_chances", EVENT_IDS["big_chances"], "Velké šance", "attack"),
    ("big_chances_missed", EVENT_IDS["big_chances_missed"], "Zahozené velké šance", "attack"),
    ("assists", EVENT_IDS["assists"], "Asistence", "attack"),
    ("key_passes", EVENT_IDS["key_passes"], "Klíčové přihrávky", "attack"),
    ("passes", EVENT_IDS["passes"], "Přihrávky", "attack"),
    ("dribbles", EVENT_IDS["dribbles"], "Driblingy", "attack"),
    ("dribbles_ok", EVENT_IDS["dribbles_ok"], "Úspěšné driblingy", "attack"),
    ("saves", EVENT_IDS["saves"], "Zákroky", "defense"),
    ("tackles", EVENT_IDS["tackles"], "Skluzy", "defense"),
    ("tackles_won", EVENT_IDS["tackles_won"], "Vyhrané skluzy", "defense"),
    ("interceptions", EVENT_IDS["interceptions"], "Zachycené přihrávky", "defense"),
    ("duels_won", EVENT_IDS["duels_won"], "Vyhrané souboje", "defense"),
    ("corners", STAT_TYPE["corners"], "Rohy", "setpiece"),
    ("free_kicks", EVENT_IDS["free_kicks"], "Standardky", "setpiece"),
    ("throwins", EVENT_IDS["throwins"], "Auty", "setpiece"),
    ("goal_kicks", EVENT_IDS["goal_kicks"], "Výkopy", "setpiece"),
    ("crosses", EVENT_IDS["crosses"], "Centry", "setpiece"),
    ("accurate_crosses", EVENT_IDS["accurate_crosses"], "Přesné centry", "setpiece"),
    ("offsides", EVENT_IDS["offsides"], "Ofsajdy", "setpiece"),
]


def stat_pair(fx: dict, home_id: int, away_id: int, type_id: int) -> list | None:
    home = stat_value(fx, home_id, type_id)
    away = stat_value(fx, away_id, type_id)
    if home is None and away is None:
        return None
    return [home, away]


def referee_name(fx: dict, rid: int) -> str | None:
    for row in fx.get("referees") or []:
        if row.get("type_id") != 6:
            continue
        if int(row.get("referee_id") or 0) != rid:
            continue
        person = row.get("referee") or {}
        return row.get("name") or person.get("display_name") or person.get("name")
    return None


def compact_ref_match(fx: dict, known: set[int]) -> dict | None:
    home, away = sides(fx)
    rid = main_referee(fx)
    if not home or not away or not rid:
        return None
    hid, aid = int(home["id"]), int(away["id"])
    hs = score_for(fx, hid)
    aws = score_for(fx, aid)
    if hs is None or aws is None:
        return None
    stats = {}
    for key, type_id, *_ in REF_STATS:
        pair = stat_pair(fx, hid, aid, type_id)
        if pair is not None:
            stats[key] = pair
    fid = int(fx.get("id"))
    return {
        "fid": fid,
        "s": fx.get("season_id"),
        "d": (to_iso_utc(fx.get("starting_at")) or "")[:10],
        "hid": hid,
        "aid": aid,
        "hn": home.get("name"),
        "an": away.get("name"),
        "hs": hs,
        "as": aws,
        "st": stats,
        "mp": fid in known,
        "rid": int(rid),
        "rn": referee_name(fx, int(rid)),
    }


DISC_KEYS = [key for key, _i, _lab, group in REF_STATS if group == "discipline"]


def sm_season_slice(block: dict | None) -> dict:
    if not block:
        return {}
    out = {}
    for d in block.get("details") or []:
        tname = ((d.get("type") or {}).get("name") or "").lower()
        val = d.get("value") or {}
        if "yellowred" in tname.replace(" ", ""):
            out["yellowred"] = (val.get("all") or val).get("average")
            out["yellowred_count"] = (val.get("all") or val).get("count")
        elif tname == "var moments":
            out["var"] = val.get("average")
            out["var_count"] = val.get("count")
        elif tname == "season matches":
            out["sm_matches"] = val.get("count")
    return out


def pair_total(pair) -> float | None:
    if not pair:
        return None
    vals = [v for v in pair if v is not None]
    return sum(vals) if vals else None


def mean(values: list) -> float | None:
    clean = [v for v in values if v is not None]
    if not clean:
        return None
    return round(sum(clean) / len(clean), 2)


def matches_in(matches: list, season_id: int | None) -> list:
    if season_id is None:
        return matches
    return [m for m in matches if m.get("s") == season_id]


ZERO_IF_ABSENT = {"red", "penalties"}
HAS_MATCH_DISC = {"fouls", "yellow", "red", "penalties"}


def match_total(m: dict, key: str) -> float | None:
    st = m.get("st") or {}
    total = pair_total(st.get(key))
    if total is not None:
        return total
    if key in ZERO_IF_ABSENT and any(k in st for k in HAS_MATCH_DISC):
        return 0.0
    return None


def avgs_from_matches(matches: list) -> dict:
    out = {}
    for key in DISC_KEYS:
        out[key] = mean([match_total(m, key) for m in matches])
    return out


def sm_fill(season_rows: list, season_id: int | None) -> dict:
    rows = season_rows if season_id is None else [s for s in season_rows if s.get("id") == season_id]
    out = {}
    for key in ("yellowred", "var"):
        weighted_n = 0.0
        weighted_d = 0.0
        for s in rows:
            sm = s.get("sm") or {}
            avg = sm.get(key)
            count = sm.get(f"{key}_count")
            n = sm.get("sm_matches") or s.get("matches") or 0
            if avg is None and count is None:
                continue
            if count is not None and n:
                weighted_n += count
                weighted_d += n
            elif avg is not None:
                w = n or 1
                weighted_n += avg * w
                weighted_d += w
        out[key] = round(weighted_n / weighted_d, 2) if weighted_d else None
    return out


def unique_matches(by_ref: dict[int, list]) -> list:
    seen: dict[int, dict] = {}
    for matches in by_ref.values():
        for m in matches:
            fid = m.get("fid")
            if fid is None:
                continue
            seen[int(fid)] = m
    return list(seen.values())


def rank_desc(value, pool: list) -> tuple[int | None, int]:
    vals = [v for v in pool if v is not None]
    if value is None or not vals:
        return None, len(vals)
    stricter = sum(1 for v in vals if v > value)
    return stricter + 1, len(vals)


def build_discipline_map(by_ref: dict[int, list], sm_by_ref: dict[int, list], season_ids: list[int]) -> dict:
    """Ligový průměr ze zápasů + pořadí mezi hlavními rozhodčími (1. = nejvíc / přísnější)."""
    all_matches = unique_matches(by_ref)
    result = {rid: {"all": {}, "seasons": {}} for rid in by_ref}
    for sid in [None, *season_ids]:
        bucket = matches_in(all_matches, sid)
        match_avgs = avgs_from_matches(bucket)
        ref_vals: dict[str, dict[int, float]] = {key: {} for key in DISC_KEYS}
        ref_avgs: dict[int, dict] = {}
        for rid, matches in by_ref.items():
            subset = matches_in(matches, sid)
            if not subset:
                continue
            avgs = avgs_from_matches(subset)
            fill = sm_fill(sm_by_ref.get(rid) or [], sid)
            for key in ("yellowred", "var"):
                if avgs.get(key) is None:
                    avgs[key] = fill.get(key)
            ref_avgs[rid] = avgs
            for key in DISC_KEYS:
                if avgs.get(key) is not None:
                    ref_vals[key][rid] = avgs[key]
        sm_league = {
            key: mean(list(ref_vals[key].values()))
            for key in ("yellowred", "var")
            if match_avgs.get(key) is None
        }
        for rid, avgs in ref_avgs.items():
            block = {}
            for key in DISC_KEYS:
                league = match_avgs.get(key)
                if league is None:
                    league = sm_league.get(key)
                rank, size = rank_desc(avgs.get(key), list(ref_vals[key].values()))
                block[key] = {"league_avg": league, "rank": rank, "size": size}
            if sid is None:
                result[rid]["all"] = block
            else:
                result[rid]["seasons"][str(sid)] = block
    return result


def recompute_discipline_on_disk(catalog, load_json, write_json) -> int:
    refs_dir = catalog / "referees"
    by_ref: dict[int, list] = {}
    sm_by_ref: dict[int, list] = {}
    files: dict[int, tuple] = {}
    for path in refs_dir.glob("*.json"):
        data = load_json(path)
        if not data:
            continue
        matches = (data.get("overlay") or {}).get("matches") or []
        if not matches:
            continue
        rid = int(data["id"])
        by_ref[rid] = matches
        sm_by_ref[rid] = (data.get("overlay") or {}).get("seasons") or []
        files[rid] = (path, data)
    season_ids = sorted({int(m["s"]) for matches in by_ref.values() for m in matches if m.get("s")})
    disc = build_discipline_map(by_ref, sm_by_ref, season_ids)
    for rid, (path, data) in files.items():
        overlay = data.get("overlay") or {}
        overlay["discipline"] = disc[rid]
        data["overlay"] = overlay
        write_json(path, data)
    return len(files)


def attach_referee_overlays(
    history: list,
    seasons: list[dict],
    current_season_id: int | None,
    known: set[int],
    load_json,
    write_json,
    catalog,
    now_iso,
    league_id: int,
    league_name: str,
) -> None:
    by_ref: dict[int, list] = defaultdict(list)
    names: dict[int, str] = {}
    for fx in history:
        row = compact_ref_match(fx, known)
        if not row:
            continue
        rid = row.pop("rid")
        name = row.pop("rn")
        by_ref[rid].append(row)
        if name:
            names[rid] = name

    season_meta = {
        int(s["id"]): {"id": int(s["id"]), "name": s.get("name"), "starting_at": s.get("starting_at")}
        for s in seasons
        if s.get("id")
    }

    refs_dir = catalog / "referees"
    refs_dir.mkdir(parents=True, exist_ok=True)

    payloads: dict[int, tuple] = {}
    sm_by_ref: dict[int, list] = {}
    for rid, matches in sorted(by_ref.items()):
        matches.sort(key=lambda m: m.get("d") or "", reverse=True)
        path = refs_dir / f"{rid}.json"
        ref = load_json(path) or {
            "id": rid,
            "name": names.get(rid) or f"Rozhodčí #{rid}",
            "league_id": league_id,
            "league_name": league_name,
            "in_league": True,
            "leagues": [],
        }
        if not ref.get("league_id"):
            ref["league_id"] = league_id
        if not ref.get("league_name") or str(ref.get("league_name") or "").startswith("20"):
            ref["league_name"] = league_name or ref.get("league_name")
        ref["in_league"] = True
        ref["league_matches"] = sum(1 for m in matches if m.get("s") == current_season_id) or len(matches)

        counts: dict[int, int] = defaultdict(int)
        for m in matches:
            sid = m.get("s")
            if sid:
                counts[int(sid)] += 1

        profile = fetch_referee_profile(rid)
        if profile.get("display_name") or profile.get("name"):
            ref["name"] = profile.get("display_name") or profile.get("name")
            ref["common_name"] = profile.get("common_name") or ref.get("common_name")
            ref["image"] = profile.get("image_path") or ref.get("image")
            ref["date_of_birth"] = profile.get("date_of_birth") or ref.get("date_of_birth")
        sm_by_season = {}
        for block in profile.get("statistics") or []:
            sid = block.get("season_id")
            if sid:
                sm_by_season[int(sid)] = sm_season_slice(block)

        season_rows = []
        for sid, n in sorted(counts.items(), key=lambda kv: season_meta.get(kv[0], {}).get("starting_at") or "", reverse=True):
            meta = season_meta.get(sid) or {"id": sid, "name": str(sid)}
            season_rows.append({
                "id": sid,
                "name": meta.get("name"),
                "starting_at": meta.get("starting_at"),
                "matches": n,
                "sm": sm_by_season.get(sid) or {},
            })
        payloads[rid] = (path, ref, matches, season_rows)
        sm_by_ref[rid] = season_rows

    season_ids = sorted({int(m["s"]) for matches in by_ref.values() for m in matches if m.get("s")})
    disc = build_discipline_map(by_ref, sm_by_ref, season_ids)

    for rid, (path, ref, matches, season_rows) in payloads.items():
        overlay = ref.get("overlay") or {}
        overlay.update({
            "generated_at": now_iso(),
            "current_season_id": current_season_id,
            "career_matches": len(matches),
            "seasons": season_rows,
            "matches": matches,
            "stat_meta": [{"key": k, "label": lab, "group": grp} for k, _i, lab, grp in REF_STATS],
            "discipline": disc.get(rid) or {"all": {}, "seasons": {}},
        })
        ref["overlay"] = overlay
        write_json(path, ref)
        print(f"  rozhodčí {ref.get('name')}: {len(matches)} zápasů, sezón={len(season_rows)}")
