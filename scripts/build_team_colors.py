#!/usr/bin/env python3
"""Primární barvy týmů z log: frontend/public/data/team_colors.json  ({ "<team_id>": "#rrggbb" })

Používá Match Center rozcestník (barevné pruhy karet). Žádné API, jen stažení loga z CDN.

Přírůstkově: tým, který už v souboru je, se znovu nestahuje (a ruční úprava barvy se tak nepřepíše).
Nový tým = jedno malé PNG. Pro 30 lig tedy stačí jednou při onboardingu ligy, denní běh nestahuje nic.

Barva = nejsilnější sytý odstín v logu (bílá, černá a šedá se přeskočí). Čistě černobílé logo dostane šedou.
Potřebuje Pillow:  pip install pillow
"""
from __future__ import annotations

import colorsys
import io
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "frontend" / "public" / "data"
OUT = DATA / "team_colors.json"
FALLBACK = "#6b7280"


def teams() -> dict[int, str]:
    """team_id -> URL loga, ze všech lig (katalog + aktuální kolo)."""
    found: dict[int, str] = {}
    for path in sorted((DATA / "catalog" / "leagues").glob("*.json")):
        if path.name.count(".") > 1:  # 262.players.json apod.
            continue
        for t in json.loads(path.read_text(encoding="utf-8")).get("teams") or []:
            if t.get("id") and t.get("image"):
                found[int(t["id"])] = t["image"]
    for path in sorted((DATA / "leagues").glob("*.json")):
        for f in json.loads(path.read_text(encoding="utf-8")).get("round") or []:
            for side in ("home", "away"):
                t = f.get(side) or {}
                if t.get("id") and t.get("image"):
                    found.setdefault(int(t["id"]), t["image"])
    return found


def fetch(url: str) -> bytes:
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return r.read()
    except Exception:  # např. chybějící certifikáty u macOS Pythonu
        return subprocess.run(["curl", "-sfL", "--max-time", "20", url], capture_output=True, check=True).stdout


def dominant(png: bytes) -> str:
    img = Image.open(io.BytesIO(png)).convert("RGBA")
    img.thumbnail((64, 64))
    bins: dict[int, list[tuple[float, int, int, int]]] = {}
    raw = img.tobytes()
    for i in range(0, len(raw), 4):
        r, g, b, a = raw[i : i + 4]
        if a < 140:
            continue
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if s < 0.35 or v < 0.25:  # šedá, bílá, téměř černá
            continue
        bins.setdefault(int(h * 24) % 24, []).append((s * v, r, g, b))
    if not bins:
        return FALLBACK
    best = max(bins.values(), key=lambda px: sum(p[0] for p in px))
    n = len(best)
    r, g, b = (round(sum(p[i] for p in best) / n) for i in (1, 2, 3))
    return f"#{r:02x}{g:02x}{b:02x}"


def main() -> int:
    have: dict[str, str] = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    new = 0
    for tid, url in teams().items():
        if str(tid) in have:
            continue
        try:
            have[str(tid)] = dominant(fetch(url))
            new += 1
        except Exception as e:  # noqa: BLE001
            print(f"  ! {tid}: {e}", file=sys.stderr)
    OUT.write_text(json.dumps(dict(sorted(have.items(), key=lambda kv: int(kv[0]))), indent=0), encoding="utf-8")
    print(f"team_colors: {len(have)} týmů, {new} nových")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
