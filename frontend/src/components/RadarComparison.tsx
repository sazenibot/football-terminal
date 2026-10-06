import { useMemo, useState } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import type { MatchData, RadarAverages, TeamBrief } from "../types";
import { Pill, Section } from "./ui";
import type { RadarView, RadarXgot } from "../lib/pitchMatch";

const KEYS: (keyof RadarAverages)[] = [
  "goals_for",
  "goals_against",
  "shots",
  "sot",
  "corners",
  "possession",
  "cards",
  "fouls_committed",
  "fouls_received",
];

// Orientační normalizační rozsahy (0-100 relativně), aby radar nebyl
// zkreslený tím, že góly jsou ~0-3 a držení míče ~30-70.
const RANGE: Record<string, [number, number]> = {
  goals_for: [0, 3.5],
  goals_against: [0, 3.5],
  shots: [5, 22],
  sot: [1, 10],
  corners: [2, 10],
  possession: [30, 70],
  cards: [0, 5],
  fouls_committed: [5, 20],
  fouls_received: [5, 20],
  xgot_for: [0, 2.5],
  xgot_against: [0, 2.5],
};

function normalize(key: string, value: number): number {
  const [min, max] = RANGE[key];
  return Math.max(0, Math.min(100, Math.round(((value - min) / (max - min)) * 100)));
}

export function RadarComparison({
  data,
  home,
  away,
  xgot,
}: {
  data: MatchData["radar"];
  home: TeamBrief;
  away: TeamBrief;
  xgot?: RadarXgot;
}) {
  const [view, setView] = useState<RadarView>("season");

  const dataset = data[view];
  const xgotView = xgot?.[view] ?? null;
  const hasData = !!dataset.home && !!dataset.away;
  const chartData = useMemo(() => {
    if (!hasData) return [];
    const base = KEYS.map((k, i) => ({
      metric: data.categories[i],
      home: normalize(k, dataset.home![k]),
      away: normalize(k, dataset.away![k]),
      homeRaw: dataset.home![k],
      awayRaw: dataset.away![k],
    }));
    if (!xgotView) return base;
    const extra = (["xgot_for", "xgot_against"] as const).map((k) => ({
      metric: k === "xgot_for" ? "xGOT" : "xGOT proti",
      home: normalize(k, xgotView.home[k]),
      away: normalize(k, xgotView.away[k]),
      homeRaw: xgotView.home[k],
      awayRaw: xgotView.away[k],
    }));
    return [base[0], extra[0], base[1], extra[1], ...base.slice(2)];
  }, [dataset, data.categories, hasData, xgotView]);

  return (
    <Section title="4. Radarové srovnání týmů">
      <div className="flex gap-2 mb-4 flex-wrap">
        <Pill active={view === "season"} onClick={() => setView("season")}>
          Letošní sezóna
        </Pill>
        <Pill active={view === "last5"} onClick={() => setView("last5")}>
          Posledních 5
        </Pill>
        <Pill active={view === "last3_h2h"} onClick={() => setView("last3_h2h")}>
          Poslední 3 vzájemné zápasy
        </Pill>
        <Pill active={view === "last3_h2h_home_venue"} onClick={() => setView("last3_h2h_home_venue")}>
          Poslední 3 vzájemné zápasy {home.name} doma
        </Pill>
      </div>
      {!hasData ? (
        <p className="text-slate-500 light:text-slate-400 text-sm py-8 text-center">
          Nedostatek dat — {home.name} nebyla v posledních vzájemných zápasech dostatečně často domácím týmem.
        </p>
      ) : (
        <>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={chartData}>
                <PolarGrid stroke="#232837" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
                <Radar name={home.name} dataKey="home" stroke="#34d399" fill="#34d399" fillOpacity={0.25} />
                <Radar name={away.name} dataKey="away" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
                <Legend />
                <Tooltip
                  contentStyle={{ background: "#12161f", border: "1px solid #232837" }}
                  formatter={(_value, name, entry: any) => {
                    const raw = name === home.name ? entry.payload.homeRaw : entry.payload.awayRaw;
                    return [raw, name];
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-slate-500 light:text-slate-400 mt-2">
            Hodnoty jsou normalizované 0–100 pro čitelnost grafu; skutečné hodnoty viz tooltip.
            {view === "last3_h2h_home_venue" && ` (n=${data.last3_h2h_home_venue.sample_size})`}
          </p>
          {xgot && (view === "last3_h2h" || view === "last3_h2h_home_venue") && (
            <p className="text-xs text-slate-500 light:text-slate-400 mt-1">
              {xgotView
                ? `xGOT z ${xgotView.home.n} ${xgotView.home.n === 1 ? "zápasu" : "zápasů"} z těchto vzájemných, starší a pohárové ho nemají.`
                : "xGOT u těchto vzájemných zápasů nemáme (starší sezony nebo pohár)."}
            </p>
          )}
        </>
      )}
    </Section>
  );
}
