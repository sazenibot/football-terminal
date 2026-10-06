import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAccess } from "../access/AccessContext";
import { TierBadge } from "../access/Gate";
import { TIERS, type Tier } from "../access/tiers";
import { Pill } from "../cat/kit";
import { articles } from "../content/content";
import { lastLeagueId } from "../components/LeagueSwitcher";
import { useDataIndex, useLeagueRound } from "../lib/useData";
import { ProbBar, TeamLogo } from "../mc2/kit";
import type { RoundFixture } from "../types";
import { fmtDate, fmtDateTime, useFeed } from "../site/data";

const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.2em] text-(--c-accent)";

export function HomePage() {
  const { index } = useDataIndex();
  const { tier } = useAccess();
  const defaultId = index?.default_league_id ?? 262;
  const saved = lastLeagueId();
  const league = saved && Number.isFinite(saved) ? saved : defaultId;
  const { data } = useLeagueRound(defaultId);
  const upcoming = useMemo(() => {
    const now = Date.now();
    return (data?.round ?? []).filter((f) => new Date(f.starting_at).getTime() > now).sort((a, b) => a.starting_at.localeCompare(b.starting_at));
  }, [data]);

  return (
    <div className="mc2 mx-auto max-w-6xl px-4 pb-12 pt-20">
      <Hero leagueId={league} anon={tier === "anon"} next={upcoming[0]} leagueName={data?.league.name} />
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <MatchCenterCard leagueId={league} matches={upcoming.slice(0, 3)} />
          <section className="rounded-3xl border border-(--c-line) bg-(--c-surface)/40 p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-1">
              <div>
                <p className={eyebrow}>Datový katalog</p>
                <p className="mt-0.5 text-[13px] text-(--c-muted)">Profily týmů, hráčů a rozhodčích napříč sezónami.</p>
              </div>
              <Link to="/catalog" className="text-[13px] font-medium text-(--c-accent) hover:underline">
                Otevřít katalog →
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
            <CatalogCard to={`/catalog?league=${defaultId}&tab=teams`} title="Týmy" text="Kádr, FDR kalendář a radar napříč trenérskými érami." note="První dvě části zdarma" motif={<RadarMotif />} />
            <CatalogCard to={`/catalog?league=${defaultId}&tab=players`} title="Hráči" text="Výkony podle soupeře, mapa střel a srovnání se stejnou rolí." note="První dvě části zdarma" motif={<BarsMotif />} />
            <CatalogCard to={`/catalog?league=${defaultId}&tab=referees`} title="Rozhodčí" text="Jak píská, kolik karet rozdává a jak zachází s konkrétním týmem." note="Přehled zdarma" motif={<CardsMotif />} />
            </div>
          </section>
          <div className="grid gap-4 sm:grid-cols-2">
            <Soon title="Value finder" text="Stránka s přehledem zápasů, kde jsme našli největší hodnotu: rozdíl v modelové simulaci oproti kurzu." />
            <Soon
              title="System picks"
              text="Náš simulační engine neúnavně prosívá obrovské množství dat a porovnává je s kurzy, aby za vás odhalil skryté hodnotové příležitosti s nejvyšší výhodou."
            />
          </div>
        </div>
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <NewsColumn />
        </aside>
      </div>
      <Guides />
      <PricingTeaser />
    </div>
  );
}

/* ---------- úvod ---------- */

