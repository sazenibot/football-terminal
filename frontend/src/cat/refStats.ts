import type { LeagueUniverse } from "../lib/useData";
import type { CatalogRefereeMatch } from "../types";

/* Součty faulů a karet po stranách: "for" = tým sám, "against" = soupeř týmu.
   Stejný tvar pro zápasy rozhodčího i pro celou ligu, takže jde odečíst a spočítat "ostatní rozhodčí". */

export type Field = "f" | "fa" | "y" | "ya" | "r" | "ra";
export type Cell = { s: number; n: number };
export type Agg = { m: number } & Record<Field, Cell>;
export type Venue = "home" | "away";
export type Metric = "fouls" | "yellow" | "red";

export const METRICS: Record<Metric, { label: string; own: Field; opp: Field }> = {
  fouls: { label: "Fauly", own: "f", opp: "fa" },
  yellow: { label: "Žluté karty", own: "y", opp: "ya" },
  red: { label: "Červené karty", own: "r", opp: "ra" },
};

export const emptyAgg = (): Agg => ({ m: 0, f: { s: 0, n: 0 }, fa: { s: 0, n: 0 }, y: { s: 0, n: 0 }, ya: { s: 0, n: 0 }, r: { s: 0, n: 0 }, ra: { s: 0, n: 0 } });

const pair = (v?: Array<number | null> | null): [number, number] | null => (v && v.length === 2 && v[0] != null && v[1] != null ? [v[0], v[1]] : null);

/** Zápasy rozhodčího pohledem jednoho týmu (nebo všech týmů, když `teamId` chybí) a strany hřiště. */
export function refAgg(rows: CatalogRefereeMatch[], venue: Venue, teamId?: number): Agg {
  const out = emptyAgg();
  for (const m of rows) {
    // jeden tým: jen zápasy, kde hrál na dané straně; bez týmu: každý zápas jednou za každou stranu
    if (teamId != null && (venue === "home" ? m.hid : m.aid) !== teamId) continue;
    const idx = venue === "home" ? 0 : 1;
    const fouls = pair(m.st?.fouls);
    const yellow = pair(m.st?.yellow);
    const red = pair(m.st?.red) ?? (fouls || yellow ? ([0, 0] as [number, number]) : null);
    out.m += 1;
    const put = (own: Field, opp: Field, p: [number, number] | null) => {
      if (!p) return;
      out[own].s += p[idx];
      out[own].n += 1;
      out[opp].s += p[1 - idx];
      out[opp].n += 1;
    };
    put("f", "fa", fouls);
    put("y", "ya", yellow);
    put("r", "ra", red);
  }
  return out;
}

/** Součty celé ligy v daných sezónách (jeden tým, nebo všechny týmy). */
export function universeAgg(u: LeagueUniverse | null | undefined, seasonIds: number[], venue: Venue, teamId?: number): Agg {
  const out = emptyAgg();
  if (!u) return out;
  for (const sid of seasonIds) {
    const se = u.seasons[String(sid)];
    if (!se) continue;
    const teams = teamId == null ? Object.values(se.teams) : se.teams[String(teamId)] ? [se.teams[String(teamId)]] : [];
    for (const t of teams) {
      const b = t[venue];
      out.m += b.m ?? 0;
      const n = b.n ?? 0;
      const nya = b.nya ?? 0;
      out.f.s += b.f ?? 0; out.f.n += n;
      out.fa.s += b.fa ?? 0; out.fa.n += n;
      out.y.s += b.y ?? 0; out.y.n += n;
      out.ya.s += b.ya ?? 0; out.ya.n += nya;
      out.r.s += b.r ?? 0; out.r.n += n;
      out.ra.s += b.ra ?? 0; out.ra.n += nya;
    }
  }
  return out;
}

export const avg = (c: Cell): number | null => (c.n > 0 ? c.s / c.n : null);

/** Průměr ostatních rozhodčích = liga bez zápasů tohoto rozhodčího. Při malém zbytku vrací null. */
export function othersAvg(all: Agg, own: Agg, field: Field, minN = 3): number | null {
  const n = all[field].n - own[field].n;
  if (n < minN) return null;
  const s = all[field].s - own[field].s;
  return s < 0 ? null : s / n;
}


/** Počet odehraných kol sezóny = nejvíc zápasů, které stihl některý tým. Rozhodčí smí pískat nejvýš jeden zápas za kolo. */
export function roundsPlayed(u: LeagueUniverse | null | undefined, seasonIds: number[]): number {
  if (!u) return 0;
  let total = 0;
  for (const sid of seasonIds) {
    const teams = Object.values(u.seasons[String(sid)]?.teams ?? {});
    total += teams.reduce((mx, t) => Math.max(mx, (t.home.m ?? 0) + (t.away.m ?? 0)), 0);
  }
  return total;
}

/** Domácí a venkovní zápasy týmu dohromady. */
export function combineAgg(a: Agg, b: Agg): Agg {
  const out = emptyAgg();
  out.m = a.m + b.m;
  for (const k of ["f", "fa", "y", "ya", "r", "ra"] as const) {
    out[k] = { s: a[k].s + b[k].s, n: a[k].n + b[k].n };
  }
  return out;
}
