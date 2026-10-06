import { useEffect, type ReactNode } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { useAccess } from "../access/AccessContext";
import { Paywall } from "../access/Gate";
import { Back, Frame } from "../cat/kit";
import type { MatchData } from "../types";
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
  const page = hasPitchData(match.league_id) ? <MatchCenterPage /> : <MatchPage />;
  return <FutureGuard match={match}>{page}</FutureGuard>;
}

/** Odehrané zápasy jsou otevřené všem. Budoucí: účet dostane jeden, Unlimited všechny. */
function FutureGuard({ match, children }: { match: MatchData; children: ReactNode }) {
  const { tier, freeFixture, claimFreeFixture } = useAccess();
  const future = new Date(match.starting_at).getTime() > Date.now();
  const id = match.fixture_id;
  const full = tier === "unlimited" || tier === "pro";
  const freeSlotOpen = tier === "account" && freeFixture === null;
  const mine = tier === "account" && freeFixture === id;

  useEffect(() => {
    if (future && freeSlotOpen) claimFreeFixture(id);
  }, [future, freeSlotOpen, id, claimFreeFixture]);

  if (!future || full || freeSlotOpen || mine) {
    return (
      <>
        {children}
        {future && (freeSlotOpen || mine) && (
          <div className="mc2 pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3">
            <p className="pointer-events-auto rounded-full border border-(--c-line) bg-(--c-surface) px-4 py-1.5 text-xs text-(--c-muted) shadow-lg">
              Tohle je váš jeden bezplatný budoucí zápas. Další se zamknou, odemkne je Unlimited.
            </p>
          </div>
        )}
      </>
    );
  }

  const usedUp = tier === "account";
  return (
    <Frame>
      <Back to={`/league/${match.league_id ?? ""}`}>Zpět na zápasy</Back>
      <div className="mt-4 rounded-2xl border border-(--c-line) bg-(--c-surface) px-5 py-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--c-accent)">Budoucí zápas</p>
        <h1 className="mt-2 text-2xl font-bold">
          {match.home.name} – {match.away.name}
        </h1>
        <p className="mt-1 text-sm text-(--c-muted)">
          {new Date(match.starting_at).toLocaleString("cs-CZ", { weekday: "long", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      <div className="mt-4">
        <Paywall
          need={usedUp ? "unlimited" : "account"}
          title={usedUp ? "Svůj bezplatný budoucí zápas jste už využili" : "Rozbor budoucího zápasu je pro registrované"}
          text={
            usedUp
              ? "Všechny budoucí zápasy s rozborem, simulací a kurzy odemkne tarif Unlimited. Odehrané zápasy jsou otevřené pořád."
              : "Po bezplatné registraci si můžete otevřít jeden budoucí zápas. Všechny odemkne tarif Unlimited. Odehrané zápasy jsou otevřené pořád."
          }
        />
      </div>
    </Frame>
  );
}

export function MatchCenterLabRedirect() {
  const { fixtureId } = useParams();
  return <Navigate to={fixtureId ? `/match/${fixtureId}` : "/league/262"} replace />;
}
