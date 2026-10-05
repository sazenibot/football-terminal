import type { MatchData, MatchFacts, TeamBrief } from "../types";

export const TRENDMETR_METRICS = [
  { key: "shots", short: "Střely", name: "Střely" },
  { key: "sot", short: "Na branku", name: "Střely na branku" },
  { key: "corners", short: "Rohy", name: "Rohy získané" },
  { key: "fouls", short: "Fauly", name: "Fauly způsobené" },
  { key: "offsides", short: "Ofsajdy", name: "Ofsajdy" },
] as const;

export type TrendmetrMetricKey = (typeof TRENDMETR_METRICS)[number]["key"];

export type TrendmetrSide = {
  team: TeamBrief;
  role: "doma" | "venku";
  lines: Partial<Record<TrendmetrMetricKey, number>>;
};

function needHits(n: number, ratio: number): number {
  return Math.ceil(ratio * n - 1e-9);
}

function maxFloor(values: number[], ratio = 0.7): number | null {
  const vals = values.filter((v) => Number.isFinite(v)).map((v) => Math.trunc(v));
  if (!vals.length) return null;
  const need = needHits(vals.length, ratio);
  const ordered = [...vals].sort((a, b) => a - b);
  return ordered[vals.length - need] ?? null;
}

function andLine(a: number[], b: number[]): number | null {
  if (a.length && b.length) {
    const la = maxFloor(a);
    const lb = maxFloor(b);
    if (la == null || lb == null) return null;
    return Math.min(la, lb);
  }
  return maxFloor(a.length ? a : b);
}

function metricOf(row: MatchFacts, key: TrendmetrMetricKey): number | null {
  const v = row[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function sample(rows: MatchFacts[], key: TrendmetrMetricKey): number[] {
  return rows.map((r) => metricOf(r, key)).filter((v): v is number => v != null);
}

function leagueRows(facts: MatchFacts[], fixtureId: number): MatchFacts[] {
  return facts.filter((r) => r.is_league_match && r.fixture_id !== fixtureId);
}

function vsOpponent(rows: MatchFacts[], opponentName: string): MatchFacts[] {
  const n = opponentName.trim().toLowerCase();
  return rows.filter((r) => (r.opponent || "").trim().toLowerCase() === n).slice(0, 3);
}

export function overLabel(line: number): string {
  return `${String(line - 0.5).replace(".", ",")}+`;
}

export function teamShort(name: string): string {
  const words = name
    .replace(/\./g, "")
    .split(/\s+/)
    .filter((w) => !/^(fc|fk|sk|ac|mfk)$/i.test(w));
  if (!words.length) return name.slice(0, 3).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

export function buildTrendmetr(match: MatchData): TrendmetrSide[] {
  const fid = match.fixture_id;
  const homeAll = leagueRows(match.form.home.recent_all || match.form.home.matches || [], fid);
  const awayAll = leagueRows(match.form.away.recent_all || match.form.away.matches || [], fid);

  const homeA = homeAll.filter((r) => r.is_home).slice(0, 5);
  const homeB = vsOpponent(homeAll.filter((r) => r.is_home), match.away.name);
  const awayA = awayAll.filter((r) => !r.is_home).slice(0, 5);
  const awayB = vsOpponent(awayAll.filter((r) => !r.is_home), match.home.name);

  const sides: { team: TeamBrief; role: "doma" | "venku"; a: MatchFacts[]; b: MatchFacts[] }[] = [
    { team: match.home, role: "doma", a: homeA, b: homeB },
    { team: match.away, role: "venku", a: awayA, b: awayB },
  ];

  return sides.map((side) => {
    const lines: TrendmetrSide["lines"] = {};
    for (const col of TRENDMETR_METRICS) {
      const line = andLine(sample(side.a, col.key), sample(side.b, col.key));
      if (line != null && line >= 1) lines[col.key] = line;
    }
    return { team: side.team, role: side.role, lines };
  });
}
