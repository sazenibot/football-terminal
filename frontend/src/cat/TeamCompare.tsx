import { useMemo, useState, type ReactNode } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, Chip, Empty, MirrorRow, SubTitle } from "../mc2/kit";
import type { CatalogEra, CatalogEraSummary, CatalogExplorer, CatalogExplorerMatch, RadarAverages } from "../types";
import { Select, fmtNum } from "./kit";
import { t, type Key } from "../i18n/locale";
import { pctSuffix } from "../lib/playerCatalog";

/* Srovnání v detailu týmu: dvě záložky (Radar týmu, Trenéři) sdílí radar i tabulku.
   Strana A je v barvě domácích, strana B v barvě hostů, stejně jako v Match Center. */

type Venue = "all" | "home" | "away";
type Half = "all" | "autumn" | "spring";
type SeasonKey = "all" | number;

const A_TONE = "var(--c-home)";
const B_TONE = "var(--c-away)";
/** Pseudo-tým: průměr všech týmů ligy. */
const LEAGUE = 0;

/* ---------- výpočty ---------- */

function mean(values: Array<number | null | undefined>): number | null {
  const clean = values.filter((v): v is number => v != null);
  if (!clean.length) return null;
  return Math.round((clean.reduce((a, b) => a + b, 0) / clean.length) * 100) / 100;
}

function filterMatches(rows: CatalogExplorerMatch[], season: SeasonKey, venue: Venue, half: Half) {
  return rows.filter((row) => {
    if (season !== "all" && row.s !== season) return false;
    if (venue === "home" && !row.h) return false;
    if (venue === "away" && row.h) return false;
    const month = Number((row.d || "").slice(5, 7));
    if (!month) return true;
    if (half === "autumn" && month < 7) return false;
    if (half === "spring" && month >= 7) return false;
    return true;
  });
}

function summarize(rows: CatalogExplorerMatch[]): CatalogEraSummary {
  if (!rows.length) return { matches: 0 };
  return {
    matches: rows.length,
    won: rows.filter((r) => r.gf > r.ga).length,
    drawn: rows.filter((r) => r.gf === r.ga).length,
    lost: rows.filter((r) => r.gf < r.ga).length,
    goals_for: mean(rows.map((r) => r.gf)),
    goals_against: mean(rows.map((r) => r.ga)),
    shots: mean(rows.map((r) => r.sh)),
    sot: mean(rows.map((r) => r.sot)),
    corners: mean(rows.map((r) => r.c)),
    possession: mean(rows.map((r) => r.p)),
    fouls: mean(rows.map((r) => r.f)),
    fouls_committed: mean(rows.map((r) => r.f)),
    fouls_received: mean(rows.map((r) => r.of)),
    yellow: mean(rows.map((r) => r.y)),
    cards: mean(rows.map((r) => (r.y ?? 0) + (r.r ?? 0))),
  };
}

function radarFrom(s: CatalogEraSummary): RadarAverages {
  return {
    goals_for: s.goals_for ?? 0,
    goals_against: s.goals_against ?? 0,
    shots: s.shots ?? 0,
    sot: s.sot ?? 0,
    corners: s.corners ?? 0,
    possession: s.possession ?? 0,
    cards: s.cards ?? 0,
    fouls_committed: s.fouls_committed ?? s.fouls ?? 0,
    fouls_received: s.fouls_received ?? 0,
  };
}

function ppg(s: CatalogEraSummary): number | null {
  const n = s.matches || 0;
  if (!n) return null;
  return Math.round((((s.won ?? 0) * 3 + (s.drawn ?? 0)) / n) * 100) / 100;
}

/* ---------- radar ---------- */

