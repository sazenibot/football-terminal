import type { MatchRow, PitchCatalogFile, Shot } from "../components/PitchCards";

/** Šestnáctimetrový prostor: hloubka střely od brankové čáry soupeře. */
export const BOX_M = 16.5;

export const QUARTERS = [
  { id: "1-15", lo: 0, hi: 15, label: "1–15" },
  { id: "16-30", lo: 16, hi: 30, label: "16–30" },
  { id: "31-45", lo: 31, hi: 45, label: "31–45" },
  { id: "46-60", lo: 46, hi: 60, label: "46–60" },
  { id: "61-75", lo: 61, hi: 75, label: "61–75" },
  { id: "76-90+", lo: 76, hi: 130, label: "76–90+" },
] as const;

export type QuarterId = (typeof QUARTERS)[number]["id"];
export type Venue = "all" | "home" | "away";

export type TimedGoal = {
  matchId: string;
  minute: number;
  kind: Shot["kind"];
  depth: number;
  ours: boolean;
};

export type Bin = { id: string; label: string; n: number; share: number; leagueShare: number };

export type GoalDistribution = {
  matches: number;
  scored: number;
  conceded: number;
  officialGf: number;
  officialGa: number;
  scoredBins: Bin[];
  concededBins: Bin[];
  scoredHalves: Bin[];
  concededHalves: Bin[];
  play: number;
  set: number;
  box: number;
  outside: number;
  first: number;
  last: number;
};

export function quarterOf(minute: number): QuarterId {
  const m = Math.max(0, minute);
  if (m <= 15) return "1-15";
  if (m <= 30) return "16-30";
  if (m <= 45) return "31-45";
  if (m <= 60) return "46-60";
  if (m <= 75) return "61-75";
  return "76-90+";
}

export function inBox(depth: number): boolean {
  return depth <= BOX_M;
}

function pickMatches(matches: MatchRow[], venue: Venue): MatchRow[] {
  if (venue === "all") return matches;
  return matches.filter((m) => m.home === (venue === "home"));
}

function goalsFrom(m: MatchRow, ours: boolean): TimedGoal[] {
  return m.shots
    .filter((s) => s.goal)
    .map((s) => ({ matchId: m.id, minute: s.minute, kind: s.kind, depth: s.depth, ours }));
}

/** Góly soupeře ve stejných zápasech — z ostatních týmových Pitch souborů ligy. */
export function opponentGoals(team: PitchCatalogFile, league: PitchCatalogFile[], venue: Venue): Map<string, TimedGoal[]> {
  const ids = new Set(pickMatches(team.matches, venue).map((m) => m.id));
  const self = team.team?.id;
  const byMatch = new Map<string, TimedGoal[]>();
  for (const other of league) {
    if (other.team?.id === self) continue;
    for (const m of other.matches) {
      if (!ids.has(m.id)) continue;
      const list = byMatch.get(m.id) ?? [];
      list.push(...goalsFrom(m, false));
      byMatch.set(m.id, list);
    }
  }
  return byMatch;
}

function bins(goals: TimedGoal[], leagueGoals: TimedGoal[], halves: boolean): Bin[] {
  const defs = halves
    ? [
        { id: "1h", label: "1. poločas", lo: 0, hi: 45 },
        { id: "2h", label: "2. poločas", lo: 46, hi: 130 },
      ]
    : QUARTERS.map((q) => ({ id: q.id, label: q.label, lo: q.lo, hi: q.hi }));
  const total = goals.length;
  const leagueTotal = leagueGoals.length;
  return defs.map((d) => {
    const n = goals.filter((g) => g.minute >= d.lo && g.minute <= d.hi).length;
    const ln = leagueGoals.filter((g) => g.minute >= d.lo && g.minute <= d.hi).length;
    return {
      id: d.id,
      label: d.label,
      n,
      share: total ? n / total : 0,
      leagueShare: leagueTotal ? ln / leagueTotal : 0,
    };
  });
}

export function buildDistribution(team: PitchCatalogFile, league: PitchCatalogFile[], venue: Venue = "all"): GoalDistribution {
  const matches = pickMatches(team.matches, venue);
  const opp = opponentGoals(team, league, venue);
  const scored: TimedGoal[] = [];
  const conceded: TimedGoal[] = [];
  let first = 0;
  let last = 0;
  for (const m of matches) {
    const ours = goalsFrom(m, true);
    const theirs = opp.get(m.id) ?? [];
    scored.push(...ours);
    conceded.push(...theirs);
    const timeline = [
      ...ours.map((g) => ({ minute: g.minute, ours: true })),
      ...theirs.map((g) => ({ minute: g.minute, ours: false })),
    ].sort((a, b) => a.minute - b.minute);
    if (!timeline.length) continue;
    if (timeline[0].ours) first += 1;
    if (timeline[timeline.length - 1].ours) last += 1;
  }

  const leagueScored: TimedGoal[] = [];
  const leagueConceded: TimedGoal[] = [];
  for (const f of league) {
    const d = buildRawGoals(f, league, venue);
    leagueScored.push(...d.scored);
    leagueConceded.push(...d.conceded);
  }

  return {
    matches: matches.length,
    scored: scored.length,
    conceded: conceded.length,
    officialGf: matches.reduce((s, m) => s + m.gf, 0),
    officialGa: matches.reduce((s, m) => s + m.ga, 0),
    scoredBins: bins(scored, leagueScored, false),
    concededBins: bins(conceded, leagueConceded, false),
    scoredHalves: bins(scored, leagueScored, true),
    concededHalves: bins(conceded, leagueConceded, true),
    play: scored.filter((g) => g.kind === "play").length,
    set: scored.filter((g) => g.kind === "set").length,
    box: scored.filter((g) => inBox(g.depth)).length,
    outside: scored.filter((g) => !inBox(g.depth)).length,
    first,
    last,
  };
}

function buildRawGoals(team: PitchCatalogFile, league: PitchCatalogFile[], venue: Venue) {
  const matches = pickMatches(team.matches, venue);
  const opp = opponentGoals(team, league, venue);
  const scored: TimedGoal[] = [];
  const conceded: TimedGoal[] = [];
  for (const m of matches) {
    scored.push(...goalsFrom(m, true));
    conceded.push(...(opp.get(m.id) ?? []));
  }
  return { scored, conceded };
}
