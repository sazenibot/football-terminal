import { useEffect, useState } from "react";
import { manualNews, type NewsItem } from "../content/content";

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export type CalibrationBin = { lo: number; hi: number; n: number; predicted: number; actual: number };

export type BacktestMatch = { date: string; home: string; away: string; score: string; y: "home" | "draw" | "away"; p: [number, number, number] };

export type TrackRecord = {
  generated_at: string;
  league: string;
  live: {
    since: string;
    locked: number;
    settled: number;
    upcoming: { fid: number; kickoff: string; home: string; away: string; locked_at: string }[];
    model?: { n: number; accuracy: number; logloss: number; brier: number };
    market?: { n: number; accuracy: number; logloss: number; brier: number };
    matches?: { date: string; home: string; away: string; score: string; y: string; p: number[]; q?: number[] }[];
  };
  backtest: {
    season: string;
    league: string;
    method: string;
    n: number;
    from: string;
    to: string;
    actual_1x2: { home: number; draw: number; away: number };
    model: { n: number; accuracy: number; logloss: number; brier: number };
    baselines: { frequency_logloss: number; always_home_accuracy: number };
    calibration: CalibrationBin[];
    matches: BacktestMatch[];
  };
};

export function useTrackRecord() {
  const [data, setData] = useState<TrackRecord | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    getJson<TrackRecord>("/data/track_record.json").then((d) => {
      setData(d);
      setDone(true);
    });
  }, []);
  return { data, done };
}

/** Ruční aktuality ze souborů + automatické signály z dat, nejnovější první. */
export function useFeed() {
  const [auto, setAuto] = useState<NewsItem[]>([]);
  useEffect(() => {
    getJson<{ items: NewsItem[] }>("/data/feed_auto.json").then((d) => setAuto(d?.items ?? []));
  }, []);
  const items = [...manualNews, ...auto].sort((a, b) => b.date.localeCompare(a.date));
  return items;
}

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
