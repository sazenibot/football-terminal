import { useCallback, useEffect, useState } from "react";

/** Volba uživatele: Auto = podle systému. */
export type ThemePref = "auto" | "light" | "dark";
export type Theme = "dark" | "light";
const STORAGE_KEY = "football-terminal-theme";
const ORDER: ThemePref[] = ["auto", "light", "dark"];

const systemLight = () => !!window.matchMedia?.("(prefers-color-scheme: light)").matches;
const resolve = (pref: ThemePref): Theme => (pref === "auto" ? (systemLight() ? "light" : "dark") : pref);

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("light", theme === "light");
}

function getInitialPref(): ThemePref {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "auto") return saved;
  } catch {
    /* soukromý režim apod. */
  }
  return "auto";
}

/** [volba, skutečný motiv, přepnout na další volbu (Auto → Světlý → Tmavý)] */
export function useTheme(): [ThemePref, Theme, () => void] {
  const [pref, setPref] = useState<ThemePref>(getInitialPref);
  const [theme, setTheme] = useState<Theme>(() => resolve(pref));

  useEffect(() => {
    const apply = () => {
      const next = resolve(pref);
      setTheme(next);
      applyTheme(next);
    };
    apply();
    try {
      localStorage.setItem(STORAGE_KEY, pref);
    } catch {
      /* soukromý režim apod. */
    }
    if (pref !== "auto") return;
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    mq?.addEventListener("change", apply);
    return () => mq?.removeEventListener("change", apply);
  }, [pref]);

  const next = useCallback(() => {
    setPref((p) => ORDER[(ORDER.indexOf(p) + 1) % ORDER.length]);
  }, []);

  return [pref, theme, next];
}

export const nextThemePref = (p: ThemePref): ThemePref => ORDER[(ORDER.indexOf(p) + 1) % ORDER.length];
