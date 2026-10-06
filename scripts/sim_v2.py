#!/usr/bin/env python3
"""Simulace v2 (Lab) — Chance Liga.

Alternativa k simulate_from_facts. Žádné volání API, jen lokální data:
  - výsledky ligy letos + loni: scripts/.cache/pitchapi/league-matches*.json
  - xG po zápasech: frontend/public/data/catalog/pitch/teams/{sm_id}.json
  - odpočinek a kurzy Chance: frontend/public/data/matches/{fixture_id}.json

Kroky: splity doma/venku s loňským priorem → ředění celkovým profilem →
xG regrese za posledních 6 → odpočinek → Dixon-Coles (přesně, ne vzorek).
Kurz se do modelu nemíchá, jen se vedle něj ukazuje.

Výstup: frontend/public/data/sim/{fixture_id}.json
"""

from __future__ import annotations

import json
import math
import sys
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from ingest_pitchapi import CACHE, OUT as PITCH_OUT, ROOT, load_sm, map_team, stat_num  # noqa: E402

ROUND = ROOT / "frontend/public/data/leagues/262.json"
MATCHES = ROOT / "frontend/public/data/matches"
SIM_OUT = ROOT / "frontend/public/data/sim"

P = {
    "k_venue": 8,  # shrink splitu k loňskému prioru: n/(n+k)
    "k_overall": 8,
    "k_league": 40,  # shrink ligového průměru k loňsku
    "venue_weight": 0.7,  # podíl venue ratingu vs. celkového profilu
    "xg_window": 6,
    "xg_pull": 0.5,  # jak daleko k xG se rating posune
    "xg_cap": 0.30,  # max posun na zápas (góly)
    "rest_short_days": 3,
    "rest_att": 0.95,
    "rest_def": 1.04,
    "rho": 0.0,  # Dixon-Coles korekce nízkých skóre; walk-forward na 2 sezonách ji nepotvrdil, proto 0
    "max_goals": 10,
    "promoted_bottom_n": 3,
    "opp_k": 8,  # shrink aktuální sezony k loňským Maher ratingům
    "opp_xg_blend": 0.6,  # podíl xG ratingů ve finální λ
    "opp_xgot_blend": 0.0,  # podíl xGOT ratingů ve finální λ
    "opp_k_def": 16,  # obrana je v sezoně nestabilnější než útok → silnější shrink k loňsku
    "opp_half_life": None,  # dny; None = všechny zápasy stejná váha
    "opp_lam_shrink": 1.0,  # 1 = λ beze změny, <1 = λ stáhnout k ligovému průměru (geometricky)
    "opp_prior_reg": 1.0,  # 1 = loňské ratingy beze změny, <1 = stáhnout k průměru ligy
    "stat_k": 10,  # shrink střel/SOT/rohů k ligovému průměru
}


def load_league(name: str) -> list[dict]:
    path = CACHE / name
    if not path.exists():
        return []
    body = json.loads(path.read_text())
    out = []
    for m in (body.get("data") or {}).get("matches") or []:
        if m.get("status") != "finished":
            continue
        out.append(
            {
                "id": m["id"],
                "date": m["date"],
                "home": m["home_team"]["id"],
                "away": m["away_team"]["id"],
                "home_name": m["home_team"]["name"],
                "away_name": m["away_team"]["name"],
                "hg": int(m.get("score_home") or 0),
                "ag": int(m.get("score_away") or 0),
            }
        )
    return sorted(out, key=lambda r: r["date"])


def splits(matches: list[dict]) -> dict[str, dict]:
    """Per pitch team id: home/away/all → n, gf, ga (součty)."""
    acc: dict[str, dict] = defaultdict(lambda: {v: {"n": 0, "gf": 0, "ga": 0} for v in ("home", "away", "all")})
    for m in matches:
        for tid, venue, gf, ga in ((m["home"], "home", m["hg"], m["ag"]), (m["away"], "away", m["ag"], m["hg"])):
            for key in (venue, "all"):
                s = acc[tid][key]
                s["n"] += 1
                s["gf"] += gf
                s["ga"] += ga
    return acc


def rates(s: dict) -> tuple[float, float]:
    if not s["n"]:
        return 0.0, 0.0
    return s["gf"] / s["n"], s["ga"] / s["n"]


def league_mu(matches: list[dict]) -> tuple[float, float, int]:
    n = len(matches)
    if not n:
        return 1.4, 1.15, 0
    return sum(m["hg"] for m in matches) / n, sum(m["ag"] for m in matches) / n, n


def shrink(obs: float, prior: float, n: int, k: int) -> float:
    return (n * obs + k * prior) / (n + k) if n > 0 else prior


