#!/usr/bin/env python3
"""Zpětný test (walk-forward) simulace v2.1 pro stránku Výsledky: jeden soubor na ligu a sezónu.

Výstup: frontend/public/data/track_record/{liga}/{sezóna}.json  (např. pl/2025-26.json)
Každý zápas se predikuje jen z dat před ním: zápasy sezóny s dřívějším datem + dvě předchozí sezóny jako prior.
Parametry jsou jedny pro všechny ligy (sim_v2.P, společná kalibrace gólových trhů sim_v2_calibration.json).

  --current   jen aktuální sezóna všech lig ze sim-input (denní běh v GitHub Actions, žádné API, pár sekund)
  --archive   všechny sezóny od 2022/23 z lokálního archivu (data-archive/), jednorázově; uzavřené sezóny se pak nemění

    python scripts/build_backtest.py --current
    python scripts/build_backtest.py --archive [--leagues pl,bl]
"""
from __future__ import annotations

import json
import math
import multiprocessing as mp
import os
import sys
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import sim_v2  # noqa: E402
import tip_rule  # noqa: E402
from sim_input import LEAGUES, current_start, load as load_input  # noqa: E402
from sim_v2 import P, calibrate_markets, dixon_coles, lambdas_opp, markets  # noqa: E402
from team_match import score as name_score  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "frontend" / "public" / "data"
OUT = DATA / "track_record"
FIRST_EVAL = "2022/23"
TUNED_UNTIL = "2024/25"  # parametry modelu se ladily na sezónách do tohoto roku, novější jsou ověření
BINS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 100]
CTX: dict = {}


def season_file(label: str) -> str:
    return label.replace("/", "-")


def rest_days(history: list[dict], team: str, kick: str) -> int | None:
    prev = [m["date"] for m in history if m["home"] == team or m["away"] == team]
    return (date.fromisoformat(kick) - date.fromisoformat(max(prev))).days if prev else None


def predict(job: tuple[str, int]) -> dict:
    slug, i = job
    s = CTX["seasons"][slug]
    m = s["games"][i]
    hist = [x for x in s["games"] if x["date"] < m["date"]]
    prior = s["prev2"] + s["prev"] if s["prev2"] else s["prev"]
    rh, ra = rest_days(hist, m["home"], m["date"]), rest_days(hist, m["away"], m["date"])
    lh, la, _ = lambdas_opp(m["home"], m["away"], hist, prior, rh, ra, s["teams"], m["date"], prev_last=s["prev"])
    cal = calibrate_markets(markets(dixon_coles(lh, la, P["rho"], P["max_goals"])))
    return {"i": i, "model": {"h": cal["home_win_pct"], "d": cal["draw_pct"], "a": cal["away_win_pct"], "over25": cal["over25_pct"], "over15": cal["over15_pct"], "over35": cal["over35_pct"]}}


def outcome(hg: int, ag: int) -> str:
    return "h" if hg > ag else "a" if hg < ag else "d"


def scored(p: dict, y: str) -> dict:
    q = {k: max(p[k], 0.01) / 100 for k in "hda"}
    tot = sum(q.values())
    q = {k: v / tot for k, v in q.items()}
    return {"logloss": -math.log(q[y]), "brier": sum((q[k] - (1.0 if k == y else 0.0)) ** 2 for k in "hda"), "hit": max(q, key=q.get) == y}


def tip_summary(items: list[dict]) -> dict:
    def cnt(sel: list[bool]) -> dict:
        return {"n": len(sel), "hits": sum(sel)}

    x_all = [tip_rule.hit_1x2(i["x"], i["hg"], i["ag"]) for i in items]
    x_win = [tip_rule.hit_1x2(i["x"], i["hg"], i["ag"]) for i in items if i["x"]["k"] == "win"]
    x_dc = [tip_rule.hit_1x2(i["x"], i["hg"], i["ag"]) for i in items if i["x"]["k"] == "dc"]
    ou = [i for i in items if i.get("ou")]
    by = {k: [] for k in ("o15", "o25", "u25", "u35")}
    for i in ou:
        by.setdefault(tip_rule.ou_key(i["ou"]), []).append(tip_rule.hit_ou(i["ou"], i["hg"], i["ag"]))
    return {
        "x12": {**cnt(x_all), "win": cnt(x_win), "dc": cnt(x_dc)},
        "goals": {**cnt([tip_rule.hit_ou(i["ou"], i["hg"], i["ag"]) for i in ou]), "by_line": {k: cnt(v) for k, v in by.items()}},
    }


def calibration(pairs: list[tuple[float, bool]]) -> list[dict]:
    out = []
    for lo, hi in zip(BINS, BINS[1:]):
        sel = [(p, h) for p, h in pairs if lo <= p < hi or (hi == 100 and p == 100)]
        if sel:
            out.append({"lo": lo, "hi": hi, "n": len(sel), "predicted": round(sum(p for p, _ in sel) / len(sel), 1), "actual": round(100 * sum(h for _, h in sel) / len(sel), 1)})
    return out


def hub_names(lid: int) -> list[str]:
    path = DATA / "catalog" / "leagues" / f"{lid}.json"
    if not path.exists():
        return []
    return [t["name"] for t in json.loads(path.read_text()).get("teams", [])]


def display(name: str, names: list[str], cache: dict) -> str:
    """Název týmu jako ve zbytku webu (SportMonks), když ho umíme jistě přiřadit; jinak název zdroje."""
    if name not in cache:
        best = max(names, key=lambda n: name_score(name, n), default=None)
        cache[name] = best if best and name_score(name, best) >= 0.8 else name
    return cache[name]


