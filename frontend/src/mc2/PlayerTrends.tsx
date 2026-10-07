import { useState } from "react";
import { Link } from "../i18n/router";
import type { MatchData } from "../types";
import { TREND_STATS, TRENDS_PER_TEAM, trendsForMatch, type SideTrends, type TrendStat } from "../lib/playerTrends";
import { usePlayerTrends } from "../lib/useData";
import { t, type Key } from "../i18n/locale";
import { Card, Info, TeamTitle } from "./kit";

const LABEL: Record<TrendStat, Key> = { sh: "mc.pt.sh", sot: "mc.pt.sot" };

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
                  <span className="shrink-0 rounded-md bg-(--c-raised) px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-(--c-muted)">{t(POS[p.r])}</span>
                )}
              </div>
              {TREND_STATS.map((k) => {
                const run = p[k];
                if (!run) return null;
                return (
                  <div key={k} className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-(--c-muted)">
                    <span className="inline-flex min-w-[4.2rem] justify-center rounded-full border border-(--c-line) px-2 py-0.5 text-[12px] font-medium tabular-nums text-(--c-muted)">
                      {t("mc.pt.len", { n: run.len })}
                    </span>
                    <span className="text-(--c-text)">{t(LABEL[k])}</span>
                    <span className="sr-only">{run.v.join(", ")}</span>
                    <span className="inline-flex gap-0.5" aria-hidden>
                      {run.v.map((v, i) => (
                        <span key={i} className="min-w-[1.3rem] rounded-md bg-(--c-raised) px-0.5 text-center text-[12px] font-semibold tabular-nums text-(--c-text)">
                          {v}
                        </span>
                      ))}
                    </span>
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

export function PlayerTrendsCard({ m }: { m: MatchData }) {
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
      <div className="grid gap-5 sm:grid-cols-2">
        {sides.map((s) => (
          <Side key={s.side} m={m} s={s} />
        ))}
      </div>
    </Card>
  );
}
