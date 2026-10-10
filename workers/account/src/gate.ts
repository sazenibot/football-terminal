export type Tier = "anon" | "account" | "pro" | "unlimited";

export type Access = {
  tier: Tier;
  freeFixture: number | null;
  userId: string | null;
};

const RANK: Record<Tier, number> = { anon: 0, account: 1, pro: 2, unlimited: 3 };

export function tierRank(tier: Tier): number {
  return RANK[tier] ?? 0;
}

export function isFuture(startingAt: string, nowMs = Date.now()): boolean {
  const t = Date.parse(startingAt);
  return Number.isFinite(t) && t > nowMs;
}

export function canSeeListProbs(tier: Tier): boolean {
  return tier === "unlimited";
}

/** Detail a Přehled jsou zdarma — JSON zápasu jde všem. */
export function canOpenMatch(_access: Access, _fixtureId: number, _startingAt: string, _nowMs = Date.now()): boolean {
  return true;
}

/** Simulace v2 je v záložce Predikce (od účtu). */
export function canSeeSim(access: Access): boolean {
  return tierRank(access.tier) >= RANK.account;
}

export function shouldAutoClaim(access: Access, startingAt: string, nowMs = Date.now()): boolean {
  return Boolean(access.userId) && access.tier === "account" && access.freeFixture == null && isFuture(startingAt, nowMs);
}

export function matchShell(m: Record<string, unknown>): Record<string, unknown> {
  const home = m.home && typeof m.home === "object" ? (m.home as Record<string, unknown>) : {};
  const away = m.away && typeof m.away === "object" ? (m.away as Record<string, unknown>) : {};
  return {
    fixture_id: m.fixture_id,
    league_id: m.league_id ?? null,
    league_name: m.league_name ?? null,
    starting_at: m.starting_at,
    venue: m.venue ?? null,
    home: { id: home.id ?? 0, name: home.name ?? "", image: home.image ?? null },
    away: { id: away.id ?? 0, name: away.name ?? "", image: away.image ?? null },
    gated: true,
  };
}

function stripFixtureProbs(item: Record<string, unknown>): void {
  const signals = item.signals;
  if (signals && typeof signals === "object" && signals !== null && "probs" in signals) {
    delete (signals as Record<string, unknown>).probs;
  }
}

/** 1X2 ve výpisu (upcoming / kolo ligy) jen Unlimited. */
export function stripListProbs<T>(data: T): T {
  const clone = structuredClone(data) as T & { fixtures?: unknown; round?: unknown };
  if (Array.isArray(clone.fixtures)) {
    for (const item of clone.fixtures) {
      if (item && typeof item === "object") stripFixtureProbs(item as Record<string, unknown>);
    }
  }
  if (Array.isArray(clone.round)) {
    for (const item of clone.round) {
      if (item && typeof item === "object") stripFixtureProbs(item as Record<string, unknown>);
    }
  }
  return clone;
}
