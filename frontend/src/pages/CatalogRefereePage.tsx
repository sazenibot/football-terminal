import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Avatar, Back, Frame, Hero, Loading, NotFound, Pill, RankCard, Select, StatStrip, StickyTabs, csMatches, fmtNum } from "../cat/kit";
import { HomeAwaySplit, TeamLeaderboard, TeamTreatment } from "../cat/RefereeInsights";
import { roundsPlayed } from "../cat/refStats";
import { formatDate } from "../lib/format";
import { useCatalogReferee, useLeagueUniverse } from "../lib/useData";
import { Card, Empty, Info, ProbBar, Stat } from "../mc2/kit";
import type { CatalogRefereeDiscStat, CatalogRefereeMatch, CatalogRefereeSeason } from "../types";

type SeasonKey = "all" | number;
const TABS = [
  { id: "overview", label: "Přehled" },
  { id: "matches", label: "Zápasy" },
] as const;
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
  if (season === "all") return "všechny sezony";
  if (season === current) return "tato sezona";
  return seasons.find((s) => s.id === season)?.name || `sezona ${season}`;
}

/** Přísnost podle žlutých karet: pořadí 1 = nejvíc žlutých v lize. */
function strictness(y?: CatalogRefereeDiscStat): { label: string; tone: string } | null {
  if (!y?.rank || !y.size || y.size < 5) return null;
  const edge = Math.max(1, Math.round(y.size * 0.2));
  if (y.rank <= edge) return { label: "Přísnější než většina", tone: "var(--c-warn)" };
  if (y.rank > y.size - edge) return { label: "Nechává hrát", tone: "var(--c-home)" };
  return { label: "Průměrná přísnost", tone: "var(--c-muted)" };
}

/* ---------- stránka ---------- */