const AXES: { key: keyof RadarAverages; label: Key; range: [number, number]; digits: number }[] = [
  { key: "goals_for", label: "ct.tc.ax.goalsFor", range: [0, 3.5], digits: 2 },
  { key: "goals_against", label: "ct.tc.ax.goalsAgainst", range: [0, 3.5], digits: 2 },
  { key: "shots", label: "ct.tc.ax.shots", range: [5, 22], digits: 1 },
  { key: "sot", label: "ct.tc.ax.sot", range: [1, 10], digits: 1 },
  { key: "corners", label: "ct.tc.ax.corners", range: [2, 10], digits: 1 },
  { key: "possession", label: "ct.tc.ax.possessionPct", range: [30, 70], digits: 0 },
  { key: "cards", label: "ct.tc.ax.cards", range: [0, 5], digits: 2 },
  { key: "fouls_committed", label: "ct.tc.ax.fouls", range: [5, 20], digits: 1 },
  { key: "fouls_received", label: "ct.tc.ax.foulsWon", range: [5, 20], digits: 1 },
];

const norm = (v: number, [min, max]: [number, number]) => Math.max(0, Math.min(100, Math.round(((v - min) / (max - min)) * 100)));

function CompareRadar({ a, b, nameA, nameB }: { a: RadarAverages; b?: RadarAverages | null; nameA: string; nameB?: string }) {
  const hasB = !!b && !!nameB;
  const data = AXES.map((ax) => ({
    metric: t(ax.label),
    a: norm(Number(a[ax.key] ?? 0), ax.range),
    b: hasB ? norm(Number(b?.[ax.key] ?? 0), ax.range) : 0,
    aRaw: Number(a[ax.key] ?? 0),
    bRaw: Number(b?.[ax.key] ?? 0),
    digits: ax.digits,
  }));
  return (
    <div>
      <div className="h-[340px] w-full sm:h-[400px]" role="img" aria-label={t("ct.tc.radarAria")}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="66%">
            <PolarGrid stroke="var(--c-line)" />
            <PolarAngleAxis dataKey="metric" tick={{ fill: "var(--c-muted)", fontSize: 11 }} />
            <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
            <Radar name="A" dataKey="a" stroke={A_TONE} fill={A_TONE} fillOpacity={0.24} strokeWidth={2} isAnimationActive={false} />
            {hasB && <Radar name="B" dataKey="b" stroke={B_TONE} fill={B_TONE} fillOpacity={0.2} strokeWidth={2} isAnimationActive={false} />}
            <Tooltip
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
                if (!p) return null;
                return (
                  <div className="rounded-xl border border-(--c-line) bg-(--c-raised) px-3 py-2 text-xs shadow-xl">
                    <div className="mb-1 font-semibold">{p.metric}</div>
                    <div style={{ color: A_TONE }}>{nameA}: {fmtNum(p.aRaw, p.digits)}</div>
                    {hasB && <div style={{ color: B_TONE }}>{nameB}: {fmtNum(p.bRaw, p.digits)}</div>}
                  </div>
                );
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-center text-[11px] text-(--c-faint)">{t("ct.tc.radarNote")}</p>
    </div>
  );
}

/* ---------- tabulka pod radarem ---------- */

type Row = { key: keyof CatalogEraSummary | "ppg"; label: Key; digits: number; lowerBetter?: boolean; pct?: boolean; hint?: Key };

const GROUPS: { title: Key; rows: Row[] }[] = [
  {
    title: "ct.tc.g.results",
    rows: [{ key: "ppg", label: "ct.tc.r.ppg", digits: 2, hint: "ct.tc.r.ppgHint" }],
  },
  {
    title: "ct.tc.g.match",
    rows: [
      { key: "goals_for", label: "ct.tc.r.goals", digits: 2 },
      { key: "goals_against", label: "ct.tc.ax.goalsAgainst", digits: 2, lowerBetter: true },
      { key: "shots", label: "ct.tc.ax.shots", digits: 1 },
      { key: "sot", label: "ct.tc.ax.sot", digits: 1 },
      { key: "corners", label: "ct.tc.ax.corners", digits: 1 },
      { key: "possession", label: "ct.tc.r.possession", digits: 0, pct: true },
    ],
  },
  {
    title: "ct.tc.g.discipline",
    rows: [
      { key: "fouls_committed", label: "ct.tc.ax.fouls", digits: 1, lowerBetter: true },
      { key: "fouls_received", label: "ct.tc.ax.foulsWon", digits: 1 },
      { key: "cards", label: "ct.tc.r.cardsAll", digits: 2, lowerBetter: true },
    ],
  },
];

