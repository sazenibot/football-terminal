import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CoachComparePanel, TeamRadarPanel } from "../cat/TeamCompare";
import { Avatar, Back, Crest, Frame, Hero, Loading, Meta, NotFound, Pill, RankCard, StatStrip, StickyTabs, fmtNum, rankColor } from "../cat/kit";
import { pitchSeasonOpts, type MatchRow } from "../components/PitchCards";
import { ShotMapCard, TrendCard } from "../cat/PitchViz";
import { formatDate } from "../lib/format";
import { useCatalogExplorer, useCatalogTeam, usePitchTeam, useXgotIndex } from "../lib/useData";
import { last5BadgeForTeam, type XgotBadge } from "../lib/xgEfficiency";
import { useTabLock } from "../access/catalogGate";
import { Gate } from "../access/Gate";
import { Card, Empty, FormDots, Info, ResBadge, Seg, Stat, VenueTag, plural, type Res } from "../mc2/kit";
import type { CatalogProfileStat, CatalogSquadPlayer, CatalogTeamCoach, CatalogTeamDetail, CatalogUpcoming } from "../types";

const TABS = [
  { id: "overview", label: "Přehled" },
  { id: "stats", label: "Statistiky" },
  { id: "squad", label: "Kádr" },
  { id: "radar", label: "Radar týmu" },
  { id: "coaches", label: "Trenéři" },
] as const;
type TabId = (typeof TABS)[number]["id"];

type Group = "attack" | "defense" | "discipline" | "setpiece";
const GROUPS: { id: Group; label: string }[] = [
  { id: "attack", label: "Útok" },
  { id: "defense", label: "Obrana" },
  { id: "discipline", label: "Disciplína" },
  { id: "setpiece", label: "Standardky" },
];

/** Údaje bez „lepší / horší“ (objem hry), do silných a slabých stránek je nepočítáme. */
const NEUTRAL_KEYS = new Set(["shots_off", "shots_inside", "shots_outside", "attacks", "dangerous_attacks", "passes", "free_kicks", "throwins", "goal_kicks", "crosses", "accurate_crosses", "possession", "penalties", "dribbles", "fouls_received", "saves", "tackles"]);

/** Náročnost soupeře 1 až 5. Pevné barvy, ať je text čitelný v tmavém i světlém režimu. */
const FDR_STYLE: Record<number, { bg: string; fg: string }> = {
  1: { bg: "#34d399", fg: "#052e1f" },
  2: { bg: "#86efac", fg: "#052e1f" },
  3: { bg: "#fbbf24", fg: "#3b2a00" },
  4: { bg: "#fb923c", fg: "#3b1500" },
  5: { bg: "#f43f5e", fg: "#ffffff" },
};

/* ---------- pomocné ---------- */

function resolveCoach(team: CatalogTeamDetail): CatalogTeamCoach | null {
  if (team.coach?.name) return team.coach;
  if (team.overlay?.coach?.name) return team.overlay.coach;
  const era = team.overlay?.eras?.[0];
  if (!era?.coach_name) return null;
  return { id: era.coach_id, name: era.coach_name, start: era.from ? era.from.slice(0, 10) : null, image: null };
}

function daysSince(start?: string | null): number | null {
  if (!start) return null;
  const [y, m, d] = start.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  return Math.max(0, Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(y, m - 1, d)) / 86_400_000));
}

function tenure(days: number): string {
  if (days < 60) return `${days} ${plural(days, "den", "dny", "dní")}`;
  if (days < 730) {
    const mo = Math.round(days / 30.4);
    return `${mo} ${plural(mo, "měsíc", "měsíce", "měsíců")}`;
  }
  const y = Math.floor(days / 365.25);
  return `${y} ${plural(y, "rok", "roky", "let")}`;
}

function statsOf(team: CatalogTeamDetail): CatalogProfileStat[] {
  const p = team.overlay?.profile;
  if (!p) return [];
  if (p.stats?.length) return p.stats.filter((s) => s.value != null);
  return [p.shots, p.sot, p.corners, p.possession, p.fouls, p.yellow].filter((s): s is CatalogProfileStat => !!s && s.value != null).map((s) => ({ ...s, group: "attack" as const }));
}

