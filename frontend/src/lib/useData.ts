import { useEffect, useState } from "react";
import type { DataIndex, LeagueRoundData, MatchData } from "../types";

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

export function isStale(generatedAt: string | undefined, hours: number): boolean {
  if (!generatedAt) return false;
  const then = new Date(generatedAt).getTime();
  if (Number.isNaN(then)) return false;
  return Date.now() - then > hours * 3600 * 1000;
}