def bottom_prior(prev_matches: list[dict], prev_splits: dict, venue: str, n: int) -> tuple[float, float]:
    """Prior pro nováčky: průměr útok/obrana spodních n týmů loňské tabulky."""
    pts: dict[str, int] = defaultdict(int)
    for m in prev_matches:
        if m["hg"] > m["ag"]:
            pts[m["home"]] += 3
        elif m["hg"] < m["ag"]:
            pts[m["away"]] += 3
        else:
            pts[m["home"]] += 1
            pts[m["away"]] += 1
    order = sorted(pts, key=lambda t: pts[t])[:n]
    att = [rates(prev_splits[t][venue])[0] for t in order]
    de = [rates(prev_splits[t][venue])[1] for t in order]
    return sum(att) / len(att), sum(de) / len(de)


def load_pitch_xg(sm_ids: list[int]) -> dict[str, dict[int, dict]]:
    """match id → sm team id → {xg, gf, ga, date}. Z obou týmových souborů."""
    out: dict[str, dict[int, dict]] = defaultdict(dict)
    for sm_id in sm_ids:
        path = PITCH_OUT / "teams" / f"{sm_id}.json"
        if not path.exists():
            continue
        for row in json.loads(path.read_text()).get("matches") or []:
            out[row["id"]][sm_id] = {
                "xg": float(row.get("xg") or 0),
                "gf": int(row.get("goals") if row.get("goals") is not None else row.get("gf") or 0),
                "ga": int(row.get("goals_against") if row.get("goals_against") is not None else row.get("ga") or 0),
                "date": row["date"],
            }
    return out


def xg_regression(sm_id: int, opp_lookup: dict, cutoff: str) -> dict:
    """Posledních 6 ligových: góly vs xG pro, inkasované vs xG soupeře."""
    rows = []
    for mid, sides in opp_lookup.items():
        me = sides.get(sm_id)
        if not me or me["date"] >= cutoff:
            continue
        opp = next((v for k, v in sides.items() if k != sm_id), None)
        rows.append({"date": me["date"], "gf": me["gf"], "ga": me["ga"], "xg": me["xg"], "xga": opp["xg"] if opp else None})
    rows = sorted(rows, key=lambda r: r["date"])[-P["xg_window"] :]
    if not rows:
        return {"n": 0, "delta_att": 0.0, "delta_def": 0.0}
    n = len(rows)
    gf = sum(r["gf"] for r in rows)
    xg = sum(r["xg"] for r in rows)
    with_xga = [r for r in rows if r["xga"] is not None]
    ga = sum(r["ga"] for r in with_xga)
    xga = sum(r["xga"] for r in with_xga)
    cap = P["xg_cap"]
    d_att = max(-cap, min(cap, P["xg_pull"] * (xg - gf) / n))
    d_def = max(-cap, min(cap, P["xg_pull"] * (xga - ga) / len(with_xga))) if with_xga else 0.0
    return {
        "n": n,
        "goals": gf,
        "xg": round(xg, 2),
        "conceded": ga,
        "xg_against": round(xga, 2),
        "delta_att": round(d_att, 3),
        "delta_def": round(d_def, 3),
    }


def geom_mean(vals: list[float]) -> float:
    vals = [max(v, 1e-6) for v in vals]
    return math.exp(sum(math.log(v) for v in vals) / len(vals)) if vals else 1.0


def maher(
    matches: list[dict],
    home_key: str,
    away_key: str,
    prior_att: dict[str, float] | None = None,
    prior_def: dict[str, float] | None = None,
    k: float = 0.0,
    hfa0: float = 1.22,
    iters: int = 40,
    k_def: float | None = None,
    ref_date: str | None = None,
    half_life: float | None = None,
) -> tuple[dict[str, float], dict[str, float], float]:
    """Útok/obrana se silou soupeře. λ_home = att_h * def_a * hfa, λ_away = att_a * def_h.

    k > 0 stáhne aktuální sezonu k prioru (loňské ratingy), k_def totéž pro obranu.
    half_life (dny) + ref_date: starší zápasy mají menší váhu 0.5 ** (stáří / half_life).
    def se normalizuje na geom. průměr 1.
    """
    kd = k if k_def is None else k_def
    raw = [m for m in matches if m.get(home_key) is not None and m.get(away_key) is not None]
    fallback = 1.3
    pa, pd = prior_att or {}, prior_def or {}
    teams = sorted({m["home"] for m in raw} | {m["away"] for m in raw} | set(pa | pd))
    att = {t: pa.get(t, fallback) for t in teams}
    de = {t: pd.get(t, fallback) for t in teams}
    if not raw:
        return att, de, hfa0
    if half_life and ref_date:
        ref = date.fromisoformat(ref_date)
        rows = [
            (m["home"], m["away"], float(m[home_key]), float(m[away_key]), 0.5 ** (max(0, (ref - date.fromisoformat(m["date"])).days) / half_life))
            for m in raw
        ]
    else:
        rows = [(m["home"], m["away"], float(m[home_key]), float(m[away_key]), 1.0) for m in raw]
    by_team: dict[str, list[tuple[str, str, float, float, float]]] = defaultdict(list)
    for r in rows:
        by_team[r[0]].append(r)
        by_team[r[1]].append(r)
    hfa = hfa0
    for _ in range(iters):
        new_att = {}
        for t in teams:
            scored = k * pa.get(t, fallback)
            expo = k
            for h, a, x, y, w in by_team.get(t, ()):
                if h == t:
                    scored += w * x
                    expo += w * de[a] * hfa
                else:
                    scored += w * y
                    expo += w * de[h]
            new_att[t] = scored / expo if expo else att[t]
        att = new_att
        new_de = {}
        for t in teams:
            conc = kd * pd.get(t, fallback)
            expo = kd
            for h, a, x, y, w in by_team.get(t, ()):
                if h == t:
                    conc += w * y
                    expo += w * att[a]
                else:
                    conc += w * x
                    expo += w * att[h] * hfa
            new_de[t] = conc / expo if expo else de[t]
        scale = geom_mean(list(new_de.values())) or 1.0
        de = {t: v / scale for t, v in new_de.items()}
        num = den = 0.0
        for h, a, x, y, w in rows:
            num += w * x
            den += w * att[h] * de[a]
        if den:
            hfa = num / den
    return att, de, hfa


