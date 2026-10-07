/* Tip „výhra / neprohra favorita" z pravděpodobností modelu.

   Pravidlo: když má favorit P(výhry) ≥ TIP_WIN_FROM, tipujeme jeho výhru. Jinak tipujeme neprohru
   favorita (výhra nebo remíza). Tip dostane každý zápas.

   Úspěšnosti níž jsou ze zpětného testu na 330 zápasech Chance Ligy (2025/26 + 2026/27),
   scripts/odds_analysis.py → frontend/public/data/lab/neprohra.json. Hranice byla zvolena na
   stejných datech, takže skutečná úspěšnost bude nejspíš o něco nižší. Po pár kolech ostrého
   provozu je potřeba čísla přepočítat z Knihy predikcí. */

export const TIP_WIN_FROM = 65;

export type TipKind = "win" | "dc";
export type TipSide = "home" | "away";

export type Tip = {
  kind: TipKind;
  side: TipSide;
  /** pravděpodobnost, kterou model přiřazuje samotnému tipu (v %) */
  prob: number;
  /** historická úspěšnost podobných tipů (v %) a počet zápasů, ze kterých je spočtená */
  hit: number;
  n: number;
};

const HISTORY = {
  win: { hit: 72, n: 57 },
  dcStrong: { hit: 75, n: 187 }, // P(neprohra) ≥ 70 %
  dcWeak: { hit: 67, n: 86 }, // P(neprohra) < 70 %
} as const;

export function computeTip(home: number, draw: number, away: number): Tip {
  const side: TipSide = home >= away ? "home" : "away";
  const win = Math.max(home, away);
  if (win >= TIP_WIN_FROM) return { kind: "win", side, prob: win, ...HISTORY.win };
  const prob = win + draw;
  return { kind: "dc", side, prob, ...(prob >= 70 ? HISTORY.dcStrong : HISTORY.dcWeak) };
}
