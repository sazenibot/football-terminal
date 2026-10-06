import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Avatar, Crest, Field, Frame, Pill } from "../cat/kit";
import {
  useCatalogDirectory,
  useCatalogHub,
  useCatalogSearchIndex,
  type CatalogDirectoryLeague,
  type CatalogSearchIndex,
} from "../lib/useData";
import { Chip, Empty, Seg, plural } from "../mc2/kit";
import type { CatalogHub, CatalogPlayerCard, CatalogRefereeCard, CatalogTeamCard } from "../types";

type Tab = "teams" | "players" | "referees";
const LAST_LEAGUE_KEY = "ft-catalog-league";
const PAGE = 60;

/* ---------- hledání ---------- */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Všechna slova z dotazu musí být v textu (v libovolném pořadí, bez diakritiky). */
function matcher(q: string): (hay: string) => boolean {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return () => true;
  return (hay) => {
    const h = norm(hay);
    return words.every((w) => h.includes(w));
  };
}

/** Přednost má shoda na začátku jména. */
function score(name: string, q: string): number {
  const n = norm(name);
  const w = norm(q).split(/\s+/)[0] ?? "";
  if (n.startsWith(w)) return 0;
  if (n.split(/[\s.-]+/).some((p) => p.startsWith(w))) return 1;
  return 2;
}

/* ---------- stránka ---------- */

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const dir = useCatalogDirectory();
  const leagues = dir?.leagues ?? [];

  const leagueParam = Number(params.get("league")) || null;
  const league = leagueParam && leagues.some((l) => l.id === leagueParam) ? leagueParam : null;
  const tab: Tab = params.get("tab") === "players" || params.get("tab") === "referees" ? (params.get("tab") as Tab) : "teams";
  const q = params.get("q") ?? "";
  const [input, setInput] = useState(q);
  const inputRef = useRef<HTMLInputElement>(null);

  const update = (next: { league?: number | null; tab?: Tab; q?: string }) => {
    const out = new URLSearchParams();
    const l = next.league === undefined ? league : next.league;
    const t = next.tab ?? tab;
    const query = next.q ?? input;
    if (l) out.set("league", String(l));
    if (l && t !== "teams") out.set("tab", t);
    if (query) out.set("q", query);
    setParams(out, { replace: true });
  };

  // Vyhledávací text drží vstup lokálně (plynulé psaní) a do adresy se propisuje se zpožděním.
  useEffect(() => {
    const t = setTimeout(() => {
      if (input !== q) update({ q: input });
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);
  useEffect(() => {
    document.title = "Datový katalog · Football Terminal";
  }, []);

  const pick = (id: number | null) => {
    if (id) {
      try {
        localStorage.setItem(LAST_LEAGUE_KEY, String(id));
      } catch {
        /* ignore */
      }
    }
    update({ league: id, tab: "teams" });
  };

  const current = leagues.find((l) => l.id === league) ?? null;
  const global = !league && norm(input).trim().length >= 2;
  const [warm, setWarm] = useState(false); // index stahujeme až při prvním zaostření do hledání
  const index = useCatalogSearchIndex(warm || global);

  return (
    <Frame wide>
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-(--c-accent)">Katalog</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Datový katalog</h1>
        <p className="mt-1.5 max-w-2xl text-[14px] leading-snug text-(--c-muted)">
          Týmy, hráči a hlavní rozhodčí s čísly, která jinde v jednom místě nenajdete. Začněte ligou, nebo rovnou hledejte
          jméno.
        </p>
      </header>

      <SearchBox
        value={input}
        onChange={setInput}
        inputRef={inputRef}
        onFocus={() => setWarm(true)}
        placeholder={current ? `Hledat v lize ${current.name}…` : "Hledat tým, hráče, rozhodčího…"}
        onEnter={() => {
          const first = document.querySelector<HTMLAnchorElement>("[data-first-result]");
          if (first) navigate(first.getAttribute("href") || "/catalog");
        }}
        onClear={() => {
          setInput("");
          update({ q: "" });
          inputRef.current?.focus();
        }}
      />

      {global ? (
        <GlobalResults q={input} index={index} leagues={leagues} onLeague={(id) => update({ league: id, q: input })} />
      ) : league && current ? (
        <LeagueView league={current} leagues={leagues} tab={tab} q={input} onTab={(t) => update({ tab: t })} onLeague={pick} onAll={() => update({ league: null })} />
      ) : (
        <LeagueGrid leagues={leagues} loaded={!!dir} onPick={pick} hint={norm(input).trim().length === 1 ? "Napište alespoň dva znaky." : null} />
      )}
    </Frame>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
  onEnter,
  onClear,
  onFocus,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onEnter: () => void;
  onClear: () => void;
  onFocus: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="relative mt-5">
      <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-(--c-faint)" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="9" cy="9" r="5.5" />
        <path d="m13.5 13.5 3.5 3.5" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={(e) => e.key === "Enter" && onEnter()}
        placeholder={placeholder}
        aria-label="Hledat v katalogu"
        autoComplete="off"
        className="min-h-12 w-full rounded-2xl border border-(--c-line) bg-(--c-surface) pl-10 pr-10 text-[15px] text-(--c-text) placeholder:text-(--c-faint) focus:border-(--c-accent) focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Smazat hledání"
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-(--c-muted) hover:bg-(--c-raised) hover:text-(--c-text)"
        >
          ×
        </button>
      )}
    </div>
  );
}

