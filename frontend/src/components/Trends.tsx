import { useState } from "react";
import { buildH2hTrends, type H2hScope } from "../lib/h2hTrends";
import type { H2HMatch, TeamBrief, TrendItem } from "../types";
import { Pill, Section } from "./ui";
import { intlTag, t } from "../i18n/locale";
import { dataLabel } from "../i18n/dataText";

type Threshold = 100 | 80 | 60 | 0;

function ThresholdPills({ threshold, setThreshold }: { threshold: Threshold; setThreshold: (t: Threshold) => void }) {
  return (
    <div className="flex gap-2 mb-4 flex-wrap">
      <Pill active={threshold === 100} onClick={() => setThreshold(100)}>
        100%
      </Pill>
      <Pill active={threshold === 80} onClick={() => setThreshold(80)}>
        {t("mx.trend.over80")}
      </Pill>
      <Pill active={threshold === 60} onClick={() => setThreshold(60)}>
        {t("mx.trend.over60")}
      </Pill>
      <Pill active={threshold === 0} onClick={() => setThreshold(0)}>
        {t("mx.common.all")}
      </Pill>
    </div>
  );
}

function oddsLabel(odds?: number | null): string | null {
  if (odds == null || Number.isNaN(odds)) return null;
  return odds.toLocaleString(intlTag(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function TrendList({ items, threshold }: { items: TrendItem[]; threshold: number }) {
  const shown = items.filter((i) => i.pct >= threshold);
  if (shown.length === 0) {
    return <p className="text-slate-500 light:text-slate-400 text-sm">{t("mx.trend.none", { n: threshold })}</p>;
  }
  return (
    <div className="divide-y divide-slate-800 light:divide-slate-200">
      {shown.map((item) => {
        const kurz = oddsLabel(item.odds);
        const tone =
          item.pct >= 80
            ? "bg-emerald-500/15 text-emerald-300 light:bg-emerald-50 light:text-emerald-700"
            : item.pct >= 60
              ? "bg-amber-500/15 text-amber-300 light:bg-amber-50 light:text-amber-800"
              : "bg-slate-800 text-slate-300 light:bg-slate-100 light:text-slate-600";
        return (
          <div key={item.key} className="flex items-center gap-3 py-2 text-sm">
            <span className="flex-1 text-slate-200 light:text-slate-800">{dataLabel(item.label)}</span>
            <span className="font-mono text-xs text-slate-500 light:text-slate-500 w-12 text-right">
              {item.hits}/{item.total}
            </span>
            <span className={`badge w-12 justify-center ${tone}`}>{item.pct.toLocaleString(intlTag())}%</span>
            <span className="font-mono text-xs w-14 text-right text-sky-300 light:text-sky-700">
              {kurz ? kurz : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TrendsTeamSection({
  homeName,
  awayName,
  home,
  away,
}: {
  homeName: string;
  awayName: string;
  home: TrendItem[];
  away: TrendItem[];
}) {
  const [threshold, setThreshold] = useState<Threshold>(80);
  return (
    <Section
      title={t("mx.trend.teamTitle")}
      note={t("mx.trend.teamNote")}
    >
      <ThresholdPills threshold={threshold} setThreshold={setThreshold} />
      <div className="grid grid-cols-[1fr_3rem_3.25rem_3.5rem] text-[11px] uppercase tracking-wide text-slate-500 px-0 mb-1">
        <span />
        <span className="text-right">{t("mx.trend.hits")}</span>
        <span className="text-center">%</span>
        <span className="text-right">{t("mx.trend.odds")}</span>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="font-medium text-white light:text-slate-900 mb-1">{homeName}</h3>
          <TrendList items={home} threshold={threshold} />
        </div>
        <div>
          <h3 className="font-medium text-white light:text-slate-900 mb-1">{awayName}</h3>
          <TrendList items={away} threshold={threshold} />
        </div>
      </div>
    </Section>
  );
}

export function TrendsH2HSection({
  h2h,
  home,
  away,
  last3,
  last5,
}: {
  h2h: H2HMatch[];
  home: TeamBrief;
  away: TeamBrief;
  last3: TrendItem[];
  last5: TrendItem[];
}) {
  const [scope, setScope] = useState<H2hScope>("match");
  const [span, setSpan] = useState<"3" | "5">("5");
  const [threshold, setThreshold] = useState<Threshold>(80);
  const stored = span === "3" ? last3 : last5;
  const items = buildH2hTrends(h2h, home, away, scope, span === "3" ? 3 : 5, stored);
  return (
    <Section
      title={t("mx.trend.h2hTitle")}
      note={t("mx.trend.h2hNote")}
    >
      <p className="text-sm text-slate-400 light:text-slate-500 mb-3">{t("mx.trend.scope")}</p>
      <div className="flex gap-2 mb-3 flex-wrap">
        <Pill active={scope === "match"} onClick={() => setScope("match")}>
          {t("mx.trend.scopeMatch")}
        </Pill>
        <Pill active={scope === "home"} onClick={() => setScope("home")}>
          {t("mx.trend.scopeHome", { name: home.name })}
        </Pill>
        <Pill active={scope === "away"} onClick={() => setScope("away")}>
          {t("mx.trend.scopeAway", { name: away.name })}
        </Pill>
      </div>
      <div className="flex gap-2 mb-3">
        <Pill active={span === "3"} onClick={() => setSpan("3")}>
          {t("mx.trend.last3")}
        </Pill>
        <Pill active={span === "5"} onClick={() => setSpan("5")}>
          {t("mx.trend.last5")}
        </Pill>
      </div>
      <ThresholdPills threshold={threshold} setThreshold={setThreshold} />
      <div className="grid grid-cols-[1fr_3rem_3.25rem_3.5rem] text-[11px] uppercase tracking-wide text-slate-500 mb-1">
        <span />
        <span className="text-right">{t("mx.trend.hits")}</span>
        <span className="text-center">%</span>
        <span className="text-right">{t("mx.trend.odds")}</span>
      </div>
      <TrendList items={items} threshold={threshold} />
    </Section>
  );
}
