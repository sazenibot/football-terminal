import { useEffect, useState } from "react";
import { getManualNews, type NewsItem } from "../content/content";
import { getLocale } from "../i18n/locale";

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

export type TipX = { k: "win" | "dc"; s: "h" | "a"; p: number };
export type TipOu = { k: "over" | "under"; /** čára, ve verzi 1 chybí a je 2,5 */ l?: number; p: number };
export type MatchTip = { x: TipX; ou?: TipOu | null };
export type TipCount = { n: number; hits: number };
export type TipSummary = {
  x12: TipCount & { win: TipCount; dc: TipCount };
  goals: TipCount & { by_line: Record<string, TipCount> };
};

export type BacktestMatch = {
  date: string;
  home: string;
  away: string;
  score: string;
  y: "home" | "draw" | "away";
  p: [number, number, number];
  tip?: MatchTip;
};

export type LiveBook = {
  since: string | null;
  locked: number;
  settled: number;
  upcoming: { fid: number; kickoff: string; home: string; away: string; locked_at: string }[];
  model?: { n: number; accuracy: number; logloss: number; brier: number };
  market?: { n: number; accuracy: number; logloss: number; brier: number };
  tips?: TipSummary;
  calibration?: CalibrationBin[];
  matches?: { kickoff: string; home: string; away: string; score: string; y: "home" | "draw" | "away" | "h" | "d" | "a"; p: [number, number, number]; tip?: MatchTip }[];
};

export type SeasonRef = { season: string; file: string; n: number; phase: "tuning" | "validation" | null };

/** Rozcestník stránky Výsledky: ligy, dostupné sezóny zpětného testu a živá kniha každé ligy. */
export type TrackRecord = {
  generated_at: string;
  model_version: string;
  default_league: number;
  leagues: { id: number; slug: string; name: string; seasons: SeasonRef[]; live: LiveBook }[];
};

/** Zpětný test jedné ligy a sezóny (track_record/{liga}/{sezóna}.json). */
export type Backtest = {
  season: string;
  league: string;
  slug: string;
  phase: "tuning" | "validation" | null;
  model_version?: string;
  method: string;
  n: number;
  from: string;
  to: string;
  actual_1x2: { home: number; draw: number; away: number };
  model: { n: number; accuracy: number; logloss: number; brier: number };
  baselines: { frequency_logloss: number; always_home_accuracy: number };
  calibration: CalibrationBin[];
  tips?: TipSummary | null;
  matches: BacktestMatch[];
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

export function useBacktest(slug: string, file: string | undefined) {
  const [state, setState] = useState<{ key: string; data: Backtest | null } | null>(null);
  const key = file ? `${slug}/${file}` : "";
  useEffect(() => {
    if (!key) return;
    let live = true;
    getJson<Backtest>(`/data/track_record/${key}.json`).then((d) => live && setState({ key, data: d }));
    return () => {
      live = false;
    };
  }, [key]);
  const ready = state?.key === key;
  return { data: ready ? state.data : null, loading: !!key && !ready };
}

/** Ruční aktuality ze souborů + automatické signály z dat, nejnovější první. */
export function useFeed() {
  const [auto, setAuto] = useState<NewsItem[]>([]);
  useEffect(() => {
    getJson<{ items: NewsItem[] }>("/data/feed_auto.json").then((d) => setAuto(d?.items ?? []));
  }, []);
  const en = getLocale() === "en";
  const localized = auto.map((i) => (en && i.en ? { ...i, ...i.en } : i));
  const items = [...getManualNews(), ...localized].sort((a, b) => b.date.localeCompare(a.date));
  return items;
}

export { fmtDate, fmtDateTime } from "../lib/format";