function Hero({ leagueId, anon, next, leagueName }: { leagueId: number; anon: boolean; next?: RoundFixture; leagueName?: string }) {
  return (
    <header className="relative overflow-hidden rounded-3xl border border-(--c-line) bg-(--c-surface)">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 90% at 88% 0%, color-mix(in oklab, var(--c-accent) 28%, transparent), transparent 70%), radial-gradient(45% 70% at 0% 100%, color-mix(in oklab, var(--c-away) 18%, transparent), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: "linear-gradient(var(--c-line) 1px, transparent 1px), linear-gradient(90deg, var(--c-line) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(70% 90% at 70% 20%, black, transparent)",
          WebkitMaskImage: "radial-gradient(70% 90% at 70% 20%, black, transparent)",
        }}
      />
      <div className="relative grid items-center gap-8 px-6 py-10 sm:px-10 sm:py-14 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className={eyebrow}>Football Terminal</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Fotbal, jak ho
            <br />
            vidí <span className="bg-gradient-to-r from-(--c-accent) to-(--c-home) bg-clip-text text-transparent">data</span>.
          </h1>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-(--c-muted) sm:text-[17px]">
            Vidíme v datech to, co ostatním uniká. Zapomeňte na obyčejné výsledkové tabulky. Jdeme daleko za hranice čísel – odkrýváme skryté vzorce v herních stylech, vlivech
            rozhodčích i historických liniích, ze kterých můžete získat skutečnou výhodu.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            <Link
              to={`/league/${leagueId}`}
              className="inline-flex min-h-14 flex-col justify-center btn-accent rounded-xl px-6 py-2 shadow-lg shadow-(--c-accent)/20 transition-transform hover:-translate-y-0.5"
            >
              <span className="text-[15px] font-semibold leading-tight">Otevřít Match Center</span>
              <span className="btn-accent-sub text-[12px] leading-tight">Detailní rozbor zápasů v dalších 7 dnech</span>
            </Link>
            <Link
              to="/catalog"
              className="inline-flex min-h-14 flex-col justify-center rounded-xl border border-(--c-line) bg-(--c-surface)/70 px-6 py-2 backdrop-blur hover:border-(--c-faint)"
            >
              <span className="text-[15px] font-semibold leading-tight">Datový katalog</span>
              <span className="text-[12px] leading-tight text-(--c-muted)">Nejrozsáhlejší databáze týmů, hráčů a rozhodčích</span>
            </Link>
            {anon && (
              <Link to="/prihlaseni" className="inline-flex min-h-11 items-center px-2 text-[14px] font-medium text-(--c-accent) hover:underline">
                Registrace zdarma →
              </Link>
            )}
          </div>
          <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-(--c-muted)">
            {["Trendy a opakující se vzorce", "Radary týmů a shotmapy hráčů", "Simulace a srovnání trenérů"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <span className="text-(--c-accent)">●</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <HeroPreview next={next} leagueName={leagueName} />
      </div>
    </header>
  );
}

function HeroPreview({ next, leagueName }: { next?: RoundFixture; leagueName?: string }) {
  const { can } = useAccess();
  const p = next?.signals?.probs;
  const open = can("mc.future.all");
  return (
    <div className="relative mx-auto w-full max-w-sm lg:ml-auto">
      <div aria-hidden className="absolute -inset-3 rounded-[2rem] bg-(--c-accent)/10 blur-2xl" />
      <div className="relative rounded-2xl border border-(--c-line) bg-(--c-surface)/90 p-5 shadow-2xl backdrop-blur lg:rotate-1">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">
          <span>Nejbližší zápas</span>
          <span>{leagueName ?? "Chance Liga"}</span>
        </div>
        {next ? (
          <Link to={`/match/${next.fixture_id}`} className="mt-4 block">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-col items-center text-center">
                <TeamLogo team={next.home} size={44} />
                <span className="mt-2 text-[13px] font-semibold leading-tight">{next.home.name}</span>
              </div>
              <span className="text-[12px] font-semibold text-(--c-faint)">vs</span>
              <div className="flex min-w-0 flex-1 flex-col items-center text-center">
                <TeamLogo team={next.away} size={44} />
                <span className="mt-2 text-[13px] font-semibold leading-tight">{next.away.name}</span>
              </div>
            </div>
            <p className="mt-3 text-center text-[12px] text-(--c-muted)">{fmtDateTime(next.starting_at)}</p>
            {p && (
              <div className="mt-4">
                <div className={open ? "" : "blur-[5px]"} aria-hidden={!open}>
                  <ProbBar home={p[0]} draw={p[1]} away={p[2]} height={10} />
                  <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-(--c-muted)">
                    <span>{Math.round(p[0])} %</span>
                    <span>{Math.round(p[1])} %</span>
                    <span>{Math.round(p[2])} %</span>
                  </div>
                </div>
                <p className="mt-2 text-center text-[12px] text-(--c-muted)">{open ? "Pravděpodobnosti z modelu" : "🔒 Pravděpodobnosti modelu odemkne Unlimited"}</p>
              </div>
            )}
          </Link>
        ) : (
          <p className="py-10 text-center text-sm text-(--c-muted)">Načítám nejbližší zápas…</p>
        )}
      </div>
    </div>
  );
}

/* ---------- karty produktů ---------- */

