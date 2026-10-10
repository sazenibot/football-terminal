import { useMemo } from "react";
import { useSearchParams } from "../i18n/router";
import { t } from "../i18n/locale";
import { fmtDate } from "../lib/format";
import type { McCalendarMatch } from "../types";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function useArchiveDay() {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get("day");
  const day = raw && DAY_RE.test(raw) ? raw : null;
  const setDay = (next: string | null) => {
    setSp(
      (prev) => {
        const out = new URLSearchParams(prev);
        if (next) out.set("day", next);
        else out.delete("day");
        return out;
      },
      { replace: true },
    );
  };
  return [day, setDay] as const;
}

/** Jednořádkový posun mezi dny, kdy máme rozbor. Živý výpis = prázdný výběr. */
export function MatchCalendar({
  fixtures,
  selected,
  onSelect,
}: {
  fixtures: McCalendarMatch[];
  selected: string | null;
  onSelect: (day: string | null) => void;
}) {
  const today = ymd(new Date());
  const days = useMemo(() => [...new Set(fixtures.map((f) => f.day))].sort(), [fixtures]);
  const past = days.filter((d) => d < today);
  const live = !selected;
  const prevDay = live ? past[past.length - 1] : days.filter((d) => d < selected).at(-1);
  const nextDay = live ? undefined : days.find((d) => d > selected);
  const goLive = Boolean(selected && (!nextDay || nextDay >= today));

  return (
    <div className="inline-flex h-10 items-center rounded-full border border-(--c-line) bg-(--c-surface) pl-1 pr-1">
      <button
        type="button"
        aria-label={t("list.cal.prev")}
        disabled={!prevDay}
        onClick={() => prevDay && onSelect(prevDay)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-(--c-muted) hover:bg-(--c-raised) disabled:opacity-30"
      >
        ‹
      </button>
      <span className="min-w-[8.5rem] px-1 text-center text-[13px] font-semibold tabular-nums">
        {live ? t("list.cal.upcoming") : fmtDate(fromYmd(selected))}
      </span>
      <button
        type="button"
        aria-label={t("list.cal.next")}
        disabled={live}
        onClick={() => onSelect(goLive ? null : nextDay ?? null)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-(--c-muted) hover:bg-(--c-raised) disabled:opacity-30"
      >
        ›
      </button>
    </div>
  );
}

export function archiveTitle(day: string): string {
  return t("list.cal.dayTitle", { date: fmtDate(fromYmd(day)) });
}
