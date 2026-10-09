import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "../i18n/router";
import { formatDateTime } from "../lib/format";
import { isLiveLeague } from "../lib/pitchMatch";
import { LeaguePicker } from "../components/LeaguePicker";
import { isStale, useDataIndex, useLeagueRound, useMcCalendar, useTeamColors, useUpcoming } from "../lib/useData";
import { rememberLeague } from "../components/LeagueSwitcher";
import { MatchCalendar, archiveTitle, useArchiveDay } from "../components/MatchCalendar";
import { kickoffLabel } from "../mc2/derive";
import { Empty, ProbBar, Seg, TeamLogo } from "../mc2/kit";
import type { LeagueMeta, McCalendarMatch, RoundFixture, UpcomingFixture } from "../types";
import { t, type Key } from "../i18n/locale";
import { fmtDayLong, fmtStamp, fmtTime, fmtWeekdayDate } from "../lib/format";
import { orderedLeagues } from "../lib/leagues";
import { useAccess } from "../access/AccessContext";

/* ---------- ikonky u zápasů ---------- */

type SignalId = "referee";

type SignalDef = { id: SignalId; label: Key; icon: ReactNode; active: (f: RoundFixture) => boolean };

export const Whistle = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="8.5" cy="14.5" r="5" />
    <path d="M12.2 11.2 21 8v4.2h-6.3" />
    <circle cx="8.5" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
    <path d="M6 5.5 7.5 8" />
  </svg>
);

/** Přidání další ikonky = jedna položka tady. Zbytek stránky se přizpůsobí. */
const SIGNALS: SignalDef[] = [
  { id: "referee", label: "list.legend.referee", icon: <Whistle />, active: (f) => !!f.signals?.referee },
];

const activeIds = (f: RoundFixture): SignalId[] => SIGNALS.filter((s) => s.active(f)).map((s) => s.id);

/* ---------- „nové od poslední návštěvy“ ---------- */

const SEEN_KEY = "ft-seen-signals-v1";
type Seen = Record<string, string[]>;

const loadSeen = (): Seen => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}") as Seen;
  } catch {
    return {};
  }
};
const saveSeen = (s: Seen) => {
  try {
    const keys = Object.keys(s);
    if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete s[k];
    localStorage.setItem(SEEN_KEY, JSON.stringify(s));
  } catch {
    /* soukromý režim apod. */
  }
};

/**
 * Při první návštěvě si zápas zapamatujeme jako „viděný“ (nic neblikne).
 * Co přibude potom, je označené tečkou, dokud uživatel zápas neotevře.
 */
function useSeen(fixtures: RoundFixture[] | undefined) {
  const [seen, setSeen] = useState<Seen>(loadSeen);
  useEffect(() => {
    if (!fixtures) return;
    const cur = loadSeen();
    let dirty = false;
    for (const f of fixtures) {
      if (!cur[f.fixture_id]) {
        cur[f.fixture_id] = activeIds(f);
        dirty = true;
      }
    }
    if (dirty) saveSeen(cur);
  }, [fixtures]);
  const isNew = (f: RoundFixture, id: SignalId) => {
    const prev = seen[f.fixture_id];
    return !!prev && activeIds(f).includes(id) && !prev.includes(id);
  };
  const markSeen = (f: RoundFixture) => {
    const cur = loadSeen();
    cur[f.fixture_id] = activeIds(f);
    saveSeen(cur);
    setSeen(cur);
  };
  return { isNew, markSeen };
}

/* ---------- ligy ---------- */

/* ---------- zápasy ---------- */

const dayKey = (iso: string) => new Date(iso).toDateString();

export function dayLabel(iso: string, now = new Date()): { main: string; rel: string | null } {
  const d = new Date(iso);
  const days = Math.round((new Date(d.toDateString()).getTime() - new Date(now.toDateString()).getTime()) / 86400e3);
  const main = fmtDayLong(d);
  return { main: main.charAt(0).toUpperCase() + main.slice(1), rel: days === 0 ? t("list.today") : days === 1 ? t("list.tomorrow") : null };
}

