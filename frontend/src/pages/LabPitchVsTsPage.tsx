import { useEffect, useState } from "react";
import { Link } from "../i18n/router";
import { Section } from "../components/ui";
import { intlTag } from "../i18n/locale";

type Side = "home" | "away";
type Pair = [number | null, number | null] | null;

type ShotDot = {
  player: string;
  side: Side;
  minute: number;
  depth_m: number;
  y_m: number;
  xg: number | null;
  xgot?: number | null;
  result?: string | null;
};

type ShotRow = {
  minute: number;
  player: string;
  side: Side;
  result_pitch: string | null;
  xg_pitch: number | null;
  xg_ts: number | null;
  xg_delta: number | null;
  xgot: number | null;
  goal_y: number | null;
  goal_z: number | null;
};

type Metric = { label: string; sm: Pair; ts: Pair; pitch: Pair; note?: string | null };

type Payload = {
  note: string;
  match: {
    date: string;
    score: string;
    home: string;
    away: string;
    pitch_id: string;
    league_pitch: string;
    season_pitch: string;
    round_pitch: string;
    stadium_pitch: string | null;
    stadium_sm: string | null;
    referee_pitch: string | null;
    referee_ts: string | null;
    coach_home_pitch: string | null;
    coach_away_pitch: string | null;
    coach_home_ts: string | null;
    coach_away_ts: string | null;
    formation_pitch: (string | null)[];
    formation_ts: (string | null)[];
  };
  summary: {
    pitch_shots: number;
    ts_shots: number;
    paired: number;
    xg_mae: number | null;
    depth_mae_m: number | null;
    xgot_nonzero: number;
    goal_coords: number;
  };
  rows: Metric[];
  shots: ShotRow[];
  unmatched: { pitch: string[]; ts: string[] };
  shots_pitch: ShotDot[];
  shots_ts: ShotDot[];
  players: {
    name: string;
    side: Side;
    goals: number | null;
    shots: number | null;
    xg_pitch: number | null;
    xg_ts: number | null;
  }[];
  advanced: { name: string; possession_pct: number | null; field_tilt: number | null; ppda: number | null }[];
};

