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
};

function normalize(key: string, value: number): number {
  const [min, max] = RANGE[key];
  return Math.max(0, Math.min(100, Math.round(((value - min) / (max - min)) * 100)));
}

export function RadarComparison({
  data,
  home,
  away,
}: {
  data: MatchData["radar"];
  home: TeamBrief;
  away: TeamBrief;
}) {
  const [view, setView] = useState<"season" | "last5" | "last3_h2h" | "last3_h2h_home_venue">("season");

  const dataset = data[view];
  const hasData = !!dataset.home && !!dataset.away;
  const chartData = useMemo(() => {
    if (!hasData) return [];
    return KEYS.map((k, i) => ({
      metric: data.categories[i],
      home: normalize(k, dataset.home![k]),
      away: normalize(k, dataset.away![k]),
      homeRaw: dataset.home![k],
      awayRaw: dataset.away![k],
    }));
  }, [dataset, data.categories, hasData]);

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
        </>
      )}
    </Section>
  );
}