function LuckChip({ badge }: { badge: XgotBadge }) {
  const lucky = badge.id === "lucky_scoring_team";
  return (
    <Pill tone={lucky ? "var(--c-warn)" : "var(--c-loss)"}>
      {lucky ? "Štěstí" : "Smolaři"}
      <Info label="Co to znamená">{badge.tooltip}</Info>
    </Pill>
  );
}

/* ---------- stránka ---------- */

export function CatalogTeamPage() {
  const id = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const { data: team, error, missing } = useCatalogTeam(Number.isFinite(id) ? id : null);
  const xgotIndex = useXgotIndex();
  const lock = useTabLock("teams");
  const { data: explorer, missing: explorerMissing, error: explorerError } = useCatalogExplorer(team?.league_id ?? null);
  const pitch = usePitchTeam(Number.isFinite(id) ? id : null);

  const rawTab = params.get("tab") === "compare" ? "radar" : params.get("tab");
  const tab = (TABS.find((t) => t.id === rawTab)?.id ?? "overview") as TabId;
  const setTab = (t: TabId) => setParams(t === "overview" ? {} : { tab: t }, { replace: true });

  useEffect(() => {
    document.title = team ? `${team.name} · tým · Katalog` : "Tým · Katalog";
  }, [team]);

  const back = <Back to={team ? `/catalog?league=${team.league_id}` : "/catalog"}>{team?.league_name ?? "Katalog"}</Back>;
  if (missing) return <NotFound kind="Tento tým" back={back} />;
  if (error)
    return (
      <Frame>
        {back}
        <p className="mt-4 text-(--c-loss)">Tým se nepodařilo načíst: {error}</p>
      </Frame>
    );
  if (!team) return <Loading>Načítám tým…</Loading>;

  const overlay = team.overlay;
  const table = overlay?.table;
  const stats = statsOf(team);
  const badge = last5BadgeForTeam(xgotIndex, team.id);
  const hasCompare = !!explorer || (!explorerMissing && !explorerError);
  const tabs = TABS.filter((t) => (t.id !== "radar" && t.id !== "coaches") || (hasCompare && !!overlay));
  const active = tabs.some((t) => t.id === tab) ? tab : "overview";
  const recentRes = (overlay?.recent || []).slice(0, 5).map((r) => r.result).reverse();
  const formFromTable = (table?.form || "").split("").filter((c): c is Res => c === "V" || c === "R" || c === "P");
  const form: Res[] = formFromTable.length ? formFromTable : recentRes;

  return (
    <Frame>
      {back}
      <div className="mt-3">
        <Hero
          media={<Crest src={team.image} name={team.name} size={72} />}
          eyebrow="Profil týmu"
          title={team.name}
          sub={
            <>
              {team.league_name}
              {overlay?.season_name ? ` · ${overlay.season_name}` : ""}
            </>
          }
          chips={
            <>
              {team.short && <Pill tone="var(--c-muted)">{team.short}</Pill>}
              {badge && <LuckChip badge={badge} />}
            </>
          }
        >
          {table ? (
            <StatStrip>
              <Stat value={table.position != null ? `${table.position}.` : "—"} label="Pozice v tabulce" />
              <Stat value={table.points ?? "—"} label={`Body · ${table.played ?? 0} z.`} />
              <Stat value={table.gf != null && table.ga != null ? `${table.gf}:${table.ga}` : "—"} label={table.won != null ? `Skóre · ${table.won}V ${table.drawn ?? 0}R ${table.lost ?? 0}P` : "Skóre"} />
              <div className="flex flex-col items-center justify-center rounded-xl bg-(--c-raised) px-3 py-3">
                <FormDots results={form} />
                <div className="mt-1.5 text-xs text-(--c-muted)">Forma</div>
              </div>
            </StatStrip>
          ) : (
            <p className="text-[13px] text-(--c-muted)">Tabulku této sezóny zatím nemáme.</p>
          )}
        </Hero>
      </div>

      <StickyTabs tabs={lock.withLocks(tabs)} value={active} onChange={setTab} label="Sekce týmu" />

      <Gate need={lock.need(active) ?? "account"} when={!!lock.need(active)} title="Celý profil týmu je pro registrované" text="Radar, trenéři i kádr odemkne bezplatná registrace. Přehled a statistiky jsou otevřené.">
      <div role="tabpanel" className="mt-4 space-y-5">
        {active === "overview" && <Overview team={team} stats={stats} onMore={() => setTab("stats")} />}
        {active === "stats" && (
          <>
            <StatsCard stats={stats} />
            {pitch && <PitchBlock team={team} pitch={pitch} />}
          </>
        )}
        {active === "squad" && <SquadCard players={team.squad} />}
        {active === "radar" && <TeamRadarPanel explorer={explorer} defaultTeamId={team.id} loading={!explorer && !explorerMissing && !explorerError} />}
        {active === "coaches" && <CoachComparePanel explorer={explorer} defaultTeamId={team.id} loading={!explorer && !explorerMissing && !explorerError} />}
      </div>
      </Gate>

      <footer className="pt-8 text-center text-xs text-(--c-faint)">Informativní údaje, nejde o doporučení k sázce.</footer>
    </Frame>
  );
}

