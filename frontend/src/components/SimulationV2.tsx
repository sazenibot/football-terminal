import { useState } from "react";
import type { TeamBrief } from "../types";
import { Section } from "./ui";

type SideTotal = { home: number; away: number; total?: number; league_avg?: number; hfa?: number };

export type SimV2 = {
  fixture_id: number;
  generated_at: string;
  method: string;
  params: Record<string, number>;
  league: { matches_current: number; matches_prev: number; prev_stats?: number };
  opp_meta?: {
    hfa_goals?: number;
    hfa_xg?: number;
    att_goals?: number;
    att_goals_away?: number;
    def_goals_home?: number;
    def_goals_away?: number;
    lam_goals?: number[];
    lam_xg?: number[];
    rest?: { home: number | null; away: number | null };
  };
  model: {
    home_win_pct: number;
    draw_pct: number;
    away_win_pct: number;
    btts_pct: number;
    over15_pct: number;
    over25_pct: number;
    under25_pct: number;
    over35_pct: number;
    top_scorelines: { score: string; pct: number }[];
    expected_goals: { home: number; away: number };
    expected_shots?: SideTotal;
    expected_sot?: SideTotal;
    expected_corners?: SideTotal;
  };
  market: {
    home_win_pct: number;
    draw_pct: number;
    away_win_pct: number;
    margin_pct: number;
    over15_pct?: number;
    over25_pct?: number;
    over35_pct?: number;
    under25_pct?: number;
    odds: Record<string, number>;
  } | null;
};

const pct = (n: number) => `${n.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %`;
const x2 = (n: number) => n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const x1 = (n: number) => n.toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function Diff({ model, market }: { model: number; market?: number }) {
  if (market == null) return null;
  const d = model - market;
  const tone = Math.abs(d) < 3 ? "text-slate-500" : d > 0 ? "text-emerald-400" : "text-rose-400";
  return (
    <div className={`text-[11px] mt-0.5 ${tone}`}>
      Chance {pct(market)} · {d > 0 ? "+" : ""}
      {d.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} b.
    </div>
  );
}

function Outcome({ value, label, market, color }: { value: number; label: string; market?: number; color: string }) {
  return (
    <div className="bg-slate-900/50 light:bg-slate-100 rounded-lg py-3 px-2">
      <div className={`text-2xl font-bold ${color}`}>{pct(value)}</div>
      <div className="text-xs text-slate-400 light:text-slate-500 mt-1">{label}</div>
      <Diff model={value} market={market} />
    </div>
  );
}

function VolumeRow({
  label,
  side,
  homeName,
  awayName,
}: {
  label: string;
  side?: SideTotal;
  homeName: string;
  awayName: string;
}) {
  if (!side) return null;
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-0.5 items-baseline py-2 border-t border-slate-800 light:border-slate-200 first:border-0">
      <div className="text-sm text-slate-300 light:text-slate-700">{label}</div>
      <div className="font-mono text-sm text-emerald-400 text-right min-w-[3rem]">{x1(side.home)}</div>
      <div className="font-mono text-sm text-amber-400 text-right min-w-[3rem]">{x1(side.away)}</div>
      <div className="font-mono text-sm text-slate-400 text-right min-w-[3.5rem]">{x1(side.total ?? side.home + side.away)}</div>
      <div className="text-[11px] text-slate-500 col-span-4">
        {homeName} / {awayName} / celkem
        {side.league_avg != null ? ` · liga Ø ${x1(side.league_avg)} na tým` : ""}
      </div>
    </div>
  );
}

function Breakdown({ sim, home, away }: { sim: SimV2; home: TeamBrief; away: TeamBrief }) {
  const meta = sim.opp_meta;
  const m = sim.model;
  return (
    <div className="mt-4 text-sm space-y-3">
      <p className="text-slate-400 light:text-slate-500">
        Góly: Maher ratingy útok/obrana se silou soupeře, {Math.round((1 - (sim.params.opp_xg_blend ?? 0.6)) * 100)} % gólový fit +{" "}
        {Math.round((sim.params.opp_xg_blend ?? 0.6) * 100)} % xG fit, loňská sezona jako prior, obrana se k loňsku stahuje víc než
        útok. Skóre se počítá přesně z Poissonovy mřížky 0–{sim.params.max_goals}. Oba dají gól a over jsou kalibrované
        (zpětně se ukázalo, že surové hodnoty byly příliš sebejisté). Střely, SOT a rohy: doma/venku rate týmu a soupeře
        stažený k loňsku ({sim.league.prev_stats ?? "?"} zápasů se stats), nováčci berou průměr spodních 3 týmů. Kurz Chance
        do modelu nevstupuje.
      </p>
      {meta && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500">
              <th className="text-left font-normal pb-1">Rating</th>
              <th className="text-right font-normal pb-1 px-2">{home.name}</th>
              <th className="text-right font-normal pb-1 pl-2">{away.name}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-800 light:border-slate-200">
              <td className="py-1.5 text-slate-400">Útok / obrana (góly)</td>
              <td className="py-1.5 px-2 text-right font-mono text-emerald-300">
                {x2(meta.att_goals ?? 0)} / {x2(meta.def_goals_home ?? 0)}
              </td>
              <td className="py-1.5 pl-2 text-right font-mono text-amber-300">
                {x2(meta.att_goals_away ?? 0)} / {x2(meta.def_goals_away ?? 0)}
              </td>
            </tr>
            <tr className="border-t border-slate-800 light:border-slate-200">
              <td className="py-1.5 text-slate-400">λ góly → xG → finál</td>
              <td className="py-1.5 px-2 text-right font-mono text-emerald-300">
                {x2(meta.lam_goals?.[0] ?? 0)} → {x2(meta.lam_xg?.[0] ?? 0)} → {x2(m.expected_goals.home)}
              </td>
              <td className="py-1.5 pl-2 text-right font-mono text-amber-300">
                {x2(meta.lam_goals?.[1] ?? 0)} → {x2(meta.lam_xg?.[1] ?? 0)} → {x2(m.expected_goals.away)}
              </td>
            </tr>
            <tr className="border-t border-slate-800 light:border-slate-200">
              <td className="py-1.5 text-slate-400">Odpočinek (dny)</td>
              <td className="py-1.5 px-2 text-right font-mono">{meta.rest?.home ?? "—"}</td>
              <td className="py-1.5 pl-2 text-right font-mono">{meta.rest?.away ?? "—"}</td>
            </tr>
          </tbody>
        </table>
      )}
      <p className="text-xs text-slate-500">
        Domácí výhoda góly {x2(meta?.hfa_goals ?? 0)}, xG {x2(meta?.hfa_xg ?? 0)}. Historie do výpočtu: {sim.league.matches_current}{" "}
        letošních + {sim.league.matches_prev} loňských zápasů.
      </p>
    </div>
  );
}

