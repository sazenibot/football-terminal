import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "../i18n/router";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { useTabLock } from "../access/catalogGate";
import { Gate } from "../access/Gate";
import { Avatar, Back, Crest, FilterBar, Frame, Hero, Loading, NotFound, Pill, RankCard, Select, StickyTabs, csMatches, fmtNum, rankColor } from "../cat/kit";
import type { MatchRow, SeasonOpt } from "../components/PitchCards";
import { KeeperCardV2, ShotMapCard } from "../cat/PitchViz";
import { formatDate } from "../lib/format";
import {
  PLAYER_STATS,
  RADAR_AXES,
  ROLE_LABEL,
  pctSuffix,
  badgesFor,
  fdrBuckets,
  filterMatches,
  gamesPerTeam,
  metricValue,
  minuteThreshold,
  minutesOf,
  per90,
  poolPlayer,
  rankDesc,
  seasonLabel,
  sumKey,
  type Badge,
  type ClubKey,
  type Half,
  type PlayerStatDef,
  type ProfileGroup,
  type SeasonKey,
  type Venue,
} from "../lib/playerCatalog";
import { t, type Key } from "../i18n/locale";
import { useCatalogHub, useCatalogPlayer, usePitchPlayer, usePlayerPool, usePlayerShard } from "../lib/useData";
import { Card, Chip, Empty, Info, ResBadge, Seg, VenueTag, type Res } from "../mc2/kit";
import type { CatalogPlayerClub, CatalogPlayerMatch, CatalogPlayerOverlay, CatalogPlayerRole } from "../types";
import { dataPosition } from "../i18n/dataText";

const TABS = [
  { id: "overview", label: "ct.pl.tab.overview" },
  { id: "stats", label: "ct.pl.tab.stats" },
  { id: "shots", label: "ct.pl.tab.shots" },
  { id: "compare", label: "ct.pl.tab.compare" },
  { id: "matches", label: "ct.pl.tab.matches" },
] as const satisfies readonly { id: string; label: Key }[];
type TabId = (typeof TABS)[number]["id"];
type Scope = "league" | "role";

const GROUPS: { id: ProfileGroup; label: Key }[] = [
  { id: "attack", label: "ct.pl.group.attack" },
  { id: "defense", label: "ct.pl.group.defense" },
  { id: "discipline", label: "ct.pl.group.discipline" },
];

const VENUES: { id: string; label: Key }[] = [
  { id: "all", label: "ct.pl.venue.all" },
  { id: "home", label: "ct.pl.venue.home" },
  { id: "away", label: "ct.pl.venue.away" },
];
const HALVES: { id: string; label: Key }[] = [
  { id: "all", label: "ct.pl.half.all" },
  { id: "autumn", label: "ct.pl.half.autumn" },
  { id: "spring", label: "ct.pl.half.spring" },
];

/** Brankář se hodnotí jinými čísly než hráč v poli. */
const GK_KEYS = new Set(["sv", "gc", "cs", "cl", "aw", "it", "f", "y", "r"]);
const FIELD_ONLY_EXCLUDE = new Set(["sv", "gc", "cs"]);
const relevant = (def: PlayerStatDef, role: CatalogPlayerRole) => (role === "gk" ? GK_KEYS.has(def.key) : !FIELD_ONLY_EXCLUDE.has(def.key));

const mean = (values: Array<number | null>) => {
  const clean = values.filter((v): v is number => v != null);
  return clean.length ? Math.round((clean.reduce((a, b) => a + b, 0) / clean.length) * 100) / 100 : null;
};

const shotsOfMatch = (m: MatchRow) => m.shots;

function roleFromPosition(position?: string | null): CatalogPlayerRole {
  const p = (position || "").toLowerCase();
  if (p.includes("brank")) return "gk";
  if (p.includes("obrán") || p.includes("obran")) return "def";
  if (p.includes("zálož") || p.includes("zaloz")) return "mid";
  return "att";
}

function radarValues(rows: CatalogPlayerMatch[], role: CatalogPlayerRole) {
  const out: Record<string, number | null> = {};
  for (const key of RADAR_AXES[role]) {
    const def = PLAYER_STATS.find((s) => s.key === key);
    out[key] = def ? metricValue(rows, def) : per90(sumKey(rows, key), minutesOf(rows));
  }
  return out;
}

function pitchMatchesForHeader(matches: MatchRow[], season: SeasonKey, current: number | null): MatchRow[] {
  if (!matches.length) return [];
  if (season === "all") return matches;
  if (current != null && season === current) return matches;
  return [];
}

