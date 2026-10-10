import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEV_TOOLS } from "../lib/flags";
import { FEATURES, allows, type Feature, type Tier } from "./tiers";
import { claimPick, fetchMe, logout as apiLogout, type Session } from "./api";

/* Produkce: tarif z /api/me (cookie). Ve vývoji může ViewAs přebít session.
   Jeden budoucí zápas je u přihlášeného v D1, jinak (DEV náhled) v localStorage. */

const KEY = "ft.viewAs";
const FREE_KEY = "ft.freeFixture";

type Ctx = {
  ready: boolean;
  session: Session | null;
  tier: Tier;
  viewAs: Tier | null;
  setTier: (t: Tier | null) => void;
  can: (f: Feature) => boolean;
  freeFixture: number | null;
  claimFreeFixture: (id: number) => void;
  resetFreeFixture: () => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AccessCtx = createContext<Ctx | null>(null);

function readViewAs(): Tier | null {
  if (!DEV_TOOLS) return null;
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
  return v === "anon" || v === "account" || v === "unlimited" || v === "pro" ? v : null;
}

function readFree(): number | null {
  const v = typeof localStorage !== "undefined" ? Number(localStorage.getItem(FREE_KEY)) : 0;
  return v > 0 ? v : null;
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [viewAs, setViewAs] = useState<Tier | null>(readViewAs);
  const [localFree, setLocalFree] = useState<number | null>(readFree);

  const refresh = useCallback(async () => {
    try {
      setSession(await fetchMe());
    } catch {
      setSession(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setTier = useCallback((t: Tier | null) => {
    if (t == null) {
      localStorage.removeItem(KEY);
      setViewAs(null);
      return;
    }
    localStorage.setItem(KEY, t);
    setViewAs(t);
  }, []);

  const claimFreeFixture = useCallback(
    (id: number) => {
      if (session) {
        setSession((s) => (s ? { ...s, free_fixture: s.free_fixture ?? id } : s));
        void claimPick(id).catch(() => undefined);
        return;
      }
      localStorage.setItem(FREE_KEY, String(id));
      setLocalFree(id);
    },
    [session],
  );

  const resetFreeFixture = useCallback(() => {
    localStorage.removeItem(FREE_KEY);
    setLocalFree(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      /* cookie stejně zahodíme dalším /api/me */
    }
    setSession(null);
  }, []);

  const sessionTier: Tier = session?.tier ?? "anon";
  const tier: Tier = DEV_TOOLS && viewAs ? viewAs : sessionTier;
  const freeFixture = session ? session.free_fixture : localFree;

  const value = useMemo<Ctx>(
    () => ({
      ready,
      session,
      tier,
      viewAs,
      setTier,
      can: (f) => allows(tier, FEATURES[f].min),
      freeFixture,
      claimFreeFixture,
      resetFreeFixture,
      refresh,
      logout,
    }),
    [ready, session, tier, viewAs, setTier, freeFixture, claimFreeFixture, resetFreeFixture, refresh, logout],
  );
  return <AccessCtx.Provider value={value}>{children}</AccessCtx.Provider>;
}

export function useAccess(): Ctx {
  const ctx = useContext(AccessCtx);
  if (!ctx) throw new Error("useAccess musí být uvnitř AccessProvider");
  return ctx;
}
