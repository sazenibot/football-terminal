import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { PLAYER_STATS } from "../lib/playerCatalog";

export function CatalogPlayerRadar({
  a,
  b,
  avg,
  axes,
  nameA,
  nameB,
}: {
  a: Record<string, number | null>;
  b?: Record<string, number | null> | null;
  avg?: Record<string, number | null> | null;
  axes: string[];
  nameA: string;
  nameB?: string;
}) {
  const hasB = Boolean(b && nameB);
  const hasAvg = Boolean(avg);
  const labels = Object.fromEntries(PLAYER_STATS.map((s) => [s.key, s.label]));
  const better = Object.fromEntries(PLAYER_STATS.map((s) => [s.key, s.higherBetter]));
  const chartData = axes.map((key) => {
    const av = Number(a[key] ?? 0);
    const bv = Number(b?.[key] ?? 0);
    const lv = Number(avg?.[key] ?? 0);
    const higher = better[key] !== false;
    return {
      metric: labels[key] || key,
      a: toAxis(av, lv, higher),
      b: hasB ? toAxis(bv, lv, higher) : 0,
      avg: hasAvg ? toAxis(lv, lv, higher) : 0,
      aRaw: av,
      bRaw: bv,
      avgRaw: lv,
    };
  });

  return (
    <div>
      <div className="h-[420px] w-full min-h-[420px]">
        <ResponsiveContainer width="100%" height={420}>
          <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="68%">
            <PolarGrid stroke="#94a3b8" strokeOpacity={0.45} />
            <PolarAngleAxis dataKey="metric" tick={{ fill: "#64748b", fontSize: 11 }} />
            <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
            {hasAvg ? (
              <Radar
                name="avg"
                dataKey="avg"
                stroke="#64748b"
                fill="#64748b"
                fillOpacity={0.08}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                isAnimationActive={false}
              />
            ) : null}
            <Radar
              name="A"
              dataKey="a"
              stroke="#10b981"
              fill="#10b981"
              fillOpacity={0.28}
              strokeWidth={2}
              isAnimationActive={false}
            />
            {hasB ? (
              <Radar
                name="B"
                dataKey="b"
                stroke="#f59e0b"
                fill="#f59e0b"
                fillOpacity={0.22}
                strokeWidth={2}
                isAnimationActive={false}
              />
            ) : null}
            <Tooltip
              contentStyle={{ background: "#12161f", border: "1px solid #232837" }}
              formatter={(_value, name, entry: { payload?: { aRaw: number; bRaw: number; avgRaw: number } }) => {
                if (name === "avg") return [entry.payload?.avgRaw, "Ligový průměr"];
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
        {hasAvg ? (
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full border border-dashed border-slate-400" />
            Ligový průměr
          </li>
        ) : null}
      </ul>
      <p className="text-xs text-slate-500 mt-2">
        Ligový průměr je na ose uprostřed (50). Nadprůměr roste ven, podprůměr dovnitř. Tooltip ukazuje /90
        (čistá konta v %).
      </p>
    </div>
  );
}

function toAxis(value: number, avg: number, higherBetter: boolean) {
  if (!avg) return 50;
  const ratio = higherBetter ? value / avg : avg / Math.max(value, 0.01);
  return Math.max(0, Math.min(100, Math.round(ratio * 50)));
}
