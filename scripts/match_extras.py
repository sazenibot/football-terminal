#!/usr/bin/env python3
"""Kurzy (PulseScore) + AI analýza (OpenAI) + přepočet simulace.

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
_PULSESCORE_EVENTS: dict[str, list] = {}

# PulseScore/Pinnacle názvy — /soccer/leagues vrací eventCount, ne zápasy.
PULSESCORE_LEAGUE_BY_ID = {
    262: "Czech Republic - First Liga",
    265: "Czech Republic - FNL",
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
    repl = str.maketrans("áéíóúýčďěňřšťžäöü", "aeiouycdenrstzaou")
    s = s.translate(repl)
    s = s.replace("prague", "praha").replace("pilsen", "plzen")
    for junk in ("fc ", "cf ", "de ", "the ", "."):
        s = s.replace(junk, " ")
    return re.sub(r"[^a-z0-9]+", "", s)


def _http_json(url: str, headers: dict, payload: dict | None = None) -> dict | list | None:
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method="GET" if payload is None else "POST")
    try:
        with urllib.request.urlopen(req, timeout=30, context=SSL_CONTEXT) as resp:
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


def _ps_get(path: str) -> dict | list | None:
    """PulseScore: BASIC/STARTER = 1 req/s. Jeden call na ligu, ne stránkovat celý fotbal."""
    global _PULSESCORE_LAST_CALL, _PULSESCORE_DISABLED
    if _PULSESCORE_DISABLED:
        return None
    token = _env("PULSESCORE_API_TOKEN")
    base = (_env("PULSESCORE_API_URL") or "https://api.pulsescore.net/api/ps3838").rstrip("/")
    if not token:
        return None
    wait = 1.15 - (time.monotonic() - _PULSESCORE_LAST_CALL)
    if wait > 0:
        time.sleep(wait)
    headers = {"X-Secret": token, "Accept": "application/json", "Accept-Encoding": "gzip"}
    body = _http_json(f"{base}{path}", headers)
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


def _sel_name(sel: dict) -> str:
    return str(sel.get("name") or sel.get("canonicalOutcome") or sel.get("rawName") or "").lower()


def extract_odds_map(event: dict) -> dict[str, float]:
    """Mapování PulseScore trhů na klíče našich trendů. Jen FULL_TIME — HT 1.5 není over 1.5 zápasu."""
    out: dict[str, float] = {}
    markets = event.get("markets") or event.get("odds") or []
    for mkt in markets:
        period = str(mkt.get("period") or "FULL_TIME").upper().replace(" ", "_")
        if period not in ("FULL_TIME", "FT", ""):
            continue
        canon = str(mkt.get("canonicalMarket") or mkt.get("rawName") or "").upper()
        raw_mkt = str(mkt.get("rawName") or "").lower()
        for sel in mkt.get("selections") or mkt.get("outcomes") or []:
            name = _sel_name(sel)
            outcome = str(sel.get("canonicalOutcome") or "").upper()
            dec = _decimal(sel)
            if dec is None:
                continue
            line = sel.get("line") if sel.get("line") is not None else mkt.get("line")
            if line is None:
                line = mkt.get("handicap")
            line_s = str(line).replace(",", ".") if line is not None else ""
            if "BOTH_TEAMS" in canon or "btts" in name or "both teams" in name:
                if outcome == "YES" or "yes" in name or name in ("ano", "y"):
                    out.setdefault("btts", dec)
            if "OVER_UNDER" in canon or "TOTAL" in canon or "over/under" in raw_mkt:
                if line_s in ("2.5", "2.50") or "2.5" in name:
                    if outcome == "OVER" or name.startswith("over"):
                        out.setdefault("over25", dec)
                    if outcome == "UNDER" or name.startswith("under"):
                        out.setdefault("under25", dec)
                if line_s in ("1.5", "1.50") or ("1.5" in name and "11.5" not in name):
                    if outcome == "OVER" or name.startswith("over"):
                        out.setdefault("over15", dec)
            if "CORNER" in canon or "roh" in name or "corner" in raw_mkt:
                if line_s in ("9.5", "9.50") or "9.5" in name:
                    if outcome == "OVER" or "over" in name:
                        out.setdefault("corners_over95", dec)
                    if outcome == "UNDER" or "under" in name:
                        out.setdefault("corners_under95", dec)
            if canon == "MATCH_RESULT":
                if outcome == "HOME":
                    out.setdefault("home", dec)
                elif outcome == "AWAY":
                    out.setdefault("away", dec)
                elif outcome == "DRAW":
                    out.setdefault("draw", dec)
    return out


def fetch_league_events(league_name: str) -> list:
    if league_name in _PULSESCORE_EVENTS:
        return _PULSESCORE_EVENTS[league_name]
    q = urllib.parse.quote(league_name, safe="")
    body = _ps_get(f"/soccer/leagues/{q}/events?limit=30")
    events = body.get("events") if isinstance(body, dict) else None
    if not isinstance(events, list):
        events = []
    _PULSESCORE_EVENTS[league_name] = events
    print(f"  PulseScore {league_name}: {len(events)} eventů")
    return events


def _teams_match(want: str, got: str) -> bool:
    if not want or not got:
        return False
    return want in got or got in want


def fetch_pulsescore_event(home: str, away: str, starting_at: str | None, league_id: int | None = None) -> dict | None:
    league_name = PULSESCORE_LEAGUE_BY_ID.get(int(league_id)) if league_id else None
    if not league_name:
        return None
    events = fetch_league_events(league_name)
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


def apply_odds_to_match(match: dict, odds: dict[str, float]) -> dict:
    match["odds"] = odds
    trends = match.get("trends") or {}
    for bucket in ((trends.get("team_last5") or {}).get("home") or [],
                   (trends.get("team_last5") or {}).get("away") or [],
                   (trends.get("h2h") or {}).get("last3") or [],
                   (trends.get("h2h") or {}).get("last5") or []):
        for item in bucket:
            if item.get("key") in odds:
                item["odds"] = odds[item["key"]]
    return match


def attach_odds(match: dict) -> dict:
    ev = fetch_pulsescore_event(
        match["home"]["name"],
        match["away"]["name"],
        match.get("starting_at"),
        match.get("league_id"),
    )
    if not ev:
        return match
    odds = extract_odds_map(ev)
    if not odds:
        return match
    return apply_odds_to_match(match, odds)


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
    h2h = match.get("h2h") or []
    # H2H facts z pohledu domácího/hostů nadcházejícího zápasu nemáme uložené
    # jako facts — simulace si vystačí se sezónní formou.
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
    if "--league" in args:
        league_only = int(args[args.index("--league") + 1])
    only = [int(a) for a in args if a.isdigit()]
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
