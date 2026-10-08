import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Bar, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart } from "recharts";
import type { MatchRow, SeasonOpt, Shot } from "../components/PitchCards";
import { finishingLead, xgotEfficiencyBadge } from "../lib/xgEfficiency";
import { Card, Chip, Disclosure, Empty, Info, Seg, Stat, VenueTag, n1, n2 } from "../mc2/kit";
import { Pill } from "./kit";
import { intlTag, t } from "../i18n/locale";
import { fmtDayMonth } from "../lib/format";
import { uniqueTeamCodes } from "../lib/teamCode";

/* Grafy z PitchAPI v jazyce Match Center: barvy z témat (světlý i tmavý režim), ovládání z mc2/kit,
   čísla nahoře, graf pod nimi. Jedna sezóna na kartu, výběr sezóny řeší stránka. */

type Venue = "all" | "home" | "away";
type Recency = "all" | "5";

const COL = {
  goals: "var(--c-accent)",
  xgot: "var(--c-warn)",
  xg: "var(--c-home)",
  open: "var(--c-home)",
  set: "var(--c-away)",
};

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${n2(Math.abs(n))}`;
/** Datum bez roku: česky „6. 10.“, anglicky „06/10“. */
const czDate = (iso: string) => {
  const [, m, d] = iso.split("-");
  return fmtDayMonth(new Date(2000, Number(m) - 1, Number(d)));
};
const side = (home: boolean) => (home ? t("ct.pv.atHome") : t("ct.pv.atAway"));
const tone = (d: number, eps = 0.15) => (d > eps ? "var(--c-win)" : d < -eps ? "var(--c-loss)" : "var(--c-muted)");

/** Nejdřív okno (posledních 5 zápasů týmu), pak doma/venku uvnitř něj. Tak "Posledních 5" + "Doma" ukáže jen domácí zápasy z těch pěti. */
function pick(matches: MatchRow[], recency: Recency, venue: Venue) {
  const chrono = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  const windowed = recency === "all" ? chrono : chrono.slice(-5);
  return venue === "all" ? windowed : windowed.filter((m) => m.home === (venue === "home"));
}

/** Stav vybrané sezóny. Zápasy sezóny jsou v `seasons`, výběr řeší karta sama. */
function useSeason(seasons: SeasonOpt[], defaultSeason: string) {
  const [seasonId, setSeasonId] = useState(defaultSeason);
  const current = seasons.find((s) => s.id === seasonId) ?? seasons[0];
  return { seasonId: current?.id ?? defaultSeason, setSeasonId, matches: current?.matches ?? [], label: current?.label ?? "" };
}

function SeasonSelect({ seasons, value, onChange }: { seasons: SeasonOpt[]; value: string; onChange: (id: string) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-(--c-muted)">
      {t("ct.pv.season")}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-9 rounded-xl border border-(--c-line) bg-(--c-raised) px-3 text-xs font-medium text-(--c-text)"
      >
        {seasons.map((s) => (
          <option key={s.id} value={s.id} disabled={s.disabled}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MatchSelect({ matches, value, onChange }: { matches: MatchRow[]; value: string; onChange: (id: string) => void }) {
  const newest = [...matches].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return (
    <label className="inline-flex min-w-0 max-w-full items-center gap-2 text-xs text-(--c-muted)">
      {t("ct.pv.matchAria")}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t("ct.pv.matchAria")}
        className="min-h-9 min-w-0 max-w-full rounded-xl border border-(--c-line) bg-(--c-raised) px-3 text-xs font-medium text-(--c-text)"
      >
        <option value="all">{t("ct.pv.fullSeason")}</option>
        {newest.map((m) => (
          <option key={m.id} value={m.id}>
            {t("ct.pv.matchOpt", {
              date: czDate(m.date),
              opp: m.opponent,
              side: m.home ? t("ct.pv.tickHome") : t("ct.pv.tickAway"),
              gf: m.gf,
              ga: m.ga,
            })}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Období a místo. Stejné dva přepínače na všech třech kartách. */
function Controls({
  recency,
  setRecency,
  venue,
  setVenue,
  season,
}: {
  recency: Recency;
  setRecency: (v: Recency) => void;
  venue: Venue;
  setVenue: (v: Venue) => void;
  season?: { seasons: SeasonOpt[]; value: string; onChange: (id: string) => void };
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {season && <SeasonSelect seasons={season.seasons} value={season.value} onChange={season.onChange} />}
      <Seg
        label={t("ct.pv.periodAria")}
        value={recency}
        onChange={setRecency}
        options={[
          { id: "all", label: t("ct.pv.fullSeason") },
          { id: "5", label: t("ct.pv.last5") },
        ]}
      />
      <Seg
        label={t("ct.pv.venueAria")}
        value={venue}
        onChange={setVenue}
        options={[
          { id: "all", label: t("ct.pv.homeAway") },
          { id: "home", label: t("ct.pv.home") },
          { id: "away", label: t("ct.pv.away") },
        ]}
      />
    </div>
  );
}

function Legend({ items }: { items: { color: string; label: string; ring?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-(--c-muted)">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function ChartTip({ active, payload, rows }: { active?: boolean; payload?: readonly { payload?: { i: number } }[]; rows: { name: string; value: string; color: string }[][] }) {
  const i = payload?.[0]?.payload?.i;
  if (!active || i == null || !rows[i]) return null;
  return (
    <div className="rounded-xl border border-(--c-line) bg-(--c-raised) px-3 py-2 text-xs shadow-lg">
      <ul className="space-y-0.5">
        {rows[i].map((r, k) => (
          <li key={k} className={k === 0 ? "mb-1 text-(--c-muted)" : "flex items-center justify-between gap-6"}>
            {k === 0 ? (
              r.name
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 text-(--c-text)">
                  <i className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                  {r.name}
                </span>
                <span className="font-semibold tabular-nums text-(--c-text)">{r.value}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Popisek osy X: soupeř a pod ním D (doma) nebo V (venku). Datum je v tooltipu. */
function MatchTick({ x, y, payload, rows }: { x?: number; y?: number; payload?: { value: number }; rows: MatchRow[] }) {
  const m = payload ? rows[payload.value] : null;
  if (x == null || y == null || !m) return null;
  const dense = rows.length > 14;
  const code = uniqueTeamCodes(rows.map((r) => r.opponent)).get(m.opponent) || m.opponent_short;
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" dy={14} fontSize={dense ? 10 : 11} fontWeight={600} fill="var(--c-text)">
        {code}
      </text>
      {!dense && (
        <text textAnchor="middle" dy={28} fontSize={10} fontWeight={600} fill={m.home ? "var(--c-home)" : "var(--c-away)"}>
          {m.home ? t("ct.pv.tickHome") : t("ct.pv.tickAway")}
        </text>
      )}
    </g>
  );
}

function MatchTable({ head, rows }: { head: string[]; rows: { m: MatchRow; cells: ReactNode[] }[] }) {
  const codes = uniqueTeamCodes(rows.map((r) => r.m.opponent));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-(--c-faint)">
            <th className="py-1.5 text-left font-medium">{t("ct.pv.colMatch")}</th>
            {head.map((h) => (
              <th key={h} className="text-right font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ m, cells }) => (
            <tr key={m.id} className="border-t border-(--c-line)">
              <td className="py-2">
                <span className="inline-flex items-center gap-2 text-(--c-text)">
                  <span className="tabular-nums text-(--c-muted)">{czDate(m.date)}</span>
                  <VenueTag home={m.home} />
                  <span>{codes.get(m.opponent) || m.opponent_short}</span>
                  <span className="text-xs text-(--c-faint)">
                    {m.gf}:{m.ga}
                  </span>
                </span>
              </td>
              {cells.map((c, i) => (
                <td key={i} className="text-right tabular-nums">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Trend střelby ---------- */

export function TrendCard({ team, seasons, defaultSeason }: { team: string; seasons: SeasonOpt[]; defaultSeason: string }) {
  const { seasonId, setSeasonId, matches, label: season } = useSeason(seasons, defaultSeason);
  const [recency, setRecency] = useState<Recency>("all");
  const [venue, setVenue] = useState<Venue>("all");
  const [mode, setMode] = useState<"compare" | "split">("compare");
  const rows = useMemo(() => pick(matches, recency, venue), [matches, recency, venue]);

  const goals = rows.reduce((s, m) => s + m.gf, 0);
  const xg = rows.reduce((s, m) => s + m.xg, 0);
  const xgot = rows.reduce((s, m) => s + m.xgot, 0);
  const diff = goals - xgot;
  const badge = xgotEfficiencyBadge(goals, xgot, recency === "5" ? "last5" : "season");

  const data = rows.map((m, i) => ({ i, gf: m.gf, xg: m.xg, xgot: m.xgot, open: m.xg_open, set: m.xg_set }));
  const top = Math.max(3, Math.ceil(Math.max(0, ...data.map((d) => Math.max(d.gf, d.xg, d.xgot, d.open + d.set)))));
  const tips = rows.map((m, i) => [
    { name: `${czDate(m.date)} ${side(m.home)} · ${m.opponent_short} ${m.gf}:${m.ga}`, value: "", color: "" },
    ...(mode === "compare"
      ? [
          { name: t("ct.pv.goals"), value: String(m.gf), color: COL.goals },
          { name: "xGOT", value: n2(data[i].xgot), color: COL.xgot },
          { name: "xG", value: n2(data[i].xg), color: COL.xg },
        ]
      : [
          { name: t("ct.pv.goals"), value: String(m.gf), color: COL.goals },
          { name: t("ct.pv.openXg"), value: n2(data[i].open), color: COL.open },
          { name: t("ct.pv.setXg"), value: n2(data[i].set), color: COL.set },
        ]),
  ]);

  return (
    <Card
      title={t("ct.pv.trendTitle")}
      lead={rows.length ? finishingLead(team, goals, xgot).replace(t("ct.pv.trendWindow"), recency === "5" ? t("ct.pv.trendWindowLast5") : t("ct.pv.trendWindowSeason")) : t("ct.pv.seasonLead", { season })}
      aside={badge ? <Pill tone={badge.id === "lucky_scoring_team" ? "var(--c-warn)" : "var(--c-loss)"}>{badge.label}</Pill> : undefined}
    >
      <Controls recency={recency} setRecency={setRecency} venue={venue} setVenue={setVenue} season={{ seasons, value: seasonId, onChange: setSeasonId }} />

      {!rows.length ? (
        <div className="mt-4">
          <Empty>{t("ct.pv.noMatches")}</Empty>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat value={goals} label={t("ct.pv.goals")} tone={COL.goals} />
            <Stat value={n2(xgot)} label="xGOT" tone={COL.xgot} hint={t("ct.pv.xgotHint")} />
            <Stat value={n2(xg)} label="xG" tone={COL.xg} hint={t("ct.pv.xgHint")} />
            <Stat
              value={signed(diff)}
              label={t("ct.pv.goalsMinusXgot")}
              tone={tone(diff)}
              hint={t("ct.pv.goalsMinusXgotHint")}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <Legend
              items={
                mode === "compare"
                  ? [
                      { color: COL.goals, label: t("ct.pv.legendGoalsBar") },
                      { color: COL.xgot, label: "xGOT" },
                      { color: COL.xg, label: "xG" },
                    ]
                  : [
                      { color: COL.open, label: t("ct.pv.openXg") },
                      { color: COL.set, label: t("ct.pv.setXg") },
                      { color: COL.goals, label: t("ct.pv.goals") },
                    ]
              }
            />
            <div className="flex gap-1.5">
              <Chip active={mode === "compare"} onClick={() => setMode("compare")}>
                {t("ct.pv.chipGoalsVsXg")}
              </Chip>
              <Chip active={mode === "split"} onClick={() => setMode("split")}>
                {t("ct.pv.chipSplit")}
              </Chip>
            </div>
          </div>

          <div className="mt-2 h-64 sm:h-72" role="img" aria-label={t("ct.pv.trendAria")}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }} barCategoryGap="22%">
                <XAxis dataKey="i" tickLine={false} axisLine={{ stroke: "var(--c-line)" }} interval={data.length > 14 ? 1 : 0} height={rows.length > 14 ? 24 : 38} tick={<MatchTick rows={rows} />} />
                <YAxis domain={[0, top]} ticks={Array.from({ length: top + 1 }, (_, i) => i)} allowDecimals={false} tickLine={false} axisLine={false} width={34} tick={{ fill: "var(--c-faint)", fontSize: 11 }} />
                {[1, 2, 3, 4, 5, 6].filter((v) => v <= top).map((v) => (
                  <ReferenceLine key={v} y={v} stroke="var(--c-line)" strokeDasharray="3 4" />
                ))}
                <Tooltip cursor={{ fill: "var(--c-raised)", opacity: 0.6 }} content={(p) => <ChartTip {...p} rows={tips} />} />
                {mode === "compare" ? (
                  <>
                    <Bar dataKey="gf" fill={COL.goals} fillOpacity={0.85} radius={[5, 5, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                    <Line dataKey="xgot" stroke="none" isAnimationActive={false} activeDot={false} dot={{ r: 5, fill: COL.xgot, stroke: "var(--c-surface)", strokeWidth: 2 }} />
                    <Line dataKey="xg" stroke="none" isAnimationActive={false} activeDot={false} dot={{ r: 4.5, fill: COL.xg, stroke: "var(--c-surface)", strokeWidth: 2 }} />
                  </>
                ) : (
                  <>
                    <Bar dataKey="open" stackId="xg" fill={COL.open} fillOpacity={0.8} maxBarSize={28} isAnimationActive={false} />
                    <Bar dataKey="set" stackId="xg" fill={COL.set} fillOpacity={0.8} radius={[5, 5, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                    <Line dataKey="gf" stroke="none" isAnimationActive={false} activeDot={false} dot={{ r: 6, fill: COL.goals, stroke: "var(--c-surface)", strokeWidth: 2 }} />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3">
            <Disclosure summary={t("ct.pv.table")}>
              <MatchTable
                head={[t("ct.pv.goals"), "xGOT", "xG", t("ct.pv.goalsMinusXgot")]}
                rows={[...rows].reverse().map((m) => {
                  const d = m.gf - m.xgot;
                  return {
                    m,
                    cells: [
                      <b key="g" className="text-(--c-text)">{m.gf}</b>,
                      <span key="a" className="text-(--c-muted)">{n2(m.xgot)}</span>,
                      <span key="b" className="text-(--c-muted)">{n2(m.xg)}</span>,
                      <span key="c" style={{ color: tone(d) }}>{signed(d)}</span>,
                    ],
                  };
                })}
              />
            </Disclosure>
          </div>
        </>
      )}
    </Card>
  );
}

/* ---------- Mapa střel ---------- */

type Cut = "all" | "on_target" | "off" | "goal";
type Kind = "all" | "play" | "set";
type ShotView = Shot & { date: string; home: boolean; opponent_short: string };

const SHOT = { play: "#fbbf24", set: "#38bdf8" };

export function ShotMapCard({
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
  const { seasonId, setSeasonId, matches } = useSeason(seasons, defaultSeason);
  const [matchId, setMatchId] = useState("all");
  const [venue, setVenue] = useState<Venue>("all");
  const [cut, setCut] = useState<Cut>("all");
  const [kind, setKind] = useState<Kind>("all");
  const [hover, setHover] = useState<ShotView | null>(null);
  const [pinned, setPinned] = useState<ShotView | null>(null);

  useEffect(() => {
    if (matchId !== "all" && !matches.some((m) => m.id === matchId)) setMatchId("all");
  }, [matches, matchId]);
  useEffect(() => {
    setHover(null);
    setPinned(null);
  }, [matchId, venue, seasonId, cut, kind]);

  const rows = useMemo(() => {
    if (matchId !== "all") {
      const one = matches.find((m) => m.id === matchId);
      return one ? [one] : [];
    }
    return pick(matches, "all", venue);
  }, [matches, matchId, venue]);
  const all: ShotView[] = useMemo(() => rows.flatMap((m) => shotsOf(m).map((s) => ({ ...s, date: m.date, home: m.home, opponent_short: m.opponent_short }))), [rows, shotsOf]);
  const shots = all.filter((s) => {
    if (cut === "goal" && !s.goal) return false;
    if (cut === "on_target" && !(s.on_target || s.goal)) return false;
    if (cut === "off" && (s.on_target || s.goal)) return false;
    if (kind !== "all" && s.kind !== kind) return false;
    return true;
  });
  const onT = shots.filter((s) => s.on_target || s.goal).length;
  const goals = shots.filter((s) => s.goal).length;
  const xg = shots.reduce((s, x) => s + x.xg, 0);
  const shown = pinned ?? hover;

  return (
    <Card title={title} lead={lead}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {showSeason && <SeasonSelect seasons={seasons} value={seasonId} onChange={setSeasonId} />}
        <MatchSelect matches={matches} value={matchId} onChange={setMatchId} />
        {matchId === "all" && (
          <Seg
            label={t("ct.pv.venueAria")}
            value={venue}
            onChange={setVenue}
            options={[
              { id: "all", label: t("ct.pv.homeAway") },
              { id: "home", label: t("ct.pv.home") },
              { id: "away", label: t("ct.pv.away") },
            ]}
          />
        )}
      </div>
      {!rows.length ? (
        <div className="mt-4">
          <Empty>{t("ct.pv.noMatches")}</Empty>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_11rem]">
          <div className="grid grid-cols-4 gap-2 md:order-2 md:grid-cols-1 md:content-start">
            <Stat value={shots.length} label={t("ct.pv.shots")} hint={t("ct.pv.shotsHint", { n: rows.length })} />
            <Stat value={shots.length ? t("fmt.pct", { n: Math.round((100 * onT) / shots.length) }) : "—"} label={t("ct.pv.onTarget")} />
            <Stat value={goals} label={t("ct.pv.goals")} tone={COL.goals} />
            <Stat value={n2(xg)} label="xG" tone={COL.xg} hint={t("ct.pv.xgSumHint")} />
          </div>

          <div className="min-w-0 md:order-1">
            <Pitch shots={shots} active={shown} onHover={setHover} onPin={(s) => setPinned((p) => (p === s ? null : s))} />
            <div className="mt-2 flex min-h-11 items-center rounded-xl bg-(--c-raised) px-3 py-2 text-xs text-(--c-muted)">
              {shown ? (
                <p className="leading-snug">
                  <b className="text-(--c-text)">
                    {shown.minute}′ {shown.player}
                  </b>
                  {" · "}
                  {shown.goal ? t("ct.pv.tipGoal") : shown.on_target ? t("ct.pv.tipOnTarget") : t("ct.pv.tipOff")}
                  {" · "}
                  {shown.kind === "set" ? t("ct.pv.tipSet") : t("ct.pv.tipOpen")}
                  {" · "}xG {n2(shown.xg)}
                  {" · "}
                  {t("ct.pv.fromGoal", { v: n1(shown.depth) })}
                  {" · "}
                  {czDate(shown.date)} {side(shown.home)} {shown.opponent_short}
                </p>
              ) : (
                <p>{t("ct.pv.hoverHint")}</p>
              )}
            </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">{t("ct.pv.cutLabel")}</span>
          {(
            [
              ["all", t("ct.pv.cutAll")],
              ["on_target", t("ct.pv.onTarget")],
              ["off", t("ct.pv.cutOff")],
              ["goal", t("ct.pv.goals")],
            ] as [Cut, string][]
          ).map(([id, label]) => (
            <Chip key={id} active={cut === id} onClick={() => setCut(id)}>
              {label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">{t("ct.pv.typeLabel")}</span>
          {(
            [
              ["all", t("ct.pv.kindAll")],
              ["play", t("ct.pv.kindPlay")],
              ["set", t("ct.pv.kindSet")],
            ] as [Kind, string][]
          ).map(([id, label]) => (
            <Chip key={id} active={kind === id} onClick={() => setKind(id)}>
              {label}
            </Chip>
          ))}
        </div>
      </div>

            <div className="mt-3">
              <Legend
                items={[
                  { color: SHOT.play, label: t("ct.pv.kindPlay") },
                  { color: SHOT.set, label: t("ct.pv.kindSet") },
                ]}
              />
              <p className="mt-1 text-xs text-(--c-faint)">{t("ct.pv.dotLegend")}</p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/** FIFA 105×68 m. Útočný řez 40 m, branka nahoře. */
function Pitch({ shots, active, onHover, onPin }: { shots: ShotView[]; active: ShotView | null; onHover: (s: ShotView | null) => void; onPin: (s: ShotView) => void }) {
  const clip = useId().replace(/:/g, "");
  const PW = 68;
  const VD = 40;
  const scale = 9;
  const pad = 14;
  const iw = PW * scale;
  const ih = VD * scale;
  const W = iw + pad * 2;
  const H = ih + pad * 2;
  const x = (m: number) => pad + (m / PW) * iw;
  const y = (d: number) => pad + (Math.min(d, VD) / VD) * ih;
  const line = "rgba(255,255,255,0.42)";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-xl border border-(--c-line)" role="img" aria-label={t("ct.pv.pitchAria")} style={{ background: "linear-gradient(180deg,#14532d,#0f3d2a)" }}>
      <defs>
        <clipPath id={clip}>
          <rect x={pad} y={y(16.5)} width={iw} height={ih + pad - y(16.5) + pad} />
        </clipPath>
      </defs>
      <rect x={pad} y={pad} width={iw} height={ih} fill="none" stroke={line} strokeWidth="2" />
      <rect x={x((PW - 40.32) / 2)} y={y(0)} width={40.32 * scale} height={16.5 * scale} fill="none" stroke={line} />
      <rect x={x((PW - 18.32) / 2)} y={y(0)} width={18.32 * scale} height={5.5 * scale} fill="none" stroke={line} />
      <circle cx={x(PW / 2)} cy={y(11)} r="2.2" fill={line} />
      <circle cx={x(PW / 2)} cy={y(11)} r={9.15 * scale} fill="none" stroke={line} clipPath={`url(#${clip})`} />
      <line x1={x((PW - 7.32) / 2)} y1={pad} x2={x((PW + 7.32) / 2)} y2={pad} stroke="#fff" strokeWidth="4" />
      {shots.map((s, i) => {
        const r = 3.5 + s.xg * 11;
        const col = s.kind === "set" ? SHOT.set : SHOT.play;
        const hit = s.on_target || s.goal;
        const on = active === s;
        return (
          <g key={i} onMouseEnter={() => onHover(s)} onMouseLeave={() => onHover(null)} onClick={() => onPin(s)} className="cursor-pointer">
            {s.goal && <circle cx={x(s.y)} cy={y(s.depth)} r={r + 3.5} fill="none" stroke="#fff" strokeWidth="1.8" />}
            <circle
              cx={x(s.y)}
              cy={y(s.depth)}
              r={on ? r + 1.5 : r}
              fill={hit ? col : "none"}
              fillOpacity={0.92}
              stroke={on ? "#fff" : col}
              strokeWidth={hit ? (on ? 2 : 0) : 2}
            />
            {/* větší terč pro prst */}
            <circle cx={x(s.y)} cy={y(s.depth)} r={Math.max(r, 12)} fill="transparent" />
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- Brankář ---------- */

export function KeeperCardV2({ name, seasons, defaultSeason, showSeason = true }: { name: string; seasons: SeasonOpt[]; defaultSeason: string; showSeason?: boolean }) {
  const { seasonId, setSeasonId, matches } = useSeason(seasons, defaultSeason);
  const [recency, setRecency] = useState<Recency>("all");
  const [venue, setVenue] = useState<Venue>("all");
  const rows = useMemo(() => pick(matches, recency, venue), [matches, recency, venue]);
  const faced = rows.reduce((s, m) => s + m.xgot_faced, 0);
  const conceded = rows.reduce((s, m) => s + m.ga, 0);
  const saves = Math.round(rows.reduce((s, m) => s + m.saves, 0));
  const sot = Math.round(rows.reduce((s, m) => s + m.sot_faced, 0));
  const prevented = faced - conceded;
  const data = rows.map((m, i) => ({ i, d: m.xgot_faced - m.ga }));
  const lim = Math.max(1, Math.ceil(Math.max(0, ...data.map((d) => Math.abs(d.d))) * 2) / 2);
  const line =
    prevented >= 0.05
      ? t("ct.pv.kpSaved", { v: n2(prevented) })
      : prevented <= -0.05
        ? t("ct.pv.kpConceded", { v: n2(-prevented) })
        : t("ct.pv.kpFlat");

  return (
    <Card title={name} lead={t("ct.pv.kpLead")}>
      <Controls recency={recency} setRecency={setRecency} venue={venue} setVenue={setVenue} season={showSeason ? { seasons, value: seasonId, onChange: setSeasonId } : undefined} />
      {!rows.length ? (
        <div className="mt-4">
          <Empty>{t("ct.pv.noMatches")}</Empty>
        </div>
      ) : (
        <>
          <div className="mt-4 rounded-2xl bg-(--c-raised) px-4 py-4 text-center">
            <div className="text-4xl font-bold tabular-nums" style={{ color: tone(prevented, 0.05) }}>
              {signed(prevented)}
            </div>
            <p className="mt-1.5 text-sm text-(--c-muted)">
              {t("ct.pv.kpLine", { line, matches: t("ct.nMatches", { n: rows.length }) })}
            </p>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat value={n2(faced)} label={t("ct.pv.xgotAgainst")} tone={COL.xgot} hint={t("ct.pv.xgotAgainstHint")} />
            <Stat value={conceded} label={t("ct.pv.conceded")} />
            <Stat value={`${saves} / ${sot}`} label={t("ct.pv.savesOnTarget")} />
            <Stat value={sot ? t("fmt.pct", { n: Math.round((100 * saves) / sot) }) : "—"} label={t("ct.pv.saveRate")} />
          </div>

          <h3 className="mb-1 mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">
            {t("ct.pv.extraTitle")}
            <Info>{t("ct.pv.extraInfo")}</Info>
          </h3>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="25%">
                <XAxis dataKey="i" tickLine={false} axisLine={false} interval={data.length > 14 ? 1 : 0} height={rows.length > 14 ? 24 : 38} tick={<MatchTick rows={rows} />} />
                <YAxis domain={[-lim, lim]} ticks={[-lim, 0, lim]} tickLine={false} axisLine={false} width={40} tick={{ fill: "var(--c-faint)", fontSize: 11 }} tickFormatter={(v) => Number(v).toLocaleString(intlTag())} />
                <ReferenceLine y={0} stroke="var(--c-faint)" />
                <Tooltip
                  cursor={{ fill: "var(--c-raised)", opacity: 0.6 }}
                  content={(p) => {
                    const i = p.payload?.[0]?.payload?.i as number | undefined;
                    const m = i != null ? rows[i] : null;
                    if (!p.active || !m) return null;
                    return (
                      <div className="rounded-xl border border-(--c-line) bg-(--c-raised) px-3 py-2 text-xs shadow-lg">
                        <p className="mb-1 text-(--c-muted)">
                          {czDate(m.date)} {side(m.home)} · {m.opponent_short} {m.gf}:{m.ga}
                        </p>
                        <p className="text-(--c-text)">
                          {t("ct.pv.tipConceded", { ga: m.ga, x: n2(m.xgot_faced) })}
                        </p>
                        <p className="font-semibold" style={{ color: tone(m.xgot_faced - m.ga) }}>
                          {signed(m.xgot_faced - m.ga)}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="d" radius={3} maxBarSize={26} isAnimationActive={false}>
                  {data.map((d) => (
                    <Cell key={d.i} fill={d.d >= 0 ? "var(--c-win)" : "var(--c-loss)"} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3">
            <Disclosure summary={t("ct.pv.table")}>
              <MatchTable
                head={[t("ct.pv.conceded"), t("ct.pv.xgotAgainst"), t("ct.pv.extraSaved"), t("ct.pv.savesOnTarget")]}
                rows={[...rows].reverse().map((m) => {
                  const d = m.xgot_faced - m.ga;
                  return {
                    m,
                    cells: [
                      <b key="a" className="text-(--c-text)">{m.ga}</b>,
                      <span key="b" className="text-(--c-muted)">{n2(m.xgot_faced)}</span>,
                      <span key="c" style={{ color: tone(d) }}>{signed(d)}</span>,
                      <span key="d" className="text-(--c-muted)">{Math.round(m.saves)} / {Math.round(m.sot_faced)}</span>,
                    ],
                  };
                })}
              />
            </Disclosure>
          </div>
        </>
      )}
    </Card>
  );
}
