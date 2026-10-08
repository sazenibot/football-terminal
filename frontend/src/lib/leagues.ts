/** Jediný seznam lig a jejich pořadí pro Match Center, Výsledky i katalog.
 *  Nová liga se přidá sem až po onboardingu (backfill) a zapnutí v scripts/config/leagues.json. */
export const LEAGUE_ORDER = [262, 8, 82, 564, 72] as const;

/** Nechá jen ligy ze sdíleného seznamu a seřadí je podle LEAGUE_ORDER. */
export function orderedLeagues<T extends { id: number }>(leagues: T[]): T[] {
  const rank = (id: number) => (LEAGUE_ORDER as readonly number[]).indexOf(id);
  return leagues.filter((l) => rank(l.id) >= 0).sort((a, b) => rank(a.id) - rank(b.id));
}