/* ---------- 1) výběr ligy ---------- */

function LeagueGrid({
  leagues,
  loaded,
  onPick,
  hint,
}: {
  leagues: CatalogDirectoryLeague[];
  loaded: boolean;
  onPick: (id: number) => void;
  hint: string | null;
}) {
  return (
    <section className="mt-6" aria-label="Výběr ligy">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">Vyberte ligu</h2>
        {hint && <span className="text-xs text-(--c-muted)">{hint}</span>}
      </div>
      {!loaded ? (
        <p className="text-sm text-(--c-muted)">Načítám ligy…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {leagues
            .slice()
            .sort((a, b) => Number(b.full) - Number(a.full))
            .map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => onPick(l.id)}
                className="group flex min-h-[10rem] flex-col rounded-2xl border border-(--c-line) bg-(--c-surface) p-4 text-left transition-colors hover:border-(--c-accent)/60 focus-visible:border-(--c-accent)"
              >
                <div className="flex items-start gap-3">
                  <Crest src={l.logo} name={l.name} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[16px] font-bold leading-tight">{l.name}</div>
                    <div className="mt-0.5 truncate text-xs text-(--c-muted)">
                      {l.country}
                      {l.season ? ` · ${l.season}` : ""}
                    </div>
                  </div>
                  <span aria-hidden className="text-lg leading-none text-(--c-faint) transition-transform group-hover:translate-x-0.5 group-hover:text-(--c-accent)">
                    ›
                  </span>
                </div>
                <div className="mt-3">
                  <Pill tone={l.full ? "var(--c-accent)" : "var(--c-faint)"}>{l.full ? "Plný katalog" : "Základní profily"}</Pill>
                </div>
                <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-(--c-line) pt-3 text-center">
                  {(
                    [
                      [l.teams, "týmů"],
                      [l.players, "hráčů"],
                      [l.referees, "rozhodčích"],
                    ] as const
                  ).map(([n, label]) => (
                    <div key={label}>
                      <dt className="text-[10px] uppercase tracking-wider text-(--c-faint)">{label}</dt>
                      <dd className="text-[17px] font-bold leading-tight tabular-nums">{n}</dd>
                    </div>
                  ))}
                </dl>
              </button>
            ))}
        </div>
      )}
    </section>
  );
}

/* ---------- 2) fulltext přes všechny ligy ---------- */

type Hit =
  | { kind: "team"; id: number; name: string; lid: number; image: string | null; sub: string }
  | { kind: "player"; id: number; name: string; lid: number; sub: string; image: string | null }
  | { kind: "referee"; id: number; name: string; lid: number; sub: string };

