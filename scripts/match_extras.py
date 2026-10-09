#!/usr/bin/env python3
"""Kurzy (Chance.cz přes PulseScore) + AI analýza (OpenAI).

Kurzy se doplňují v refresh_data. Slovní shrnutí až po sim_live (--ai-only),
ať model čte sim v2.2, ne starou simulate_from_facts. Tokeny jen z env/.env.
"""

from __future__ import annotations

import hashlib
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

SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
SIM_DIR = ROOT / "frontend" / "public" / "data" / "sim"
PROMPT_VERSION = "2026-10-09-v2"
MAIN_LIMIT = 300
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
    72: ("1. nizozemská liga",),
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
                if line == 1.5 and outcome == "UNDER":
                    match_keys.setdefault("under15", dec)
                if line == 2.5 and outcome == "OVER":
                    match_keys.setdefault("over25", dec)
                if line == 2.5 and outcome == "UNDER":
                    match_keys.setdefault("under25", dec)
                if line == 3.5 and outcome == "OVER":
                    match_keys.setdefault("over35", dec)
                if line == 3.5 and outcome == "UNDER":
                    match_keys.setdefault("under35", dec)

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


def _stat_avg(block: dict | None, key: str) -> float | None:
    if not block:
        return None
    node = block.get(key) or {}
    if isinstance(node.get("average"), (int, float)):
        return float(node["average"])
    inner = node.get("all") or {}
    if isinstance(inner.get("average"), (int, float)):
        return float(inner["average"])
    return None


def _load_sim_v2(fixture_id: int) -> dict | None:
    path = SIM_DIR / f"{fixture_id}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return None


def _ai_payload(match: dict, sim: dict) -> dict:
    model = sim.get("model") or {}
    market = sim.get("market") or {}
    form_h = (match.get("form") or {}).get("home") or {}
    form_a = (match.get("form") or {}).get("away") or {}
    ref = match.get("referee") or {}
    stats = ref.get("season_stats") or {}
    lc = ref.get("league_context") or {}
    h2h_lines = []
    for m in (match.get("h2h") or [])[:5]:
        h2h_lines.append(
            f"{(m.get('date') or '')[:10]} {m.get('home', {}).get('name')} {m.get('home_score')}:{m.get('away_score')} {m.get('away', {}).get('name')}"
        )
    xg = model.get("expected_goals") or {}
    shots = model.get("expected_shots") or {}
    sot = model.get("expected_sot") or {}
    corners = model.get("expected_corners") or {}
    return {
        "prompt_version": PROMPT_VERSION,
        "zapas": f"{match['home']['name']} – {match['away']['name']}",
        "soutez": match.get("league_name"),
        "kickoff": match.get("starting_at"),
        "stadion": match.get("venue"),
        "rozhodci": {
            "jmeno": ref.get("name"),
            "fauly": _stat_avg(stats, "Fouls"),
            "zlutych": _stat_avg(stats, "Yellowcards"),
            "cervene": _stat_avg(stats, "Redcards"),
            "liga_fauly": lc.get("fouls_per_match"),
            "liga_zlutych": lc.get("yellow_per_match"),
            "liga_cervene": lc.get("red_per_match"),
        } if ref.get("name") else None,
        "forma_domaci": {
            "sekvence": form_h.get("results_sequence"),
            "body": form_h.get("points"),
            "zapasy": form_h.get("played"),
            "gf": form_h.get("goals_for"),
            "ga": form_h.get("goals_against"),
        },
        "forma_hoste": {
            "sekvence": form_a.get("results_sequence"),
            "body": form_a.get("points"),
            "zapasy": form_a.get("played"),
            "gf": form_a.get("goals_for"),
            "ga": form_a.get("goals_against"),
        },
        "h2h": h2h_lines,
        "model": {
            "verze": sim.get("model_version") or "v2.2",
            "1": model.get("home_win_pct"),
            "X": model.get("draw_pct"),
            "2": model.get("away_win_pct"),
            "xg_domaci": xg.get("home"),
            "xg_hoste": xg.get("away"),
            "btts": model.get("btts_pct"),
            "over15": model.get("over15_pct"),
            "over25": model.get("over25_pct"),
            "under25": model.get("under25_pct"),
            "over35": model.get("over35_pct"),
            "strely": shots.get("total"),
            "strely_na_branku": sot.get("total"),
            "rohy": corners.get("total"),
            "nejcastejsi_skore": model.get("top_scorelines"),
        },
        "trh": {
            "1": market.get("home_win_pct"),
            "X": market.get("draw_pct"),
            "2": market.get("away_win_pct"),
            "over25": market.get("over25_pct"),
            "under25": market.get("under25_pct"),
            "over35": market.get("over35_pct"),
        } if market.get("home_win_pct") is not None else None,
    }


