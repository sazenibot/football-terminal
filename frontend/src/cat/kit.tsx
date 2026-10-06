import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "../i18n/router";
import { Info } from "../mc2/kit";
import { getLocale, intlTag, t } from "../i18n/locale";

/* Sdílené stavební kameny nového katalogu. Vizuálně navazují na Match Center (mc2/kit),
   takže tabulky, karty i záložky mají stejný jazyk. */

export const fmtNum = (n: number | null | undefined, digits = 2) =>
  n == null ? "—" : n.toLocaleString(intlTag(), { maximumFractionDigits: digits });

export const isPhoto = (src?: string | null): src is string => !!src && !src.includes("placeholder");

export function initials(name: string): string {
  const parts = name.replace(/\./g, " ").split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

/* ---------- rám stránky ---------- */

export function Frame({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={`mc2 mx-auto px-4 pb-16 pt-20 ${wide ? "max-w-5xl" : "max-w-4xl"}`}>{children}</div>;
}

export function Back({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex min-h-9 items-center text-[13px] text-(--c-accent) hover:underline">
      ← {children}
    </Link>
  );
}

export function Loading({ children }: { children: ReactNode }) {
  return <div className="mc2 flex min-h-[60vh] items-center justify-center text-(--c-muted)">{children}</div>;
}

export function NotFound({ kind, back }: { kind: string; back: ReactNode }) {
  return (
    <Frame>
      {back}
      <p className="mt-6 rounded-2xl border border-(--c-line) bg-(--c-surface) p-8 text-center text-(--c-muted)">
        {t("cat.notFound", { kind })}
      </p>
    </Frame>
  );
}

/* ---------- obrázky ---------- */

/** Foto hráče / rozhodčího, nebo iniciály, když fotka chybí. */
export function Avatar({ src, name, size = 40 }: { src?: string | null; name: string; size?: number }) {
  if (isPhoto(src)) {
    return <img src={src} alt="" style={{ width: size, height: size }} className="shrink-0 rounded-full bg-(--c-raised) object-cover" loading="lazy" />;
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.34) }}
      className="inline-flex shrink-0 select-none items-center justify-center rounded-full bg-(--c-raised) font-bold text-(--c-muted)"
    >
      {initials(name)}
    </span>
  );
}

/** Znak klubu nebo logo ligy, když chybí, tak kolečko s písmenem. */
export function Crest({ src, name, size = 32 }: { src?: string | null; name: string; size?: number }) {
  if (isPhoto(src)) {
    return <img src={src} alt="" style={{ width: size, height: size }} className="shrink-0 object-contain" loading="lazy" />;
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-(--c-raised) font-bold text-(--c-muted)"
    >
      {name.slice(0, 1)}
    </span>
  );
}

/* ---------- záložky (lepí se pod navigaci jako v Match Center) ---------- */

