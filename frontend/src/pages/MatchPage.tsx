import { Link, useParams } from "react-router-dom";
import { useDataIndex, useMatch } from "../lib/useData";
import { StaleBanner } from "../components/StaleBanner";
import { formatDateTimeLong } from "../lib/format";
import { H2HResults } from "../components/H2HResults";
import { H2HAggregateStats } from "../components/H2HAggregateStats";
import { FormLast6 } from "../components/FormLast6";
import { RadarComparison } from "../components/RadarComparison";
import { TrendsTeamSection, TrendsH2HSection } from "../components/Trends";
import { Simulation } from "../components/Simulation";
import { PlayersCompare } from "../components/PlayersCompare";
import { RefereeSection, SidelinedSection } from "../components/RefereeAndAbsences";

export function MatchPage() {
  const { fixtureId } = useParams();
  const id = Number(fixtureId);
  const { index } = useDataIndex();
  const { match: m, error, missing } = useMatch(Number.isFinite(id) ? id : null);
  const backTo = m?.league_id ? `/league/${m.league_id}` : "/";

  if (error) {
    return (
      <div className="max-w-3xl mx-auto py-10 px-4 text-rose-400">
        <Link to="/" className="text-emerald-400 text-sm">
          ← zpět na výpis kola
        </Link>
        <p className="mt-4">Chyba při načítání zápasu: {error}</p>
      </div>
    );
  }

  if (missing) {
    return (
      <div className="max-w-3xl mx-auto py-10 px-4">
        <Link to="/" className="text-emerald-400 text-sm">
          ← zpět na výpis kola
        </Link>
        <div className="card p-8 mt-6 text-center">
          <p className="text-slate-300 light:text-slate-600">
            Pro tento zápas ještě nejsou stažená detailní data. Objeví se po dalším denním běhu.
          </p>
        </div>
      </div>
    );
  }

  if (!m) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 light:text-slate-500">
        Načítám zápas…
      </div>
    );
  }

  const generatedAt = m.refreshed_at || m.built_at;

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <Link to={backTo} className="text-emerald-400 text-sm">
        ← zpět na {m.league_name || "výpis kola"}
      </Link>

      <div className="mt-4">
        <StaleBanner generatedAt={generatedAt} hours={index?.stale_after_hours ?? 26} />
      </div>

      <header className="card p-6 my-6 text-center">
        <div className="text-xs text-slate-500 light:text-slate-500 mb-2">
          {m.league_name ? `${m.league_name} · ` : ""}
          {formatDateTimeLong(m.starting_at)} · {m.venue}
        </div>
        <div className="flex items-center justify-center gap-6 text-xl font-bold text-white light:text-slate-900">
          <span>{m.home.name}</span>
          <span className="text-slate-500 text-base font-normal">vs</span>
          <span>{m.away.name}</span>
        </div>
      </header>

      <H2HResults h2h={m.h2h} home={m.home} totalAvailable={m.h2h_total_available} />
      <H2HAggregateStats h2h={m.h2h} home={m.home} away={m.away} />
      <FormLast6 home={m.home} away={m.away} formHome={m.form.home} formAway={m.form.away} />
      <RadarComparison data={m.radar} home={m.home} away={m.away} />
      <TrendsTeamSection
        homeName={m.home.name}
        awayName={m.away.name}
        home={m.trends.team_last5.home}
        away={m.trends.team_last5.away}
      />
      <TrendsH2HSection last3={m.trends.h2h.last3} last5={m.trends.h2h.last5} />
      <Simulation sim={m.simulation} home={m.home} away={m.away} />
      <PlayersCompare
        home={m.home}
        away={m.away}
        playersHome={m.players.home ?? []}
        playersAway={m.players.away ?? []}
      />
      <RefereeSection referee={m.referee} home={m.home} away={m.away} />
      <SidelinedSection home={m.home} away={m.away} sidelined={m.sidelined} />

      <footer className="text-xs text-slate-600 text-center py-6">
        Data: SportMonks
        {generatedAt ? ` · aktualizováno ${new Date(generatedAt).toLocaleString("cs-CZ")}` : ""}
        {m.build_mode ? ` · ${m.build_mode === "full" ? "plný build" : "denní refresh"}` : ""}
      </footer>
    </div>
  );
}
