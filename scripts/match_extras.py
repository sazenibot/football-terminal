#!/usr/bin/env python3
"""Kurzy (Chance.cz přes PulseScore) + AI analýza (OpenAI) + přepočet simulace.

Volá se z refresh_data po sestavení zápasu. Tokeny jen z env/.env — ne do frontendu.
"""

from __future__ import annotations

import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import certifi

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(Path(__file__).parent))

from build_match_data import simulate_from_facts  # noqa: E402

SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
_PULSESCORE_DISABLED = False
_PULSESCORE_LAST_CALL = 0.0
_CHANCE_EVENTS: dict[str, list] = {}

CHANCE_API_BASE = "https://api.pulsescore.net/api/chance"

# PulseScore/Chance názvy lig. První, který vrátí eventy, vyhraje.
CHANCE_LEAGUE_BY_ID: dict[int, tuple[str, ...]] = {
    262: ("Česká Chance Liga", "Chance Liga", "1. česká liga"),
    265: ("Česká Chance Národní Liga",),
    8: ("1. anglická liga",),
    82: ("1. německá liga",),
    564: ("1. španělská liga",),
}

LINE_OVER_RE = re.compile(r":\s*([0-9]+(?:[.,][0-9]+)?)\+")
LINE_UNDER_RE = re.compile(r"méně než\s+([0-9]+(?:[.,][0-9]+)?)")
METRIC_FROM_KEY = {
    "shots_over": "shots",
    "shots_under": "shots",
    "sot_over": "sot",
    "sot_under": "sot",
    "fouls_over": "fouls",
    "fouls_under": "fouls",
    "offsides_over": "offsides",
    "offsides_under": "offsides",
}


def _env(name: str) -> str:
    val = os.environ.get(name, "").strip()
    if val:
        return val
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            m = re.match(rf"^{re.escape(name)}=(.+)$", line.strip())
            if m:
                return m.group(1).strip()
    return ""


def _norm(name: str) -> str:
    s = (name or "").lower()
    repl = str.maketrans("áéíóúýčďěňřšťžäöüñøå", "aeiouycdenrstzaounoa")
    s = s.translate(repl)
    s = s.replace("prague", "praha").replace("pilsen", "plzen")
    for junk in ("fc ", "cf ", "de ", "the ", "."):
        s = s.replace(junk, " ")
    return re.sub(r"[^a-z0-9]+", "", s)


def _http_json(url: str, headers: dict, payload: dict | None = None, timeout: int = 60) -> dict | list | None:
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method="GET" if payload is None else "POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=SSL_CONTEXT) as resp:
            raw = resp.read()
            if resp.headers.get("Content-Encoding") == "gzip":
                import gzip
                raw = gzip.decompress(raw)
            return json.loads(raw.decode())
    except urllib.error.HTTPError as e:
        print(f"  ⚠️ HTTP {e.code} on extras {url.split('?')[0]}", file=sys.stderr)
        if e.code == 429 and "pulsescore" in url.lower():
            global _PULSESCORE_DISABLED
            _PULSESCORE_DISABLED = True
        return None
    except Exception as exc:
        print(f"  ⚠️ extras: {exc}", file=sys.stderr)
        return None


def _chance_get(path: str) -> dict | list | None:
    """Chance deska přes PulseScore. BASIC = 1 req/s; jeden call na ligu."""
    global _PULSESCORE_LAST_CALL, _PULSESCORE_DISABLED
    if _PULSESCORE_DISABLED:
        return None
    token = _env("PULSESCORE_API_TOKEN")
    if not token:
        return None
    wait = 1.15 - (time.monotonic() - _PULSESCORE_LAST_CALL)
    if wait > 0:
        time.sleep(wait)
    headers = {"X-Secret": token, "Accept": "application/json", "Accept-Encoding": "gzip"}
    body = _http_json(f"{CHANCE_API_BASE}{path}", headers)
    _PULSESCORE_LAST_CALL = time.monotonic()
    return body


