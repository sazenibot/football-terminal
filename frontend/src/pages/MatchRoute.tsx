import { Navigate, useParams, useSearchParams } from "../i18n/router";
import { t } from "../i18n/locale";
import { isLiveLeague } from "../lib/pitchMatch";
import { useDataIndex, useMatch } from "../lib/useData";
import { MatchCenterPage } from "./MatchCenterPage";
import { MatchPage } from "./MatchPage";

/**
 * Nový Match Center dostávají všechny zapnuté ligy. Chance Liga má navíc nový model a PitchAPI,
 * ostatní ligy mají predikci ze SportMonks simulace. `?classic=1` otevře původní detail i pro Chance Ligu.
 * Detail a záložka Přehled jsou zdarma; zámky jsou až u konkrétních karet a dalších záložek.
 */
export function MatchRoute() {
  const { fixtureId } = useParams();
  const [params] = useSearchParams();
  const id = Number(fixtureId);
  const { match, error, missing } = useMatch(Number.isFinite(id) ? id : null);
  const { index, error: indexError } = useDataIndex();

  if (error || missing) return <MatchPage />;
  if (!match || (!index && !indexError)) return <div className="flex min-h-[60vh] items-center justify-center text-slate-400 light:text-slate-500">{t("future.loading")}</div>;
  if (params.get("classic") === "1" || !isLiveLeague(index?.leagues, match.league_id)) return <MatchPage />;
  return <MatchCenterPage />;
}

export function MatchCenterLabRedirect() {
  const { fixtureId } = useParams();
  return <Navigate to={fixtureId ? `/match/${fixtureId}` : "/league/262"} replace />;
}
