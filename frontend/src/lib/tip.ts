/* Tip modelu: výsledek (výhra / neprohra favorita) a góly (Over / Under).

   Výsledek: když má favorit P(výhry) ≥ TIP_WIN_FROM, tipujeme jeho výhru. Jinak jeho neprohru
   (výhra nebo remíza).
   Góly: když je jistota na Over nebo Under 2,5 aspoň TIP_GOALS_MAIN_FROM, tipujeme čáru 2,5.
   Jinak tipujeme Over 1,5, když model kloní k Over, nebo Under 3,5, když k Under.
   Tip dostane každý zápas.

   Úspěšnosti níž jsou ze zpětného testu na 346 zápasech Chance Ligy (2025/26 + 2026/27),
   scripts/build_track_record.py. Hranice byly zvoleny na stejných datech, takže skutečná
   úspěšnost bude nejspíš o něco nižší. Po pár kolech ostrého provozu je potřeba čísla přepočítat
   z Knihy predikcí.

   Totéž pravidlo je v Pythonu: scripts/tip_rule.py. Při změně upravit oba a zvýšit VERSION. */

export const TIP_WIN_FROM = 65;
export const TIP_GOALS_MAIN_FROM = 60;

export type TipKind = "win" | "dc";
export type TipSide = "home" | "away";
export type GoalsLine = "o15" | "o25" | "u25" | "u35";

export type Tip = {
  kind: TipKind;
  side: TipSide;
  /** pravděpodobnost, kterou model přiřazuje samotnému tipu (v %) */
  prob: number;
  /** historická úspěšnost podobných tipů (v %) a počet zápasů, ze kterých je spočtená */
  hit: number;
  n: number;
};

export type GoalsTip = {
  line: GoalsLine;
  prob: number;
  hit: number;
  n: number;
};

const HISTORY = {
  win: { hit: 72, n: 57 },
  dcStrong: { hit: 75, n: 187 }, // P(neprohra) ≥ 70 %
  dcWeak: { hit: 67, n: 86 }, // P(neprohra) < 70 %
} as const;

const GOALS_HISTORY: Record<GoalsLine, { hit: number; n: number }> = {
  o25: { hit: 65, n: 52 },
  u25: { hit: 63, n: 67 },
  o15: { hit: 81, n: 111 },
  u35: { hit: 84, n: 116 },
};

export function computeTip(home: number, draw: number, away: number): Tip {
  const side: TipSide = home >= away ? "home" : "away";
  const win = Math.max(home, away);
  if (win >= TIP_WIN_FROM) return { kind: "win", side, prob: win, ...HISTORY.win };
  const prob = win + draw;
  return { kind: "dc", side, prob, ...(prob >= 70 ? HISTORY.dcStrong : HISTORY.dcWeak) };
}

export function computeGoalsTip(over25: number, over15?: number, over35?: number): GoalsTip {
  const under25 = 100 - over25;
  const conf = Math.max(over25, under25);
  const lean = over25 >= 50;
  if (conf >= TIP_GOALS_MAIN_FROM || over15 == null || over35 == null) {
    const line: GoalsLine = lean ? "o25" : "u25";
    return { line, prob: lean ? over25 : under25, ...GOALS_HISTORY[line] };
  }
  if (lean) return { line: "o15", prob: over15, ...GOALS_HISTORY.o15 };
  return { line: "u35", prob: 100 - over35, ...GOALS_HISTORY.u35 };
}
