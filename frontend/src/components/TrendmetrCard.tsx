import { useState } from "react";
import { buildTrendmetr, teamShort, TRENDMETR_METRICS, type TrendmetrMetricKey } from "../lib/trendmetr";
import { intlTag, t, type Key } from "../i18n/locale";
import type { MatchData } from "../types";

const METRIC_KEYS: Record<TrendmetrMetricKey, { short: Key; name: Key }> = {
  shots: { short: "mx.tm.shots.short", name: "mx.tm.shots.name" },
  sot: { short: "mx.tm.sot.short", name: "mx.tm.sot.name" },
  corners: { short: "mx.tm.corners.short", name: "mx.tm.corners.name" },
  fouls: { short: "mx.tm.fouls.short", name: "mx.tm.fouls.name" },
  offsides: { short: "mx.tm.offsides.short", name: "mx.tm.offsides.name" },
};

/** Linie „2,5+“ / „2.5+“ podle jazyka. */
const overLabel = (line: number) => `${(line - 0.5).toLocaleString(intlTag(), { maximumFractionDigits: 1 })}+`;

type Leg = {
  sideKey: string;
  metricKey: string;
  short: string;
  metric: string;
  line: number;
};

export function TrendmetrCard({ match }: { match: MatchData }) {
  const rows = buildTrendmetr(match);
  const [picked, setPicked] = useState<Leg[]>([]);
  const hasAny = rows.some((r) => Object.keys(r.lines).length > 0);
  if (!hasAny) return null;

  function toggle(leg: Leg) {
    setPicked((prev) => {
      const same = prev.find((p) => p.sideKey === leg.sideKey && p.metricKey === leg.metricKey);
      if (same) return prev.filter((p) => p !== same);
      return [...prev, leg];
    });
  }

  return (
    <article className="card overflow-hidden mb-6">
      <div className="px-4 pt-4 pb-3 md:px-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">Trendmetr</p>
        <p className="text-sm text-slate-400 light:text-slate-500 mt-0.5">{t("mx.tm.lead")}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-400 light:text-slate-500 border-y border-slate-800 light:border-slate-200">
              <th className="text-left font-medium pl-4 md:pl-5 pr-3 py-2 w-[11rem]">{t("mx.tm.team")}</th>
              {TRENDMETR_METRICS.map((col) => (
                <th key={col.key} className="font-medium text-center px-1.5 py-2">
                  {t(METRIC_KEYS[col.key].short)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.team.id} className="border-b border-slate-800/80 light:border-slate-200 last:border-b-0">
                <td className="pl-4 md:pl-5 pr-3 py-3 align-middle">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {row.team.image ? (
                      <img src={row.team.image} alt="" className="h-8 w-8 object-contain shrink-0" />
                    ) : null}
                    <div className="min-w-0">
                      <p className="font-semibold text-white light:text-slate-900 truncate">{row.team.name}</p>
                      <p className="text-xs text-slate-400 light:text-slate-500">{row.role === "doma" ? t("mx.tm.roleHome") : t("mx.tm.roleAway")}</p>
                    </div>
                  </div>
                </td>
                {TRENDMETR_METRICS.map((col) => {
                  const line = row.lines[col.key] ?? null;
                  const selected = picked.some((p) => p.sideKey === String(row.team.id) && p.metricKey === col.key);
                  if (line == null) {
                    return (
                      <td key={col.key} className="px-1.5 py-3 text-center align-middle">
                        <div className="mx-auto w-[5rem] rounded-lg border border-dashed border-slate-800 light:border-slate-200 px-2 py-2 text-slate-400 light:text-slate-500">
                          —
                        </div>
                      </td>
                    );
                  }
                  return (
                    <td key={col.key} className="px-1.5 py-3 text-center align-middle">
                      <button
                        type="button"
                        onClick={() =>
                          toggle({
                            sideKey: String(row.team.id),
                            metricKey: col.key,
                            short: teamShort(row.team.name),
                            metric: t(METRIC_KEYS[col.key].name),
                            line,
                          })
                        }
                        className={`mx-auto w-[5rem] rounded-lg border px-2 py-2 tabular-nums font-semibold transition-colors ${
                          selected
                            ? "border-emerald-400 bg-emerald-500/15 text-emerald-300 light:text-emerald-700"
                            : "border-slate-700 bg-slate-800/70 text-white hover:border-emerald-400 light:border-slate-300 light:bg-slate-50 light:text-slate-900"
                        }`}
                      >
                        {overLabel(line)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 md:px-5 py-3 border-t border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-slate-50">
        {picked.length === 0 ? (
          <p className="text-xs text-slate-400 light:text-slate-500">{t("mx.tm.hint")}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-400 light:text-slate-500 mr-1">Builder</p>
            {picked.map((leg) => (
              <button
                key={`${leg.sideKey}-${leg.metricKey}`}
                type="button"
                onClick={() => toggle(leg)}
                className="rounded-md bg-emerald-500/15 border border-emerald-400/50 px-2 py-1 text-xs text-emerald-300 light:text-emerald-800"
              >
                {leg.short} {leg.metric.toLowerCase()} {overLabel(leg.line)}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
