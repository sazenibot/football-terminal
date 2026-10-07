"""Pravidlo tipu modelu. Jediné místo pro Python (kniha predikcí, zpětný test, stránka Výsledky).

Stejné pravidlo je v TypeScriptu: frontend/src/lib/tip.ts (Match Center). Při změně hranice
upravit oba soubory a zvýšit VERSION. Kniha predikcí ukládá tip i s verzí, takže starší záznamy
zůstanou vyhodnocené podle pravidla, které platilo při zamčení.

1X2:   favorit = strana s vyšší pravděpodobností výhry (domácí při shodě).
       P(výhry favorita) >= WIN_FROM  -> tip výhra favorita   ("win")
       jinak                           -> tip neprohra favorita ("dc", výhra nebo remíza)
Góly:  jistota = větší z P(Over 2,5) a P(Under 2,5).
       jistota >= GOALS_MAIN_FROM  -> hlavní čára 2,5 (Over, nebo Under)
       jinak model kloní k Over (P >= 50)  -> Over 1,5
             model kloní k Under           -> Under 3,5

Verze 1 měla jen Over/Under 2,5 bez posunu čáry (v záznamu chybí klíč "l", bere se 2,5).
"""
from __future__ import annotations

VERSION = 2
WIN_FROM = 65.0
GOALS_MAIN_FROM = 60.0
OVER_LEAN_FROM = 50.0


def tip_1x2(h: float, d: float, a: float) -> dict:
    side = "h" if h >= a else "a"
    win = max(h, a)
    if win >= WIN_FROM:
        return {"k": "win", "s": side, "p": round(win, 1)}
    return {"k": "dc", "s": side, "p": round(win + d, 1)}


def tip_goals(over25: float, over15: float | None, over35: float | None) -> dict:
    """Vrací {"k": over|under, "l": čára, "p": pravděpodobnost tipu v %}."""
    under25 = 100 - over25
    if max(over25, under25) >= GOALS_MAIN_FROM or over15 is None or over35 is None:
        over = over25 >= OVER_LEAN_FROM
        return {"k": "over" if over else "under", "l": 2.5, "p": round(over25 if over else under25, 1)}
    if over25 >= OVER_LEAN_FROM:
        return {"k": "over", "l": 1.5, "p": round(over15, 1)}
    return {"k": "under", "l": 3.5, "p": round(100 - over35, 1)}


def make_tip(model: dict) -> dict | None:
    """model = {"h","d","a","over25","over15","over35"} v % (formát záznamu knihy predikcí)."""
    if model.get("h") is None:
        return None
    out = {"v": VERSION, "x": tip_1x2(model["h"], model["d"], model["a"])}
    if model.get("over25") is not None:
        out["ou"] = tip_goals(model["over25"], model.get("over15"), model.get("over35"))
    return out


def hit_1x2(tip: dict, hg: int, ag: int) -> bool:
    y = "h" if hg > ag else "a" if hg < ag else "d"
    return y == tip["s"] if tip["k"] == "win" else y in (tip["s"], "d")


def hit_ou(tip: dict, hg: int, ag: int) -> bool:
    line = tip.get("l", 2.5)
    return (hg + ag > line) if tip["k"] == "over" else (hg + ag < line)


def ou_key(tip: dict) -> str:
    """o15 / o25 / u25 / u35 ... pro souhrny."""
    line = tip.get("l", 2.5)
    return ("o" if tip["k"] == "over" else "u") + str(line).replace(".", "")
