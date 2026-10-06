import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { hasPitchData } from "../lib/pitchMatch";
import { useMatch } from "../lib/useData";
import { MatchCenterPage } from "./MatchCenterPage";
import { MatchPage } from "./MatchPage";

/**
 * Nový Match Center dostávají ligy, pro které máme nový model a PitchAPI (zatím Chance Liga).
 * Ostatní ligy zůstávají na původním detailu. `?classic=1` otevře původní detail i pro Chance Ligu.
 */
export function MatchRoute() {
  const { fixtureId } = useParams();
  const [params] = useSearchParams();
  const id = Number(fixtureId);
  const { match, error, missing } = useMatch(Number.isFinite(id) ? id : null);

  if (params.get("classic") === "1") return <MatchPage />;
  if (error || missing) return <MatchPage />;
  if (!match) return <div className="flex min-h-[60vh] items-center justify-center text-slate-400">Načítám zápas…</div>;
  return hasPitchData(match.league_id) ? <MatchCenterPage /> : <MatchPage />;
}

export function MatchCenterLabRedirect() {
  const { fixtureId } = useParams();
  return <Navigate to={fixtureId ? `/match/${fixtureId}` : "/league/262"} replace />;
}
