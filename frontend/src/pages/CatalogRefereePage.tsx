import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "../i18n/router";
import { useTabLock } from "../access/catalogGate";
import { Gate } from "../access/Gate";
import { Avatar, Back, Frame, Hero, Loading, NotFound, Pill, RankCard, Select, StatStrip, StickyTabs, fmtNum } from "../cat/kit";
import { t, type Key } from "../i18n/locale";
import { HomeAwaySplit, TeamLeaderboard, TeamTreatment } from "../cat/RefereeInsights";
import { roundsPlayed } from "../cat/refStats";
import { formatDate } from "../lib/format";
import { useCatalogReferee, useLeagueUniverse } from "../lib/useData";
import { Card, Empty, Info, ProbBar, Stat } from "../mc2/kit";
import type { CatalogRefereeDiscStat, CatalogRefereeMatch, CatalogRefereeSeason } from "../types";
import { countryName } from "../components/Flag";

type SeasonKey = "all" | number;
const TABS = [
  { id: "overview", label: "ct.ref.tab.overview" },
  { id: "matches", label: "ct.ref.tab.matches" },
] as const satisfies readonly { id: string; label: Key }[];
type TabId = (typeof TABS)[number]["id"];

/* ---------- výpočty ---------- */

const pairSum = (pair?: Array<number | null> | null): number | null => {
  if (!pair) return null;
  const vals = pair.filter((v): v is number => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
};

function mean(values: Array<number | null | undefined>): number | null {
  const clean = values.filter((v): v is number => v != null);
  if (!clean.length) return null;
  return Math.round((clean.reduce((a, b) => a + b, 0) / clean.length) * 100) / 100;
}

function avgSum(rows: CatalogRefereeMatch[], key: string): number | null {
  const zeroIfAbsent = key === "red" || key === "penalties";
  return mean(
    rows.map((m) => {
      const sum = pairSum(m.st?.[key]);
      if (sum != null) return sum;
      if (zeroIfAbsent && (m.st?.fouls || m.st?.yellow || m.st?.red || m.st?.penalties)) return 0;
      return null;
    }),
  );
}

function discFor(
  discipline: { all?: Record<string, CatalogRefereeDiscStat>; seasons?: Record<string, Record<string, CatalogRefereeDiscStat>> } | undefined,
  season: SeasonKey,
): Record<string, CatalogRefereeDiscStat> {
  if (!discipline) return {};
  return season === "all" ? discipline.all || {} : discipline.seasons?.[String(season)] || {};
}

function smFor(seasons: CatalogRefereeSeason[] | undefined, season: SeasonKey): { yellowred?: number | null; var?: number | null } {
  const rows = seasons || [];
  if (season === "all") return { yellowred: mean(rows.map((s) => s.sm?.yellowred)), var: mean(rows.map((s) => s.sm?.var)) };
  const hit = rows.find((s) => s.id === season)?.sm;
  return { yellowred: hit?.yellowred ?? null, var: hit?.var ?? null };
}

function seasonLabel(season: SeasonKey, seasons: { id: number; name?: string | null }[], current?: number | null) {
  if (season === "all") return t("ct.ref.sl.all");
  if (season === current) return t("ct.ref.sl.current");
  return seasons.find((s) => s.id === season)?.name || t("ct.ref.sl.n", { n: season });
}

/** Přísnost podle žlutých karet: pořadí 1 = nejvíc žlutých v lize. */
function strictness(y?: CatalogRefereeDiscStat): { label: string; tone: string } | null {
  if (!y?.rank || !y.size || y.size < 5) return null;
  const edge = Math.max(1, Math.round(y.size * 0.2));
  if (y.rank <= edge) return { label: t("ct.ref.strict.high"), tone: "var(--c-warn)" };
  if (y.rank > y.size - edge) return { label: t("ct.ref.strict.low"), tone: "var(--c-home)" };
  return { label: t("ct.ref.strict.mid"), tone: "var(--c-muted)" };
}

/* ---------- stránka ---------- */

export function CatalogRefereePage() {
  const id = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const { data: ref, error, missing } = useCatalogReferee(Number.isFinite(id) ? id : null);
  const [season, setSeason] = useState<SeasonKey | null>(null);
  const [teamId, setTeamId] = useState<number | "all">("all");
  const lock = useTabLock("referees");

  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "overview") as TabId;
  const setTab = (t: TabId) => {
    const next = new URLSearchParams(params);
    if (t === "overview") next.delete("tab");
    else next.set("tab", t);
    setParams(next, { replace: true });
  };

  const universe = useLeagueUniverse(ref?.league_id ?? null);
  const overlay = ref?.overlay;
  const currentSeasonId = overlay?.current_season_id ?? null;
  const resolvedSeason: SeasonKey = season ?? currentSeasonId ?? "all";
  const matches = useMemo(() => overlay?.matches ?? [], [overlay]);
  const seasons = useMemo(() => overlay?.seasons ?? [], [overlay]);
  const seasonMatches = useMemo(() => matches.filter((m) => resolvedSeason === "all" || m.s === resolvedSeason), [matches, resolvedSeason]);

  const teams = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of seasonMatches) {
      if (m.hid && m.hn) map.set(m.hid, m.hn);
      if (m.aid && m.an) map.set(m.aid, m.an);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "cs"));
  }, [seasonMatches]);
  const tableMatches = useMemo(() => seasonMatches.filter((m) => teamId === "all" || m.hid === teamId || m.aid === teamId), [seasonMatches, teamId]);

  useEffect(() => {
    document.title = ref ? t("ct.ref.docTitle", { name: ref.name }) : t("ct.ref.docTitleLoading");
  }, [ref]);

  const fromQuery = Number(params.get("league"));
  const primary = ref
    ? (ref.leagues || []).find((l) => l.id === fromQuery) ||
      [...(ref.leagues || [])].sort((a, b) => Number(b.in_league) - Number(a.in_league) || (b.league_matches || 0) - (a.league_matches || 0))[0] || {
        id: ref.league_id,
        name: ref.league_name,
        in_league: ref.in_league,
        league_matches: ref.league_matches,
      }
    : null;
  const back = <Back to={primary ? `/catalog?league=${primary.id}&tab=referees` : "/catalog"}>{primary?.name ?? t("ct.ref.backFallback")}</Back>;

  if (missing) return <NotFound kind={t("ct.ref.kind")} back={back} />;
  if (error)
    return (
      <Frame>
        {back}
        <p className="mt-4 text-(--c-loss)">{t("ct.ref.loadError", { error })}</p>
      </Frame>
    );
  if (!ref || !primary) return <Loading>{t("ct.ref.loading")}</Loading>;

  // sezóny, které se berou jako "možné": vybraná, nebo všechny, kde rozhodčí aspoň jednou pískal
  const seasonIds = resolvedSeason === "all" ? seasons.filter((x) => (x.matches ?? 0) > 0).map((x) => x.id) : [resolvedSeason];
  const possible = roundsPlayed(universe, seasonIds);
  const career = overlay?.career_matches ?? matches.length;
  const sm = smFor(seasons, resolvedSeason);
  const disc = discFor(overlay?.discipline, resolvedSeason);
  const n = seasonMatches.length;
  const split = {
    home: n ? Math.round((100 * seasonMatches.filter((m) => m.hs > m.as).length) / n) : 0,
    draw: n ? Math.round((100 * seasonMatches.filter((m) => m.hs === m.as).length) / n) : 0,
    away: n ? Math.round((100 * seasonMatches.filter((m) => m.hs < m.as).length) / n) : 0,
  };
  const yellow = avgSum(seasonMatches, "yellow");
  const fouls = avgSum(seasonMatches, "fouls");
  const penalties = avgSum(seasonMatches, "penalties");
  const strict = strictness(disc.yellow);

  const filters = (
    <div className="mt-4 rounded-2xl border border-(--c-line) bg-(--c-surface) p-3 sm:p-4">
      <div className="grid max-w-md grid-cols-1 gap-3">
        <Select
          label={t("ct.c.season")}
          value={resolvedSeason === "all" ? "all" : String(resolvedSeason)}
          onChange={(v) => {
            setSeason(v === "all" ? "all" : Number(v));
            setTeamId("all");
          }}
          options={[
            { id: "all", label: t("ct.season.all") },
            ...seasons.map((s) => ({ id: String(s.id), label: `${s.name || s.id}${s.id === currentSeasonId ? t("ct.ref.nowTag") : ""} · ${s.matches}×` })),
          ]}
        />
      </div>
    </div>
  );

  return (
    <Frame>
      {back}
      <div className="mt-3">
        <Hero
          media={<Avatar src={ref.image} name={ref.name} size={72} />}
          eyebrow={t("ct.ref.eyebrow")}
          title={ref.name}
          sub={
            <>
              {primary.name}
              {ref.country ? ` · ${countryName(ref.country)}` : ""}
            </>
          }
          chips={
            <>
              <Pill tone="var(--c-muted)">
                {t("ct.nMatches", { n })} · {seasonLabel(resolvedSeason, seasons, currentSeasonId)}
              </Pill>
              <Pill tone="var(--c-faint)">
                {t("ct.ref.careerTotal", { n: career })}
              </Pill>
              {strict && <Pill tone={strict.tone}>{strict.label}</Pill>}
            </>
          }
        >
          {n > 0 && (
            <StatStrip>
              {possible >= n && possible > 0 ? (
                <Stat
                  value={t("ct.ref.ofPossible", { n, possible })}
                  label={t("ct.ref.ofPossibleLabel", { pct: t("fmt.pct", { n: Math.round((100 * n) / possible) }) })}
                  hint={t("ct.ref.ofPossibleHint")}
                />
              ) : (
                <Stat value={n} label={t("ct.ref.officiated")} />
              )}
              <Stat value={fmtNum(yellow)} label={t("ct.ref.yellowPerMatch")} hint={t("ct.ref.bothTeams")} />
              <Stat value={fmtNum(fouls, 1)} label={t("ct.ref.foulsPerMatch")} hint={t("ct.ref.bothTeams")} />
              <Stat value={fmtNum(penalties)} label={t("ct.ref.penPerMatch")} />
            </StatStrip>
          )}
        </Hero>
      </div>

      {filters}
      <StickyTabs tabs={lock.withLocks(TABS.map((x) => ({ ...x, label: t(x.label) })))} value={tab} onChange={setTab} label={t("ct.ref.tabsAria")} />

      <Gate need={lock.need(tab) ?? "unlimited"} when={!!lock.need(tab)} title={t("ct.ref.gateTitle")} text={t("ct.ref.gateText")}>
      <div role="tabpanel" className="mt-4 space-y-5">
        {n === 0 ? (
          <Empty>{t("ct.ref.noMatches")}</Empty>
        ) : tab === "overview" ? (
          <>
            <Card
              title={t("ct.ref.howTitle")}
              lead={t("ct.ref.howLead")}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <RankCard label={t("ct.ref.yellow")} value={yellow} rank={disc.yellow?.rank} size={disc.yellow?.size} avg={disc.yellow?.league_avg} neutralRank />
                <RankCard label={t("ct.ref.red")} value={avgSum(seasonMatches, "red")} rank={disc.red?.rank} size={disc.red?.size} avg={disc.red?.league_avg} neutralRank />
                <RankCard
                  label={t("ct.ref.secondYellow")}
                  value={avgSum(seasonMatches, "yellowred") ?? sm.yellowred ?? null}
                  rank={disc.yellowred?.rank}
                  size={disc.yellowred?.size}
                  avg={disc.yellowred?.league_avg}
                  neutralRank
                />
                <RankCard label={t("ct.ref.fouls")} value={fouls} digits={1} rank={disc.fouls?.rank} size={disc.fouls?.size} avg={disc.fouls?.league_avg} neutralRank />
                <RankCard label={t("ct.ref.penalties")} value={penalties} rank={disc.penalties?.rank} size={disc.penalties?.size} avg={disc.penalties?.league_avg} neutralRank />
                <RankCard
                  label={t("ct.ref.var")}
                  hint={t("ct.ref.varHint")}
                  value={avgSum(seasonMatches, "var") ?? sm.var ?? null}
                  rank={disc.var?.rank}
                  size={disc.var?.size}
                  avg={disc.var?.league_avg}
                  neutralRank
                />
              </div>
              <p className="mt-3 text-xs text-(--c-faint)">{t("ct.ref.leagueAvgNote")}</p>
            </Card>

            <Card title={t("ct.ref.resTitle")} lead={t("ct.ref.resLead")}>
              <ProbBar home={split.home} draw={split.draw} away={split.away} height={10} />
              <div className="mt-2 grid grid-cols-3 text-xs tabular-nums">
                <span style={{ color: "var(--c-home)" }}>{t("ct.ref.splitHome", { v: t("fmt.pct", { n: split.home }) })}</span>
                <span className="text-center text-(--c-faint)">{t("ct.ref.splitDraw", { v: t("fmt.pct", { n: split.draw }) })}</span>
                <span className="text-right" style={{ color: "var(--c-away)" }}>
                  {t("ct.ref.splitAway", { v: t("fmt.pct", { n: split.away }) })}
                </span>
              </div>
              <p className="mt-3 text-xs text-(--c-faint)">
                {t("ct.ref.fromN", { n })}
                <Info>{t("ct.ref.smallSampleInfo")}</Info>
              </p>
            </Card>

            <HomeAwaySplit rows={seasonMatches} universe={universe} seasonIds={seasonIds} />

            <TeamLeaderboard rows={matches} universe={universe} currentSeasonId={currentSeasonId} allSeasonIds={seasons.filter((x) => (x.matches ?? 0) > 0).map((x) => x.id)} />

            <RecentPreview rows={seasonMatches} onMore={() => setTab("matches")} />
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-(--c-line) bg-(--c-surface) p-3 sm:p-4">
              <div className="max-w-xs">
                <Select
                  label={t("ct.ref.team")}
                  value={teamId === "all" ? "all" : String(teamId)}
                  onChange={(v) => setTeamId(v === "all" ? "all" : Number(v))}
                  options={[{ id: "all", label: t("ct.ref.allTeams") }, ...teams.map(([tid, name]) => ({ id: String(tid), label: name }))]}
                />
              </div>
              {teamId === "all" && <p className="mt-2 text-xs text-(--c-muted)">{t("ct.ref.pickTeamNote")}</p>}
            </div>
            {teamId !== "all" && (
              <TeamTreatment rows={tableMatches} teamId={teamId} teamName={teams.find(([tid]) => tid === teamId)?.[1] ?? t("ct.ref.teamFallback")} universe={universe} seasonIds={seasonIds} />
            )}
            <Card title={t("ct.ref.matchesTitle")} lead={t("ct.ref.matchesLead", { n: tableMatches.length, season: seasonLabel(resolvedSeason, seasons, currentSeasonId) })}>
              <MatchRows rows={tableMatches} />
            </Card>
          </>
        )}
      </div>
      </Gate>

      <footer className="pt-8 text-center text-xs text-(--c-faint)">
        {t("ct.ref.footer")}
      </footer>
    </Frame>
  );
}