export function SimulationV2({ sim, home, away }: { sim: SimV2; home: TeamBrief; away: TeamBrief }) {
  const [open, setOpen] = useState(false);
  const m = sim.model;
  const mk = sim.market;
  const hasVolume = m.expected_shots || m.expected_sot;
  return (
    <Section
      title="7. Simulace 10 000 zápasů"
      subtitle="síla soupeřů · góly + xG · střely"
      note="Chance Liga, data PitchAPI. Zpětný test na 346 zápasech dvou sezon: o něco přesnější než model bez síly soupeřů a u střel i střel na branku přesnější než ligový průměr. Pořád odhad, ne záruka. Kurz Chance je jen srovnání, do modelu nevstupuje."
    >
      <div className="grid grid-cols-3 gap-3 mb-4 text-center">
        <Outcome value={m.home_win_pct} label={home.name} market={mk?.home_win_pct} color="text-emerald-400" />
        <Outcome value={m.draw_pct} label="Remíza" market={mk?.draw_pct} color="text-slate-300 light:text-slate-700" />
        <Outcome value={m.away_win_pct} label={away.name} market={mk?.away_win_pct} color="text-amber-400" />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4 text-sm text-center text-slate-300 light:text-slate-700">
        <div>
          <div className="font-mono text-lg">
            {x2(m.expected_goals.home)} : {x2(m.expected_goals.away)}
          </div>
          <div className="text-xs text-slate-500 light:text-slate-400">Očekávané góly</div>
        </div>
        <div>
          <div className="font-mono text-lg">
            {pct(m.over25_pct)} / {pct(m.under25_pct)}
          </div>
          <div className="text-xs text-slate-500 light:text-slate-400">Over / Under 2.5</div>
          {mk?.over25_pct != null && (
            <div className="text-[11px] text-slate-500 mt-0.5">
              Chance {pct(mk.over25_pct)} / {pct(mk.under25_pct ?? 0)}
            </div>
          )}
        </div>
      </div>

      {hasVolume && (
        <div className="mb-4 rounded-lg bg-slate-900/40 light:bg-slate-50 px-3 py-1">
          <div className="text-xs uppercase tracking-wide text-slate-500 pt-2 pb-1">Střely (očekávané)</div>
          <VolumeRow label="Střely" side={m.expected_shots} homeName={home.name} awayName={away.name} />
          <VolumeRow label="Střely na branku" side={m.expected_sot} homeName={home.name} awayName={away.name} />
        </div>
      )}

      <h4 className="text-sm font-medium text-slate-300 light:text-slate-700 mb-2">Nejpravděpodobnější výsledky</h4>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {m.top_scorelines.map((s) => (
          <div key={s.score} className="bg-slate-900/50 light:bg-slate-100 rounded-lg py-2 text-center">
            <div className="font-mono font-bold light:text-slate-800">{s.score}</div>
            <div className="text-xs text-slate-500 light:text-slate-400">{pct(s.pct)}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 text-xs text-slate-500 space-y-0.5">
        <div>
          Orientačně: oba dají gól {pct(m.btts_pct)}
          {m.expected_corners
            ? ` · rohy ${x1(m.expected_corners.home)} : ${x1(m.expected_corners.away)} (celkem ${x1(
                m.expected_corners.total ?? m.expected_corners.home + m.expected_corners.away,
              )})`
            : ""}
          . U těchto dvou čísel zpětný test neprokázal, že by byla výrazně lepší než ligový průměr.
        </div>
        {mk && (
          <div>
            Chance 1X2 kurz {x2(mk.odds.home)} / {x2(mk.odds.draw)} / {x2(mk.odds.away)}, marže {pct(mk.margin_pct)} odečtena.
          </div>
        )}
      </div>

      <button type="button" onClick={() => setOpen((o) => !o)} className="mt-4 text-sm text-emerald-400 hover:underline">
        {open ? "Skrýt, jak číslo vzniklo" : "Ukázat, jak číslo vzniklo"}
      </button>
      {open && <Breakdown sim={sim} home={home} away={away} />}
    </Section>
  );
}
