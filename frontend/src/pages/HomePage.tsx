import { Link } from "react-router-dom";
import { lastLeagueId } from "../components/LeagueSwitcher";
import { useDataIndex } from "../lib/useData";

export function HomePage() {
  const { index } = useDataIndex();
  const defaultId = index?.default_league_id ?? 262;
  const saved = lastLeagueId();
  const centerTo = `/league/${saved && Number.isFinite(saved) ? saved : defaultId}`;

  return (
    <div className="max-w-6xl mx-auto py-16 px-4 pt-20">
      <header className="mb-10">
        <div className="text-emerald-400 text-sm font-mono mb-1">FOOTBALL TERMINAL</div>
        <h1 className="text-3xl font-bold text-white light:text-slate-900">Football Terminal</h1>
        <p className="text-slate-400 light:text-slate-500 mt-2 max-w-xl">
          Fotbalová analytika v jednom místě. Prohlížeč nikdy nevolá placené API — čte jen naše stažená data.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          to={centerTo}
          className="card catalog-tile p-6 block hover:border-emerald-500"
        >
          <div className="text-xs font-mono text-emerald-400 mb-2">MATCH CENTER</div>
          <h2 className="text-xl font-semibold text-white light:text-slate-900">Match Center</h2>
          <p className="text-sm text-slate-400 light:text-slate-500 mt-2">
            Výpis zápasů na 7 dní dopředu a jejich Match detail — forma, trendy, simulace, kurzy z Chance.
          </p>
        </Link>
        <Link to="/catalog" className="card catalog-tile p-6 block hover:border-emerald-500">
          <div className="text-xs font-mono text-emerald-400 mb-2">KATALOG</div>
          <h2 className="text-xl font-semibold text-white light:text-slate-900">Datový katalog</h2>
          <p className="text-sm text-slate-400 light:text-slate-500 mt-2">
            Encyklopedie ligy: týmy, hráči a hlavní rozhodčí. Ne sázkový feed.
          </p>
        </Link>
      </div>
    </div>
  );
}
