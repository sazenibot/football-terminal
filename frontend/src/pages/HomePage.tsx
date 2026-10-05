import { Link } from "react-router-dom";
import { lastLeagueId } from "../components/LeagueSwitcher";
import { useDataIndex } from "../lib/useData";

const TIERS = [
  {
    name: "Zdarma",
    price: "0 Kč",
    period: "bez registrace",
    points: [
      "Match Center od včerejška do minulosti",
      "V katalogu první dvě části každé stránky",
    ],
  },
  {
    name: "Zdarma s účtem",
    price: "0 Kč",
    period: "po registraci",
    points: [
      "Jeden budoucí zápas v Match Center",
      "Kompletní datový katalog týmů",
    ],
  },
  {
    name: "Unlimited",
    price: "249 Kč",
    period: "měsíčně",
    featured: true,
    points: [
      "Neomezený Match Center i do budoucna",
      "Celý katalog týmů, hráčů i rozhodčích",
    ],
  },
] as const;

export function HomePage() {
  const { index } = useDataIndex();
  const defaultId = index?.default_league_id ?? 262;
  const saved = lastLeagueId();
  const league = saved && Number.isFinite(saved) ? saved : defaultId;
  const centerTo = `/league/${league}`;
  const catalogLeague = defaultId;

  return (
    <div className="max-w-6xl mx-auto px-4 pt-20 pb-20">
      <header className="hp-hero px-6 py-12 md:px-10 md:py-16 mb-10">
        <p className="relative text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300 light:text-emerald-700">
          Fotbalová analytika
        </p>
        <h1 className="relative mt-3 text-4xl md:text-5xl font-bold tracking-tight text-white light:text-slate-900">
          Football Terminal
        </h1>
        <p className="relative mt-4 max-w-2xl text-[17px] leading-relaxed text-emerald-50/90 light:text-slate-600">
          Nejsme další výsledková tabulka. Hledáme statistiky, které se v zápasech opakují — a ukazujeme,
          kde z nich může plynout výhoda. Herní styl, trendy, rozhodčí i linie, které z historie drží.
        </p>
      </header>

      <section className="mb-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-400/90 mb-3">Živý přehled</p>
        <Link to={centerTo} className="card catalog-tile hp-center p-6 md:p-8 block hover:border-rose-400">
          <p className="relative text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-300 light:text-rose-700">
            Match Center
          </p>
          <h2 className="relative text-2xl font-semibold text-white light:text-slate-900 mt-1">
            Ligové zápasy na sedm dní
          </h2>
          <p className="relative text-sm text-rose-50/85 light:text-slate-600 mt-2 max-w-3xl">
            Přehled nadcházejících zápasů s rozborem herních stylů, trendy z posledních utkání i ze vzájemných
            duelů, vlivem rozhodčího a Trendmetrem.
          </p>
        </Link>
      </section>

      <section className="hp-catalog">
        <div className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-400">Databáze</p>
          <h2 className="text-xl font-semibold text-white light:text-slate-900 mt-1">Datový katalog</h2>
          <p className="text-sm text-slate-400 light:text-slate-500 mt-1 max-w-2xl">
            Archivy týmů, hráčů a rozhodčích — ne zápasy týdne, ale profily napříč sezonami.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <HubCard
            to={`/catalog?league=${catalogLeague}&tab=teams`}
            title="Týmy"
            text="Kádr, FDR kalendář, sezonní parametry a radar napříč trenérskými érami."
          />
          <HubCard
            to={`/catalog?league=${catalogLeague}&tab=players`}
            title="Hráči"
            text="Výkony podle obtížnosti soupeře, sazby na 90 minut a srovnání stejné role."
          />
          <HubCard
            to={`/catalog?league=${catalogLeague}&tab=referees`}
            title="Rozhodčí"
            text="Letošní sbor ligy, tendence karet a faulů, filtr na konkrétní tým."
          />
        </div>
      </section>

      <section className="mt-14">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 mb-1">Tarify</p>
        <h2 className="text-2xl font-bold text-white light:text-slate-900 mb-5">Tři úrovně přístupu</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {TIERS.map((tier) => (
            <article
              key={tier.name}
              className={`card p-6 flex flex-col ${
                "featured" in tier && tier.featured ? "ring-2 ring-emerald-400/80" : ""
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">{tier.name}</p>
              <p className="mt-3 text-3xl font-bold text-white light:text-slate-900">{tier.price}</p>
              <p className="text-sm text-slate-500 mt-1">{tier.period}</p>
              <ul className="mt-5 space-y-2 text-sm text-slate-300 light:text-slate-600 flex-1">
                {tier.points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <span className="text-emerald-400 mt-0.5">→</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function HubCard({ to, title, text }: { to: string; title: string; text: string }) {
  return (
    <Link to={to} className="card catalog-tile hp-catalog-tile p-5 block">
      <h3 className="text-lg font-semibold text-white light:text-slate-900">{title}</h3>
      <p className="text-sm text-slate-400 light:text-slate-500 mt-2">{text}</p>
    </Link>
  );
}
