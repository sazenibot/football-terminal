#!/usr/bin/env python3
"""Denní PitchAPI krok: katalog Chance Ligy (262) + simulace všech pěti lig (přírůstkově).

Pořadí:
  1. ingest_pitchapi.py       soupiska sezony (1 volání) + nové zápasy (shots, stats, lineups) → katalog týmů a hráčů
  2. pitch_backfill_prev_stats.py   loňské stats jako prior (po prvním běhu už žádná volání)
  3. pitch_h2h_xgot.py        xGOT z H2H zápasů aktuálního kola
  4. sim_input.py             sezóny lig pro model (aktuální + 2 předchozí), přírůstkově: jen nové odehrané zápasy
  5. sim_live.py              simulace v2.1 pro zápasy v okně kola, všech 5 lig
  6. build_backtest.py --current   zpětný test aktuální sezóny po ligách (dřívější sezóny jsou hotové)

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
    ["sim_input.py"],
    ["sim_live.py"],
    ["build_backtest.py", "--current"],
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
