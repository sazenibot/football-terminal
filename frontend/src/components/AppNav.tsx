import { Link, useLocation } from "react-router-dom";
import { lastLeagueId } from "./LeagueSwitcher";
import { useDataIndex } from "../lib/useData";

function matchCenterPath(defaultId: number): string {
  const saved = lastLeagueId();
  return `/league/${saved && Number.isFinite(saved) ? saved : defaultId}`;
}

export function AppNav() {
  const { pathname } = useLocation();
  const { index } = useDataIndex();
  const defaultId = index?.default_league_id ?? 262;
  const center = matchCenterPath(defaultId);
  const onHome = pathname === "/";
  const onCenter = pathname.startsWith("/league") || pathname.startsWith("/match");
  const onCatalog = pathname.startsWith("/catalog") || pathname.startsWith("/katalog");
  const onLab = pathname.startsWith("/lab");

  const item = (to: string, label: string, active: boolean) => (
    <Link
      to={to}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-emerald-500 text-black"
          : "text-slate-300 hover:text-white light:text-slate-600 light:hover:text-slate-900"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <nav
      aria-label="Hlavní menu"
      className="fixed top-3 left-3 z-50 flex items-center gap-1 rounded-full border border-slate-700 bg-[#12161f] px-1.5 py-1 shadow-lg light:bg-white light:border-slate-300"
    >
      {item("/", "Football Terminal", onHome)}
      {item(center, "Match Center", onCenter)}
      {item("/catalog", "Katalog", onCatalog)}
      {item("/lab", "Lab", onLab)}
    </nav>
  );
}
