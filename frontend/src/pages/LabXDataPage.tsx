import { useEffect, useMemo, useState } from "react";
import { Link } from "../i18n/router";
import { intlTag } from "../i18n/locale";

type Side = "home" | "away";
type Cell = number | string | null;

type Team = {
  name: string;
  short: string;
  image: string | null;
  formation: string;
  coach: string | null;
};

type Shot = {
  player: string;
  team: Side;
  minute: number;
  x: number;
  y: number;
  depth: number;
  xg: number;
  xgot: number | null;
  on_target: boolean;
  inside_box: boolean;
  result: string;
  situation: string;
  body: string;
  goal: boolean;
  goal_y: number | null;
  goal_z: number | null;
};

type Half = {
  home: number | null;
  away: number | null;
  home_1h: number | null;
  away_1h: number | null;
  home_2h: number | null;
  away_2h: number | null;
};

type XData = {
  source: string;
  note: string;
  league: string;
  match: {
    id: string;
    date: string;
    round: string;
    season: string;
    stadium: string | null;
    referee: string | null;
    score: { home: number; away: number };
    home: Team;
    away: Team;
  };
  xg: Half;
  xgot: Half;
  npxg: { home: number | null; away: number | null };
  xg_open: { home: number | null; away: number | null };
  xg_set: { home: number | null; away: number | null };
  goals: {
    minute: number;
    added: number;
    side: Side;
    player: string | null;
    penalty: boolean;
  }[];
  keepers: Record<Side, { name: string | null; xgot_faced: number | null; goals_conceded: number; goals_prevented: number; saves: number | null }>;
  shots: Shot[];
  players: {
    name: string;
    team: Side;
    minutes: number | null;
    xg: number;
    goals: number;
    shots: number;
    chances: number;
    touches_box: number;
    assists: number;
  }[];
  extras: { key: string; label: string; group: string; home: Cell; away: Cell }[];
  advanced: { label: string; home: number | null; away: number | null }[];
  heatmap: {
    grid: { length: number; width: number };
    teams: { side: Side; actions: number; cells: [number, number, number][] }[];
  };
};

type ShotFilter = "all" | "goal" | "on_target" | "xgot";

const RESULT_CS: Record<string, string> = {
  goal: "gól",
  save: "zákrok",
  miss: "mimo",
  post: "tyč",
};

function fmt(n: number | null | undefined, d = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(intlTag(), { minimumFractionDigits: d, maximumFractionDigits: d });
}

function cellText(value: Cell): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : fmt(value);
  return value;
}

function czDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${Number(d)}. ${Number(m)}. ${y}`;
}

export function LabXDataPage() {
  const [data, setData] = useState<XData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ShotFilter>("all");
  const [hover, setHover] = useState<Shot | null>(null);
  const [heatSide, setHeatSide] = useState<Side>("home");

  useEffect(() => {
    fetch("/data/lab/xdata-slavia-plzen.json")
      .then((r) => {
        if (!r.ok) throw new Error("Soubor xData chybí.");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  const visibleShots = useMemo(() => {
    if (!data) return [];
    return data.shots.filter((s) => {
      if (filter === "goal") return s.goal;
      if (filter === "on_target") return s.on_target;
      if (filter === "xgot") return (s.xgot || 0) > 0;
      return true;
    });
  }, [data, filter]);

  if (error) {
    return (
      <div className="max-w-5xl mx-auto py-16 px-4 pt-20 text-rose-400">
        <Link to="/lab" className="text-amber-400 text-sm">
          ← Lab
        </Link>
        <p className="mt-4">{error}</p>
      </div>
    );
  }
  if (!data) {
    return <p className="max-w-5xl mx-auto py-16 px-4 pt-20 text-slate-400 light:text-slate-500">Načítám xData…</p>;
  }

  const { match, xg, xgot, npxg } = data;
  const penalty = data.goals.find((g) => g.penalty);
  const mouth = data.shots.filter((s) => (s.xgot || 0) > 0 || s.goal || s.result === "post");

  return (
    <div className="max-w-5xl mx-auto py-12 px-4 pt-20 flex flex-col gap-6">
      <Link to="/lab" className="text-amber-400 text-sm w-fit">
        ← Lab
      </Link>

      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-400">Lab · prvek 02</p>
        <h1 className="text-3xl font-bold text-white light:text-slate-900 mt-1">xData</h1>
        <p className="text-sm text-slate-400 light:text-slate-500 mt-1">
          {match.home.name} – {match.away.name} · {data.league} · {match.round}. kolo · {czDate(match.date)}
        </p>
        <p className="mt-3 text-sm text-slate-300 light:text-slate-600 max-w-2xl">{data.note}</p>
        <p className="mt-1 text-[11px] font-mono text-slate-400 light:text-slate-500">
          {data.source} {match.id} · {match.season} · {match.stadium}
        </p>
      </header>

      <article className="card p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <TeamBlock team={match.home} align="left" />
          <div className="text-center">
            <p className="text-3xl font-bold tabular-nums text-white light:text-slate-900">
              {match.score.home}:{match.score.away}
            </p>
            <p className="text-[11px] text-slate-400 light:text-slate-500 mt-1">
              xG {fmt(xg.home)} – {fmt(xg.away)} · xGOT {fmt(xgot.home)} – {fmt(xgot.away)}
            </p>
          </div>
          <TeamBlock team={match.away} align="right" />
        </div>
        <p className="mt-4 text-sm text-slate-300 light:text-slate-600">
          {match.home.formation} / {match.away.formation}. {match.home.coach} a {match.away.coach}. Sudí {match.referee}.
          {penalty
            ? ` Penalta ${penalty.minute}${penalty.added ? `+${penalty.added}` : ""}′ ${penalty.player}, bez ní je npxG ${fmt(npxg.home)}–${fmt(npxg.away)}.`
            : ""}
        </p>
      </article>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="xG"
          home={xg.home}
          away={xg.away}
          sub={`1. poločas ${fmt(xg.home_1h)}–${fmt(xg.away_1h)} · 2. ${fmt(xg.home_2h)}–${fmt(xg.away_2h)}`}
        />
        <MetricCard
          label="xGOT"
          home={xgot.home}
          away={xgot.away}
          sub={`1. poločas ${fmt(xgot.home_1h)}–${fmt(xgot.away_1h)} · 2. ${fmt(xgot.home_2h)}–${fmt(xgot.away_2h)}`}
        />
        <MetricCard label="npxG" home={npxg.home} away={npxg.away} hint="bez penalt" />
        <MetricCard
          label="xG hra / standardka"
          home={data.xg_open.home}
          away={data.xg_open.away}
          sub={`standardka ${fmt(data.xg_set.home)}–${fmt(data.xg_set.away)}`}
        />
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400">Shotmapa</p>
            <p className="text-sm text-slate-400 light:text-slate-500 mt-0.5">
              Posledních 40 m, obě strany útočí doprava. Velikost tečky je xG. {data.shots.length} střel,{" "}
              {data.shots.filter((s) => (s.xgot || 0) > 0).length} s xGOT nad nulou.
            </p>
          </div>
          <FilterPills value={filter} onChange={setFilter} />
        </div>
        <ShotPitch shots={visibleShots} hover={hover} onHover={setHover} />
        <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-slate-400 light:text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-full bg-rose-500 inline-block" /> {match.home.short}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-full bg-sky-400 inline-block" /> {match.away.short}
          </span>
          <span>kroužek = gól</span>
          {hover ? (
            <span className="text-slate-300 light:text-slate-700">
              {hover.minute}′ {hover.player} · xG {fmt(hover.xg)} · xGOT {fmt(hover.xgot)} · {hover.situation} · {hover.body} ·{" "}
              {RESULT_CS[hover.result] ?? hover.result}
            </span>
          ) : (
            <span>Najed na tečku.</span>
          )}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <article className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400">Průchod brankou</p>
          <p className="text-xs text-slate-400 light:text-slate-500 mt-1 mb-3">
            Kam míč mířil. Jen střely s xGOT nad nulou, góly a tyče. {mouth.length} z {data.shots.length}.
          </p>
          <GoalFrame shots={mouth} home={match.home.short} away={match.away.short} />
        </article>
        <article className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400">Brankáři</p>
          <p className="text-xs text-slate-400 light:text-slate-500 mt-1 mb-3">xGOT, kterému čelili, mínus inkasované góly.</p>
          <KeeperRow side={data.keepers.home} team={match.home.short} />
          <KeeperRow side={data.keepers.away} team={match.away.short} />
        </article>
      </section>

      <section className="card overflow-hidden">
        <div className="px-5 pt-4 pb-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400">Hráči</p>
          <p className="text-sm text-slate-400 light:text-slate-500 mt-0.5">
            xG, vytvořené šance a dotyky ve vápně. xA hráče PitchAPI u zápasu neposílá, xAG je součet za tým níž.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-400 light:text-slate-500 border-y border-slate-800 light:border-slate-200">
                <th className="text-left font-medium pl-5 pr-2 py-2">Hráč</th>
                <th className="font-medium text-center px-2">xG</th>
                <th className="font-medium text-center px-2">G</th>
                <th className="font-medium text-center px-2">Střely</th>
                <th className="font-medium text-center px-2">Šance</th>
                <th className="font-medium text-center px-2">Vápno</th>
                <th className="font-medium text-center pr-5">Min</th>
              </tr>
            </thead>
            <tbody>
              {data.players.map((p) => (
                <tr key={`${p.team}-${p.name}`} className="border-b border-slate-800/60 light:border-slate-100 last:border-0">
                  <td className="pl-5 pr-2 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${p.team === "home" ? "bg-rose-500" : "bg-sky-400"}`} />
                      <span className="font-medium text-white light:text-slate-900 truncate">{p.name}</span>
                    </div>
                  </td>
                  <td className="text-center tabular-nums px-2 text-white light:text-slate-900">{fmt(p.xg)}</td>
                  <td className="text-center tabular-nums px-2">{p.goals || "—"}</td>
                  <td className="text-center tabular-nums px-2 text-slate-400 light:text-slate-500">{p.shots || "—"}</td>
                  <td className="text-center tabular-nums px-2 text-slate-300 light:text-slate-700">{p.chances || "—"}</td>
                  <td className="text-center tabular-nums px-2 text-slate-400 light:text-slate-500">{p.touches_box || "—"}</td>
                  <td className="text-center tabular-nums pr-5 text-slate-400 light:text-slate-500">{p.minutes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="px-5 pt-4 pb-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400">Pokročilé metriky</p>
          <p className="text-sm text-slate-400 light:text-slate-500 mt-0.5">
            Hodnota držení, tvorba, presink a tempo. {match.home.short} – {match.away.short}.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {data.advanced.map((row) => (
                <tr key={row.label} className="border-t border-slate-800/70 light:border-slate-200">
                  <td className="px-5 py-1.5 text-slate-300 light:text-slate-700">{row.label}</td>
                  <td className="px-3 py-1.5 text-center tabular-nums text-rose-300 light:text-rose-700">{fmt(row.home, guessDigits(row.home))}</td>
                  <td className="px-5 py-1.5 text-center tabular-nums text-sky-300 light:text-sky-700">{fmt(row.away, guessDigits(row.away))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="px-5 pt-4 pb-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400">Další týmové součty</p>
          <p className="text-sm text-slate-400 light:text-slate-500 mt-0.5">
            Dlouhé míče, poloviny, centry, souboje a dotyky ve vápně. Procenta jsou úspěšnost z API.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {data.extras.map((row) => (
                <tr key={row.key} className="border-t border-slate-800/70 light:border-slate-200">
                  <td className="px-5 py-1.5">
                    <span className="text-slate-200 light:text-slate-800">{row.label}</span>
                    <span className="ml-2 text-[11px] text-slate-400 light:text-slate-500">{row.group}</span>
                  </td>
                  <td className="px-3 py-1.5 text-center tabular-nums text-rose-300 light:text-rose-700">{cellText(row.home)}</td>
                  <td className="px-5 py-1.5 text-center tabular-nums text-sky-300 light:text-sky-700">{cellText(row.away)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400">Heatmapa</p>
            <p className="text-sm text-slate-400 light:text-slate-500 mt-0.5">
              Akce na mřížce 16×12. Útok zleva doprava.
            </p>
          </div>
          <div className="flex gap-1">
            {(["home", "away"] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => setHeatSide(side)}
                className={`rounded-md px-2.5 py-1 text-xs ${
                  heatSide === side
                    ? "bg-emerald-500 text-black"
                    : "bg-slate-800 text-slate-300 light:bg-slate-100 light:text-slate-700"
                }`}
              >
                {match[side].short}
              </button>
            ))}
          </div>
        </div>
        <HeatPitch
          grid={data.heatmap.grid}
          team={data.heatmap.teams.find((t) => t.side === heatSide)}
          color={heatSide === "home" ? "#fb7185" : "#38bdf8"}
        />
      </section>

      <section className="card overflow-hidden">
        <div className="px-5 pt-4 pb-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400">Střela po střele</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-400 light:text-slate-500 border-y border-slate-800 light:border-slate-200">
                <th className="text-left font-medium pl-5 py-2">Min</th>
                <th className="text-left font-medium px-2">Hráč</th>
                <th className="font-medium text-center px-2">xG</th>
                <th className="font-medium text-center px-2">xGOT</th>
                <th className="text-left font-medium px-2">Jak</th>
                <th className="text-left font-medium pr-5">Výsledek</th>
              </tr>
            </thead>
            <tbody>
              {data.shots.map((s, i) => (
                <tr key={`${s.minute}-${s.player}-${i}`} className="border-b border-slate-800/60 light:border-slate-100 last:border-0">
                  <td className="pl-5 py-1.5 tabular-nums text-slate-400 light:text-slate-500">{s.minute}′</td>
                  <td className="px-2 py-1.5">
                    <span className={`mr-2 inline-block h-2 w-2 rounded-full ${s.team === "home" ? "bg-rose-500" : "bg-sky-400"}`} />
                    <span className="text-white light:text-slate-900">{s.player}</span>
                  </td>
                  <td className="text-center tabular-nums px-2">{fmt(s.xg, 3)}</td>
                  <td className="text-center tabular-nums px-2">{fmt(s.xgot, 3)}</td>
                  <td className="px-2 text-slate-400 light:text-slate-500">
                    {s.situation} · {s.body}
                    {s.inside_box ? "" : " · mimo vápno"}
                  </td>
                  <td className="pr-5 text-slate-300 light:text-slate-700">{RESULT_CS[s.result] ?? s.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function guessDigits(n: number | null): number {
  if (n == null) return 2;
  return Number.isInteger(n) ? 0 : Math.abs(n) >= 20 ? 1 : 2;
}

function FilterPills({ value, onChange }: { value: ShotFilter; onChange: (v: ShotFilter) => void }) {
  const items: [ShotFilter, string][] = [
    ["all", "Vše"],
    ["on_target", "Na branku"],
    ["xgot", "xGOT"],
    ["goal", "Góly"],
  ];
  return (
    <div className="flex gap-1">
      {items.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`rounded-md px-2.5 py-1 text-xs ${
            value === id ? "bg-emerald-500 text-black" : "bg-slate-800 text-slate-300 light:bg-slate-100 light:text-slate-700"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function TeamBlock({ team, align }: { team: Team; align: "left" | "right" }) {
  return (
    <div className={`flex items-center gap-2.5 min-w-0 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      {team.image ? <img src={team.image} alt="" className="h-10 w-10 object-contain shrink-0" /> : null}
      <div className="min-w-0">
        <p className="font-semibold text-white light:text-slate-900 truncate">{team.name}</p>
        <p className="text-[11px] text-slate-400 light:text-slate-500">{team.formation}</p>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  home,
  away,
  sub,
  hint,
}: {
  label: string;
  home: number | null;
  away: number | null;
  sub?: string;
  hint?: string;
}) {
  const h = home ?? 0;
  const a = away ?? 0;
  const max = Math.max(h, a, 0.01);
  return (
    <div className="card p-4">
      <p className="text-[11px] uppercase tracking-wide text-slate-400 light:text-slate-500">
        {label}
        {hint ? <span className="normal-case tracking-normal"> · {hint}</span> : null}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums text-white light:text-slate-900">
        {fmt(home)}
        <span className="text-slate-400 light:text-slate-500 font-medium"> – </span>
        {fmt(away)}
      </p>
      <div className="mt-2 space-y-1">
        <div className="h-1.5 rounded-full bg-slate-800 light:bg-slate-200 overflow-hidden">
          <div className="h-full bg-rose-500" style={{ width: `${(h / max) * 100}%` }} />
        </div>
        <div className="h-1.5 rounded-full bg-slate-800 light:bg-slate-200 overflow-hidden">
          <div className="h-full bg-sky-400" style={{ width: `${(a / max) * 100}%` }} />
        </div>
      </div>
      {sub ? <p className="mt-2 text-[11px] text-slate-400 light:text-slate-500">{sub}</p> : null}
    </div>
  );
}

function KeeperRow({
  side,
  team,
}: {
  side: XData["keepers"]["home"];
  team: string;
}) {
  const plus = side.goals_prevented > 0;
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-800/60 light:border-slate-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-white light:text-slate-900">{side.name}</p>
        <p className="text-[11px] text-slate-400 light:text-slate-500">
          {team} · xGOT {fmt(side.xgot_faced)} · inkasované {side.goals_conceded} · {side.saves ?? "—"} zákroky
        </p>
      </div>
      <p className={`text-lg font-bold tabular-nums ${plus ? "text-emerald-400" : "text-rose-400"}`}>
        {plus ? "+" : ""}
        {fmt(side.goals_prevented)}
      </p>
    </div>
  );
}

function ShotPitch({ shots, hover, onHover }: { shots: Shot[]; hover: Shot | null; onHover: (s: Shot | null) => void }) {
  const W = 640;
  const H = 420;
  const padX = 24;
  const padY = 16;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const depth = 40;
  const toX = (d: number) => padX + ((depth - Math.min(d, depth)) / depth) * innerW;
  const toY = (y: number) => padY + (y / 68) * innerH;
  const boxH = (40.32 / 68) * innerH;
  const sixH = (18.32 / 68) * innerH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-lg bg-emerald-950/80 light:bg-emerald-900" role="img" aria-label="Shotmapa">
      <rect x="16" y="8" width={W - 32} height={H - 16} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
      <rect x={toX(16.5)} y={toY(34) - boxH / 2} width={toX(0) - toX(16.5)} height={boxH} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" />
      <rect x={toX(5.5)} y={toY(34) - sixH / 2} width={toX(0) - toX(5.5)} height={sixH} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" />
      <line x1={toX(0)} y1={toY(30.34)} x2={toX(0)} y2={toY(37.66)} stroke="white" strokeWidth="3" />
      <circle cx={toX(11)} cy={toY(34)} r="3" fill="rgba(255,255,255,0.5)" />
      {shots.map((s, i) => {
        const r = 4 + s.xg * 14;
        const fill = s.team === "home" ? "#f43f5e" : "#38bdf8";
        const active = hover === s;
        return (
          <g key={`${s.minute}-${s.player}-${i}`}>
            {s.goal ? <circle cx={toX(s.depth)} cy={toY(s.y)} r={r + 4} fill="none" stroke={fill} strokeWidth="2" /> : null}
            <circle
              cx={toX(s.depth)}
              cy={toY(s.y)}
              r={r}
              fill={fill}
              opacity={s.on_target || s.goal ? 0.95 : 0.55}
              stroke={active ? "white" : "transparent"}
              strokeWidth="2"
              className="cursor-pointer"
              onMouseEnter={() => onHover(s)}
              onMouseLeave={() => onHover(null)}
            />
          </g>
        );
      })}
    </svg>
  );
}

function GoalFrame({ shots, home, away }: { shots: Shot[]; home: string; away: string }) {
  const y0 = 30.34;
  const y1 = 37.66;
  const z1 = 2.44;
  const left = 40;
  const top = 24;
  const gw = 340;
  const gh = 150;
  const toX = (y: number) => left + ((y - y0) / (y1 - y0)) * gw;
  const toY = (z: number) => top + gh - (z / z1) * gh;
  return (
    <svg viewBox="0 0 420 210" className="w-full h-auto" role="img" aria-label={`Branka ${home} a ${away}`}>
      <rect x={left} y={top} width={gw} height={gh} fill="#0b1220" stroke="rgba(255,255,255,0.45)" strokeWidth="3" />
      {shots.map((s, i) =>
        s.goal_y == null || s.goal_z == null ? null : (
          <circle
            key={`${s.minute}-${i}`}
            cx={toX(s.goal_y)}
            cy={toY(s.goal_z)}
            r={4 + (s.xgot || 0) * 10}
            fill={s.team === "home" ? "#f43f5e" : "#38bdf8"}
            opacity="0.9"
          />
        ),
      )}
    </svg>
  );
}

function HeatPitch({
  grid,
  team,
  color,
}: {
  grid: { length: number; width: number };
  team: { actions: number; cells: [number, number, number][] } | undefined;
  color: string;
}) {
  if (!team) return null;
  const max = Math.max(...team.cells.map((c) => c[2]), 1);
  const W = 640;
  const H = 420;
  const cw = W / grid.length;
  const ch = H / grid.width;
  return (
    <div>
      <p className="text-[11px] text-slate-400 light:text-slate-500 mb-2">{team.actions} akcí</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-lg bg-emerald-950/80 light:bg-emerald-900" role="img" aria-label="Heatmapa">
        {team.cells.map(([x, y, n]) => (
          <rect
            key={`${x}-${y}`}
            x={x * cw}
            y={y * ch}
            width={cw}
            height={ch}
            fill={color}
            opacity={0.15 + (n / max) * 0.8}
          />
        ))}
        <rect x="1" y="1" width={W - 2} height={H - 2} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
      </svg>
    </div>
  );
}
