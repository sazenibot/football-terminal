import { Link } from "react-router-dom";
import type { CatalogPlayerSeason, CatalogRecentMatch, CatalogUpcoming } from "../types";
import { formatDate, formatDateTime } from "../lib/format";
import { ResultBadge } from "./ui";

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
      <div className="text-xs text-slate-500 mt-1">{label}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
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

const FDR_LABEL: Record<string, string> = {
  easy: "slabší",
  mid: "střed",
  hard: "těžší",
};

export function UpcomingList({ items }: { items: CatalogUpcoming[] }) {
  if (items.length === 0) {
    return <EmptyNote>V nejbližším okně nic není.</EmptyNote>;
  }
  return (
    <div className="space-y-2">
      {items.map((fx) => {
        const inner = (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500 w-32 shrink-0">
              {fx.starting_at ? formatDateTime(fx.starting_at) : "—"}
            </span>
            <span className="text-slate-400 w-12">{fx.is_home ? "Doma" : "Venku"}</span>
            <span className="text-white light:text-slate-900 flex-1">{fx.opponent.name}</span>
            {fx.opponent_position != null && (
              <span className={`text-xs ${FDR_CLASS[fx.fdr || ""] || "text-slate-500"}`}>
                {fx.opponent_position}.
                {fx.fdr ? ` · ${FDR_LABEL[fx.fdr]}` : ""}
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
    return <EmptyNote>V této sezóně ještě nemáme odehraný ligový zápas.</EmptyNote>;
  }
  return (
    <div className="space-y-2">
      {items.map((fx) => {
        const inner = (
          <div className="flex items-center gap-3 text-sm">
            <ResultBadge result={fx.result} />
            <span className="text-slate-500 w-24 shrink-0">
              {fx.starting_at ? formatDate(fx.starting_at) : "—"}
            </span>
            <span className="text-slate-400 w-12">{fx.is_home ? "Doma" : "Venku"}</span>
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

const PLAYER_METRICS: { key: keyof CatalogPlayerSeason; label: string }[] = [
  { key: "appearances", label: "Starty" },
  { key: "minutes", label: "Minuty" },
  { key: "goals", label: "Góly" },
  { key: "assists", label: "Asistence" },
  { key: "shots", label: "Střely" },
  { key: "sot", label: "Na bránu" },
  { key: "yellow", label: "Žluté" },
  { key: "red", label: "Červené" },
  { key: "rating", label: "Rating" },
  { key: "saves", label: "Zákroky" },
  { key: "clean_sheets", label: "Nuly" },
  { key: "goals_conceded", label: "Obdrženo" },
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
    return <EmptyNote>Sezónní KPI zatím SportMonks neposlal. Necpeme sem cizí profil.</EmptyNote>;
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((m) => (
        <Metric key={m.key} label={m.label} value={season?.[m.key]} />
      ))}
    </div>
  );
}