def bottom_ids(matches: list[dict], n: int) -> list[str]:
    pts: dict[str, int] = defaultdict(int)
    for m in matches:
        if m["hg"] > m["ag"]:
            pts[m["home"]] += 3
        elif m["hg"] < m["ag"]:
            pts[m["away"]] += 3
        else:
            pts[m["home"]] += 1
            pts[m["away"]] += 1
    return sorted(pts, key=lambda t: pts[t])[:n]


def attach_xg(matches: list[dict], xg_lookup: dict, pitch_to_sm: dict[str, int]) -> None:
    for m in matches:
        sides = xg_lookup.get(m["id"]) or {}
        sm_h, sm_a = pitch_to_sm.get(m["home"]), pitch_to_sm.get(m["away"])
        m["hxg"] = sides.get(sm_h, {}).get("xg") if sm_h else None
        m["axg"] = sides.get(sm_a, {}).get("xg") if sm_a else None


def attach_pitch_stats(matches: list[dict]) -> None:
    """Doplní střely / SOT / rohy a xG / xGOT z PitchAPI stats cache. Bez souboru zůstanou hodnoty None."""
    keys = ("hshots", "ashots", "hsot", "asot", "hcorners", "acorners", "hxg", "axg", "hxgot", "axgot")
    spec = (
        ("hshots", "total_shots", "home"),
        ("ashots", "total_shots", "away"),
        ("hsot", "ShotsOnTarget", "home"),
        ("asot", "ShotsOnTarget", "away"),
        ("hcorners", "corners", "home"),
        ("acorners", "corners", "away"),
        ("hxg", "expected_goals", "home"),
        ("axg", "expected_goals", "away"),
        ("hxgot", "expected_goals_on_target", "home"),
        ("axgot", "expected_goals_on_target", "away"),
    )
    for m in matches:
        path = CACHE / f"matches_{m['id']}_stats.json"
        if not path.exists():
            for k in keys:
                m[k] = None
            continue
        periods = (json.loads(path.read_text()).get("data") or {}).get("periods") or []
        for k, stat, side in spec:
            m[k] = stat_num(periods, stat, side)


def prev_season_file(cur_name: str = "league-matches.json") -> str:
    """Soubor loňské sezony podle data prvního zápasu letošní: league-matches-{Y-1}-{Y}.json."""
    cur = load_league(cur_name)
    if not cur:
        return "league-matches-prev.json"
    first = date.fromisoformat(cur[0]["date"])
    start = first.year if first.month >= 7 else first.year - 1
    return f"league-matches-{start - 1}-{start}.json"


def rest_mult(rest: int | None) -> tuple[float, float]:
    short = rest is not None and rest <= P["rest_short_days"]
    return (P["rest_att"] if short else 1.0), (P["rest_def"] if short else 1.0)


def league_metric_mu(matches: list[dict], home_key: str, away_key: str) -> tuple[float, float]:
    rows = [m for m in matches if m.get(home_key) is not None and m.get(away_key) is not None]
    if not rows:
        return 1.0, 1.0
    return sum(float(m[home_key]) for m in rows) / len(rows), sum(float(m[away_key]) for m in rows) / len(rows)


