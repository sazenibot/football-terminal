import { Link } from "../i18n/router";
import type { CatalogPlayerSeason, CatalogRecentMatch, CatalogUpcoming } from "../types";
import { formatDate, formatDateTime } from "../lib/format";
import { ResultBadge } from "./ui";
import { ord } from "../cat/kit";
import { t, type Key } from "../i18n/locale";

export function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string | null | undefined;
  sub?: string;
}) {
  const shown = value === null || value === undefined || value === "" ? "—" : value;
  return (
    <div className="rounded-lg bg-slate-900/40 light:bg-slate-100 px-3 py-3 text-center">
      <div className="text-xl font-semibold text-white light:text-slate-900">{shown}</div>
      <div className="text-xs text-slate-400 light:text-slate-500 mt-1">{label}</div>
      {sub && <div className="text-xs text-slate-400 light:text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export function EmptyNote({ children }: { children: string }) {
  return <p className="text-sm text-slate-400 light:text-slate-500">{children}</p>;
}

const FDR_CLASS: Record<string, string> = {
  easy: "text-emerald-400",
  mid: "text-amber-400",
  hard: "text-rose-400",
};

const FDR_LABEL: Record<string, Key> = {
  easy: "ct.cs.fdr.easy",
  mid: "ct.cs.fdr.mid",
  hard: "ct.cs.fdr.hard",
};

export function UpcomingList({ items }: { items: CatalogUpcoming[] }) {
  if (items.length === 0) {
    return <EmptyNote>{t("ct.cs.noUpcoming")}</EmptyNote>;
  }
  return (
    <div className="space-y-2">
      {items.map((fx) => {
        const inner = (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-400 light:text-slate-500 w-32 shrink-0">
              {fx.starting_at ? formatDateTime(fx.starting_at) : "—"}
            </span>
            <span className="text-slate-400 light:text-slate-500 w-12">{fx.is_home ? t("ct.cs.home") : t("ct.cs.away")}</span>
            <span className="text-white light:text-slate-900 flex-1">{fx.opponent.name}</span>
            {fx.opponent_position != null && (
              <span className={`text-xs ${FDR_CLASS[fx.fdr || ""] || "text-slate-400 light:text-slate-500"}`}>
                {ord(fx.opponent_position)}
                {fx.fdr ? ` · ${t(FDR_LABEL[fx.fdr])}` : ""}
              </span>
            )}
          </div>
        );
        return fx.has_match_page ? (
          <Link
            key={fx.fixture_id}
            to={`/match/${fx.fixture_id}`}
            className="block rounded-lg px-2 py-2 hover:bg-slate-800/50 light:hover:bg-slate-100"
          >
            {inner}
          </Link>
        ) : (
          <div key={fx.fixture_id} className="px-2 py-2">
            {inner}
          </div>
        );
      })}
    </div>
  );
}

export function RecentList({ items }: { items: CatalogRecentMatch[] }) {
  if (items.length === 0) {
    return <EmptyNote>{t("ct.cs.noRecent")}</EmptyNote>;
  }
  return (
    <div className="space-y-2">
      {items.map((fx) => {
        const inner = (
          <div className="flex items-center gap-3 text-sm">
            <ResultBadge result={fx.result} />
            <span className="text-slate-400 light:text-slate-500 w-24 shrink-0">
              {fx.starting_at ? formatDate(fx.starting_at) : "—"}
            </span>
            <span className="text-slate-400 light:text-slate-500 w-12">{fx.is_home ? t("ct.cs.home") : t("ct.cs.away")}</span>
            <span className="flex-1 text-white light:text-slate-900">{fx.opponent.name}</span>
            <span className="font-mono text-white light:text-slate-900">
              {fx.gf}:{fx.ga}
            </span>
          </div>
        );
        return fx.has_match_page ? (
          <Link
            key={fx.fixture_id}
            to={`/match/${fx.fixture_id}`}
            className="block rounded-lg px-2 py-2 hover:bg-slate-800/50 light:hover:bg-slate-100"
          >
            {inner}
          </Link>
        ) : (
          <div key={fx.fixture_id} className="px-2 py-2">
            {inner}
          </div>
        );
      })}
    </div>
  );
}

const PLAYER_METRICS: { key: keyof CatalogPlayerSeason; label: Key }[] = [
  { key: "appearances", label: "ct.cs.m.appearances" },
  { key: "minutes", label: "ct.cs.m.minutes" },
  { key: "goals", label: "ct.cs.m.goals" },
  { key: "assists", label: "ct.cs.m.assists" },
  { key: "shots", label: "ct.cs.m.shots" },
  { key: "sot", label: "ct.cs.m.sot" },
  { key: "yellow", label: "ct.cs.m.yellow" },
  { key: "red", label: "ct.cs.m.red" },
  { key: "rating", label: "ct.cs.m.rating" },
  { key: "saves", label: "ct.cs.m.saves" },
  { key: "clean_sheets", label: "ct.cs.m.clean_sheets" },
  { key: "goals_conceded", label: "ct.cs.m.goals_conceded" },
];

const GK_ONLY = new Set(["saves", "clean_sheets", "goals_conceded"]);

export function PlayerSeasonGrid({
  season,
  position,
}: {
  season?: CatalogPlayerSeason;
  position?: string | null;
}) {
  const keeper = (position || "").toLowerCase().includes("brank");
  const items = PLAYER_METRICS.filter((m) => {
    if (season?.[m.key] == null) return false;
    if (!keeper && GK_ONLY.has(m.key)) return false;
    return true;
  });
  if (items.length === 0) {
    return <EmptyNote>{t("ct.cs.noKpi")}</EmptyNote>;
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((m) => (
        <Metric key={m.key} label={t(m.label)} value={season?.[m.key]} />
      ))}
    </div>
  );
}