/* ---------- řádky zápasů ---------- */

function RecentPreview({ rows, onMore }: { rows: CatalogRefereeMatch[]; onMore: () => void }) {
  const last = [...rows].sort((a, b) => b.d.localeCompare(a.d)).slice(0, 5);
  return (
    <Card title={t("ct.ref.recent")} lead={t("ct.ref.recentLead")} aside={rows.length > 5 ? <button type="button" onClick={onMore} className="min-h-9 text-[13px] font-medium text-(--c-accent) hover:underline">{t("ct.ref.allMatches")}</button> : undefined}>
      <MatchRows rows={last} />
    </Card>
  );
}

function MatchRows({ rows, pageSize = 25 }: { rows: CatalogRefereeMatch[]; pageSize?: number }) {
  const [shown, setShown] = useState(pageSize);
  if (!rows.length) return <Empty>{t("ct.ref.noneForTeam")}</Empty>;
  const sorted = [...rows].sort((a, b) => b.d.localeCompare(a.d));
  return (
    <>
    <ul className="-mx-1 divide-y divide-(--c-line)">
      {sorted.slice(0, shown).map((m) => {
        const body = (
          <div className="px-1 py-2.5 sm:flex sm:items-center sm:gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-(--c-faint)">{m.d ? formatDate(m.d) : "—"}</div>
              <div className="mt-0.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[13px] sm:text-sm">
                <span className="truncate text-right font-medium">{m.hn}</span>
                <span className="rounded-md bg-(--c-raised) px-2 py-0.5 text-[13px] font-bold tabular-nums">
                  {m.hs}:{m.as}
                </span>
                <span className="truncate font-medium">{m.an}</span>
              </div>
            </div>
            <div className="mt-1.5 flex justify-center gap-1 sm:mt-0 sm:justify-end">
              <Mini label={t("ct.ref.miniFouls")} pair={m.st?.fouls} />
              <Mini label={t("ct.ref.miniYc")} pair={m.st?.yellow} tone="var(--c-warn)" />
              <Mini label={t("ct.ref.miniRc")} total={pairSum(m.st?.red) ?? (m.st?.fouls || m.st?.yellow ? 0 : null)} tone="var(--c-loss)" />
            </div>
          </div>
        );
        return (
          <li key={m.fid}>
            {m.mp ? (
              <Link to={`/match/${m.fid}`} className="block rounded-lg hover:bg-(--c-raised)">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
    {sorted.length > shown && (
      <button type="button" onClick={() => setShown((n) => n + pageSize)} className="mt-3 min-h-10 w-full rounded-xl border border-(--c-line) text-[13px] font-medium text-(--c-accent) hover:bg-(--c-raised)">
        {t("ct.c.showMore", { n: Math.min(pageSize, sorted.length - shown) })}
      </button>
    )}
    </>
  );
}

function Mini({ label, pair, total, tone }: { label: string; pair?: Array<number | null> | null; total?: number | null; tone?: string }) {
  const has = pair && pair.length === 2 && pair[0] != null && pair[1] != null;
  const sum = has ? (pair![0] as number) + (pair![1] as number) : total ?? null;
  return (
    <div className={`flex shrink-0 items-baseline justify-center gap-1.5 sm:block sm:text-center ${total === undefined ? "w-24 sm:w-[4.5rem]" : "w-16 sm:w-11"}`}>
      <div className="text-[11px] uppercase tracking-wide text-(--c-faint)">{label}</div>
      <div className="text-[14px] font-semibold tabular-nums" style={tone && sum ? { color: tone } : undefined}>
        {has ? (
          <>
            {pair![0]}
            <span className="mx-1 font-normal text-(--c-faint)">:</span>
            {pair![1]}
          </>
        ) : (
          (total ?? "—")
        )}
      </div>
    </div>
  );
}