function valueOf(s: CatalogEraSummary, key: Row["key"]): number | null {
  if (key === "ppg") return ppg(s);
  if (key === "fouls_committed") return s.fouls_committed ?? s.fouls ?? null;
  const v = s[key];
  return typeof v === "number" ? v : null;
}

function CompareTable({ a, b }: { a: CatalogEraSummary; b?: CatalogEraSummary | null }) {
  return (
    <div className="mt-6 space-y-4">
      {GROUPS.map((g) => (
        <section key={g.title}>
          <SubTitle>{t(g.title)}</SubTitle>
          <div className="divide-y divide-(--c-line)">
            {g.rows.map((r) => (
              <MirrorRow
                key={r.key}
                label={t(r.label)}
                hint={r.hint ? t(r.hint) : undefined}
                home={valueOf(a, r.key)}
                away={b ? valueOf(b, r.key) : null}
                digits={r.digits}
                lowerBetter={r.lowerBetter}
                suffix={r.pct ? pctSuffix() : undefined}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ---------- společný rám panelu ---------- */

type Caption = { name: string; sub: string; summary?: CatalogEraSummary | null; pooled?: boolean };

function CaptionBlock({ tone, letter, cap, align }: { tone: string; letter: string; cap: Caption; align: "left" | "right" }) {
  const n = cap.summary?.matches ?? 0;
  const s = cap.summary;
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : ""}`}>
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${align === "right" ? "justify-end" : ""}`} style={{ color: tone }}>
        {align === "left" && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tone }} />}
        <span>{letter}</span>
        {align === "right" && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tone }} />}
      </div>
      <div className="mt-0.5 truncate text-[15px] font-semibold">{cap.name}</div>
      <div className="truncate text-xs text-(--c-muted)">{cap.sub || t("ct.tc.capAll")}</div>
      <div className="mt-0.5 text-xs tabular-nums text-(--c-faint)">
        {cap.pooled ? t("ct.tc.capPooled", { n }) : t("ct.nMatches", { n })}
        {!cap.pooled && s?.won != null && ` · ${t("ct.tc.wdl", { w: s.won, d: s.drawn ?? 0, l: s.lost ?? 0 })}`}
      </div>
    </div>
  );
}

function ComparePanel({
  title,
  lead,
  presets,
  capA,
  capB,
  editorA,
  editorB,
  children,
}: {
  title: string;
  lead: string;
  presets?: { id: string; label: string; active: boolean; onPick: () => void }[];
  capA: Caption;
  capB: Caption;
  editorA: ReactNode;
  editorB: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card title={title} lead={lead}>
      {presets && presets.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-(--c-faint)">{t("ct.tc.quick")}</span>
          {presets.map((p) => (
            <Chip key={p.id} active={p.active} onClick={p.onPick}>
              {p.label}
            </Chip>
          ))}
        </div>
      )}
      <div className="rounded-2xl bg-(--c-raised) p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-4">
          <CaptionBlock tone={A_TONE} letter="A" cap={capA} align="left" />
          <CaptionBlock tone={B_TONE} letter="B" cap={capB} align="right" />
        </div>
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="mt-3 min-h-9 text-[13px] font-medium text-(--c-accent)">
          {open ? t("ct.tc.done") : t("ct.tc.edit")}
          <span aria-hidden className={`ml-1 inline-block transition-transform ${open ? "rotate-90" : ""}`}>›</span>
        </button>
        {open && (
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {editorA}
            {editorB}
          </div>
        )}
      </div>
      <div className="mt-5">{children}</div>
    </Card>
  );
}

function SideEditor({ tone, letter, children }: { tone: string; letter: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-(--c-line) bg-(--c-surface) p-3" style={{ borderTop: `3px solid ${tone}` }}>
      <div className="mb-2 text-xs font-semibold" style={{ color: tone }}>
        {t("ct.tc.selection", { letter })}
      </div>
      <div className="grid grid-cols-2 gap-2.5">{children}</div>
    </div>
  );
}

