import type { MatchRow, PitchCatalogFile } from "../components/PitchCards";
import type { H2HMatch, MatchData } from "../types";

export const XGOT_WINDOW = 5;
export const XGOT_MIN_SIDE = 3;

export type PitchH2HFile = {
  league_id: number;
  source: string;
  matches: Record<string, Record<string, number>>;
};

export type SideWindow = { rows: MatchRow[]; atHome: boolean; fallback: boolean };

export type XgotPair = { xgot_for: number; xgot_against: number; n: number };

export type RadarView = "season" | "last5" | "last3_h2h" | "last3_h2h_home_venue";

export type RadarXgot = Record<RadarView, { home: XgotPair; away: XgotPair } | null>;

export function rowsBefore(file: PitchCatalogFile, startingAt: string): MatchRow[] {
  const cutoff = startingAt.slice(0, 10);
  return file.matches.filter((r) => r.date < cutoff).sort((a, b) => a.date.localeCompare(b.date));
}

export function pickWindow(rows: MatchRow[], atHome: boolean): SideWindow {
  const side = rows.filter((r) => r.home === atHome);
  if (side.length >= XGOT_MIN_SIDE) return { rows: side.slice(-XGOT_WINDOW), atHome, fallback: false };
  return { rows: rows.slice(-XGOT_WINDOW), atHome, fallback: true };
}

function avg2(nums: number[]): number {
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

function pairFromRows(rows: MatchRow[]): XgotPair | null {
  if (!rows.length) return null;
  return {
    xgot_for: avg2(rows.map((r) => r.xgot)),
    xgot_against: avg2(rows.map((r) => r.xgot_faced)),
    n: rows.length,
  };
}

function pairFromH2H(list: H2HMatch[], teamId: number, oppId: number, map: PitchH2HFile["matches"]): XgotPair | null {
  const hits = list.map((m) => map[String(m.fixture_id)]).filter((x) => x && x[teamId] != null && x[oppId] != null);
  if (!hits.length) return null;
  return {
    xgot_for: avg2(hits.map((x) => x[teamId])),
    xgot_against: avg2(hits.map((x) => x[oppId])),
    n: hits.length,
  };
}

function both(home: XgotPair | null, away: XgotPair | null) {
  return home && away ? { home, away } : null;
}

export function radarXgot(
  match: MatchData,
  homeFile: PitchCatalogFile,
  awayFile: PitchCatalogFile,
  h2hMap: PitchH2HFile["matches"] | null,
): RadarXgot {
  const homeRows = rowsBefore(homeFile, match.starting_at);
  const awayRows = rowsBefore(awayFile, match.starting_at);
  const h2h = [...match.h2h].sort((a, b) => b.date.localeCompare(a.date));
  const last3 = h2h.slice(0, 3);
  const last3Venue = h2h.filter((m) => m.is_home_team_at_home).slice(0, 3);
  const fromH2H = (list: H2HMatch[]) =>
    h2hMap
      ? both(
          pairFromH2H(list, match.home.id, match.away.id, h2hMap),
          pairFromH2H(list, match.away.id, match.home.id, h2hMap),
        )
      : null;
  return {
    season: both(pairFromRows(homeRows), pairFromRows(awayRows)),
    last5: both(pairFromRows(homeRows.slice(-5)), pairFromRows(awayRows.slice(-5))),
    last3_h2h: fromH2H(last3),
    last3_h2h_home_venue: fromH2H(last3Venue),
  };
}

export function h2hWithXgot(match: MatchData, h2hMap: PitchH2HFile["matches"] | null): H2HMatch[] {
  if (!h2hMap) return match.h2h;
  const homeId = String(match.home.id);
  const awayId = String(match.away.id);
  return match.h2h.map((m) => {
    const x = h2hMap[String(m.fixture_id)];
    if (!x) return m;
    return {
      ...m,
      team_home_stats: { ...m.team_home_stats, xgot: x[homeId], xgot_against: x[awayId] },
      team_away_stats: { ...m.team_away_stats, xgot: x[awayId], xgot_against: x[homeId] },
    };
  });
}

/** Ligy (SportMonks id), pro které máme data z PitchAPI: katalog týmů, H2H xGOT a simulaci. */
export const PITCH_LEAGUE_IDS: number[] = [262];

export function hasPitchData(leagueId: number | null | undefined): boolean {
  return leagueId != null && PITCH_LEAGUE_IDS.includes(leagueId);
}