def shard(slug: str, lid: int, league_name: str, label: str, games: list[dict], preds: dict[int, dict], names: list[str]) -> dict:
    rows, pairs, sc, items = [], [], [], []
    ac = {"h": 0, "d": 0, "a": 0}
    cache: dict = {}
    for i, g in enumerate(games):
        model = preds[i]["model"]
        y = outcome(g["hg"], g["ag"])
        ac[y] += 1
        sc.append(scored(model, y))
        for k in "hda":
            pairs.append((model[k], y == k))
        tip = tip_rule.make_tip(model)
        items.append({"x": tip["x"], "ou": tip.get("ou"), "hg": g["hg"], "ag": g["ag"]})
        rows.append(
            {
                "date": g["date"],
                "home": display(g["home_name"], names, cache),
                "away": display(g["away_name"], names, cache),
                "score": f"{g['hg']}-{g['ag']}",
                "y": {"h": "home", "d": "draw", "a": "away"}[y],
                "p": [model["h"], model["d"], model["a"]],
                "tip": {"x": tip["x"], "ou": tip.get("ou")},
            }
        )
    n = len(games)
    freq = [ac[k] / n for k in "hda"]
    freq_ll = -sum(ac[k] / n * math.log(max(ac[k] / n, 1e-9)) for k in "hda")
    mean = lambda key: sum(r[key] for r in sc) / n  # noqa: E731
    return {
        "season": label,
        "league": league_name,
        "league_id": lid,
        "slug": slug,
        "phase": "tuning" if label <= TUNED_UNTIL else "validation",
        "model_version": "v2.1",
        "method": "walk-forward: jen zápasy před daným zápasem a dvě předchozí sezóny",
        "n": n,
        "from": min(g["date"] for g in games),
        "to": max(g["date"] for g in games),
        "actual_1x2": {"home": round(100 * freq[0], 1), "draw": round(100 * freq[1], 1), "away": round(100 * freq[2], 1)},
        "model": {"n": n, "accuracy": round(100 * sum(r["hit"] for r in sc) / n, 1), "logloss": round(mean("logloss"), 4), "brier": round(mean("brier"), 4)},
        "baselines": {"frequency_logloss": round(freq_ll, 4), "always_home_accuracy": round(100 * freq[0], 1)},
        "calibration": calibration(pairs),
        "tips": tip_summary(items),
        "tips_tuning": None,
        "matches": sorted(rows, key=lambda r: r["date"], reverse=True),
    }


def season_blocks(games_by_season: dict[str, list[dict]], only: set[str] | None) -> list[tuple[str, list[dict], list[dict], list[dict]]]:
    labels = sorted(games_by_season)
    out = []
    for i, label in enumerate(labels):
        if label < FIRST_EVAL or i == 0 or (only and label not in only):
            continue
        out.append((label, games_by_season[label], games_by_season[labels[i - 1]], games_by_season[labels[i - 2]] if i >= 2 else []))
    return out


def write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
    if path.exists() and path.read_text() == text:
        return
    path.write_text(text)


def run(mode: str, only_leagues: set[str] | None) -> None:
    league_meta = {lid: json.loads((DATA / "leagues" / f"{lid}.json").read_text()).get("league") for lid in LEAGUES if (DATA / "leagues" / f"{lid}.json").exists()}
    cur_label = f"{current_start()}/{str(current_start() + 1)[2:]}"
    for lid, (slug, _, _) in LEAGUES.items():
        if only_leagues and slug not in only_leagues:
            continue
        if mode == "archive":
            from league_data import load_matches

            games = load_matches(slug)
        else:
            games = load_input(slug)["rows"]
        by: dict[str, list[dict]] = defaultdict(list)
        for g in games:
            by[g["season"]].append(g)
        blocks = season_blocks(by, {cur_label} if mode == "current" else None)
        name = (league_meta.get(lid) or {}).get("name") if isinstance(league_meta.get(lid), dict) else None
        name = name or {262: "Chance Liga", 8: "Premier League", 82: "Bundesliga", 564: "La Liga", 72: "Eredivisie"}[lid]
        names = hub_names(lid)
        for label, cur, prev, prev2 in blocks:
            CTX["seasons"] = {slug: {"games": cur, "prev": prev, "prev2": prev2, "teams": {t for g in cur for t in (g["home"], g["away"])}}}
            jobs = [(slug, i) for i in range(len(cur))]
            if len(jobs) > 150:
                with mp.get_context("fork").Pool(os.cpu_count() or 4) as pool:
                    res = pool.map(predict, jobs, chunksize=8)
            else:
                res = [predict(j) for j in jobs]
            preds = {r["i"]: r for r in res}
            payload = shard(slug, lid, name, label, cur, preds, names)
            write(OUT / slug / f"{season_file(label)}.json", payload)
            m = payload["model"]
            print(f"{slug} {label}: n={payload['n']} logloss {m['logloss']} acc {m['accuracy']}% tip1X2 {100 * payload['tips']['x12']['hits'] / payload['tips']['x12']['n']:.1f}% góly {100 * payload['tips']['goals']['hits'] / payload['tips']['goals']['n']:.1f}%", flush=True)


if __name__ == "__main__":
    mode = "archive" if "--archive" in sys.argv else "current"
    leagues = set(sys.argv[sys.argv.index("--leagues") + 1].split(",")) if "--leagues" in sys.argv else None
    run(mode, leagues)
