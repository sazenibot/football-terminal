import { useEffect, useId, useState, type ReactNode } from "react";
import { XgotBadgeChip } from "./XgotBadge";
import { finishingLead, xgotEfficiencyBadge } from "../lib/xgEfficiency";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { intlTag, t } from "../i18n/locale";
import { fmtDayMonth } from "../lib/format";

type Venue = "all" | "home" | "away";
type Recency = "all" | "5";
type ShotCut = "all" | "on_target" | "off" | "goal";
type Kind = "all" | "play" | "set";
type TrendMode = "compare" | "split";
export type SeasonOpt = { id: string; label: string; matches: MatchRow[]; disabled?: boolean };
type ChartPoint = {
  label: string;
  gf: number;
  xg: number;
  xgot: number;
  xg_open: number;
  xg_set: number;
};

export type Shot = {
  player_id: string;
  player: string;
  minute: number;
  depth: number;
  y: number;
  xg: number;
  goal: boolean;
  on_target: boolean;
  kind: "play" | "set";
};

type ShotView = Shot & { date: string; home: boolean; opponent_short: string };

export type MatchRow = {
  id: string;
  date: string;
  home: boolean;
  opponent: string;
  opponent_short: string;
  gf: number;
  ga: number;
  goals?: number;
  goals_against?: number;
  xg: number;
  xgot: number;
  xg_open: number;
  xg_set: number;
  npxg: number;
  xgot_faced: number;
  sot_faced: number;
  saves: number;
  shots: Shot[];
};

export type PitchCatalogFile = {
  source: string;
  league_id?: number;
  league?: string;
  season: string;
  team?: { id?: number; name: string; short?: string | null; image?: string | null };
  player?: { id: number; name: string; team_id?: number };
  keeper?: boolean;
  matches: MatchRow[];
};

export function pitchSeasonOpts(season: string, matches: MatchRow[]): SeasonOpt[] {
  return [{ id: season, label: season, matches, disabled: false }];
}

const C = {
  goals: "#ff2d55",
  xg: "#a3e635",
  xgot: "#0ea5e9",
  open: "#22c55e",
  set: "#06b6d4",
  play: "#fb7185",
  setShot: "#38bdf8",
};

function fmt(n: number, d = 2): string {
  return n.toLocaleString(intlTag(), { minimumFractionDigits: d, maximumFractionDigits: d });
}

function czDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return fmtDayMonth(new Date(Number(y), Number(m) - 1, Number(d)));
}

function filterMatches(matches: MatchRow[], recency: Recency, venue: Venue): MatchRow[] {
  const byVenue = venue === "all" ? matches : matches.filter((m) => m.home === (venue === "home"));
  return recency === "all" ? byVenue : byVenue.slice(-5);
}

function outcomeOf(s: Shot): string {
  if (s.goal) return t("mc.pc.out.goal");
  if (s.on_target) return t("mc.pc.out.onTarget");
  return t("mc.pc.out.off");
}