export function CatalogRefereePage() {
  const id = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const { data: ref, error, missing } = useCatalogReferee(Number.isFinite(id) ? id : null);
  const [season, setSeason] = useState<SeasonKey | null>(null);
  const [teamId, setTeamId] = useState<number | "all">("all");

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
    document.title = ref ? `${ref.name} · rozhodčí · Katalog` : "Rozhodčí · Katalog";
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
  const back = <Back to={primary ? `/catalog?league=${primary.id}&tab=referees` : "/catalog"}>{primary?.name ?? "Katalog"}</Back>;

  if (missing) return <NotFound kind="Tento rozhodčí" back={back} />;
  if (error)
    return (
      <Frame>
        {back}
        <p className="mt-4 text-(--c-loss)">Profil se nepodařilo načíst: {error}</p>
      </Frame>
    );
  if (!ref || !primary) return <Loading>Načítám rozhodčího…</Loading>;

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
          label="Sezóna"
          value={resolvedSeason === "all" ? "all" : String(resolvedSeason)}
          onChange={(v) => {
            setSeason(v === "all" ? "all" : Number(v));
            setTeamId("all");
          }}
          options={[
            { id: "all", label: "Všechny sezony" },
            ...seasons.map((s) => ({ id: String(s.id), label: `${s.name || s.id}${s.id === currentSeasonId ? " · teď" : ""} · ${s.matches}×` })),
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
          eyebrow="Hlavní rozhodčí"
          title={ref.name}
          sub={
            <>
              {primary.name}
              {ref.country ? ` · ${ref.country}` : ""}
            </>
          }
          chips={
            <>
              <Pill tone="var(--c-muted)">
                {n} {csMatches(n)} · {seasonLabel(resolvedSeason, seasons, currentSeasonId)}
              </Pill>
              <Pill tone="var(--c-faint)">
                {career} {csMatches(career)} celkem
              </Pill>
              {strict && <Pill tone={strict.tone}>{strict.label}</Pill>}
            </>
          }
        >
          {n > 0 && (
            <StatStrip>
              {possible >= n && possible > 0 ? (
                <Stat
                  value={`${n} z ${possible}`}
                  label={`Odpískáno z možných · ${Math.round((100 * n) / possible)} %`}
                  hint="Rozhodčí smí v kole pískat jeden zápas, takže „možné“ je počet odehraných kol. U „všech sezon“ se berou jen sezony, ve kterých aspoň jednou pískal."
                />
              ) : (
                <Stat value={n} label="Odpískané zápasy" />
              )}
              <Stat value={fmtNum(yellow)} label="Žluté / zápas" hint="Součet obou týmů." />
              <Stat value={fmtNum(fouls, 1)} label="Fauly / zápas" hint="Součet obou týmů." />
              <Stat value={fmtNum(penalties)} label="Penalty / zápas" />
            </StatStrip>
          )}
        </Hero>
      </div>

      {filters}
      <StickyTabs tabs={TABS} value={tab} onChange={setTab} label="Sekce profilu rozhodčího" />

      <div role="tabpanel" className="mt-4 space-y-5">
        {n === 0 ? (
          <Empty>V tomto výběru zatím nemáme zápas, kde byl hlavním rozhodčím.</Empty>
        ) : tab === "overview" ? (
          <>
            <Card
              title="Jak píská"
              lead="Průměr na zápas, oba týmy dohromady. Pořadí v lize ukazuje, kolikátý je mezi rozhodčími: 1. píská nejvíc."
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <RankCard label="Žluté karty" value={yellow} rank={disc.yellow?.rank} size={disc.yellow?.size} avg={disc.yellow?.league_avg} neutralRank />
                <RankCard label="Červené karty" value={avgSum(seasonMatches, "red")} rank={disc.red?.rank} size={disc.red?.size} avg={disc.red?.league_avg} neutralRank />
                <RankCard
                  label="Druhá žlutá"
                  value={avgSum(seasonMatches, "yellowred") ?? sm.yellowred ?? null}
                  rank={disc.yellowred?.rank}
                  size={disc.yellowred?.size}
                  avg={disc.yellowred?.league_avg}
                  neutralRank
                />
                <RankCard label="Fauly" value={fouls} digits={1} rank={disc.fouls?.rank} size={disc.fouls?.size} avg={disc.fouls?.league_avg} neutralRank />
                <RankCard label="Penalty" value={penalties} rank={disc.penalties?.rank} size={disc.penalties?.size} avg={disc.penalties?.league_avg} neutralRank />
                <RankCard
                  label="Zásahy VAR"
                  hint="Kolikrát v zápase zasáhl videoasistent (kontrola i případná změna verdiktu), bez rozlišení, jestli rozhodnutí padlo, nebo zůstalo."
                  value={avgSum(seasonMatches, "var") ?? sm.var ?? null}
                  rank={disc.var?.rank}
                  size={disc.var?.size}
                  avg={disc.var?.league_avg}
                  neutralRank
                />
              </div>
              <p className="mt-3 text-xs text-(--c-faint)">Ligový průměr je ze všech zápasů soutěže ve stejném výběru.</p>
            </Card>

            <Card title="Výsledky v jeho zápasech" lead="Jak často vyhrají domácí, uhrají remízu, nebo vyhrají hosté.">
              <ProbBar home={split.home} draw={split.draw} away={split.away} height={10} />
              <div className="mt-2 grid grid-cols-3 text-xs tabular-nums">
                <span style={{ color: "var(--c-home)" }}>Domácí {split.home} %</span>
                <span className="text-center text-(--c-faint)">Remíza {split.draw} %</span>
                <span className="text-right" style={{ color: "var(--c-away)" }}>
                  Hosté {split.away} %
                </span>
              </div>
              <p className="mt-3 text-xs text-(--c-faint)">
                Z {n} {csMatches(n)}.
                <Info>Malý vzorek zápasů nic nedokazuje. Rozhodčí nerozhoduje o výsledku sám, jde jen o statistický kontext.</Info>
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
                  label="Tým"
                  value={teamId === "all" ? "all" : String(teamId)}
                  onChange={(v) => setTeamId(v === "all" ? "all" : Number(v))}
                  options={[{ id: "all", label: "Všechny týmy" }, ...teams.map(([tid, name]) => ({ id: String(tid), label: name }))]}
                />
              </div>
              {teamId === "all" && <p className="mt-2 text-xs text-(--c-muted)">Vyberte tým a nad seznamem uvidíte, jak k němu rozhodčí přistupuje: fauly a karty doma i venku.</p>}
            </div>
            {teamId !== "all" && (
              <TeamTreatment rows={tableMatches} teamId={teamId} teamName={teams.find(([tid]) => tid === teamId)?.[1] ?? "týmem"} universe={universe} seasonIds={seasonIds} />
            )}
            <Card title="Zápasy" lead={`${tableMatches.length} ${csMatches(tableMatches.length)}, ${seasonLabel(resolvedSeason, seasons, currentSeasonId)}. Fauly a žluté karty jsou domácí : hosté. Klepnutím na výsledek otevřete Match Center.`}>
              <MatchRows rows={tableMatches} />
            </Card>
          </>
        )}
      </div>

      <footer className="pt-8 text-center text-xs text-(--c-faint)">
        Statistiky vznikají z odehraných zápasů. Informativní údaje, nejde o doporučení k sázce.
      </footer>
    </Frame>
  );
}

/* ---------- řádky zápasů ---------- */

function RecentPreview({ rows, onMore }: { rows: CatalogRefereeMatch[]; onMore: () => void }) {
  const last = [...rows].sort((a, b) => b.d.localeCompare(a.d)).slice(0, 5);
  return (
    <Card title="Poslední zápasy" lead="Fauly a žluté karty jsou domácí : hosté." aside={rows.length > 5 ? <button type="button" onClick={onMore} className="min-h-9 text-[13px] font-medium text-(--c-accent) hover:underline">Všechny zápasy →</button> : undefined}>
      <MatchRows rows={last} />
    </Card>
  );
}

function MatchRows({ rows, pageSize = 25 }: { rows: CatalogRefereeMatch[]; pageSize?: number }) {
  const [shown, setShown] = useState(pageSize);
  if (!rows.length) return <Empty>Pro vybraný tým tu nic není.</Empty>;
  const sorted = [...rows].sort((a, b) => b.d.localeCompare(a.d));
  return (
    <>
    <ul className="-mx-1 divide-y divide-(--c-line)">
      {sorted.slice(0, shown).map((m) => {
        const body = (
          <div className="px-1 py-2.5 sm:flex sm:items-center sm:gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-(--c-faint)">{m.d ? formatDate(m.d) : "—"}</div>
              <div className="mt-0.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[13px] sm:text-sm">
                <span className="truncate text-right font-medium">{m.hn}</span>
                <span className="rounded-md bg-(--c-raised) px-2 py-0.5 text-[13px] font-bold tabular-nums">
                  {m.hs}:{m.as}
                </span>
                <span className="truncate font-medium">{m.an}</span>
              </div>
            </div>
            <div className="mt-1.5 flex justify-center gap-1 sm:mt-0 sm:justify-end">
              <Mini label="Fauly" pair={m.st?.fouls} />
              <Mini label="ŽK" pair={m.st?.yellow} tone="var(--c-warn)" />
              <Mini label="ČK" total={pairSum(m.st?.red) ?? (m.st?.fouls || m.st?.yellow ? 0 : null)} tone="var(--c-loss)" />
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
        Zobrazit dalších {Math.min(pageSize, sorted.length - shown)}
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
      <div className="text-[10px] uppercase tracking-wide text-(--c-faint)">{label}</div>
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