/* ---------- přehled ---------- */

function Overview({ team, stats, onMore }: { team: CatalogTeamDetail; stats: CatalogProfileStat[]; onMore: () => void }) {
  const upcoming = team.upcoming || [];
  const recent = team.overlay?.recent || [];
  const coach = resolveCoach(team);
  return (
    <>
      <Strengths stats={stats} onMore={onMore} />

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Nadcházející zápasy" lead="Číslo vpravo je náročnost soupeře: 1 lehčí, 5 těžší." aside={<FdrLegend />}>
          {upcoming.length === 0 ? <Empty>V kalendáři nic není.</Empty> : <ul className="-mx-1 divide-y divide-(--c-line)">{upcoming.map((fx) => <UpcomingRow key={fx.fixture_id} fx={fx} />)}</ul>}
        </Card>

        <Card title="Poslední zápasy" lead="Výsledky letošní sezóny.">
          {recent.length === 0 ? (
            <Empty>Zatím žádný odehraný zápas.</Empty>
          ) : (
            <ul className="-mx-1 divide-y divide-(--c-line)">
              {recent.map((r) => {
                const body = (
                  <div className="flex items-center gap-2.5 px-1 py-2.5">
                    <ResBadge r={r.result} />
                    <VenueTag home={r.is_home} />
                    <Crest src={r.opponent.image} name={r.opponent.name} size={20} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{r.opponent.name}</span>
                    <span className="shrink-0 text-[13px] font-bold tabular-nums">
                      {r.gf}:{r.ga}
                    </span>
                    <span className="hidden w-16 shrink-0 text-right text-[11px] text-(--c-faint) sm:block">{r.starting_at ? formatDate(r.starting_at) : ""}</span>
                  </div>
                );
                return (
                  <li key={r.fixture_id}>
                    {r.has_match_page ? (
                      <Link to={`/match/${r.fixture_id}`} className="block rounded-lg hover:bg-(--c-raised)">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Klub">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 content-start">
            <Meta label="Stadion" value={team.venue?.name} />
            <Meta label="Město" value={team.venue?.city} />
            <Meta label="Kapacita" value={team.venue?.capacity != null ? team.venue.capacity.toLocaleString("cs-CZ") : null} />
            <Meta label="Založeno" value={team.founded} />
          </div>
          <CoachCard coach={coach} />
        </div>
      </Card>
    </>
  );
}

function CoachCard({ coach }: { coach: CatalogTeamCoach | null }) {
  if (!coach?.name) return <p className="self-center text-sm text-(--c-muted)">Hlavního trenéra u tohoto klubu zatím nemáme.</p>;
  const days = daysSince(coach.start);
  return (
    <div className="flex items-center gap-4 rounded-xl bg-(--c-raised) px-4 py-3">
      <Avatar src={coach.image} name={coach.name} size={64} />
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">Hlavní trenér</div>
        <div className="mt-0.5 text-[17px] font-bold leading-tight">{coach.name}</div>
        <div className="mt-0.5 text-xs text-(--c-muted)">
          {coach.start
            ? `ve funkci od ${coach.start.slice(0, 10).split("-").reverse().map(Number).join(". ")}${days != null ? ` · ${tenure(days)}` : ""}`
            : "datum nástupu neznáme"}
        </div>
      </div>
    </div>
  );
}

function FdrLegend() {
  return (
    <div className="flex items-center gap-1" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold" style={{ background: FDR_STYLE[n].bg, color: FDR_STYLE[n].fg }}>
          {n}
        </span>
      ))}
    </div>
  );
}

function UpcomingRow({ fx }: { fx: CatalogUpcoming }) {
  const rating = fx.fdr_rating ?? 0;
  const body = (
    <div className="flex items-center gap-2.5 px-1 py-2.5">
      <VenueTag home={fx.is_home} />
      <Crest src={fx.opponent.image} name={fx.opponent.name} size={22} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">{fx.opponent.name}</div>
        <div className="text-[11px] text-(--c-faint)">
          {fx.starting_at ? new Date(fx.starting_at).toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" }) : "—"}
          {fx.opponent_position != null ? ` · soupeř ${fx.opponent_position}.` : ""}
        </div>
      </div>
      {rating > 0 && (
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[13px] font-bold"
          style={{ background: FDR_STYLE[rating]?.bg, color: FDR_STYLE[rating]?.fg }}
          title={`Náročnost soupeře ${rating} z 5`}
        >
          {rating}
        </span>
      )}
    </div>
  );
  return (
    <li>
      {fx.has_match_page ? (
        <Link to={`/match/${fx.fixture_id}`} className="block rounded-lg hover:bg-(--c-raised)">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}

/* ---------- silné a slabé stránky ---------- */

function Strengths({ stats, onMore }: { stats: CatalogProfileStat[]; onMore: () => void }) {
  const rated = stats.filter((s) => s.rank != null && (s.league_size ?? 0) >= 8 && s.key && !NEUTRAL_KEYS.has(s.key));
  if (rated.length < 6) return null;
  const byQuality = [...rated].sort((a, b) => (a.rank! / a.league_size!) - (b.rank! / b.league_size!));
  const best = byQuality.slice(0, 3);
  const worst = byQuality.slice(-3).reverse();
  const row = (s: CatalogProfileStat) => (
    <li key={s.key} className="flex items-center gap-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{s.label}</span>
        <span className="text-[11px] text-(--c-faint)">
          {fmtNum(s.value)} · liga {fmtNum(s.league_avg)}
        </span>
      </span>
      <span className="shrink-0 rounded-md px-2 py-0.5 text-[12px] font-bold tabular-nums" style={{ color: rankColor(s.rank!, s.league_size!), background: `color-mix(in oklab, ${rankColor(s.rank!, s.league_size!)} 15%, transparent)` }}>
        {s.rank}. z {s.league_size}
      </span>
    </li>
  );
  return (
    <Card
      title="V čem je tým silný a slabý"
      lead="Pořadí mezi týmy ligy v letošní sezóně, 1. je nejlepší."
      aside={
        <button type="button" onClick={onMore} className="min-h-9 text-[13px] font-medium text-(--c-accent) hover:underline">
          Všechna čísla →
        </button>
      }
    >
      <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--c-win)" }}>
            Nejsilnější stránky
          </h3>
          <ul className="divide-y divide-(--c-line)">{best.map(row)}</ul>
        </div>
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--c-loss)" }}>
            Nejslabší stránky
          </h3>
          <ul className="divide-y divide-(--c-line)">{worst.map(row)}</ul>
        </div>
      </div>
    </Card>
  );
}

/* ---------- statistiky ---------- */

const PREVIEW = 6;

function StatsCard({ stats }: { stats: CatalogProfileStat[] }) {
  const [group, setGroup] = useState<Group>("attack");
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => stats.filter((s) => (s.group || "attack") === group), [stats, group]);
  const shown = open ? rows : rows.slice(0, PREVIEW);
  useEffect(() => setOpen(false), [group]);

  if (!stats.length) {
    return (
      <Card title="Sezónní průměry">
        <Empty>Sezónní průměry ještě nejsou spočtené.</Empty>
      </Card>
    );
  }
  return (
    <Card title="Sezónní průměry" lead="Na zápas, s pořadím mezi týmy ligy. Zelená je horní pětina, růžová dolní, 1. je nejlepší.">
      <Seg label="Skupina statistik" value={group} onChange={setGroup} options={GROUPS.map((g) => ({ id: g.id, label: g.label }))} />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((s) => (
          <RankCard key={s.key || s.label} label={s.label} value={s.value} rank={s.rank} size={s.league_size} avg={s.league_avg} />
        ))}
      </div>
      {rows.length === 0 && <Empty>Pro tuto skupinu zatím nemáme čísla.</Empty>}
      {rows.length > PREVIEW && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-3 min-h-9 text-[13px] font-medium text-(--c-accent) hover:underline">
          {open ? "Méně" : `Zobrazit dalších ${rows.length - PREVIEW}`}
        </button>
      )}
    </Card>
  );
}

function PitchBlock({ team, pitch }: { team: CatalogTeamDetail; pitch: NonNullable<ReturnType<typeof usePitchTeam>> }) {
  const seasons = pitchSeasonOpts(pitch.season, pitch.matches);
  return (
    <div className="space-y-5">
      <TrendCard team={team.name} seasons={seasons} defaultSeason={pitch.season} />
      <ShotMapCard
        title="Mapa střel týmu"
        lead="Odkud tým střílí. Branka je nahoře, velikost tečky je xG střely."
        seasons={seasons}
        defaultSeason={pitch.season}
        shotsOf={shotsOfMatch}
      />
    </div>
  );
}

const shotsOfMatch = (m: MatchRow) => m.shots;

/* ---------- kádr ---------- */

const SQUAD_GROUPS = ["Brankáři", "Obránci", "Záložníci", "Útočníci", "Ostatní"];

function SquadCard({ players }: { players: CatalogSquadPlayer[] }) {
  const active = players.filter((p) => p.status !== "loan" && p.status !== "left");
  const [pos, setPos] = useState<string>("all");
  const groups = useMemo(() => {
    const buckets: CatalogSquadPlayer[][] = SQUAD_GROUPS.map(() => []);
    for (const p of active) {
      const i = p.position_id === 24 ? 0 : p.position_id === 25 ? 1 : p.position_id === 26 ? 2 : p.position_id === 27 ? 3 : 4;
      buckets[i].push(p);
    }
    for (const g of buckets) g.sort((a, b) => (b.season?.minutes ?? 0) - (a.season?.minutes ?? 0) || (a.number ?? 99) - (b.number ?? 99));
    return buckets.map((g, i) => ({ label: SQUAD_GROUPS[i], players: g })).filter((g) => g.players.length);
  }, [active]);
  const visible = groups.filter((g) => pos === "all" || g.label === pos);
  const anyStats = active.some((p) => p.season?.appearances != null);

  return (
    <Card title={`Kádr · ${active.length} ${plural(active.length, "hráč", "hráči", "hráčů")}`} lead="Bez hráčů na hostování a bez těch, kteří už klub opustili. V rámci postu podle odehraných minut.">
      <Seg label="Post" value={pos} onChange={setPos} options={[{ id: "all", label: "Všichni" }, ...groups.map((g) => ({ id: g.label, label: g.label }))]} />
      <div className="mt-4 space-y-5">
        {visible.map((g) => (
          <section key={g.label}>
            <div className="mb-1 flex items-center justify-between px-1">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">
                {g.label} <span className="ml-1 tabular-nums">{g.players.length}</span>
              </h3>
              {anyStats && (
                <div className="flex gap-3 pr-6 text-[10px] uppercase tracking-wide text-(--c-faint)">
                  <span className="w-8 text-center">Záp.</span>
                  <span className="w-8 text-center">G</span>
                  <span className="w-8 text-center">A</span>
                </div>
              )}
            </div>
            <ul className="divide-y divide-(--c-line)">
              {g.players.map((p) => (
                <li key={p.id}>
                  <Link to={`/catalog/players/${p.id}`} className="flex min-h-12 items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-(--c-raised)">
                    <span className="w-6 shrink-0 text-center text-xs tabular-nums text-(--c-faint)">{p.number ?? "–"}</span>
                    <Avatar src={p.image} name={p.name} size={32} />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                      {p.name}
                      {p.captain && <span className="ml-1.5 text-[10px] font-bold" style={{ color: "var(--c-warn)" }}>C</span>}
                    </span>
                    {anyStats && (
                      <span className="flex gap-3 text-[13px] tabular-nums text-(--c-muted)">
                        <span className="w-8 text-center">{p.season?.appearances ?? "–"}</span>
                        <span className="w-8 text-center">{p.season?.goals ?? "–"}</span>
                        <span className="w-8 text-center">{p.season?.assists ?? "–"}</span>
                      </span>
                    )}
                    <span aria-hidden className="text-lg leading-none text-(--c-faint)">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}
