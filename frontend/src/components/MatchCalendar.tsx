import { useMemo, useState } from "react";
import { useSearchParams } from "../i18n/router";
import { intlTag, t } from "../i18n/locale";
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

function weekdayLabels(): string[] {
  const fmt = new Intl.DateTimeFormat(intlTag(), { weekday: "short" });
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2026, 0, 5 + i); // pondělí 5. 1. 2026
    const label = fmt.format(d);
    return label.charAt(0).toUpperCase() + label.slice(1).replace(/\.$/, "");
  });
}

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
  const marked = useMemo(() => new Set(fixtures.map((f) => f.day)), [fixtures]);
  const [cursor, setCursor] = useState(() => {
    const base = selected && DAY_RE.test(selected) ? fromYmd(selected) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startPad = (first.getDay() + 6) % 7; // pondělí = 0
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const out: Array<{ key: string; day: number; ymd: string } | null> = [];
    for (let i = 0; i < startPad; i++) out.push(null);
    for (let d = 1; d <= days; d++) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), d);
      out.push({ key: ymd(date), day: d, ymd: ymd(date) });
    }
    return out;
  }, [cursor]);

  const monthLabel = cursor.toLocaleDateString(intlTag(), { month: "long", year: "numeric" });
  const weekdays = weekdayLabels();
  const canPrev = fixtures.some((f) => f.day < ymd(cursor));
  const monthEnd = ymd(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));
  const canNext = fixtures.some((f) => f.day > monthEnd) || cursor.getFullYear() < new Date().getFullYear() || cursor.getMonth() < new Date().getMonth();

  return (
    <section className="rounded-2xl border border-(--c-line) bg-(--c-surface) p-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label={t("list.cal.prev")}
          disabled={!canPrev}
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-(--c-muted) hover:bg-(--c-raised) disabled:opacity-30"
        >
          ‹
        </button>
        <h2 className="text-[15px] font-semibold capitalize">{monthLabel}</h2>
        <button
          type="button"
          aria-label={t("list.cal.next")}
          disabled={!canNext}
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-(--c-muted) hover:bg-(--c-raised) disabled:opacity-30"
        >
          ›
        </button>
      </div>
      <p className="mt-1 text-center text-[12px] text-(--c-muted)">{t("list.cal.lead")}</p>
      <div role="grid" aria-label={t("list.cal.aria")} className="mt-3 grid grid-cols-7 gap-1">
        {weekdays.map((w) => (
          <div key={w} className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-(--c-faint)">
            {w}
          </div>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <div key={`e-${i}`} />;
          const has = marked.has(cell.ymd);
          const on = selected === cell.ymd;
          const isToday = cell.ymd === today;
          const cls = on
            ? "bg-(--c-accent) text-(--c-on-accent)"
            : has
              ? "text-(--c-text) hover:bg-(--c-raised)"
              : "cursor-default text-(--c-faint)";
          return (
            <button
              key={cell.key}
              type="button"
              disabled={!has}
              aria-pressed={on}
              aria-label={`${cell.day}${has ? `, ${t("list.cal.dot")}` : ""}`}
              onClick={() => onSelect(on ? null : cell.ymd)}
              className={`relative flex h-10 flex-col items-center justify-center rounded-xl text-[13px] font-medium ${cls} ${
                isToday && !on ? "ring-1 ring-(--c-accent)/50" : ""
              }`}
            >
              {cell.day}
              {has && <span aria-hidden className={`absolute bottom-1 h-1 w-1 rounded-full ${on ? "bg-(--c-on-accent)" : "bg-(--c-accent)"}`} />}
            </button>
          );
        })}
      </div>
      {selected && (
        <button type="button" onClick={() => onSelect(null)} className="mt-3 w-full min-h-10 rounded-xl text-[13px] font-medium text-(--c-accent) hover:underline">
          {t("list.cal.back")}
        </button>
      )}
    </section>
  );
}

export function archiveTitle(day: string): string {
  return t("list.cal.dayTitle", { date: fmtDate(fromYmd(day)) });
}
