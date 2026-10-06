#!/usr/bin/env python3
"""Malý vyhledávací index pro rozcestník katalogu.

Čte jen už uložené `catalog/leagues/{id}.json` (žádné API) a zapisuje jeden kompaktní
`catalog/search.json`: týmy, hráči a hlavní rozhodčí všech lig v polích místo objektů.
Prohlížeč si ho stáhne až při prvním psaní do vyhledávání, ne s celým katalogem ligy.

Z uloženého `leagues/{id}.explorer.json` skládá i `leagues/{id}.ref_universe.json`: kolik zápasů
ligy se v sezóně odehrálo a průměrné fauly / karty týmů doma a venku. Stránka rozhodčího z toho
ukazuje "odpískáno z možných" a srovnání týmu s ostatními rozhodčími.

Při 30 ligách (cca 18 000 hráčů) rozdělit na soubor na ligu a stahovat jen vybrané.
Idempotentní: zapisuje jen při změně obsahu.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "frontend" / "public" / "data" / "catalog"
CDN = "https://cdn.sportmonks.com/images/soccer/"


def short_img(url: str | None) -> str | None:
    if not url or "placeholder" in url:
        return None
    return url[len(CDN):] if url.startswith(CDN) else url


def write(path: Path, payload: dict, pretty: bool = False) -> None:
    text = json.dumps(payload, ensure_ascii=False, indent=1 if pretty else None, separators=None if pretty else (",", ":"))
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return
    path.write_text(text, encoding="utf-8")


def build_league_universe(lid: int) -> None:
    """Zápasy ligy po sezónách a průměrné fauly / karty týmů doma a venku.

    Bere se z `{id}.explorer.json` (zápasy všech týmů, žádné API). Karty soupeře se dopárují
    podle sezóny, data, skóre a faulů; nejednoznačné dvojice se přeskočí.
    """
    path = CATALOG / "leagues" / f"{lid}.explorer.json"
    if not path.exists():
        return
    explorer = json.loads(path.read_text(encoding="utf-8"))
    home_rows, away_rows = {}, {}
    for t in explorer.get("teams", []):
        for m in t.get("matches", []):
            if m.get("s") is None or not m.get("d"):
                continue
            row = {"tid": t["id"], "m": m}
            if m.get("h"):
                key = (m["s"], m["d"], m["gf"], m["ga"], m.get("f"), m.get("of"))
                home_rows.setdefault(key, []).append(row)
            else:
                key = (m["s"], m["d"], m["ga"], m["gf"], m.get("of"), m.get("f"))
                away_rows.setdefault(key, []).append(row)

    opp: dict[int, dict] = {}  # id(řádek) -> řádek soupeře
    for key, hs in home_rows.items():
        aw = away_rows.get(key, [])
        if len(hs) == 1 and len(aw) == 1:
            opp[id(hs[0]["m"])] = aw[0]["m"]
            opp[id(aw[0]["m"])] = hs[0]["m"]

    seasons: dict[str, dict] = {}
    for t in explorer.get("teams", []):
        for m in t.get("matches", []):
            if m.get("s") is None:
                continue
            se = seasons.setdefault(str(m["s"]), {"total": 0, "teams": {}})
            venue = "home" if m.get("h") else "away"
            if m.get("h"):
                se["total"] += 1
            b = se["teams"].setdefault(str(t["id"]), {"home": {}, "away": {}})[venue]
            b["m"] = b.get("m", 0) + 1
            if m.get("f") is None or m.get("of") is None:
                continue
            b["n"] = b.get("n", 0) + 1
            b["f"] = b.get("f", 0) + m["f"]
            b["fa"] = b.get("fa", 0) + m["of"]
            if m.get("y") is not None:
                b["y"] = b.get("y", 0) + m["y"]
            if m.get("r") is not None:
                b["r"] = b.get("r", 0) + m["r"]
            o = opp.get(id(m))
            if o and o.get("y") is not None:
                b["ya"] = b.get("ya", 0) + o["y"]
                b["nya"] = b.get("nya", 0) + 1
            if o and o.get("r") is not None:
                b["ra"] = b.get("ra", 0) + o["r"]
    write(CATALOG / "leagues" / f"{lid}.ref_universe.json", {"league_id": lid, "seasons": seasons})


def main() -> None:
    leagues, teams, players, referees = [], [], [], []
    directory = []
    for path in sorted((CATALOG / "leagues").glob("*.json")):
        if path.name.endswith((".explorer.json", ".players.json", ".ref_universe.json")):
            continue
        hub = json.loads(path.read_text(encoding="utf-8"))
        lg = hub.get("league") or {}
        lid = lg.get("id")
        if not lid:
            continue
        leagues.append({"id": lid, "name": lg.get("name"), "logo": short_img(lg.get("logo"))})
        build_league_universe(lid)
        n_ref = sum(
            1 for r in hub.get("referees", [])
            if (r.get("season_matches") or 0) > 0 or (r.get("season_matches") is None and r.get("in_league"))
        )
        directory.append({
            "id": lid,
            "name": lg.get("name"),
            "country": lg.get("country"),
            "logo": lg.get("logo"),
            "season": lg.get("season_name"),
            "teams": len(hub.get("teams", [])),
            "players": len(hub.get("players", [])),
            "referees": n_ref,
            # plný katalog = má statistiky hráčů a týmů (overlay), ne jen soupisku
            "full": (CATALOG / "leagues" / f"{lid}.explorer.json").exists(),
        })
        for t in hub.get("teams", []):
            teams.append([t["id"], t["name"], lid, short_img(t.get("image"))])
        for p in hub.get("players", []):
            players.append([
                p["id"], p["name"], lid, p.get("team_id"), p.get("team_name"),
                p.get("position"), p.get("number"), short_img(p.get("image")),
            ])
        for r in hub.get("referees", []):
            # jen rozhodčí, kteří v lize letos pískali (stejně jako v seznamu ligy)
            season = r.get("season_matches")
            if (season is not None and season > 0) or (season is None and r.get("in_league")):
                referees.append([r["id"], r["name"], lid, r.get("country"), season])

    payload = {"cdn": CDN, "leagues": leagues, "teams": teams, "players": players, "referees": referees}
    write(CATALOG / "directory.json", {"leagues": directory}, pretty=True)
    out = CATALOG / "search.json"
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if out.exists() and out.read_text(encoding="utf-8") == text:
        print("search.json beze změny")
        return
    out.write_text(text, encoding="utf-8")
    print(f"search.json: {len(teams)} týmů, {len(players)} hráčů, {len(referees)} rozhodčích, {len(text) // 1024} kB")


if __name__ == "__main__":
    main()