def _decimal(sel: dict) -> float | None:
    for key in ("decimal", "odds", "price", "priceDecimal"):
        val = sel.get(key)
        if val is None:
            continue
        try:
            return round(float(val), 2)
        except (TypeError, ValueError):
            continue
    return None


def _line_f(val) -> float | None:
    if val is None or val == "":
        return None
    try:
        return float(str(val).replace(",", "."))
    except (TypeError, ValueError):
        return None


def _period(mkt: dict) -> str:
    return str(mkt.get("period") or "FULL_TIME").upper().replace(" ", "_")


def _put_line(store: dict, metric: str, line: float | None, outcome: str, dec: float) -> None:
    if line is None:
        return
    bucket = store.setdefault(metric, {})
    slot = bucket.setdefault(line, {})
    if outcome == "OVER":
        slot.setdefault("over", dec)
    elif outcome == "UNDER":
        slot.setdefault("under", dec)


def _lookup_line(store: dict, metric: str, line: float | None, direction: str) -> float | None:
    lines = store.get(metric) or {}
    if not lines:
        return None
    if line is not None and line in lines and direction in lines[line]:
        return lines[line][direction]
    if line is None:
        return None
    best = min(lines, key=lambda x: abs(x - line))
    if abs(best - line) <= 0.5:
        return lines[best].get(direction)
    return None