def lambdas_opp(
    home_pid: str,
    away_pid: str,
    cur: list[dict],
    prev: list[dict],
    rest_h: int | None,
    rest_a: int | None,
    league: set[str] | None = None,
    kick: str | None = None,
) -> tuple[float, float, dict]:
    """Maher att/def se sílou soupeřů na gólech + xG → očekávané góly.

    league = pitch id týmů letošní ligy. Loňští sestupující do normalizace nepatří.
    """
    att_p, def_p, _ = maher(prev, "hg", "ag", k=0)
    weak = bottom_ids(prev, P["promoted_bottom_n"])
    prior_att_avg = sum(att_p.get(t, 1.3) for t in weak) / len(weak)
    prior_def_avg = sum(def_p.get(t, 1.0) for t in weak) / len(weak)
    ids = {home_pid, away_pid} | {m["home"] for m in cur} | {m["away"] for m in cur}
    if league:
        ids |= league
        att_p = {t: v for t, v in att_p.items() if t in league}
        def_p = {t: v for t, v in def_p.items() if t in league}
    prior_att = {**{t: prior_att_avg for t in ids}, **att_p}
    prior_def = {**{t: prior_def_avg for t in ids}, **def_p}
    reg = P["opp_prior_reg"]
    if reg != 1.0 and prior_att:
        m_att = sum(prior_att.values()) / len(prior_att)
        m_def = sum(prior_def.values()) / len(prior_def)
        prior_att = {t: m_att + reg * (v - m_att) for t, v in prior_att.items()}
        prior_def = {t: m_def + reg * (v - m_def) for t, v in prior_def.items()}
        prior_att_avg = m_att + reg * (prior_att_avg - m_att)
        prior_def_avg = m_def + reg * (prior_def_avg - m_def)

    kw = {"k": P["opp_k"], "k_def": P["opp_k_def"], "ref_date": kick, "half_life": P["opp_half_life"]}
    att_g, def_g, hfa_g = maher(cur, "hg", "ag", prior_att=prior_att, prior_def=prior_def, **kw)
    xg_rows = [m for m in cur if m.get("hxg") is not None and m.get("axg") is not None]
    att_x, def_x, hfa_x = maher(xg_rows, "hxg", "axg", prior_att=att_g, prior_def=def_g, **kw) if xg_rows else (att_g, def_g, hfa_g)
    xt_rows = [m for m in cur if m.get("hxgot") is not None and m.get("axgot") is not None]
    use_xt = P["opp_xgot_blend"] > 0 and bool(xt_rows)
    if use_xt:
        # xGOT je v průměru jiná škála než góly; na ligový průměr gólů ho převedeme
        scale = sum(m["hg"] + m["ag"] for m in xt_rows) / max(1e-9, sum(m["hxgot"] + m["axgot"] for m in xt_rows))
        xt_rows = [{**m, "hxgot": m["hxgot"] * scale, "axgot": m["axgot"] * scale} for m in xt_rows]
        att_t, def_t, hfa_t = maher(xt_rows, "hxgot", "axgot", prior_att=att_g, prior_def=def_g, **kw)

    def g(d: dict[str, float], t: str, fb: float) -> float:
        return d.get(t, fb)

    ah, dh = rest_mult(rest_h)
    aa, da = rest_mult(rest_a)
    lam_g_h = g(att_g, home_pid, prior_att_avg) * ah * (g(def_g, away_pid, prior_def_avg) * da) * hfa_g
    lam_g_a = g(att_g, away_pid, prior_att_avg) * aa * (g(def_g, home_pid, prior_def_avg) * dh)
    lam_x_h = g(att_x, home_pid, prior_att_avg) * ah * (g(def_x, away_pid, prior_def_avg) * da) * hfa_x
    lam_x_a = g(att_x, away_pid, prior_att_avg) * aa * (g(def_x, home_pid, prior_def_avg) * dh)
    wx = P["opp_xg_blend"]
    wt = P["opp_xgot_blend"] if use_xt else 0.0
    lam_t_h = lam_t_a = 0.0
    if use_xt:
        lam_t_h = g(att_t, home_pid, prior_att_avg) * ah * (g(def_t, away_pid, prior_def_avg) * da) * hfa_t
        lam_t_a = g(att_t, away_pid, prior_att_avg) * aa * (g(def_t, home_pid, prior_def_avg) * dh)
    wg = 1 - wx - wt
    lam_h = wg * lam_g_h + wx * lam_x_h + wt * lam_t_h
    lam_a = wg * lam_g_a + wx * lam_x_a + wt * lam_t_a
    sh = P["opp_lam_shrink"]
    if sh != 1.0:
        mu_c, mu_p = league_mu(cur), league_mu(prev)
        mu_h = shrink(mu_c[0], mu_p[0], mu_c[2], P["k_league"])
        mu_a = shrink(mu_c[1], mu_p[1], mu_c[2], P["k_league"])
        lam_h = mu_h ** (1 - sh) * lam_h**sh
        lam_a = mu_a ** (1 - sh) * lam_a**sh
    lam_h = max(0.3, min(4.0, lam_h))
    lam_a = max(0.3, min(4.0, lam_a))
    meta = {
        "hfa_goals": round(hfa_g, 3),
        "hfa_xg": round(hfa_x, 3),
        "att_goals": round(g(att_g, home_pid, prior_att_avg), 3),
        "def_goals_home": round(g(def_g, home_pid, prior_def_avg), 3),
        "att_goals_away": round(g(att_g, away_pid, prior_att_avg), 3),
        "def_goals_away": round(g(def_g, away_pid, prior_def_avg), 3),
        "att_xg": round(g(att_x, home_pid, prior_att_avg), 3),
        "att_xg_away": round(g(att_x, away_pid, prior_att_avg), 3),
        "lam_goals": [round(lam_g_h, 2), round(lam_g_a, 2)],
        "lam_xg": [round(lam_x_h, 2), round(lam_x_a, 2)],
    }
    return lam_h, lam_a, meta


