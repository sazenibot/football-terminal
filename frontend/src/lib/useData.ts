import { useEffect, useState } from "react";
import type { PitchCatalogFile } from "../components/PitchCards";
import type { XgotIndex } from "./xgEfficiency";
import type { PitchH2HFile } from "./pitchMatch";
import type { PlayerTrendsFile } from "./playerTrends";
import type { SimV2 } from "../components/SimulationV2";
import type {
  CatalogExplorer,
  CatalogHub,
  CatalogPlayerDetail,
  CatalogPlayerIndex,
  CatalogRefereeDetail,
  CatalogTeamDetail,
  DataIndex,
  LeagueRoundData,
  UpcomingData,
  MatchData,
} from "../types";

/** Katalog (týmy, hráči, rozhodčí, historie) leží v R2, ne v gitu. Adresu dává VITE_CATALOG_BASE
    (produkce: https://data.football-terminal.com/catalog). Lokální vývoj bez ní čte veřejný bucket. */
const CATALOG = (
  (import.meta.env.VITE_CATALOG_BASE as string | undefined) ||
  (import.meta.env.DEV ? "https://data.football-terminal.com/catalog" : "/data/catalog")
).replace(/\/$/, "");

export class DataMissingError extends Error {
  constructor(url: string) {
    super(`missing:${url}`);
    this.name = "DataMissingError";
  }
}

function isJsonResponse(r: Response): boolean {
  return (r.headers.get("content-type") || "").includes("json");
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok || !isJsonResponse(r)) throw new DataMissingError(url);
  return r.json();
}

export function useDataIndex() {
  const [index, setIndex] = useState<DataIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<DataIndex>("/data/index.json")
      .then(setIndex)
      .catch((e) => setError(String(e)));
  }, []);

  return { index, error };
}

export function useLeagueRound(leagueId: number | null) {
  const [data, setData] = useState<LeagueRoundData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId) return;
    setData(null);
    setError(null);
    fetchJson<LeagueRoundData>(`/data/leagues/${leagueId}.json`)
      .then(setData)
      .catch((e) => setError(String(e)));
  }, [leagueId]);

  return { data, error };
}

/** Zápasy všech zapnutých lig v jednom malém souboru (pohled „Všechny zápasy“). */
export function useUpcoming(enabled = true) {
  const [data, setData] = useState<UpcomingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    fetchJson<UpcomingData>("/data/upcoming.json")
      .then(setData)
      .catch((e) => setError(String(e)));
  }, [enabled]);

  return { data, error };
}

export function useMatch(fixtureId: number | null) {
  const [match, setMatch] = useState<MatchData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!fixtureId) return;
    setMatch(null);
    setError(null);
    setMissing(false);
    fetch(`/data/matches/${fixtureId}.json`)
      .then((r) => {
        if (!r.ok || !isJsonResponse(r)) {
          setMissing(true);
          return null;
        }
        return r.json();
      })
      .then((payload) => {
        if (payload) setMatch(payload);
      })
      .catch((e) => setError(String(e)));
  }, [fixtureId]);

  return { match, error, missing };
}

export function useCatalogHub(leagueId: number | null) {
  const [data, setData] = useState<CatalogHub | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!leagueId) return;
    setData(null);
    setError(null);
    setMissing(false);
    fetchJson<CatalogHub>(`${CATALOG}/leagues/${leagueId}.json`)
      .then(setData)
      .catch((e) => {
        if (e instanceof DataMissingError) setMissing(true);
        else setError(String(e));
      });
  }, [leagueId]);

  return { data, error, missing };
}

function useCatalogEntity<T>(kind: "teams" | "players" | "referees", id: number | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id) return;
    setData(null);
    setError(null);
    setMissing(false);
    fetchJson<T>(`${CATALOG}/${kind}/${id}.json`)
      .then(setData)
      .catch((e) => {
        if (e instanceof DataMissingError) setMissing(true);
        else setError(String(e));
      });
  }, [kind, id]);

  return { data, error, missing };
}

export function useCatalogTeam(id: number | null) {
  return useCatalogEntity<CatalogTeamDetail>("teams", id);
}

