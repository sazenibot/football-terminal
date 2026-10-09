import { Link } from "../i18n/router";
import type { DataIndex, LeagueMeta } from "../types";
import { t, type Locale } from "../i18n/locale";
import { countryName } from "./Flag";
import { orderedLeagues } from "../lib/leagues";

const LAST_LEAGUE_KEY = "ft-league";
const CHANCE_LIGA = 262;

export type LeaguePref = number | "all";

export function rememberLeague(id: LeaguePref) {
  try {
    localStorage.setItem(LAST_LEAGUE_KEY, String(id));
  } catch {
    /* ignore */
  }
}

export function lastLeaguePref(): LeaguePref | null {
  try {
    const raw = localStorage.getItem(LAST_LEAGUE_KEY);
    if (raw === "all") return "all";
    const n = Number(raw);
    return raw && Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function lastLeagueId(): number | null {
  const pref = lastLeaguePref();
  return typeof pref === "number" ? pref : null;
}

/** První návštěva: česky Chance Liga, anglicky všechny ligy. Pak platí poslední volba. */
export function defaultLeaguePath(locale: Locale): string {
  const pref = lastLeaguePref();
  if (pref === "all") return "/league/all";
  if (typeof pref === "number") return `/league/${pref}`;
  return locale === "en" ? "/league/all" : `/league/${CHANCE_LIGA}`;
}

function LeagueLogo({ league, active }: { league: LeagueMeta; active: boolean }) {
  if (!league.logo) {
    return (
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold ${
          active ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-300 light:bg-slate-200 light:text-slate-600"
        }`}
      >
        {(league.short || league.name).slice(0, 2)}
      </span>
    );
  }
  return <img src={league.logo} alt="" width={40} height={40} className="h-10 w-10 object-contain" />;
}

function matchLabel(n: number | undefined) {
  if (n == null) return null;
  return t("mx.switch.inWindow", { n });
}

export function LeagueSwitcher({
  index,
  activeId,
}: {
  index: DataIndex;
  activeId: number;
}) {
  const enabled = orderedLeagues(index.leagues.filter((l) => l.enabled));

  return (
    <nav aria-label={t("picker.aria")} className="mb-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 light:text-slate-500 mb-2">{t("mx.switch.leagues")}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {enabled.map((l) => {
          const active = l.id === activeId;
          const count = matchLabel(l.round_count ?? l.match_count);
          return (
            <Link
              key={l.id}
              to={`/league/${l.id}`}
              onClick={() => rememberLeague(l.id)}
              aria-current={active ? "page" : undefined}
              className={`card catalog-tile flex items-center gap-3 px-3.5 py-3 ${
                active
                  ? "border-emerald-500 ring-1 ring-emerald-500/40"
                  : "hover:border-emerald-500/50"
              }`}
            >
              <LeagueLogo league={l} active={active} />
              <div className="min-w-0">
                <p className={`font-medium truncate ${active ? "text-emerald-300 light:text-emerald-700" : "text-white light:text-slate-900"}`}>
                  {l.name}
                </p>
                <p className="text-xs text-slate-400 light:text-slate-500 truncate">
                  {l.country ? countryName(l.country) : l.short}
                  {count ? ` · ${count}` : ""}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
