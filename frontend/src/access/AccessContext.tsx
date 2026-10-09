import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { DEV_TOOLS } from "../lib/flags";
import { FEATURES, allows, type Feature, type Tier } from "./tiers";

/* Bez přihlášení: na produkci je každý host (anon). Přepínač „Zobrazit jako“ a localStorage
   platí jen ve vývoji. Až bude účet, nahradí se zdroj `tier`, zbytek aplikace zůstane stejný. */

const KEY = "ft.viewAs";
const FREE_KEY = "ft.freeFixture";

type Ctx = {
  tier: Tier;
  setTier: (t: Tier) => void;
  can: (f: Feature) => boolean;
  /** Zápas, který účet bez předplatného otevřel jako svůj jeden budoucí. */
  freeFixture: number | null;
  claimFreeFixture: (id: number) => void;
  resetFreeFixture: () => void;
};

const AccessCtx = createContext<Ctx | null>(null);

function readTier(): Tier {
  if (!DEV_TOOLS) return "anon";
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
  return v === "anon" || v === "account" || v === "unlimited" || v === "pro" ? v : "unlimited";
}

function readFree(): number | null {
  const v = typeof localStorage !== "undefined" ? Number(localStorage.getItem(FREE_KEY)) : 0;
  return v > 0 ? v : null;
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const [tier, setTierState] = useState<Tier>(readTier);
  const [freeFixture, setFree] = useState<number | null>(readFree);

  const setTier = useCallback((t: Tier) => {
    localStorage.setItem(KEY, t);
    setTierState(t);
  }, []);
  const claimFreeFixture = useCallback((id: number) => {
    localStorage.setItem(FREE_KEY, String(id));
    setFree(id);
  }, []);
  const resetFreeFixture = useCallback(() => {
    localStorage.removeItem(FREE_KEY);
    setFree(null);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ tier, setTier, can: (f) => allows(tier, FEATURES[f].min), freeFixture, claimFreeFixture, resetFreeFixture }),
    [tier, setTier, freeFixture, claimFreeFixture, resetFreeFixture],
  );
  return <AccessCtx.Provider value={value}>{children}</AccessCtx.Provider>;
}

export function useAccess(): Ctx {
  const ctx = useContext(AccessCtx);
  if (!ctx) throw new Error("useAccess musí být uvnitř AccessProvider");
  return ctx;
}
