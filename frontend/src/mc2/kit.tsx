import { useEffect, useRef, useState, type ReactNode } from "react";
import type { TeamBrief } from "../types";
import { intlTag, t, type Key } from "../i18n/locale";

/* ---------- formátování ---------- */

export const n1 = (n: number) => n.toLocaleString(intlTag(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const n2 = (n: number) => n.toLocaleString(intlTag(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (n: number, d = 0) =>
  t("fmt.pct", { n: n.toLocaleString(intlTag(), { minimumFractionDigits: d, maximumFractionDigits: d }) });

export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

/* ---------- vysvětlivka (i) ---------- */

/** Malé „i“ s popisem. Na desktopu po najetí, na mobilu po klepnutí. Popis se vykreslí fixně, takže ho neořízne tabulka. */
export function Info({ children, label }: { children: ReactNode; label?: string }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(288, window.innerWidth - 16);
    setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.left - 16, window.innerWidth - width - 8)) });
  };

  useEffect(() => {
    if (!pos) return;
    const close = (e: Event) => {
      if (e.type === "scroll" || !ref.current?.contains(e.target as Node)) setPos(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setPos(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    window.addEventListener("scroll", close, { passive: true });
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      window.removeEventListener("scroll", close);
      document.removeEventListener("keydown", esc);
    };
  }, [pos]);

  return (
    <span ref={ref} className="inline-flex align-middle" onMouseEnter={show} onMouseLeave={() => setPos(null)}>
      <button
        type="button"
        aria-label={label ?? t("mc.kit.info")}
        aria-expanded={!!pos}
        onClick={() => (pos ? setPos(null) : show())}
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && show()}
        onBlur={() => setPos(null)}
        className="relative ml-1.5 inline-flex h-[18px] w-[18px] before:absolute before:-inset-3 before:content-[''] shrink-0 items-center justify-center rounded-full border border-(--c-faint) text-xs font-bold normal-case leading-none text-(--c-muted) hover:border-(--c-text) hover:text-(--c-text)"
      >
        i
      </button>
      {pos && (
        <span
          role="tooltip"
          style={{ top: pos.top, left: pos.left, width: Math.min(288, window.innerWidth - 16) }}
          className="fixed z-[60] rounded-xl border border-(--c-line) bg-(--c-raised) p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-(--c-text) shadow-2xl"
        >
          {children}
        </span>
      )}
    </span>
  );
}

/* ---------- karta ---------- */

export function Card({
  id,
  title,
  lead,
  aside,
  children,
  className = "",
}: {
  id?: string;
  title: ReactNode;
  lead?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`rounded-2xl border border-(--c-line) bg-(--c-surface) p-4 sm:p-5 ${className}`}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-(--c-text)">{title}</h2>
          {lead && <p className="mt-0.5 text-[13px] leading-snug text-(--c-muted)">{lead}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function SubTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">{children}</h3>;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-(--c-line) px-4 py-6 text-center text-sm text-(--c-muted)">{children}</p>
  );
}

/* ---------- ovládací prvky ---------- */

export function Seg<T extends string>({
  options,
  value,
  onChange,
  label,
  wrap = false,
}: {
  options: { id: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  /** Dlouhé popisky se zalomí do více řádků místo posouvání do strany. */
  wrap?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`max-w-full gap-0.5 rounded-xl bg-(--c-raised) p-1 ${wrap ? "flex flex-wrap" : "inline-flex overflow-x-auto"}`}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={`min-h-9 rounded-lg px-3 text-xs font-medium transition-colors ${wrap ? "py-1.5 text-left" : "shrink-0 whitespace-nowrap"} ${
              active
                ? "bg-(--c-accent)/15 text-(--c-accent) ring-1 ring-(--c-accent)/40"
                : "text-(--c-muted) hover:text-(--c-text)"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-8 rounded-full border px-3 text-xs font-medium transition-colors ${
        active
          ? "border-(--c-accent) bg-(--c-accent)/15 text-(--c-accent)"
          : "border-(--c-line) text-(--c-muted) hover:border-(--c-faint) hover:text-(--c-text)"
      }`}
    >
      {children}
    </button>
  );
}

