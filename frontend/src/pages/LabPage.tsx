import { Link } from "react-router-dom";

export function LabPage() {
  return (
    <div className="max-w-6xl mx-auto py-16 px-4 pt-20">
      <header className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-400">Sandbox</p>
        <h1 className="text-3xl font-bold text-white light:text-slate-900 mt-1">Lab</h1>
        <p className="text-sm text-slate-400 light:text-slate-500 mt-2 max-w-xl">
          Vedlejší prvky na datech Chance Ligy. Rozhodneme, co půjde dál a co zahodíme. Není to Match Center.
        </p>
      </header>

      <Link
        to="/lab/trendmetr"
        className="card catalog-tile p-6 block hover:border-amber-400 max-w-xl"
      >
        <div className="text-xs font-mono text-amber-400 mb-2">PRVEK 01</div>
        <h2 className="text-xl font-semibold text-white light:text-slate-900">Trendmetr</h2>
        <p className="text-sm text-slate-400 light:text-slate-500 mt-2">
          Karta do detailu zápasu: Slavia – Plzeň, 70 % A i B jako over nohy do builderu.
        </p>
      </Link>
    </div>
  );
}