export function TeamTrend({
  seasons,
  defaultSeason,
  team,
}: {
  seasons: SeasonOpt[];
  defaultSeason: string;
  team: string;
}) {
  const [seasonId, setSeasonId] = useState(defaultSeason);
  useEffect(() => {
    setSeasonId(defaultSeason);
  }, [defaultSeason]);
  const [venue, setVenue] = useState<Venue>("all");
  const [recency, setRecency] = useState<Recency>("all");
  const [mode, setMode] = useState<TrendMode>("compare");
  const [showTable, setShowTable] = useState(false);
  const matches = seasons.find((s) => s.id === seasonId)?.matches ?? [];
  const rows = filterMatches(matches, recency, venue);
  const chart: ChartPoint[] = rows.map((m) => ({
    label: `${czDate(m.date)} ${m.opponent_short}`,
    gf: m.gf,
    xg: Number(m.xg.toFixed(2)),
    xgot: Number(m.xgot.toFixed(2)),
    xg_open: Number(m.xg_open.toFixed(2)),
    xg_set: Number(m.xg_set.toFixed(2)),
  }));
  const goals = rows.reduce((s, m) => s + m.gf, 0);
  const xg = rows.reduce((s, m) => s + m.xg, 0);
  const xgot = rows.reduce((s, m) => s + m.xgot, 0);
  const seasonChrono = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  const last5 = seasonChrono.slice(-5);
  const seasonBadge = xgotEfficiencyBadge(
    seasonChrono.reduce((s, m) => s + m.gf, 0),
    seasonChrono.reduce((s, m) => s + m.xgot, 0),
    "season",
  );
  const last5Badge = xgotEfficiencyBadge(
    last5.reduce((s, m) => s + m.gf, 0),
    last5.reduce((s, m) => s + m.xgot, 0),
    "last5",
  );
  const trendBadges = [seasonBadge, last5Badge].filter((b) => b != null);

  return (
    <section className="card p-5">
      <CardHead
        kicker={t("mc.pc.teamCard")}
        title={t("mc.pc.trend")}
        lead={finishingLead(team, goals, xgot)}
        badges={
          trendBadges.length ? (
            <span className="flex flex-wrap gap-1.5">
              {trendBadges.map((b) => (
                <XgotBadgeChip key={`${b.id}-${b.window}`} badge={b} showWindow={trendBadges.length > 1} />
              ))}
            </span>
          ) : null
        }
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t("mc.pe.pl.period")}>
          <Segmented
            value={recency}
            onChange={setRecency}
            options={[
              ["all", t("mc.pc.wholeSeason")],
              ["5", t("mc.pe.pl.last5")],
            ]}
          />
        </Field>
        <Field label={t("mc.pe.pl.season")}>
          <SeasonSelect seasons={seasons} value={seasonId} onChange={setSeasonId} />
        </Field>
        <Field label={t("mc.pc.chart")}>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              ["compare", t("mc.pc.goalsVsXg")],
              ["split", t("mc.pc.xgBreakdown")],
            ]}
          />
        </Field>
        <Field label={t("mc.pc.place")}>
          <Segmented
            value={venue}
            onChange={setVenue}
            options={[
              ["all", t("mc.pc.homeAndAway")],
              ["home", t("mc.pc.venue.home")],
              ["away", t("mc.pc.venue.away")],
            ]}
          />
        </Field>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <MiniStat
          label={t("mc.pe.col.g")}
          value={String(goals)}
          color={C.goals}
          hint={t("mc.pc.hint.goals")}
        />
        <MiniStat
          label="xGOT"
          value={fmt(xgot)}
          color={C.xgot}
          hint={t("mc.pc.hint.xgot")}
        />
        <MiniStat
          label="xG"
          value={fmt(xg)}
          color={C.xg}
          hint={t("mc.pc.hint.xg")}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-300 light:text-slate-600">
        {mode === "compare" ? (
          <>
            <Swatch color={C.goals} label={t("mc.pe.col.g")} />
            <Swatch color={C.xgot} label="xGOT" />
            <Swatch color={C.xg} label="xG" />
          </>
        ) : (
          <>
            <Swatch color={C.open} label={t("mc.pc.xgOpen")} />
            <Swatch color={C.set} label={t("mc.pc.xgSet")} />
            <Swatch color={C.goals} label={t("mc.pe.col.g")} />
          </>
        )}
      </div>
      <TrendPlot data={chart} mode={mode} />
      <TableToggle open={showTable} onToggle={() => setShowTable((v) => !v)} />
      {showTable ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-400 light:text-slate-500">
                <th className="text-left py-1.5 font-medium">{t("mc.pc.match")}</th>
                <th className="text-right font-medium">{t("mc.pe.col.g")}</th>
                <th className="text-right font-medium">xGOT</th>
                <th className="text-right font-medium">xG</th>
                <th className="text-right font-medium">{t("mc.pc.goalsMinusXgot")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const d = m.gf - m.xgot;
                return (
                  <tr key={m.id} className="border-t border-slate-800/80 light:border-slate-200">
                    <td className="py-1.5 text-white light:text-slate-900">
                      <MatchName date={m.date} home={m.home} opponent={m.opponent_short} />
                    </td>
                    <td className="text-right tabular-nums" style={{ color: C.goals }}>
                      {m.gf}
                    </td>
                    <td className="text-right tabular-nums" style={{ color: C.xgot }}>
                      {fmt(m.xgot)}
                    </td>
                    <td className="text-right tabular-nums" style={{ color: C.xg }}>
                      {fmt(m.xg)}
                    </td>
                    <td className={`text-right tabular-nums ${d > 0.15 ? "text-emerald-400" : d < -0.15 ? "text-rose-400" : "text-slate-400 light:text-slate-500"}`}>
                      {d > 0 ? "+" : ""}
                      {fmt(d)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

export function ShotMap({
  title,
  lead,
  seasons,
  defaultSeason,
  shotsOf,
  showSeason = true,
}: {
  title: string;
  lead: string;
  seasons: SeasonOpt[];
  defaultSeason: string;
  shotsOf: (m: MatchRow) => Shot[];
  showSeason?: boolean;
}) {
  const [seasonId, setSeasonId] = useState(defaultSeason);
  useEffect(() => {
    setSeasonId(defaultSeason);
  }, [defaultSeason]);
  const [venue, setVenue] = useState<Venue>("all");
  const [recency, setRecency] = useState<Recency>("all");
  const [cut, setCut] = useState<ShotCut>("all");
  const [kind, setKind] = useState<Kind>("all");
  const [hover, setHover] = useState<ShotView | null>(null);
  const matches = seasons.find((s) => s.id === seasonId)?.matches ?? [];
  const rows = filterMatches(matches, recency, venue);
  const shots: ShotView[] = rows.flatMap((m) =>
    shotsOf(m)
      .filter((s) => {
        if (cut === "goal" && !s.goal) return false;
        if (cut === "on_target" && !s.on_target) return false;
        if (cut === "off" && (s.on_target || s.goal)) return false;
        if (kind === "play" && s.kind !== "play") return false;
        if (kind === "set" && s.kind !== "set") return false;
        return true;
      })
      .map((s) => ({ ...s, date: m.date, home: m.home, opponent_short: m.opponent_short })),
  );
  const wide = shots.filter((s) => s.y < 13.84 || s.y > 54.16).length;
  const boxEdge = shots.filter((s) => (s.y >= 13.84 && s.y < 24.84) || (s.y > 43.16 && s.y <= 54.16)).length;

  return (
    <section className="card p-5">
      <CardHead
        kicker={t("mc.pc.shotmap")}
        title={title}
        lead={lead}
        seasons={showSeason ? seasons : undefined}
        seasonId={showSeason ? seasonId : undefined}
        onSeason={showSeason ? setSeasonId : undefined}
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label={t("mc.pe.pl.period")}>
          <Segmented
            value={recency}
            onChange={setRecency}
            options={[
              ["all", t("mc.pc.wholeSeason")],
              ["5", t("mc.pe.pl.last5")],
            ]}
          />
        </Field>
        <Field label={t("mc.pc.place")}>
          <Segmented
            value={venue}
            onChange={setVenue}
            options={[
              ["all", t("mc.pc.all")],
              ["home", t("mc.pc.venue.home")],
              ["away", t("mc.pc.venue.away")],
            ]}
          />
        </Field>
        <Field label={t("mc.pe.col.shT")}>
          <Segmented
            value={cut}
            onChange={setCut}
            options={[
              ["all", t("mc.pc.all")],
              ["on_target", t("mc.pc.onTarget")],
              ["off", t("mc.pc.off")],
              ["goal", t("mc.pe.col.g")],
            ]}
          />
        </Field>
        <Field label={t("mc.pc.type")}>
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              ["all", t("mc.pc.all")],
              ["play", t("mc.pc.openPlay")],
              ["set", t("mc.pc.setPiece")],
            ]}
          />
        </Field>
      </div>
      <p className="mt-3 text-xs text-slate-400 light:text-slate-500">
        {wide
          ? t("mc.pc.summary", { shots: shots.length, rows: rows.length, box: boxEdge, wide })
          : t("mc.pc.summaryNoWide", { shots: shots.length, rows: rows.length, box: boxEdge })}
      </p>
      <div className="mt-3 max-w-xl mx-auto">
        <Ticker hover={hover} />
        <Pitch shots={shots} hover={hover} onHover={setHover} />
      </div>
      <div className="mt-3 flex flex-col items-center gap-1.5 text-xs text-slate-300 light:text-slate-600">
        <div className="flex flex-wrap justify-center gap-4">
          <Swatch color={C.play} label={t("mc.pc.openPlay")} />
          <Swatch color={C.setShot} label={t("mc.pc.setPiece")} />
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <i className="relative inline-block h-3 w-3 rounded-full" style={{ background: C.play }}>
              <i className="absolute -inset-0.5 rounded-full border border-white" />
            </i>
            {t("mc.pc.legend.goal")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-3 w-3 rounded-full" style={{ background: C.play }} />
            {t("mc.pc.legend.onTarget")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-3 w-3 rounded-full" style={{ background: C.play, opacity: 0.28 }} />
            {t("mc.pc.legend.off")}
          </span>
        </div>
      </div>
    </section>
  );
}

export function KeeperCard({
  seasons,
  defaultSeason,
  name,
  showSeason = true,
}: {
  seasons: SeasonOpt[];
  defaultSeason: string;
  name: string;
  showSeason?: boolean;
}) {
  const [seasonId, setSeasonId] = useState(defaultSeason);
  useEffect(() => {
    setSeasonId(defaultSeason);
  }, [defaultSeason]);
  const [venue, setVenue] = useState<Venue>("all");
  const [recency, setRecency] = useState<Recency>("all");
  const [showTable, setShowTable] = useState(false);
  const matches = seasons.find((s) => s.id === seasonId)?.matches ?? [];
  const rows = filterMatches(matches, recency, venue);
  const faced = rows.reduce((s, m) => s + m.xgot_faced, 0);
  const goals = rows.reduce((s, m) => s + m.ga, 0);
  const saves = rows.reduce((s, m) => s + m.saves, 0);
  const sot = rows.reduce((s, m) => s + m.sot_faced, 0);
  const prevented = faced - goals;
  const abs = fmt(Math.abs(prevented));
  const above = prevented >= 0.05;
  const below = prevented <= -0.05;
  const line = above
    ? t("mc.pc.keeper.above", { abs })
    : below
      ? t("mc.pc.keeper.below", { abs })
      : t("mc.pc.keeper.flat");

  return (
    <section className="card p-5">
      <CardHead
        kicker={t("mc.pc.keeperCard")}
        title={name}
        lead={t("mc.pc.keeperLead")}
        seasons={showSeason ? seasons : undefined}
        seasonId={showSeason ? seasonId : undefined}
        onSeason={showSeason ? setSeasonId : undefined}
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label={t("mc.pe.pl.period")}>
          <Segmented
            value={recency}
            onChange={setRecency}
            options={[
              ["all", t("mc.pc.wholeSeason")],
              ["5", t("mc.pe.pl.last5")],
            ]}
          />
        </Field>
        <Field label={t("mc.pc.place")}>
          <Segmented
            value={venue}
            onChange={setVenue}
            options={[
              ["all", t("mc.pc.homeAndAway")],
              ["home", t("mc.pc.venue.home")],
              ["away", t("mc.pc.venue.away")],
            ]}
          />
        </Field>
      </div>
      <p className={`mt-5 text-4xl font-bold tabular-nums ${above ? "text-emerald-400" : below ? "text-rose-400" : "text-slate-200 light:text-slate-800"}`}>
        {prevented > 0 ? "+" : ""}
        {fmt(prevented)}
      </p>
      <p className="text-sm text-slate-300 light:text-slate-700 mt-1">
        {t("mc.pc.keeperLine", { line, n: rows.length })}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label={t("mc.st.xgotAgainst")} value={fmt(faced)} />
        <Stat label={t("mc.pc.concededCap")} value={String(goals)} />
        <Stat label={t("mc.pc.savesShots")} value={`${Math.round(saves)} / ${Math.round(sot)}`} />
      </div>
      <TableToggle open={showTable} onToggle={() => setShowTable((v) => !v)} />
      {showTable ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-400 light:text-slate-500">
                <th className="text-left py-1.5 font-medium">{t("mc.pc.match")}</th>
                <th className="text-right font-medium">{t("mc.pc.concededCap")}</th>
                <th className="text-right font-medium">{t("mc.st.xgotAgainst")}</th>
                <th className="text-right font-medium">{t("mc.pc.extraSaved")}</th>
                <th className="text-right font-medium">{t("mc.pc.savesOnTarget")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const d = m.xgot_faced - m.ga;
                return (
                  <tr key={m.id} className="border-t border-slate-800/80 light:border-slate-200">
                    <td className="py-1.5 text-white light:text-slate-900">
                      <MatchName date={m.date} home={m.home} opponent={m.opponent_short} score={`${m.gf}:${m.ga}`} />
                    </td>
                    <td className="text-right tabular-nums text-rose-300">{m.ga}</td>
                    <td className="text-right tabular-nums" style={{ color: C.xgot }}>
                      {fmt(m.xgot_faced)}
                    </td>
                    <td className={`text-right tabular-nums ${d > 0.15 ? "text-emerald-400" : d < -0.15 ? "text-rose-400" : "text-slate-400 light:text-slate-500"}`}>
                      {d > 0 ? "+" : ""}
                      {fmt(d)}
                    </td>
                    <td className="text-right tabular-nums text-slate-300 light:text-slate-600">
                      {Math.round(m.saves)} / {Math.round(m.sot_faced)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function CardHead({
  kicker,
  title,
  lead,
  seasons,
  seasonId,
  onSeason,
  badges,
}: {
  kicker: string;
  title: string;
  lead: string;
  seasons?: SeasonOpt[];
  seasonId?: string;
  onSeason?: (id: string) => void;
  badges?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400">{kicker}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold text-white light:text-slate-900">{title}</h2>
          {badges}
        </div>
        <p className="text-sm text-slate-400 light:text-slate-500 mt-1">{lead}</p>
      </div>
      {seasons && seasonId && onSeason ? (
        <label className="shrink-0 text-[11px] uppercase tracking-wide text-slate-400 light:text-slate-500">
          {t("mc.pe.pl.season")}
          <SeasonSelect seasons={seasons} value={seasonId} onChange={onSeason} className="mt-1 block min-w-[9.5rem]" />
        </label>
      ) : null}
    </div>
  );
}

function SeasonSelect({
  seasons,
  value,
  onChange,
  className = "w-full",
}: {
  seasons: SeasonOpt[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${className} rounded-md border border-slate-700 bg-[#12161f] text-slate-100 text-xs px-2.5 py-1.5 light:bg-white light:border-slate-300 light:text-slate-800`}
    >
      {seasons.map((s) => (
        <option key={s.id} value={s.id} disabled={s.disabled}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

function TableToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-3 mx-auto flex items-center gap-2 rounded-md border border-slate-500 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 hover:border-slate-300 hover:bg-slate-700 light:bg-white light:border-slate-400 light:text-slate-800 light:hover:border-slate-600"
      aria-expanded={open}
    >
      <span className={`inline-block text-[11px] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
        ▼
      </span>
      {open ? t("mc.pc.hideTable") : t("mc.pc.showTable")}
    </button>
  );
}

function MatchName({ date, home, opponent, score }: { date: string; home: boolean; opponent: string; score?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular-nums text-slate-400 light:text-slate-500">{czDate(date)}</span>
      <VenueMark home={home} />
      {score ? <span className="font-mono text-xs text-slate-300 light:text-slate-700">{score}</span> : null}
      <span>{opponent}</span>
    </span>
  );
}

function VenueMark({ home }: { home: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
        home
          ? "bg-sky-500/15 text-sky-300 light:bg-sky-100 light:text-sky-700"
          : "bg-orange-500/15 text-orange-300 light:bg-orange-100 light:text-orange-700"
      }`}
      title={home ? t("mc.pc.venue.home") : t("mc.pc.venue.away")}
    >
      <span aria-hidden>{home ? "🏠" : "✈️"}</span>
      {home ? t("mc.pc.venueLetter.home") : t("mc.pc.venueLetter.away")}
    </span>
  );
}

function Ticker({ hover }: { hover: ShotView | null }) {
  return (
    <div className="mb-2 flex min-h-[2.25rem] items-center border-y border-slate-800/80 bg-slate-900/35 px-3 py-1.5 text-xs text-slate-300 light:border-slate-200 light:bg-slate-100/70 light:text-slate-700">
      {hover ? (
        <p className="leading-snug">
          {hover.minute}′ {hover.player}
          <span className="text-slate-400 light:text-slate-500"> · </span>
          {hover.kind === "set" ? t("mc.pc.setPieceLc") : t("mc.pc.openPlayLc")}
          <span className="text-slate-400 light:text-slate-500"> · </span>
          {outcomeOf(hover)}
          <span className="text-slate-400 light:text-slate-500"> · </span>
          xG {fmt(hover.xg)}
          <span className="text-slate-400 light:text-slate-500"> · </span>
          {t("mc.pc.fromGoal", { d: fmt(hover.depth, 1) })}
          <span className="text-slate-400 light:text-slate-500"> · </span>
          {czDate(hover.date)} {hover.home ? "🏠" : "✈️"} {hover.opponent_short}
        </p>
      ) : (
        <p className="text-slate-400 light:text-slate-500">{t("mc.pc.hover")}</p>
      )}
    </div>
  );
}

function TrendPlot({ data, mode }: { data: ChartPoint[]; mode: TrendMode }) {
  const asBars = data.length <= 6;
  const tick = { fill: "#94a3b8", fontSize: data.length > 16 ? 10 : 11 };
  const yAxis = (
    <YAxis domain={[0, 6]} ticks={[0, 2, 4, 6]} tick={tick} width={28} allowDataOverflow niceTicks="none" />
  );
  const tip = (
    <Tooltip
      cursor={asBars ? { fill: "rgba(148,163,184,0.08)" } : { stroke: "#64748b", strokeDasharray: "4 4" }}
      content={(props) => <TrendTooltip {...props} mode={mode} />}
    />
  );

  if (!data.length) return <p className="mt-4 text-sm text-slate-400 light:text-slate-500">{t("mc.pc.noMatches")}</p>;

  const dots =
    mode === "compare"
      ? [
          { key: "gf", name: t("mc.pe.col.g"), color: C.goals, r: 7 },
          { key: "xgot", name: "xGOT", color: C.xgot, r: 5.2 },
          { key: "xg", name: "xG", color: C.xg, r: 3.6 },
        ]
      : [
          { key: "gf", name: t("mc.pe.col.g"), color: C.goals, r: 7 },
          { key: "xg_set", name: t("mc.pc.xgSet"), color: C.set, r: 5.2 },
          { key: "xg_open", name: t("mc.pc.xgOpen"), color: C.open, r: 3.6 },
        ];

  return (
    <div className="h-80 mt-3">
      <ResponsiveContainer width="100%" height="100%">
        {asBars ? (
          <BarChart data={data} margin={{ top: 24, right: 8, left: 0, bottom: 8 }} barCategoryGap="18%" barGap={4}>
            <CartesianGrid stroke="rgba(51,65,85,0.5)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={tick}
              interval={0}
              angle={-28}
              height={52}
              textAnchor="end"
              padding={{ left: 14, right: 10 }}
            />
            {yAxis}
            {tip}
            {mode === "compare" ? (
              <>
                <Bar dataKey="gf" name={t("mc.pe.col.g")} fill={C.goals} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  <LabelList dataKey="gf" content={<BarValue decimals={0} fill={C.goals} />} />
                </Bar>
                <Bar dataKey="xgot" name="xGOT" fill={C.xgot} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  <LabelList dataKey="xgot" content={<BarValue decimals={2} fill={C.xgot} />} />
                </Bar>
                <Bar dataKey="xg" name="xG" fill={C.xg} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  <LabelList dataKey="xg" content={<BarValue decimals={2} fill={C.xg} />} />
                </Bar>
              </>
            ) : (
              <>
                <Bar dataKey="xg_open" name={t("mc.pc.xgOpen")} stackId="xg" fill={C.open} isAnimationActive={false} />
                <Bar dataKey="xg_set" name={t("mc.pc.xgSet")} stackId="xg" fill={C.set} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  <LabelList dataKey="xg" content={<BarValue decimals={2} fill="#e2e8f0" />} />
                </Bar>
                <Bar dataKey="gf" name={t("mc.pe.col.g")} fill={C.goals} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  <LabelList dataKey="gf" content={<BarValue decimals={0} fill={C.goals} />} />
                </Bar>
              </>
            )}
          </BarChart>
        ) : (
          <LineChart data={data} margin={{ top: 12, right: 16, left: 4, bottom: 8 }}>
            <CartesianGrid stroke="rgba(51,65,85,0.5)" strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tick={tick}
              interval={data.length > 20 ? "preserveStartEnd" : 0}
              minTickGap={8}
              angle={-28}
              height={52}
              textAnchor="end"
              padding={{ left: 14, right: 10 }}
              tickFormatter={(v) => (data.length > 16 ? String(v).split(" ").slice(-1)[0] : String(v))}
            />
            {yAxis}
            {tip}
            {dots.map((s) => (
              <Line
                key={s.key}
                type="linear"
                dataKey={s.key}
                name={s.name}
                stroke="none"
                dot={{ r: s.r, fill: s.color, stroke: "#0b1220", strokeWidth: 1.6 }}
                activeDot={{ r: s.r + 1.5, fill: s.color, stroke: "#fff", strokeWidth: 1.5 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function BarValue({
  x,
  y,
  width,
  value,
  decimals = 2,
  fill = "#f8fafc",
}: {
  x?: number;
  y?: number;
  width?: number;
  value?: number | string;
  decimals?: number;
  fill?: string;
}) {
  if (x == null || y == null || width == null || value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return (
    <text
      x={x + width / 2}
      y={y - 6}
      textAnchor="middle"
      fill={fill}
      stroke="#0b1220"
      strokeWidth={3}
      paintOrder="stroke"
      fontSize={11}
      fontWeight={700}
    >
      {decimals === 0 ? String(Math.round(n)) : fmt(n, decimals)}
    </text>
  );
}

type TipProps = {
  active?: boolean;
  payload?: readonly { payload?: ChartPoint }[];
  label?: string | number;
  mode: TrendMode;
};

function TrendTooltip({ active, payload, label, mode }: TipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  if (!row) return null;
  const items =
    mode === "compare"
      ? [
          { name: t("mc.pe.col.g"), value: row.gf, color: C.goals, decimals: 0 },
          { name: "xGOT", value: row.xgot, color: C.xgot, decimals: 2 },
          { name: "xG", value: row.xg, color: C.xg, decimals: 2 },
        ]
      : [
          { name: t("mc.pe.col.g"), value: row.gf, color: C.goals, decimals: 0 },
          { name: t("mc.pc.xgOpen"), value: row.xg_open, color: C.open, decimals: 2 },
          { name: t("mc.pc.xgSet"), value: row.xg_set, color: C.set, decimals: 2 },
        ];

  return (
    <div className="rounded-md border border-slate-700 bg-[#12161f] px-3 py-2 text-xs shadow-lg light:bg-white light:border-slate-200">
      <p className="text-slate-400 light:text-slate-500 mb-1.5">{row.label ?? label}</p>
      <ul className="space-y-0.5">
        {items.map((it) => (
          <li key={it.name} className="flex items-center justify-between gap-8">
            <span className="inline-flex items-center gap-1.5 text-slate-200 light:text-slate-800">
              <i className="h-2 w-2 rounded-sm" style={{ background: it.color }} />
              {it.name}
            </span>
            <span className="tabular-nums font-semibold" style={{ color: it.color }}>
              {it.decimals === 0 ? String(it.value) : fmt(it.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

function MiniStat({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: string;
  color: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 light:border-slate-200 px-3 py-2 text-center">
      <p className="text-[11px] uppercase tracking-wide" style={{ color }}>
        {label}
      </p>
      <p className="text-lg font-semibold tabular-nums text-white light:text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs leading-snug text-slate-400 light:text-slate-500">{hint}</p> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 light:border-slate-200 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400 light:text-slate-500">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-white light:text-slate-900">{value}</p>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`.trim()}>
      <p className="text-[11px] uppercase tracking-wide text-slate-400 light:text-slate-500 mb-1">{label}</p>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-md border border-slate-700 light:border-slate-300 overflow-hidden">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`flex-1 min-w-0 px-1.5 py-1.5 text-[11px] whitespace-nowrap ${
            value === id
              ? "bg-emerald-500 text-black"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700 light:bg-slate-100 light:text-slate-700 light:hover:bg-slate-200"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** FIFA 105×68 m. Útočný řez 40 m, stejné měřítko, branka nahoře. */
function Pitch({ shots, hover, onHover }: { shots: ShotView[]; hover: ShotView | null; onHover: (s: ShotView | null) => void }) {
  const clipId = useId().replace(/:/g, "");
  const PITCH_W = 68;
  const VIEW_D = 40;
  const BOX_W = 40.32;
  const SIX_W = 18.32;
  const GOAL_W = 7.32;
  const scale = 9;
  const padX = 16;
  const padY = 18;
  const innerW = PITCH_W * scale;
  const innerH = VIEW_D * scale;
  const W = innerW + padX * 2;
  const H = innerH + padY * 2;
  const x = (yM: number) => padX + (yM / PITCH_W) * innerW;
  const y = (depth: number) => padY + (Math.min(depth, VIEW_D) / VIEW_D) * innerH;
  const boxLeft = (PITCH_W - BOX_W) / 2;
  const sixLeft = (PITCH_W - SIX_W) / 2;
  const goalLeft = (PITCH_W - GOAL_W) / 2;
  const boxLine = y(16.5);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-lg bg-emerald-950/80 light:bg-emerald-900" role="img" aria-label={t("mc.pc.pitchAria")}>
      <defs>
        <clipPath id={clipId}>
          <rect x={padX} y={boxLine} width={innerW} height={padY + innerH - boxLine} />
        </clipPath>
      </defs>
      <rect x={padX} y={padY} width={innerW} height={innerH} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
      <line x1={x(PITCH_W / 2)} y1={padY} x2={x(PITCH_W / 2)} y2={padY + innerH} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 6" />
      <rect x={x(boxLeft)} y={y(0)} width={BOX_W * scale} height={16.5 * scale} fill="none" stroke="rgba(255,255,255,0.4)" />
      <rect x={x(sixLeft)} y={y(0)} width={SIX_W * scale} height={5.5 * scale} fill="none" stroke="rgba(255,255,255,0.4)" />
      <circle cx={x(PITCH_W / 2)} cy={y(11)} r="2.2" fill="rgba(255,255,255,0.7)" />
      <circle
        cx={x(PITCH_W / 2)}
        cy={y(11)}
        r={9.15 * scale}
        fill="none"
        stroke="rgba(255,255,255,0.4)"
        clipPath={`url(#${clipId})`}
      />
      <line x1={x(goalLeft)} y1={padY} x2={x(goalLeft + GOAL_W)} y2={padY} stroke="white" strokeWidth="4" />
      {shots.map((s, i) => {
        const r = 4 + s.xg * 10;
        const active = hover === s;
        const isGoal = s.goal;
        const onT = s.on_target || isGoal;
        const fill = s.kind === "set" ? C.setShot : C.play;
        return (
          <g key={`${s.player}-${s.minute}-${i}`}>
            {isGoal ? (
              <circle cx={x(s.y)} cy={y(s.depth)} r={r + 3} fill="none" stroke="#fff" strokeWidth="1.8" />
            ) : null}
            <circle
              cx={x(s.y)}
              cy={y(s.depth)}
              r={active ? r + 1.2 : r}
              fill={fill}
              opacity={isGoal || onT ? 1 : 0.28}
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
