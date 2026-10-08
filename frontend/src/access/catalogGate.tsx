import type { ReactNode } from "react";
import { t } from "../i18n/locale";
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
    tabs.map((tab) => ({
      ...tab,
      label: need(tab.id) ? (
        <>
          {tab.label} <span aria-label={t("gate.locked")} className="text-xs opacity-70">🔒</span>
        </>
      ) : (
        tab.label
      ),
    }));
  return { need, withLocks };
}
