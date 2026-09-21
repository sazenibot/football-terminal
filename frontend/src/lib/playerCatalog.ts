import type { CatalogPlayerMatch, CatalogPlayerRole } from "../types";

export type SeasonKey = "all" | number;
export type Venue = "all" | "home" | "away";
export type Half = "all" | "autumn" | "spring";
export type ClubKey = "all" | "current" | number;
export type RankScope = "league" | "role";
export type ProfileGroup = "attack" | "defense" | "discipline";

export const SELECT =
  "mt-1 w-full rounded-lg border border-slate-700 bg-[#12161f] text-slate-100 text-sm px-3 py-2 light:bg-white light:border-slate-300 light:text-slate-800";

export const ROLE_LABEL: Record<CatalogPlayerRole, string> = {
  att: "Útočník",
  mid: "Záložník",
  def: "Obránce",
  gk: "Brankář",
};

export type PlayerStatDef = {
  key: string;
  label: string;
  group: ProfileGroup;
  higherBetter: boolean;
  per90: boolean;
  asPct?: boolean;
};

export const PLAYER_STATS: PlayerStatDef[] = [
  { key: "g", label: "Góly/90", group: "attack", higherBetter: true, per90: true },
  { key: "a", label: "Asistence/90", group: "attack", higherBetter: true, per90: true },
  { key: "sh", label: "Střely/90", group: "attack", higherBetter: true, per90: true },
  { key: "sot", label: "Na bránu/90", group: "attack", higherBetter: true, per90: true },
  { key: "kp", label: "Klíčové přihrávky/90", group: "attack", higherBetter: true, per90: true },
  { key: "dr", label: "Driblingy/90", group: "attack", higherBetter: true, per90: true },
  { key: "ps", label: "Proměněné penalty/90", group: "attack", higherBetter: true, per90: true },
  { key: "cr", label: "Centrující přihrávky/90", group: "attack", higherBetter: true, per90: true },
  { key: "dw", label: "Vyhrané souboje/90", group: "defense", higherBetter: true, per90: true },
  { key: "aw", label: "Vzdušné souboje/90", group: "defense", higherBetter: true, per90: true },
  { key: "tk", label: "Skluzy/90", group: "defense", higherBetter: true, per90: true },
  { key: "it", label: "Zachycené přihrávky/90", group: "defense", higherBetter: true, per90: true },
  { key: "cl", label: "Vyčištění/90", group: "defense", higherBetter: true, per90: true },
  { key: "sv", label: "Zákroky/90", group: "defense", higherBetter: true, per90: true },
  { key: "gc", label: "Obdržené/90", group: "defense", higherBetter: false, per90: true },
  { key: "cs", label: "Čistá konta %", group: "defense", higherBetter: true, per90: false, asPct: true },
  { key: "f", label: "Fauly/90", group: "discipline", higherBetter: false, per90: true },
  { key: "y", label: "Žluté/90", group: "discipline", higherBetter: false, per90: true },
  { key: "r", label: "Červené/90", group: "discipline", higherBetter: false, per90: true },
];

export const RADAR_AXES: Record<CatalogPlayerRole, string[]> = {
  att: ["g", "sh", "sot", "kp", "aw", "cr", "f"],
  mid: ["kp", "a", "sh", "cr", "dw", "tk", "f"],
  def: ["dw", "aw", "it", "cl", "tk", "f"],
  gk: ["sv", "gc", "cs", "cl", "aw", "f"],
};

export function filterMatches(
  rows: CatalogPlayerMatch[],
  season: SeasonKey,
  venue: Venue,
  half: Half,
  club: ClubKey,
  currentTeamId?: number | null,
) {
  return rows.filter((m) => {
    if (season !== "all" && m.s !== season) return false;
    if (venue === "home" && m.h !== 1) return false;
    if (venue === "away" && m.h !== 0) return false;
    const month = Number((m.d || "").slice(5, 7));
    if (half === "autumn" && month && month < 7) return false;
    if (half === "spring" && month && month >= 7) return false;
    if (club === "current" && currentTeamId && m.tid !== currentTeamId) return false;
    if (typeof club === "number" && m.tid !== club) return false;
    return true;
  });
}

export function minutesOf(rows: CatalogPlayerMatch[]) {
  return rows.reduce((s, m) => s + (m.st?.mn || 0), 0);
}

export function sumKey(rows: CatalogPlayerMatch[], key: string) {
  return rows.reduce((s, m) => s + (m.st?.[key] || 0), 0);
}

export function per90(total: number, minutes: number) {
  if (!minutes) return null;
  return Math.round((total / minutes) * 90 * 100) / 100;
}

export function metricValue(rows: CatalogPlayerMatch[], def: PlayerStatDef): number | null {
  if (!rows.length) return null;
  if (def.asPct) {
    return Math.round((100 * sumKey(rows, def.key)) / rows.length);
  }
  if (def.per90) return per90(sumKey(rows, def.key), minutesOf(rows));
  return sumKey(rows, def.key);
}

export function minuteThreshold(games: number) {
  return 0.2 * 90 * games;
}

export function gamesPerTeam(fixtureCount: number, teamCount = 16) {
  if (!fixtureCount || !teamCount) return 0;
  return (2 * fixtureCount) / teamCount;
}

