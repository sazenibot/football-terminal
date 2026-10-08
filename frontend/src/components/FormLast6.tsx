import { useState } from "react";
import type { FormSide, MatchFacts, TeamBrief } from "../types";
import { Pill, ResultBadge, Section } from "./ui";
import { t } from "../i18n/locale";

function resultOf(m: MatchFacts): "V" | "R" | "P" {
  return m.gf > m.ga ? "V" : m.gf === m.ga ? "R" : "P";
}

/** Výrazný štítek doma/venku — ikonka + text, ať to nesplývá s okolním textem. */
function VenueTag({ isHome }: { isHome: boolean }) {
  return (
    <span
      title={isHome ? t("mx.common.home") : t("mx.common.away")}
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
        isHome
          ? "bg-sky-500/15 text-sky-300 light:bg-sky-100 light:text-sky-700"
          : "bg-orange-500/15 text-orange-300 light:bg-orange-100 light:text-orange-700"
      }`}
    >
      <span aria-hidden>{isHome ? "🏠" : "✈️"}</span>
      {isHome ? t("mx.form.venueHome") : t("mx.form.venueAway")}
    </span>
  );
}

function TeamForm({ team, form }: { team: TeamBrief; form: FormSide }) {
  const [filter, setFilter] = useState<"all" | "home" | "away">("all");

  const source =
    filter === "all"
      ? form.recent_all.slice(0, 6)
      : form.recent_all.filter((m) => (filter === "home" ? m.is_home : !m.is_home)).slice(0, 6);

  const pts = source.reduce((a, m) => a + (m.gf > m.ga ? 3 : m.gf === m.ga ? 1 : 0), 0);
  const gf = source.reduce((a, m) => a + m.gf, 0);
  const ga = source.reduce((a, m) => a + m.ga, 0);

  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium text-white light:text-slate-900 flex items-center gap-2">
          {team.image && <img src={team.image} alt="" className="h-6 w-6 object-contain" />}
          {team.name}
        </h3>
        <div className="flex gap-1">
          <Pill active={filter === "all"} onClick={() => setFilter("all")}>
            {t("mx.common.all")}
          </Pill>
          <Pill active={filter === "home"} onClick={() => setFilter("home")}>
            {t("mx.common.home")}
          </Pill>
          <Pill active={filter === "away"} onClick={() => setFilter("away")}>
            {t("mx.common.away")}
          </Pill>
        </div>
      </div>
      <div className="text-sm text-slate-400 light:text-slate-500 mb-2">
        {t("mx.form.summary", { n: source.length, pts, gf, ga })}
      </div>
      {source.length === 0 && <span className="text-slate-400 light:text-slate-500 text-sm">{t("mx.common.noData")}</span>}
      <div className="space-y-1">
        {source.map((m) => (
          <div key={m.fixture_id} className="flex items-center gap-2">
            <ResultBadge result={resultOf(m)} />
            <VenueTag isHome={m.is_home} />
            <span className="font-mono text-xs text-slate-300 light:text-slate-700 shrink-0 w-10">
              {m.gf}:{m.ga}
            </span>
            <span className="truncate text-xs text-slate-400 light:text-slate-500">vs {m.opponent}</span>
            {!m.is_league_match && (
              <span className="badge bg-purple-500/20 text-purple-300 light:bg-purple-100 light:text-purple-700 text-xs px-1.5 py-0 shrink-0">
                {m.league_name ?? t("mx.form.cup")}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function FormLast6({
  home,
  away,
  formHome,
  formAway,
}: {
  home: TeamBrief;
  away: TeamBrief;
  formHome: FormSide;
  formAway: FormSide;
}) {
  return (
    <Section
      title={t("mx.form.title")}
      note={t("mx.form.note")}
    >
      <div className="flex gap-8 flex-wrap">
        <TeamForm team={home} form={formHome} />
        <TeamForm team={away} form={formAway} />
      </div>
    </Section>
  );
}