function GlobalResults({
  q,
  index,
  leagues,
  onLeague,
}: {
  q: string;
  index: CatalogSearchIndex | null;
  leagues: CatalogDirectoryLeague[];
  onLeague: (id: number) => void;
}) {
  const [onlyLeague, setOnlyLeague] = useState<number | null>(null);
  const leagueName = (id: number) => index?.leagues.find((l) => l.id === id)?.name ?? leagues.find((l) => l.id === id)?.name ?? "";

  const { teams, players, referees } = useMemo(() => {
    if (!index) return { teams: [] as Hit[], players: [] as Hit[], referees: [] as Hit[] };
    const m = matcher(q);
    const cdn = index.cdn;
    const full = (s: string | null) => (s ? (s.startsWith("http") ? s : cdn + s) : null);
    const fullLeague = new Set(leagues.filter((l) => l.full).map((l) => l.id));
    // shoda na začátku jména, pak ligy s plným katalogem, pak abecedně
    const byScore = (a: Hit, b: Hit) =>
      score(a.name, q) - score(b.name, q) || Number(!fullLeague.has(a.lid)) - Number(!fullLeague.has(b.lid)) || a.name.localeCompare(b.name, "cs");
    const teams: Hit[] = index.teams
      .filter((t) => m(t[1]))
      .map((t) => ({ kind: "team" as const, id: t[0], name: t[1], lid: t[2], image: full(t[3]), sub: "" }))
      .sort(byScore);
    const players: Hit[] = index.players
      .filter((p) => m(`${p[1]} ${p[4] ?? ""}`))
      .map((p) => ({
        kind: "player" as const,
        id: p[0],
        name: p[1],
        lid: p[2],
        image: full(p[7]),
        sub: [p[4], p[5], p[6] != null ? `#${p[6]}` : null].filter(Boolean).join(" · "),
      }))
      .sort(byScore);
    const referees: Hit[] = index.referees
      .filter((r) => m(r[1]))
      .map((r) => ({
        kind: "referee" as const,
        id: r[0],
        name: r[1],
        lid: r[2],
        sub: [r[3], r[4] != null ? `${r[4]} ${plural(r[4], "zápas", "zápasy", "zápasů")} letos` : null].filter(Boolean).join(" · "),
      }))
      .sort(byScore);
    return { teams, players, referees };
  }, [index, q, leagues]);

  const all = [...teams, ...players, ...referees];
  const perLeague = useMemo(() => {
    const map = new Map<number, number>();
    for (const h of all) map.set(h.lid, (map.get(h.lid) ?? 0) + 1);
    return map;
  }, [all]);
  const keep = (h: Hit) => !onlyLeague || h.lid === onlyLeague;
  const fT = teams.filter(keep);
  const fP = players.filter(keep);
  const fR = referees.filter(keep);
  const total = fT.length + fP.length + fR.length;

  if (!index) return <p className="mt-6 text-sm text-(--c-muted)">Hledám…</p>;

  let firstDone = false;
  const link = (h: Hit) => {
    const to = h.kind === "team" ? `/catalog/teams/${h.id}` : h.kind === "player" ? `/catalog/players/${h.id}` : `/catalog/referees/${h.id}?league=${h.lid}`;
    const first = !firstDone;
    firstDone = true;
    return (
      <Link
        key={`${h.kind}-${h.id}`}
        to={to}
        {...(first ? { "data-first-result": true } : {})}
        className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-(--c-raised) focus-visible:bg-(--c-raised)"
      >
        {h.kind === "team" ? <Crest src={h.image} name={h.name} size={32} /> : <Avatar src={h.kind === "player" ? h.image : null} name={h.name} size={32} />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold">{h.name}</div>
          {h.sub && <div className="truncate text-xs text-(--c-muted)">{h.sub}</div>}
        </div>
        <span className="hidden shrink-0 text-[11px] text-(--c-faint) sm:block">{leagueName(h.lid)}</span>
        <span aria-hidden className="text-lg leading-none text-(--c-faint)">›</span>
      </Link>
    );
  };

  const group = (title: string, rows: Hit[], limit: number) =>
    rows.length > 0 && (
      <section>
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">
          {title} <span className="ml-1 tabular-nums">{rows.length}</span>
        </h2>
        <div className="divide-y divide-(--c-line) overflow-hidden rounded-2xl border border-(--c-line) bg-(--c-surface)">
          {rows.slice(0, limit).map(link)}
        </div>
        {rows.length > limit && (
          <p className="mt-1.5 text-xs text-(--c-muted)">
            A dalších {rows.length - limit}. Zpřesněte hledání, nebo vyberte ligu.
          </p>
        )}
      </section>
    );

  return (
    <section className="mt-5 space-y-5" aria-live="polite">
      {perLeague.size > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={!onlyLeague} onClick={() => setOnlyLeague(null)}>
            Všechny ligy · {all.length}
          </Chip>
          {[...perLeague.entries()].map(([id, n]) => (
            <Chip key={id} active={onlyLeague === id} onClick={() => setOnlyLeague(onlyLeague === id ? null : id)}>
              {leagueName(id)} · {n}
            </Chip>
          ))}
        </div>
      )}
      {total === 0 ? (
        <Empty>Nic jsme nenašli. Zkuste jen příjmení, nebo vyberte ligu.</Empty>
      ) : (
        <>
          {group("Týmy", fT, 8)}
          {group("Hráči", fP, 12)}
          {group("Rozhodčí", fR, 8)}
          {onlyLeague && (
            <button type="button" onClick={() => onLeague(onlyLeague)} className="min-h-9 text-[13px] font-medium text-(--c-accent) hover:underline">
              Procházet celou ligu {leagueName(onlyLeague)} →
            </button>
          )}
        </>
      )}
    </section>
  );
}

