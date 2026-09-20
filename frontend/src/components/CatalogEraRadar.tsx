import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { RadarAverages } from "../types";

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

const LABELS = [
  "Vstřelené góly",
  "Obdržené góly",
  "Střely celkem",
  "Střely na branku",
  "Rohy",
  "Držení míče (%)",
  "Karty",
  "Fauly způsobené",
  "Fauly získané",
];

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

export function CatalogEraRadar({
  a,
  b,
  nameA,
  nameB,
}: {
  a: RadarAverages;
  b?: RadarAverages | null;
  nameA: string;
  nameB?: string;
}) {
  const hasB = Boolean(b && nameB);
  const chartData = KEYS.map((k, i) => ({
    metric: LABELS[i],
    a: normalize(k, Number(a[k] ?? 0)),
    b: hasB ? normalize(k, Number(b?.[k] ?? 0)) : 0,
    aRaw: Number(a[k] ?? 0),
    bRaw: Number(b?.[k] ?? 0),
  }));

  return (
    <div>
      <div className="h-[420px] w-full min-h-[420px]">
        <ResponsiveContainer width="100%" height={420}>
          <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="68%">
            <PolarGrid stroke="#94a3b8" strokeOpacity={0.45} />
            <PolarAngleAxis dataKey="metric" tick={{ fill: "#64748b", fontSize: 11 }} />
            <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
            <Radar
              name="A"
              dataKey="a"
              stroke="#10b981"
              fill="#10b981"
              fillOpacity={0.35}
              strokeWidth={2}
              isAnimationActive={false}
            />
            {hasB ? (
              <Radar
                name="B"
                dataKey="b"
                stroke="#f59e0b"
                fill="#f59e0b"
                fillOpacity={0.28}
                strokeWidth={2}
                isAnimationActive={false}
              />
            ) : null}
            <Tooltip
              contentStyle={{ background: "#12161f", border: "1px solid #232837" }}
              formatter={(_value, name, entry: { payload?: { aRaw: number; bRaw: number } }) => {
                const raw = name === "A" ? entry.payload?.aRaw : entry.payload?.bRaw;
                return [raw, name === "A" ? nameA : nameB || "B"];
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-400">
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          {nameA}
        </li>
        {hasB && nameB ? (
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            {nameB}
          </li>
        ) : null}
      </ul>
      <p className="text-xs text-slate-500 mt-2">
        Hodnoty jsou normalizované 0–100 pro čitelnost grafu; skutečné hodnoty viz tooltip. Stejná osa jako Match
        detail.
      </p>
    </div>
  );
}
