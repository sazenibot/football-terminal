import { useState } from "react";
import type { MatchData } from "../types";
import type { XgotBadge } from "../lib/xgEfficiency";
import { buildInsights, formRows, formSummary, h2hRecord, resOf, type Prediction } from "./derive";
import { H2HRecordBar } from "./FormH2H";
import { refereePending } from "./People";
import { PredictionSummary } from "./Prediction";
import { PlayerTrendsCard } from "./PlayerTrends";
import { Card, FormDots, Info, ResBadge, Stat, TeamTitle, type Res } from "./kit";
import { getLocale, intlTag, t } from "../i18n/locale";
import { aiText } from "../components/AiAnalysis";

const TONE = { pos: "var(--c-win)", neutral: "var(--c-faint)", warn: "var(--c-warn)" };

export function InsightsCard({ m, p, badges }: { m: MatchData; p: Prediction; badges: { home: XgotBadge | null; away: XgotBadge | null } }) {
  const list = buildInsights(m, p, badges);
  return (
    <Card title={t("mc.ov.insights.title")} lead={t("mc.ov.insights.lead")}>
      <ul className="space-y-3">
        {list.map((i, k) => (
          <li key={k} className="flex gap-3 text-[14px] leading-snug">
            <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: TONE[i.tone] }} />
            <span>{i.text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function FormMini({ m, onMore }: { m: MatchData; onMore: () => void }) {
  const side = (team: MatchData["home"], form: MatchData["form"]["home"], s: "home" | "away") => {
    const rows = formRows(form, false, s === "home");
    const sum = formSummary(rows);
    const chrono = [...rows].reverse();
    return (
      <div key={s} className="min-w-0">
        <div className="flex min-w-0 text-[13px]">
          <TeamTitle team={team} side={s} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <FormDots results={chrono.map(resOf)} titles={chrono.map((r) => `${r.gf}:${r.ga} ${r.is_home ? t("mc.kit.home") : t("mc.kit.away")} vs ${r.opponent}`)} />
          <span className="shrink-0 text-xs tabular-nums text-(--c-muted)">{t("mc.ov.pts", { pts: sum.pts, n: sum.n })}</span>
        </div>
      </div>
    );
  };
  return (
    <Card
      title={t("mc.ov.form.title")}
      lead={t("mc.ov.form.lead")}
      aside={
        <button type="button" onClick={onMore} className="min-h-9 text-[13px] font-medium text-(--c-accent) hover:underline">
          {t("mc.ov.detail")}
        </button>
      }
    >
      <div className="space-y-4">
        {side(m.home, m.form.home, "home")}
        {side(m.away, m.form.away, "away")}
      </div>
    </Card>
  );
}

export function H2HMini({ m, onMore }: { m: MatchData; onMore: () => void }) {
  const r = h2hRecord(m);
  return (
    <Card
      title={t("mc.ov.h2h.title")}
      lead={r.n ? t("mc.ov.h2h.lead", { n: r.n, team: m.home.name }) : undefined}
      aside={
        <button type="button" onClick={onMore} className="min-h-9 text-[13px] font-medium text-(--c-accent) hover:underline">
          {t("mc.ov.detail")}
        </button>
      }
    >
      {r.n === 0 ? (
        <p className="text-sm text-(--c-muted)">{t("mc.ov.h2h.none", { years: m.h2h_window_years ?? 5 })}</p>
      ) : (
        <>
          <H2HRecordBar m={m} />
          <ul className="mt-3 space-y-1">
            {m.h2h.slice(0, 3).map((x) => (
              <li key={x.fixture_id} className="grid grid-cols-[1.5rem_1fr] items-center gap-2 text-[13px]">
                <ResBadge r={x.result_for_home_team as Res} />
                <span className="truncate text-(--c-muted)">
                  {x.home.name} <b className="mx-1 text-(--c-text) tabular-nums">{x.home_score}:{x.away_score}</b> {x.away.name}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

export function RefereeMini({ m, onMore }: { m: MatchData; onMore: () => void }) {
  const r = m.referee;
  const lc = r?.league_context;
  const more = (
    <button type="button" onClick={onMore} className="min-h-9 text-[13px] font-medium text-(--c-accent) hover:underline">
      {t("mc.ov.detail")}
    </button>
  );
  if (!r) {
    return (
      <Card title={t("mc.tab.referee")} aside={more}>
        <p className="rounded-xl border border-dashed border-(--c-line) px-4 py-4 text-center text-[13px] leading-snug text-(--c-muted)">{refereePending()}</p>
      </Card>
    );
  }
  const num = (v: any) => (typeof v === "number" ? v : null);
  const s = r.season_stats;
  const yellow = num(s?.["Yellowcards"]?.average ?? s?.["Yellowcards"]?.all?.average);
  const fouls = num(s?.["Fouls"]?.average ?? s?.["Fouls"]?.all?.average);
  const red = num(s?.["Redcards"]?.average ?? s?.["Redcards"]?.all?.average);
  const f = (v: number | null) => (v == null ? "—" : v.toLocaleString(intlTag(), { maximumFractionDigits: 2 }));
  return (
    <Card title={t("mc.ov.ref.title", { name: r.name })} lead={t("mc.ov.ref.lead")} aside={more}>
      <div className="grid grid-cols-3 gap-2">
        <Stat value={f(fouls)} label={t("mc.ov.ref.fouls")} sub={lc ? t("mc.ov.ref.leagueShort", { v: f(lc.fouls_per_match) }) : undefined} />
        <Stat value={f(yellow)} label={t("mc.ov.ref.yellows")} sub={lc ? t("mc.ov.ref.leagueShort", { v: f(lc.yellow_per_match) }) : undefined} />
        <Stat value={f(red)} label={t("mc.ov.ref.reds")} sub={lc ? t("mc.ov.ref.leagueShort", { v: f(lc.red_per_match) }) : undefined} />
      </div>
    </Card>
  );
}

/** Čísla v textu od AI formátujeme jako zbytek webu: desetinná čárka (česky) a mezera před procentem. */
function formatAiNumbers(text: string): string {
  const cs = getLocale() === "cs";
  let out = text;
  if (cs) out = out.replace(/(\d+)\.(\d{1,2})(?![\d.])/g, "$1,$2");
  return out.replace(/(\d)\s?%/g, cs ? "$1\u00a0%" : "$1%");
}

export function AiCard({ m }: { m: MatchData }) {
  const [open, setOpen] = useState(false);
  const raw = aiText(m.ai_analysis);
  if (!raw) return null;
  const text = formatAiNumbers(raw);
  return (
    <Card
      title={
        <>
          {t("mc.ov.ai.title")}
          <Info>{t("mc.ov.ai.info")}</Info>
        </>
      }
    >
      <div className={`whitespace-pre-line text-[14px] leading-relaxed text-(--c-muted) ${open ? "" : "clamp-4"}`}>{text}</div>
      <p className="mt-1 text-xs text-(--c-faint)">{t("mc.ov.ai.auto")}</p>
      <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 min-h-9 text-[13px] font-medium text-(--c-accent) hover:underline">
        {open ? t("mc.ov.ai.hide") : t("mc.ov.ai.more")}
      </button>
    </Card>
  );
}

export function OverviewTab({
  m,
  p,
  badges,
  go,
}: {
  m: MatchData;
  p: Prediction;
  badges: { home: XgotBadge | null; away: XgotBadge | null };
  go: (tab: string) => void;
}) {
  return (
    <>
      <PredictionSummary p={p} home={m.home} away={m.away} onMore={() => go("prediction")} />
      <InsightsCard m={m} p={p} badges={badges} />
      <PlayerTrendsCard m={m} />
      <div className="grid gap-5 md:grid-cols-2">
        <FormMini m={m} onMore={() => go("form")} />
        <H2HMini m={m} onMore={() => go("form")} />
      </div>
      <RefereeMini m={m} onMore={() => go("referee")} />
      <AiCard m={m} />
    </>
  );
}
