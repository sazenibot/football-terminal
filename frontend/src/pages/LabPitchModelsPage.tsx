import { Link } from "react-router-dom";

export function LabPitchModelsPage() {
  return (
    <div className="max-w-4xl mx-auto py-16 px-4 pt-20">
      <Link to="/lab" className="text-amber-400 text-sm w-fit">
        ← Lab
      </Link>
      <div className="card p-6 mt-6">
        <div className="text-xs font-mono text-amber-400 mb-2">PŘESUNUTO</div>
        <h1 className="text-3xl font-bold text-white light:text-slate-900 mt-1">APIPitch modely</h1>
        <p className="text-sm text-slate-400 light:text-slate-500 mt-3 max-w-xl">
          Trend střelby a shotmapa týmu jsou v katalogu klubu. Karta brankáře a shotmapa hráče u příslušných
          profilů. Zatím jen Chance Liga, data z PitchAPI.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Link to="/catalog/teams/216" className="text-sm text-emerald-400 hover:underline w-fit">
            Slavia Praha →
          </Link>
          <Link to="/catalog/players/9939100" className="text-sm text-emerald-400 hover:underline w-fit">
            Jakub Markovič →
          </Link>
          <Link to="/catalog/players/80707" className="text-sm text-emerald-400 hover:underline w-fit">
            Tomáš Chorý →
          </Link>
        </div>
      </div>
    </div>
  );
}
