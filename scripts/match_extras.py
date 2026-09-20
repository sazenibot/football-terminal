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
        if e.code == 429 and "pulsescore" in url:
            global _PULSESCORE_DISABLED
            _PULSESCORE_DISABLED = True
        return None
    except Exception as exc:
        print(f"  ⚠️ extras: {exc}", file=sys.stderr)
        return None


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
    """Mapování PulseScore trhů na klíče našich trendů."""
    out: dict[str, float] = {}
    markets = event.get("markets") or event.get("odds") or []
    for mkt in markets:
        canon = str(mkt.get("canonicalMarket") or mkt.get("rawName") or "").upper()
        line = str(mkt.get("line") or mkt.get("handicap") or "")
        sels = mkt.get("selections") or mkt.get("outcomes") or []
        for sel in sels:
            name = _sel_name(sel)
            dec = _decimal(sel)
            if dec is None:
                continue
            if "BOTH_TEAMS" in canon or "btts" in name or "both teams" in name:
                if "yes" in name or name in ("ano", "y"):
                    out.setdefault("btts", dec)
            if "OVER_UNDER" in canon or "TOTAL" in canon or "over/under" in name:
                if line in ("2.5", "2,5") or "2.5" in name or "2,5" in name:
                    if "over" in name:
                        out.setdefault("over25", dec)
                    if "under" in name:
                        out.setdefault("under25", dec)
                if line in ("1.5", "1,5") or "1.5" in name:
                    if "over" in name:
                        out.setdefault("over15", dec)
            if "CORNER" in canon or "roh" in name or "corner" in name:
                if "9.5" in name or line in ("9.5", "9,5"):
                    if "over" in name:
                        out.setdefault("corners_over95", dec)
                    if "under" in name:
                        out.setdefault("corners_under95", dec)
    return out


def fetch_pulsescore_event(home: str, away: str, starting_at: str | None) -> dict | None:
    if _PULSESCORE_DISABLED:
        return None
    token = _env("PULSESCORE_API_TOKEN")
    base = _env("PULSESCORE_API_URL") or "https://api.pulsescore.net/api/ps3838"
    if not token:
        return None
    headers = {"X-Secret": token, "Accept": "application/json", "Accept-Encoding": "gzip"}
    want_h, want_a = _norm(home), _norm(away)
    kick = (starting_at or "")[:10]
    for page in range(1, 3):
        url = f"{base}/soccer/events?{urllib.parse.urlencode({'page': page, 'limit': 25})}"
        body = _http_json(url, headers)
        if not body:
            break
        events = body.get("events") if isinstance(body, dict) else body
        if not isinstance(events, list) or not events:
            break
        for ev in events:
            eh = _norm(str(ev.get("home") or ev.get("homeTeam") or ev.get("home_name") or ""))
            ea = _norm(str(ev.get("away") or ev.get("awayTeam") or ev.get("away_name") or ""))
            if not eh or not ea:
                continue
            start = str(ev.get("startTime") or ev.get("starts_at") or ev.get("start") or "")[:10]
            if kick and start and start != kick:
                continue
            if (want_h in eh or eh in want_h) and (want_a in ea or ea in want_a):
                return ev
        pag = body.get("hasNextPage") if isinstance(body, dict) else False
        if not pag and len(events) < 50:
            break
    return None


def attach_odds(match: dict) -> dict:
    ev = fetch_pulsescore_event(match["home"]["name"], match["away"]["name"], match.get("starting_at"))
    if not ev:
        return match
    odds = extract_odds_map(ev)
    if not odds:
        return match
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
    only = [int(a) for a in sys.argv[1:] if a.isdigit()]
    for path in files:
        match = json.loads(path.read_text())
        if only and match.get("fixture_id") not in only:
            continue
        print(f"enrich {match.get('fixture_id')} {match['home']['name']} vs {match['away']['name']}")
        match = enrich_match(match)
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(match, indent=2, ensure_ascii=False, default=str))
        tmp.replace(path)
    print("hotovo")


if __name__ == "__main__":
    main()
