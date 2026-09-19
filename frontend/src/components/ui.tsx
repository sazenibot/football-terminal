import type { ReactNode } from "react";

export function Section({
  title,
  subtitle,
  note,
  children,
}: {
  title: string;
  subtitle?: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="card p-5 mb-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
        <h2 className="text-lg font-semibold text-white light:text-slate-900">{title}</h2>
        {subtitle && <span className="text-sm text-slate-400 light:text-slate-500">{subtitle}</span>}
      </div>
      {children}
      {note && (
        <p className="text-xs text-amber-400/80 light:text-amber-700 mt-3 border-t border-slate-800 light:border-slate-200 pt-2">
          ⚠️ {note}
        </p>
      )}
    </section>
  );
}

export function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`badge cursor-pointer transition-colors ${
        active
          ? "bg-emerald-500 text-black"
          : "bg-slate-800 text-slate-300 hover:bg-slate-700 light:bg-slate-200 light:text-slate-700 light:hover:bg-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

export function ResultBadge({ result }: { result: string }) {
  const color =
    result === "V"
      ? "bg-emerald-500 text-black"
      : result === "P"
      ? "bg-rose-500 text-black"
      : "bg-slate-500 text-black";
  return <span className={`badge w-6 justify-center ${color}`}>{result}</span>;
}

export function TrendBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-slate-600";
  return (
    <div className="w-full h-1.5 bg-slate-800 light:bg-slate-200 rounded-full overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
