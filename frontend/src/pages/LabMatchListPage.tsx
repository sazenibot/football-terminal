import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Frame } from "../cat/kit";
import { useLeagueRound } from "../lib/useData";
import { Card, ProbBar, Seg, TeamLogo, plural } from "../mc2/kit";
import type { RoundFixture, TeamBrief } from "../types";
import { MatchRow, Whistle, dayLabel } from "./MatchListPage";

/* Návrh přepracování rozcestníku Match Center: tři varianty řádku zápasu a přepínač pro 30 lig.
   Data jsou skutečná (Chance Liga), seznam 30 lig je jen ukázkový. */

type Variant = "now" | "a" | "b" | "c";

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });

/** Kdo je favorit podle modelu a jak silný. */
function favourite(p?: [number, number, number]): { side: "home" | "away" | "none"; color: string } {
  if (!p) return { side: "none", color: "var(--c-faint)" };
  const [h, , a] = p;
  if (h >= 45 && h >= a) return { side: "home", color: "var(--c-home)" };
  if (a >= 45 && a > h) return { side: "away", color: "var(--c-away)" };
  return { side: "none", color: "var(--c-faint)" };
}

function groupByDay(rows: RoundFixture[]) {
  const map = new Map<string, RoundFixture[]>();
  for (const f of rows) {
    const k = new Date(f.starting_at).toDateString();
    map.set(k, [...(map.get(k) ?? []), f]);
  }
  return [...map.values()];
}

function DayHead({ iso, count }: { iso: string; count: number }) {
  const d = dayLabel(iso);
  return (
    <h2 className="mb-2 flex items-baseline gap-2 px-1 text-[13px] font-semibold">
      <span>{d.main}</span>
      {d.rel && <span className="rounded-md bg-(--c-accent)/15 px-1.5 py-0.5 text-[11px] font-semibold text-(--c-accent)">{d.rel}</span>}
      <span className="font-normal text-(--c-faint)">
        {count} {plural(count, "zápas", "zápasy", "zápasů")}
      </span>
    </h2>
  );
}

/* ---------- A: scoreboard, den = jedna karta, řádky na střídačku ---------- */

function TeamLine({ team, pct, strong, color }: { team: TeamBrief; pct?: number; strong: boolean; color: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <TeamLogo team={team} size={20} />
      <span className={`min-w-0 flex-1 truncate text-[14px] ${strong ? "font-bold" : "font-medium text-(--c-muted)"}`}>{team.name}</span>
      {pct != null && (
        <span className={`w-10 shrink-0 text-right text-[14px] tabular-nums ${strong ? "font-bold" : "text-(--c-muted)"}`} style={strong ? { color } : undefined}>
          {pct} %
        </span>
      )}
    </div>
  );
}

function RowA({ f }: { f: RoundFixture }) {
  const p = f.signals?.probs;
  const fav = favourite(p);
  return (
    <Link
      to={`/match/${f.fixture_id}`}
      className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-x-3 border-t border-(--c-line) px-3 py-3 first:border-t-0 odd:bg-transparent even:bg-(--c-raised)/45 hover:bg-(--c-accent)/8 sm:px-4"
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-[15px] font-bold tabular-nums leading-none">{timeOf(f.starting_at)}</span>
        {f.signals?.referee && (
          <span title="Rozhodčí je delegovaný" className="text-(--c-muted)">
            <Whistle />
          </span>
        )}
      </div>
      <div className="min-w-0 space-y-1.5">
        <TeamLine team={f.home} pct={p?.[0]} strong={fav.side === "home"} color={fav.color} />
        <TeamLine team={f.away} pct={p?.[2]} strong={fav.side === "away"} color={fav.color} />
        {p && (
          <div className="flex items-center gap-2 pt-0.5">
            <div className="flex-1">
              <ProbBar home={p[0]} draw={p[1]} away={p[2]} height={4} />
            </div>
            <span className="w-[4.5rem] shrink-0 text-right text-[11px] tabular-nums text-(--c-faint)">remíza {p[1]} %</span>
          </div>
        )}
      </div>
      <span aria-hidden className="text-lg text-(--c-faint)">
        ›
      </span>
    </Link>
  );
}

/* ---------- B: karty s pruhem podle favorita a středovým časem ---------- */

