import { Link, useParams, useSearchParams } from "react-router-dom";
import { useCatalogReferee } from "../lib/useData";
import { CatalogNotFound } from "./CatalogNotFound";
import { EmptyNote, Metric } from "../components/CatalogStats";
import { formatDate } from "../lib/format";
import type { CatalogRefereeDetail } from "../types";

function primaryLeague(ref: CatalogRefereeDetail) {
  const rows = ref.leagues?.length
    ? ref.leagues
    : [
        {
          id: ref.league_id,
          name: ref.league_name,
          in_league: ref.in_league,
          league_matches: ref.league_matches,
        },
      ];
  return [...rows].sort(
    (a, b) => Number(b.in_league) - Number(a.in_league) || (b.league_matches || 0) - (a.league_matches || 0),
  )[0];
}

export function CatalogRefereePage() {
  const id = Number(useParams().id);
  const [params] = useSearchParams();
  const { data: ref, error, missing } = useCatalogReferee(Number.isFinite(id) ? id : null);

  if (missing) return <CatalogNotFound kind="rozhodčí" />;
  if (error) {
    return (
      <div className="max-w-6xl mx-auto py-12 px-4 text-rose-400">
        <Link to="/catalog" className="text-emerald-400 text-sm">
          ← katalog
        </Link>
        <p className="mt-4">{error}</p>
      </div>
    );
  }
  if (!ref) {
    return <p className="max-w-6xl mx-auto py-16 px-4 text-slate-400">Načítám rozhodčího…</p>;
  }

  const fromQuery = Number(params.get("league"));
  const fromList = (ref.leagues || []).find((l) => l.id === fromQuery);
  const primary = fromList || primaryLeague(ref);
  const overlay = ref.overlay;
  const season = overlay?.season;
  const career = overlay?.career;
  const ctx = overlay?.league_context;
  const recent = overlay?.recent || [];
  const leagueMatches = primary.league_matches ?? 0;
  const hook = season?.matches
    ? `${ref.name} píská v soutěži ${primary.name} jako hlavní. SportMonks mu v této sezóně eviduje ${season.matches} zápasů` +
      (season.yellow_avg != null ? `, ${season.yellow_avg} žlutých na zápas` : "") +
      "."
    : ref.hook;

  return (
    <div className="max-w-6xl mx-auto py-12 px-4 pt-20">
      <Link to={`/catalog?league=${primary.id}`} className="text-emerald-400 text-sm">
        ← {primary.name}
      </Link>
      <header className="card p-6 mt-4 mb-6">
        <div className="text-xs font-mono text-emerald-400">Hlavní rozhodčí</div>
        <h1 className="text-2xl font-bold text-white light:text-slate-900">{ref.name}</h1>
        <p className="text-sm text-slate-400 light:text-slate-500 mt-1">
          {ref.country || "—"}
          {primary.in_league ? ` · v lize ${leagueMatches}× jako hlavní` : " · zatím jen země ligy"}
        </p>
        {(ref.leagues || []).length > 1 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {ref.leagues!.map((l) => (
              <Link
                key={l.id}
                to={`/catalog/referees/${ref.id}?league=${l.id}`}
                className={`badge ${l.id === primary.id ? "bg-emerald-500/20 text-emerald-300 light:text-emerald-700" : "bg-slate-800 text-slate-300 light:bg-slate-200 light:text-slate-600"}`}
              >
                {l.name}
                {l.in_league ? ` · ${l.league_matches}×` : ""}
              </Link>
            ))}
          </div>
        )}
      </header>

      <section className="card p-5 mb-6">
        <h2 className="text-lg font-semibold text-white light:text-slate-900 mb-2">Hook</h2>
        <p className="text-sm text-slate-300 light:text-slate-600">{hook}</p>
      </section>

      <section className="card p-5 mb-6">
        <h2 className="text-lg font-semibold text-white light:text-slate-900 mb-3">Tato sezóna</h2>
        {season && (season.matches || season.yellow_avg != null) ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Metric label="Zápasy" value={season.matches} />
              <Metric
                label="Fauly/zápas"
                value={season.fouls_avg}
                sub={ctx ? `liga ${ctx.fouls_per_match}` : undefined}
              />
              <Metric
                label="Žluté/zápas"
                value={season.yellow_avg}
                sub={ctx ? `liga ${ctx.yellow_per_match}` : undefined}
              />
              <Metric
                label="Červené/zápas"
                value={season.red_avg}
                sub={ctx ? `liga ${ctx.red_per_match}` : undefined}
              />
              <Metric label="Penalty/zápas" value={season.penalties_avg} />
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Sezónní blok rozhodčího je ze SportMonks za celou sezónu, ne jen {primary.name}.
              {ctx ? ` Ligový průměr = ${ctx.matches_sampled} odehraných zápasů soutěže.` : ""}
            </p>
          </>
        ) : (
          <EmptyNote>Pro tuto sezónu ještě nemá rozhodčí spočtený sezónní blok.</EmptyNote>
        )}
      </section>

      <section className="card p-5 mb-6">
        <h2 className="text-lg font-semibold text-white light:text-slate-900 mb-3">Kariéra</h2>
        {career && career.matches ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Sledovaných sezón" value={career.seasons} />
            <Metric label="Zápasy" value={career.matches} />
            <Metric label="Žluté celkem" value={career.yellow} />
            <Metric label="Červené celkem" value={career.red} />
            <Metric label="Žluté/zápas" value={career.yellow_avg} />
          </div>
        ) : (
          <EmptyNote>Kariérní součet SportMonks zatím neposlal.</EmptyNote>
        )}
      </section>

      <section className="card p-5 mb-6">
        <h2 className="text-lg font-semibold text-white light:text-slate-900 mb-3">Zápasy v katalogu</h2>
        {recent.length === 0 ? (
          <EmptyNote>V už stažených zápasech ho jako hlavního ještě nemáme.</EmptyNote>
        ) : (
          <div className="space-y-2">
            {recent.map((m) => {
              const inner = (
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-slate-500 w-24 shrink-0">
                    {m.starting_at ? formatDate(m.starting_at) : "—"}
                  </span>
                  <span className="text-white light:text-slate-900">
                    {m.home} – {m.away}
                  </span>
                </div>
              );
              return m.has_match_page ? (
                <Link
                  key={m.fixture_id}
                  to={`/match/${m.fixture_id}`}
                  className="block rounded-lg px-2 py-2 hover:bg-slate-800/50 light:hover:bg-slate-100"
                >
                  {inner}
                </Link>
              ) : (
                <div key={m.fixture_id} className="px-2 py-2">
                  {inner}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card p-5 text-sm text-slate-400 light:text-slate-500">
        Tachometry (práh bolesti, VAR) a kříž sudí × tým jen ze zápasů, kde je on hlavní. Bez čísel je necháme prázdné.
      </section>
    </div>
  );
}
