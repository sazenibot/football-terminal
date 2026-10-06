import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MatchData, RadarAverages, TeamBrief } from "../types";
import type { MatchRow, PitchCatalogFile } from "../components/PitchCards";
import { goalUnit } from "../lib/xgEfficiency";
import { pickWindow, rowsBefore, type RadarView, type RadarXgot } from "../lib/pitchMatch";
import { Card, Empty, Info, MirrorRow, Seg, SideHeads, SubTitle, TeamTitle, n2 } from "./kit";
import { intlTag, t, type Key } from "../i18n/locale";

/* ---------- Srovnání týmů ---------- */

type Def = { key: keyof RadarAverages | "xgot_for" | "xgot_against"; label: Key; digits?: number; lowerBetter?: boolean; suffix?: Key; hint?: Key };

const ATTACK: Def[] = [
  { key: "goals_for", label: "mc.st.goalsFor", digits: 2 },
  { key: "xgot_for", label: "mc.fh.xgot", digits: 2, hint: "mc.st.xgotForHint" },
  { key: "shots", label: "mc.pr.shots" },
  { key: "sot", label: "mc.pr.sot" },
  { key: "corners", label: "mc.pr.corners" },
];
const DEFENCE: Def[] = [
  { key: "goals_against", label: "mc.st.goalsAgainst", digits: 2, lowerBetter: true },
  { key: "xgot_against", label: "mc.st.xgotAgainst", digits: 2, lowerBetter: true, hint: "mc.st.xgotAgainstHint" },
];
const GAME: Def[] = [
  { key: "possession", label: "mc.fh.possession", digits: 0, suffix: "mc.fh.pctSuffix" },
  { key: "fouls_committed", label: "mc.st.foulsCommitted", lowerBetter: true },
  { key: "fouls_received", label: "mc.st.foulsReceived" },
  { key: "cards", label: "mc.st.cards", lowerBetter: true },
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
  xgot_for: [0, 2.5],
  xgot_against: [0, 2.5],
};
const norm = (k: string, v: number) => {
  const [a, b] = RANGE[k];
  return Math.max(0, Math.min(100, Math.round(((v - a) / (b - a)) * 100)));
};

const viewsFor = (home: string): { id: RadarView; label: string }[] => [
  { id: "season", label: t("mc.pe.pl.season") },
  { id: "last5", label: t("mc.pe.pl.last5") },
  { id: "last3_h2h", label: t("mc.st.view.h2h3") },
  { id: "last3_h2h_home_venue", label: t("mc.st.view.h2h3home", { team: home }) },
];

