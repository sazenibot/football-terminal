import { Link } from "react-router-dom";
import { useDataIndex, useLeagueRound } from "../lib/useData";
import { LeagueSwitcher, rememberLeague } from "../components/LeagueSwitcher";
import { StaleBanner } from "../components/StaleBanner";
import { formatDateTime } from "../lib/format";
import { useEffect } from "react";

export function RoundPage({ leagueId }: { leagueId: number }) {
  const { index, error: indexError } = useDataIndex();
  const { data, error } = useLeagueRound(leagueId);

  useEffect(() => {
    if (leagueId) rememberLeague(leagueId);
  }, [leagueId]);

  if (indexError) {
    return (
      <div className="min-h-screen flex items-center justify-center text-rose-400">
        Chyba při načítání katalogu: {indexError}
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto py-10 px-4 pt-20">
        {index && <LeagueSwitcher index={index} activeId={leagueId} />}
        <div className="card p-8 text-center text-slate-300 light:text-slate-600">
          Pro tuhle ligu ještě nejsou denní data. Objeví se po dalším běhu ingestu.
        </div>
      </div>
    );
  }

  if (!index || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 light:text-slate-500">
        Načítám kolo…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 pt-20">
      <header className="mb-4 pt-8">
        <div className="text-emerald-400 text-sm font-mono mb-1">MATCH CENTER</div>
        <h1 className="text-2xl font-bold text-white light:text-slate-900">Match Center</h1>
        <p className="text-sm text-slate-500 light:text-slate-400 mt-1">
          Zápasy na {index.window_days} dní dopředu · Match detail po kliknutí
        </p>
      </header>
      <LeagueSwitcher index={index} activeId={leagueId} />
      <StaleBanner generatedAt={data.generated_at} hours={index.stale_after_hours} />
      {data.round.length === 0 ? (
        <div className="card p-8 text-center text-slate-400 light:text-slate-500">
          V následujících {index.window_days} dnech v {data.league.name} nic nehraje.
        </div>
      ) : (
        <div className="space-y-2">
          {data.round.map((fx) => {
            const hasFullData = fx.has_full_data !== false;
            return (
              <Link
                key={fx.fixture_id}
                to={`/match/${fx.fixture_id}`}
                className={`card flex items-center gap-3 px-4 py-3 hover:border-emerald-500 transition-colors ${
                  hasFullData ? "border-emerald-500/60" : "opacity-80"
                }`}
              >
                <div className="text-xs text-slate-400 light:text-slate-500 w-28 shrink-0">
                  {formatDateTime(fx.starting_at)}
                </div>
                <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
                  <span className="truncate text-slate-100 light:text-slate-800">{fx.home.name}</span>
                  {fx.home.image && (
                    <img src={fx.home.image} alt="" className="h-6 w-6 object-contain shrink-0" />
                  )}
                </div>
                <div className="text-slate-500 text-xs px-1 shrink-0">vs</div>
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  {fx.away.image && (
                    <img src={fx.away.image} alt="" className="h-6 w-6 object-contain shrink-0" />
                  )}
                  <span className="truncate text-slate-100 light:text-slate-800">{fx.away.name}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <p className="text-xs text-slate-500 light:text-slate-400 mt-6">
        Data ze SportMonks se stahují jednou denně na pozadí. Prohlížeč čte jen naše JSON soubory.
      </p>
    </div>
  );
}