const VENUE_OPTS: { id: string; label: Key }[] = [
  { id: "all", label: "ct.tc.venue.all" },
  { id: "home", label: "ct.tc.venue.home" },
  { id: "away", label: "ct.tc.venue.away" },
];
const HALF_OPTS: { id: string; label: Key }[] = [
  { id: "all", label: "ct.tc.half.all" },
  { id: "autumn", label: "ct.tc.half.autumn" },
  { id: "spring", label: "ct.tc.half.spring" },
];
const venueOpts = () => VENUE_OPTS.map((o) => ({ id: o.id, label: t(o.label) }));
const halfOpts = () => HALF_OPTS.map((o) => ({ id: o.id, label: t(o.label) }));

/* ---------- záložka Radar týmu ---------- */

type TeamSide = { team: number; season: SeasonKey; venue: Venue; half: Half };

export function TeamRadarPanel({ explorer, defaultTeamId, loading = false }: { explorer: CatalogExplorer | null; defaultTeamId: number; loading?: boolean }) {
  if (loading) return <Empty>{t("ct.tc.radarLoading")}</Empty>;
  if (!explorer || explorer.teams.length === 0) return <Empty>{t("ct.tc.radarMissing")}</Empty>;
  return <TeamRadarInner explorer={explorer} defaultTeamId={defaultTeamId} />;
}

