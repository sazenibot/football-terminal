import type { MatchData } from "../types";

/** Soubor z scripts/player_trends.py (frontend/public/data/player_trends/{liga}.json). */
export type TrendStat = "sh" | "sot";
export type TrendRun = { len: number; v: number[] };
export type TrendItem = { id: number; n: string; r?: "att" | "mid" | "def" | null } & Partial<Record<TrendStat, TrendRun>>;
export type PlayerTrendsFile = {
  v: number;
  league_id: number;
  generated_at: string;
  rules: Record<TrendStat, number>;
  min_len: number;
  teams: Record<string, { asof: string; last_fid: number; items: TrendItem[] }>;
};

export const TREND_STATS: TrendStat[] = ["sh", "sot"];
export const TRENDS_PER_TEAM = 3;

export type SideTrends = { side: "home" | "away"; items: (TrendItem & { name: string })[]; total: number };

/**
 * Série hráčů obou týmů pro zápas, který se ještě nehrál.
 * Vyřadí zápas, který už v datech je (po výkopu), a hráče, kteří podle zranění nejspíš nenastoupí.
 */
export function trendsForMatch(file: PlayerTrendsFile | null, m: MatchData): SideTrends[] | null {
  if (!file || Date.now() >= new Date(m.starting_at).getTime()) return null;
  const out = (["home", "away"] as const).map((side) => {
    const team = file.teams[String(m[side].id)];
    if (!team || team.last_fid === m.fixture_id || new Date(team.asof) >= new Date(m.starting_at)) return { side, items: [], total: 0 };
    const out = new Set(m.sidelined.filter((s) => s.side === side && !s.likely_available).map((s) => s.player_id));
    const items = team.items.filter((i) => !out.has(i.id)).map((i) => ({ ...i, name: i.n }));
    return { side, items, total: items.length };
  });
  return out.some((s) => s.total > 0) ? out : null;
}
