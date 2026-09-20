import { Link, useParams } from "react-router-dom";
import { useCatalogPlayer } from "../lib/useData";
import { CatalogNotFound } from "./CatalogNotFound";
import { PlayerSeasonGrid } from "../components/CatalogStats";

export function CatalogPlayerPage() {
  const id = Number(useParams().id);
  const { data: player, error, missing } = useCatalogPlayer(Number.isFinite(id) ? id : null);

  if (missing) return <CatalogNotFound kind="hráč" />;
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
  if (!player) {
    return <p className="max-w-6xl mx-auto py-16 px-4 text-slate-400">Načítám hráče…</p>;
  }

  const season = player.overlay?.season;

  return (
    <div className="max-w-6xl mx-auto py-12 px-4 pt-20">
      <Link to={`/catalog?league=${player.league_id}`} className="text-emerald-400 text-sm">
        ← {player.league_name}
      </Link>
      <header className="card p-6 mt-4 mb-6 flex items-center gap-4">
        {player.image && !player.image.includes("placeholder") ? (
          <img src={player.image} alt="" className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <span className="h-20 w-20 rounded-full bg-slate-800 light:bg-slate-200" />
        )}
        <div>
          <div className="text-xs font-mono text-emerald-400">{player.league_name}</div>
          <h1 className="text-2xl font-bold text-white light:text-slate-900">{player.name}</h1>
          <p className="text-sm text-slate-400 light:text-slate-500 mt-1">
            <Link to={`/catalog/teams/${player.team_id}`} className="hover:text-emerald-400">
              {player.team_name}
            </Link>
            {player.position ? ` · ${player.position}` : ""}
            {player.number != null ? ` · #${player.number}` : ""}
            {player.age != null ? ` · ${player.age} let` : ""}
          </p>
        </div>
      </header>
      <section className="card p-5 mb-6">
        <h2 className="text-lg font-semibold text-white light:text-slate-900 mb-2">Hook</h2>
        <p className="text-sm text-slate-300 light:text-slate-600">{player.hook}</p>
      </section>
      <section className="card p-5 mb-6">
        <h2 className="text-lg font-semibold text-white light:text-slate-900 mb-3">Sezóna</h2>
        <PlayerSeasonGrid season={season} position={player.position} />
      </section>
      {!season && (
        <section className="card p-5 text-sm text-slate-400 light:text-slate-500">
          KPI, FDR impact a explorer hráč vs hráč doplníme z warehouse. Bez čísel neukazujeme cizí profil.
        </section>
      )}
    </div>
  );
}