/* ---------- stránka ---------- */

export function CatalogPlayerPage() {
  const id = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const { data: player, error, missing } = useCatalogPlayer(Number.isFinite(id) ? id : null);
  // Zápasy tohoto hráče z malého shardu (~250 kB), ne z celého ligového indexu.
  const shard = usePlayerShard(player?.league_id ?? null, Number.isFinite(id) ? id : null);
  const pitch = usePitchPlayer(Number.isFinite(id) ? id : null);
  const lock = useTabLock("players");

  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "overview") as TabId;
  const setTab = (t: TabId) => setParams(t === "overview" ? {} : { tab: t }, { replace: true });

  const [season, setSeason] = useState<SeasonKey | null>(null);
  const [club, setClub] = useState<ClubKey>("current");
  const [venue, setVenue] = useState<Venue>("all");
  const [half, setHalf] = useState<Half>("all");
  const [scope, setScope] = useState<Scope>("league");
  const [group, setGroup] = useState<ProfileGroup>("attack");
  const [compareTeamId, setCompareTeamId] = useState<number | "">("");
  const [compareId, setCompareId] = useState<number | "">("");

  // Soubor hráče nemusí nést zápasy. Pak je bereme z ligového indexu, kde je má každý hráč.
  const indexRow = useMemo(() => shard?.players.find((p) => p.id === id), [shard, id]);
  const overlay = useMemo<CatalogPlayerOverlay | undefined>(() => {
    if (!indexRow || !shard) return player?.overlay ?? undefined;
    const clubs = new Map<number, CatalogPlayerClub>();
    for (const m of indexRow.matches) {
      const c = clubs.get(m.tid) ?? { id: m.tid, name: m.tn || String(m.tid), from: m.d, to: m.d, matches: 0 };
      c.matches += 1;
      if (m.d < (c.from ?? m.d)) c.from = m.d;
      if (m.d > (c.to ?? m.d)) c.to = m.d;
      clubs.set(m.tid, c);
    }
    return {
      current_season_id: shard.current_season_id,
      role: indexRow.role,
      career_matches: indexRow.matches.length,
      clubs: [...clubs.values()].sort((a, b) => (b.to ?? "").localeCompare(a.to ?? "")),
      seasons: shard.seasons,
      matches: indexRow.matches,
    };
  }, [player, shard, indexRow]);
  const currentSeasonId = overlay?.current_season_id ?? shard?.current_season_id ?? null;
  const resolvedSeason: SeasonKey = season ?? currentSeasonId ?? "all";
  const role: CatalogPlayerRole = overlay?.role || roleFromPosition(player?.position);
  const matches = useMemo(() => overlay?.matches ?? [], [overlay]);
  const seasons = overlay?.seasons || shard?.seasons || [];
  const clubs = overlay?.clubs || [];

  const slice = useMemo(() => filterMatches(matches, resolvedSeason, venue, half, club, player?.team_id), [matches, resolvedSeason, venue, half, club, player?.team_id]);
  // Souhrny všech hráčů ligy ve vybrané sezóně (soubor ~20 kB), z nich pořadí a srovnání
  const poolFile = usePlayerPool(player?.league_id ?? null, shard || player?.overlay ? resolvedSeason : null);
  const hub = useCatalogHub(player && tab === "compare" ? player.league_id : null).data;
  const games = poolFile?.games ?? 0;
  const threshold = minuteThreshold(gamesPerTeam(games));
  const cell = `${venue}.${half}`;

  /** Hráči ligy se stejným výběrem a dost minutami. Základ pro pořadí. */
  const pools = useMemo(() => {
    const rows = (poolFile?.cells[cell] ?? []).map(poolPlayer).filter((p) => minutesOf(p.rows) >= threshold);
    return { league: rows.map((p) => p.rows), role: rows.filter((p) => p.role === role).map((p) => p.rows) };
  }, [poolFile, cell, threshold, role]);
  const pool = scope === "league" ? pools.league : pools.role;

  const badges = useMemo(() => badgesFor(slice, role, pools.role, 90 * gamesPerTeam(games)), [slice, role, pools.role, games]);

  /* srovnání */
  const peers = useMemo(() => {
    const names = new Map((hub?.players ?? []).map((p) => [p.id, p]));
    const rowsOf = new Map((poolFile?.cells[cell] ?? []).map((r) => [r[0], poolPlayer(r).rows]));
    return (poolFile?.cells["all.all"] ?? [])
      .map(poolPlayer)
      .filter((p) => p.role === role && p.id !== id && names.has(p.id))
      .map((p) => {
        const card = names.get(p.id)!;
        return { id: p.id, name: card.name, number: card.number, team_id: card.team_id ?? p.teamId, team_name: card.team_name, rows: rowsOf.get(p.id) ?? [] };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "cs"));
  }, [hub, poolFile, cell, role, id]);
  const radarTeams = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of peers) if (p.team_id && p.team_name) map.set(p.team_id, p.team_name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "cs"));
  }, [peers]);
  const teamPeers = useMemo(() => (compareTeamId === "" ? [] : peers.filter((p) => p.team_id === compareTeamId)), [peers, compareTeamId]);
  const compare = compareId !== "" ? teamPeers.find((p) => p.id === compareId) ?? null : null;

  useEffect(() => {
    document.title = player ? t("ct.pl.docTitle", { name: player.name }) : t("ct.pl.docTitleLoading");
  }, [player]);

  const back = <Back to={player ? `/catalog?league=${player.league_id}&tab=players` : "/catalog"}>{player?.league_name ?? t("ct.pl.backFallback")}</Back>;
  if (missing) return <NotFound kind={t("ct.pl.kind")} back={back} />;
  if (error)
    return (
      <Frame>
        {back}
        <p className="mt-4 text-(--c-loss)">{t("ct.pl.loadError", { error })}</p>
      </Frame>
    );
  if (!player) return <Loading>{t("ct.pl.loading")}</Loading>;

  const kpi = kpiFor(role, slice, pools.league);
  const buckets = fdrBuckets(slice);
  const pitchClubOk = club === "all" || club === "current" || club === player.team_id;
  const pitchRows = pitchClubOk ? pitchMatchesForHeader(pitch?.matches || [], resolvedSeason, currentSeasonId) : [];
  const pitchSeasons: SeasonOpt[] = [{ id: "view", label: pitch?.season || "", matches: pitchRows }];
  const shotCount = pitchRows.reduce((n, m) => n + (m.shots?.length || 0), 0);
  const hasKeeper = role === "gk" && !!pitch?.keeper && pitchRows.length > 0;
  const hasShots = shotCount > 0 || hasKeeper;
  const tabs = TABS.filter((t) => (t.id !== "shots" || hasShots) && (t.id !== "compare" || !!shard));
  const active = tabs.some((t) => t.id === tab) ? tab : "overview";
  const total = overlay?.career_matches ?? matches.length;

  return (
    <Frame>
      {back}
      <div className="mt-3">
        <Hero
          media={<Avatar src={player.image} name={player.name} size={80} />}
          eyebrow={t("ct.pl.eyebrow")}
          title={player.name}
          sub={
            <>
              <Link to={`/catalog/teams/${player.team_id}`} className="inline-flex items-center gap-1.5 font-medium text-(--c-text) hover:underline">
                <Crest src={player.team_image} name={player.team_name} size={16} />
                {player.team_name}
              </Link>
              <div className="mt-0.5">
                {dataPosition(player.position) || ROLE_LABEL[role]}
                {player.number != null ? ` · #${player.number}` : ""}
                {player.age != null ? ` · ${t("ct.pl.age", { n: player.age })}` : ""}
              </div>
            </>
          }
          chips={
            <>
              {(shard || matches.length > 0) && (
                <Pill tone="var(--c-muted)">
                  {t("ct.pl.inSelection", { n: slice.length })}
                </Pill>
              )}
              {badges.map((b) => (
                <BadgeChip key={b.label} badge={b} />
              ))}
            </>
          }
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {kpi.map((k) => (
              <Kpi key={k.label} {...k} />
            ))}
          </div>
        </Hero>
      </div>

      <FilterBar
        summary={[
          seasonLabel(resolvedSeason, seasons, currentSeasonId) === t("ct.season.current")
            ? seasons.find((x) => x.id === resolvedSeason)?.name || t("ct.season.current")
            : seasonLabel(resolvedSeason, seasons, currentSeasonId),
          club === "current" ? t("ct.pl.sum.thisClub") : club === "all" ? t("ct.pl.sum.allClubs") : clubs.find((c) => c.id === club)?.name,
          venue === "all" ? null : venue === "home" ? t("ct.pl.sum.home") : t("ct.pl.sum.away"),
          half === "all" ? null : half === "autumn" ? t("ct.pl.sum.autumn") : t("ct.pl.sum.spring"),
        ]
          .filter(Boolean)
          .join(" · ")}
        note={!shard && !matches.length ? undefined : t("ct.pl.note", { n: slice.length, total })}
      >
        <Select
          label={t("ct.pl.season")}
          value={resolvedSeason === "all" ? "all" : String(resolvedSeason)}
          onChange={(v) => setSeason(v === "all" ? "all" : Number(v))}
          options={[{ id: "all", label: t("ct.season.all") }, ...seasons.map((s) => ({ id: String(s.id), label: `${s.name || s.id}${s.id === currentSeasonId ? t("ct.pl.currentTag") : ""}` }))]}
        />
        <Select
          label={t("ct.pl.club")}
          value={String(club)}
          onChange={(v) => setClub(v === "all" || v === "current" ? v : Number(v))}
          options={[
            { id: "current", label: t("ct.pl.opt.currentClub") },
            { id: "all", label: t("ct.pl.opt.allClubs") },
            ...clubs.map((c) => ({ id: String(c.id), label: `${c.name}${c.from && c.to ? ` (${c.from.slice(0, 4)}–${c.to.slice(0, 4)})` : ""}` })),
          ]}
        />
        <Select label={t("ct.pl.venueLabel")} value={venue} onChange={setVenue} options={VENUES.map((o) => ({ id: o.id, label: t(o.label) }))} />
        <Select label={t("ct.pl.halfLabel")} value={half} onChange={setHalf} options={HALVES.map((o) => ({ id: o.id, label: t(o.label) }))} />
      </FilterBar>

      <StickyTabs tabs={lock.withLocks(tabs.map((x) => ({ ...x, label: t(x.label) })))} value={active} onChange={setTab} label={t("ct.pl.tabsAria")} />

      <Gate need={lock.need(active) ?? "unlimited"} when={!!lock.need(active)} title={t("ct.pl.gateTitle")} text={t("ct.pl.gateText")}>
      <div role="tabpanel" className="mt-4 space-y-5">
        {!shard && !matches.length ? (
          <p className="py-10 text-center text-sm text-(--c-muted)">{t("ct.pl.loadingStats")}</p>
        ) : slice.length === 0 && active !== "shots" ? (
          <Empty>{t("ct.pl.noMatches")}</Empty>
        ) : (
          <>
            {active === "overview" && (
              <>
                <Strengths slice={slice} role={role} pool={pools.role} onMore={() => setTab("stats")} />
                <Card title={t("ct.pl.fdrTitle")} lead={t("ct.pl.fdrLead")}>
                  <div className="grid gap-3 md:grid-cols-3">
                    <FdrCard title={t("ct.pl.fdrHard")} color="var(--c-loss)" role={role} rows={buckets.hard} />
                    <FdrCard title={t("ct.pl.fdrMid")} color="var(--c-warn)" role={role} rows={buckets.mid} />
                    <FdrCard title={t("ct.pl.fdrEasy")} color="var(--c-win)" role={role} rows={buckets.easy} />
                  </div>
                </Card>
              </>
            )}

            {active === "stats" && (
              <StatsCard slice={slice} pool={pool} role={role} group={group} setGroup={setGroup} scope={scope} setScope={setScope} />
            )}

            {active === "shots" && (
              <div className="space-y-5">
                {hasKeeper && <KeeperCardV2 seasons={pitchSeasons} defaultSeason="view" name={player.common_name || player.name} showSeason={false} />}
                {shotCount > 0 && (
                  <ShotMapCard
                    title={t("ct.pl.shotMapTitle", { name: player.common_name || player.name })}
                    lead={t("ct.pl.shotMapLead")}
                    seasons={pitchSeasons}
                    defaultSeason="view"
                    shotsOf={shotsOfMatch}
                    showSeason={false}
                  />
                )}
              </div>
            )}

            {active === "compare" && (
              <Card title={t("ct.pl.cmpTitle")} lead={t("ct.pl.cmpLead")}>
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Select
                    label={t("ct.pl.cmpTeam")}
                    value={compareTeamId === "" ? "" : String(compareTeamId)}
                    onChange={(v) => {
                      setCompareTeamId(v ? Number(v) : "");
                      setCompareId("");
                    }}
                    options={[{ id: "", label: t("ct.pl.cmpPickTeam") }, ...radarTeams.map(([tid, name]) => ({ id: String(tid), label: name }))]}
                  />
                  <Select
                    label={t("ct.pl.cmpPlayer")}
                    value={compare && compareId !== "" ? String(compareId) : ""}
                    onChange={(v) => setCompareId(v ? Number(v) : "")}
                    options={[{ id: "", label: compareTeamId === "" ? t("ct.pl.cmpTeamFirst") : t("ct.pl.cmpPickPlayer") }, ...teamPeers.map((p) => ({ id: String(p.id), label: `${p.name}${p.number != null ? ` · #${p.number}` : ""}` }))]}
                  />
                </div>
                <PlayerRadar
                  role={role}
                  a={radarValues(slice, role)}
                  b={compare ? radarValues(compare.rows, role) : null}
                  avg={Object.fromEntries(RADAR_AXES[role].map((key) => {
                    const def = PLAYER_STATS.find((s) => s.key === key);
                    return [key, def ? mean(pools.role.map((rows) => metricValue(rows, def))) : null];
                  }))}
                  nameA={player.name}
                  nameB={compare?.name}
                />
              </Card>
            )}

            {active === "matches" && (
              <Card title={t("ct.pl.matchesTitle")} lead={t("ct.pl.matchesLead")}>
                <MatchRows rows={slice} role={role} teamId={player.team_id} />
              </Card>
            )}
          </>
        )}
      </div>
      </Gate>

    </Frame>
  );
}

/* ---------- hlavička ---------- */

function BadgeChip({ badge }: { badge: Badge }) {
  const tone = badge.tone === "warning" ? "var(--c-loss)" : badge.tone === "value" ? "var(--c-accent)" : "var(--c-muted)";
  return (
    <Pill tone={tone}>
      <span aria-hidden className="mr-1">{badge.emoji}</span>
      {badge.label}
    </Pill>
  );
}

function kpiFor(role: CatalogPlayerRole, rows: CatalogPlayerMatch[], pool: CatalogPlayerMatch[][]) {
  const mn = minutesOf(rows);
  const total = (key: string) => (rows.length ? sumKey(rows, key) : null);
  const poolTotal = (key: string) => pool.map((p) => (p.length ? sumKey(p, key) : null));
  const poolRate = (key: string) => pool.map((p) => per90(sumKey(p, key), minutesOf(p)));
  if (role === "gk") {
    return [
      kpiCell(t("ct.pl.k.saves"), total("sv"), 0, poolTotal("sv"), true),
      kpiCell(t("ct.pl.k.saves90"), per90(sumKey(rows, "sv"), mn), 2, poolRate("sv"), true),
      kpiCell(t("ct.pl.k.cs"), total("cs"), 0, poolTotal("cs"), true),
      kpiCell(t("ct.pl.k.gc"), total("gc"), 0, poolTotal("gc"), false),
    ];
  }
  if (role === "def") {
    return [
      kpiCell(t("ct.pl.k.min"), mn || null, 0, pool.map(minutesOf), true),
      kpiCell(t("ct.pl.k.cs"), total("cs"), 0, poolTotal("cs"), true),
      kpiCell(t("ct.pl.k.f90"), per90(sumKey(rows, "f"), mn), 2, poolRate("f"), false),
      kpiCell(t("ct.pl.k.dw90"), per90(sumKey(rows, "dw"), mn), 2, poolRate("dw"), true),
    ];
  }
  return [
    kpiCell(t("ct.pl.k.min"), mn || null, 0, pool.map(minutesOf), true),
    kpiCell(t("ct.pl.k.g"), total("g"), 0, poolTotal("g"), true),
    kpiCell(t("ct.pl.k.a"), total("a"), 0, poolTotal("a"), true),
    kpiCell(t("ct.pl.k.sh90"), per90(sumKey(rows, "sh"), mn), 2, poolRate("sh"), true),
  ];
}

function kpiCell(label: string, value: number | null, digits: number, pool: Array<number | null>, higherBetter: boolean) {
  const { rank, size } = rankDesc(value, pool, higherBetter);
  return { label, value, digits, rank: size >= 2 ? rank : null, size };
}

function Kpi({ label, value, digits, rank, size }: { label: string; value: number | null; digits: number; rank: number | null; size: number }) {
  return (
    <div className="rounded-xl bg-(--c-raised) px-3 py-3 text-center">
      <div className="text-xl font-bold leading-none tabular-nums">{fmtNum(value, digits)}</div>
      <div className="mt-1.5 text-xs text-(--c-muted)">{label}</div>
      <div className="mt-0.5 h-4 text-xs font-semibold tabular-nums" style={rank != null ? { color: rankColor(rank, size) } : undefined}>
        {rank != null ? t("ct.kit.rankOf", { rank, size }) : ""}
      </div>
    </div>
  );
}

/* ---------- přehled ---------- */

function Strengths({ slice, role, pool, onMore }: { slice: CatalogPlayerMatch[]; role: CatalogPlayerRole; pool: CatalogPlayerMatch[][]; onMore: () => void }) {
  const rows = useMemo(() => {
    return RADAR_AXES[role]
      .map((key) => PLAYER_STATS.find((s) => s.key === key))
      .filter((d): d is PlayerStatDef => !!d)
      .map((def) => {
        const value = metricValue(slice, def);
        const { rank, size } = rankDesc(value, pool.map((r) => metricValue(r, def)), def.higherBetter);
        return { def, value, rank, size, avg: mean(pool.map((r) => metricValue(r, def))) };
      })
      .filter((r) => r.value != null && r.rank != null && r.size >= 8);
  }, [slice, role, pool]);

  if (rows.length < 4) return null;
  const sorted = [...rows].sort((a, b) => a.rank! / a.size - b.rank! / b.size);
  const best = sorted.slice(0, 3);
  const worst = sorted.slice(-3).reverse();
  const item = (r: (typeof rows)[number]) => (
    <li key={r.def.key} className="flex items-center gap-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{r.def.label}</span>
        <span className="text-xs text-(--c-faint)">
          {fmtNum(r.value)}
          {r.def.asPct ? pctSuffix() : ""} · {t("ct.pl.roleAvg", { v: fmtNum(r.avg) })}
        </span>
      </span>
      <span className="shrink-0 rounded-md px-2 py-0.5 text-[12px] font-bold tabular-nums" style={{ color: rankColor(r.rank!, r.size), background: `color-mix(in oklab, ${rankColor(r.rank!, r.size)} 15%, transparent)` }}>
        {t("ct.kit.rankOf", { rank: r.rank!, size: r.size })}
      </span>
    </li>
  );
  return (
    <Card
      title={t("ct.pl.strengthTitle")}
      lead={t("ct.pl.strengthLead")}
      aside={
        <button type="button" onClick={onMore} className="min-h-9 text-[13px] font-medium text-(--c-accent) hover:underline">
          {t("ct.c.allNumbers")}
        </button>
      }
    >
      <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--c-win)" }}>{t("ct.c.best")}</h3>
          <ul className="divide-y divide-(--c-line)">{best.map(item)}</ul>
        </div>
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--c-loss)" }}>{t("ct.c.worst")}</h3>
          <ul className="divide-y divide-(--c-line)">{worst.map(item)}</ul>
        </div>
      </div>
    </Card>
  );
}

function FdrCard({ title, color, role, rows }: { title: string; color: string; role: CatalogPlayerRole; rows: CatalogPlayerMatch[] }) {
  const mn = minutesOf(rows);
  const pair =
    role === "gk"
      ? [
          { label: t("ct.pl.k.saves90"), value: per90(sumKey(rows, "sv"), mn) },
          { label: t("ct.pl.k.gc90"), value: per90(sumKey(rows, "gc"), mn) },
        ]
      : role === "def"
        ? [
            { label: t("ct.pl.k.dw90"), value: per90(sumKey(rows, "dw"), mn) },
            { label: t("ct.pl.k.cs"), value: sumKey(rows, "cs") || null },
          ]
        : [
            { label: t("ct.pl.k.g90"), value: per90(sumKey(rows, "g"), mn) },
            { label: t("ct.pl.k.sh90"), value: per90(sumKey(rows, "sh"), mn) },
          ];
  return (
    <div className="rounded-xl bg-(--c-raised) px-4 py-3.5" style={{ boxShadow: `inset 3px 0 0 ${color}` }}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color }}>{title}</div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {pair.map((p) => (
          <div key={p.label}>
            <div className="text-xl font-bold tabular-nums">{fmtNum(p.value)}</div>
            <div className="text-xs text-(--c-muted)">{p.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-xs text-(--c-faint)">
        {rows.length} {csMatches(rows.length)} · {fmtNum(mn, 0)} min
      </div>
    </div>
  );
}

/* ---------- statistiky ---------- */

function StatsCard({
  slice,
  pool,
  role,
  group,
  setGroup,
  scope,
  setScope,
}: {
  slice: CatalogPlayerMatch[];
  pool: CatalogPlayerMatch[][];
  role: CatalogPlayerRole;
  group: ProfileGroup;
  setGroup: (g: ProfileGroup) => void;
  scope: Scope;
  setScope: (s: Scope) => void;
}) {
  const stats = PLAYER_STATS.filter((s) => s.group === group && relevant(s, role) && metricValue(slice, s) != null);
  return (
    <Card
      title={t("ct.pl.ratesTitle")}
      lead={scope === "league" ? t("ct.pl.ratesLeadLeague") : t("ct.pl.ratesLeadRole")}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-(--c-raised) px-3 py-2.5">
        <span className="text-[13px] font-semibold text-(--c-text)">{t("ct.pl.compareWith")}</span>
        <Seg
          label={t("ct.pl.scopeAria")}
          value={scope}
          onChange={setScope}
          options={[
            { id: "league", label: t("ct.pl.scopeLeague") },
            { id: "role", label: t("ct.pl.scopeRole") },
          ]}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-(--c-faint)">{t("ct.pl.groupLabel")}</span>
        {GROUPS.map((g) => (
          <Chip key={g.id} active={g.id === group} onClick={() => setGroup(g.id)}>
            {t(g.label)}
          </Chip>
        ))}
      </div>
      {group === "attack" && (
        <p className="mt-3 text-xs text-(--c-faint)">
          {t("ct.pl.attackNote")}
        </p>
      )}
      {stats.length ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((def) => {
            const value = metricValue(slice, def);
            const values = pool.map((rows) => metricValue(rows, def));
            const { rank, size } = rankDesc(value, values, def.higherBetter);
            return <RankCard key={def.key} label={def.label} value={value} rank={rank} size={size} avg={mean(values)} suffix={def.asPct ? pctSuffix() : ""} hint={!def.higherBetter ? t("ct.pl.lowerBetter") : undefined} />;
          })}
        </div>
      ) : (
        <div className="mt-4">
          <Empty>{t("ct.pl.noGroup")}</Empty>
        </div>
      )}
    </Card>
  );
}

/* ---------- radar ---------- */

function toAxis(value: number, avg: number, higherBetter: boolean) {
  if (!avg) return 50;
  const ratio = higherBetter ? value / avg : avg / Math.max(value, 0.01);
  return Math.max(0, Math.min(100, Math.round(ratio * 50)));
}

function PlayerRadar({
  role,
  a,
  b,
  avg,
  nameA,
  nameB,
}: {
  role: CatalogPlayerRole;
  a: Record<string, number | null>;
  b?: Record<string, number | null> | null;
  avg: Record<string, number | null>;
  nameA: string;
  nameB?: string;
}) {
  const axes = RADAR_AXES[role];
  const hasB = !!b && !!nameB;
  const data = axes.map((key) => {
    const def = PLAYER_STATS.find((s) => s.key === key);
    const higher = def?.higherBetter !== false;
    const av = Number(a[key] ?? 0);
    const bv = Number(b?.[key] ?? 0);
    const lv = Number(avg[key] ?? 0);
    return {
      metric: def?.label ?? key,
      a: toAxis(av, lv, higher),
      b: hasB ? toAxis(bv, lv, higher) : 0,
      avg: 50,
      aRaw: av,
      bRaw: bv,
      avgRaw: lv,
    };
  });
  if (!Object.values(a).some((v) => v != null)) return <Empty>{t("ct.pl.noMinutes")}</Empty>;
  return (
    <div>
      <div className="h-[380px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="68%">
            <PolarGrid stroke="var(--c-line)" />
            <PolarAngleAxis dataKey="metric" tick={{ fill: "var(--c-muted)", fontSize: 11 }} />
            <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
            <Radar name="avg" dataKey="avg" stroke="var(--c-faint)" fill="var(--c-faint)" fillOpacity={0.06} strokeWidth={1.5} strokeDasharray="4 4" isAnimationActive={false} />
            <Radar name="A" dataKey="a" stroke="var(--c-home)" fill="var(--c-home)" fillOpacity={0.24} strokeWidth={2} isAnimationActive={false} />
            {hasB && <Radar name="B" dataKey="b" stroke="var(--c-away)" fill="var(--c-away)" fillOpacity={0.2} strokeWidth={2} isAnimationActive={false} />}
            <Tooltip
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
                if (!p) return null;
                return (
                  <div className="rounded-xl border border-(--c-line) bg-(--c-raised) px-3 py-2 text-xs shadow-xl">
                    <div className="mb-1 font-semibold">{p.metric}</div>
                    <div style={{ color: "var(--c-home)" }}>{nameA}: {fmtNum(p.aRaw)}</div>
                    {hasB && <div style={{ color: "var(--c-away)" }}>{nameB}: {fmtNum(p.bRaw)}</div>}
                    <div className="text-(--c-muted)">{t("ct.pl.avgRole", { v: fmtNum(p.avgRaw) })}</div>
                  </div>
                );
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-(--c-muted)">
        <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--c-home)" }} />{nameA}</li>
        {hasB && <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--c-away)" }} />{nameB}</li>}
        <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-dashed border-(--c-faint)" />{t("ct.pl.avgRoleLabel")}<Info>{t("ct.pl.avgRoleInfo")}</Info></li>
      </ul>
    </div>
  );
}

/* ---------- zápasy ---------- */

function MatchRows({ rows, role, teamId }: { rows: CatalogPlayerMatch[]; role: CatalogPlayerRole; teamId: number }) {
  const [shown, setShown] = useState(25);
  const sorted = useMemo(() => [...rows].sort((a, b) => b.d.localeCompare(a.d)), [rows]);
  /* inline = vidět v řádku i na mobilu, ostatní se na mobilu přesunou do druhého řádku */
  const cols =
    role === "gk"
      ? [
          { key: "mn", label: t("ct.pl.col.min"), inline: false },
          { key: "sv", label: t("ct.pl.col.sv"), inline: true },
          { key: "gc", label: t("ct.pl.col.gc"), inline: true },
          { key: "y", label: t("ct.pl.col.y"), inline: false },
          { key: "r", label: t("ct.pl.col.r"), inline: false },
        ]
      : [
          { key: "mn", label: t("ct.pl.col.min"), inline: false },
          { key: "g", label: t("ct.pl.col.g"), inline: true },
          { key: "a", label: t("ct.pl.col.a"), inline: true },
          { key: "sh", label: t("ct.pl.col.sh"), inline: false },
          { key: "sot", label: t("ct.pl.col.sot"), inline: false },
          { key: "f", label: t("ct.pl.col.f"), inline: false },
          { key: "y", label: t("ct.pl.col.y"), inline: false },
          { key: "r", label: t("ct.pl.col.r"), inline: false },
        ];
  /* SportMonks nulové statistiky neposílá, takže u hráče, který hrál, znamená chybějící údaj 0 */
  const val = (m: CatalogPlayerMatch, key: string) => m.st?.[key] ?? ((m.st?.mn ?? 0) > 0 ? 0 : null);
  return (
    <>
      <ul className="-mx-1 divide-y divide-(--c-line)">
        {sorted.slice(0, shown).map((m) => {
          const gf = m.h ? m.hs : m.as;
          const ga = m.h ? m.as : m.hs;
          const res: Res = gf > ga ? "V" : gf === ga ? "R" : "P";
          const body = (
            <div className="px-1 py-2.5">
            <div className="flex items-center gap-2">
              <ResBadge r={res} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs text-(--c-faint)">
                  <span>{m.d ? formatDate(m.d) : "—"}</span>
                  <VenueTag home={!!m.h} />
                  {m.tn && m.tid !== teamId && <span className="truncate">{t("ct.pl.for", { team: m.tn })}</span>}
                </div>
                <div className="mt-0.5 flex items-baseline gap-2 text-[14px]">
                  <span className="truncate font-semibold">{m.on}</span>
                  <span className="shrink-0 font-bold tabular-nums">
                    {gf}:{ga}
                  </span>
                </div>
              </div>
              {cols.map((c) => (
                <div key={c.key} className={`w-8 shrink-0 text-center ${c.key === "f" ? "sm:w-11" : "sm:w-10"} ${c.inline ? "" : "hidden sm:block"}`}>
                  <div className="text-[11px] uppercase tracking-wide text-(--c-faint)">{c.label}</div>
                  <div className={`text-[14px] tabular-nums ${val(m, c.key) ? "font-semibold" : "text-(--c-faint)"}`}>{val(m, c.key) ?? "–"}</div>
                </div>
              ))}
            </div>
              <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 pl-9 text-xs text-(--c-faint) sm:hidden">
                {cols
                  .filter((c) => !c.inline)
                  .map((c) => (
                    <span key={c.key}>
                      {c.label} <b className={`tabular-nums ${val(m, c.key) ? "text-(--c-text)" : "font-medium"}`}>{val(m, c.key) ?? "–"}</b>
                    </span>
                  ))}
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
        <button type="button" onClick={() => setShown((s) => s + 25)} className="mt-3 min-h-10 w-full rounded-xl border border-(--c-line) text-[13px] font-medium text-(--c-accent) hover:bg-(--c-raised)">
          {t("ct.c.showMore", { n: Math.min(25, sorted.length - shown) })}
        </button>
      )}
    </>
  );
}
