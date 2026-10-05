import type { H2HMatch, TeamBrief, TeamMatchStats, TrendItem } from "../types";

export type H2hScope = "match" | "home" | "away";

type SideFacts = {
  gf: number;
  ga: number;
  shots: number;
  sot: number;
  corners: number;
  oppCorners: number;
  fouls: number;
  yellow: number;
  oppYellow: number;
  red: number;
  oppRed: number;
};

function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function statsOf(s: TeamMatchStats | undefined): TeamMatchStats {
  return s || { shots: 0, sot: 0, corners: 0, fouls: 0, possession: null, yellow: 0, red: 0 };
}

function sideFacts(row: H2HMatch, upcomingHome: boolean): SideFacts {
  const mine = statsOf(upcomingHome ? row.team_home_stats : row.team_away_stats);
  const opp = statsOf(upcomingHome ? row.team_away_stats : row.team_home_stats);
  const wasHome = upcomingHome ? row.is_home_team_at_home : !row.is_home_team_at_home;
  const gf = wasHome ? num(row.home_score) : num(row.away_score);
  const ga = wasHome ? num(row.away_score) : num(row.home_score);
  return {
    gf,
    ga,
    shots: num(mine.shots),
    sot: num(mine.sot),
    corners: num(mine.corners),
    oppCorners: num(opp.corners),
    fouls: num(mine.fouls),
    yellow: num(mine.yellow),
    oppYellow: num(opp.yellow),
    red: num(mine.red),
    oppRed: num(opp.red),
  };
}

function bestOver(values: number[]): { t: number; hits: number; total: number } | null {
  const n = values.length;
  if (!n) return null;
  let best: { t: number; hits: number; total: number } | null = null;
  const thresholds = [...new Set(values.map((v) => v - 0.5))].sort((a, b) => a - b);
  for (const t of thresholds) {
    const hits = values.filter((v) => v > t).length;
    if (hits / n >= 0.8) best = { t, hits, total: n };
  }
  return best;
}

function bestUnder(values: number[]): { t: number; hits: number; total: number } | null {
  const n = values.length;
  if (!n) return null;
  let best: { t: number; hits: number; total: number } | null = null;
  const thresholds = [...new Set(values.map((v) => v + 0.5))].sort((a, b) => b - a);
  for (const t of thresholds) {
    const hits = values.filter((v) => v < t).length;
    if (hits / n >= 0.8) best = { t, hits, total: n };
  }
  return best;
}

function lineLabel(n: number): string {
  return String(n).replace(".", ",");
}

function item(key: string, label: string, hits: number, total: number): TrendItem {
  return { key, label, hits, total, pct: total ? Math.round((1000 * hits) / total) / 10 : 0 };
}

function matchTrends(rows: H2HMatch[]): TrendItem[] {
  const n = rows.length;
  if (!n) return [];
  const totals = rows.map((r) => {
    const home = statsOf(r.team_home_stats);
    const away = statsOf(r.team_away_stats);
    return {
      goals: num(r.home_score) + num(r.away_score),
      btts: num(r.home_score) > 0 && num(r.away_score) > 0,
      corners: num(home.corners) + num(away.corners),
      yellow: num(home.yellow) + num(away.yellow),
      red: num(home.red) + num(away.red),
    };
  });
  const out: TrendItem[] = [
    item("btts", "Oba týmy skórovaly (BTTS)", totals.filter((t) => t.btts).length, n),
    item("over15", "Over 1.5 gólů v zápase", totals.filter((t) => t.goals > 1.5).length, n),
    item("over25", "Over 2.5 gólů v zápase", totals.filter((t) => t.goals > 2.5).length, n),
    item("under25", "Under 2.5 gólů v zápase", totals.filter((t) => t.goals < 2.5).length, n),
    item("corners_over95", "Over 9.5 rohů v zápase (oba týmy)", totals.filter((t) => t.corners > 9.5).length, n),
    item("corners_under95", "Under 9.5 rohů v zápase (oba týmy)", totals.filter((t) => t.corners < 9.5).length, n),
    item("yellow_under5", "Méně než 5 žlutých v zápase (oba týmy)", totals.filter((t) => t.yellow < 5).length, n),
    item("yellow_5plus", "5+ žlutých v zápase (oba týmy)", totals.filter((t) => t.yellow >= 5).length, n),
    item("red_card", "Padla červená karta (kterýkoli tým)", totals.filter((t) => t.red > 0).length, n),
  ];
  out.sort((a, b) => b.pct - a.pct);
  return out;
}

function teamTrends(rows: H2HMatch[], teamName: string, upcomingHome: boolean): TrendItem[] {
  const facts = rows.map((r) => sideFacts(r, upcomingHome));
  const n = facts.length;
  if (!n) return [];
  const out: TrendItem[] = [
    item("clean_sheet", `${teamName}: čisté konto`, facts.filter((f) => f.ga === 0).length, n),
    item("scoreless", `${teamName} nevstřelil gól`, facts.filter((f) => f.gf === 0).length, n),
    item("scored2plus", `${teamName} vstřelil 2+ gólů`, facts.filter((f) => f.gf >= 2).length, n),
    item("more_corners", `${teamName} měl víc rohů než soupeř`, facts.filter((f) => f.corners > f.oppCorners).length, n),
    item("team_2plus_yellow", `${teamName} dostal 2+ žluté`, facts.filter((f) => f.yellow >= 2).length, n),
  ];
  const metrics: Array<[keyof SideFacts, string, string]> = [
    ["shots", "shots", "střely"],
    ["sot", "sot", "střely na branku"],
    ["fouls", "fouls", "fauly"],
  ];
  for (const [field, key, label] of metrics) {
    const values = facts.map((f) => f[field] as number);
    const over = bestOver(values);
    const under = bestUnder(values);
    if (over) {
      out.push(item(`${key}_over`, `${teamName}: ${label} ${lineLabel(over.t)}+`, over.hits, over.total));
    }
    if (under) {
      out.push(item(`${key}_under`, `${teamName}: ${label} méně než ${lineLabel(under.t)}`, under.hits, under.total));
    }
  }
  out.sort((a, b) => b.pct - a.pct);
  return out;
}

function withOdds(items: TrendItem[], source: TrendItem[] | undefined): TrendItem[] {
  if (!source?.length) return items;
  const map = new Map(source.map((t) => [t.key, t.odds]));
  return items.map((t) => {
    const odds = map.get(t.key);
    return odds == null ? t : { ...t, odds };
  });
}

export function buildH2hTrends(
  h2h: H2HMatch[],
  home: TeamBrief,
  away: TeamBrief,
  scope: H2hScope,
  window: 3 | 5,
  stored?: TrendItem[],
): TrendItem[] {
  const rows = h2h.slice(0, window);
  const items =
    scope === "match" ? matchTrends(rows) : teamTrends(rows, scope === "home" ? home.name : away.name, scope === "home");
  return withOdds(items, stored);
}
