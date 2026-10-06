import { Link } from "react-router-dom";

export function LabPage() {
  return (
    <div className="max-w-6xl mx-auto py-16 px-4 pt-20">
      <header className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-400">Sandbox</p>
        <h1 className="text-3xl font-bold text-white light:text-slate-900 mt-1">Lab</h1>
        <p className="text-sm text-slate-400 light:text-slate-500 mt-2 max-w-xl">
          Vedlejší prvky na datech Chance Ligy. Rozhodneme, co půjde dál a co zahodíme.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 max-w-5xl">
        <div className="card p-6">
          <div className="text-xs font-mono text-amber-400 mb-2">PŘESUNUTO</div>
          <h2 className="text-xl font-semibold text-white light:text-slate-900">Góly proti xGOT a Simulace 10 000</h2>
          <p className="text-sm text-slate-400 light:text-slate-500 mt-2">
            Karty, xGOT v radaru a H2H i nová simulace (síla soupeřů, střely, střely na branku) jsou v detailu zápasu Chance
            Ligy v Match Center.
          </p>
          <Link to="/league/262" className="inline-block mt-4 text-sm text-emerald-400 hover:underline">
            Otevřít Match Center →
          </Link>
        </div>
        <div className="card p-6">
          <div className="text-xs font-mono text-amber-400 mb-2">PŘESUNUTO</div>
          <h2 className="text-xl font-semibold text-white light:text-slate-900">Trendmetr</h2>
          <p className="text-sm text-slate-400 light:text-slate-500 mt-2">
            Karta je v detailu zápasu v Match Center. Linie se počítají z historie týmů.
          </p>
          <Link to="/league/262" className="inline-block mt-4 text-sm text-emerald-400 hover:underline">
            Otevřít Match Center →
          </Link>
        </div>
        <Link to="/lab/xdata" className="card catalog-tile p-6 block hover:border-amber-400">
          <div className="text-xs font-mono text-amber-400 mb-2">PRVEK 02</div>
          <h2 className="text-xl font-semibold text-white light:text-slate-900">xData</h2>
          <p className="text-sm text-slate-400 light:text-slate-500 mt-2">
            Slavia–Plzeň jen z PitchAPI: střely, xG, xGOT, heatmapa a pokročilé metriky.
          </p>
        </Link>
        <div className="card p-6">
          <div className="text-xs font-mono text-amber-400 mb-2">PŘESUNUTO</div>
          <h2 className="text-xl font-semibold text-white light:text-slate-900">APIPitch modely</h2>
          <p className="text-sm text-slate-400 light:text-slate-500 mt-2">
            Karty jsou v katalogu týmu a hráče. Chance Liga, data z PitchAPI.
          </p>
          <Link to="/catalog/teams/216" className="inline-block mt-4 text-sm text-emerald-400 hover:underline">
            Otevřít katalog Slavia →
          </Link>
        </div>
        <Link to="/lab/api/pitch" className="card catalog-tile p-6 block hover:border-amber-400">
          <div className="text-xs font-mono text-amber-400 mb-2">TEST</div>
          <h2 className="text-xl font-semibold text-white light:text-slate-900">PitchAPI</h2>
          <p className="text-sm text-slate-400 light:text-slate-500 mt-2">
            Sparta–Slavia 0:3. Střely, xG a xGOT proti TheStatsAPI.
          </p>
        </Link>
      </div>
    </div>
  );
}