/* ---------- 3) uvnitř ligy ---------- */

const POS: { id: string; label: string; test: (p: string) => boolean }[] = [
  { id: "all", label: "Všichni", test: () => true },
  { id: "gk", label: "Brankáři", test: (p) => p.includes("brank") },
  { id: "def", label: "Obránci", test: (p) => p.includes("obr") },
  { id: "mid", label: "Záložníci", test: (p) => p.includes("zálož") || p.includes("zaloz") },
  { id: "att", label: "Útočníci", test: (p) => p.includes("útoč") || p.includes("utoc") },
];

function LeagueView({
  league,
  leagues,
  tab,
  q,
  onTab,
  onLeague,
  onAll,
}: {
  league: CatalogDirectoryLeague;
  leagues: CatalogDirectoryLeague[];
  tab: Tab;
  q: string;
  onTab: (t: Tab) => void;
  onLeague: (id: number) => void;
  onAll: () => void;
}) {
  const { data, error, missing } = useCatalogHub(league.id);
  const m = useMemo(() => matcher(q), [q]);

  const teams = useMemo(() => (data?.teams ?? []).filter((t) => m(`${t.name} ${t.short ?? ""}`)).sort((a, b) => a.name.localeCompare(b.name, "cs")), [data, m]);
  const players = useMemo(() => (data?.players ?? []).filter((p) => m(`${p.name} ${p.team_name} ${p.position ?? ""} ${p.number ?? ""}`)), [data, m]);
  const referees = useMemo(
    () =>
      (data?.referees ?? [])
        .filter((r) => (typeof r.season_matches === "number" ? r.season_matches > 0 : r.in_league))
        .filter((r) => m(`${r.name} ${r.country ?? ""}`))
        .sort((a, b) => (b.season_matches ?? b.league_matches ?? 0) - (a.season_matches ?? a.league_matches ?? 0) || a.name.localeCompare(b.name, "cs")),
    [data, m],
  );

  const counts = data
    ? { teams: teams.length, players: players.length, referees: referees.length }
    : { teams: league.teams, players: league.players, referees: league.referees };

  return (
    <section className="mt-5" aria-label={`Liga ${league.name}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-(--c-line) bg-(--c-surface) p-4">
        <Crest src={league.logo} name={league.name} size={48} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold leading-tight">{league.name}</h2>
          <p className="mt-0.5 text-xs text-(--c-muted)">
            {league.country}
            {league.season ? ` · ${league.season}` : ""}
          </p>
          <div className="mt-2">
            <Pill tone={league.full ? "var(--c-accent)" : "var(--c-faint)"}>{league.full ? "Plný katalog" : "Základní profily"}</Pill>
          </div>
        </div>
        <div className="flex w-full items-end gap-2 sm:w-auto">
          <div className="min-w-0 flex-1 sm:w-56">
            <Field label="Liga">
              <select
                value={league.id}
                onChange={(e) => onLeague(Number(e.target.value))}
                className="min-h-10 w-full rounded-xl border border-(--c-line) bg-(--c-raised) px-3 text-[13px] text-(--c-text)"
              >
                {leagues.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <button type="button" onClick={onAll} className="min-h-10 shrink-0 rounded-xl px-3 text-[13px] font-medium text-(--c-accent) hover:bg-(--c-raised)">
            Všechny ligy
          </button>
        </div>
      </div>

      {!league.full && (
        <p className="mt-3 rounded-xl border border-(--c-line) bg-(--c-surface) px-3.5 py-2.5 text-[13px] leading-snug text-(--c-muted)">
          U této ligy zatím máme soupisky, kalendář a základní údaje. Statistiky hráčů, srovnání a mapy střel doplňujeme jako u Chance Ligy.
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <Seg
          label="Co chcete procházet"
          value={tab}
          onChange={onTab}
          options={[
            { id: "teams", label: `Týmy · ${counts.teams}` },
            { id: "players", label: `Hráči · ${counts.players}` },
            { id: "referees", label: `Rozhodčí · ${counts.referees}` },
          ]}
        />
      </div>

      <div className="mt-4">
        {error && <p className="text-(--c-loss)">Katalog se nepodařilo načíst: {error}</p>}
        {missing && <Empty>Pro tuto ligu zatím nemáme stažený katalog.</Empty>}
        {!data && !error && !missing && <p className="text-sm text-(--c-muted)">Načítám katalog…</p>}
        {data && tab === "teams" && <TeamList items={teams} q={q} />}
        {data && tab === "players" && <PlayerList items={players} hub={data} q={q} />}
        {data && tab === "referees" && <RefereeList items={referees} leagueId={league.id} q={q} />}
      </div>
    </section>
  );
}

function TeamList({ items, q }: { items: CatalogTeamCard[]; q: string }) {
  if (!items.length) return <Empty>{q ? "Žádný tým neodpovídá hledání." : "Žádné týmy."}</Empty>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((t, i) => (
        <li key={t.id}>
          <Link
            to={`/catalog/teams/${t.id}`}
            {...(i === 0 ? { "data-first-result": true } : {})}
            className="flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-(--c-line) bg-(--c-surface) px-4 py-3 transition-colors hover:border-(--c-accent)/60"
          >
            <Crest src={t.image} name={t.name} size={40} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold">{t.name}</div>
              {t.short && <div className="text-xs text-(--c-faint)">{t.short}</div>}
            </div>
            <span aria-hidden className="text-lg leading-none text-(--c-faint)">›</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function PlayerList({ items, hub, q }: { items: CatalogPlayerCard[]; hub: CatalogHub; q: string }) {
  const [pos, setPos] = useState("all");
  const [team, setTeam] = useState<number | "all">("all");
  const [shown, setShown] = useState(PAGE);
  const teamImg = useMemo(() => new Map(hub.teams.map((t) => [t.id, t.image])), [hub]);
  const teams = useMemo(
    () => [...new Map(hub.players.map((p) => [p.team_id, p.team_name])).entries()].sort((a, b) => a[1].localeCompare(b[1], "cs")),
    [hub],
  );

  const rows = useMemo(() => {
    const test = POS.find((p) => p.id === pos)?.test ?? (() => true);
    const out = items.filter((p) => test(norm(p.position ?? "")) && (team === "all" || p.team_id === team));
    // s vybraným týmem podle čísla, jinak podle jména (při hledání podle shody)
    if (team !== "all") return out.sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
    if (q.trim()) return out.sort((a, b) => score(a.name, q) - score(b.name, q) || a.name.localeCompare(b.name, "cs"));
    return out.sort((a, b) => a.name.localeCompare(b.name, "cs"));
  }, [items, pos, team, q]);

  useEffect(() => setShown(PAGE), [pos, team, q]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {POS.map((p) => (
          <Chip key={p.id} active={pos === p.id} onClick={() => setPos(p.id)}>
            {p.label}
          </Chip>
        ))}
        <select
          aria-label="Filtr podle týmu"
          value={team === "all" ? "all" : String(team)}
          onChange={(e) => setTeam(e.target.value === "all" ? "all" : Number(e.target.value))}
          className="ml-auto min-h-8 rounded-full border border-(--c-line) bg-(--c-raised) px-3 text-xs text-(--c-text)"
        >
          <option value="all">Všechny týmy</option>
          {teams.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="mt-3">
          <Empty>{q ? "Žádný hráč neodpovídá hledání." : "Žádní hráči v tomto filtru."}</Empty>
        </div>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-(--c-line) overflow-hidden rounded-2xl border border-(--c-line) bg-(--c-surface)">
            {rows.slice(0, shown).map((p, i) => (
              <li key={p.id}>
                <Link
                  to={`/catalog/players/${p.id}`}
                  {...(i === 0 ? { "data-first-result": true } : {})}
                  className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-(--c-raised) focus-visible:bg-(--c-raised)"
                >
                  <Avatar src={p.image} name={p.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold">{p.name}</div>
                    <div className="flex items-center gap-1.5 text-xs text-(--c-muted)">
                      <Crest src={teamImg.get(p.team_id)} name={p.team_name} size={14} />
                      <span className="truncate">{p.team_name}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs text-(--c-muted)">
                    <div>{p.position ?? "—"}</div>
                    {p.number != null && <div className="tabular-nums text-(--c-faint)">#{p.number}</div>}
                  </div>
                  <span aria-hidden className="text-lg leading-none text-(--c-faint)">›</span>
                </Link>
              </li>
            ))}
          </ul>
          {rows.length > shown && (
            <button
              type="button"
              onClick={() => setShown((s) => s + PAGE)}
              className="mt-3 min-h-10 w-full rounded-xl border border-(--c-line) text-[13px] font-medium text-(--c-accent) hover:bg-(--c-surface)"
            >
              Zobrazit dalších {Math.min(PAGE, rows.length - shown)} z {rows.length - shown}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function RefereeList({ items, leagueId, q }: { items: CatalogRefereeCard[]; leagueId: number; q: string }): ReactNode {
  return (
    <div>
      <p className="mb-3 text-[13px] text-(--c-muted)">Jen hlavní rozhodčí, kteří v aktuální sezoně této ligy už pískali. Nejvytíženější nahoře.</p>
      {items.length === 0 ? (
        <Empty>{q ? "Žádný rozhodčí neodpovídá hledání." : "Letos v této lize zatím nikdo z hlavních nepískal."}</Empty>
      ) : (
        <ul className="divide-y divide-(--c-line) overflow-hidden rounded-2xl border border-(--c-line) bg-(--c-surface)">
          {items.map((r, i) => (
            <li key={r.id}>
              <Link
                to={`/catalog/referees/${r.id}?league=${leagueId}`}
                {...(i === 0 ? { "data-first-result": true } : {})}
                className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-(--c-raised) focus-visible:bg-(--c-raised)"
              >
                <Avatar src={r.image} name={r.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">{r.name}</div>
                  {r.country && <div className="truncate text-xs text-(--c-muted)">{r.country}</div>}
                </div>
                {r.season_matches == null && <span className="shrink-0 text-xs text-(--c-faint)">letos v lize</span>}
                {r.season_matches != null && (
                  <div className="shrink-0 text-right text-xs text-(--c-muted)">
                    <b className="text-[15px] tabular-nums text-(--c-text)">{r.season_matches}</b> {plural(r.season_matches, "zápas", "zápasy", "zápasů")}
                  </div>
                )}
                <span aria-hidden className="text-lg leading-none text-(--c-faint)">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
