import { Link, useParams } from "../i18n/router";
import { XgotBadgeChip } from "../components/XgotBadge";
import { last5BadgeForTeam } from "../lib/xgEfficiency";
import { useDataIndex, useMatch, usePitchH2H, usePitchTeam, useSimV2, useXgotIndex } from "../lib/useData";
import { SimulationV2 } from "../components/SimulationV2";
import { h2hWithXgot, hasPitchData, hasSimV2, radarXgot } from "../lib/pitchMatch";
import { StaleBanner } from "../components/StaleBanner";
import { formatDateTimeLong } from "../lib/format";
import { H2HResults } from "../components/H2HResults";
import { H2HAggregateStats } from "../components/H2HAggregateStats";
import { FormLast6 } from "../components/FormLast6";
import { RadarComparison } from "../components/RadarComparison";
import { TrendsTeamSection, TrendsH2HSection } from "../components/Trends";
import { Simulation } from "../components/Simulation";
import { PlayersCompare } from "../components/PlayersCompare";
import { RefereeSection } from "../components/RefereeAndAbsences";
import { AiAnalysisSection } from "../components/AiAnalysis";
import { TrendmetrCard } from "../components/TrendmetrCard";
import { GoalsVsXgotCard } from "../components/GoalsVsXgotCard";
import { intlTag, t } from "../i18n/locale";

export function MatchPage() {
  const { fixtureId } = useParams();
  const id = Number(fixtureId);
  const { index } = useDataIndex();
  const { match: m, error, missing } = useMatch(Number.isFinite(id) ? id : null);
  const xgotIndex = useXgotIndex();
  const pitchOn = hasPitchData(m?.league_id);
  const homePitch = usePitchTeam(pitchOn && m ? m.home.id : null);
  const awayPitch = usePitchTeam(pitchOn && m ? m.away.id : null);
  const pitchH2H = usePitchH2H(pitchOn);
  const simV2 = useSimV2(hasSimV2(m?.league_id) && Number.isFinite(id) ? id : null);
  const backTo = m?.league_id ? `/league/${m.league_id}` : "/";

  if (error) {
    return (
      <div className="max-w-3xl mx-auto py-10 px-4 text-rose-400">
        <Link to="/" className="text-emerald-400 text-sm">
          {t("mx.match.backTo", { name: t("mx.match.roundList") })}
        </Link>
        <p className="mt-4">{t("mx.match.error", { error })}</p>
      </div>
    );
  }

  if (missing) {
    return (
      <div className="max-w-3xl mx-auto py-10 px-4">
        <Link to="/" className="text-emerald-400 text-sm">
          {t("mx.match.backTo", { name: t("mx.match.roundList") })}
        </Link>
        <div className="card p-8 mt-6 text-center">
          <p className="text-slate-300 light:text-slate-600">{t("mx.match.missing")}</p>
        </div>
      </div>
    );
  }

  if (!m) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 light:text-slate-500">
        {t("future.loading")}
      </div>
    );
  }

  const generatedAt = m.refreshed_at || m.built_at;
  const homeBadge = last5BadgeForTeam(xgotIndex, m.home.id);
  const awayBadge = last5BadgeForTeam(xgotIndex, m.away.id);
  const pitchReady = pitchOn && !!homePitch && !!awayPitch && (!m.league_id || homePitch.league_id === m.league_id);
  const h2hMap = pitchReady ? pitchH2H?.matches ?? null : null;
  const h2h = pitchReady ? h2hWithXgot(m, h2hMap) : m.h2h;
  const radarX = pitchReady && homePitch && awayPitch ? radarXgot(m, homePitch, awayPitch, h2hMap) : undefined;

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 pt-20">
      <Link to={backTo} className="text-emerald-400 text-sm">
        {t("mx.match.backTo", { name: m.league_name || t("mx.match.roundList") })}
      </Link>

      <div className="mt-4">
        <StaleBanner generatedAt={index?.generated_at ?? generatedAt} hours={index?.stale_after_hours ?? 26} />
      </div>

      <header className="card p-6 my-6 text-center">
        <div className="text-xs text-slate-500 light:text-slate-500 mb-2">
          {m.league_name ? `${m.league_name} · ` : ""}
          {formatDateTimeLong(m.starting_at)} · {m.venue}
        </div>
        <div className="flex items-start justify-center gap-5 text-xl font-bold text-white light:text-slate-900">
          <span className="flex flex-col items-end gap-1.5 min-w-0">
            <span className="flex items-center gap-2.5 min-w-0">
              {m.home.image && (
                <img src={m.home.image} alt="" className="h-10 w-10 object-contain shrink-0" />
              )}
              <span className="truncate">{m.home.name}</span>
            </span>
            {homeBadge ? <XgotBadgeChip badge={homeBadge} /> : null}
          </span>
          <span className="text-slate-500 text-base font-normal shrink-0 mt-2">vs</span>
          <span className="flex flex-col items-start gap-1.5 min-w-0">
            <span className="flex items-center gap-2.5 min-w-0">
              {m.away.image && (
                <img src={m.away.image} alt="" className="h-10 w-10 object-contain shrink-0" />
              )}
              <span className="truncate">{m.away.name}</span>
            </span>
            {awayBadge ? <XgotBadgeChip badge={awayBadge} /> : null}
          </span>
        </div>
      </header>

      <H2HResults h2h={m.h2h} home={m.home} totalAvailable={m.h2h_total_available} />
      <H2HAggregateStats h2h={h2h} home={m.home} away={m.away} withXgot={pitchReady} />
      <FormLast6 home={m.home} away={m.away} formHome={m.form.home} formAway={m.form.away} />
      <RadarComparison data={m.radar} home={m.home} away={m.away} xgot={radarX} />
      <TrendsTeamSection
        homeName={m.home.name}
        awayName={m.away.name}
        home={m.trends.team_last5.home}
        away={m.trends.team_last5.away}
      />
      <TrendsH2HSection
        h2h={m.h2h}
        home={m.home}
        away={m.away}
        last3={m.trends.h2h.last3}
        last5={m.trends.h2h.last5}
      />
      <TrendmetrCard match={m} />
      {pitchReady && <GoalsVsXgotCard match={m} homeFile={homePitch} awayFile={awayPitch} />}
      {simV2 ? (
        <SimulationV2 sim={simV2} home={m.home} away={m.away} />
      ) : (
        <Simulation sim={m.simulation} home={m.home} away={m.away} />
      )}
      <PlayersCompare
        home={m.home}
        away={m.away}
        playersHome={m.players.home ?? []}
        playersAway={m.players.away ?? []}
      />
      <RefereeSection referee={m.referee} home={m.home} away={m.away} />
      <AiAnalysisSection analysis={m.ai_analysis} />

      <footer className="text-xs text-slate-600 text-center py-6">
        {generatedAt ? t("mx.match.updated", { when: new Date(generatedAt).toLocaleString(intlTag()) }) : ""}
      </footer>
    </div>
  );
}
