import type { SimulationResult, TeamBrief } from "../types";
import { Section } from "./ui";

export function Simulation({
  sim,
  home,
  away,
}: {
  sim: SimulationResult;
  home: TeamBrief;
  away: TeamBrief;
}) {
  return (
    <Section
      title="7. Simulace 10 000 zápasů"
      subtitle={`n = ${sim.n.toLocaleString("cs-CZ")}`}
      note="Model bere sezónní góly, stáhne je k ligovému průměru (malý vzorek nesmí udělat 70% favorita) a 1X2 ještě přimíchá k typickému ligovému rozložení. Pořád odhad, ne kalibrovaná predikce."
    >
      <div className="grid grid-cols-3 gap-3 mb-6 text-center">
        <div className="bg-slate-900/50 light:bg-slate-100 rounded-lg py-3">
          <div className="text-2xl font-bold text-emerald-400">{sim.home_win_pct}%</div>
          <div className="text-xs text-slate-400 light:text-slate-500 mt-1">{home.name}</div>
        </div>
        <div className="bg-slate-900/50 light:bg-slate-100 rounded-lg py-3">
          <div className="text-2xl font-bold text-slate-300 light:text-slate-700">{sim.draw_pct}%</div>
          <div className="text-xs text-slate-400 light:text-slate-500 mt-1">Remíza</div>
        </div>
        <div className="bg-slate-900/50 light:bg-slate-100 rounded-lg py-3">
          <div className="text-2xl font-bold text-amber-400">{sim.away_win_pct}%</div>
          <div className="text-xs text-slate-400 light:text-slate-500 mt-1">{away.name}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6 text-sm text-center text-slate-300 light:text-slate-700">
        <div>
          <div className="font-mono text-lg">
            {sim.expected_goals.home} : {sim.expected_goals.away}
          </div>
          <div className="text-xs text-slate-500 light:text-slate-400">Očekávané góly (xG model)</div>
        </div>
        <div>
          <div className="font-mono text-lg">{sim.btts_pct}%</div>
          <div className="text-xs text-slate-500 light:text-slate-400">Oba dají gól</div>
        </div>
        <div>
          <div className="font-mono text-lg">
            {sim.over25_pct}% / {sim.under25_pct}%
          </div>
          <div className="text-xs text-slate-500 light:text-slate-400">Over / Under 2.5</div>
        </div>
      </div>

      <h4 className="text-sm font-medium text-slate-300 light:text-slate-700 mb-2">Nejpravděpodobnější výsledky</h4>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {sim.top_scorelines.map((s) => (
          <div key={s.score} className="bg-slate-900/50 light:bg-slate-100 rounded-lg py-2 text-center">
            <div className="font-mono font-bold light:text-slate-800">{s.score}</div>
            <div className="text-xs text-slate-500 light:text-slate-400">{s.pct}%</div>
          </div>
        ))}
      </div>
    </Section>
  );
}