def project_volume(home_pid: str, away_pid: str, cur: list[dict], prev: list[dict]) -> dict:
    """Očekávané střely, SOT a rohy (volume_simple, parametry VOL)."""
    out: dict[str, dict] = {}
    for name, hk, ak in (("shots", "hshots", "ashots"), ("sot", "hsot", "asot"), ("corners", "hcorners", "acorners")):
        default = VOL_DEFAULT_MU[name]
        lh, la = volume_simple(home_pid, away_pid, cur, prev, hk, ak, default)
        mu_prev = league_metric_mu(prev, hk, ak) if prev else default
        mu_cur = league_metric_mu(cur, hk, ak)
        n = sum(1 for x in cur if x.get(hk) is not None and x.get(ak) is not None)
        mu = (shrink(mu_cur[0], mu_prev[0], n, VOL["k_league"]) + shrink(mu_cur[1], mu_prev[1], n, VOL["k_league"])) / 2
        out[name] = {
            "home": round(lh, 1),
            "away": round(la, 1),
            "total": round(lh + la, 1),
            "league_avg": round(mu, 2),
            "league_avg_prev": round((mu_prev[0] + mu_prev[1]) / 2, 2),
            "prior_from": "prev_season",
        }
    return out


VOL = {
    "k_venue": 12,  # shrink doma/venku rate k loňsku
    "k_overall": 12,
    "k_league": 40,
    "venue_weight": 0.7,
    # Ladění na 2025/26, ověřeno na 2026/27: poměry týmu a soupeře se berou jen zčásti (šum střel je velký).
    "alpha": 0.75,  # exponent na útočný poměr týmu
    "gamma": 0.5,  # exponent na obranný poměr soupeře (obrana střel je v sezoně hodně nestabilní)
}
VOL_UNTUNED = {"k_venue": 8, "k_overall": 8, "alpha": 1.0, "gamma": 1.0}
VOL_DEFAULT_MU = {"shots": (13.0, 11.0), "sot": (4.4, 3.8), "corners": (5.2, 4.4)}


def split_metric(matches: list[dict], hk: str, ak: str) -> dict[str, dict]:
    acc: dict[str, dict] = defaultdict(lambda: {v: {"n": 0, "gf": 0.0, "ga": 0.0} for v in ("home", "away", "all")})
    for m in matches:
        if m.get(hk) is None or m.get(ak) is None:
            continue
        for tid, venue, f, a in ((m["home"], "home", m[hk], m[ak]), (m["away"], "away", m[ak], m[hk])):
            for key in (venue, "all"):
                s = acc[tid][key]
                s["n"] += 1
                s["gf"] += float(f)
                s["ga"] += float(a)
    return acc


