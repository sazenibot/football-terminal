import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { barePath, localizePath, setLocale, type Locale } from "./locale";

export { getLocale, intlTag, localizePath, seg, t, type Key, type Locale } from "./locale";

type Ctx = { locale: Locale; path: (to: string) => string };

const LocaleCtx = createContext<Ctx>({ locale: "en", path: (to) => to });

export const LANG_KEY = "ft.lang";

/** Nastaví jazyk pro celý podstrom. Volá se z routy /cs/* a /*. */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  setLocale(locale); // musí proběhnout před vykreslením potomků, kteří volají t()
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo<Ctx>(() => ({ locale, path: (to) => localizePath(to, locale) }), [locale]);
  return <LocaleCtx.Provider value={value}>{children}</LocaleCtx.Provider>;
}

export const useLocale = () => useContext(LocaleCtx);

/** Aktuální adresa bez jazykové předpony a s českými segmenty (pro „je tohle aktivní položka menu“). */
export function useBarePath() {
  return barePath(useLocation().pathname);
}