def extract_odds_board(event: dict, home_name: str, away_name: str) -> dict:
    """Chance trhy → match/home/away klíče + OU lajny pro dynamické trendy."""
    home_n, away_n = _norm(home_name), _norm(away_name)
    match_keys: dict[str, float] = {"source": "chance"}  # type: ignore[dict-item]
    home_keys: dict[str, float] = {}
    away_keys: dict[str, float] = {}
    match_lines: dict[str, dict] = {}
    home_lines: dict[str, dict] = {}
    away_lines: dict[str, dict] = {}

    for mkt in event.get("markets") or []:
        period = _period(mkt)
        canon = str(mkt.get("canonicalMarket") or "").upper()
        raw = str(mkt.get("rawName") or "")
        raw_l = raw.lower()
        raw_n = _norm(raw)
        mkt_line = _line_f(mkt.get("line"))
        has_home = bool(home_n and home_n in raw_n)
        has_away = bool(away_n and away_n in raw_n)
        team_side = "home" if has_home and not has_away else "away" if has_away and not has_home else None

        for sel in mkt.get("selections") or []:
            dec = _decimal(sel)
            if dec is None:
                continue
            outcome = str(sel.get("canonicalOutcome") or "").upper()
            line = _line_f(sel.get("line")) if sel.get("line") is not None else mkt_line

            if period == "FIRST_HALF" and canon == "HALF_TIME_RESULT":
                if outcome == "HOME":
                    home_keys.setdefault("ht_leading", dec)
                    away_keys.setdefault("ht_behind", dec)
                elif outcome == "AWAY":
                    away_keys.setdefault("ht_leading", dec)
                    home_keys.setdefault("ht_behind", dec)
                elif outcome == "DRAW":
                    home_keys.setdefault("ht_draw", dec)
                    away_keys.setdefault("ht_draw", dec)
                continue

            if period not in ("FULL_TIME", "FT", ""):
                continue

            if canon == "MATCH_RESULT" and raw_l.startswith("výsledek zápasu"):
                if outcome == "HOME":
                    match_keys.setdefault("home", dec)
                elif outcome == "AWAY":
                    match_keys.setdefault("away", dec)
                elif outcome == "DRAW":
                    match_keys.setdefault("draw", dec)

            if canon == "BOTH_TEAMS_TO_SCORE" and (line in (1, 1.0, None) or "1 a více" in raw_l):
                if line in (2, 2.0):
                    continue
                if outcome == "YES":
                    match_keys.setdefault("btts", dec)

            if canon == "OVER_UNDER" and "počet gólů v zápasu" in raw_l and "tým" not in raw_l:
                if line == 1.5 and outcome == "OVER":
                    match_keys.setdefault("over15", dec)
                if line == 2.5 and outcome == "OVER":
                    match_keys.setdefault("over25", dec)
                if line == 2.5 and outcome == "UNDER":
                    match_keys.setdefault("under25", dec)

            if canon == "HOME_OVER_UNDER" and "počet gólů týmu" in raw_l:
                if line == 0.5 and outcome == "UNDER":
                    home_keys.setdefault("scoreless", dec)
                    away_keys.setdefault("clean_sheet", dec)
                if line == 1.5 and outcome == "OVER":
                    home_keys.setdefault("scored2plus", dec)
            if canon == "AWAY_OVER_UNDER" and "počet gólů týmu" in raw_l:
                if line == 0.5 and outcome == "UNDER":
                    away_keys.setdefault("scoreless", dec)
                    home_keys.setdefault("clean_sheet", dec)
                if line == 1.5 and outcome == "OVER":
                    away_keys.setdefault("scored2plus", dec)

            if canon == "CORNERS_OVER_UNDER" and "týmu" not in raw_l:
                if line == 9.5 and outcome == "OVER":
                    match_keys.setdefault("corners_over95", dec)
                if line == 9.5 and outcome == "UNDER":
                    match_keys.setdefault("corners_under95", dec)
                _put_line(match_lines, "corners", line, outcome, dec)
            if canon in ("HOME_CORNERS_OVER_UNDER", "AWAY_CORNERS_OVER_UNDER"):
                side_store = home_lines if canon.startswith("HOME") else away_lines
                _put_line(side_store, "corners", line, outcome, dec)

            if canon == "CORNERS_MATCH_RESULT":
                if outcome == "HOME":
                    home_keys.setdefault("more_corners", dec)
                elif outcome == "AWAY":
                    away_keys.setdefault("more_corners", dec)

            if canon == "CARDS_OVER_UNDER" and "žlut" in raw_l and "týmu" not in raw_l:
                if line == 4.5 and outcome == "OVER":
                    match_keys.setdefault("yellow_5plus", dec)
                if line == 4.5 and outcome == "UNDER":
                    match_keys.setdefault("yellow_under5", dec)
            if canon == "HOME_CARDS_OVER_UNDER" and "žlut" in raw_l:
                if line == 1.5 and outcome == "OVER":
                    home_keys.setdefault("team_2plus_yellow", dec)
            if canon == "AWAY_CARDS_OVER_UNDER" and "žlut" in raw_l:
                if line == 1.5 and outcome == "OVER":
                    away_keys.setdefault("team_2plus_yellow", dec)

            if "červených karet v zápasu" in raw_l and "týmu" not in raw_l:
                if line == 0.5 and outcome == "OVER":
                    match_keys.setdefault("red_card", dec)

            if "počet faulů" in raw_l:
                if team_side == "home":
                    _put_line(home_lines, "fouls", line, outcome, dec)
                elif team_side == "away":
                    _put_line(away_lines, "fouls", line, outcome, dec)
                elif "týmu" not in raw_l and "každý tým" not in raw_l:
                    _put_line(match_lines, "fouls", line, outcome, dec)

            if "ofsajd" in raw_l:
                if team_side == "home":
                    _put_line(home_lines, "offsides", line, outcome, dec)
                elif team_side == "away":
                    _put_line(away_lines, "offsides", line, outcome, dec)
                else:
                    _put_line(match_lines, "offsides", line, outcome, dec)

            if "střel" in raw_l and "branku" in raw_l and "střelec" not in raw_l:
                if team_side == "home":
                    _put_line(home_lines, "sot", line, outcome, dec)
                elif team_side == "away":
                    _put_line(away_lines, "sot", line, outcome, dec)
                elif "handicap" not in raw_l and "každý tým" not in raw_l:
                    _put_line(match_lines, "sot", line, outcome, dec)

    # source is metadata, not a price
    prices = {k: v for k, v in match_keys.items() if k != "source" and isinstance(v, (int, float))}
    return {
        "source": "chance",
        "match": prices,
        "home": home_keys,
        "away": away_keys,
        "match_lines": match_lines,
        "home_lines": home_lines,
        "away_lines": away_lines,
    }


