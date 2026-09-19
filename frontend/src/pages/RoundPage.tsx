import { Link } from "react-router-dom";
import type { AppData } from "../types";
import { formatDateTime } from "../lib/format";

export function RoundPage({ data }: { data: AppData }) {
  const fullDataIds = new Set(data.matches.map((m) => m.fixture_id));
  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <header className="mb-8">
        <div className="text-emerald-400 text-sm font-mono mb-1">FOOTBALL TERMINAL</div>
        <h1 className="text-2xl font-bold text-white light:text-slate-900">{data.league.name} — nejbližší kolo</h1>
      </header>
      <div className="space-y-2">
        {data.round.map((fx) => {
          const hasFullData = fullDataIds.has(fx.fixture_id);
          return (
            <Link
              key={fx.fixture_id}
              to={`/match/${fx.fixture_id}`}
              className={`card flex items-center justify-between px-4 py-3 hover:border-emerald-500 transition-colors ${
                hasFullData ? "border-emerald-500/60" : ""
              }`}
            >
              <div className="text-sm text-slate-400 light:text-slate-500 w-32">{formatDateTime(fx.starting_at)}</div>
              <div className="flex-1 text-right pr-4 text-slate-100 light:text-slate-800">{fx.home.name}</div>
              <div className="text-slate-500 px-2">vs</div>
              <div className="flex-1 pl-4 text-slate-100 light:text-slate-800">{fx.away.name}</div>
              {hasFullData && (
                <span className="badge bg-emerald-500 text-black ml-3">plná data</span>
              )}
            </Link>
          );
        })}
      </div>
      <p className="text-xs text-slate-500 light:text-slate-400 mt-6">
        Prototyp: plnou analytickou stránku detailu zápasu má zatím jen zvýrazněné zápasy
        (data reálně stažená ze SportMonks). Ostatní zápasy v kole ukazují jen navigaci.
      </p>
    </div>
  );
}
