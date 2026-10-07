"""Párování týmů SportMonks ↔ PitchAPI podle názvu v rámci jedné ligy (16–20 kandidátů, ne obecné párování).

Greedy podle skóre: nejdřív nejjistější dvojice, každý tým Pitch jen jednou. Co nepřesáhne MIN_SCORE, zůstane
nespárované a volající to musí nahlásit (zápas se pak nepočítá, žádné hádání).
Ruční výjimky: scripts/config/team_aliases.json  {"sportmonks name": "pitch name"}.
"""
from __future__ import annotations

import json
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

ALIASES = Path(__file__).resolve().parent / "config" / "team_aliases.json"
NOISE = {"fc", "cf", "sc", "sv", "fsv", "tsg", "afc", "ac", "as", "ss", "vfb", "vfl", "rb", "us", "ud", "cd", "rc", "real", "de", "del", "la", "the", "1", "04", "05", "1905", "sk", "fk"}
MIN_SCORE = 0.62


def fold(name: str | None) -> str:
    raw = unicodedata.normalize("NFKD", name or "")
    raw = "".join(c for c in raw if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", raw.lower())).strip()


def core(name: str) -> str:
    toks = [t for t in fold(name).split() if t not in NOISE]
    return " ".join(toks) or fold(name)


def score(a: str, b: str) -> float:
    fa, fb, ca, cb = fold(a), fold(b), core(a), core(b)
    if fa == fb:
        return 1.0
    best = max(SequenceMatcher(None, fa, fb).ratio(), SequenceMatcher(None, ca, cb).ratio())
    if ca and cb and (ca in cb or cb in ca):
        best = max(best, 0.9)
    ta, tb = set(ca.split()), set(cb.split())
    if ta and tb and ta & tb:
        best = max(best, 0.55 + 0.4 * len(ta & tb) / max(len(ta), len(tb)))
    return best


def match_teams(sm: dict[int, str], pitch: dict[str, str]) -> tuple[dict[int, str], list[int]]:
    """sm: {sportmonks_id: name}, pitch: {pitch_id: name} → ({sm_id: pitch_id}, [nespárované sm id])."""
    aliases = json.loads(ALIASES.read_text()) if ALIASES.exists() else {}
    by_name = {fold(n): pid for pid, n in pitch.items()}
    out: dict[int, str] = {}
    for sid, name in sm.items():
        target = aliases.get(name)
        if target and fold(target) in by_name:
            out[sid] = by_name[fold(target)]
    pairs = sorted(
        ((score(n, pn), sid, pid) for sid, n in sm.items() if sid not in out for pid, pn in pitch.items() if pid not in out.values()),
        reverse=True,
    )
    used_p, used_s = set(out.values()), set(out)
    for sc, sid, pid in pairs:
        if sc < MIN_SCORE:
            break
        if sid in used_s or pid in used_p:
            continue
        out[sid] = pid
        used_s.add(sid)
        used_p.add(pid)
    return out, [sid for sid in sm if sid not in out]
