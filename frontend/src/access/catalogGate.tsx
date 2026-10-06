import type { ReactNode } from "react";
import { useAccess } from "./AccessContext";
import { FEATURES, allows, type Tier } from "./tiers";

/* Které záložky profilu jsou zdarma a pro které je potřeba tarif.
   Záložky, které tu nejsou uvedené, patří do placené části podle `catalog.<druh>` v tiers.ts. */

type Kind = "teams" | "players" | "referees";

const FREE_TABS: Record<Kind, string[]> = {
  teams: ["overview", "stats"],
  players: ["overview", "stats"],
  referees: ["overview"],
};

const FEATURE: Record<Kind, "catalog.teams" | "catalog.players" | "catalog.referees"> = {
  teams: "catalog.teams",
  players: "catalog.players",
  referees: "catalog.referees",
};

/** Tarif, který je potřeba pro záložku, nebo null, když je otevřená. */
export function useTabLock(kind: Kind) {
  const { tier } = useAccess();
  const min: Tier = FEATURES[FEATURE[kind]].min;
  const need = (id: string): Tier | null => (FREE_TABS[kind].includes(id) || allows(tier, min) ? null : min);
  /** Přidá ke štítku záložky zámeček. */
  const withLocks = <T extends { id: string; label: ReactNode }>(tabs: readonly T[]) =>
    tabs.map((t) => ({
      ...t,
      label: need(t.id) ? (
        <>
          {t.label} <span aria-label="zamčeno" className="text-[10px] opacity-70">🔒</span>
        </>
      ) : (
        t.label
      ),
    }));
  return { need, withLocks };
}
