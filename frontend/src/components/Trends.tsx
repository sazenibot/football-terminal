import { useState } from "react";
import type { TrendItem } from "../types";
import { Pill, Section } from "./ui";

type Threshold = 100 | 80 | 60 | 0;

function ThresholdPills({ threshold, setThreshold }: { threshold: Threshold; setThreshold: (t: Threshold) => void }) {
  return (
    <div className="flex gap-2 mb-4 flex-wrap">
      <Pill active={threshold === 100} onClick={() => setThreshold(100)}>
        100%
      </Pill>
      <Pill active={threshold === 80} onClick={() => setThreshold(80)}>
        více než 80%
      </Pill>
      <Pill active={threshold === 60} onClick={() => setThreshold(60)}>
        více než 60%
      </Pill>
      <Pill active={threshold === 0} onClick={() => setThreshold(0)}>
        Vše
      </Pill>
    </div>
  );
}

function oddsLabel(odds?: number | null): string | null {
  if (odds == null || Number.isNaN(odds)) return null;
  return odds.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function TrendList({ items, threshold }: { items: TrendItem[]; threshold: number }) {
  const shown = items.filter((i) => i.pct >= threshold);
  if (shown.length === 0) {
    return <p className="text-slate-500 light:text-slate-400 text-sm">Žádný vzor nad {threshold}% v tomto vzorku.</p>;
  }
  return (
    <div className="divide-y divide-slate-800 light:divide-slate-200">
      {shown.map((t) => {
        const kurz = oddsLabel(t.odds);
        const tone =
          t.pct >= 80
            ? "bg-emerald-500/15 text-emerald-300 light:bg-emerald-50 light:text-emerald-700"
            : t.pct >= 60
              ? "bg-amber-500/15 text-amber-300 light:bg-amber-50 light:text-amber-800"
              : "bg-slate-800 text-slate-300 light:bg-slate-100 light:text-slate-600";
        return (
          <div key={t.key} className="flex items-center gap-3 py-2 text-sm">
            <span className="flex-1 text-slate-200 light:text-slate-800">{t.label}</span>
            <span className="font-mono text-xs text-slate-500 light:text-slate-500 w-12 text-right">
              {t.hits}/{t.total}
            </span>
            <span className={`badge w-12 justify-center ${tone}`}>{t.pct}%</span>
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
      title="5. Trendy — posledních 5 ligových zápasů"
      note="Malý vzorek (n=5). Kurz je desetinný kurz z PulseScore (Pinnacle), pokud ho ingest k trhu našel. Není to doporučení sázky."
    >
      <ThresholdPills threshold={threshold} setThreshold={setThreshold} />
      <div className="grid grid-cols-[1fr_3rem_3.25rem_3.5rem] text-[11px] uppercase tracking-wide text-slate-500 px-0 mb-1">
        <span />
        <span className="text-right">hits</span>
        <span className="text-center">%</span>
        <span className="text-right">kurz</span>
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
  last3,
  last5,
}: {
  last3: TrendItem[];
  last5: TrendItem[];
}) {
  const [window, setWindow] = useState<"3" | "5">("5");
  const [threshold, setThreshold] = useState<Threshold>(80);
  const items = window === "3" ? last3 : last5;
  return (
    <Section
      title="6. Trendy — vzájemné zápasy"
      note="Statement-level fakta (BTTS, over/under, karty…) jsou nezávislé na straně. Kurz je stejný trh k nadcházejícímu zápasu, ne k historickým H2H."
    >
      <div className="flex gap-2 mb-3">
        <Pill active={window === "3"} onClick={() => setWindow("3")}>
          Poslední 3 vzájemné
        </Pill>
        <Pill active={window === "5"} onClick={() => setWindow("5")}>
          Posledních 5 vzájemných
        </Pill>
      </div>
      <ThresholdPills threshold={threshold} setThreshold={setThreshold} />
      <div className="grid grid-cols-[1fr_3rem_3.25rem_3.5rem] text-[11px] uppercase tracking-wide text-slate-500 mb-1">
        <span />
        <span className="text-right">hits</span>
        <span className="text-center">%</span>
        <span className="text-right">kurz</span>
      </div>
      <TrendList items={items} threshold={threshold} />
    </Section>
  );
}
