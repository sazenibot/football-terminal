import type { CatalogPlayerMatch, CatalogPlayerRole } from "../types";
import { intlTag, t, type Key } from "../i18n/locale";

export type SeasonKey = "all" | number;
export type Venue = "all" | "home" | "away";
export type Half = "all" | "autumn" | "spring";
export type ClubKey = "all" | "current" | number;
export type RankScope = "league" | "role";
export type ProfileGroup = "attack" | "defense" | "discipline";

export const SELECT =
  "mt-1 w-full rounded-lg border border-slate-700 bg-[#12161f] text-slate-100 text-sm px-3 py-2 light:bg-white light:border-slate-300 light:text-slate-800";

/* Štítky jsou getter, ať se překládají až při čtení (ne při importu modulu). */
export const ROLE_LABEL: Record<CatalogPlayerRole, string> = {
  get att() {
    return t("ct.role.att");
  },
  get mid() {
    return t("ct.role.mid");
  },
  get def() {
    return t("ct.role.def");
  },
  get gk() {
    return t("ct.role.gk");
  },
};

/** Přípona procent za číslem: česky " %", anglicky "%". */
export const pctSuffix = () => t("fmt.pct", { n: "" });

export type PlayerStatDef = {
  key: string;
  label: string;
  group: ProfileGroup;
  higherBetter: boolean;
  per90: boolean;
  asPct?: boolean;
};

type StatKey = "g" | "a" | "sh" | "sot" | "kp" | "dr" | "ps" | "cr" | "dw" | "aw" | "tk" | "it" | "cl" | "sv" | "gc" | "cs" | "f" | "y" | "r";

/* Štítek je getter, ať se přeloží až při čtení (ne při importu modulu). */
const stat = (key: StatKey, rest: Omit<PlayerStatDef, "key" | "label">): PlayerStatDef => ({
  key,
  get label() {
    return t(`ct.stat.${key}`);
  },
  ...rest,
});

export const PLAYER_STATS: PlayerStatDef[] = [
  stat("g", { group: "attack", higherBetter: true, per90: true }),
  stat("a", { group: "attack", higherBetter: true, per90: true }),
  stat("sh", { group: "attack", higherBetter: true, per90: true }),
  stat("sot", { group: "attack", higherBetter: true, per90: true }),
  stat("kp", { group: "attack", higherBetter: true, per90: true }),
  stat("dr", { group: "attack", higherBetter: true, per90: true }),
  stat("ps", { group: "attack", higherBetter: true, per90: true }),
  stat("cr", { group: "attack", higherBetter: true, per90: true }),
  stat("dw", { group: "defense", higherBetter: true, per90: true }),
  stat("aw", { group: "defense", higherBetter: true, per90: true }),
  stat("tk", { group: "defense", higherBetter: true, per90: true }),
  stat("it", { group: "defense", higherBetter: true, per90: true }),
  stat("cl", { group: "defense", higherBetter: true, per90: true }),
  stat("sv", { group: "defense", higherBetter: true, per90: true }),
  stat("gc", { group: "defense", higherBetter: false, per90: true }),
  stat("cs", { group: "defense", higherBetter: true, per90: false, asPct: true }),
  stat("f", { group: "discipline", higherBetter: false, per90: true }),
  stat("y", { group: "discipline", higherBetter: false, per90: true }),
  stat("r", { group: "discipline", higherBetter: false, per90: true }),
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
    // souhrnný řádek z poolu nese počet zápasů v "_n", obyčejné řádky se prostě počítají
    return Math.round((100 * sumKey(rows, def.key)) / (sumKey(rows, "_n") || rows.length));
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
  label: Key;
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
    label: "ct.badge.pen",
    tone: "value",
    priority: 10,
    test: ({ rows }) => sumKey(rows, "ps") >= 3,
  },
  {
    id: "shot",
    emoji: "🧤",
    label: "ct.badge.shot",
    tone: "value",
    roles: ["gk"],
    priority: 9,
    test: ({ pct }) => (pct("sv", true) ?? 0) >= 80,
  },
  {
    id: "air",
    emoji: "🛡️",
    label: "ct.badge.air",
    tone: "value",
    roles: ["def", "att", "mid"],
    priority: 8,
    test: ({ pct }) => (pct("aw", true) ?? 0) >= 80,
  },
  {
    id: "box",
    emoji: "⚡",
    label: "ct.badge.box",
    tone: "value",
    roles: ["att", "mid"],
    priority: 7,
    test: ({ pct }) => (pct("sh", true) ?? 0) >= 80 || (pct("g", true) ?? 0) >= 80,
  },
  {
    id: "create",
    emoji: "🎯",
    label: "ct.badge.create",
    tone: "value",
    roles: ["att", "mid"],
    priority: 6,
    test: ({ pct }) => (pct("kp", true) ?? 0) >= 80,
  },
  {
    id: "cards",
    emoji: "🛑",
    label: "ct.badge.cards",
    tone: "warning",
    priority: 5,
    test: ({ pct }) => (pct("y", true) ?? 0) >= 80,
  },
  {
    id: "work",
    emoji: "🧱",
    label: "ct.badge.work",
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
    .map((r) => ({ emoji: r.emoji, label: t(r.label), tone: r.tone }));
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
  return n.toLocaleString(intlTag(), { maximumFractionDigits: digits });
}

export function seasonLabel(season: SeasonKey, seasons: { id: number; name?: string | null }[], current?: number | null) {
  if (season === "all") return t("ct.season.all");
  const name = seasons.find((s) => s.id === season)?.name;
  if (season === current) return t("ct.season.current");
  return name || t("ct.season.n", { n: season });
}

export function csMatches(n: number) {
  return t("ct.matchWord", { n });
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

/* ---------- souhrny hráčů z poolu ---------- */

/** Pořadí sloupců v řádku poolu, musí sedět s KEYS v scripts/catalog_player_shards.py. */
export const POOL_KEYS = ["mn", "g", "a", "sh", "sot", "kp", "dr", "ps", "cr", "dw", "aw", "tk", "it", "cl", "sv", "gc", "cs", "f", "y", "r"] as const;
const POOL_ROLES: CatalogPlayerRole[] = ["att", "mid", "def", "gk"];

export type PoolPlayer = { id: number; role: CatalogPlayerRole; teamId: number; rows: CatalogPlayerMatch[] };

/** Řádek poolu jako jediný "zápas" se součty. Díky tomu fungují stejné funkce jako pro zápasy hráče. */
export function poolPlayer(row: number[]): PoolPlayer {
  const st: Record<string, number> = { _n: row[3] };
  POOL_KEYS.forEach((key, i) => {
    st[key] = row[4 + i] ?? 0;
  });
  return { id: row[0], role: POOL_ROLES[row[1]] ?? "mid", teamId: row[2], rows: [{ st } as unknown as CatalogPlayerMatch] };
}
