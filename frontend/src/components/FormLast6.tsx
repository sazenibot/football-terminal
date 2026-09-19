import { useState } from "react";
import type { FormSide, MatchFacts, TeamBrief } from "../types";
import { Pill, ResultBadge, Section } from "./ui";

function resultOf(m: MatchFacts): "V" | "R" | "P" {
  return m.gf > m.ga ? "V" : m.gf === m.ga ? "R" : "P";
}

/** Výrazný štítek doma/venku — ikonka + text, ať to nesplývá s okolním textem. */
function VenueTag({ isHome }: { isHome: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
        isHome
          ? "bg-sky-500/15 text-sky-300 light:bg-sky-100 light:text-sky-700"
          : "bg-orange-500/15 text-orange-300 light:bg-orange-100 light:text-orange-700"
      }`}
    >
      <span aria-hidden>{isHome ? "🏠" : "✈️"}</span>
      {isHome ? "D" : "V"}
    </span>
  );
}

function TeamForm({ team, form, side }: { team: TeamBrief; form: FormSide; side: "left" | "right" }) {
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
        <h3 className="font-medium text-white light:text-slate-900">{team.name}</h3>
        <div className="flex gap-1">
          <Pill active={filter === "all"} onClick={() => setFilter("all")}>
            Vše
          </Pill>
          <Pill active={filter === "home"} onClick={() => setFilter("home")}>
            Doma
          </Pill>
          <Pill active={filter === "away"} onClick={() => setFilter("away")}>
            Venku
          </Pill>
        </div>
      </div>
      <div className="text-sm text-slate-400 light:text-slate-500 mb-2">
        {source.length} zápasů · {pts} b · skóre {gf}:{ga}
      </div>
      {source.length === 0 && <span className="text-slate-500 light:text-slate-400 text-sm">Nedostatek dat</span>}
      <div className="space-y-1">
        {source.map((m) => {
          const badge = <ResultBadge result={resultOf(m)} />;
          const venueTag = <VenueTag isHome={m.is_home} />;
          const info = (
            <span className={`flex items-center gap-1.5 truncate text-xs text-slate-400 light:text-slate-500 ${side === "right" ? "justify-end text-right" : ""}`}>
              {side === "right" ? (
                <>
                  {!m.is_league_match && (
                    <span className="badge bg-purple-500/20 text-purple-300 light:bg-purple-100 light:text-purple-700 text-[10px] px-1.5 py-0 shrink-0">
                      {m.league_name ?? "pohár"}
                    </span>
                  )}
                  <span className="truncate">vs {m.opponent}</span>
                  {venueTag}
                </>
              ) : (
                <>
                  {venueTag}
                  <span className="truncate">vs {m.opponent}</span>
                  {!m.is_league_match && (
                    <span className="badge bg-purple-500/20 text-purple-300 light:bg-purple-100 light:text-purple-700 text-[10px] px-1.5 py-0 shrink-0">
                      {m.league_name ?? "pohár"}
                    </span>
                  )}
                </>
              )}
            </span>
          );
          const score = (
            <span className="font-mono text-xs text-slate-300 light:text-slate-700 shrink-0 w-10 text-center">
              {m.gf}:{m.ga}
            </span>
          );
          return (
            <div key={m.fixture_id} className="flex items-center gap-2">
              {side === "left" ? (
                <>
                  {badge}
                  {info}
                  {score}
                </>
              ) : (
                <>
                  {score}
                  {info}
                  {badge}
                </>
              )}
            </div>
          );
        })}
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
      title="3. Forma — posledních 6 zápasů z aktuální sezóny"
      note="Počítáno jen ze zápasů od začátku aktuální sezóny — pokud jich tým dosud odehrál méně než 6, zobrazí se jen dostupný počet. Fialový štítek = zápas mimo ligu (pohár apod.). Barevný odznak V/R/P je vždy nejblíž okraji stránky (vlevo u domácího týmu, vpravo u hostů)."
    >
      <div className="flex gap-8 flex-wrap">
        <TeamForm team={home} form={formHome} side="left" />
        <TeamForm team={away} form={formAway} side="right" />
      </div>
    </Section>
  );
}