export function Disclosure({ summary, children, defaultOpen = false }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-9 items-center gap-1.5 text-[13px] font-medium text-(--c-accent) hover:underline"
      >
        <span aria-hidden className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>
          ›
        </span>
        {summary}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

/* ---------- týmy a výsledky ---------- */

export function TeamLogo({ team, size = 24 }: { team: TeamBrief; size?: number }) {
  if (!team.image) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size }}
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-(--c-raised) text-xs font-bold text-(--c-muted)"
      >
        {team.name.slice(0, 1)}
      </span>
    );
  }
  return <img src={team.image} alt="" style={{ width: size, height: size }} className="shrink-0 object-contain" />;
}

export function TeamTitle({ team, side }: { team: TeamBrief; side: "home" | "away" }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: side === "home" ? "var(--c-home)" : "var(--c-away)" }}
      />
      <TeamLogo team={team} size={20} />
      <span className="truncate font-semibold text-(--c-text)">{team.name}</span>
    </span>
  );
}

export type Res = "V" | "R" | "P";
const RES_COLOR: Record<Res, string> = { V: "var(--c-win)", R: "var(--c-draw)", P: "var(--c-loss)" };
const RES_LETTER_KEY: Record<Res, Key> = { V: "mc.kit.resLetter.V", R: "mc.kit.resLetter.R", P: "mc.kit.resLetter.P" };
const RES_WORD_KEY: Record<Res, Key> = { V: "mc.kit.res.V", R: "mc.kit.res.R", P: "mc.kit.res.P" };

export const resLetter = (r: Res) => t(RES_LETTER_KEY[r]);
export const resWord = (r: Res) => t(RES_WORD_KEY[r]);

export function ResBadge({ r, title }: { r: Res; title?: string }) {
  return (
    <span
      title={title ?? t(RES_WORD_KEY[r])}
      aria-label={t(RES_WORD_KEY[r])}
      style={{ background: `color-mix(in oklab, ${RES_COLOR[r]} 18%, transparent)`, color: RES_COLOR[r] }}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold"
    >
      {t(RES_LETTER_KEY[r])}
    </span>
  );
}

export function FormDots({ results, titles }: { results: Res[]; titles?: string[] }) {
  if (!results.length) return <span className="text-xs text-(--c-faint)">{t("mc.kit.noMatches")}</span>;
  return (
    <span className="inline-flex gap-1">
      {results.map((r, i) => (
        <ResBadge key={i} r={r} title={titles?.[i]} />
      ))}
    </span>
  );
}

export function VenueTag({ home }: { home: boolean }) {
  const c = home ? "var(--c-home)" : "var(--c-away)";
  return (
    <span
      style={{ background: `color-mix(in oklab, ${c} 16%, transparent)`, color: c }}
      className="inline-flex w-12 shrink-0 justify-center rounded-md py-0.5 text-[11px] font-semibold uppercase tracking-wide"
    >
      {home ? t("mc.kit.home") : t("mc.kit.away")}
    </span>
  );
}

/** Rozdíl modelu proti sázkové kanceláři v procentních bodech. Hranice 5 b. */
export const VALUE_THRESHOLD = 5;