export function TeamCompareCard({ m, xgot }: { m: MatchData; xgot?: RadarXgot }) {
  const [view, setView] = useState<RadarView>("season");
  const [mode, setMode] = useState<"bars" | "radar">("radar");
  const data = m.radar[view];
  const hasData = !!data.home && !!data.away;
  const xv = xgot?.[view] ?? null;

  const val = (side: "home" | "away", k: Def["key"]): number | null => {
    if (k === "xgot_for") return xv ? xv[side].xgot_for : null;
    if (k === "xgot_against") return xv ? xv[side].xgot_against : null;
    const src = data[side];
    return src ? src[k as keyof RadarAverages] : null;
  };
  const groups = [
    { title: "mc.st.grp.attack" as Key, defs: ATTACK },
    { title: "mc.st.grp.defence" as Key, defs: DEFENCE },
    { title: "mc.st.grp.game" as Key, defs: GAME },
  ].map((g) => ({ ...g, defs: g.defs.filter((d) => !(d.key.startsWith("xgot") && !xv)) }));

  const radarData = useMemo(() => {
    if (!hasData) return [];
    const defs = groups.flatMap((g) => g.defs);
    return defs.map((d) => ({
      metric: t(d.label),
      home: norm(d.key, val("home", d.key) ?? 0),
      away: norm(d.key, val("away", d.key) ?? 0),
      homeRaw: val("home", d.key),
      awayRaw: val("away", d.key),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, hasData, xv]);

  return (
    <Card
      title={t("mc.st.cmp.title")}
      lead={t("mc.st.cmp.lead")}
      aside={
        <Seg
          label={t("mc.st.cmp.view")}
          value={mode}
          onChange={setMode}
          options={[
            { id: "radar", label: "Radar" },
            { id: "bars", label: t("mc.st.cmp.numbers") },
          ]}
        />
      }
    >
      <div className="mb-4">
        <Seg wrap label={t("mc.pe.pl.period")} value={view} onChange={setView} options={viewsFor(m.home.name)} />
      </div>
      {!hasData ? (
        <Empty>{t("mc.st.cmp.notEnough", { team: m.home.name })}</Empty>
      ) : mode === "bars" ? (
        <div>
          <SideHeads home={m.home} away={m.away} />
          {groups.map((g) => (
            <div key={g.title} className="mt-3">
              <SubTitle>{t(g.title)}</SubTitle>
              <div className="divide-y divide-(--c-line)/60">
                {g.defs.map((d) => (
                  <MirrorRow
                    key={d.key}
                    label={t(d.label)}
                    hint={d.hint ? t(d.hint) : undefined}
                    digits={d.digits ?? 1}
                    lowerBetter={d.lowerBetter}
                    suffix={d.suffix ? t(d.suffix) : undefined}
                    home={val("home", d.key)}
                    away={val("away", d.key)}
                  />
                ))}
              </div>
            </div>
          ))}
          {xgot && !xv && <p className="mt-3 text-[11px] text-(--c-faint)">{t("mc.st.cmp.noXgot")}</p>}
          {xv && (view === "last3_h2h" || view === "last3_h2h_home_venue") && (
            <p className="mt-3 text-[11px] text-(--c-faint)">{t("mc.st.cmp.xgotFrom", { n: xv.home.n })}</p>
          )}
        </div>
      ) : (
        <div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="var(--c-line)" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: "var(--c-muted)", fontSize: 11 }} />
                <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
                <Radar name={m.home.name} dataKey="home" stroke="var(--c-home)" fill="var(--c-home)" fillOpacity={0.22} strokeWidth={2} />
                <Radar name={m.away.name} dataKey="away" stroke="var(--c-away)" fill="var(--c-away)" fillOpacity={0.18} strokeWidth={2} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip
                  content={({ active, payload }) => {
                    const p = active ? (payload?.[0]?.payload as (typeof radarData)[number] | undefined) : undefined;
                    if (!p) return null;
                    return (
                      <div className="rounded-lg border border-(--c-line) bg-(--c-raised) px-3 py-2 text-xs shadow-xl">
                        <div className="mb-1 font-semibold">{p.metric}</div>
                        <div style={{ color: "var(--c-home)" }}>{m.home.name}: {p.homeRaw != null ? n2(p.homeRaw) : "—"}</div>
                        <div style={{ color: "var(--c-away)" }}>{m.away.name}: {p.awayRaw != null ? n2(p.awayRaw) : "—"}</div>
                      </div>
                    );
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-(--c-faint)">{t("mc.st.cmp.radarNote")}</p>
        </div>
      )}
    </Card>
  );
}

/* ---------- Góly vs xGOT ---------- */

type Tot = { n: number; goals: number; xgot: number; against: number; faced: number; saves: number; sotFaced: number };
const goalsOf = (r: MatchRow) => r.goals ?? r.gf;
const againstOf = (r: MatchRow) => r.goals_against ?? r.ga;
const tot = (rows: MatchRow[]): Tot =>
  rows.reduce<Tot>(
    (a, r) => ({
      n: a.n + 1,
      goals: a.goals + goalsOf(r),
      xgot: a.xgot + r.xgot,
      against: a.against + againstOf(r),
      faced: a.faced + r.xgot_faced,
      saves: a.saves + r.saves,
      sotFaced: a.sotFaced + r.sot_faced,
    }),
    { n: 0, goals: 0, xgot: 0, against: 0, faced: 0, saves: 0, sotFaced: 0 },
  );

const GAP = 0.15;

function verdicts(team: string, tt: Tot): { text: string; tone: "good" | "bad" | "flat" }[] {
  if (!tt.n) return [];
  const out: { text: string; tone: "good" | "bad" | "flat" }[] = [];
  const a = tt.goals - tt.xgot;
  const fv = { team, goals: tt.goals, xgot: n2(tt.xgot) };
  out.push(
    a > GAP
      ? { tone: "good", text: t("mc.st.v.moreGoals", fv) }
      : a < -GAP
        ? { tone: "bad", text: t("mc.st.v.fewerGoals", fv) }
        : { tone: "flat", text: t("mc.st.v.sameGoals", fv) },
  );
  const d = tt.faced - tt.against;
  const kv = { team, against: tt.against, unit: goalUnit(tt.against), faced: n2(tt.faced) };
  out.push(
    d > GAP
      ? { tone: "good", text: t("mc.st.v.keeperAbove", kv) }
      : d < -GAP
        ? { tone: "bad", text: t("mc.st.v.keeperBelow", kv) }
        : { tone: "flat", text: t("mc.st.v.keeperAsExpected", kv) },
  );
  return out;
}

const toneColor = { good: "var(--c-win)", bad: "var(--c-loss)", flat: "var(--c-draw)" };

function verdictChip(i: number, tone: "good" | "bad" | "flat"): string {
  if (tone === "flat") return t("mc.st.chip.flat");
  if (i === 0) return tone === "good" ? t("mc.luck.lucky") : t("mc.luck.unlucky");
  return tone === "good" ? t("mc.st.chip.keeperAbove") : t("mc.st.chip.keeperBelow");
}

type Bar1 = { label: string; goals: number; xgot: number; row: MatchRow };

function TeamChart({ team, side, rows, mode, total }: { team: TeamBrief; side: "home" | "away"; rows: MatchRow[]; mode: "attack" | "keeper"; total: Tot }) {
  const color = side === "home" ? "var(--c-home)" : "var(--c-away)";
  const data: Bar1[] = rows.map((r) => ({
    label: r.opponent.replace(/^(FC|FK|SK|MFK|AC)\s+/i, "").slice(0, 3).toUpperCase(),
    goals: mode === "attack" ? goalsOf(r) : againstOf(r),
    xgot: mode === "attack" ? r.xgot : r.xgot_faced,
    row: r,
  }));
  const max = Math.max(1, ...data.map((d) => Math.max(d.goals, d.xgot)));
  const sumGoals = mode === "attack" ? total.goals : total.against;
  const sumX = mode === "attack" ? total.xgot : total.faced;
  return (
    <div className="min-w-0">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
        <TeamTitle team={team} side={side} />
        <span className="text-xs tabular-nums text-(--c-muted)">
          {mode === "attack" ? t("mc.pe.col.g") : t("mc.st.conceded")} <b className="text-(--c-text)">{sumGoals}</b> · xGOT <b className="text-(--c-text)">{n2(sumX)}</b>
        </span>
      </div>
      {data.length === 0 ? (
        <Empty>{t("mc.st.noLeague")}</Empty>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--c-line)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--c-muted)", fontSize: 11 }} stroke="var(--c-line)" interval={0} />
              <YAxis tick={{ fill: "var(--c-muted)", fontSize: 11 }} width={24} allowDecimals={false} domain={[0, Math.ceil(max)]} stroke="var(--c-line)" />
              <Tooltip
                cursor={{ fill: "var(--c-raised)", opacity: 0.5 }}
                content={({ active, payload }) => {
                  const p = active ? (payload?.[0]?.payload as Bar1 | undefined) : undefined;
                  if (!p) return null;
                  const r = p.row;
                  const day = new Date(r.date).toLocaleDateString(intlTag(), { day: "numeric", month: "numeric" });
                  return (
                    <div className="rounded-lg border border-(--c-line) bg-(--c-raised) px-3 py-2 text-xs shadow-xl">
                      <div className="mb-1 font-semibold">
                        {day} {r.home ? "vs" : "@"} {r.opponent}
                      </div>
                      <div>
                        {mode === "attack" ? t("mc.st.goalsFor") : t("mc.st.goalsAgainst")}: <b>{p.goals}</b>
                      </div>
                      <div>
                        xGOT: <b>{n2(p.xgot)}</b>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="goals" name={t("mc.st.actualGoals")} fill={color} fillOpacity={0.85} radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Line dataKey="xgot" name="xGOT" stroke="var(--c-text)" strokeWidth={2} dot={{ r: 3.5, fill: "var(--c-text)", stroke: "var(--c-surface)", strokeWidth: 1.5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function GoalsXgotCard({ m, homeFile, awayFile }: { m: MatchData; homeFile: PitchCatalogFile | null; awayFile: PitchCatalogFile | null }) {
  const [mode, setMode] = useState<"attack" | "keeper">("attack");
  if (!homeFile || !awayFile) return null;
  if (m.league_id && homeFile.league_id !== m.league_id) return null;
  const hw = pickWindow(rowsBefore(homeFile, m.starting_at), true);
  const aw = pickWindow(rowsBefore(awayFile, m.starting_at), false);
  const ht = tot(hw.rows);
  const at = tot(aw.rows);
  if (!ht.n && !at.n) return null;
  const per = (v: number, n: number) => (n ? v / n : null);

  const side = (team: TeamBrief, tt: Tot, color: string) => (
    <div className="min-w-0">
      <div className="mb-2 text-xs font-semibold" style={{ color }}>
        {team.name}
      </div>
      <ul className="space-y-2.5">
        {verdicts(team.name, tt).map((v, i) => (
          <li key={i} className="flex flex-col items-start gap-1 text-[13px] leading-snug text-(--c-muted)">
            <span
              className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-tight"
              style={{ color: toneColor[v.tone], background: `color-mix(in oklab, ${toneColor[v.tone]} 16%, transparent)` }}
            >
              {verdictChip(i, v.tone)}
            </span>
            <span>{v.text}</span>
          </li>
        ))}
        {!tt.n && <li className="text-[13px] text-(--c-faint)">{t("mc.st.noLeague")}</li>}
      </ul>
    </div>
  );

  return (
    <Card
      title={
        <>
          {t("mc.st.gx.title")}
          <Info>{t("mc.st.gx.info")}</Info>
        </>
      }
      lead={t("mc.st.gx.lead")}
    >
      <SideHeads home={m.home} away={m.away} />
      <MirrorRow label={t("mc.st.gx.goalsPer")} digits={2} home={per(ht.goals, ht.n)} away={per(at.goals, at.n)} />
      <MirrorRow label={t("mc.st.gx.xgotPer")} digits={2} home={per(ht.xgot, ht.n)} away={per(at.xgot, at.n)} />
      <MirrorRow label={t("mc.st.gx.againstPer")} digits={2} lowerBetter home={per(ht.against, ht.n)} away={per(at.against, at.n)} />
      <MirrorRow label={t("mc.st.gx.xgotAgainstPer")} digits={2} lowerBetter home={per(ht.faced, ht.n)} away={per(at.faced, at.n)} />

      <div className="mt-4 grid gap-5 md:grid-cols-2">
        {side(m.home, ht, "var(--c-home)")}
        {side(m.away, at, "var(--c-away)")}
      </div>

      <div className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SubTitle>{t("mc.st.gx.byMatch")}</SubTitle>
          <Seg
            label={t("mc.st.gx.track")}
            value={mode}
            onChange={setMode}
            options={[
              { id: "attack", label: t("mc.st.grp.attack") },
              { id: "keeper", label: t("mc.st.grp.defence") },
            ]}
          />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <TeamChart team={m.home} side="home" rows={hw.rows} mode={mode} total={ht} />
          <TeamChart team={m.away} side="away" rows={aw.rows} mode={mode} total={at} />
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-(--c-muted)">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm bg-(--c-faint)" />
            {mode === "attack" ? t("mc.st.gx.actualFor") : t("mc.st.gx.actualAgainst")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-(--c-text)" />
            {t("mc.st.gx.xgotLegend")}
          </span>
          <span>{t("mc.st.gx.order")}</span>
        </p>
      </div>
    </Card>
  );
}