function Signals({ f, isNew }: { f: RoundFixture; isNew: (f: RoundFixture, id: SignalId) => boolean }) {
  const on = SIGNALS.filter((s) => s.active(f));
  if (!on.length) return null;
  return (
    <span className="flex items-center gap-1.5">
      {on.map((s) => {
        const fresh = isNew(f, s.id);
        return (
          <span
            key={s.id}
            title={fresh ? `${t(s.label)} (${t("list.legend.new.suffix")})` : t(s.label)}
            role="img"
            aria-label={fresh ? t("list.newAria", { label: t(s.label) }) : t(s.label)}
            className={`relative inline-flex h-7 w-7 items-center justify-center rounded-lg ${
              fresh ? "bg-(--c-accent)/15 text-(--c-accent) ring-1 ring-(--c-accent)/40" : "bg-(--c-raised) text-(--c-muted)"
            }`}
          >
            {s.icon}
            {fresh && <span aria-hidden className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-(--c-surface) bg-(--c-warn)" />}
          </span>
        );
      })}
    </span>
  );
}

export function MatchRow({ f, home, away, isNew, onOpen }: { f: RoundFixture; home: RoundFixture["home"]; away: RoundFixture["away"]; isNew: (f: RoundFixture, id: SignalId) => boolean; onOpen: () => void }) {
  const ready = f.has_full_data !== false;
  const time = fmtTime(f.starting_at);
  const live = kickoffLabel(f.starting_at).live;
  const { can } = useAccess();
  const probs = can("mc.list.probs") ? f.signals?.probs : undefined;
  const body = (
    <div className="min-w-0 flex-1">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span aria-hidden />
        <div className="flex items-baseline justify-center gap-2">
          <span className="text-[17px] font-bold leading-none tabular-nums">{time}</span>
          {live && <span className="text-[11px] font-semibold uppercase text-(--c-loss)">{t("list.live")}</span>}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Signals f={f} isNew={isNew} />
          <span aria-hidden className="text-lg leading-none text-(--c-faint)">›</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-1 sm:gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <TeamLogo team={home} size={22} />
          <span className="truncate text-[14px] font-semibold sm:text-[15px]">{home.name}</span>
        </div>
        <span aria-hidden className="w-1 text-center text-xs text-(--c-faint) sm:w-auto">
          <span className="hidden sm:inline">vs</span>
        </span>
        <div className="flex min-w-0 items-center justify-end gap-2">
          <span className="truncate text-right text-[14px] font-semibold sm:text-[15px]">{away.name}</span>
          <TeamLogo team={away} size={22} />
        </div>
      </div>

      {probs && (
        <div className="mt-2.5" title={t("list.probTitle")}>
          <ProbBar home={probs[0]} draw={probs[1]} away={probs[2]} height={6} />
          <div className="relative mt-1 h-4 text-xs tabular-nums">
            <span className="absolute left-0" style={{ color: "var(--c-home)" }}>
              {probs[0]} %
            </span>
            {/* remíza stojí přesně pod šedým úsekem pruhu */}
            <span
              className="absolute -translate-x-1/2 text-(--c-faint)"
              style={{ left: `${Math.max(8, Math.min(92, ((probs[0] + probs[1] / 2) / (probs[0] + probs[1] + probs[2])) * 100))}%` }}
            >
              {probs[1]} %
            </span>
            <span className="absolute right-0" style={{ color: "var(--c-away)" }}>
              {probs[2]} %
            </span>
          </div>
        </div>
      )}
      {!ready && <div className="mt-2 text-[12px] text-(--c-muted)">Rozbor zápasu se připravuje.</div>}
    </div>
  );
  const cls = "flex rounded-2xl border border-(--c-line) bg-(--c-surface) px-3.5 py-3 sm:px-4";
  if (!ready) return <div className={`${cls} opacity-70`}>{body}</div>;
  return (
    <Link to={`/match/${f.fixture_id}`} onClick={onOpen} className={`${cls} transition-colors hover:border-(--c-accent) focus-visible:border-(--c-accent)`}>
      {body}
    </Link>
  );
}

const NEUTRAL = "#6b7280";
type Fav = "home" | "away" | "none";

/** Favorit modelu: strana s vyšší šancí na výhru, aspoň 45 %. Jinak vyrovnané. */
function favourite(p?: [number, number, number]): Fav {
  if (!p) return "none";
  const [h, , a] = p;
  if (h >= 45 && h >= a) return "home";
  if (a >= 45 && a > h) return "away";
  return "none";
}

function MatchLegend({ showProbs }: { showProbs: boolean }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl border border-(--c-line) bg-(--c-surface) px-4 py-2.5 text-[12px] text-(--c-muted)">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">{t("list.legend")}</span>
      {showProbs && (
        <>
          <span>
            <b className="text-(--c-text)">{t("list.prob.home")}</b> {t("list.legend.homeWord")}
          </span>
          <span>
            <b className="text-(--c-text)">{t("list.prob.draw")}</b> {t("list.legend.drawWord")}
          </span>
          <span>
            <b className="text-(--c-text)">{t("list.prob.away")}</b> {t("list.legend.awayWord")}
          </span>
          <span>{t("list.legend.fav")}</span>
        </>
      )}
      {SIGNALS.map((s) => (
        <span key={s.id} className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-(--c-raised) text-(--c-muted)">{s.icon}</span>
          {t(s.label)}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-(--c-warn)" />
        {t("list.legend.new")}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="flex h-4 w-4 justify-between rounded-sm border border-(--c-line)">
          <span className="w-[3px] bg-rose-500" />
          <span className="w-[3px] bg-sky-500" />
        </span>
        {t("list.legend.stripes")}
      </span>
    </div>
  );
}

/** Karta zápasu: pruhy po stranách v primárních barvách týmů (domácí vlevo, hosté vpravo), čas vycentrovaný v pásu. */
function MatchCard({
  f,
  colors,
  isNew,
  onOpen,
  league,
  withDate,
}: {
  f: RoundFixture;
  colors: Record<string, string>;
  isNew: (f: RoundFixture, id: SignalId) => boolean;
  onOpen: () => void;
  /** V pohledu „Všechny zápasy“: soutěž vlevo v horním pruhu. */
  league?: LeagueMeta;
  /** Řazení podle šance mísí dny, takže u času je i datum. */
  withDate?: boolean;
}) {
  const ready = f.has_full_data !== false;
  const clock = fmtTime(f.starting_at);
  const time = withDate ? `${fmtWeekdayDate(f.starting_at)} ${clock}` : clock;
  const live = kickoffLabel(f.starting_at).live;
  const { can } = useAccess();
  const played = f.home_score != null && f.away_score != null;
  const probs = !played && can("mc.list.probs") ? f.signals?.probs : undefined;
  const homeColor = colors[f.home.id] ?? NEUTRAL;
  const awayColor = colors[f.away.id] ?? NEUTRAL;
  const fav = favourite(probs);
  const nameCls = (side: "home" | "away") => {
    if (fav === side) return "w-full truncate text-[14px] font-bold";
    if (fav === "none") return "w-full truncate text-[14px] font-semibold";
    return "w-full truncate text-[14px] font-medium text-(--c-muted)";
  };
  const pctCls = (side: Fav) => `tabular-nums ${fav === side ? "font-bold" : ""}`;
  const cls = "group relative block overflow-hidden rounded-2xl border border-(--c-line) bg-(--c-surface) shadow-sm";
  const body = (
    <>
      <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 opacity-25" style={{ background: homeColor }} />
      <span aria-hidden className="absolute inset-y-0 right-0 w-0.5 opacity-25" style={{ background: awayColor }} />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-(--c-raised)/70 px-4 py-1.5">
        {league ? (
          <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-(--c-muted)">
            {league.logo && <img src={league.logo} alt="" className="h-4 w-4 shrink-0 object-contain" />}
            <span className="truncate">{league.name}</span>
          </span>
        ) : (
          <span aria-hidden />
        )}
        <div className="flex items-baseline justify-center gap-2">
          <span className="text-[13px] font-bold tabular-nums">{time}</span>
          {live && <span className="text-[11px] font-semibold uppercase text-(--c-loss)">{t("list.live")}</span>}
        </div>
        <div className="flex justify-end">
          <Signals f={f} isNew={isNew} />
        </div>
      </div>
      <div className="px-5 py-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
            <TeamLogo team={f.home} size={32} />
            <span className={nameCls("home")}>{f.home.name}</span>
          </div>
          <span aria-hidden className={`text-xs font-semibold ${played ? "text-(--c-text) text-lg font-bold tabular-nums" : "text-(--c-faint)"}`}>
            {played ? `${f.home_score}:${f.away_score}` : "vs"}
          </span>
          <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
            <TeamLogo team={f.away} size={32} />
            <span className={nameCls("away")}>{f.away.name}</span>
          </div>
        </div>
        {probs && (
          <div className="mt-3" title={t("list.probTitle")}>
            <ProbBar home={probs[0]} draw={probs[1]} away={probs[2]} height={6} />
            <div className="mt-1 grid grid-cols-3 text-xs">
              <span className={pctCls("home")} style={{ color: "var(--c-home)" }}>
                {t("fmt.pct", { n: probs[0] })}
              </span>
              <span className="text-center text-(--c-faint)">{t("fmt.pct", { n: probs[1] })}</span>
              <span className={`text-right ${pctCls("away")}`} style={{ color: "var(--c-away)" }}>
                {t("fmt.pct", { n: probs[2] })}
              </span>
            </div>
            <div className="mt-0.5 grid grid-cols-3 text-[11px] font-semibold uppercase tracking-wide text-(--c-faint)">
              <span>{t("list.prob.home")}</span>
              <span className="text-center">{t("list.prob.draw")}</span>
              <span className="text-right">{t("list.prob.away")}</span>
            </div>
          </div>
        )}
        {!ready && <div className="mt-2 text-center text-[12px] text-(--c-muted)">{t("list.preparing")}</div>}
      </div>
    </>
  );
  if (!ready) return <div className={`${cls} opacity-70`}>{body}</div>;
  return (
    <Link to={`/match/${f.fixture_id}`} onClick={onOpen} className={`${cls} transition-all hover:-translate-y-px hover:border-(--c-accent) hover:shadow-md focus-visible:border-(--c-accent)`}>
      {body}
    </Link>
  );
}

function asRound(f: McCalendarMatch): UpcomingFixture {
  return {
    fixture_id: f.fixture_id,
    starting_at: f.starting_at,
    venue: null,
    home: f.home,
    away: f.away,
    league_id: f.league_id,
    has_full_data: true,
    home_score: f.home_score,
    away_score: f.away_score,
  };
}

function ArchiveDay({
  day,
  fixtures,
  colors,
  leagues,
}: {
  day: string;
  fixtures: McCalendarMatch[];
  colors: Record<string, string>;
  leagues: LeagueMeta[];
}) {
  const byId = new Map(leagues.map((l) => [l.id, l]));
  const rows = fixtures.filter((f) => f.day === day);
  return (
    <section className="mt-6">
      <h2 className="mb-3 px-1 text-[15px] font-semibold">{archiveTitle(day)}</h2>
      {rows.length === 0 ? (
        <Empty>{t("list.cal.empty")}</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((f) => (
            <MatchCard key={f.fixture_id} f={asRound(f)} colors={colors} isNew={() => false} onOpen={() => undefined} league={byId.get(f.league_id)} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------- stránka ---------- */

export function MatchListPage({ leagueId, base }: { leagueId: number; base: string }) {
  const { index, error: indexError } = useDataIndex();
  const { data, error } = useLeagueRound(leagueId);
  const { data: cal } = useMcCalendar();
  const [day, setDay] = useArchiveDay();
  const live = isLiveLeague(index?.leagues, leagueId);
  const fixtures = live ? data?.round : undefined;
  const { isNew, markSeen } = useSeen(fixtures);
  const colors = useTeamColors();
  const { can } = useAccess();
  const showProbs = can("mc.list.probs");

  useEffect(() => {
    document.title = t("list.title");
    if (live) rememberLeague(leagueId);
  }, [leagueId, live]);

  const groups = useMemo(() => {
    const map = new Map<string, RoundFixture[]>();
    for (const f of fixtures ?? []) {
      const k = dayKey(f.starting_at);
      map.set(k, [...(map.get(k) ?? []), f]);
    }
    return [...map.values()];
  }, [fixtures]);

  const league = index?.leagues.find((l) => l.id === leagueId) ?? data?.league;
  const enabled = orderedLeagues((index?.leagues ?? []).filter((l) => l.enabled));
  const stale = live && data && index ? isStale(data.generated_at, index.stale_after_hours) : false;

  return (
    <div className="mc2 mx-auto max-w-4xl px-4 pb-16 pt-20">
      <header className="pt-4">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("list.title")}</h1>
        <p className="mt-1.5 text-[15px] text-(--c-muted)">
          {t("list.lead", { n: index?.window_days ?? 7 })}
        </p>
      </header>

      <div className="mt-5">
        {index && <LeaguePicker leagues={enabled} activeId={leagueId} base={base} />}
      </div>
      {cal && (
        <div className="mt-5">
          <MatchCalendar fixtures={cal.fixtures} selected={day} onSelect={setDay} />
        </div>
      )}

      {day ? (
        <ArchiveDay day={day} fixtures={cal?.fixtures ?? []} colors={colors} leagues={enabled} />
      ) : (
      <>
      {(indexError || (error && live)) && (
        <p className="mt-6 rounded-2xl border border-(--c-line) bg-(--c-surface) p-6 text-center text-(--c-loss)">{t("list.error")}</p>
      )}

      {stale && data && (
        <div className="mt-4 rounded-xl border border-(--c-warn)/40 bg-(--c-warn)/10 px-3 py-2 text-[13px] text-(--c-warn)">
          {t("list.stale", { when: fmtStamp(data.generated_at) })}
        </div>
      )}

      {index && !live ? (
        <section className="mt-8 rounded-2xl border border-dashed border-(--c-line) px-6 py-12 text-center">
          {league && (
            <div className="mb-4 flex justify-center">
              <img src={league.logo ?? ""} alt="" className="h-14 w-14 object-contain opacity-35 grayscale" />
            </div>
          )}
          <h2 className="text-lg font-semibold">{t("list.soonTitle", { league: league?.name ?? "—" })}</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-(--c-muted)">{t("list.soonText")}</p>
          <Link to={`${base}/262`} className="mt-5 inline-flex min-h-10 items-center rounded-xl bg-(--c-accent)/15 px-4 text-sm font-semibold text-(--c-accent) ring-1 ring-(--c-accent)/40">
            {t("list.soonCta")}
          </Link>
        </section>
      ) : (
        <>
          {!data && !error && <p className="mt-8 text-center text-(--c-muted)">{t("list.loading")}</p>}

          {data && groups.length === 0 && (
            <div className="mt-6">
              <Empty>{t("list.empty", { n: index?.window_days ?? 7, league: data.league.name })}</Empty>
            </div>
          )}

          {groups.length > 0 && (
            <div className="mt-6">
              <MatchLegend showProbs={showProbs} />
            </div>
          )}

          <div className="mt-6 space-y-6">
            {groups.map((g) => {
              const d = dayLabel(g[0].starting_at);
              return (
                <section key={g[0].starting_at} aria-label={d.main}>
                  <h2 className="mb-2 flex items-baseline gap-2 px-1 text-[13px] font-semibold">
                    <span>{d.main}</span>
                    {d.rel && <span className="rounded-md bg-(--c-accent)/15 px-1.5 py-0.5 text-xs font-semibold text-(--c-accent)">{d.rel}</span>}
                    <span className="font-normal text-(--c-faint)">
                      {t("list.count", { n: g.length })}
                    </span>
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {g.map((f) => (
                      <MatchCard key={f.fixture_id} f={f} colors={colors} isNew={isNew} onOpen={() => markSeen(f)} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

        </>
      )}

      {data && live && (
        <footer className="pt-10 text-center text-xs text-(--c-faint)">
          {t("list.updated", { when: formatDateTime(data.generated_at) })}
        </footer>
      )}
      </>
      )}
    </div>
  );
}

/* ---------- všechny zápasy napříč ligami ---------- */

type SortMode = "time" | "prob";

/** Síla favorita: vyšší z šancí na výhru domácích a hostů. Bez predikce -1 (na konec). */
const favouriteStrength = (f: RoundFixture) => (f.signals?.probs ? Math.max(f.signals.probs[0], f.signals.probs[2]) : -1);

/** Zápas se ještě hraje nebo začne později (tři hodiny po výkopu ještě počítáme jako aktuální). */
const LIVE_WINDOW_MS = 3 * 3600e3;

function sortFixtures<T extends RoundFixture>(list: T[], mode: SortMode): T[] {
  const byTime = (a: T, b: T) => a.starting_at.localeCompare(b.starting_at) || a.fixture_id - b.fixture_id;
  return [...list].sort(mode === "prob" ? (a, b) => favouriteStrength(b) - favouriteStrength(a) || byTime(a, b) : byTime);
}

export function AllMatchesPage({ base }: { base: string }) {
  const { index, error: indexError } = useDataIndex();
  const { data, error } = useUpcoming();
  const { data: cal } = useMcCalendar();
  const [day, setDay] = useArchiveDay();
  const [sp, setSp] = useSearchParams();
  const colors = useTeamColors();
  const { can } = useAccess();
  const showProbs = can("mc.list.probs");
  const showSort = can("mc.list.sort");
  const mode: SortMode = showSort && sp.get("sort") === "prob" ? "prob" : "time";
  const enabled = orderedLeagues((index?.leagues ?? []).filter((l) => l.enabled));
  const leagueById = useMemo(() => new Map((index?.leagues ?? []).map((l) => [l.id, l])), [index]);

  const upcoming = useMemo(() => {
    const from = Date.now() - LIVE_WINDOW_MS;
    return (data?.fixtures ?? []).filter((f) => new Date(f.starting_at).getTime() >= from);
  }, [data]);
  const { isNew, markSeen } = useSeen(upcoming);

  useEffect(() => {
    document.title = `${t("list.all")} | ${t("list.title")}`;
  }, []);

  const sorted = useMemo(() => sortFixtures<UpcomingFixture>(upcoming, mode), [upcoming, mode]);
  const groups = useMemo(() => {
    const map = new Map<string, UpcomingFixture[]>();
    for (const f of sorted) {
      const k = dayKey(f.starting_at);
      map.set(k, [...(map.get(k) ?? []), f]);
    }
    return [...map.values()];
  }, [sorted]);

  const stale = data && index ? isStale(data.generated_at, index.stale_after_hours) : false;
  const days = index?.window_days ?? 7;
  const card = (f: UpcomingFixture, withDate: boolean) => (
    <MatchCard key={f.fixture_id} f={f} colors={colors} isNew={isNew} onOpen={() => markSeen(f)} league={leagueById.get(f.league_id)} withDate={withDate} />
  );

  return (
    <div className="mc2 mx-auto max-w-4xl px-4 pb-16 pt-20">
      <header className="pt-4">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("list.title")}</h1>
        <p className="mt-1.5 text-[15px] text-(--c-muted)">{t("list.allLead", { n: days })}</p>
      </header>

      <div className="mt-5">{index && <LeaguePicker leagues={enabled} activeId="all" base={base} />}</div>
      {cal && (
        <div className="mt-5">
          <MatchCalendar fixtures={cal.fixtures} selected={day} onSelect={setDay} />
        </div>
      )}

      {day ? (
        <ArchiveDay day={day} fixtures={cal?.fixtures ?? []} colors={colors} leagues={enabled} />
      ) : (
      <>
      {showSort && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">{t("list.sort.label")}</span>
            <Seg<SortMode>
              label={t("list.sort.label")}
              value={mode}
              onChange={(v) =>
                setSp(
                  (prev) => {
                    const next = new URLSearchParams(prev);
                    if (v === "time") next.delete("sort");
                    else next.set("sort", v);
                    return next;
                  },
                  { replace: true },
                )
              }
              options={[
                { id: "time", label: t("list.sort.time") },
                { id: "prob", label: t("list.sort.prob") },
              ]}
            />
          </div>
          {mode === "prob" && <p className="mt-2 text-[12px] text-(--c-muted)">{t("list.sort.probNote")}</p>}
        </>
      )}

      {(indexError || error) && (
        <p className="mt-6 rounded-2xl border border-(--c-line) bg-(--c-surface) p-6 text-center text-(--c-loss)">{t("list.error")}</p>
      )}

      {stale && data && (
        <div className="mt-4 rounded-xl border border-(--c-warn)/40 bg-(--c-warn)/10 px-3 py-2 text-[13px] text-(--c-warn)">
          {t("list.stale", { when: fmtStamp(data.generated_at) })}
        </div>
      )}

      {!data && !error && <p className="mt-8 text-center text-(--c-muted)">{t("list.loading")}</p>}
      {data && sorted.length === 0 && (
        <div className="mt-6">
          <Empty>{t("list.allEmpty", { n: days })}</Empty>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="mt-6">
          <MatchLegend showProbs={showProbs} />
        </div>
      )}

      {mode === "prob" ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">{sorted.map((f) => card(f, true))}</div>
      ) : (
        <div className="mt-6 space-y-6">
          {groups.map((g) => {
            const d = dayLabel(g[0].starting_at);
            return (
              <section key={g[0].starting_at} aria-label={d.main}>
                <h2 className="mb-2 flex items-baseline gap-2 px-1 text-[13px] font-semibold">
                  <span>{d.main}</span>
                  {d.rel && <span className="rounded-md bg-(--c-accent)/15 px-1.5 py-0.5 text-xs font-semibold text-(--c-accent)">{d.rel}</span>}
                  <span className="font-normal text-(--c-faint)">{t("list.count", { n: g.length })}</span>
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">{g.map((f) => card(f, false))}</div>
              </section>
            );
          })}
        </div>
      )}

      {data && (
        <footer className="pt-10 text-center text-xs text-(--c-faint)">{t("list.updated", { when: formatDateTime(data.generated_at) })}</footer>
      )}
      </>
      )}
    </div>
  );
}