export function StickyTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly { id: T; label: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const on = () => setStuck((barRef.current?.getBoundingClientRect().top ?? 99) <= 57);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  useEffect(() => {
    document.getElementById(`ctab-${value}`)?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [value]);

  const go = (id: T) => {
    onChange(id);
    requestAnimationFrame(() => {
      const el = barRef.current;
      if (el && el.getBoundingClientRect().top < 70) window.scrollTo({ top: el.offsetTop - 64, behavior: "smooth" });
    });
  };

  return (
    <div
      ref={barRef}
      data-stuck={stuck}
      className="sticky top-14 z-30 -mx-4 mt-4 bg-(--c-page)/95 px-4 py-2 backdrop-blur before:pointer-events-none before:absolute before:inset-x-0 before:-top-14 before:h-14 before:bg-(--c-page) before:opacity-0 data-[stuck=true]:before:opacity-100"
    >
      <div role="tablist" aria-label={label} className="no-scrollbar flex gap-1 overflow-x-auto rounded-2xl border border-(--c-line) bg-(--c-surface) p-1">
        {tabs.map((t, i) => {
          const on = t.id === value;
          return (
            <button
              key={t.id}
              id={`ctab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => go(t.id)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
                  go(n.id);
                  requestAnimationFrame(() => document.getElementById(`ctab-${n.id}`)?.focus());
                }
              }}
              className={`min-h-10 flex-1 shrink-0 whitespace-nowrap rounded-xl px-3.5 text-[13px] font-semibold transition-colors ${
                on ? "bg-(--c-accent) text-black" : "text-(--c-muted) hover:text-(--c-text)"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- formuláře ---------- */

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-(--c-faint)">{label}</span>
      {children}
    </label>
  );
}

export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="min-h-10 w-full rounded-xl border border-(--c-line) bg-(--c-raised) px-3 text-[13px] text-(--c-text)"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Lišta filtrů pod hlavičkou. Sbalená ukazuje jen shrnutí výběru, ať filtry nezabírají půl obrazovky. */
export function FilterBar({ children, summary, note }: { children: ReactNode; summary: ReactNode; note?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 rounded-2xl border border-(--c-line) bg-(--c-surface)">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-(--c-faint)">{t("ct.kit.selection")}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-(--c-text)">{summary}</span>
        <span className="shrink-0 text-[13px] font-medium text-(--c-accent)">
          {open ? t("ct.kit.done") : t("ct.kit.edit")}
          <span aria-hidden className={`ml-1 inline-block transition-transform ${open ? "rotate-90" : ""}`}>›</span>
        </span>
      </button>
      {open && (
        <div className="border-t border-(--c-line) p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
        </div>
      )}
      {note && <p className="border-t border-(--c-line) px-4 py-2.5 text-xs text-(--c-muted)">{note}</p>}
    </div>
  );
}

/* ---------- pořadí v lize ---------- */

/** Barva podle pořadí: horní pětina zeleně, dolní pětina růžově, střed šedě. */
export function rankColor(rank: number, size: number, higherIsGood = true): string {
  const edge = Math.max(1, Math.round(size * 0.2));
  const top = rank <= edge;
  const bottom = rank > size - edge;
  if (top) return higherIsGood ? "var(--c-win)" : "var(--c-loss)";
  if (bottom) return higherIsGood ? "var(--c-loss)" : "var(--c-win)";
  return "var(--c-draw)";
}

/** Karta jedné statistiky: hodnota, pořadí v lize, ligový průměr a pruh umístění. */
export function RankCard({
  label,
  value,
  digits = 2,
  rank,
  size,
  avg,
  hint,
  suffix = "",
  neutralRank = false,
}: {
  label: ReactNode;
  value: number | null | undefined;
  digits?: number;
  rank?: number | null;
  size?: number | null;
  avg?: number | null;
  hint?: ReactNode;
  suffix?: string;
  /** Pořadí bez hodnocení dobré/špatné (např. fauly rozhodčího). */
  neutralRank?: boolean;
}) {
  const hasRank = rank != null && size != null && size >= 2;
  const color = hasRank ? (neutralRank ? "var(--c-muted)" : rankColor(rank!, size!)) : "var(--c-faint)";
  const fill = hasRank ? Math.max(6, Math.round(((size! - rank! + 1) / size!) * 100)) : 0;
  return (
    <div className="rounded-xl bg-(--c-raised) px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xl font-bold tabular-nums">
          {fmtNum(value, digits)}
          {value != null && suffix}
        </span>
        {hasRank && (
          <span className="text-[13px] font-semibold tabular-nums" style={{ color }}>
            {t("ct.kit.rankOf", { rank: rank!, size: size! })}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-xs text-(--c-muted)">
        {label}
        {hint && <Info>{hint}</Info>}
      </div>
      {hasRank && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-(--c-line)">
          <div className="h-full rounded-full" style={{ width: `${fill}%`, background: color }} />
        </div>
      )}
      {avg != null && <div className="mt-1.5 text-[11px] text-(--c-faint)">{t("ct.kit.leagueAvg", { v: `${fmtNum(avg, digits)}${suffix}` })}</div>}
    </div>
  );
}

/* ---------- tabulky ---------- */

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="no-scrollbar -mx-1 overflow-x-auto">{children}</div>;
}

export const TH = "px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-(--c-faint) whitespace-nowrap";
export const TD = "px-2.5 py-2 text-[13px] tabular-nums whitespace-nowrap";

/* ---------- drobnosti ---------- */

export function Pill({ children, tone = "var(--c-accent)" }: { children: ReactNode; tone?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ color: tone, background: `color-mix(in oklab, ${tone} 14%, transparent)` }}
    >
      {children}
    </span>
  );
}

export function Meta({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">{label}</div>
      <div className="mt-0.5 truncate text-[13px] font-semibold">{value ?? "—"}</div>
    </div>
  );
}

/* ---------- hlavička profilu ---------- */

export function Hero({
  media,
  eyebrow,
  title,
  sub,
  chips,
  aside,
  children,
}: {
  media: ReactNode;
  eyebrow: string;
  title: ReactNode;
  sub?: ReactNode;
  chips?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="rounded-2xl border border-(--c-line) bg-(--c-surface) px-4 py-5 sm:px-6 sm:py-6">
      <div className="flex items-start gap-4 sm:gap-5">
        <div className="shrink-0">{media}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--c-accent)">{eyebrow}</p>
          <h1 className="mt-1 text-[22px] font-bold leading-tight sm:text-3xl" style={{ overflowWrap: "anywhere" }}>
            {title}
          </h1>
          {sub && <div className="mt-1 text-[13px] leading-snug text-(--c-muted) sm:text-sm">{sub}</div>}
          {chips && <div className="mt-3 flex flex-wrap items-center gap-1.5">{chips}</div>}
        </div>
        {aside && <div className="hidden shrink-0 sm:block">{aside}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </header>
  );
}

export function StatStrip({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 | 5 }) {
  const c = cols === 3 ? "sm:grid-cols-3" : cols === 5 ? "sm:grid-cols-5" : "sm:grid-cols-4";
  return <div className={`grid grid-cols-2 gap-2 ${c}`}>{children}</div>;
}

/** Slovo „zápas“ ve správném tvaru podle počtu (česky zápas / zápasy / zápasů, anglicky match / matches). */
export const csMatches = (n: number) => t("ct.matchWord", { n });

/** Pořadové číslo: česky „3.“, anglicky „3rd“. */
export function ord(n: number): string {
  if (getLocale() === "cs") return `${n}.`;
  const suffix = { one: "st", two: "nd", few: "rd", other: "th" }[new Intl.PluralRules("en-GB", { type: "ordinal" }).select(n) as "one" | "two" | "few" | "other"];
  return `${n}${suffix}`;
}
