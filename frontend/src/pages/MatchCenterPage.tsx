import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "../i18n/router";
import { last5BadgeForTeam, type XgotBadge } from "../lib/xgEfficiency";
import { h2hWithXgot, hasPitchData, hasSimV2, radarXgot } from "../lib/pitchMatch";
import { isStale, useDataIndex, useMatch, usePitchH2H, usePitchTeam, useSimV2, useXgotIndex } from "../lib/useData";
import { buildPrediction, kickoffLabel } from "../mc2/derive";
import { FormCard, H2HCard, H2HStatsCard } from "../mc2/FormH2H";
import { Card, Info, TeamLogo, useScrollFade } from "../mc2/kit";
import { OverviewTab } from "../mc2/Overview";
import { AbsencesCard, PlayersCard, RefereeCard } from "../mc2/People";
import { GoalsBlock, OutcomeBlock, ScorelinesBlock, VolumeBlock } from "../mc2/Prediction";
import { GoalsXgotCard, TeamCompareCard } from "../mc2/Stats";
import { BetbuilderCard, TrendsCard } from "../mc2/Trends";
import type { MatchData } from "../types";
import { t, type Key } from "../i18n/locale";
import { fmtStamp, fmtTime, fmtWeekdayDate } from "../lib/format";
import { useAccess } from "../access/AccessContext";
import { Gate } from "../access/Gate";
import { LOCK } from "../access/locks";
import { allows, type Tier } from "../access/tiers";

const TABS: readonly { id: "overview" | "prediction" | "form" | "stats" | "people" | "referee"; label: Key }[] = [
  { id: "overview", label: "mc.tab.overview" },
  { id: "prediction", label: "mc.tab.prediction" },
  { id: "form", label: "mc.tab.form" },
  { id: "stats", label: "mc.tab.stats" },
  { id: "people", label: "mc.tab.people" },
  { id: "referee", label: "mc.tab.referee" },
];
type TabId = (typeof TABS)[number]["id"];

const TAB_MIN: Record<TabId, Tier | null> = {
  overview: null,
  prediction: LOCK.mcPrediction,
  form: LOCK.mcForm,
  stats: LOCK.mcStats,
  people: null,
  referee: LOCK.mcReferee,
};

/* ---------- hlavička ---------- */

function LuckChip({ badge }: { badge: XgotBadge }) {
  const lucky = badge.id === "lucky_scoring_team";
  const c = lucky ? "var(--c-warn)" : "var(--c-loss)";
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ color: c, background: `color-mix(in oklab, ${c} 14%, transparent)` }}
    >
      {lucky ? t("mc.luck.lucky") : t("mc.luck.unlucky")}
      <Info label={t("mc.luck.what")}>{badge.tooltip}</Info>
    </span>
  );
}

function Hero({ m, badges }: { m: MatchData; badges: { home: XgotBadge | null; away: XgotBadge | null } }) {
  const k = kickoffLabel(m.starting_at);
  const d = new Date(m.starting_at);
  const team = (tm: MatchData["home"], side: "home" | "away", badge: XgotBadge | null) => (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <TeamLogo team={tm} size={56} />
      <div className="text-[15px] font-bold leading-tight sm:text-xl" style={{ overflowWrap: "anywhere" }}>
        {tm.name}
      </div>
      <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: side === "home" ? "var(--c-home)" : "var(--c-away)" }}>
        {side === "home" ? t("mc.side.home") : t("mc.side.away")}
      </div>
      {badge && <LuckChip badge={badge} />}
    </div>
  );
  return (
    <header className="rounded-2xl border border-(--c-line) bg-(--c-surface) px-4 py-5 sm:px-6 sm:py-6">
      <div className="mb-4 text-center text-xs text-(--c-muted)">
        {m.league_name}
        {m.venue ? ` · ${m.venue}` : ""}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 sm:gap-6">
        {team(m.home, "home", badges.home)}
        <div className="flex flex-col items-center gap-1.5 pt-1 text-center">
          <div className="text-xs capitalize text-(--c-muted)">{fmtWeekdayDate(d)}</div>
          <div className="text-2xl font-bold leading-none tabular-nums sm:text-3xl">{fmtTime(d)}</div>
          <span
            className="mt-1 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{
              color: k.live ? "var(--c-loss)" : "var(--c-accent)",
              background: `color-mix(in oklab, ${k.live ? "var(--c-loss)" : "var(--c-accent)"} 14%, transparent)`,
            }}
          >
            {k.text}
          </span>
        </div>
        {team(m.away, "away", badges.away)}
      </div>
    </header>
  );
}