def volume_simple(
    home_pid: str,
    away_pid: str,
    cur: list[dict],
    prev: list[dict],
    hk: str,
    ak: str,
    default_mu: tuple[float, float],
    par: dict | None = None,
) -> tuple[float, float]:
    """Střely / SOT / rohy bez Maher iterace: rate týmu doma/venku (stažený k loňsku) × rate soupeře / ligový průměr."""
    par = {**VOL, **(par or {})}
    cur_sp, prev_sp = split_metric(cur, hk, ak), split_metric(prev, hk, ak)
    mu_prev = league_metric_mu(prev, hk, ak) if prev else default_mu
    if not mu_prev[0]:
        mu_prev = default_mu
    mu_cur = league_metric_mu(cur, hk, ak)
    n_cur = sum(1 for x in cur if x.get(hk) is not None and x.get(ak) is not None)
    mu_h = shrink(mu_cur[0], mu_prev[0], n_cur, par["k_league"])
    mu_a = shrink(mu_cur[1], mu_prev[1], n_cur, par["k_league"])
    weak = [t for t in bottom_ids(prev, P["promoted_bottom_n"]) if t in prev_sp] if prev else []

    def rate(s: dict) -> tuple[float, float]:
        return (s["gf"] / s["n"], s["ga"] / s["n"]) if s["n"] else (0.0, 0.0)

    def prior_for(t: str, venue: str) -> tuple[float, float]:
        if t in prev_sp and prev_sp[t][venue]["n"]:
            return rate(prev_sp[t][venue])
        if weak:
            rs = [rate(prev_sp[w][venue]) for w in weak]
            return sum(r[0] for r in rs) / len(rs), sum(r[1] for r in rs) / len(rs)
        return (mu_h if venue == "home" else mu_a), (mu_a if venue == "home" else mu_h)

    def block(t: str, venue: str) -> tuple[float, float]:
        ph, pa = prior_for(t, "home"), prior_for(t, "away")
        parts = []
        for key, k, pri in (
            (venue, par["k_venue"], prior_for(t, venue)),
            ("all", par["k_overall"], ((ph[0] + pa[0]) / 2, (ph[1] + pa[1]) / 2)),
        ):
            n = cur_sp[t][key]["n"] if t in cur_sp else 0
            obs = rate(cur_sp[t][key]) if t in cur_sp else (0.0, 0.0)
            parts.append((shrink(obs[0], pri[0], n, k), shrink(obs[1], pri[1], n, k)))
        w = par["venue_weight"]
        return w * parts[0][0] + (1 - w) * parts[1][0], w * parts[0][1] + (1 - w) * parts[1][1]

    att_h = block(home_pid, "home")[0]
    def_a = block(away_pid, "away")[1]
    att_a = block(away_pid, "away")[0]
    def_h = block(home_pid, "home")[1]
    al, ga = par["alpha"], par["gamma"]
    lh = mu_h * (att_h / mu_h) ** al * (def_a / mu_h) ** ga if mu_h else 0.0
    la = mu_a * (att_a / mu_a) ** al * (def_h / mu_a) ** ga if mu_a else 0.0
    return lh, la


def rest_days(match: dict, side: str) -> int | None:
    recent = ((match.get("form") or {}).get(side) or {}).get("recent_all") or []
    kick = datetime.fromisoformat(match["starting_at"].replace("Z", "+00:00"))
    before = [datetime.fromisoformat(r["date"].replace("Z", "+00:00")) for r in recent if r.get("date") and r["date"] < match["starting_at"]]
    if not before:
        return None
    return (kick - max(before)).days


def poisson(k: int, lam: float) -> float:
    return math.exp(-lam) * lam**k / math.factorial(k)


def dixon_coles(lh: float, la: float, rho: float, max_goals: int) -> list[list[float]]:
    grid = [[poisson(i, lh) * poisson(j, la) for j in range(max_goals + 1)] for i in range(max_goals + 1)]
    grid[0][0] *= 1 - lh * la * rho
    grid[0][1] *= 1 + lh * rho
    grid[1][0] *= 1 + la * rho
    grid[1][1] *= 1 - rho
    total = sum(sum(r) for r in grid)
    return [[v / total for v in r] for r in grid]


def markets(grid: list[list[float]]) -> dict:
    n = len(grid)
    home = draw = away = btts = 0.0
    totals: dict[int, float] = defaultdict(float)
    for i in range(n):
        for j in range(n):
            p = grid[i][j]
            if i > j:
                home += p
            elif i == j:
                draw += p
            else:
                away += p
            if i > 0 and j > 0:
                btts += p
            totals[i + j] += p
    over = lambda line: sum(p for g, p in totals.items() if g > line)  # noqa: E731
    scorelines = sorted(((f"{i}-{j}", grid[i][j]) for i in range(n) for j in range(n)), key=lambda x: -x[1])[:6]
    pct = lambda x: round(100 * x, 1)  # noqa: E731
    return {
        "home_win_pct": pct(home),
        "draw_pct": pct(draw),
        "away_win_pct": pct(away),
        "btts_pct": pct(btts),
        "over15_pct": pct(over(1.5)),
        "over25_pct": pct(over(2.5)),
        "under25_pct": pct(1 - over(2.5)),
        "over35_pct": pct(over(3.5)),
        "top_scorelines": [{"score": s, "pct": pct(p)} for s, p in scorelines],
    }


CAL_PATH = Path(__file__).parent / "sim_v2_calibration.json"
CAL: dict[str, list[float]] = json.loads(CAL_PATH.read_text()) if CAL_PATH.exists() else {}
CAL_FIELDS = {"btts": "btts_pct", "over15": "over15_pct", "over25": "over25_pct", "over35": "over35_pct"}


