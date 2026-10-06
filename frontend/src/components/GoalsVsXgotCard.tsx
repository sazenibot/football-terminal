import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MatchData, TeamBrief } from "../types";
import type { MatchRow, PitchCatalogFile } from "./PitchCards";
import { goalUnit } from "../lib/xgEfficiency";
import { XGOT_WINDOW, pickWindow, rowsBefore, type SideWindow } from "../lib/pitchMatch";
import { Pill, Section } from "./ui";

const GAP = 0.15;
const HOME_COLOR = "#34d399";
const AWAY_COLOR = "#f59e0b";

type Totals = {
  n: number;
  goals: number;
  xgot: number;
  against: number;
  xgotFaced: number;
  saves: number;
  sotFaced: number;
};

type Window = SideWindow;

const goalsOf = (r: MatchRow) => r.goals ?? r.gf;
const againstOf = (r: MatchRow) => r.goals_against ?? r.ga;

function totals(rows: MatchRow[]): Totals {
  return rows.reduce<Totals>(
    (t, r) => ({
      n: t.n + 1,
      goals: t.goals + goalsOf(r),
      xgot: t.xgot + r.xgot,
      against: t.against + againstOf(r),
      xgotFaced: t.xgotFaced + r.xgot_faced,
      saves: t.saves + r.saves,
      sotFaced: t.sotFaced + r.sot_faced,
    }),
    { n: 0, goals: 0, xgot: 0, against: 0, xgotFaced: 0, saves: 0, sotFaced: 0 },
  );
}

function x2(n: number): string {
  return n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

function windowLabel(w: Window): string {
  const n = w.rows.length;
  if (w.fallback) return `posledních ${n} ligových`;
  return `posledních ${n} ${w.atHome ? "doma" : "venku"}`;
}

function attackLine(team: string, w: Window, t: Totals): string {
  const head = `${team} v ${windowLabel(w)} dala ${t.goals} ${goalUnit(t.goals)} z ${x2(t.xgot)} xGOT`;
  const d = t.goals - t.xgot;
  if (d > GAP) return `${head}, výsledky jsou lepší, než střely na branku.`;
  if (d < -GAP) return `${head}, výsledky jsou horší, než střely na branku.`;
  return `${head}.`;
}

function keeperLine(t: Totals): string {
  const head = `V tom okně dostala ${t.against} ${goalUnit(t.against)} z ${x2(t.xgotFaced)} xGOT proti`;
  const d = t.xgotFaced - t.against;
  if (d > GAP) return `${head}, brankář je nad střelami.`;
  if (d < -GAP) return `${head}, brankář je pod střelami.`;
  return `${head}.`;
}

function savesLine(t: Totals): string {
  const saves = Math.round(t.saves);
  const sot = Math.round(t.sotFaced);
  return `${saves} ${plural(saves, "zákrok", "zákroky", "zákroků")} z ${sot} ${sot === 1 ? "střely" : "střel"} na branku`;
}

function Pair({ a, aLabel, b, bLabel }: { a: string; aLabel: string; b: string; bLabel: string }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-center">
      <div className="bg-slate-900/50 light:bg-slate-100 rounded-lg py-2">
        <div className="font-mono text-lg font-bold text-white light:text-slate-900">{a}</div>
        <div className="text-xs text-slate-500 light:text-slate-400">{aLabel}</div>
      </div>
      <div className="bg-slate-900/50 light:bg-slate-100 rounded-lg py-2">
        <div className="font-mono text-lg font-bold text-sky-400 light:text-sky-600">{b}</div>
        <div className="text-xs text-slate-500 light:text-slate-400">{bLabel}</div>
      </div>
    </div>
  );
}

function SideColumn({ team, label, w }: { team: TeamBrief; label: string; w: Window }) {
  const t = totals(w.rows);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {team.image && <img src={team.image} alt="" className="h-6 w-6 object-contain" />}
        <span className="font-semibold text-white light:text-slate-900">{team.name}</span>
        <span className="text-xs text-slate-500">
          {label} · {windowLabel(w)}
        </span>
      </div>
      {t.n === 0 ? (
        <p className="text-sm text-slate-400 light:text-slate-500">Zatím žádný ligový zápas této sezóny.</p>
      ) : (
        <>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Útok</div>
            <Pair a={String(t.goals)} aLabel="vstřelené góly" b={x2(t.xgot)} bLabel="xGOT" />
            <p className="text-sm text-slate-300 light:text-slate-700 mt-2">{attackLine(team.name, w, t)}</p>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Branka</div>
            <Pair a={x2(t.xgotFaced)} aLabel="xGOT proti" b={String(t.against)} bLabel="inkasované" />
            <p className="text-sm text-slate-300 light:text-slate-700 mt-2">{keeperLine(t)}</p>
            <p className="text-xs text-slate-500 mt-1">{savesLine(t)}</p>
          </div>
          {w.fallback && (
            <p className="text-xs text-amber-400/80 light:text-amber-700">
              Málo zápasů na téhle straně, beru posledních {XGOT_WINDOW}.
            </p>
          )}
        </>
      )}
    </div>
  );
}

