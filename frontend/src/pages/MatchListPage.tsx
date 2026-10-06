import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { formatDateTime } from "../lib/format";
import { hasPitchData } from "../lib/pitchMatch";
import { LeaguePicker } from "../components/LeaguePicker";
import { isStale, useDataIndex, useLeagueRound, useTeamColors } from "../lib/useData";
import { rememberLeague } from "../components/LeagueSwitcher";
import { kickoffLabel } from "../mc2/derive";
import { Empty, ProbBar, TeamLogo, plural } from "../mc2/kit";
import type { RoundFixture } from "../types";

/* ---------- ikonky u zápasů ---------- */

type SignalId = "referee";

type SignalDef = { id: SignalId; label: string; icon: ReactNode; active: (f: RoundFixture) => boolean };

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
  { id: "referee", label: "Rozhodčí je delegovaný", icon: <Whistle />, active: (f) => !!f.signals?.referee },
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
  const main = d.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "numeric" });
  return { main: main.charAt(0).toUpperCase() + main.slice(1), rel: days === 0 ? "dnes" : days === 1 ? "zítra" : null };
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
            title={fresh ? `${s.label} (nové)` : s.label}
            role="img"
            aria-label={fresh ? `${s.label}, nové od vaší poslední návštěvy` : s.label}
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
  const time = new Date(f.starting_at).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  const live = kickoffLabel(f.starting_at).live;
  const probs = f.signals?.probs;
  const body = (
    <div className="min-w-0 flex-1">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span aria-hidden />
        <div className="flex items-baseline justify-center gap-2">
          <span className="text-[17px] font-bold leading-none tabular-nums">{time}</span>
          {live && <span className="text-[10px] font-semibold uppercase text-(--c-loss)">živě</span>}
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
        <span aria-hidden className="w-1 text-center text-[11px] text-(--c-faint) sm:w-auto">
          <span className="hidden sm:inline">vs</span>
        </span>
        <div className="flex min-w-0 items-center justify-end gap-2">
          <span className="truncate text-right text-[14px] font-semibold sm:text-[15px]">{away.name}</span>
          <TeamLogo team={away} size={22} />
        </div>
      </div>

      {probs && (
        <div className="mt-2.5" title="Pravděpodobnost výhry domácích, remízy a výhry hostů podle modelu">
          <ProbBar home={probs[0]} draw={probs[1]} away={probs[2]} height={6} />
          <div className="relative mt-1 h-4 text-[11px] tabular-nums">
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

/** Karta zápasu: pruhy po stranách v primárních barvách týmů (domácí vlevo, hosté vpravo), čas vycentrovaný v pásu. */
function MatchCard({ f, colors, isNew, onOpen }: { f: RoundFixture; colors: Record<string, string>; isNew: (f: RoundFixture, id: SignalId) => boolean; onOpen: () => void }) {
  const ready = f.has_full_data !== false;
  const time = new Date(f.starting_at).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  const live = kickoffLabel(f.starting_at).live;
  const probs = f.signals?.probs;
  const homeColor = colors[f.home.id] ?? NEUTRAL;
  const awayColor = colors[f.away.id] ?? NEUTRAL;
  const cls = "group relative block overflow-hidden rounded-2xl border border-(--c-line) bg-(--c-surface) shadow-sm";
  const body = (
    <>
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: homeColor }} />
      <span aria-hidden className="absolute inset-y-0 right-0 w-1.5" style={{ background: awayColor }} />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center bg-(--c-raised)/70 px-4 py-1.5">
        <span aria-hidden />
        <div className="flex items-baseline justify-center gap-2">
          <span className="text-[13px] font-bold tabular-nums">{time}</span>
          {live && <span className="text-[10px] font-semibold uppercase text-(--c-loss)">živě</span>}
        </div>
        <div className="flex justify-end">
          <Signals f={f} isNew={isNew} />
        </div>
      </div>
      <div className="px-5 py-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
            <TeamLogo team={f.home} size={32} />
            <span className="w-full truncate text-[14px] font-semibold">{f.home.name}</span>
          </div>
          <span aria-hidden className="text-[11px] font-semibold text-(--c-faint)">
            vs
          </span>
          <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
            <TeamLogo team={f.away} size={32} />
            <span className="w-full truncate text-[14px] font-semibold">{f.away.name}</span>
          </div>
        </div>
        {probs && (
          <div className="mt-3" title="Pravděpodobnost výhry domácích, remízy a výhry hostů podle modelu">
            <ProbBar home={probs[0]} draw={probs[1]} away={probs[2]} height={6} />
            <div className="mt-1 grid grid-cols-3 text-[11px] tabular-nums">
              <span style={{ color: "var(--c-home)" }}>{probs[0]} %</span>
              <span className="text-center text-(--c-faint)">{probs[1]} %</span>
              <span className="text-right" style={{ color: "var(--c-away)" }}>
                {probs[2]} %
              </span>
            </div>
          </div>
        )}
        {!ready && <div className="mt-2 text-center text-[12px] text-(--c-muted)">Rozbor zápasu se připravuje.</div>}
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

/* ---------- stránka ---------- */

export function MatchListPage({ leagueId, base }: { leagueId: number; base: string }) {
  const { index, error: indexError } = useDataIndex();
  const { data, error } = useLeagueRound(leagueId);
  const live = hasPitchData(leagueId);
  const fixtures = live ? data?.round : undefined;
  const { isNew, markSeen } = useSeen(fixtures);
  const colors = useTeamColors();

  useEffect(() => {
    document.title = "Match Center";
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
  const enabled = (index?.leagues ?? []).filter((l) => l.enabled);
  const stale = live && data && index ? isStale(data.generated_at, index.stale_after_hours) : false;

  return (
    <div className="mc2 mx-auto max-w-4xl px-4 pb-16 pt-20">
      <header className="pt-4">
        <h1 className="text-2xl font-bold sm:text-3xl">Match Center</h1>
        <p className="mt-1.5 text-[15px] text-(--c-muted)">
          Zápasy na nejbližších {index?.window_days ?? 7} dní. Klepnutím na zápas otevřete rozbor.
        </p>
      </header>

      <div className="mt-5">
        {index && <LeaguePicker leagues={enabled} activeId={leagueId} base={base} />}
      </div>

      {(indexError || (error && live)) && (
        <p className="mt-6 rounded-2xl border border-(--c-line) bg-(--c-surface) p-6 text-center text-(--c-loss)">Data se nepodařilo načíst. Zkuste to prosím za chvíli.</p>
      )}

      {stale && data && (
        <div className="mt-4 rounded-xl border border-(--c-warn)/40 bg-(--c-warn)/10 px-3 py-2 text-[13px] text-(--c-warn)">
          Data jsou starší než denní interval (poslední kontrola {new Date(data.generated_at).toLocaleString("cs-CZ")}).
        </div>
      )}

      {index && !live ? (
        <section className="mt-8 rounded-2xl border border-dashed border-(--c-line) px-6 py-12 text-center">
          {league && (
            <div className="mb-4 flex justify-center">
              <img src={league.logo ?? ""} alt="" className="h-14 w-14 object-contain opacity-35 grayscale" />
            </div>
          )}
          <h2 className="text-lg font-semibold">{league?.name ?? "Tahle soutěž"}: připravujeme</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-(--c-muted)">Match Center pro tuhle soutěž právě stavíme. Zatím můžete sledovat Chance Ligu.</p>
          <Link to={`${base}/262`} className="mt-5 inline-flex min-h-10 items-center rounded-xl bg-(--c-accent)/15 px-4 text-sm font-semibold text-(--c-accent) ring-1 ring-(--c-accent)/40">
            Otevřít Chance Ligu
          </Link>
        </section>
      ) : (
        <>
          {!data && !error && <p className="mt-8 text-center text-(--c-muted)">Načítám zápasy…</p>}

          {data && groups.length === 0 && (
            <div className="mt-6">
              <Empty>V následujících {index?.window_days ?? 7} dnech v {data.league.name} nic nehraje.</Empty>
            </div>
          )}

          <div className="mt-6 space-y-6">
            {groups.map((g) => {
              const d = dayLabel(g[0].starting_at);
              return (
                <section key={g[0].starting_at} aria-label={d.main}>
                  <h2 className="mb-2 flex items-baseline gap-2 px-1 text-[13px] font-semibold">
                    <span>{d.main}</span>
                    {d.rel && <span className="rounded-md bg-(--c-accent)/15 px-1.5 py-0.5 text-[11px] font-semibold text-(--c-accent)">{d.rel}</span>}
                    <span className="font-normal text-(--c-faint)">
                      {g.length} {plural(g.length, "zápas", "zápasy", "zápasů")}
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

          {groups.length > 0 && (
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-(--c-line) bg-(--c-surface) px-4 py-3 text-[12px] text-(--c-muted)">
              <span className="font-semibold uppercase tracking-[0.14em] text-(--c-faint) text-[11px]">Vysvětlivky</span>
              {SIGNALS.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1.5">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-(--c-raised) text-(--c-muted)">{s.icon}</span>
                  {s.label}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-(--c-warn)" />
                nové od vaší poslední návštěvy
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="flex h-4 w-4 justify-between rounded-sm border border-(--c-line)">
                  <span className="w-[3px] bg-rose-500" />
                  <span className="w-[3px] bg-sky-500" />
                </span>
                pruhy po stranách = barvy týmů (domácí vlevo)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="flex h-1.5 w-10 gap-px overflow-hidden rounded-full">
                  <span className="w-1/2" style={{ background: "var(--c-home)" }} />
                  <span className="w-1/4 opacity-60" style={{ background: "var(--c-draw)" }} />
                  <span className="w-1/4" style={{ background: "var(--c-away)" }} />
                </span>
                šance na výhru domácích, remíza, hosté
              </span>
            </div>
          )}
        </>
      )}

      {data && live && (
        <footer className="pt-10 text-center text-xs text-(--c-faint)">
          Aktualizováno {formatDateTime(data.generated_at)}. Data se obnovují jednou denně.
        </footer>
      )}
    </div>
  );
}