/** Explorer všech zadaných lig najednou (detektor trendů). Chybějící soubor ligy se přeskočí. */
export function useCatalogExplorers(leagueIds: number[], enabled = true) {
  const key = leagueIds.join(",");
  const [data, setData] = useState<CatalogExplorer[] | null>(null);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }
    if (!leagueIds.length) {
      setData([]);
      return;
    }
    let live = true;
    setData(null);
    const bases = [...new Set([CATALOG, import.meta.env.DEV ? "/data/catalog" : ""])].filter(Boolean);
    Promise.all(
      leagueIds.map(async (id) => {
        for (const base of bases) {
          try {
            return await fetchJson<CatalogExplorer>(`${base}/leagues/${id}.explorer.json`);
          } catch {
            /* zkus další adresu */
          }
        }
        return null;
      }),
    ).then((rows) => {
      if (live) setData(rows.filter((row): row is CatalogExplorer => row != null));
    });
    return () => {
      live = false;
    };
  }, [key, enabled]);

  return data;
}

export function useCatalogExplorer(leagueId: number | null) {
  const [data, setData] = useState<CatalogExplorer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!leagueId) return;
    setData(null);
    setError(null);
    setMissing(false);
    fetchJson<CatalogExplorer>(`${CATALOG}/leagues/${leagueId}.explorer.json`)
      .then(setData)
      .catch((e) => {
        if (e instanceof DataMissingError) setMissing(true);
        else setError(String(e));
      });
  }, [leagueId]);

  return { data, error, missing };
}

export function useCatalogPlayer(id: number | null) {
  return useCatalogEntity<CatalogPlayerDetail>("players", id);
}

/** Zápasy hráčů jednoho shardu (id hráče % 32). Stránka hráče nestahuje celý ligový index. */
export const PLAYER_SHARDS = 32;

export function usePlayerShard(leagueId: number | null, playerId: number | null) {
  return useOptionalJson<CatalogPlayerIndex>(leagueId && playerId ? `${CATALOG}/player_matches/${leagueId}/${playerId % PLAYER_SHARDS}.json` : null);
}

/** Souhrny hráčů ligy pro vybranou sezónu: buňky "doma/venku.podzim/jaro", řádek = [id, role, tým, zápasy, ...POOL_KEYS]. */
export type PlayerPool = {
  league_id: number;
  season: string;
  games: number;
  keys: string[];
  cells: Record<string, number[][]>;
};

export function usePlayerPool(leagueId: number | null, season: number | "all" | null) {
  return useOptionalJson<PlayerPool>(leagueId && season != null ? `${CATALOG}/player_pools/${leagueId}/${season}.json` : null);
}

export function useCatalogReferee(id: number | null) {
  return useCatalogEntity<CatalogRefereeDetail>("referees", id);
}

export type CatalogDirectoryLeague = {
  id: number;
  name: string;
  country?: string | null;
  logo?: string | null;
  season?: string | null;
  teams: number;
  players: number;
  referees: number;
  /** Plný katalog = statistiky týmů a hráčů. Jinak jen soupisky a základní profily. */
  full: boolean;
};

export type CatalogSearchIndex = {
  cdn: string;
  leagues: { id: number; name: string; logo?: string | null }[];
  teams: [number, string, number, string | null][];
  players: [number, string, number, number | null, string | null, string | null, number | null, string | null][];
  referees: [number, string, number, string | null, number | null][];
};

export function useCatalogDirectory() {
  return useOptionalJson<{ leagues: CatalogDirectoryLeague[] }>(`${CATALOG}/directory.json`);
}

/** Index pro fulltext přes všechny ligy. Stahuje se až když ho někdo potřebuje (první psaní do hledání). */
export function useCatalogSearchIndex(enabled: boolean) {
  return useOptionalJson<CatalogSearchIndex>(enabled ? `${CATALOG}/search.json` : null);
}

export function useXgotIndex() {
  const [data, setData] = useState<XgotIndex | null>(null);

  useEffect(() => {
    fetchJson<XgotIndex>("/data/lab/xgot-efficiency.json")
      .then(setData)
      .catch(() => setData(null));
  }, []);

  return data;
}

