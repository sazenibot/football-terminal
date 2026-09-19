import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { H2HMatch, TeamBrief, TeamMatchStats } from "../types";
import { Pill, Section } from "./ui";

const ROWS: { key: keyof TeamMatchStats; label: string }[] = [
  { key: "shots", label: "Střely celkem" },
  { key: "sot", label: "Střely na branku" },
  { key: "corners", label: "Rohy" },
  { key: "fouls", label: "Fauly" },
  { key: "yellow", label: "Žluté karty" },
  { key: "red", label: "Červené karty" },
  { key: "possession", label: "Držení míče (%)" },
];

function avg(nums: (number | null)[]): number | null {
  const vals = nums.filter((n): n is number => n !== null && n !== undefined);
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

// `home`/`away` v argumentech jsou fixní identity — domácí/hostující tým
// NADCHÁZEJÍCÍHO zápasu. V historických H2H zápasech ale kdokoli z nich
// mohl hrát doma i venku — proto trenéra "našeho" týmu dohledáváme podle
// is_home_team_at_home, ne podle aktuální pozice v tabulce.
function coachOfReferenceTeam(m: H2HMatch, isHomeReference: boolean): string | null {
  if (m.is_home_team_at_home) {
    return isHomeReference ? m.coach_home : m.coach_away;
  }
  return isHomeReference ? m.coach_away : m.coach_home;
}

export function H2HAggregateStats({
  h2h,
  home,
  away,
}: {
  h2h: H2HMatch[];
  home: TeamBrief;
  away: TeamBrief;
}) {
  const years = useMemo(
    () => Array.from(new Set(h2h.map((m) => new Date(m.date).getFullYear()))).sort((a, b) => b - a),
    [h2h]
  );
  const homeCoaches = useMemo(
    () => Array.from(new Set(h2h.map((m) => coachOfReferenceTeam(m, true)).filter((c): c is string => !!c))),
    [h2h]
  );
  const awayCoaches = useMemo(
    () => Array.from(new Set(h2h.map((m) => coachOfReferenceTeam(m, false)).filter((c): c is string => !!c))),
    [h2h]
  );

  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set());
  const [homeCoach, setHomeCoach] = useState<string>("all");
  const [awayCoach, setAwayCoach] = useState<string>("all");
  const [venueFilter, setVenueFilter] = useState<"all" | "home" | "away">("all");
  const [view, setView] = useState<"table" | "chart">("table");

  const toggleYear = (y: number) => {
    setSelectedYears((prev) => {
      const next = new Set(prev);
      if (next.has(y)) next.delete(y);
      else next.add(y);
      return next;
    });
  };

  const filtered = h2h.filter((m) => {
    if (selectedYears.size > 0 && !selectedYears.has(new Date(m.date).getFullYear())) return false;
    if (homeCoach !== "all" && coachOfReferenceTeam(m, true) !== homeCoach) return false;
    if (awayCoach !== "all" && coachOfReferenceTeam(m, false) !== awayCoach) return false;
    if (venueFilter === "home" && !m.is_home_team_at_home) return false;
    if (venueFilter === "away" && m.is_home_team_at_home) return false;
    return true;
  });

  const chartData = ROWS.map((row) => ({
    metric: row.label,
    [home.name]: avg(filtered.map((m) => m.team_home_stats[row.key])) ?? 0,
    [away.name]: avg(filtered.map((m) => m.team_away_stats[row.key])) ?? 0,
  }));

  return (
    <Section
      title="2. Souhrnná H2H statistika"
      subtitle={`${filtered.length} zápasů ve výběru`}
      note={`"${home.name}" a "${away.name}" = statistika daného týmu v konkrétním vzájemném zápase, ať už tehdy hrál doma nebo venku (ne obecné "domácí/hosté").`}
    >
      <div className="flex flex-col gap-3 mb-4 text-sm">
        <div className="flex gap-3 flex-wrap items-center">
          <span className="text-slate-500 light:text-slate-400 text-xs">Roky:</span>
          <div className="flex gap-1.5">
            {years.map((y) => (
              <Pill key={y} active={selectedYears.has(y)} onClick={() => toggleYear(y)}>
                {y}
              </Pill>
            ))}
            {selectedYears.size > 0 && (
              <button
                onClick={() => setSelectedYears(new Set())}
                className="text-xs text-slate-500 hover:text-slate-300 light:hover:text-slate-700 underline"
              >
                zrušit výběr
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-3 flex-wrap items-center">
          <span className="text-slate-500 light:text-slate-400 text-xs">Trenéři:</span>
          <select
            value={homeCoach}
            onChange={(e) => setHomeCoach(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 light:bg-white light:border-slate-300 light:text-slate-800"
          >
            <option value="all">Trenér {home.name} (všichni)</option>
            {homeCoaches.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={awayCoach}
            onChange={(e) => setAwayCoach(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 light:bg-white light:border-slate-300 light:text-slate-800"
          >
            <option value="all">Trenér {away.name} (všichni)</option>
            {awayCoaches.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-3 flex-wrap items-center">
          <div className="flex gap-2">
            <Pill active={venueFilter === "all"} onClick={() => setVenueFilter("all")}>
              Všechny
            </Pill>
            <Pill active={venueFilter === "home"} onClick={() => setVenueFilter("home")}>
              {home.name} doma
            </Pill>
            <Pill active={venueFilter === "away"} onClick={() => setVenueFilter("away")}>
              {home.name} venku
            </Pill>
          </div>
          <div className="flex gap-2 ml-auto">
            <Pill active={view === "table"} onClick={() => setView("table")}>
              Tabulka
            </Pill>
            <Pill active={view === "chart"} onClick={() => setView("chart")}>
              Graf
            </Pill>
          </div>
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="text-slate-500 light:text-slate-400 text-sm">Žádná data pro tento filtr.</p>
      ) : view === "table" ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 light:text-slate-500 text-left border-b border-slate-800 light:border-slate-200">
              <th className="py-1">Statistika (průměr/zápas)</th>
              <th className="py-1 text-right">{home.name}</th>
              <th className="py-1 text-right">{away.name}</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const homeAvg = avg(filtered.map((m) => m.team_home_stats[row.key]));
              const awayAvg = avg(filtered.map((m) => m.team_away_stats[row.key]));
              return (
                <tr key={row.key} className="border-b border-slate-900 light:border-slate-100">
                  <td className="py-1.5 text-slate-300 light:text-slate-700">{row.label}</td>
                  <td className="py-1.5 text-right font-mono light:text-slate-800">{homeAvg ?? "—"}</td>
                  <td className="py-1.5 text-right font-mono light:text-slate-800">{awayAvg ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid stroke="#232837" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <YAxis type="category" dataKey="metric" width={120} tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#12161f", border: "1px solid #232837" }} />
              <Legend />
              <Bar dataKey={home.name} fill="#34d399" radius={3} />
              <Bar dataKey={away.name} fill="#f59e0b" radius={3} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Section>
  );
}
