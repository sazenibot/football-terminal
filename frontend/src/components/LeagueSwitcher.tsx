import { Link } from "react-router-dom";
import type { DataIndex, LeagueMeta } from "../types";

const LAST_LEAGUE_KEY = "ft-league";

export function rememberLeague(id: number) {
  try {
    localStorage.setItem(LAST_LEAGUE_KEY, String(id));
  } catch {
    /* ignore */
  }
}

export function lastLeagueId(): number | null {
  try {
    const raw = localStorage.getItem(LAST_LEAGUE_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

function LeagueLogo({ league, active }: { league: LeagueMeta; active: boolean }) {
  if (!league.logo) {
    return (
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
          active ? "bg-black/15 text-black" : "bg-slate-700 text-slate-200 light:bg-slate-200 light:text-slate-600"
        }`}
      >
        {(league.short || league.name).slice(0, 2)}
      </span>
    );
  }
  return (
    <img
      src={league.logo}
      alt=""
      width={24}
      height={24}
      className="h-6 w-6 object-contain"
    />
  );
}

export function LeagueSwitcher({
  index,
  activeId,
}: {
  index: DataIndex;
  activeId: number;
}) {
  const enabled = index.leagues.filter((l) => l.enabled);

  return (
    <div className="mb-6 -mx-4 px-4 overflow-x-auto">
      <div
        role="tablist"
        aria-label="Soutěže"
        className="flex min-w-min border-b border-slate-800 light:border-slate-200"
      >
        {enabled.map((l) => {
          const active = l.id === activeId;
          return (
            <Link
              key={l.id}
              role="tab"
              aria-selected={active}
              to={`/league/${l.id}`}
              onClick={() => rememberLeague(l.id)}
              className={`flex items-center gap-2 shrink-0 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? "border-emerald-500 text-emerald-400 light:text-emerald-700"
                  : "border-transparent text-slate-400 hover:text-slate-200 light:text-slate-500 light:hover:text-slate-800"
              }`}
            >
              <LeagueLogo league={l} active={active} />
              <span className="whitespace-nowrap">{l.name}</span>
              {typeof l.round_count === "number" && (
                <span className={`text-xs tabular-nums ${active ? "opacity-80" : "opacity-50"}`}>
                  {l.round_count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