function CardB({ f }: { f: RoundFixture }) {
  const p = f.signals?.probs;
  const fav = favourite(p);
  return (
    <Link
      to={`/match/${f.fixture_id}`}
      className="group relative block overflow-hidden rounded-2xl border border-(--c-line) bg-(--c-surface) shadow-sm transition-all hover:-translate-y-px hover:border-(--c-accent) hover:shadow-md"
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: fav.color }} />
      <div className="flex items-center justify-center gap-2 bg-(--c-raised)/70 py-1.5 pl-1.5">
        <span className="text-[13px] font-bold tabular-nums">{timeOf(f.starting_at)}</span>
        {f.signals?.referee && (
          <span title="Rozhodčí je delegovaný" className="text-(--c-muted)">
            <Whistle />
          </span>
        )}
      </div>
      <div className="px-4 py-3 pl-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
            <TeamLogo team={f.home} size={32} />
            <span className="w-full truncate text-[14px] font-semibold">{f.home.name}</span>
          </div>
          <span className="text-[11px] font-semibold text-(--c-faint)">vs</span>
          <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
            <TeamLogo team={f.away} size={32} />
            <span className="w-full truncate text-[14px] font-semibold">{f.away.name}</span>
          </div>
        </div>
        {p && (
          <div className="mt-3">
            <ProbBar home={p[0]} draw={p[1]} away={p[2]} height={6} />
            <div className="mt-1 grid grid-cols-3 text-[11px] tabular-nums text-(--c-muted)">
              <span style={{ color: "var(--c-home)" }}>{p[0]} %</span>
              <span className="text-center text-(--c-faint)">{p[1]} %</span>
              <span className="text-right" style={{ color: "var(--c-away)" }}>
                {p[2]} %
              </span>
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

/* ---------- C: kompaktní dlaždice ve dvou sloupcích ---------- */

function TileC({ f }: { f: RoundFixture }) {
  const p = f.signals?.probs;
  const fav = favourite(p);
  return (
    <Link to={`/match/${f.fixture_id}`} className="block rounded-xl border border-(--c-line) bg-(--c-surface) p-3 transition-colors hover:border-(--c-accent)">
      <div className="mb-2 flex items-center justify-between text-[12px] text-(--c-muted)">
        <span className="font-bold tabular-nums text-(--c-text)">{timeOf(f.starting_at)}</span>
        <span className="flex items-center gap-2">
          {p && <span className="tabular-nums text-(--c-faint)">remíza {p[1]} %</span>}
          {f.signals?.referee && <Whistle />}
        </span>
      </div>
      <div className="space-y-1.5">
        <TeamLine team={f.home} pct={p?.[0]} strong={fav.side === "home"} color={fav.color} />
        <TeamLine team={f.away} pct={p?.[2]} strong={fav.side === "away"} color={fav.color} />
      </div>
      {p && (
        <div className="mt-2.5">
          <ProbBar home={p[0]} draw={p[1]} away={p[2]} height={4} />
        </div>
      )}
    </Link>
  );
}

/* ---------- ukázka seznamu ---------- */

function MatchesDemo({ rows, variant }: { rows: RoundFixture[]; variant: Variant }) {
  const days = useMemo(() => groupByDay(rows), [rows]);
  return (
    <div className="space-y-6">
      {days.map((g) => (
        <section key={g[0].starting_at}>
          <DayHead iso={g[0].starting_at} count={g.length} />
          {variant === "now" && (
            <div className="space-y-2">
              {g.map((f) => (
                <MatchRow key={f.fixture_id} f={f} home={f.home} away={f.away} isNew={() => false} onOpen={() => {}} />
              ))}
            </div>
          )}
          {variant === "a" && <div className="overflow-hidden rounded-2xl border border-(--c-line) bg-(--c-surface)">{g.map((f) => <RowA key={f.fixture_id} f={f} />)}</div>}
          {variant === "b" && <div className="grid gap-3 sm:grid-cols-2">{g.map((f) => <CardB key={f.fixture_id} f={f} />)}</div>}
          {variant === "c" && <div className="grid gap-2 sm:grid-cols-2">{g.map((f) => <TileC key={f.fixture_id} f={f} />)}</div>}
        </section>
      ))}
    </div>
  );
}

/* ---------- přepínač lig ---------- */

type L = { id: number; name: string; country: string; flag: string; n: number; live: boolean };

const LEAGUES: L[] = [
  { id: 262, name: "Chance Liga", country: "Česko", flag: "🇨🇿", n: 8, live: true },
  { id: 2, name: "Premier League", country: "Anglie", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", n: 10, live: true },
  { id: 3, name: "La Liga", country: "Španělsko", flag: "🇪🇸", n: 10, live: true },
  { id: 4, name: "Serie A", country: "Itálie", flag: "🇮🇹", n: 10, live: true },
  { id: 5, name: "Bundesliga", country: "Německo", flag: "🇩🇪", n: 9, live: true },
  { id: 6, name: "Ligue 1", country: "Francie", flag: "🇫🇷", n: 9, live: false },
  { id: 7, name: "Eredivisie", country: "Nizozemsko", flag: "🇳🇱", n: 9, live: false },
  { id: 8, name: "Primeira Liga", country: "Portugalsko", flag: "🇵🇹", n: 9, live: false },
  { id: 9, name: "Fortuna liga", country: "Slovensko", flag: "🇸🇰", n: 6, live: false },
  { id: 10, name: "Ekstraklasa", country: "Polsko", flag: "🇵🇱", n: 9, live: false },
  { id: 11, name: "Bundesliga", country: "Rakousko", flag: "🇦🇹", n: 6, live: false },
  { id: 12, name: "Super League", country: "Švýcarsko", flag: "🇨🇭", n: 6, live: false },
  { id: 13, name: "Pro League", country: "Belgie", flag: "🇧🇪", n: 8, live: false },
  { id: 14, name: "Süper Lig", country: "Turecko", flag: "🇹🇷", n: 9, live: false },
  { id: 15, name: "Superligaen", country: "Dánsko", flag: "🇩🇰", n: 6, live: false },
  { id: 16, name: "Allsvenskan", country: "Švédsko", flag: "🇸🇪", n: 8, live: false },
  { id: 17, name: "Eliteserien", country: "Norsko", flag: "🇳🇴", n: 8, live: false },
  { id: 18, name: "Super League", country: "Řecko", flag: "🇬🇷", n: 7, live: false },
  { id: 19, name: "HNL", country: "Chorvatsko", flag: "🇭🇷", n: 5, live: false },
  { id: 20, name: "SuperLiga", country: "Srbsko", flag: "🇷🇸", n: 8, live: false },
  { id: 21, name: "NB I", country: "Maďarsko", flag: "🇭🇺", n: 6, live: false },
  { id: 22, name: "Liga I", country: "Rumunsko", flag: "🇷🇴", n: 8, live: false },
  { id: 23, name: "Premier League", country: "Ukrajina", flag: "🇺🇦", n: 8, live: false },
  { id: 24, name: "Premier League", country: "Skotsko", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", n: 6, live: false },
  { id: 25, name: "Championship", country: "Anglie", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", n: 12, live: false },
  { id: 26, name: "Serie B", country: "Itálie", flag: "🇮🇹", n: 10, live: false },
  { id: 27, name: "2. Bundesliga", country: "Německo", flag: "🇩🇪", n: 9, live: false },
  { id: 28, name: "Série A", country: "Brazílie", flag: "🇧🇷", n: 10, live: false },
  { id: 29, name: "MLS", country: "USA", flag: "🇺🇸", n: 14, live: false },
  { id: 30, name: "Liga MX", country: "Mexiko", flag: "🇲🇽", n: 9, live: false },
];

const initialsOf = (l: L) => l.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

function Badge({ l, size = 28 }: { l: L; size?: number }) {
  return (
    <span style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-full bg-(--c-raised) text-[11px] font-bold text-(--c-muted)">
      {initialsOf(l)}
    </span>
  );
}

/** 1: pásek s posunem. Dobré do cca 8 lig, pak se ztrácí přehled. */
function Carousel({ value, onPick }: { value: number; onPick: (id: number) => void }) {
  return (
    <div className="relative">
      <div className="no-scrollbar -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {LEAGUES.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => onPick(l.id)}
            className={`flex shrink-0 snap-start items-center gap-2 rounded-2xl border px-3 py-2 text-left ${value === l.id ? "border-(--c-accent) bg-(--c-accent)/10" : "border-(--c-line) bg-(--c-surface)"} ${l.live ? "" : "opacity-50"}`}
          >
            <Badge l={l} />
            <span className="text-sm font-semibold">{l.name}</span>
          </button>
        ))}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-(--c-page) to-transparent" />
    </div>
  );
}

/** 2: doporučená varianta. Pár oblíbených a naposledy otevřených jako čipy, ostatní v prohledávatelném panelu podle zemí. */
function Picker({ value, onPick }: { value: number; onPick: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pins, setPins] = useState<number[]>([262, 2, 3]);
  const current = LEAGUES.find((l) => l.id === value)!;
  const chips = [...new Set([value, ...pins])].slice(0, 5).map((id) => LEAGUES.find((l) => l.id === id)!);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = LEAGUES.filter((l) => !needle || `${l.name} ${l.country}`.toLowerCase().includes(needle));
    const map = new Map<string, L[]>();
    for (const l of filtered) map.set(l.country, [...(map.get(l.country) ?? []), l]);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "cs"));
  }, [q]);

  const toggle = (id: number) => setPins((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => onPick(l.id)}
            className={`flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-sm font-semibold ${value === l.id ? "border-(--c-accent) bg-(--c-accent)/12 text-(--c-accent)" : "border-(--c-line) bg-(--c-surface)"}`}
          >
            <Badge l={l} size={24} />
            {l.name}
            <span aria-hidden>{l.flag}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="ml-auto flex items-center gap-2 rounded-full border border-(--c-line) bg-(--c-surface) px-4 py-2 text-sm font-medium hover:border-(--c-faint)"
        >
          Všechny soutěže <span className="rounded-md bg-(--c-raised) px-1.5 text-[11px] tabular-nums text-(--c-muted)">{LEAGUES.length}</span>
          <span aria-hidden>{open ? "▴" : "▾"}</span>
        </button>
      </div>
      {open && (
        <div className="mt-3 rounded-2xl border border-(--c-line) bg-(--c-surface) p-3 shadow-lg">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Hledat ligu nebo zemi…"
            className="w-full rounded-xl border border-(--c-line) bg-(--c-page) px-3 py-2 text-sm outline-none focus:border-(--c-accent)"
          />
          <div className="mt-2 max-h-80 overflow-y-auto pr-1">
            {groups.length === 0 && <p className="py-6 text-center text-sm text-(--c-muted)">Nic jsme nenašli.</p>}
            {groups.map(([country, ls]) => (
              <div key={country}>
                <p className="sticky top-0 z-10 bg-(--c-surface) px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">
                  {ls[0].flag} {country}
                </p>
                {ls.map((l) => (
                  <div key={l.id} className={`flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-(--c-raised)/60 ${l.live ? "" : "opacity-60"}`}>
                    <button
                      type="button"
                      onClick={() => {
                        if (l.live) {
                          onPick(l.id);
                          setOpen(false);
                        }
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <Badge l={l} size={26} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.name}</span>
                      {l.live ? (
                        <span className="text-[11px] tabular-nums text-(--c-muted)">{l.n} zápasů</span>
                      ) : (
                        <span className="rounded-md bg-(--c-raised) px-1.5 py-0.5 text-[10px] font-semibold uppercase text-(--c-muted)">Připravujeme</span>
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label={pins.includes(l.id) ? "Odebrat z oblíbených" : "Přidat do oblíbených"}
                      onClick={() => toggle(l.id)}
                      className={`px-1 text-base ${pins.includes(l.id) ? "text-amber-400" : "text-(--c-faint) hover:text-(--c-muted)"}`}
                    >
                      {pins.includes(l.id) ? "★" : "☆"}
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-2 text-[12px] text-(--c-faint)">
        Zobrazeno: <b className="text-(--c-muted)">{current.name}</b> ({current.country}).
      </p>
    </div>
  );
}

/* ---------- stránka ---------- */

export function LabMatchListPage() {
  const { data } = useLeagueRound(262);
  const [variant, setVariant] = useState<Variant>("a");
  const [carousel, setCarousel] = useState(262);
  const [picked, setPicked] = useState(262);
  const rows = useMemo(() => {
    const now = Date.now();
    return (data?.round ?? []).filter((f) => new Date(f.starting_at).getTime() > now).sort((a, b) => a.starting_at.localeCompare(b.starting_at));
  }, [data]);

  return (
    <Frame wide>
      <Link to="/lab" className="text-[13px] text-(--c-accent) hover:underline">
        ← Lab
      </Link>
      <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Rozcestník Match Center: návrh</h1>
      <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-(--c-muted)">
        Tři varianty výpisu zápasů na skutečných datech Chance Ligy a dva přístupy k přepínání lig pro budoucích 30 soutěží. Aktuální podoba je pro srovnání.
      </p>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">1. Výpis zápasů</h2>
        <div className="mt-3">
          <Seg
            label="Varianta výpisu"
            value={variant}
            onChange={setVariant}
            wrap
            options={[
              { id: "now", label: "Dnes" },
              { id: "a", label: "A · Scoreboard" },
              { id: "b", label: "B · Karty s pruhem" },
              { id: "c", label: "C · Dlaždice" },
            ]}
          />
        </div>
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 rounded-3xl border border-(--c-line) bg-(--c-page) p-3 sm:p-4">
            {rows.length ? <MatchesDemo rows={rows} variant={variant} /> : <p className="py-10 text-center text-(--c-muted)">Načítám zápasy…</p>}
          </div>
          <aside className="space-y-3 text-[13px] leading-relaxed text-(--c-muted)">
            <Card title="Proč je dnešní výpis nepřehledný">
              <ul className="list-disc space-y-1.5 pl-4">
                <li>Každý zápas je samostatná karta stejné barvy a výšky, tak splývají.</li>
                <li>Čas stojí sám nad názvy. Oko skáče mezi čtyřmi vrstvami (čas, týmy, pruh, procenta).</li>
                <li>Procenta jsou malá a daleko od týmů, ke kterým patří.</li>
                <li>Favorit není poznat na první pohled.</li>
              </ul>
            </Card>
            {variant === "a" && (
              <Card title="A · Scoreboard">
                <p>
                  Den je jedna karta a zápasy jsou řádky na střídačku. Čas má pevný sloupec, takže se čte jako rozpis. Týmy jsou pod sebou a procento stojí hned za svým týmem.
                  Favorit je tučně a v barvě strany. Řádek je asi o třetinu nižší, na obrazovku se vejde víc zápasů. <b className="text-(--c-text)">Doporučuju pro mobil i desktop.</b>
                </p>
              </Card>
            )}
            {variant === "b" && (
              <Card title="B · Karty s pruhem">
                <p>
                  Zůstává karta, ale čas je vycentrovaný v pásu nahoře a barevný pruh vlevo ukazuje favorita (modrá domácí, fialová hosté, šedá vyrovnané). Logo je větší, líp
                  působí marketingově. Na úkor hustoty: na mobilu je to dvakrát tolik scrollu.
                </p>
              </Card>
            )}
            {variant === "c" && (
              <Card title="C · Dlaždice">
                <p>
                  Nejhustší. Dva sloupce na desktopu, na mobilu jeden. Hodí se pro ligy s 9 až 12 zápasy v kole. Hůř se čte zblízka, protože chybí vzduch.
                </p>
              </Card>
            )}
          </aside>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">2. Přepínač lig pro 30 soutěží</h2>
        <p className="mt-1 max-w-2xl text-[14px] text-(--c-muted)">Seznam lig je ukázkový. Oblíbené (hvězdička) a naposledy otevřená liga jsou vždy po ruce, zbytek v panelu.</p>

        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <Card className="min-w-0" title="Varianta 1 · Pásek s posunem" lead="Dnešní princip. S 30 ligami je to dlouhá nudle, kterou nikdo neprojde.">
            <Carousel value={carousel} onPick={setCarousel} />
          </Card>
          <Card className="min-w-0" title="Varianta 2 · Oblíbené + všechny soutěže (doporučeno)" lead="Pět čipů a tlačítko „Všechny soutěže“ s hledáním a řazením podle zemí.">
            <Picker value={picked} onPick={setPicked} />
          </Card>
        </div>
      </section>
    </Frame>
  );
}
