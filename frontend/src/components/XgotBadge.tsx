import type { XgotBadge } from "../lib/xgEfficiency";

export function XgotBadgeChip({ badge, showWindow = false }: { badge: XgotBadge; showWindow?: boolean }) {
  const lucky = badge.id === "lucky_scoring_team";
  const tone = lucky
    ? "bg-amber-500/20 text-amber-200 ring-amber-400/40 light:bg-amber-100 light:text-amber-800 light:ring-amber-300"
    : "bg-rose-500/20 text-rose-200 ring-rose-400/40 light:bg-rose-100 light:text-rose-800 light:ring-rose-300";
  const windowHint = badge.window === "last5" ? "posledních 5" : "sezona";
  return (
    <span
      title={badge.tooltip}
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${tone}`}
    >
      {badge.label}
      {showWindow ? <span className="ml-1 font-medium opacity-70">· {windowHint}</span> : null}
    </span>
  );
}