export function rankDesc(value: number | null, pool: Array<number | null>, higherBetter: boolean) {
  const vals = pool.filter((v): v is number => v != null);
  if (value == null || !vals.length) return { rank: null as number | null, size: vals.length };
  const better = vals.filter((v) => (higherBetter ? v > value : v < value)).length;
  return { rank: better + 1, size: vals.length };
}

export type Badge = { emoji: string; label: string; tone: "value" | "warning" | "neutral" };

type BadgeRule = {
  id: string;
  emoji: string;
  label: string;
  tone: Badge["tone"];
  roles?: CatalogPlayerRole[];
  priority: number;
  test: (ctx: {
    rows: CatalogPlayerMatch[];
    role: CatalogPlayerRole;
    per90Of: (key: string) => number | null;
    pct: (key: string, higherBetter: boolean) => number | null;
    minutes: number;
    available: number;
  }) => boolean;
};

const BADGE_RULES: BadgeRule[] = [
  {
    id: "pen",
    emoji: "🎯",
    label: "Penaltový exekutor",
    tone: "value",
    priority: 10,
    test: ({ rows }) => sumKey(rows, "ps") >= 3,
  },
  {
    id: "shot",
    emoji: "🧤",
    label: "Shot-stopper",
    tone: "value",
    roles: ["gk"],
    priority: 9,
    test: ({ pct }) => (pct("sv", true) ?? 0) >= 80,
  },
  {
    id: "air",
    emoji: "🛡️",
    label: "Vzdušný duelist",
    tone: "value",
    roles: ["def", "att", "mid"],
    priority: 8,
    test: ({ pct }) => (pct("aw", true) ?? 0) >= 80,
  },
  {
    id: "box",
    emoji: "⚡",
    label: "Box threat",
    tone: "value",
    roles: ["att", "mid"],
    priority: 7,
    test: ({ pct }) => (pct("sh", true) ?? 0) >= 80 || (pct("g", true) ?? 0) >= 80,
  },
  {
    id: "create",
    emoji: "🎯",
    label: "Tvůrce šancí",
    tone: "value",
    roles: ["att", "mid"],
    priority: 6,
    test: ({ pct }) => (pct("kp", true) ?? 0) >= 80,
  },
  {
    id: "cards",
    emoji: "🛑",
    label: "Magnet na karty",
    tone: "warning",
    priority: 5,
    test: ({ pct }) => (pct("y", true) ?? 0) >= 80,
  },
  {
    id: "work",
    emoji: "🧱",
    label: "Workhorse",
    tone: "neutral",
    priority: 4,
    test: ({ minutes, available }) => available > 0 && minutes / available >= 0.8,
  },
];

export function badgesFor(
  rows: CatalogPlayerMatch[],
  role: CatalogPlayerRole,
  pool: CatalogPlayerMatch[][],
  availableMinutes: number,
): Badge[] {
  const minutes = minutesOf(rows);
  const per90Of = (key: string) => per90(sumKey(rows, key), minutes);
  const pct = (key: string, higherBetter: boolean) => {
    const mine = per90(sumKey(rows, key), minutes);
    const vals = pool
      .map((p) => per90(sumKey(p, key), minutesOf(p)))
      .filter((v): v is number => v != null);
    if (mine == null || vals.length < 5) return null;
    const beat = vals.filter((v) => (higherBetter ? v < mine : v > mine)).length;
    return Math.round((100 * beat) / (vals.length - 1));
  };
  return BADGE_RULES.filter((r) => (!r.roles || r.roles.includes(role)) && r.test({ rows, role, per90Of, pct, minutes, available: availableMinutes }))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3)
    .map((r) => ({ emoji: r.emoji, label: r.label, tone: r.tone }));
}

export function fdrBuckets(rows: CatalogPlayerMatch[]) {
  return {
    hard: rows.filter((m) => m.ob === 1),
    mid: rows.filter((m) => m.ob === 2),
    easy: rows.filter((m) => m.ob === 3),
  };
}

export function fmt(n: number | null | undefined, digits = 2) {
  if (n == null) return "—";
  return n.toLocaleString("cs-CZ", { maximumFractionDigits: digits });
}

export function seasonLabel(season: SeasonKey, seasons: { id: number; name?: string | null }[], current?: number | null) {
  if (season === "all") return "Všechny sezony";
  const name = seasons.find((s) => s.id === season)?.name;
  if (season === current) return "Tato sezona";
  return name || `Sezona ${season}`;
}

export function csMatches(n: number) {
  if (n === 1) return "zápas";
  if (n >= 2 && n <= 4) return "zápasy";
  return "zápasů";
}

export function rankTone(rank: number, size: number) {
  if (rank <= Math.max(1, Math.round(size * 0.2))) return "text-emerald-400 light:text-emerald-700";
  if (rank > size - Math.max(1, Math.round(size * 0.2))) return "text-rose-400 light:text-rose-700";
  return "text-amber-400 light:text-amber-700";
}

export function rankBar(rank: number, size: number) {
  if (rank <= Math.max(1, Math.round(size * 0.2))) return "bg-emerald-500";
  if (rank > size - Math.max(1, Math.round(size * 0.2))) return "bg-rose-500";
  return "bg-amber-400";
}
