"""Pravidlo tipu modelu. Jediné místo pro Python (kniha predikcí, zpětný test, stránka Výsledky).

Stejné pravidlo je v TypeScriptu: frontend/src/lib/tip.ts (Match Center). Při změně hranice
upravit oba soubory a zvýšit VERSION. Kniha predikcí ukládá tip i s verzí, takže starší záznamy
zůstanou vyhodnocené podle pravidla, které platilo při zamčení.

1X2:   favorit = strana s vyšší pravděpodobností výhry (domácí při shodě).
       P(výhry favorita) >= WIN_FROM  -> tip výhra favorita   ("win")
       jinak                           -> tip neprohra favorita ("dc", výhra nebo remíza)
Góly:  Over 2,5, když model dává P(over 2,5) >= OVER_FROM, jinak Under 2,5.
"""
from __future__ import annotations

VERSION = 1
WIN_FROM = 65.0
OVER_FROM = 50.0
OU_LINE = 2.5


def tip_1x2(h: float, d: float, a: float) -> dict:
    side = "h" if h >= a else "a"
    win = max(h, a)
    if win >= WIN_FROM:
        return {"k": "win", "s": side, "p": round(win, 1)}
    return {"k": "dc", "s": side, "p": round(win + d, 1)}


def tip_ou(p_over: float) -> dict:
    over = p_over >= OVER_FROM
    return {"k": "over" if over else "under", "p": round(p_over if over else 100 - p_over, 1)}


def make_tip(model: dict) -> dict | None:
    """model = {"h","d","a","over25"} v % (formát záznamu knihy predikcí)."""
    if model.get("h") is None:
        return None
    out = {"v": VERSION, "x": tip_1x2(model["h"], model["d"], model["a"])}
    if model.get("over25") is not None:
        out["ou"] = tip_ou(model["over25"])
    return out


def hit_1x2(tip: dict, hg: int, ag: int) -> bool:
    y = "h" if hg > ag else "a" if hg < ag else "d"
    return y == tip["s"] if tip["k"] == "win" else y in (tip["s"], "d")


def hit_ou(tip: dict, hg: int, ag: int) -> bool:
    return (hg + ag > OU_LINE) == (tip["k"] == "over")