export function ValueTag({ model, market, className = "" }: { model: number; market?: number | null; className?: string }) {
  if (market == null) return null;
  const d = model - market;
  if (Math.abs(d) < VALUE_THRESHOLD) return null;
  const pos = d > 0;
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold leading-tight ${className}`}
      style={{
        background: `color-mix(in oklab, ${pos ? "var(--c-accent)" : "var(--c-warn)"} 16%, transparent)`,
        color: pos ? "var(--c-accent)" : "var(--c-warn)",
      }}
    >
      {pos ? t("mc.kit.value") : t("mc.kit.marketHigher")}
    </span>
  );
}

/* ---------- grafické prvky ---------- */

/** Tři úseky v jednom pruhu: domácí / remíza / hosté. */
export function ProbBar({ home, draw, away, height = 10 }: { home: number; draw: number; away: number; height?: number }) {
  return (
    <div
      role="img"
      aria-label={t("mc.kit.probAria", { h: Math.round(home), d: Math.round(draw), a: Math.round(away) })}
      className="flex w-full gap-0.5 overflow-hidden rounded-full"
      style={{ height }}
    >
      <div style={{ width: `${home}%`, background: "var(--c-home)" }} />
      <div style={{ width: `${draw}%`, background: "var(--c-draw)", opacity: 0.55 }} />
      <div style={{ width: `${away}%`, background: "var(--c-away)" }} />
    </div>
  );
}

/** Jedna hodnota 0 až 100 jako tenký pruh. */
export function MeterBar({ value, color = "var(--c-accent)", height = 6 }: { value: number; color?: string; height?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-full bg-(--c-raised)" style={{ height }}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

/** Řádek porovnání dvou týmů: čísla po stranách, štítek uprostřed, pruhy rostou od středu. */
export function MirrorRow({
  label,
  hint,
  home,
  away,
  digits = 1,
  lowerBetter = false,
  suffix = "",
  muted = false,
  note,
}: {
  label: ReactNode;
  hint?: ReactNode;
  home: number | null | undefined;
  away: number | null | undefined;
  digits?: number;
  lowerBetter?: boolean;
  suffix?: string;
  muted?: boolean;
  note?: ReactNode;
}) {
  const h = home ?? null;
  const a = away ?? null;
  const max = Math.max(h ?? 0, a ?? 0, 1e-9);
  const lead = h == null || a == null || h === a ? null : (h > a) !== lowerBetter ? "home" : "away";
  const fmt = (v: number | null) =>
    v == null ? "—" : `${v.toLocaleString(intlTag(), { minimumFractionDigits: digits, maximumFractionDigits: digits })}${suffix}`;
  const w = (v: number | null) => (v == null ? 0 : Math.max(4, (v / max) * 100));
  return (
    <div className={`py-2 ${muted ? "opacity-80" : ""}`}>
      <div className="grid grid-cols-[4.5rem_1fr_4.5rem] items-baseline gap-2">
        <span
          className={`text-left text-[15px] tabular-nums ${lead === "home" ? "font-bold" : "font-medium text-(--c-muted)"}`}
          style={lead === "home" ? { color: "var(--c-home)" } : undefined}
        >
          {fmt(h)}
        </span>
        <span className="text-center text-xs text-(--c-muted)">
          {label}
          {hint && <Info>{hint}</Info>}
        </span>
        <span
          className={`text-right text-[15px] tabular-nums ${lead === "away" ? "font-bold" : "font-medium text-(--c-muted)"}`}
          style={lead === "away" ? { color: "var(--c-away)" } : undefined}
        >
          {fmt(a)}
        </span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1">
        <div className="flex h-1.5 justify-end overflow-hidden rounded-full bg-(--c-raised)">
          <div className="h-full rounded-full" style={{ width: `${w(h)}%`, background: "var(--c-home)", opacity: lead === "away" ? 0.45 : 1 }} />
        </div>
        <div className="flex h-1.5 overflow-hidden rounded-full bg-(--c-raised)">
          <div className="h-full rounded-full" style={{ width: `${w(a)}%`, background: "var(--c-away)", opacity: lead === "home" ? 0.45 : 1 }} />
        </div>
      </div>
      {note && <div className="mt-1 text-center text-xs text-(--c-faint)">{note}</div>}
    </div>
  );
}

export function SideHeads({ home, away }: { home: TeamBrief; away: TeamBrief }) {
  return (
    <div className="mb-1 grid grid-cols-2 gap-3 text-xs font-semibold">
      <span className="flex min-w-0 items-center gap-1.5" style={{ color: "var(--c-home)" }}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--c-home)" }} />
        <span className="truncate">{home.name}</span>
      </span>
      <span className="flex min-w-0 items-center justify-end gap-1.5" style={{ color: "var(--c-away)" }}>
        <span className="truncate">{away.name}</span>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--c-away)" }} />
      </span>
    </div>
  );
}

export function Stat({ value, label, tone, hint }: { value: ReactNode; label: ReactNode; tone?: string; hint?: ReactNode }) {
  return (
    <div className="rounded-xl bg-(--c-raised) px-3 py-3 text-center">
      <div className="text-xl font-bold leading-none tabular-nums" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      <div className="mt-1.5 text-xs text-(--c-muted)">
        {label}
        {hint && <Info>{hint}</Info>}
      </div>
    </div>
  );
}