function TeamRadarInner({ explorer, defaultTeamId }: { explorer: CatalogExplorer; defaultTeamId: number }) {
  const teams = explorer.teams;
  const seasons = explorer.seasons || [];
  const cur: SeasonKey = explorer.season_id ?? "all";
  const curIdx = seasons.findIndex((s) => s.id === cur);
  const prev: SeasonKey | null = curIdx >= 0 && seasons[curIdx + 1] ? seasons[curIdx + 1].id : null;

  const [a, setA] = useState<TeamSide>({ team: defaultTeamId, season: cur, venue: "all", half: "all" });
  const [b, setB] = useState<TeamSide>({ team: LEAGUE, season: cur, venue: "all", half: "all" });

  const leagueRows = useMemo(() => teams.flatMap((t) => t.matches || []), [teams]);
  const nameOf = (id: number) => (id === LEAGUE ? t("ct.tc.leagueAvg") : teams.find((tm) => tm.id === id)?.name ?? t("ct.tc.teamFallback"));
  const slice = (s: TeamSide) => {
    const base = s.team === LEAGUE ? leagueRows : teams.find((t) => t.id === s.team)?.matches || [];
    const summary = summarize(filterMatches(base, s.season, s.venue, s.half));
    return { summary, radar: radarFrom(summary) };
  };
  const sa = useMemo(() => slice(a), [a, teams, leagueRows]); // eslint-disable-line react-hooks/exhaustive-deps
  const sb = useMemo(() => slice(b), [b, teams, leagueRows]); // eslint-disable-line react-hooks/exhaustive-deps

  const seasonName = (k: SeasonKey) => (k === "all" ? t("ct.tc.seasonAll") : seasons.find((s) => s.id === k)?.name || String(k));
  const sub = (s: TeamSide) =>
    [seasonName(s.season), s.venue === "home" ? t("ct.tc.subHome") : s.venue === "away" ? t("ct.tc.subAway") : "", s.half === "autumn" ? t("ct.tc.subAutumn") : s.half === "spring" ? t("ct.tc.subSpring") : ""].filter(Boolean).join(" · ");

  const same = (x: TeamSide, y: TeamSide) => x.team === y.team && x.season === y.season && x.venue === y.venue && x.half === y.half;
  const base: TeamSide = { team: defaultTeamId, season: cur, venue: "all", half: "all" };
  const presets = [
    { id: "league", label: t("ct.tc.preset.league"), a: base, b: { ...base, team: LEAGUE } },
    { id: "venue", label: t("ct.tc.preset.venue"), a: { ...base, venue: "home" as Venue }, b: { ...base, venue: "away" as Venue } },
    ...(prev != null ? [{ id: "prev", label: t("ct.tc.preset.prev"), a: base, b: { ...base, season: prev } }] : []),
  ].map((p) => ({ id: p.id, label: p.label, active: same(a, p.a) && same(b, p.b), onPick: () => { setA(p.a); setB(p.b); } }));

  const editor = (s: TeamSide, set: (v: TeamSide) => void, letter: string, tone: string, allowLeague: boolean) => (
    <SideEditor tone={tone} letter={letter}>
      <Select
        label={t("ct.tc.team")}
        value={String(s.team)}
        onChange={(v) => set({ ...s, team: Number(v) })}
        options={[...(allowLeague ? [{ id: String(LEAGUE), label: t("ct.tc.leagueAvg") }] : []), ...teams.map((tm) => ({ id: String(tm.id), label: tm.name }))]}
      />
      <Select
        label={t("ct.tc.season")}
        value={String(s.season)}
        onChange={(v) => set({ ...s, season: v === "all" ? "all" : Number(v) })}
        options={[{ id: "all", label: t("ct.tc.seasonAllOpt") }, ...seasons.map((x) => ({ id: String(x.id), label: x.name || String(x.id) }))]}
      />
      <Select label={t("ct.tc.venueLabel")} value={s.venue} onChange={(v) => set({ ...s, venue: v as Venue })} options={venueOpts()} />
      <Select label={t("ct.tc.halfLabel")} value={s.half} onChange={(v) => set({ ...s, half: v as Half })} options={halfOpts()} />
    </SideEditor>
  );

  const hasA = (sa.summary.matches ?? 0) > 0;
  const hasB = (sb.summary.matches ?? 0) > 0;

  return (
    <ComparePanel
      title={t("ct.tc.radarTitle")}
      lead={t("ct.tc.radarLead")}
      presets={presets}
      capA={{ name: nameOf(a.team), sub: sub(a), summary: sa.summary }}
      capB={{ name: nameOf(b.team), sub: sub(b), summary: sb.summary, pooled: b.team === LEAGUE }}
      editorA={editor(a, setA, "A", A_TONE, false)}
      editorB={editor(b, setB, "B", B_TONE, true)}
    >
      {hasA ? (
        <>
          <CompareRadar a={sa.radar} b={hasB ? sb.radar : null} nameA={nameOf(a.team)} nameB={hasB ? nameOf(b.team) : undefined} />
          <CompareTable a={sa.summary} b={hasB ? sb.summary : null} />
        </>
      ) : (
        <Empty>{t("ct.tc.noMatchesA")}</Empty>
      )}
    </ComparePanel>
  );
}

/* ---------- záložka Trenéři ---------- */

type CoachSide = { team: number; coach: string; venue: Venue };
const eraKey = (e: CatalogEra) => String(e.coach_id ?? e.coach_name);

export function CoachComparePanel({ explorer, defaultTeamId, loading = false }: { explorer: CatalogExplorer | null; defaultTeamId: number; loading?: boolean }) {
  if (loading) return <Empty>{t("ct.tc.coachLoading")}</Empty>;
  if (!explorer || explorer.teams.length === 0) return <Empty>{t("ct.tc.coachMissing")}</Empty>;
  return <CoachInner explorer={explorer} defaultTeamId={defaultTeamId} />;
}

