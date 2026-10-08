import type { PitchCatalogFile } from "../components/PitchCards";
import type { CatalogExplorer, CatalogExplorerMatch, CatalogExplorerTeam, UpcomingFixture } from "../types";

export const TD_WINDOWS = ["season", "3", "5"] as const;
export type TdWindow = (typeof TD_WINDOWS)[number];

export const TD_VENUES = ["all", "home", "away"] as const;
export type TdVenue = (typeof TD_VENUES)[number];

export const TD_PRESETS = ["hot", "unlucky", "lucky", "corners", "away_fouls"] as const;
export type TdPreset = (typeof TD_PRESETS)[number];

export const TD_SORTS = ["team", "played", "shots", "sot", "corners", "cornersAg", "fouls", "foulsWon", "xgot", "trend"] as const;
export type TdSort = (typeof TD_SORTS)[number];

export type TdTrend = {
  metric: "shots" | "sot" | "corners" | "fouls";
  pct: number;
  n: number;
};

export type TdRow = {
  teamId: number;
  name: string;
  short: string;
  image: string | null;
  leagueId: number;
  leagueName: string;
  leagueShort: string;
  country: string | null;
  played: number;
  shots: number | null;
  sot: number | null;
  corners: number | null;
  cornersAg: number | null;
  fouls: number | null;
  foulsWon: number | null;
  goals: number | null;
  xgot: number | null;
  /** xGOT − góly na zápas. Kladné = smolař. */
  delta: number | null;
  trend: TdTrend | null;
  nextHome: boolean | null;
  pass: Record<TdPreset, boolean>;
};

const TREND_MIN_N = 3;
const TREND_MIN_PCT = 15;

function mean(values: Array<number | null | undefined>): number | null {
  const clean = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!clean.length) return null;
  return Math.round((clean.reduce((a, b) => a + b, 0) / clean.length) * 100) / 100;
}

function matchKey(teamId: number, m: CatalogExplorerMatch): string {
  return `${teamId}|${m.d}|${m.h}|${m.gf}|${m.ga}`;
}

function inVenue(m: CatalogExplorerMatch, venue: TdVenue): boolean {
  if (venue === "home") return !!m.h;
  if (venue === "away") return !m.h;
  return true;
}

function chrono(rows: CatalogExplorerMatch[]): CatalogExplorerMatch[] {
  return [...rows].sort((a, b) => a.d.localeCompare(b.d));
}

function seasonRows(rows: CatalogExplorerMatch[], seasonId: number | undefined): CatalogExplorerMatch[] {
  return rows.filter((m) => seasonId == null || m.s == null || m.s === seasonId);
}

function windowOf(rows: CatalogExplorerMatch[], seasonId: number | undefined, venue: TdVenue, win: TdWindow): CatalogExplorerMatch[] {
  const season = seasonRows(rows, seasonId).filter((m) => inVenue(m, venue));
  const ordered = chrono(season);
  if (win === "3") return ordered.slice(-3);
  if (win === "5") return ordered.slice(-5);
  return ordered;
}

export function pairCornersAgainst(teams: CatalogExplorerTeam[], seasonId: number | undefined): Map<string, number> {
  const byDate = new Map<string, { teamId: number; m: CatalogExplorerMatch }[]>();
  for (const team of teams) {
    for (const m of team.matches || []) {
      if (seasonId != null && m.s != null && m.s !== seasonId) continue;
      const list = byDate.get(m.d) ?? [];
      list.push({ teamId: team.id, m });
      byDate.set(m.d, list);
    }
  }
  const out = new Map<string, number>();
  for (const rows of byDate.values()) {
    const used = new Set<number>();
    for (let i = 0; i < rows.length; i++) {
      if (used.has(i)) continue;
      const a = rows[i];
      const j = rows.findIndex((b, k) => !used.has(k) && k !== i && b.m.h !== a.m.h && b.m.gf === a.m.ga && b.m.ga === a.m.gf);
      if (j < 0) continue;
      used.add(i);
      used.add(j);
      const b = rows[j];
      if (b.m.c != null) out.set(matchKey(a.teamId, a.m), b.m.c);
      if (a.m.c != null) out.set(matchKey(b.teamId, b.m), a.m.c);
    }
  }
  return out;
}

type PitchDot = { date: string; home: boolean; xgot: number };