type ChartMode = "attack" | "keeper";

type ChartPoint = { i: number; home?: number; away?: number; homeRow?: MatchRow; awayRow?: MatchRow };

function chartPoints(hw: Window, aw: Window, mode: ChartMode): ChartPoint[] {
  const len = Math.max(hw.rows.length, aw.rows.length);
  const value = (r: MatchRow | undefined) => (r ? (mode === "attack" ? r.xgot : r.xgot_faced) : undefined);
  return Array.from({ length: len }, (_, i) => {
    const homeRow = hw.rows[i - (len - hw.rows.length)];
    const awayRow = aw.rows[i - (len - aw.rows.length)];
    return { i: i + 1, home: value(homeRow), away: value(awayRow), homeRow, awayRow };
  });
}

function rowLine(r: MatchRow, mode: ChartMode): string {
  const day = new Date(r.date).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
  const vs = `${r.home ? "vs" : "@"} ${r.opponent}`;
  return mode === "attack"
    ? `${day} ${vs}: ${x2(r.xgot)} xGOT, ${goalsOf(r)} ${goalUnit(goalsOf(r))}`
    : `${day} ${vs}: ${x2(r.xgot_faced)} xGOT proti, ${againstOf(r)} inkas.`;
}

type TipProps = { active?: boolean; payload?: readonly { payload?: ChartPoint }[] };

function XgotTrend({ home, away, hw, aw }: { home: TeamBrief; away: TeamBrief; hw: Window; aw: Window }) {
  const [mode, setMode] = useState<ChartMode>("attack");
  const data = chartPoints(hw, aw, mode);
  if (!data.length) return null;
  const tip = ({ active, payload }: TipProps) => {
    const p = active ? payload?.[0]?.payload : undefined;
    if (!p) return null;
    return (
      <div className="rounded border border-slate-700 bg-[#12161f] px-3 py-2 text-xs space-y-1">
        {p.homeRow && <div style={{ color: HOME_COLOR }}>{home.name} · {rowLine(p.homeRow, mode)}</div>}
        {p.awayRow && <div style={{ color: AWAY_COLOR }}>{away.name} · {rowLine(p.awayRow, mode)}</div>}
      </div>
    );
  };
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <span className="text-xs text-slate-500">
          {home.name} {windowLabel(hw)} · {away.name} {windowLabel(aw)}
        </span>
        <div className="flex gap-2">
          <Pill active={mode === "attack"} onClick={() => setMode("attack")}>
            xGOT útoku
          </Pill>
          <Pill active={mode === "keeper"} onClick={() => setMode("keeper")}>
            xGOT proti
          </Pill>
        </div>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#232837" vertical={false} />
            <XAxis
              dataKey="i"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickFormatter={(i: number) => (i === data.length ? "poslední" : `${i - data.length}`)}
            />
            <YAxis
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              width={32}
              allowDecimals={false}
              domain={[0, (max: number) => Math.max(1, Math.ceil(max))]}
            />
            <Tooltip content={tip} />
            <Legend />
            <Line name={home.name} dataKey="home" stroke={HOME_COLOR} strokeWidth={2} dot={{ r: 3 }} />
            <Line name={away.name} dataKey="away" stroke={AWAY_COLOR} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-slate-500 mt-1">
        {mode === "attack"
          ? "xGOT útoku: kvalita střel týmu na branku v každém zápase okna."
          : "xGOT proti: kvalita střel, kterým čelil brankář týmu."}
      </p>
    </div>
  );
}

export function GoalsVsXgotCard({
  match,
  homeFile,
  awayFile,
}: {
  match: MatchData;
  homeFile: PitchCatalogFile | null;
  awayFile: PitchCatalogFile | null;
}) {
  if (!homeFile || !awayFile) return null;
  if (match.league_id && homeFile.league_id !== match.league_id) return null;

  const homeRows = rowsBefore(homeFile, match.starting_at);
  const awayRows = rowsBefore(awayFile, match.starting_at);
  const hw = pickWindow(homeRows, true);
  const aw = pickWindow(awayRows, false);

  return (
    <Section title="Góly proti xGOT" subtitle={`PitchAPI · ${homeFile.season}`}>
      <p className="text-sm text-slate-400 light:text-slate-500 mb-4">
        Útok domácích se v tomhle zápase potkává s brankou hostů, a naopak.
      </p>

      <h3 className="text-sm font-medium text-slate-300 light:text-slate-700 mb-3">Do zápasu</h3>
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <SideColumn team={match.home} label="domácí" w={hw} />
        <SideColumn team={match.away} label="hosté" w={aw} />
      </div>
      <XgotTrend home={match.home} away={match.away} hw={hw} aw={aw} />
    </Section>
  );
}
