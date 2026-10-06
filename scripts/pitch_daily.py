#!/usr/bin/env python3
"""Denní PitchAPI krok pro Chance Ligu (jen liga 262, přírůstkově).

Pořadí:
  1. ingest_pitchapi.py       soupiska sezony (1 volání) + nové zápasy (shots, stats, lineups) → katalog týmů a hráčů
  2. pitch_backfill_prev_stats.py   loňské stats jako prior (po prvním běhu už žádná volání)
  3. pitch_h2h_xgot.py        xGOT z H2H zápasů aktuálního kola
  4. sim_v2.py                simulace pro zápasy v okně kola

Cache scripts/.cache/pitchapi drží GitHub Actions cache, ne git. První běh na prázdné cache
stáhne historii (stovky volání), další běhy jen včerejší zápasy.
Chyba jednoho kroku nezastaví ostatní; skript pak skončí s kódem 1.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
STEPS = [
    ["ingest_pitchapi.py"],
    ["pitch_backfill_prev_stats.py"],
    ["pitch_h2h_xgot.py"],
    ["sim_v2.py"],
]


def main() -> int:
    failed = []
    for step in STEPS:
        print(f"\n=== {' '.join(step)} ===", flush=True)
        r = subprocess.run([sys.executable, str(HERE / step[0]), *step[1:]], cwd=HERE.parent)
        if r.returncode != 0:
            print(f"!! {step[0]} skončil s kódem {r.returncode}", file=sys.stderr)
            failed.append(step[0])
    if failed:
        print(f"Selhalo: {', '.join(failed)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
