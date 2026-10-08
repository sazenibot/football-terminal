import { useState } from "react";
import type { TeamBrief } from "../types";
import { Section } from "./ui";
import { intlTag, t } from "../i18n/locale";

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

const pct = (n: number) => t("fmt.pct", { n: n.toLocaleString(intlTag(), { maximumFractionDigits: 1 }) });
const x2 = (n: number) => n.toLocaleString(intlTag(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const x1 = (n: number) => n.toLocaleString(intlTag(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function Diff({ model, market }: { model: number; market?: number }) {
  if (market == null) return null;
  const d = model - market;
  const tone = Math.abs(d) < 3 ? "text-slate-400 light:text-slate-500" : d > 0 ? "text-emerald-400" : "text-rose-400";
  return (
    <div className={`text-xs mt-0.5 ${tone}`}>
      {t("mx.simv2.diff", {
        market: pct(market),
        diff: `${d > 0 ? "+" : ""}${d.toLocaleString(intlTag(), { maximumFractionDigits: 1 })}`,
      })}
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
      <div className="font-mono text-sm text-slate-400 light:text-slate-500 text-right min-w-[3.5rem]">{x1(side.total ?? side.home + side.away)}</div>
      <div className="text-xs text-slate-400 light:text-slate-500 col-span-4">
        {t("mx.simv2.volumeSides", { home: homeName, away: awayName })}
        {side.league_avg != null ? t("mx.simv2.volumeLeague", { n: x1(side.league_avg) }) : ""}
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
        {t("mx.simv2.method", {
          goalsFit: t("fmt.pct", { n: Math.round((1 - (sim.params.opp_xg_blend ?? 0.6)) * 100) }),
          xgFit: t("fmt.pct", { n: Math.round((sim.params.opp_xg_blend ?? 0.6) * 100) }),
          maxGoals: sim.params.max_goals,
          prev: sim.league.prev_stats ?? "?",
        })}
      </p>
      {meta && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 light:text-slate-500">
              <th className="text-left font-normal pb-1">Rating</th>
              <th className="text-right font-normal pb-1 px-2">{home.name}</th>
              <th className="text-right font-normal pb-1 pl-2">{away.name}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-800 light:border-slate-200">
              <td className="py-1.5 text-slate-400 light:text-slate-500">{t("mx.simv2.ratingAttDef")}</td>
              <td className="py-1.5 px-2 text-right font-mono text-emerald-300">
                {x2(meta.att_goals ?? 0)} / {x2(meta.def_goals_home ?? 0)}
              </td>
              <td className="py-1.5 pl-2 text-right font-mono text-amber-300">
                {x2(meta.att_goals_away ?? 0)} / {x2(meta.def_goals_away ?? 0)}
              </td>
            </tr>
            <tr className="border-t border-slate-800 light:border-slate-200">
              <td className="py-1.5 text-slate-400 light:text-slate-500">{t("mx.simv2.ratingLam")}</td>
              <td className="py-1.5 px-2 text-right font-mono text-emerald-300">
                {x2(meta.lam_goals?.[0] ?? 0)} → {x2(meta.lam_xg?.[0] ?? 0)} → {x2(m.expected_goals.home)}
              </td>
              <td className="py-1.5 pl-2 text-right font-mono text-amber-300">
                {x2(meta.lam_goals?.[1] ?? 0)} → {x2(meta.lam_xg?.[1] ?? 0)} → {x2(m.expected_goals.away)}
              </td>
            </tr>
            <tr className="border-t border-slate-800 light:border-slate-200">
              <td className="py-1.5 text-slate-400 light:text-slate-500">{t("mx.simv2.rest")}</td>
              <td className="py-1.5 px-2 text-right font-mono">{meta.rest?.home ?? "—"}</td>
              <td className="py-1.5 pl-2 text-right font-mono">{meta.rest?.away ?? "—"}</td>
            </tr>
          </tbody>
        </table>
      )}
      <p className="text-xs text-slate-400 light:text-slate-500">
        {t("mx.simv2.hfa", {
          goals: x2(meta?.hfa_goals ?? 0),
          xg: x2(meta?.hfa_xg ?? 0),
          cur: sim.league.matches_current,
          prev: sim.league.matches_prev,
        })}
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
      title={t("mx.sim.title")}
      subtitle={t("mx.simv2.subtitle")}
      note={t("mx.simv2.note")}
    >
      <div className="grid grid-cols-3 gap-3 mb-4 text-center">
        <Outcome value={m.home_win_pct} label={home.name} market={mk?.home_win_pct} color="text-emerald-400" />
        <Outcome value={m.draw_pct} label={t("mx.common.draw")} market={mk?.draw_pct} color="text-slate-300 light:text-slate-700" />
        <Outcome value={m.away_win_pct} label={away.name} market={mk?.away_win_pct} color="text-amber-400" />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4 text-sm text-center text-slate-300 light:text-slate-700">
        <div>
          <div className="font-mono text-lg">
            {x2(m.expected_goals.home)} : {x2(m.expected_goals.away)}
          </div>
          <div className="text-xs text-slate-400 light:text-slate-500">{t("mx.simv2.xg")}</div>
        </div>
        <div>
          <div className="font-mono text-lg">
            {pct(m.over25_pct)} / {pct(m.under25_pct)}
          </div>
          <div className="text-xs text-slate-400 light:text-slate-500">Over / Under 2.5</div>
          {mk?.over25_pct != null && (
            <div className="text-xs text-slate-400 light:text-slate-500 mt-0.5">
              {t("mx.simv2.chanceOu", { over: pct(mk.over25_pct), under: pct(mk.under25_pct ?? 0) })}
            </div>
          )}
        </div>
      </div>

      {hasVolume && (
        <div className="mb-4 rounded-lg bg-slate-900/40 light:bg-slate-50 px-3 py-1">
          <div className="text-xs uppercase tracking-wide text-slate-400 light:text-slate-500 pt-2 pb-1">{t("mx.simv2.volumeTitle")}</div>
          <VolumeRow label={t("mx.simv2.shots")} side={m.expected_shots} homeName={home.name} awayName={away.name} />
          <VolumeRow label={t("mx.simv2.sot")} side={m.expected_sot} homeName={home.name} awayName={away.name} />
        </div>
      )}

      <h4 className="text-sm font-medium text-slate-300 light:text-slate-700 mb-2">{t("mx.sim.topScores")}</h4>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {m.top_scorelines.map((s) => (
          <div key={s.score} className="bg-slate-900/50 light:bg-slate-100 rounded-lg py-2 text-center">
            <div className="font-mono font-bold light:text-slate-800">{s.score}</div>
            <div className="text-xs text-slate-400 light:text-slate-500">{pct(s.pct)}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 text-xs text-slate-400 light:text-slate-500 space-y-0.5">
        <div>
          {t("mx.simv2.rough", {
            btts: pct(m.btts_pct),
            corners: m.expected_corners
              ? t("mx.simv2.corners", {
                  home: x1(m.expected_corners.home),
                  away: x1(m.expected_corners.away),
                  total: x1(m.expected_corners.total ?? m.expected_corners.home + m.expected_corners.away),
                })
              : "",
          })}
        </div>
        {mk && (
          <div>
            {t("mx.simv2.odds", {
              home: x2(mk.odds.home),
              draw: x2(mk.odds.draw),
              away: x2(mk.odds.away),
              margin: pct(mk.margin_pct),
            })}
          </div>
        )}
      </div>

      <button type="button" onClick={() => setOpen((o) => !o)} className="mt-4 text-sm text-emerald-400 hover:underline">
        {open ? t("mx.simv2.hide") : t("mx.simv2.show")}
      </button>
      {open && <Breakdown sim={sim} home={home} away={away} />}
    </Section>
  );
}
