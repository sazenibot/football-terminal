import type { ReactNode } from "react";
import type { TeamBrief } from "../types";
import type { Prediction } from "./derive";
import { t } from "../i18n/locale";
import { Card, Info, MeterBar, MirrorRow, ProbBar, SideHeads, SubTitle, ValueTag, n1, n2, pct } from "./kit";

/* ---------- Kdo vyhraje ---------- */

function OutcomeCol({
  name,
  value,
  color,
  market,
  odd,
  align,
}: {
  name: string;
  value: number;
  color: string;
  market?: number;
  odd?: number;
  align: "left" | "center" | "right";
}) {
  const a = align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center";
  const j = align === "left" ? "justify-start" : align === "right" ? "justify-end" : "justify-center";
  return (
    <div className={`min-w-0 ${a}`}>
      <div className="truncate text-xs font-medium text-(--c-muted)">{name}</div>
      <div className="mt-0.5 text-[28px] font-bold leading-none tabular-nums sm:text-4xl" style={{ color }}>
        {pct(value)}
      </div>
      {market != null && (
        <div className="mt-2 text-[11px] leading-snug text-(--c-muted)">
          <div className="tabular-nums">
            {t("mc.pr.bookmaker", { p: pct(market) })}
            {odd != null && <span className="text-(--c-faint)"> · {t("mc.pr.odds", { v: n2(odd) })}</span>}
          </div>
          <div className={`mt-1 flex ${j}`}>
            <ValueTag model={value} market={market} />
          </div>
        </div>
      )}
    </div>
  );
}

export function OutcomeBlock({ p, home, away }: { p: Prediction; home: TeamBrief; away: TeamBrief }) {
  const mk = p.market;
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
        <OutcomeCol name={home.name} value={p.home} color="var(--c-home)" market={mk?.home_win_pct} odd={mk?.odds.home} align="left" />
        <OutcomeCol name={t("mc.pr.draw")} value={p.draw} color="var(--c-muted)" market={mk?.draw_pct} odd={mk?.odds.draw} align="center" />
        <OutcomeCol name={away.name} value={p.away} color="var(--c-away)" market={mk?.away_win_pct} odd={mk?.odds.away} align="right" />
      </div>
      <div className="mt-3">
        <ProbBar home={p.home} draw={p.draw} away={p.away} />
      </div>
      {mk && (
        <p className="mt-2 text-[11px] text-(--c-faint)">
          {t("mc.pr.bookmakerNote")}
        </p>
      )}
    </div>
  );
}

/* ---------- Shrnutí na Přehledu ---------- */

export function PredictionSummary({ p, home, away, onMore }: { p: Prediction; home: TeamBrief; away: TeamBrief; onMore: () => void }) {
  const top = p.scorelines[0];
  return (
    <Card
      title={t("mc.pr.sum.title")}
      lead={t("mc.pr.sum.lead")}
      aside={
        <button type="button" onClick={onMore} className="min-h-9 text-[13px] font-medium text-(--c-accent) hover:underline">
          {t("mc.pr.sum.more")}
        </button>
      }
    >
      <OutcomeBlock p={p} home={home} away={away} />

      <div className="mt-5 grid grid-cols-3 gap-2">
        <MiniFact
          label={t("mc.pr.xg")}
          value={
            <>
              <span style={{ color: "var(--c-home)" }}>{n2(p.xg.home)}</span>
              <span className="mx-1 text-(--c-faint)">:</span>
              <span style={{ color: "var(--c-away)" }}>{n2(p.xg.away)}</span>
            </>
          }
        />
        <MiniFact label={t("mc.pr.topScore")} value={top ? top.score.replace("-", ":") : "—"} sub={top ? pct(top.pct, 1) : undefined} />
        <MiniFact
          label={t("mc.pr.over25goals")}
          value={pct(p.over25)}
          sub={p.market?.over25_pct != null ? t("mc.pr.bookmaker", { p: pct(p.market.over25_pct) }) : undefined}
          tag={<ValueTag model={p.over25} market={p.market?.over25_pct} />}
        />
      </div>
    </Card>
  );
}

function MiniFact({ label, value, sub, tag }: { label: string; value: ReactNode; sub?: string; tag?: ReactNode }) {
  return (
    <div className="rounded-xl bg-(--c-raised) px-2 py-3 text-center">
      <div className="text-lg font-bold leading-none tabular-nums sm:text-xl">{value}</div>
      <div className="mt-1.5 text-[11px] leading-tight text-(--c-muted)">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-(--c-faint)">{sub}</div>}
      {tag && <div className="mt-1 flex justify-center">{tag}</div>}
    </div>
  );
}

/* ---------- Detail: góly ---------- */