def calibrate_markets(out: dict, cal: dict | None = None) -> dict:
    """Platt kalibrace trhů (oba dají gól, over). Parametry z walk-forward na 2025/26: scripts/sim_calibrate.py."""
    cal = CAL if cal is None else cal
    res = dict(out)
    for key, field in CAL_FIELDS.items():
        ab = cal.get(key)
        if not ab or field not in res:
            continue
        p = min(max(res[field] / 100, 1e-4), 1 - 1e-4)
        z = ab[0] * math.log(p / (1 - p)) + ab[1]
        res[field] = round(100 / (1 + math.exp(-z)), 1)
    if "over25_pct" in res:
        res["under25_pct"] = round(100 - res["over25_pct"], 1)
    return res


def implied(odds: dict) -> dict | None:
    trio = [odds.get("home"), odds.get("draw"), odds.get("away")]
    if not all(isinstance(x, (int, float)) and x > 1 for x in trio):
        return None
    inv = [1 / x for x in trio]
    s = sum(inv)
    out = {
        "home_win_pct": round(100 * inv[0] / s, 1),
        "draw_pct": round(100 * inv[1] / s, 1),
        "away_win_pct": round(100 * inv[2] / s, 1),
        "margin_pct": round(100 * (s - 1), 1),
        "odds": {"home": trio[0], "draw": trio[1], "away": trio[2]},
    }
    o, u = odds.get("over25"), odds.get("under25")
    if isinstance(o, (int, float)) and isinstance(u, (int, float)) and o > 1 and u > 1:
        s2 = 1 / o + 1 / u
        out["over25_pct"] = round(100 * (1 / o) / s2, 1)
        out["under25_pct"] = round(100 * (1 / u) / s2, 1)
        out["odds"].update({"over25": o, "under25": u})
    return out


def team_block(
    pitch_id: str,
    sm_id: int,
    venue: str,
    cur: dict,
    prev: dict,
    prev_matches: list[dict],
    xg_lookup: dict,
    cutoff: str,
    rest: int | None,
) -> dict:
    cur_v = cur.get(pitch_id, {}).get(venue, {"n": 0, "gf": 0, "ga": 0})
    cur_all = cur.get(pitch_id, {}).get("all", {"n": 0, "gf": 0, "ga": 0})
    promoted = pitch_id not in prev
    if promoted:
        prior_v = bottom_prior(prev_matches, prev, venue, P["promoted_bottom_n"])
        prior_all = bottom_prior(prev_matches, prev, "all", P["promoted_bottom_n"])
        prev_v = prev_all = {"n": 0, "gf": 0, "ga": 0}
    else:
        prev_v, prev_all = prev[pitch_id][venue], prev[pitch_id]["all"]
        prior_v, prior_all = rates(prev_v), rates(prev_all)

    obs_v, obs_all = rates(cur_v), rates(cur_all)
    att_v = shrink(obs_v[0], prior_v[0], cur_v["n"], P["k_venue"])
    def_v = shrink(obs_v[1], prior_v[1], cur_v["n"], P["k_venue"])
    att_all = shrink(obs_all[0], prior_all[0], cur_all["n"], P["k_overall"])
    def_all = shrink(obs_all[1], prior_all[1], cur_all["n"], P["k_overall"])
    w = P["venue_weight"]
    att_blend = w * att_v + (1 - w) * att_all
    def_blend = w * def_v + (1 - w) * def_all

    xg = xg_regression(sm_id, xg_lookup, cutoff)
    att_xg = max(0.15, att_blend + xg["delta_att"])
    def_xg = max(0.15, def_blend + xg["delta_def"])

    short = rest is not None and rest <= P["rest_short_days"]
    att_final = att_xg * (P["rest_att"] if short else 1.0)
    def_final = def_xg * (P["rest_def"] if short else 1.0)

    r2 = lambda x: round(x, 2)  # noqa: E731
    return {
        "venue": venue,
        "promoted": promoted,
        "current": {"venue": {**cur_v, "gf_pg": r2(obs_v[0]), "ga_pg": r2(obs_v[1])}, "all": {**cur_all, "gf_pg": r2(obs_all[0]), "ga_pg": r2(obs_all[1])}},
        "prior": {"venue": {**prev_v, "gf_pg": r2(prior_v[0]), "ga_pg": r2(prior_v[1])}, "all": {**prev_all, "gf_pg": r2(prior_all[0]), "ga_pg": r2(prior_all[1])}},
        "steps": {
            "venue_shrunk": {"att": r2(att_v), "def": r2(def_v)},
            "overall_shrunk": {"att": r2(att_all), "def": r2(def_all)},
            "blend": {"att": r2(att_blend), "def": r2(def_blend)},
            "xg": xg,
            "after_xg": {"att": r2(att_xg), "def": r2(def_xg)},
            "rest": {"days": rest, "applied": short},
            "final": {"att": r2(att_final), "def": r2(def_final)},
        },
        "att": att_final,
        "def": def_final,
    }


