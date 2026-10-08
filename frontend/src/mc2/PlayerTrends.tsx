import { useState } from "react";
import { Link } from "../i18n/router";
import type { MatchData } from "../types";
import { TREND_STATS, TRENDS_PER_TEAM, trendsForMatch, type SideTrends, type TrendStat } from "../lib/playerTrends";
import { usePlayerTrends } from "../lib/useData";
import { t, type Key } from "../i18n/locale";
import { Card, Info, TeamTitle } from "./kit";

const LABEL: Record<TrendStat, Key> = { sh: "mc.pt.sh", sot: "mc.pt.sot" };
const WHAT: Record<TrendStat, Key> = { sh: "mc.pt.what.sh", sot: "mc.pt.what.sot" };

const POS: Record<string, Key> = { att: "mc.pt.pos.att", mid: "mc.pt.pos.mid", def: "mc.pt.pos.def" };

function Side({ m, s }: { m: MatchData; s: SideTrends }) {
  const [all, setAll] = useState(false);
  const shown = all ? s.items : s.items.slice(0, TRENDS_PER_TEAM);
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 text-[13px]">
        <TeamTitle team={m[s.side]} side={s.side} />
      </div>
      {s.items.length === 0 ? (
        <p className="mt-2 text-[13px] text-(--c-muted)">{t("mc.pt.none")}</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {shown.map((p) => (
            <li key={p.id}>
              <div className="flex items-center gap-2">
                <Link to={`/catalog/players/${p.id}`} className="min-w-0 truncate text-[14px] font-medium hover:text-(--c-accent) hover:underline">
                  {p.name}
                </Link>
                {p.r && POS[p.r] && (
                  <span className="shrink-0 rounded-md bg-(--c-raised) px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-(--c-muted)">{t(POS[p.r])}</span>
                )}
              </div>
              {TREND_STATS.map((k) => {
                const run = p[k];
                if (!run) return null;
                return (
                  <div key={k} className="mt-1.5 rounded-xl bg-(--c-raised)/60 px-3 py-2 text-[13px] leading-snug text-(--c-muted)">
                    <p>
                      {t("mc.pt.holds", { stat: t(LABEL[k]), n: run.len })}
                    </p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-xs">{t("mc.pt.perMatch", { what: t(WHAT[k]) })}</span>
                      <span className="sr-only">{run.v.join(", ")}</span>
                      <span className="inline-flex gap-1" aria-hidden>
                        {run.v.map((v, i) => (
                          <span key={i} className="min-w-[1.6rem] rounded-md bg-(--c-surface) px-1 py-0.5 text-center text-[13px] font-semibold tabular-nums text-(--c-text)">
                            {v}
                          </span>
                        ))}
                      </span>
                    </p>
                  </div>
                );
              })}
            </li>
          ))}
        </ul>
      )}
      {s.items.length > TRENDS_PER_TEAM && (
        <button type="button" onClick={() => setAll((x) => !x)} className="mt-2 min-h-9 text-[13px] font-medium text-(--c-accent) hover:underline">
          {all ? t("mc.pt.less") : t("mc.pt.more", { n: s.items.length - TRENDS_PER_TEAM })}
        </button>
      )}
    </div>
  );
}

export function PlayerTrendsCard({ m, stack }: { m: MatchData; stack?: boolean }) {
  const file = usePlayerTrends(m.league_id);
  const sides = trendsForMatch(file, m);
  if (!file || !sides) return null;
  return (
    <Card
      title={
        <>
          {t("mc.pt.title")}
          <Info>{t("mc.pt.info")}</Info>
        </>
      }
      lead={t("mc.pt.lead")}
    >
      <div className={stack ? "space-y-5" : "grid gap-5 sm:grid-cols-2"}>
        {sides.map((s) => (
          <Side key={s.side} m={m} s={s} />
        ))}
      </div>
    </Card>
  );
}