function pitchIndex(files: PitchCatalogFile[] | null | undefined): Map<number, PitchDot[]> {
  const map = new Map<number, PitchDot[]>();
  for (const file of files ?? []) {
    const id = file.team?.id;
    if (id == null) continue;
    map.set(
      id,
      file.matches.map((m) => ({ date: m.date, home: m.home, xgot: m.xgot })),
    );
  }
  return map;
}

function xgotFor(
  dots: PitchDot[] | undefined,
  rows: CatalogExplorerMatch[],
  complete = false,
): { xgot: number | null; goals: number | null } {
  if (!rows.length) return { xgot: null, goals: null };
  const goals = mean(rows.map((r) => r.gf));
  if (!dots?.length) return { xgot: null, goals };
  const xg: number[] = [];
  for (const m of rows) {
    const hit = dots.find((d) => d.date === m.d && d.home === !!m.h);
    if (hit) xg.push(hit.xgot);
  }
  if (complete && xg.length !== rows.length) return { xgot: null, goals };
  return { xgot: xg.length ? mean(xg) : null, goals };
}

function trendOf(windowRows: CatalogExplorerMatch[], seasonAll: CatalogExplorerMatch[]): TdTrend | null {
  if (windowRows.length < TREND_MIN_N || seasonAll.length < TREND_MIN_N) return null;
  const candidates: TdTrend[] = [];
  const push = (metric: TdTrend["metric"], recent: Array<number | null | undefined>, season: Array<number | null | undefined>) => {
    const w = mean(recent);
    const s = mean(season);
    if (w == null || s == null || s <= 0) return;
    const pct = ((w - s) / s) * 100;
    if (Math.abs(pct) >= TREND_MIN_PCT) candidates.push({ metric, pct, n: windowRows.length });
  };
  push("shots", windowRows.map((r) => r.sh), seasonAll.map((r) => r.sh));
  push("sot", windowRows.map((r) => r.sot), seasonAll.map((r) => r.sot));
  push("corners", windowRows.map((r) => r.c), seasonAll.map((r) => r.c));
  push("fouls", windowRows.map((r) => r.f), seasonAll.map((r) => r.f));
  if (!candidates.length) return null;
  return candidates.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0] ?? null;
}

function last3(rows: CatalogExplorerMatch[], seasonId: number | undefined, venue: TdVenue): CatalogExplorerMatch[] {
  return windowOf(rows, seasonId, venue, "3");
}

function presetFlags(last: CatalogExplorerMatch[], lastAway: CatalogExplorerMatch[], xgotLast: number | null, goalsLast: number | null): Record<TdPreset, boolean> {
  const has3 = last.length === 3;
  const hot = has3 && last.every((m) => m.gf > m.ga) && last.every((m) => m.sot != null && m.sot >= 5);
  const xgOk = has3 && xgotLast != null && goalsLast != null;
  const unlucky = xgOk && xgotLast - goalsLast > 0.5;
  const lucky = xgOk && goalsLast - xgotLast > 0.5;
  const corners = has3 && last.every((m) => m.c != null && m.c > 6);
  const away_fouls = lastAway.length === 3 && lastAway.every((m) => m.f != null && m.of != null && m.f > m.of);
  return { hot, unlucky, lucky, corners, away_fouls };
}

export type TdLeagueMeta = {
  id: number;
  name: string;
  short: string;
  country: string | null;
  logo?: string | null;
};

export function nextHomeByTeam(fixtures: UpcomingFixture[] | undefined): Map<number, boolean> {
  const map = new Map<number, boolean>();
  const ordered = [...(fixtures ?? [])].sort((a, b) => a.starting_at.localeCompare(b.starting_at));
  for (const fx of ordered) {
    if (!map.has(fx.home.id)) map.set(fx.home.id, true);
    if (!map.has(fx.away.id)) map.set(fx.away.id, false);
  }
  return map;
}