function fmt(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString(intlTag(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function pairText(pair: Pair, digits = 0): string {
  if (!pair) return "—";
  return `${fmt(pair[0], digits)} / ${fmt(pair[1], digits)}`;
}

export function LabPitchVsTsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/lab/pitch-vs-ts.json")
      .then((response) => {
        if (!response.ok) throw new Error("Soubor pitch-vs-ts.json chybí.");
        return response.json();
      })
      .then(setData)
      .catch((err) => setError(String(err)));
  }, []);

  if (error) {
    return (
      <div className="max-w-6xl mx-auto py-12 px-4 pt-20 text-rose-400">
        <Link to="/lab" className="text-amber-400 text-sm">
          ← Lab
        </Link>
        <p className="mt-4">{error}</p>
      </div>
    );
  }
  if (!data) {
    return <div className="max-w-6xl mx-auto py-12 px-4 pt-20 text-slate-400 light:text-slate-500">Načítám srovnání…</div>;
  }

  const { match: m, summary: s } = data;
  const goalShots = data.shots.filter((shot) => (shot.xgot || 0) > 0);

  return (
    <div className="max-w-6xl mx-auto py-12 px-4 pt-20">
      <Link to="/lab" className="text-amber-400 text-sm">
        ← Lab
      </Link>
      <header className="mt-4 mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-400">TEST · neprodukt</p>
        <h1 className="text-3xl font-bold text-white light:text-slate-900 mt-1">
          {m.home} {m.score} {m.away}
        </h1>
        <p className="text-sm text-slate-400 light:text-slate-500 mt-2 max-w-3xl">
          30. 8. 2026, Chance Liga, {m.league_pitch} {m.season_pitch}, kolo {m.round_pitch}. Stejný zápas jako
          v testu SportMonks vs TheStatsAPI. Tady jsou proti sobě TheStatsAPI a PitchAPI, hlavně střely, xG a xGOT.
        </p>
        <p className="text-[11px] font-mono text-slate-400 light:text-slate-500 mt-2">PitchAPI {m.pitch_id}</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Spárované střely" value={`${s.paired} / ${s.pitch_shots}`} hint="stejná minuta a příjmení" />
        <Stat label="Místo střely" value={`${fmt(s.depth_mae_m, 2)} m`} hint="průměrná odchylka od branky" />
        <Stat label="xG na střelu" value={fmt(s.xg_mae, 3)} hint="průměrný rozdíl modelů" />
        <Stat label="xGOT na PitchAPI" value={`${s.xgot_nonzero} střel`} hint={`souřadnice branky u ${s.goal_coords} střel`} />
      </div>

      <Section
        title="Shotmapa"
        subtitle="výplň PitchAPI, obrys TheStatsAPI"
        note="Obě osy jsou metry. TheStatsAPI má y otočené, po otočení střely sedí na stejné místo. Velikost je xG."
      >
        <ShotPitch pitch={data.shots_pitch} ts={data.shots_ts} hover={hover} onHover={setHover} />
        <p className="text-xs text-slate-400 light:text-slate-500 mt-2">
          {hover || "Najetím na střelu uvidíš hráče."} Nespárované: PitchAPI {data.unmatched.pitch.join(", ") || "—"},
          TheStatsAPI {data.unmatched.ts.join(", ") || "—"}.
        </p>
        <div className="flex gap-4 text-xs text-slate-400 light:text-slate-500 mt-2">
          <span><i className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500 mr-1" />Sparta</span>
          <span><i className="inline-block w-2.5 h-2.5 rounded-full bg-sky-400 mr-1" />Slavia</span>
        </div>
      </Section>

      <Section
        title="Kam střela přešla brankovou čáru"
        subtitle="jen PitchAPI, xGOT > 0"
        note="TheStatsAPI vrací souřadnice místa kopu, ne místa v brance. Tady je výška a strana, ze kterých PitchAPI počítá xGOT."
      >
        <GoalFrame shots={goalShots} />
      </Section>

      <Section
        title="Týmová čísla"
        subtitle="domácí / hosté"
        note="Základní statistiky PitchAPI sedí na SportMonks. xG se mezi modely liší v součtu, jednotlivé střely jsou blízko. xGOT má jen PitchAPI."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 light:text-slate-500">
                <th className="py-2 pr-3">Metrika</th>
                <th className="py-2 px-3 text-center">SportMonks</th>
                <th className="py-2 px-3 text-center">TheStatsAPI</th>
                <th className="py-2 px-3 text-center">PitchAPI</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.label} className="border-t border-slate-800 light:border-slate-200">
                  <td className="py-2 pr-3 text-slate-200 light:text-slate-800">{row.label}</td>
                  <td className="py-2 px-3 text-center tabular-nums text-slate-400 light:text-slate-500">{pairText(row.sm, digitsFor(row.label))}</td>
                  <td className="py-2 px-3 text-center tabular-nums">{pairText(row.ts, digitsFor(row.label))}</td>
                  <td className="py-2 px-3 text-center tabular-nums text-amber-300 light:text-amber-800">
                    {pairText(row.pitch, digitsFor(row.label))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Střela po střele" subtitle={`${data.shots.length} spárovaných`}>
        <div className="overflow-x-auto max-h-[28rem]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#12161f] light:bg-white">
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 light:text-slate-500">
                <th className="py-2 pr-2">Min</th>
                <th className="py-2 pr-2">Hráč</th>
                <th className="py-2 pr-2">Výsledek</th>
                <th className="py-2 px-2 text-right">xG TS</th>
                <th className="py-2 px-2 text-right">xG Pitch</th>
                <th className="py-2 px-2 text-right">Δ</th>
                <th className="py-2 pl-2 text-right">xGOT</th>
              </tr>
            </thead>
            <tbody>
              {data.shots.map((shot) => (
                <tr key={`${shot.minute}-${shot.player}-${shot.xg_pitch}`} className="border-t border-slate-800/80 light:border-slate-200">
                  <td className="py-1.5 pr-2 tabular-nums text-slate-400 light:text-slate-500">{shot.minute}'</td>
                  <td className="py-1.5 pr-2">
                    <span className={shot.side === "home" ? "text-rose-300" : "text-sky-300"}>{shot.player}</span>
                  </td>
                  <td className="py-1.5 pr-2 text-slate-400 light:text-slate-500">{shot.result_pitch}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{fmt(shot.xg_ts, 3)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{fmt(shot.xg_pitch, 3)}</td>
                  <td className={`py-1.5 px-2 text-right tabular-nums ${deltaTone(shot.xg_delta)}`}>
                    {shot.xg_delta == null ? "—" : `${shot.xg_delta > 0 ? "+" : ""}${fmt(shot.xg_delta, 3)}`}
                  </td>
                  <td className="py-1.5 pl-2 text-right tabular-nums text-amber-300 light:text-amber-800">
                    {fmt(shot.xgot, 3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="xG hráčů" subtitle="kdo střílel">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 light:text-slate-500">
                <th className="py-2">Hráč</th>
                <th className="py-2 text-right">Střely</th>
                <th className="py-2 text-right">Góly</th>
                <th className="py-2 text-right">xG TS</th>
                <th className="py-2 text-right">xG Pitch</th>
              </tr>
            </thead>
            <tbody>
              {data.players.map((player) => (
                <tr key={`${player.side}-${player.name}`} className="border-t border-slate-800/80 light:border-slate-200">
                  <td className="py-1.5">
                    <span className={player.side === "home" ? "text-rose-300" : "text-sky-300"}>{player.name}</span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(player.shots)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(player.goals)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(player.xg_ts, 2)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(player.xg_pitch, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Shoda zápasu" subtitle="jestli je to opravdu tentýž zápas">
        <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <Fact k="Formace" v={`${m.formation_pitch.join(" / ")} · TS ${m.formation_ts.join(" / ")}`} />
          <Fact k="Trenéři Pitch" v={`${m.coach_home_pitch} / ${m.coach_away_pitch}`} />
          <Fact k="Trenéři TS" v={`${m.coach_home_ts} / ${m.coach_away_ts}`} />
          <Fact k="Sudí" v={`${m.referee_pitch} · TS ${m.referee_ts}`} />
          <Fact k="Stadion" v={`Pitch ${m.stadium_pitch} · SportMonks ${m.stadium_sm}`} />
          <Fact
            k="Advanced Pitch"
            v={data.advanced
              .map((team) => `${team.name}: tilt ${fmt(team.field_tilt, 1)} %, PPDA ${fmt(team.ppda, 1)}`)
              .join(" · ")}
          />
        </dl>
      </Section>
    </div>
  );
}

function digitsFor(label: string): number {
  return /xG|xGOT|zabrán/i.test(label) ? 2 : 0;
}

function deltaTone(delta: number | null): string {
  if (delta == null) return "text-slate-400 light:text-slate-500";
  if (Math.abs(delta) < 0.03) return "text-emerald-400";
  if (Math.abs(delta) < 0.08) return "text-amber-300";
  return "text-rose-400";
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-400 light:text-slate-500">{label}</p>
      <p className="text-2xl font-semibold tabular-nums mt-1 text-amber-300 light:text-amber-800">{value}</p>
      <p className="text-[11px] text-slate-400 light:text-slate-500 mt-1">{hint}</p>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-800/70 light:border-slate-200 py-1">
      <dt className="text-slate-400 light:text-slate-500">{k}</dt>
      <dd className="text-right text-slate-200 light:text-slate-800">{v}</dd>
    </div>
  );
}

function ShotPitch({
  pitch,
  ts,
  hover,
  onHover,
}: {
  pitch: ShotDot[];
  ts: ShotDot[];
  hover: string | null;
  onHover: (label: string | null) => void;
}) {
  const W = 680;
  const H = 460;
  const padX = 28;
  const padY = 18;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const depth = 40;
  const toX = (meters: number) => padX + ((depth - Math.min(meters, depth)) / depth) * innerW;
  const toY = (meters: number) => padY + (meters / 68) * innerH;
  const boxH = (40.32 / 68) * innerH;
  const sixH = (18.32 / 68) * innerH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-lg bg-emerald-950/80 light:bg-emerald-900" role="img" aria-label="Shotmapa Sparta Slavia">
      <rect x="16" y="8" width={W - 32} height={H - 16} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
      <rect x={toX(16.5)} y={toY(34) - boxH / 2} width={toX(0) - toX(16.5)} height={boxH} fill="none" stroke="rgba(255,255,255,0.28)" />
      <rect x={toX(5.5)} y={toY(34) - sixH / 2} width={toX(0) - toX(5.5)} height={sixH} fill="none" stroke="rgba(255,255,255,0.28)" />
      <line x1={toX(0)} y1={toY(34) - 22} x2={toX(0)} y2={toY(34) + 22} stroke="white" strokeWidth="3" />
      {pitch.map((shot, index) => {
        const radius = 4 + (shot.xg || 0) * 16;
        const fill = shot.side === "home" ? "#fb7185" : "#38bdf8";
        const label = `${shot.minute}' ${shot.player} · Pitch xG ${fmt(shot.xg, 3)} · xGOT ${fmt(shot.xgot, 3)}`;
        return (
          <circle
            key={`p-${index}`}
            cx={toX(shot.depth_m)}
            cy={toY(shot.y_m)}
            r={radius}
            fill={fill}
            opacity={0.8}
            className="cursor-pointer"
            onMouseEnter={() => onHover(label)}
            onMouseLeave={() => onHover(null)}
          />
        );
      })}
      {ts.map((shot, index) => {
        const radius = 5 + (shot.xg || 0) * 16;
        const label = `${shot.minute}' ${shot.player} · TheStatsAPI xG ${fmt(shot.xg, 3)}`;
        return (
          <circle
            key={`t-${index}`}
            cx={toX(shot.depth_m)}
            cy={toY(shot.y_m)}
            r={radius}
            fill="none"
            stroke={hover === label ? "#fbbf24" : "white"}
            strokeWidth="1.4"
            className="cursor-pointer"
            onMouseEnter={() => onHover(label)}
            onMouseLeave={() => onHover(null)}
          />
        );
      })}
    </svg>
  );
}

function GoalFrame({ shots }: { shots: ShotRow[] }) {
  const W = 420;
  const H = 220;
  const left = 40;
  const top = 24;
  const gw = 340;
  const gh = 150;
  const postL = 30.34;
  const postR = 37.66;
  const toX = (y: number) => left + ((y - postL) / (postR - postL)) * gw;
  const toY = (z: number) => top + gh - (z / 2.44) * gh;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl h-auto" role="img" aria-label="Místo střel v brance">
      <rect x={left} y={top} width={gw} height={gh} fill="#0f172a" stroke="white" strokeWidth="3" />
      <line x1={left + gw / 2} y1={top} x2={left + gw / 2} y2={top + gh} stroke="rgba(255,255,255,0.15)" />
      {shots.map((shot, index) => {
        if (shot.goal_y == null || shot.goal_z == null) return null;
        const fill = shot.side === "home" ? "#fb7185" : "#38bdf8";
        return (
          <circle
            key={`${shot.minute}-${index}`}
            cx={toX(shot.goal_y)}
            cy={toY(shot.goal_z)}
            r={5 + (shot.xgot || 0) * 10}
            fill={fill}
            opacity="0.9"
          >
            <title>{`${shot.minute}' ${shot.player} xGOT ${fmt(shot.xgot, 3)}`}</title>
          </circle>
        );
      })}
    </svg>
  );
}