def _line_from_label(item: dict) -> tuple[float | None, str | None]:
    lab = item.get("label") or ""
    m = LINE_OVER_RE.search(lab)
    if m:
        return _line_f(m.group(1)), "over"
    m = LINE_UNDER_RE.search(lab)
    if m:
        return _line_f(m.group(1)), "under"
    return None, None


def odds_for_trend(item: dict, board: dict, side: str | None) -> float | None:
    key = item.get("key")
    match_keys = board.get("match") or {}
    if key in match_keys:
        return match_keys[key]
    if side in ("home", "away") and key in (board.get(side) or {}):
        return board[side][key]
    metric = METRIC_FROM_KEY.get(key)
    if not metric:
        return None
    line, direction = _line_from_label(item)
    if not direction:
        direction = "over" if str(key).endswith("_over") else "under"
    stores = []
    if side in ("home", "away"):
        stores.append(board.get(f"{side}_lines") or {})
        # ofsajdy Chance cení jen na zápas, ne na tým
        if metric == "offsides":
            stores.append(board.get("match_lines") or {})
    else:
        stores.append(board.get("match_lines") or {})
    for store in stores:
        val = _lookup_line(store, metric, line, direction)
        if val is not None:
            return val
    return None


def fetch_league_events(league_names: tuple[str, ...]) -> list:
    cache_key = league_names[0]
    if cache_key in _CHANCE_EVENTS:
        return _CHANCE_EVENTS[cache_key]
    events: list = []
    used = cache_key
    for name in league_names:
        q = urllib.parse.quote(name, safe="")
        body = _chance_get(f"/soccer/leagues/{q}/events?limit=30")
        found = body.get("events") if isinstance(body, dict) else None
        if isinstance(found, list) and found:
            events = found
            used = name
            break
    _CHANCE_EVENTS[cache_key] = events
    print(f"  Chance {used}: {len(events)} eventů")
    return events


def _teams_match(want: str, got: str) -> bool:
    if not want or not got:
        return False
    return want in got or got in want


def fetch_chance_event(home: str, away: str, starting_at: str | None, league_id: int | None) -> dict | None:
    names = CHANCE_LEAGUE_BY_ID.get(int(league_id)) if league_id else None
    if not names:
        return None
    events = fetch_league_events(names)
    want_h, want_a = _norm(home), _norm(away)
    kick = (starting_at or "")[:10]
    for ev in events:
        eh = _norm(str(ev.get("home") or ev.get("homeTeam") or ev.get("home_name") or ""))
        ea = _norm(str(ev.get("away") or ev.get("awayTeam") or ev.get("away_name") or ""))
        start = str(ev.get("startTime") or ev.get("starts_at") or ev.get("start") or "")[:10]
        if kick and start and start != kick:
            continue
        if _teams_match(want_h, eh) and _teams_match(want_a, ea):
            return ev
    return None


def apply_odds_board(match: dict, board: dict) -> dict:
    public = dict(board.get("match") or {})
    public["source"] = board.get("source") or "chance"
    for side in ("home", "away"):
        for key, val in (board.get(side) or {}).items():
            public.setdefault(f"{side}_{key}", val)
    match["odds"] = public
    trends = match.get("trends") or {}
    buckets = [
        ((trends.get("team_last5") or {}).get("home") or [], "home"),
        ((trends.get("team_last5") or {}).get("away") or [], "away"),
        ((trends.get("h2h") or {}).get("last3") or [], None),
        ((trends.get("h2h") or {}).get("last5") or [], None),
    ]
    for items, side in buckets:
        for item in items:
            val = odds_for_trend(item, board, side)
            if val is not None:
                item["odds"] = val
            elif "odds" in item:
                del item["odds"]
    return match