function MatchCenterCard({ leagueId, matches }: { leagueId: number; matches: RoundFixture[] }) {
  return (
    <section className="group relative overflow-hidden rounded-3xl border border-(--c-line) bg-(--c-surface) transition-colors hover:border-(--c-accent)/60">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{ background: "radial-gradient(60% 120% at 100% 0%, color-mix(in oklab, var(--c-accent) 14%, transparent), transparent 70%)" }}
      />
      <div className="relative grid gap-6 p-6 sm:p-8 md:grid-cols-[1fr_1fr]">
        <div className="flex flex-col">
          <IconTile>
            <PitchIcon />
          </IconTile>
          <h2 className="mt-4 text-2xl font-bold sm:text-3xl">Match Center</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-(--c-muted)">
            Detailní rozbor každého ligového zápasu na sedm dní dopředu. Herní styly, forma, vzájemné zápasy, vliv rozhodčího, opakující se trendy, modelová simulace, bilance trenérů, hráčské statistiky, hodnoty do betbuilderů... to vše v jednom rozsáhlém, vizuálně přehledném reportu.
          </p>
          <p className="mt-2 text-[12px] text-(--c-faint)">Odehrané zápasy zdarma, budoucí od registrace.</p>
          <Link to={`/league/${leagueId}`} className="mt-auto inline-flex pt-5 text-[14px] font-semibold text-(--c-accent) after:absolute after:inset-0 after:content-[''] hover:underline">
            Otevřít Match Center →
          </Link>
        </div>
        <ul className="relative z-10 self-center rounded-2xl border border-(--c-line) bg-(--c-page)/70 p-1.5">
          {matches.length === 0 && <li className="px-3 py-6 text-center text-sm text-(--c-muted)">Načítám zápasy…</li>}
          {matches.map((f) => (
            <li key={f.fixture_id}>
              <Link to={`/match/${f.fixture_id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-(--c-raised)/60">
                <TeamLogo team={f.home} size={22} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                  {f.home.name} – {f.away.name}
                </span>
                <span className="shrink-0 text-[11px] text-(--c-muted)">{fmtDateTime(f.starting_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function CatalogCard({ to, title, text, note, motif }: { to: string; title: string; text: string; note: string; motif: ReactNode }) {
  return (
    <Link to={to} className="group flex flex-col overflow-hidden rounded-2xl border border-(--c-line) bg-(--c-surface) transition-all hover:-translate-y-0.5 hover:border-(--c-accent)/60">
      <div className="flex h-24 items-center justify-center bg-gradient-to-br from-(--c-raised)/70 to-transparent text-(--c-accent)">{motif}</div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-[18px] font-bold">{title}</h3>
        <p className="mt-1 text-[13px] leading-snug text-(--c-muted)">{text}</p>
        <p className="mt-auto pt-3 text-[11px] text-(--c-faint)">{note}</p>
      </div>
    </Link>
  );
}

function Soon({ title, text }: { title: string; text: string }) {
  return (
    <div aria-disabled className="relative cursor-not-allowed select-none rounded-2xl border border-dashed border-(--c-line) bg-(--c-surface)/40 p-5 opacity-80 grayscale">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[17px] font-bold">{title}</h3>
        <span className="rounded-full border border-(--c-line) px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-(--c-muted)">Připravujeme</span>
      </div>
      <p className="mt-1.5 text-[13px] leading-snug text-(--c-muted)">{text}</p>
      <div className="mt-3">
        <TierBadge tier="pro" />
      </div>
    </div>
  );
}

function IconTile({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-(--c-accent)/15 text-(--c-accent)">
      {children}
    </span>
  );
}

const svgProps = { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function PitchIcon() {
  return (
    <svg {...svgProps} aria-hidden>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M12 5v14" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M2.5 9.5h3v5h-3M21.5 9.5h-3v5h3" />
    </svg>
  );
}

function RadarMotif() {
  return (
    <svg width="96" height="80" viewBox="0 0 96 80" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <polygon points="48,6 86,32 72,72 24,72 10,32" opacity=".25" />
      <polygon points="48,24 68,38 60,58 36,58 28,38" opacity=".25" />
      <polygon points="48,10 80,34 62,66 30,60 20,36" fill="currentColor" fillOpacity=".18" />
    </svg>
  );
}

function BarsMotif() {
  return (
    <svg width="96" height="80" viewBox="0 0 96 80" fill="currentColor" aria-hidden>
      {[28, 46, 36, 62, 52, 70].map((h, i) => (
        <rect key={i} x={8 + i * 14} y={76 - h} width="9" height={h} rx="3" opacity={0.35 + i * 0.11} />
      ))}
    </svg>
  );
}

function CardsMotif() {
  return (
    <svg width="96" height="80" viewBox="0 0 96 80" aria-hidden>
      <rect x="22" y="14" width="30" height="46" rx="4" fill="#facc15" transform="rotate(-10 37 37)" />
      <rect x="46" y="14" width="30" height="46" rx="4" fill="#ef4444" transform="rotate(8 61 37)" />
    </svg>
  );
}

/* ---------- co je nového ---------- */

function NewsColumn() {
  const items = useFeed();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 3);
  return (
    <section className="rounded-2xl border border-(--c-line) bg-(--c-surface) p-5">
      <h2 className="text-[15px] font-semibold">Co je nového</h2>
      <ol className="mt-4">
        {shown.map((n) => (
          <li key={n.id} className="relative border-l border-(--c-line) pb-5 pl-4 last:pb-0">
            <span className="absolute -left-[4.5px] top-1.5 h-2 w-2 rounded-full bg-(--c-accent)" aria-hidden />
            <div className="flex flex-wrap items-center gap-2">
              <Pill>{n.tag}</Pill>
              <time className="text-[11px] text-(--c-faint)" dateTime={n.date}>
                {fmtDate(n.date)}
              </time>
            </div>
            <h3 className="mt-1.5 text-[13px] font-semibold leading-snug">{n.title}</h3>
            <p className="mt-0.5 text-[12px] leading-snug text-(--c-muted)">{n.text}</p>
            {n.link && (
              <Link to={n.link} className="mt-1 inline-block text-[12px] text-(--c-accent) hover:underline">
                {n.link.startsWith("/clanky") ? "Číst článek" : "Otevřít"} →
              </Link>
            )}
          </li>
        ))}
      </ol>
      {items.length > 3 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-3 text-[12px] text-(--c-accent) hover:underline">
          {all ? "Zobrazit méně" : `Zobrazit starší (${items.length - 3})`}
        </button>
      )}
    </section>
  );
}

/* ---------- články ---------- */

function Guides() {
  const list = articles.slice(0, 3);
  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className={eyebrow}>Průvodce</p>
          <h2 className="mt-1 text-2xl font-bold">Naučte se číst data</h2>
        </div>
        <Link to="/clanky" className="text-[13px] text-(--c-accent) hover:underline">
          Všechny články →
        </Link>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {list.map((a) => (
          <Link key={a.slug} to={`/clanky/${a.slug}`} className="block rounded-2xl border border-(--c-line) bg-(--c-surface) p-5 transition-colors hover:border-(--c-faint)">
            <Pill>{a.category}</Pill>
            <h3 className="mt-2 text-[15px] font-semibold leading-snug">{a.title}</h3>
            <p className="mt-1 text-[13px] leading-snug text-(--c-muted)">{a.excerpt}</p>
            <p className="mt-2 text-[11px] text-(--c-faint)">{a.minutes} min čtení</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ---------- tarify ---------- */

const POINTS: Record<Tier, string[]> = {
  anon: ["Match Center od včerejška do minulosti", "V katalogu první dvě části každého profilu", "Základní články"],
  account: ["Jeden budoucí zápas v Match Center", "Celý profil týmů", "Rozpis výsledků modelu"],
  unlimited: ["Neomezený Match Center i do budoucna", "Celý katalog týmů, hráčů i rozhodčích", "Všechny články"],
  pro: ["Vše z Unlimited", "Value finder", "System picks"],
};

function PricingTeaser() {
  const { tier } = useAccess();
  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-2xl font-bold">Tarify</h2>
        <Link to="/tarify" className="text-[13px] text-(--c-accent) hover:underline">
          Podrobné srovnání →
        </Link>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TIERS.map((t) => (
          <article key={t.id} className={`flex flex-col rounded-2xl border bg-(--c-surface) p-5 ${t.featured ? "border-(--c-accent)" : "border-(--c-line)"} ${tier === t.id ? "ring-1 ring-(--c-accent)" : ""}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--c-accent)">{t.name}</p>
            <p className="mt-2 text-2xl font-bold">{t.price}</p>
            <p className="text-[12px] text-(--c-faint)">{t.period}</p>
            <ul className="mt-3 flex-1 space-y-1.5 text-[13px] text-(--c-muted)">
              {POINTS[t.id].map((p) => (
                <li key={p} className="flex gap-2">
                  <span className="text-(--c-accent)">→</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-(--c-faint)">Ceny a rozdělení funkcí jsou zatím ilustrativní.</p>
    </section>
  );
}