def main() -> None:
    teams_sm, _, sm_by_id = load_sm()
    cur_all = load_league("league-matches.json")
    prev_all = load_league(prev_season_file())
    if not cur_all and not prev_all:
        print("sim v2: chybí PitchAPI data, nic se nepočítá")
        return
    pitch_by_sm: dict[int, str] = {}
    for m in cur_all + prev_all:
        for pid, name in ((m["home"], m["home_name"]), (m["away"], m["away_name"])):
            sm = map_team(name, teams_sm)
            if sm:
                pitch_by_sm[sm["id"]] = pid
    league_ids = {m["home"] for m in cur_all} | {m["away"] for m in cur_all}
    attach_pitch_stats(cur_all)
    attach_pitch_stats(prev_all)
    prev_with_stats = sum(1 for m in prev_all if m.get("hshots") is not None)
    print(f"letos {len(cur_all)} zápasů, loni {len(prev_all)} (stats {prev_with_stats})")

    only = {int(a) for a in sys.argv[1:] if a.isdigit()}
    fixtures = json.loads(ROUND.read_text()).get("round") or []
    SIM_OUT.mkdir(parents=True, exist_ok=True)
    if not only:  # soubory zápasů, které už nejsou v okně kola, se mažou
        keep = {f"{fx['fixture_id']}.json" for fx in fixtures}
        for old in SIM_OUT.glob("*.json"):
            if old.name not in keep:
                old.unlink()
    done = 0
    for fx in fixtures:
        fid = fx["fixture_id"]
        if only and fid not in only:
            continue
        path = MATCHES / f"{fid}.json"
        if not path.exists():
            continue
        match = json.loads(path.read_text())
        home_id, away_id = match["home"]["id"], match["away"]["id"]
        if home_id not in pitch_by_sm or away_id not in pitch_by_sm:
            print(f"  {fid}: tým bez PitchAPI mapování, přeskočeno")
            continue
        cutoff = match["starting_at"][:10]
        cur = [m for m in cur_all if m["date"] < cutoff]
        rest_h = rest_days(match, "home")
        rest_a = rest_days(match, "away")
        home_pid, away_pid = pitch_by_sm[home_id], pitch_by_sm[away_id]

        lam_h, lam_a, opp_meta = lambdas_opp(home_pid, away_pid, cur, prev_all, rest_h, rest_a, league_ids, cutoff)
        model = calibrate_markets(markets(dixon_coles(lam_h, lam_a, P["rho"], P["max_goals"])))
        model["expected_goals"] = {"home": round(lam_h, 2), "away": round(lam_a, 2)}
        volume = project_volume(home_pid, away_pid, cur, prev_all)
        model["expected_shots"] = volume["shots"]
        model["expected_sot"] = volume["sot"]
        model["expected_corners"] = volume["corners"]

        odds = match.get("odds") or {}
        market = implied(odds)
        payload = {
            "fixture_id": fid,
            "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "starting_at": match["starting_at"],
            "home": {"id": home_id, "name": match["home"]["name"]},
            "away": {"id": away_id, "name": match["away"]["name"]},
            "method": "maher_opp_dixon_coles",
            "params": P,
            "league": {
                "matches_current": len(cur),
                "matches_prev": len(prev_all),
                "prev_stats": prev_with_stats,
            },
            "opp_meta": {
                **opp_meta,
                "rest": {"home": rest_h, "away": rest_a},
            },
            "model": model,
            "market": market,
        }
        out_path = SIM_OUT / f"{fid}.json"
        if out_path.exists():
            try:
                old = json.loads(out_path.read_text())
            except json.JSONDecodeError:
                old = {}
            if {k: v for k, v in old.items() if k != "generated_at"} == {k: v for k, v in payload.items() if k != "generated_at"}:
                payload["generated_at"] = old["generated_at"]  # beze změny: soubor zůstane stejný
        out_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
        mk = f"{market['home_win_pct']}/{market['draw_pct']}/{market['away_win_pct']}" if market else "—"
        print(
            f"  {fid} {match['home']['name']}–{match['away']['name']}: "
            f"1X2 {model['home_win_pct']}/{model['draw_pct']}/{model['away_win_pct']} · "
            f"λ {lam_h:.2f}:{lam_a:.2f} · střely {volume['shots']['home']}/{volume['shots']['away']} · "
            f"SOT {volume['sot']['home']}/{volume['sot']['away']} · rohy {volume['corners']['home']}/{volume['corners']['away']} · "
            f"Chance {mk}"
        )
        done += 1
    print(f"sim v2: {done} zápasů → {SIM_OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