/* ---------- stránka ---------- */

export function MatchCenterPage() {
  const { fixtureId } = useParams();
  const id = Number(fixtureId);
  const [params, setParams] = useSearchParams();
  const { index } = useDataIndex();
  const { match: m, error, missing } = useMatch(Number.isFinite(id) ? id : null);
  const xgotIndex = useXgotIndex();
  const pitchOn = hasPitchData(m?.league_id);
  const homePitch = usePitchTeam(pitchOn && m ? m.home.id : null);
  const awayPitch = usePitchTeam(pitchOn && m ? m.away.id : null);
  const pitchH2H = usePitchH2H(pitchOn);
  const sim = useSimV2(hasSimV2(m?.league_id) && Number.isFinite(id) ? id : null);
  const barRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const on = () => setStuck((barRef.current?.getBoundingClientRect().top ?? 99) <= 57);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const { tier } = useAccess();
  const tab = (TABS.find((x) => x.id === params.get("tab"))?.id ?? "overview") as TabId;
  const tabNeed = (id: TabId): Tier | null => {
    const min = TAB_MIN[id];
    return min && !allows(tier, min) ? min : null;
  };
  const go = (id: string) => {
    setParams(id === "overview" ? {} : { tab: id }, { replace: true });
    requestAnimationFrame(() => {
      const el = barRef.current;
      if (el && el.getBoundingClientRect().top < 70) window.scrollTo({ top: el.offsetTop - 64, behavior: "smooth" });
    });
  };
  const tabFade = useScrollFade('[aria-selected="true"]', tab);
  useEffect(() => {
    document.title = m ? `${m.home.name} – ${m.away.name} · Match Center` : "Match Center";
  }, [m]);

  const back = (
    <Link to={m?.league_id ? `/league/${m.league_id}` : "/"} className="inline-flex min-h-9 items-center text-[13px] text-(--c-accent) hover:underline">
      {t("mc.page.back")}
    </Link>
  );

  if (error)
    return (
      <div className="mc2 mx-auto max-w-3xl px-4 pt-20">
        {back}
        <p className="mt-4 text-(--c-loss)">{t("mc.page.error", { error })}</p>
      </div>
    );
  if (missing)
    return (
      <div className="mc2 mx-auto max-w-3xl px-4 pt-20">
        {back}
        <p className="mt-6 rounded-2xl border border-(--c-line) bg-(--c-surface) p-8 text-center text-(--c-muted)">
          {t("mc.page.missing")}
        </p>
      </div>
    );
  if (!m) return <div className="mc2 flex min-h-[60vh] items-center justify-center text-(--c-muted)">{t("future.loading")}</div>;

  const badges = { home: last5BadgeForTeam(xgotIndex, m.home.id), away: last5BadgeForTeam(xgotIndex, m.away.id) };
  const pitchReady = pitchOn && !!homePitch && !!awayPitch && (!m.league_id || homePitch.league_id === m.league_id);
  const h2hMap = pitchReady ? (pitchH2H?.matches ?? null) : null;
  const h2h = pitchReady ? h2hWithXgot(m, h2hMap) : m.h2h;
  const rx = pitchReady && homePitch && awayPitch ? radarXgot(m, homePitch, awayPitch, h2hMap) : undefined;
  const p = buildPrediction(m, sim);
  const checkedAt = index?.generated_at ?? m.refreshed_at ?? m.built_at;
  const stale = checkedAt ? isStale(checkedAt, index?.stale_after_hours ?? 26) : false;

  return (
    <div className="mc2 mx-auto max-w-6xl px-4 pb-16 pt-20">
      {back}
      {stale && checkedAt && (
        <div className="mt-3 rounded-xl border border-(--c-warn)/40 bg-(--c-warn)/10 px-3 py-2 text-[13px] text-(--c-warn)">
          {t("list.stale", { when: fmtStamp(checkedAt) })}
        </div>
      )}
      <div className="mt-3">
        <Hero m={m} badges={badges} />
      </div>

      <div ref={barRef} data-stuck={stuck}
        className="sticky top-14 z-30 -mx-4 mt-4 bg-(--c-page)/95 px-4 py-2 backdrop-blur before:pointer-events-none before:absolute before:inset-x-0 before:-top-14 before:h-14 before:bg-(--c-page) before:opacity-0 data-[stuck=true]:before:opacity-100"
      >
        <div ref={tabFade.ref} style={tabFade.style} role="tablist" aria-label={t("mc.tabs.aria")} className="no-scrollbar flex gap-1 overflow-x-auto rounded-2xl border border-(--c-line) bg-(--c-surface) p-1">
          {TABS.map((tb, i) => {
            const on = tb.id === tab;
            return (
              <button
                key={tb.id}
                id={`tab-${tb.id}`}
                role="tab"
                type="button"
                aria-selected={on}
                aria-controls={`panel-${tb.id}`}
                tabIndex={on ? 0 : -1}
                onClick={() => go(tb.id)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    const n = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
                    go(n.id);
                    requestAnimationFrame(() => document.getElementById(`tab-${n.id}`)?.focus());
                  }
                }}
                className={`relative min-h-10 flex-1 shrink-0 whitespace-nowrap rounded-xl px-3.5 text-[13px] font-semibold transition-colors ${
                  on ? "bg-(--c-accent) text-(--c-on-accent)" : "text-(--c-muted) hover:text-(--c-text)"
                }`}
              >
                {t(tb.label)}
                {tabNeed(tb.id) ? (
                  <span aria-label={t("gate.locked")} className="ml-1 text-[11px] opacity-70">
                    🔒
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-4 space-y-5">
        {tab === "overview" && <OverviewTab m={m} p={p} badges={badges} go={go} />}

        {tab === "prediction" && (
          <Gate need={LOCK.mcPrediction}>
            <div className="space-y-5">
            <Card title={t("mc.pred.outcome.title")} lead={t("mc.pred.outcome.lead")}>
              <OutcomeBlock p={p} home={m.home} away={m.away} />
            </Card>
            <div className="grid gap-5 md:grid-cols-2">
              <Card title={t("mc.pred.goals.title")} lead={t("mc.pred.goals.lead")}>
                <GoalsBlock p={p} />
              </Card>
              <Card title={t("mc.pred.scorelines.title")} lead={t("mc.pred.scorelines.lead")}>
                <ScorelinesBlock p={p} />
              </Card>
            </div>
            {(p.shots || p.sot || p.corners) && (
              <Card title={t("mc.pred.volume.title")} lead={t("mc.pred.volume.lead")}>
                <VolumeBlock p={p} home={m.home} away={m.away} />
              </Card>
            )}
            <BetbuilderCard m={m} />
            <TrendsCard m={m} />
            </div>
          </Gate>
        )}

        {tab === "form" && (
          <Gate need={LOCK.mcForm}>
            <div className="space-y-5">
            <FormCard m={m} />
            <H2HCard m={m} />
            <H2HStatsCard m={m} h2h={h2h} withXgot={pitchReady} />
            </div>
          </Gate>
        )}

        {tab === "stats" && (
          <Gate need={LOCK.mcStats}>
            <div className="space-y-5">
            <TeamCompareCard m={m} xgot={rx} />
            {pitchReady && <GoalsXgotCard m={m} homeFile={homePitch} awayFile={awayPitch} />}
            </div>
          </Gate>
        )}

        {tab === "people" && (
          <>
            <Gate need={LOCK.mcPlayersTable}>
              <PlayersCard m={m} />
            </Gate>
            <AbsencesCard m={m} />
          </>
        )}

        {tab === "referee" && (
          <Gate need={LOCK.mcReferee}>
            <RefereeCard referee={m.referee} home={m.home} away={m.away} />
          </Gate>
        )}
      </div>

      <footer className="space-y-1 pt-8 text-center text-xs text-(--c-faint)">
        {checkedAt && <p>{t("mc.page.checked", { when: fmtStamp(checkedAt) })}</p>}
      </footer>
    </div>
  );
}
