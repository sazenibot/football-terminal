import { cs, type Key } from "./cs";
import { en } from "./en";

/* Jádro překladů bez Reactu: aktuální jazyk, funkce t() a formátování.
   Jazyk se mění jen přechodem mezi / a /cs (celý strom se tím přemontuje), proto stačí modulová proměnná
   a t() se dá volat i mimo komponenty (data, konstanty, pomocné funkce). */

export type Locale = "cs" | "en";
export type { Key };
type Vars = Record<string, string | number>;

const DICTS: Record<Locale, Record<string, string>> = { cs, en };

let current: Locale = "en";
export const getLocale = (): Locale => current;
export const setLocale = (l: Locale) => {
  current = l;
};

/** Značka pro Intl (data, čísla). Angličtina je britská: 24hodinový čas a „6 Oct“. */
export const intlTag = (l: Locale = current) => (l === "cs" ? "cs-CZ" : "en-GB");

/** Předpona adresy: anglické adresy jsou v kořeni (výchozí jazyk), české pod /cs.
    Stará předpona /en se ještě rozpozná (staré odkazy), ale už se nevyrábí. */
export const CS_PREFIX = "cs";
const LEGACY_EN_PREFIX = "en";

/** Segmenty adres, které se liší mezi jazyky (česky → anglicky). Ostatní jsou stejné. */
const SEG_EN: Record<string, string> = { clanky: "articles", tarify: "pricing", vysledky: "results", prihlaseni: "login" };
const SEG_CS: Record<string, string> = Object.fromEntries(Object.entries(SEG_EN).map(([a, b]) => [b, a]));

/** Český název segmentu v adrese routy pro daný jazyk. */
export const seg = (cz: string, l: Locale = current) => (l === "en" ? (SEG_EN[cz] ?? cz) : cz);

/**
 * Převede interní adresu do daného jazyka. Zvládne adresu v kterémkoli jazyce na vstupu,
 * takže stejnou funkcí se přepíná jazyk i vyrábějí odkazy.
 */
export function localizePath(to: string, l: Locale = current): string {
  if (!to.startsWith("/") || to.startsWith("//")) return to;
  const m = to.match(/^([^?#]*)(.*)$/)!;
  const parts = m[1].split("/").filter(Boolean);
  if (parts[0] === CS_PREFIX || parts[0] === LEGACY_EN_PREFIX) parts.shift();
  if (parts[0]) parts[0] = l === "en" ? (SEG_EN[parts[0]] ?? parts[0]) : (SEG_CS[parts[0]] ?? parts[0]);
  if (l === "cs") parts.unshift(CS_PREFIX);
  return "/" + parts.join("/") + m[2];
}

/** Adresa bez jazykové předpony a s českými názvy segmentů, pro porovnávání aktivní položky menu apod. */
export const barePath = (pathname: string) => localizePath(pathname, "cs").replace(/^\/cs(?=\/|$)/, "") || "/";

function plural(msg: string, vars: Vars | undefined, l: Locale): string {
  // {n, plural, one {# zápas} few {# zápasy} other {# zápasů}}
  return msg.replace(/\{(\w+),\s*plural,((?:\s*\w+\s*\{[^{}]*\})+)\s*\}/g, (_, name: string, body: string) => {
    const n = Number(vars?.[name] ?? 0);
    const cat = new Intl.PluralRules(intlTag(l)).select(n);
    const forms: Record<string, string> = {};
    for (const f of body.matchAll(/(\w+)\s*\{([^{}]*)\}/g)) forms[f[1]] = f[2];
    return (forms[cat] ?? forms.other ?? "").replace(/#/g, String(n));
  });
}

/** Překlad podle klíče. Chybí-li klíč v angličtině, použije se čeština (a v dev režimu se to ohlásí). */
export function t(key: Key, vars?: Vars): string {
  const msg = DICTS[current][key] ?? cs[key] ?? key;
  return plural(msg, vars, current).replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? `{${k}}`));
}