def attach_odds(match: dict) -> dict:
    ev = fetch_chance_event(
        match["home"]["name"],
        match["away"]["name"],
        match.get("starting_at"),
        match.get("league_id"),
    )
    if not ev:
        return match
    board = extract_odds_board(ev, match["home"]["name"], match["away"]["name"])
    if not board.get("match") and not board.get("home"):
        return match
    return apply_odds_board(match, board)


def generate_ai_analysis(match: dict) -> dict | None:
    key = _env("OPENAI_API_KEY")
    if not key:
        return None
    sim = match.get("simulation") or {}
    form_h = (match.get("form") or {}).get("home") or {}
    form_a = (match.get("form") or {}).get("away") or {}
    h2h = match.get("h2h") or []
    odds = match.get("odds") or {}
    h2h_lines = []
    for m in h2h[:5]:
        h2h_lines.append(
            f"{(m.get('date') or '')[:10]} {m.get('home', {}).get('name')} {m.get('home_score')}:{m.get('away_score')} {m.get('away', {}).get('name')}"
        )
    payload = {
        "zapas": f"{match['home']['name']} – {match['away']['name']}",
        "soutěž": match.get("league_name"),
        "kickoff": match.get("starting_at"),
        "stadion": match.get("venue"),
        "rozhodčí": (match.get("referee") or {}).get("name"),
        "forma_domaci": form_h.get("results_sequence"),
        "forma_hoste": form_a.get("results_sequence"),
        "h2h": h2h_lines,
        "simulace": {
            "xg": sim.get("expected_goals"),
            "1": sim.get("home_win_pct"),
            "X": sim.get("draw_pct"),
            "2": sim.get("away_win_pct"),
            "btts": sim.get("btts_pct"),
            "over25": sim.get("over25_pct"),
        },
        "kurzy": odds,
    }
    body = {
        "model": "gpt-4o-mini",
        "temperature": 0.4,
        "messages": [
            {
                "role": "system",
                "content": "Jsi fotbalový analytik. Píšeš česky, věcně, bez sázkových rad. 3 krátké odstavce.",
            },
            {
                "role": "user",
                "content": (
                    "Vytvoř ze zadaných dat analýzu zápasu, jak ho očekáváš, co je pravděpodobné, že nastane.\n\n"
                    + json.dumps(payload, ensure_ascii=False)
                ),
            },
        ],
    }
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    resp = _http_json("https://api.openai.com/v1/chat/completions", headers, payload=body)
    if not resp:
        return None
    text = (((resp.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
    if not text:
        return None
    return {
        "text": text,
        "model": "gpt-4o-mini",
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    }


def enrich_match(match: dict) -> dict:
    home_facts = ((match.get("form") or {}).get("home") or {}).get("recent_all") or []
    away_facts = ((match.get("form") or {}).get("away") or {}).get("recent_all") or []
    if home_facts and away_facts:
        match["simulation"] = simulate_from_facts(home_facts, away_facts, None, None)
    match = attach_odds(match)
    analysis = generate_ai_analysis(match)
    if analysis:
        match["ai_analysis"] = analysis
    return match


def main() -> None:
    data_dir = ROOT / "frontend" / "public" / "data" / "matches"
    files = sorted(data_dir.glob("*.json"))
    args = sys.argv[1:]
    odds_only = "--odds-only" in args
    league_only = None
    skip_idx = set()
    if "--league" in args:
        idx = args.index("--league")
        league_only = int(args[idx + 1])
        skip_idx.add(idx + 1)
    only = [int(a) for i, a in enumerate(args) if a.isdigit() and i not in skip_idx]
    for path in files:
        match = json.loads(path.read_text())
        if only and match.get("fixture_id") not in only:
            continue
        if league_only is not None and int(match.get("league_id") or 0) != league_only:
            continue
        print(f"enrich {match.get('fixture_id')} {match['home']['name']} vs {match['away']['name']}")
        if odds_only:
            match = attach_odds(match)
        else:
            match = enrich_match(match)
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(match, indent=2, ensure_ascii=False, default=str))
        tmp.replace(path)
    print("hotovo")


if __name__ == "__main__":
    main()
