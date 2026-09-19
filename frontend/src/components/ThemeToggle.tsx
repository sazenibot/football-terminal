import { useTheme } from "../lib/theme";

export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const isLight = theme === "light";
  return (
    <button
      onClick={toggle}
      title={isLight ? "Přepnout na tmavý režim" : "Přepnout na světlý režim"}
      className="fixed top-3 right-3 z-50 flex items-center gap-1.5 rounded-full border border-slate-700 bg-[#12161f] text-slate-200 px-3 py-1.5 text-xs font-medium shadow-lg hover:border-emerald-500 transition-colors light:bg-white light:border-slate-300 light:text-slate-700 light:hover:border-emerald-500"
    >
      <span>{isLight ? "☀️" : "🌙"}</span>
      <span>{isLight ? "Světlý" : "Tmavý"}</span>
    </button>
  );
}
