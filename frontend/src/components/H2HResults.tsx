import { useState } from "react";
import type { H2HMatch, TeamBrief } from "../types";
import { formatDate } from "../lib/format";
import { t, type Key } from "../i18n/locale";
import { Pill, Section } from "./ui";

const RESULT_STYLE: Record<string, string> = {
  V: "border-l-4 border-emerald-500 bg-emerald-500/10",
  R: "border-l-4 border-amber-500 bg-amber-500/10",
  P: "border-l-4 border-rose-500 bg-rose-500/10",
};

const RESULT_LABEL: Record<string, Key> = { V: "mx.h2hr.win", R: "mx.h2hr.draw", P: "mx.h2hr.loss" };

export function H2HResults({
  h2h,
  home,
  totalAvailable,
}: {
  h2h: H2HMatch[];
  home: TeamBrief;
  totalAvailable: number;
}) {
  const [filter, setFilter] = useState<"all" | "home" | "away">("all");
  const [expanded, setExpanded] = useState(false);

  const filtered = h2h.filter((m) => {
    if (filter === "all") return true;
    return filter === "home" ? m.is_home_team_at_home : !m.is_home_team_at_home;
  });
  const visible = expanded ? filtered : filtered.slice(0, 5);
  const hiddenCount = filtered.length - visible.length;

  return (
    <Section
      title={t("mx.h2hr.title")}
      subtitle={t("mx.h2hr.subtitle", { n: h2h.length, total: totalAvailable })}
    >
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-2">
          <Pill
            active={filter === "all"}
            onClick={() => {
              setFilter("all");
              setExpanded(false);
            }}
          >
            {t("mx.common.allPl")}
          </Pill>
          <Pill
            active={filter === "home"}
            onClick={() => {
              setFilter("home");
              setExpanded(false);
            }}
          >
            {t("mx.h2hr.homeAt", { name: home.name })}
          </Pill>
          <Pill
            active={filter === "away"}
            onClick={() => {
              setFilter("away");
              setExpanded(false);
            }}
          >
            {t("mx.h2hr.awayAt", { name: home.name })}
          </Pill>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400 light:text-slate-500 ml-auto">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> {t("mx.h2hr.legendWin", { name: home.name })}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> {t("mx.h2hr.legendDraw")}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> {t("mx.h2hr.legendLoss", { name: home.name })}
          </span>
        </div>
      </div>
      <div className="space-y-2">
        {visible.map((m) => (
          <div
            key={m.fixture_id}
            className={`grid grid-cols-[100px_1fr_auto_1fr] items-center gap-3 text-base py-3 px-4 rounded-lg ${
              RESULT_STYLE[m.result_for_home_team]
            }`}
            title={RESULT_LABEL[m.result_for_home_team] ? t(RESULT_LABEL[m.result_for_home_team]) : undefined}
          >
            <span className="text-slate-400 light:text-slate-500 text-sm">{formatDate(m.date)}</span>
            <span className="text-right font-medium text-slate-100 light:text-slate-800">{m.home.name}</span>
            <span className="font-mono font-bold text-white light:text-slate-900 text-lg px-2 text-center">
              {m.home_score} : {m.away_score}
            </span>
            <span className="font-medium text-slate-100 light:text-slate-800">{m.away.name}</span>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-slate-500 light:text-slate-400 text-sm">{t("mx.h2hr.empty")}</p>
        )}
      </div>
      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-3 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          {t("mx.h2hr.more", { n: hiddenCount })}
        </button>
      )}
      {expanded && filtered.length > 5 && (
        <button
          onClick={() => setExpanded(false)}
          className="mt-3 text-sm text-slate-500 hover:text-slate-300 light:hover:text-slate-700 transition-colors"
        >
          {t("mx.h2hr.less")}
        </button>
      )}
    </Section>
  );
}
