"""Zápasy ligy z archivu TheStatsAPI (data-archive/thestatsapi/{liga}/), nezávisle na PitchAPI.

Řádek zápasu má stejný tvar jako v sim_v2 (id, date, home, away, hg, ag, hxg, axg, hshots, ...), takže
model (sim_v2.lambdas_opp) jde spustit na libovolné lize a sezóně. Chybějící statistika je None.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "data-archive" / "thestatsapi"
PITCH = ROOT / "data-archive" / "pitchapi"
# Chance Liga bere celou historii z TheStatsAPI (PitchAPI má jen od 2024/25, xG obou zdrojů je prakticky shodné), ostatní z PitchAPI
SOURCE = {"chance": "ts", "pl": "pitch", "bl": "pitch", "ll": "pitch", "ere": "pitch"}


def season_label(day: str) -> str:
    y, m = int(day[:4]), int(day[5:7])
    start = y if m >= 7 else y - 1
    return f"{start}/{str(start + 1)[2:]}"


def _jsonl(path: Path) -> dict[str, dict]:
    out: dict[str, dict] = {}
    if not path.exists():
        return out
    with path.open(encoding="utf-8") as f:
        for line in f:
            try:
                r = json.loads(line)
            except ValueError:
                continue
            if r.get("status") == 200:
                out[r["id"]] = r["body"]
    return out


def _side(block: dict | None, key: str, side: str):
    v = ((block or {}).get(key) or {}).get("all") or {}
    return v.get(side)


def load_matches(slug: str) -> list[dict]:
    return load_pitch_matches(slug) if SOURCE.get(slug) == "pitch" else load_ts_matches(slug)


def _num(v):
    try:
        return float(str(v).split(" ")[0].replace(",", "."))
    except ValueError:
        return None


def _pitch_stat(body: dict, key: str, side: str):
    for period in (body.get("data") or {}).get("periods") or []:
        if period.get("period") != "All":
            continue
        for g in period.get("groups") or []:
            for it in g.get("items") or []:
                if it.get("key") == key and it.get(side) not in (None, ""):
                    return _num(it[side])
    return None


def pitch_row(m: dict, st: dict | None) -> dict:
    """Jeden dohraný zápas z PitchAPI (řádek soupisky + odpověď /stats) v tvaru, který čte simulace."""
    day = m["date"][:10]
    st = st or {}
    g = lambda k, side: _pitch_stat(st, k, side)  # noqa: E731
    return {
        "id": m["id"],
        "date": day,
        "season": season_label(day),
        "stage": None,
        "home": m["home_team"]["id"],
        "away": m["away_team"]["id"],
        "home_name": m["home_team"]["name"],
        "away_name": m["away_team"]["name"],
        "hg": int(m["score_home"]),
        "ag": int(m["score_away"]),
        "hxg": g("expected_goals", "home"),
        "axg": g("expected_goals", "away"),
        "hxgot": g("expected_goals_on_target", "home"),
        "axgot": g("expected_goals_on_target", "away"),
        "hshots": g("total_shots", "home"),
        "ashots": g("total_shots", "away"),
        "hsot": g("ShotsOnTarget", "home"),
        "asot": g("ShotsOnTarget", "away"),
        "hcorners": g("corners", "home"),
        "acorners": g("corners", "away"),
    }


def load_pitch_matches(slug: str) -> list[dict]:
    base = PITCH / slug
    stats = _jsonl(base / "stats.jsonl")
    out = []
    for path in sorted(base.glob("matches-*.json")):
        for m in json.loads(path.read_text(encoding="utf-8")):
            if m.get("status") != "finished" or m.get("score_home") is None or m.get("score_away") is None:
                continue
            out.append(pitch_row(m, stats.get(m["id"])))
    return sorted(out, key=lambda r: (r["date"], r["id"]))


def load_ts_matches(slug: str) -> list[dict]:
    """Dohrané zápasy se skóre a statistikami (xG, střely, SOT, rohy), seřazené podle data."""
    base = ARCHIVE / slug
    rows = json.loads((base / "matches.json").read_text(encoding="utf-8"))
    stats = _jsonl(base / "stats.jsonl")
    out = []
    for m in rows:
        sc = m.get("score") or {}
        if m.get("status") != "finished" or sc.get("home") is None or sc.get("away") is None:
            continue
        day = m["utc_date"][:10]
        ov = ((stats.get(m["id"]) or {}).get("data") or {}).get("overview")
        out.append(
            {
                "id": m["id"],
                "date": day,
                "season": season_label(day),
                "stage": m.get("stage_name"),
                "home": m["home_team"]["id"],
                "away": m["away_team"]["id"],
                "home_name": m["home_team"]["name"],
                "away_name": m["away_team"]["name"],
                "hg": int(sc["home"]),
                "ag": int(sc["away"]),
                "hxg": _side(ov, "expected_goals", "home"),
                "axg": _side(ov, "expected_goals", "away"),
                "hxgot": None,
                "axgot": None,
                "hshots": _side(ov, "total_shots", "home"),
                "ashots": _side(ov, "total_shots", "away"),
                "hsot": _side(ov, "shots_on_target", "home"),
                "asot": _side(ov, "shots_on_target", "away"),
                "hcorners": _side(ov, "corner_kicks", "home"),
                "acorners": _side(ov, "corner_kicks", "away"),
            }
        )
    return sorted(out, key=lambda r: (r["date"], r["id"]))


def _f(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def _fold(x: str) -> str:
    import re
    import unicodedata

    x = "".join(c for c in unicodedata.normalize("NFKD", x or "") if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9 ]", " ", x.lower()).strip()


def load_odds(slug: str) -> dict[str, dict]:
    """Kurzy podle id zápasu primárního zdroje (u PitchAPI se zápasy z TheStatsAPI páruji podle data, skóre a názvů týmů)."""
    odds = _load_ts_odds(slug)
    if SOURCE.get(slug) != "pitch" or not odds or not (ARCHIVE / slug / "matches.json").exists():
        return odds if SOURCE.get(slug) != "pitch" else {}
    from difflib import SequenceMatcher

    ts = {m["id"]: m for m in json.loads((ARCHIVE / slug / "matches.json").read_text(encoding="utf-8"))}
    pit: dict[tuple, list[dict]] = {}
    for m in load_pitch_matches(slug):
        pit.setdefault((m["hg"], m["ag"]), []).append(m)
    from datetime import date, timedelta

    out: dict[str, dict] = {}
    for tid, o in odds.items():
        t = ts.get(tid)
        sc = (t or {}).get("score") or {}
        if not t or sc.get("home") is None:
            continue
        d = date.fromisoformat(t["utc_date"][:10])
        near = {(d + timedelta(days=k)).isoformat() for k in (-1, 0, 1)}
        cands = [m for m in pit.get((int(sc["home"]), int(sc["away"])), []) if m["date"] in near]

        def sim(m: dict) -> float:
            a = SequenceMatcher(None, _fold(m["home_name"]), _fold(t["home_team"]["name"])).ratio()
            b = SequenceMatcher(None, _fold(m["away_name"]), _fold(t["away_team"]["name"])).ratio()
            return a + b

        if cands:
            best = max(cands, key=sim)
            if len(cands) == 1 or sim(best) > 1.0:
                out[best["id"]] = o
    return out


def _load_ts_odds(slug: str) -> dict[str, dict]:
    """match id → kurzy prvního bookmakera (v archivu je Bet365): 1X2 a Over/Under 1,5 / 2,5 / 3,5 (poslední viděná hodnota)."""
    out: dict[str, dict] = {}
    for mid, body in _jsonl(ARCHIVE / slug / "odds.jsonl").items():
        bks = (body.get("data") or {}).get("bookmakers") or []
        if not bks:
            continue
        mk = bks[0].get("markets") or {}
        mo = mk.get("match_odds") or {}
        row = {
            "bookmaker": bks[0].get("bookmaker"),
            "home": _f((mo.get("home") or {}).get("last_seen")),
            "draw": _f((mo.get("draw") or {}).get("last_seen")),
            "away": _f((mo.get("away") or {}).get("last_seen")),
        }
        tg = mk.get("total_goals") or {}
        for line, tag in (("1.5", "15"), ("2.5", "25"), ("3.5", "35")):
            row[f"over{tag}"] = _f(((tg.get(line) or {}).get("over") or {}).get("last_seen"))
            row[f"under{tag}"] = _f(((tg.get(line) or {}).get("under") or {}).get("last_seen"))
        out[mid] = row
    return out
