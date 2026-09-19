import { useState } from "react";
import type { TrendItem } from "../types";
import { Pill, Section, TrendBar } from "./ui";

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

function TrendList({ items, threshold }: { items: TrendItem[]; threshold: number }) {
  const shown = items.filter((i) => i.pct >= threshold);
  if (shown.length === 0) {
    return <p className="text-slate-500 light:text-slate-400 text-sm">Žádný vzor nad {threshold}% v tomto vzorku.</p>;
  }
  return (
    <div className="space-y-2">
      {shown.map((t) => (
        <div key={t.key} className="text-sm">
          <div className="flex justify-between mb-1">
            <span className="text-slate-300 light:text-slate-700">{t.label}</span>
            <span className="font-mono text-slate-400 light:text-slate-500">
              {t.hits}/{t.total} ({t.pct}%)
            </span>
          </div>
          <TrendBar pct={t.pct} />
        </div>
      ))}
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
      note="Malý vzorek (n=5) — u vícero testovaných tvrzení je statisticky očekávané, že se objeví shody čistě náhodou. Ber jako popis, ne predikci."
    >
      <ThresholdPills threshold={threshold} setThreshold={setThreshold} />
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="font-medium text-white light:text-slate-900 mb-2">{homeName}</h3>
          <TrendList items={home} threshold={threshold} />
        </div>
        <div>
          <h3 className="font-medium text-white light:text-slate-900 mb-2">{awayName}</h3>
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
      note="Statement-level fakta (BTTS, over/under, karty…) jsou nezávislé na straně. U poločasových stavů (vedení/remíza/prohra v poločase) bereme perspektivu domácího týmu nadcházejícího zápasu."
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
      <TrendList items={items} threshold={threshold} />
    </Section>
  );
}