def _clip_main(title: str, why: str, limit: int = MAIN_LIMIT) -> tuple[str, str]:
    title = " ".join((title or "").split())
    why = " ".join((why or "").split())
    sep = ": "
    used = len(title) + len(sep)
    if used >= limit:
        return title[: max(1, limit - 1)], ""
    if used + len(why) <= limit:
        return title, why
    cut = why[: max(0, limit - used - 1)].rstrip(" ,;:.-")
    return title, (cut + "…") if cut else why[:1]


def _parse_ai_json(raw: str) -> dict | None:
    raw = (raw or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    tips = data.get("tips") or []
    if not isinstance(tips, list):
        return None
    clean = []
    for tip in tips[:3]:
        if not isinstance(tip, dict):
            continue
        title = str(tip.get("title") or "").strip()
        why = str(tip.get("why") or "").strip()
        if title and why:
            clean.append({"title": title, "why": why})
    main_title = str(data.get("main_title") or "").strip()
    main_why = str(data.get("main_why") or "").strip()
    if not main_title or not main_why or len(clean) != 3:
        return None
    main_title, main_why = _clip_main(main_title, main_why)
    return {"main_title": main_title, "main_why": main_why, "tips": clean}


def _format_ai(data: dict, *, lang: str) -> str:
    if lang == "en":
        head, more = "Highest confidence:", "Further analytical tips:"
    else:
        head, more = "Největší důvěra:", "Další analytické tipy:"
    lines = [head, f"{data['main_title']}: {data['main_why']}", "", more]
    for tip in data["tips"]:
        lines.append(f"• {tip['title']}: {tip['why']}")
    return "\n".join(lines)


SYSTEM_CS = """Jsi zkušený fotbalový datový analytik. Tvojí úlohou je analyzovat poskytnutá data k fotbalovému zápasu (statistiky, xG, modelové pravděpodobnosti, formu, vzájemné zápasy, informace o rozhodčím) a vytvořit z nich predikci.

DŮLEŽITÁ PRAVIDLA:

Vyhni se prostému papouškování a vypisování surových dat. Uživatel data vidí. Tvojí přidanou hodnotou je syntéza dat do logického kontextu a odhad herního scénáře (dobývání, asymetrie trhu, taktické fauly atd.).

Data používej pouze jako argumentační oporu pro své myšlenky.

Striktně dodrž níže uvedenou strukturu výstupu.

STRUKTURA VÝSTUPU:

Největší důvěra:
Vyber jeden absolutně nejsilnější tip na zápas, kterému podle dat věříš nejvíce. Své rozhodnutí vysvětli úderně na základě klíčových metrik (xG, pravděpodobnosti, forma). Tento odstavec (včetně názvu tipu) musí mít MAXIMÁLNĚ 300 znaků!

Další analytické tipy:
Napiš přesně 3 další zajímavé predikce/tipy formou odrážek.

[Název tipu]: Následně v 1-2 větách vysvětli analytickou úvahu, která k němu vede (opři se například o očekávané držení míče, statistiky karet a rozhodčího, rozdíl mezi xG a reálnými góly, rohy atd.). Ukaž, jak z dat vyplývá herní obraz.

Čísla 1X2, xG a trhy ber výhradně z pole model (srovnání s kurzem jen z pole trh). Nesmíš je měnit, zaokrouhlovat na jinou hodnotu ani vymýšlet jiná. Tip musí souhlasit s modelem: neprohlašuj za pravděpodobné trh, kterému model dává pod 50 %, a nehraj proti favoritovi z 1X2. main_title nesmí být remíza, pokud model.X je pod 50 — vezmi favorita 1X2 (vyšší z 1 a 2) nebo jiný trh s alespoň 50 %.

Odpověz pouze JSON objektem:
{"main_title":"název nejsilnějšího tipu","main_why":"vysvětlení","tips":[{"title":"tip 1","why":"proč"},{"title":"tip 2","why":"proč"},{"title":"tip 3","why":"proč"}]}
main_title + ": " + main_why dohromady nejvýš 300 znaků. Přesně 3 položky v tips. Piš česky."""

SYSTEM_EN = """You are an experienced football data analyst. Your job is to analyse the provided match data (statistics, xG, model probabilities, form, head-to-head, referee) and turn them into a prediction.

IMPORTANT RULES:

Do not parrot or list raw numbers. The user can already see the data. Your value is synthesis: a logical match scenario (territory, market asymmetry, tactical fouls, and so on).

Use the data only as evidence for your reasoning.

Follow the output structure strictly.

OUTPUT STRUCTURE:

Highest confidence:
Pick the single strongest tip you trust most. Explain it punchily from the key metrics (xG, probabilities, form). This paragraph (including the tip title) must be AT MOST 300 characters.

Further analytical tips:
Write exactly 3 more tips as bullets.

[Tip title]: Then in 1–2 sentences explain the analytical reasoning (expected territorial control, cards and the referee, xG vs actual goals, corners, etc.). Show the match picture that follows from the data.

Take 1X2, xG and market figures only from the model field (compare with the bookmaker only via the trh field). Do not change, re-round or invent those numbers. A tip must agree with the model: do not call a market likely if the model gives it under 50%, and do not fade the 1X2 favourite. main_title must not be a draw if model.X is under 50 — pick the 1X2 favourite (higher of 1 and 2) or another market at 50% or more.

Reply with a JSON object only:
{"main_title":"strongest tip title","main_why":"why","tips":[{"title":"tip 1","why":"why"},{"title":"tip 2","why":"why"},{"title":"tip 3","why":"why"}]}
main_title + ": " + main_why must be at most 300 characters. Exactly 3 items in tips. Write in English."""


def _ai_fights_model(data: dict, model: dict, home: str = "", away: str = "") -> bool:
    """True, když nejsilnější tip jde proti 1X2 nebo hlásá trh pod 50 %."""
    title = (data.get("main_title") or "").lower()
    hw = float(model.get("home_win_pct") or 0)
    dr = float(model.get("draw_pct") or 0)
    aw = float(model.get("away_win_pct") or 0)
    if any(w in title for w in ("remíz", "draw", "nerozh")) and dr < 50:
        return True
    fav_home = hw >= aw
    hn, an = home.lower(), away.lower()
    if hn and an:
        picked_away = an in title and hn not in title
        picked_home = hn in title and an not in title
        if fav_home and picked_away:
            return True
        if (not fav_home) and picked_home:
            return True
    return False


def generate_ai_analysis(match: dict, *, force: bool = False) -> dict | None:
    key = _env("OPENAI_API_KEY")
    if not key:
        return None
    fid = match.get("fixture_id")
    sim = _load_sim_v2(int(fid)) if fid else None
    if not sim or not (sim.get("model") or {}).get("home_win_pct"):
        return match.get("ai_analysis") or None
    payload = _ai_payload(match, sim)
    # Stejný vstup + stejné zadání = stejná analýza, OpenAI se nevolá znovu.
    input_hash = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]
    prev = match.get("ai_analysis") or {}
    if not force and prev.get("input_hash") == input_hash and prev.get("text") and prev.get("text_en"):
        return prev

    def ask(system: str, extra: str = "") -> dict | None:
        user = json.dumps(payload, ensure_ascii=False)
        if extra:
            user = extra + "\n\n" + user
        body = {
            "model": "gpt-4o-mini",
            "temperature": 0.3,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        resp = _http_json("https://api.openai.com/v1/chat/completions", headers, payload=body)
        if not resp:
            return None
        raw = (((resp.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
        return _parse_ai_json(raw)

    model = sim.get("model") or {}
    home = (match.get("home") or {}).get("name") or ""
    away = (match.get("away") or {}).get("name") or ""
    nudge = (
        "main_title must not be a draw/remíza unless model.X is at least 50. "
        "Do not pick against the 1X2 favourite. Prefer a market the model gives 50% or more."
    )
    data_cs = ask(SYSTEM_CS)
    if data_cs and _ai_fights_model(data_cs, model, home, away):
        data_cs = ask(SYSTEM_CS, nudge) or data_cs
    if not data_cs:
        return prev or None
    data_en = ask(SYSTEM_EN)
    if data_en and _ai_fights_model(data_en, model, home, away):
        data_en = ask(SYSTEM_EN, nudge) or data_en
    out = {
        "text": _format_ai(data_cs, lang="cs"),
        "model": "gpt-4o-mini",
        "prompt_version": PROMPT_VERSION,
        "input_hash": input_hash,
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    }
    if data_en:
        out["text_en"] = _format_ai(data_en, lang="en")
    elif prev.get("text_en"):
        out["text_en"] = prev["text_en"]
    return out


def enrich_match(match: dict, *, ai: bool = False) -> dict:
    match = attach_odds(match)
    if ai:
        analysis = generate_ai_analysis(match)
        if analysis:
            match["ai_analysis"] = analysis
    return match


def main() -> None:
    data_dir = ROOT / "frontend" / "public" / "data" / "matches"
    files = sorted(data_dir.glob("*.json"))
    args = sys.argv[1:]
    odds_only = "--odds-only" in args
    ai_only = "--ai-only" in args
    force = "--force" in args
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
        elif ai_only:
            prev_ai = match.get("ai_analysis")
            analysis = generate_ai_analysis(match, force=force)
            if analysis is None or analysis is prev_ai:
                print("  beze změny")
                continue
            match["ai_analysis"] = analysis
        else:
            match = enrich_match(match, ai=True)
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(match, indent=2, ensure_ascii=False, default=str))
        tmp.replace(path)
    print("hotovo")


if __name__ == "__main__":
    main()