export function usePitchTeam(id: number | null) {
  return useOptionalJson<PitchCatalogFile>(id ? `${CATALOG}/pitch/teams/${id}.json` : null);
}

type PitchIndexTeam = { league_id?: number };

/** Pitch týmy. `leagueId` vybere jednu ligu; `null` po startu nic; `"all"` všechny zapnuté ligy. */
export function usePitchLeague(leagueId: number | "all" | null) {
  const [files, setFiles] = useState<PitchCatalogFile[] | null>(null);

  useEffect(() => {
    if (leagueId == null) {
      setFiles(null);
      return;
    }
    let live = true;
    const bases = [...new Set([CATALOG, import.meta.env.DEV ? "/data/catalog" : ""])].filter(Boolean);
    (async () => {
      for (const base of bases) {
        try {
          const idx = await fetchJson<{ league_id?: number; teams: Record<string, PitchIndexTeam> }>(`${base}/pitch/index.json`);
          const ids = Object.entries(idx.teams || {})
            .filter(([, row]) => {
              if (leagueId === "all") return true;
              const lid = row?.league_id ?? idx.league_id;
              return lid == null || lid === leagueId;
            })
            .map(([id]) => id);
          if (!ids.length) continue;
          const loaded = await Promise.all(ids.map((id) => fetchJson<PitchCatalogFile>(`${base}/pitch/teams/${id}.json`)));
          if (live) setFiles(loaded);
          return;
        } catch {
          /* zkus další adresu */
        }
      }
      if (live) setFiles(null);
    })();
    return () => {
      live = false;
    };
  }, [leagueId]);

  return files;
}

export function usePitchPlayer(id: number | null) {
  return useOptionalJson<PitchCatalogFile>(id ? `${CATALOG}/pitch/players/${id}.json` : null);
}

export function useSimV2(fixtureId: number | null) {
  return useOptionalJson<SimV2>(fixtureId ? `/data/sim/${fixtureId}.json` : null);
}

export function usePlayerTrends(leagueId: number | null | undefined) {
  return useOptionalJson<PlayerTrendsFile>(leagueId ? `/data/player_trends/${leagueId}.json` : null);
}

export function usePitchH2H(enabled = true) {
  return useOptionalJson<PitchH2HFile>(enabled ? `${CATALOG}/pitch/h2h.json` : null);
}

function useOptionalJson<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    if (!url) {
      setData(null);
      return;
    }
    let cancelled = false;
    setData(null);
    fetchJson<T>(url)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return data;
}

export function isStale(generatedAt: string | undefined, hours: number): boolean {
  if (!generatedAt) return false;
  const then = new Date(generatedAt).getTime();
  if (Number.isNaN(then)) return false;
  return Date.now() - then > hours * 3600 * 1000;
}

/** Zápasy ligy po sezónách a průměrné fauly / karty týmů (kontext pro stránku rozhodčího). */
export type LeagueUniverseBucket = { m?: number; n?: number; f?: number; fa?: number; y?: number; ya?: number; nya?: number; r?: number; ra?: number };
export type LeagueUniverse = {
  league_id: number;
  seasons: Record<string, { total: number; teams: Record<string, { home: LeagueUniverseBucket; away: LeagueUniverseBucket }> }>;
};

export function useLeagueUniverse(leagueId: number | null) {
  return useOptionalJson<LeagueUniverse>(leagueId ? `${CATALOG}/leagues/${leagueId}.ref_universe.json` : null);
}

/** Primární barvy týmů z log (scripts/build_team_colors.py). Jeden malý soubor, načte se jednou. */
let teamColorsPromise: Promise<Record<string, string>> | null = null;

export function useTeamColors(): Record<string, string> {
  const [colors, setColors] = useState<Record<string, string>>({});
  useEffect(() => {
    teamColorsPromise ??= fetchJson<Record<string, string>>("/data/team_colors.json").catch(() => ({}));
    let live = true;
    teamColorsPromise.then((c) => live && setColors(c));
    return () => {
      live = false;
    };
  }, []);
  return colors;
}
