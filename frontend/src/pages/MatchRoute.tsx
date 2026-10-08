import { useEffect, type ReactNode } from "react";
import { Navigate, useParams, useSearchParams } from "../i18n/router";
import { useAccess } from "../access/AccessContext";
import { Paywall } from "../access/Gate";
import { Back, Frame } from "../cat/kit";
import { t } from "../i18n/locale";
import type { MatchData } from "../types";
import { isLiveLeague } from "../lib/pitchMatch";
import { useDataIndex, useMatch } from "../lib/useData";
import { MatchCenterPage } from "./MatchCenterPage";
import { MatchPage } from "./MatchPage";
import { fmtDayLong, fmtTime } from "../lib/format";
import { ProbBar } from "../mc2/kit";

/**
 * Nový Match Center dostávají všechny zapnuté ligy. Chance Liga má navíc nový model a PitchAPI,
 * ostatní ligy mají predikci ze SportMonks simulace. `?classic=1` otevře původní detail i pro Chance Ligu.
 */
export function MatchRoute() {
  const { fixtureId } = useParams();
  const [params] = useSearchParams();
  const id = Number(fixtureId);
  const { match, error, missing } = useMatch(Number.isFinite(id) ? id : null);
  const { index, error: indexError } = useDataIndex();

  if (params.get("classic") === "1") return <MatchPage />;
  if (error || missing) return <MatchPage />;
  if (!match || (!index && !indexError)) return <div className="flex min-h-[60vh] items-center justify-center text-slate-400 light:text-slate-500">{t("future.loading")}</div>;
  const page = isLiveLeague(index?.leagues, match.league_id) ? <MatchCenterPage /> : <MatchPage />;
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
              {t("future.banner")}
            </p>
          </div>
        )}
      </>
    );
  }

  const usedUp = tier === "account";
  return (
    <Frame>
      <Back to={`/league/${match.league_id ?? ""}`}>{t("future.back")}</Back>
      <div className="mt-4 rounded-2xl border border-(--c-line) bg-(--c-surface) px-5 py-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--c-accent)">{t("future.eyebrow")}</p>
        <h1 className="mt-2 text-2xl font-bold">
          {match.home.name} – {match.away.name}
        </h1>
        <p className="mt-1 text-sm text-(--c-muted)">
          {fmtDayLong(match.starting_at) + " " + fmtTime(match.starting_at)}
        </p>
      </div>
      {/* Ukázka bez skutečných dat: jen rozmazaná kostra, aby bylo vidět, co se odemkne. */}
      <div aria-hidden className="pointer-events-none mt-4 select-none rounded-2xl border border-(--c-line) bg-(--c-surface) p-5 blur-[6px]">
        <div className="grid grid-cols-3 text-center text-3xl font-bold tabular-nums">
          <span style={{ color: "var(--c-home)" }}>45 %</span>
          <span style={{ color: "var(--c-muted)" }}>27 %</span>
          <span style={{ color: "var(--c-away)" }}>28 %</span>
        </div>
        <div className="mt-3">
          <ProbBar home={45} draw={27} away={28} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl bg-(--c-raised) px-2 py-4 text-lg font-bold">
              1,5 : 1,2
            </div>
          ))}
        </div>
      </div>
      <ul className="mx-auto mt-4 max-w-md space-y-1.5 text-[13px] text-(--c-muted)">
        {(["future.unlock.1", "future.unlock.2", "future.unlock.3"] as const).map((k) => (
          <li key={k} className="flex gap-2">
            <span className="text-(--c-accent)">✓</span>
            <span>{t(k)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <Paywall
          need={usedUp ? "unlimited" : "account"}
          title={usedUp ? t("future.usedTitle") : t("future.accountTitle")}
          text={usedUp ? t("future.usedText") : t("future.accountText")}
        />
      </div>
    </Frame>
  );
}

export function MatchCenterLabRedirect() {
  const { fixtureId } = useParams();
  return <Navigate to={fixtureId ? `/match/${fixtureId}` : "/league/262"} replace />;
}
