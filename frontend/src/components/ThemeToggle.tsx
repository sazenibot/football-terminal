import { t } from "../i18n/locale";
import { nextThemePref, useTheme } from "../lib/theme";

const ICON = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

const Sun = () => (
  <svg {...ICON}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const Moon = () => (
  <svg {...ICON}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);
const Auto = () => (
  <svg {...ICON}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
  </svg>
);

/** Jedna ikona = aktuální volba (Auto, Světlý, Tmavý). Popisek (title, aria-label) říká, na co klik přepne. */
export function ThemeToggle() {
  const [pref, , toggle] = useTheme();
  const target = nextThemePref(pref);
  const action = t(target === "auto" ? "theme.toAuto" : target === "light" ? "theme.toLight" : "theme.toDark");
  return (
    <button
      type="button"
      onClick={toggle}
      title={action}
      aria-label={action}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-[#12161f] text-slate-200 shadow-lg transition-colors hover:border-emerald-500 light:border-slate-300 light:bg-white light:text-slate-700 light:hover:border-emerald-500"
    >
      {pref === "auto" ? <Auto /> : pref === "light" ? <Sun /> : <Moon />}
    </button>
  );
}