function LineRow({
  label,
  value,
  market,
  odd,
  emphasize = false,
}: {
  label: string;
  value: number;
  market?: number;
  odd?: number;
  emphasize?: boolean;
}) {
  return (
    <div className="py-1.5">
      <div className="grid grid-cols-[5.5rem_1fr_3.25rem] items-center gap-3">
        <span className={`text-sm ${emphasize ? "font-semibold" : "text-(--c-muted)"}`}>{label}</span>
        <MeterBar value={value} color={emphasize ? "var(--c-accent)" : "var(--c-faint)"} height={8} />
        <span className={`text-right text-sm tabular-nums ${emphasize ? "font-bold" : "text-(--c-muted)"}`}>{pct(value)}</span>
      </div>
      {market != null && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-[6.25rem] text-[11px] text-(--c-faint)">
          <span className="tabular-nums">
            {t("mc.pr.bookmaker", { p: pct(market) })}
            {odd != null && <> · {t("mc.pr.odds", { v: n2(odd) })}</>}
          </span>
          <ValueTag model={value} market={market} />
        </div>
      )}
    </div>
  );
}

export function GoalsBlock({ p }: { p: Prediction }) {
  const mk = p.market;
  return (
    <div>
      <div className="mb-4 flex items-end justify-center gap-3 text-center">
        <div>
          <div className="text-4xl font-bold leading-none tabular-nums" style={{ color: "var(--c-home)" }}>
            {n2(p.xg.home)}
          </div>
        </div>
        <div className="pb-1 text-xl text-(--c-faint)">:</div>
        <div>
          <div className="text-4xl font-bold leading-none tabular-nums" style={{ color: "var(--c-away)" }}>
            {n2(p.xg.away)}
          </div>
        </div>
      </div>
      <div className="mb-4 text-center text-xs text-(--c-muted)">
        {t("mc.pr.xgAvg")}
        <Info>{t("mc.pr.xgAvgInfo")}</Info>
      </div>

      <SubTitle>{t("mc.pr.howManyGoals")}</SubTitle>
      {p.over15 != null && <LineRow label={t("mc.pr.line.over15")} value={p.over15} market={mk?.over15_pct} odd={mk?.odds.over15} />}
      <LineRow label={t("mc.pr.line.over25")} value={p.over25} emphasize market={mk?.over25_pct} odd={mk?.odds.over25} />
      {p.over35 != null && <LineRow label={t("mc.pr.line.over35")} value={p.over35} market={mk?.over35_pct} odd={mk?.odds.over35} />}
      <LineRow label={t("mc.pr.line.under25")} value={p.under25} market={mk?.under25_pct} odd={mk?.odds.under25} />

      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-(--c-raised) px-3 py-2.5">
        <span className="text-[13px] text-(--c-muted)">
          {t("mc.pr.btts")}
          <Info>{t("mc.pr.approx")}</Info>
        </span>
        <span className="text-sm font-semibold tabular-nums text-(--c-muted)">{pct(p.btts)}</span>
      </div>
    </div>
  );
}

/* ---------- Detail: střely a rohy ---------- */

export function VolumeBlock({ p, home, away }: { p: Prediction; home: TeamBrief; away: TeamBrief }) {
  if (!p.shots && !p.sot && !p.corners) return null;
  return (
    <div>
      <SideHeads home={home} away={away} />
      {p.shots && (
        <MirrorRow
          label={t("mc.pr.shots")}
          home={p.shots.home}
          away={p.shots.away}
          note={p.shots.league_avg != null ? t("mc.pr.leagueAvg", { n: n1(p.shots.league_avg) }) : undefined}
        />
      )}
      {p.sot && (
        <MirrorRow
          label={t("mc.pr.sot")}
          hint={t("mc.pr.sotHint")}
          home={p.sot.home}
          away={p.sot.away}
          note={p.sot.league_avg != null ? t("mc.pr.leagueAvg", { n: n1(p.sot.league_avg) }) : undefined}
        />
      )}
      {p.corners && (
        <MirrorRow
          label={t("mc.pr.corners")}
          muted
          hint={t("mc.pr.approx")}
          home={p.corners.home}
          away={p.corners.away}
          note={t("mc.pr.approxNote")}
        />
      )}
    </div>
  );
}

/* ---------- Detail: nejpravděpodobnější výsledky ---------- */

export function ScorelinesBlock({ p }: { p: Prediction }) {
  const list = p.scorelines.slice(0, 6);
  const max = Math.max(...list.map((s) => s.pct), 1);
  return (
    <div className="space-y-1.5">
      {list.map((s, i) => (
        <div key={s.score} className="grid grid-cols-[3rem_1fr_3.5rem] items-center gap-3">
          <span className={`text-sm tabular-nums ${i === 0 ? "font-bold" : "text-(--c-muted)"}`}>{s.score.replace("-", ":")}</span>
          <MeterBar value={(s.pct / max) * 100} color={i === 0 ? "var(--c-accent)" : "var(--c-faint)"} height={8} />
          <span className="text-right text-xs tabular-nums text-(--c-muted)">{pct(s.pct, 1)}</span>
        </div>
      ))}
      <p className="pt-1 text-[11px] text-(--c-faint)">{t("mc.pr.scoreNote")}</p>
    </div>
  );
}
