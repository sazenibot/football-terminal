import type { ReactNode } from "react";
import { t } from "../i18n/locale";
import { useAccess } from "./AccessContext";
import { LOCK } from "./locks";
import { allows, type Tier } from "./tiers";

/* Minimální tarif záložky profilu. Co v záložce není zdarma celé, zamykají karty přes LOCK. */

type Kind = "teams" | "players" | "referees";

const TAB_MIN: Record<Kind, Record<string, Tier>> = {
  teams: { overview: "anon", stats: LOCK.teamStats, squad: LOCK.teamSquad, radar: LOCK.teamRadar, coaches: LOCK.teamCoaches },
  players: { overview: "anon", stats: LOCK.playerStats, shots: LOCK.playerShots, compare: LOCK.playerCompare, matches: LOCK.playerMatches },
  referees: { overview: "anon", matches: LOCK.refMatches },
};

/** Tarif, který je potřeba pro záložku, nebo null, když je otevřená. */
export function useTabLock(kind: Kind) {
  const { tier } = useAccess();
  const need = (id: string): Tier | null => {
    const min = TAB_MIN[kind][id] ?? "anon";
    return allows(tier, min) ? null : min;
  };
  /** Přidá ke štítku záložky zámeček. */
  const withLocks = <T extends { id: string; label: ReactNode }>(tabs: readonly T[]) =>
    tabs.map((tab) => ({
      ...tab,
      label: need(tab.id) ? (
        <>
          {tab.label}{" "}
          <span aria-label={t("gate.locked")} className="text-xs opacity-70">
            🔒
          </span>
        </>
      ) : (
        tab.label
      ),
    }));
  return { need, withLocks };
}