export function buildTrendRows(
  explorers: CatalogExplorer[],
  leagues: TdLeagueMeta[],
  pitch: PitchCatalogFile[] | null | undefined,
  window: TdWindow,
  venue: TdVenue,
  nextHome: Map<number, boolean>,
): TdRow[] {
  const xgotMap = pitchIndex(pitch);
  const rows: TdRow[] = [];
  for (const explorer of explorers) {
    const meta = leagues.find((l) => l.id === explorer.league_id);
    if (!meta) continue;
    const seasonId = explorer.season_id;
    const against = pairCornersAgainst(explorer.teams, seasonId);
    for (const team of explorer.teams) {
      const all = team.matches || [];
      const seasonAll = windowOf(all, seasonId, venue, "season");
      const slice = windowOf(all, seasonId, venue, window);
      if (!slice.length) continue;
      const last = last3(all, seasonId, "all");
      const lastAway = last3(all, seasonId, "away");
      const xg = xgotFor(xgotMap.get(team.id), slice);
      const xgLast = xgotFor(xgotMap.get(team.id), last, true);
      const trendSample = window === "season" ? windowOf(all, seasonId, venue, "5") : slice;
      const delta = xg.xgot != null && xg.goals != null ? Math.round((xg.xgot - xg.goals) * 100) / 100 : null;
      rows.push({
        teamId: team.id,
        name: team.name,
        short: team.short || team.name,
        image: team.image ?? null,
        leagueId: explorer.league_id,
        leagueName: meta.name,
        leagueShort: meta.short,
        country: meta.country,
        played: slice.length,
        shots: mean(slice.map((r) => r.sh)),
        sot: mean(slice.map((r) => r.sot)),
        corners: mean(slice.map((r) => r.c)),
        cornersAg: mean(slice.map((r) => against.get(matchKey(team.id, r)) ?? null)),
        fouls: mean(slice.map((r) => r.f)),
        foulsWon: mean(slice.map((r) => r.of)),
        goals: xg.goals,
        xgot: xgotMap.has(team.id) ? xg.xgot : null,
        delta: xgotMap.has(team.id) ? delta : null,
        trend: trendOf(trendSample, seasonAll),
        nextHome: nextHome.get(team.id) ?? null,
        pass: presetFlags(last, lastAway, xgLast.xgot, xgLast.goals),
      });
    }
  }
  return rows;
}

export function sortTdRows(rows: TdRow[], sort: TdSort, dir: "asc" | "desc"): TdRow[] {
  const sign = dir === "asc" ? 1 : -1;
  const val = (r: TdRow): number | string | null => {
    switch (sort) {
      case "team":
        return r.name;
      case "played":
        return r.played;
      case "shots":
        return r.shots;
      case "sot":
        return r.sot;
      case "corners":
        return r.corners;
      case "cornersAg":
        return r.cornersAg;
      case "fouls":
        return r.fouls;
      case "foulsWon":
        return r.foulsWon;
      case "xgot":
        return r.delta;
      case "trend":
        return r.trend?.pct ?? null;
    }
  };
  return [...rows].sort((a, b) => {
    const av = val(a);
    const bv = val(b);
    if (av == null && bv == null) return a.name.localeCompare(b.name, "cs");
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string" && typeof bv === "string") return sign * av.localeCompare(bv, "cs");
    return sign * (Number(av) - Number(bv)) || a.name.localeCompare(b.name, "cs");
  });
}

export function presetQuery(preset: TdPreset): { window: TdWindow; venue: TdVenue; sort: TdSort; dir: "asc" | "desc" } {
  if (preset === "hot") return { window: "3", venue: "all", sort: "sot", dir: "desc" };
  if (preset === "unlucky") return { window: "3", venue: "all", sort: "xgot", dir: "desc" };
  if (preset === "lucky") return { window: "3", venue: "all", sort: "xgot", dir: "asc" };
  if (preset === "corners") return { window: "3", venue: "all", sort: "corners", dir: "desc" };
  return { window: "3", venue: "away", sort: "fouls", dir: "desc" };
}

export function parseTdWindow(v: string | null): TdWindow {
  return TD_WINDOWS.includes(v as TdWindow) ? (v as TdWindow) : "season";
}
export function parseTdVenue(v: string | null): TdVenue {
  return TD_VENUES.includes(v as TdVenue) ? (v as TdVenue) : "all";
}
export function parseTdPreset(v: string | null): TdPreset | null {
  return TD_PRESETS.includes(v as TdPreset) ? (v as TdPreset) : null;
}
export function parseTdSort(v: string | null): TdSort {
  return TD_SORTS.includes(v as TdSort) ? (v as TdSort) : "shots";
}
export function parseTdDir(v: string | null): "asc" | "desc" {
  return v === "asc" ? "asc" : "desc";
}

export function parseTdPage(v: string | null): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}