function CoachInner({ explorer, defaultTeamId }: { explorer: CatalogExplorer; defaultTeamId: number }) {
  const teams = explorer.teams;
  const own = teams.find((t) => t.id === defaultTeamId);
  const ownEras = own?.eras || [];
  const otherTeam = teams.find((t) => t.id === 2727 && t.id !== defaultTeamId) ?? teams.find((t) => t.id !== defaultTeamId);

  const [a, setA] = useState<CoachSide>({ team: defaultTeamId, coach: ownEras[0] ? eraKey(ownEras[0]) : "", venue: "all" });
  const [b, setB] = useState<CoachSide>(
    ownEras.length > 1
      ? { team: defaultTeamId, coach: eraKey(ownEras[1]), venue: "all" }
      : { team: otherTeam?.id ?? defaultTeamId, coach: otherTeam?.eras[0] ? eraKey(otherTeam.eras[0]) : "", venue: "all" },
  );

  const eraOf = (s: CoachSide) => {
    const rec = teams.find((t) => t.id === s.team);
    return { rec, era: rec?.eras.find((e) => eraKey(e) === s.coach) ?? rec?.eras[0] };
  };
  const ea = eraOf(a);
  const eb = eraOf(b);

  const cap = (x: ReturnType<typeof eraOf>, s: CoachSide): Caption => {
    if (!x.era || !x.rec) return { name: t("ct.tc.coachFallback"), sub: "", summary: null };
    const years = x.era.from ? `${x.era.from.slice(0, 4)}–${(x.era.to || "").slice(0, 4) || t("ct.tc.today")}` : "";
    const venue = s.venue === "home" ? t("ct.tc.subHome") : s.venue === "away" ? t("ct.tc.subAway") : "";
    return { name: x.era.coach_name, sub: [x.rec.name, years, venue].filter(Boolean).join(" · "), summary: x.era[s.venue] };
  };

  const presets =
    ownEras.length > 1
      ? [
          {
            id: "prev",
            label: t("ct.tc.preset.coach"),
            active: a.team === defaultTeamId && b.team === defaultTeamId && a.coach === eraKey(ownEras[0]) && b.coach === eraKey(ownEras[1]),
            onPick: () => {
              setA({ team: defaultTeamId, coach: eraKey(ownEras[0]), venue: "all" });
              setB({ team: defaultTeamId, coach: eraKey(ownEras[1]), venue: "all" });
            },
          },
        ]
      : [];

  const editor = (s: CoachSide, set: (v: CoachSide) => void, letter: string, tone: string) => {
    const rec = teams.find((t) => t.id === s.team);
    return (
      <SideEditor tone={tone} letter={letter}>
        <Select
          label={t("ct.tc.team")}
          value={String(s.team)}
          onChange={(v) => {
            const tm = teams.find((x) => x.id === Number(v));
            set({ ...s, team: Number(v), coach: tm?.eras[0] ? eraKey(tm.eras[0]) : "" });
          }}
          options={teams.map((tm) => ({ id: String(tm.id), label: tm.name }))}
        />
        <Select
          label={t("ct.tc.coach")}
          value={s.coach}
          onChange={(v) => set({ ...s, coach: v })}
          options={(rec?.eras || []).map((e) => ({ id: eraKey(e), label: t("ct.tc.coachOpt", { name: e.coach_name, n: e.matches }) }))}
        />
        <Select label={t("ct.tc.venueLabel")} value={s.venue} onChange={(v) => set({ ...s, venue: v as Venue })} options={venueOpts()} />
      </SideEditor>
    );
  };

  if (!ea.era) return <Empty>{t("ct.tc.noCoach")}</Empty>;
  const capA = cap(ea, a);
  const capB = cap(eb, b);
  const hasB = !!eb.era && (capB.summary?.matches ?? 0) > 0;

  return (
    <ComparePanel
      title={t("ct.tc.coachTitle")}
      lead={t("ct.tc.coachLead")}
      presets={presets}
      capA={capA}
      capB={capB}
      editorA={editor(a, setA, "A", A_TONE)}
      editorB={editor(b, setB, "B", B_TONE)}
    >
      {(capA.summary?.matches ?? 0) > 0 ? (
        <>
          <CompareRadar a={ea.era.radar[a.venue]} b={hasB && eb.era ? eb.era.radar[b.venue] : null} nameA={capA.name} nameB={hasB ? capB.name : undefined} />
          <CompareTable a={capA.summary!} b={hasB ? capB.summary : null} />
        </>
      ) : (
        <Empty>{t("ct.tc.noMatchesCoachA")}</Empty>
      )}
    </ComparePanel>
  );
}
