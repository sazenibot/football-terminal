import { useState } from "react";
import type { MatchData, RefereeInfo, RefereeTeamMatch, TeamBrief } from "../types";
import { formatDate } from "../lib/format";
import { t } from "../i18n/locale";
import { Pill, Section } from "./ui";

// Stejná barevná logika jako u H2H výsledků (1. sekce) — ať je vizuální jazyk
// napříč stránkou konzistentní.
const RESULT_ROW_STYLE: Record<string, string> = {
  V: "border-l-4 border-emerald-500 bg-emerald-500/10",
  R: "border-l-4 border-amber-500 bg-amber-500/10",
  P: "border-l-4 border-rose-500 bg-rose-500/10",
};

function ResultRow({
  date,
  home,
  away,
  homeScore,
  awayScore,
  result,
}: {
  date: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  result: string;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded px-3 py-2 ${RESULT_ROW_STYLE[result] ?? "bg-slate-900/50 light:bg-slate-100"}`}
    >
      <span className="text-slate-400 light:text-slate-500 shrink-0">{formatDate(date)}</span>
      <span className="text-right font-medium text-slate-100 light:text-slate-800">
        {home} - {away}{" "}
        <span className="font-mono">
          {homeScore ?? "—"}:{awayScore ?? "—"}
        </span>
      </span>
    </div>
  );
}

function statCount(stat: any): number {
  if (!stat) return 0;
  if (stat.all) return stat.all.count ?? 0;
  return stat.count ?? 0;
}

function statAvg(stat: any): number {
  if (!stat) return 0;
  if (stat.all) return stat.all.average ?? 0;
  return stat.average ?? 0;
}

type Tab = "season" | "career" | "h2h" | "home" | "away";

export function RefereeSection({
  referee,
  home,
  away,
}: {
  referee: RefereeInfo | null;
  home: TeamBrief;
  away: TeamBrief;
}) {
  const [tab, setTab] = useState<Tab>("season");

  if (!referee) {
    return (
      <Section title={t("mx.ref.title")}>
        <p className="text-slate-400 light:text-slate-500 text-sm">{t("mx.ref.none")}</p>
      </Section>
    );
  }

  const s = referee.season_stats;
  const c = referee.career_stats;

  return (
    <Section title={t("mx.ref.title")} subtitle={referee.name}>
      <div className="flex flex-wrap gap-2 mb-4">
        <Pill active={tab === "season"} onClick={() => setTab("season")}>
          {t("mx.ref.tabSeason")}
        </Pill>
        <Pill active={tab === "career"} onClick={() => setTab("career")}>
          {t("mx.ref.tabCareer")}
        </Pill>
        <Pill active={tab === "h2h"} onClick={() => setTab("h2h")}>
          {t("mx.common.h2h")}
        </Pill>
        <Pill active={tab === "home"} onClick={() => setTab("home")}>
          {t("mx.ref.tabTeam", { name: home.name })}
        </Pill>
        <Pill active={tab === "away"} onClick={() => setTab("away")}>
          {t("mx.ref.tabTeam", { name: away.name })}
        </Pill>
      </div>

      {tab === "season" && (
        s ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              <Metric label={t("mx.ref.seasonMatches")} value={statCount(s["Season Matches"])} />
              <Metric
                label={t("mx.ref.foulsPm")}
                value={s["Fouls"]?.average ?? "—"}
                sub={referee.league_context ? t("mx.ref.leagueAvg", { n: referee.league_context.fouls_per_match }) : undefined}
              />
              <Metric
                label={t("mx.ref.yellowPm")}
                value={statAvg(s["Yellowcards"])}
                sub={referee.league_context ? t("mx.ref.leagueAvg", { n: referee.league_context.yellow_per_match }) : undefined}
              />
              <Metric
                label={t("mx.ref.redPm")}
                value={statAvg(s["Redcards"])}
                sub={referee.league_context ? t("mx.ref.leagueAvg", { n: referee.league_context.red_per_match }) : undefined}
              />
              <Metric label={t("mx.ref.pensPm")} value={statAvg(s["Penalties"])} />
            </div>
            {referee.league_context && (
              <p className="text-xs text-slate-400 light:text-slate-500 mt-3">
                {t("mx.ref.leagueNote", { n: referee.league_context.matches_sampled })}
              </p>
            )}
          </>
        ) : (
          <p className="text-slate-400 light:text-slate-500 text-sm">{t("mx.ref.noSeason")}</p>
        )
      )}

      {tab === "career" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          <Metric label={t("mx.ref.seasonsTracked")} value={c.total_seasons_tracked} />
          <Metric label={t("mx.ref.officiated")} value={c.matches} />
          <Metric label={t("mx.ref.yellowTotal")} value={c.yellow_cards} />
          <Metric label={t("mx.ref.redTotal")} value={c.red_cards} />
          <Metric label={t("mx.ref.yellowCareer")} value={c.avg_yellow_per_match ?? "—"} />
        </div>
      )}

      {tab === "h2h" && (
        <div>
          {referee.h2h_matches_officiated.length === 0 ? (
            <p className="text-slate-400 light:text-slate-500 text-sm">
              {t("mx.ref.h2hNone", { name: referee.name })}
            </p>
          ) : (
            <>
              <div className="space-y-1.5 text-sm">
                {referee.h2h_matches_officiated.map((m) => (
                  <ResultRow
                    key={m.fixture_id}
                    date={m.date}
                    home={m.home}
                    away={m.away}
                    homeScore={m.home_score}
                    awayScore={m.away_score}
                    result={m.result_for_home_team}
                  />
                ))}
              </div>
              <p className="text-xs text-slate-400 light:text-slate-500 mt-2">
                {t("mx.ref.h2hNote", { name: referee.name, team: home.name })}
              </p>
            </>
          )}
        </div>
      )}

      {(tab === "home" || tab === "away") && (
        (() => {
          const summary = tab === "home" ? referee.home_team_matches_officiated : referee.away_team_matches_officiated;
          const teamName = tab === "home" ? home.name : away.name;
          if (!summary) {
            return (
              <p className="text-slate-400 light:text-slate-500 text-sm">
                {t("mx.ref.teamNone", { name: referee.name, team: teamName })}
              </p>
            );
          }
          return (
            <div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center mb-4">
                <Metric label={t("mx.ref.teamMatches", { team: teamName })} value={summary.matches} />
                <Metric label={t("mx.ref.teamFouls")} value={summary.avg_fouls_by_team} />
                <Metric label={t("mx.ref.totalFouls")} value={summary.avg_fouls_total} />
                <Metric label={t("mx.ref.teamYellow")} value={summary.avg_yellow_by_team} />
                <Metric label={t("mx.ref.teamRed")} value={summary.avg_red_by_team} />
              </div>
              <div className="space-y-1.5 text-sm">
                {summary.recent_matches.map((m: RefereeTeamMatch) => (
                  <ResultRow
                    key={m.fixture_id}
                    date={m.date}
                    home={m.home_name}
                    away={m.away_name}
                    homeScore={m.home_score}
                    awayScore={m.away_score}
                    result={m.result}
                  />
                ))}
              </div>
              <p className="text-xs text-slate-400 light:text-slate-500 mt-2">
                {t("mx.ref.teamNote")}
              </p>
            </div>
          );
        })()
      )}
    </Section>
  );
}

function Metric({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-slate-900/50 light:bg-slate-100 rounded-lg py-3 px-2">
      <div className="text-xl font-bold text-white light:text-slate-900">{value}</div>
      <div className="text-xs text-slate-400 light:text-slate-500 mt-1">{label}</div>
      {sub && <div className="text-xs text-slate-400 light:text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export function SidelinedSection({
  home,
  away,
  sidelined,
}: {
  home: TeamBrief;
  away: TeamBrief;
  sidelined: MatchData["sidelined"];
}) {
  const homeList = sidelined.filter((s) => s.side === "home");
  const awayList = sidelined.filter((s) => s.side === "away");

  const renderList = (list: MatchData["sidelined"]) => (
    <ul className="space-y-2 text-sm">
      {list.map((s) => (
        <li key={`${s.player_id}-${s.type_id}`} className="flex items-center justify-between bg-slate-900/40 light:bg-slate-100 rounded px-3 py-2">
          <div>
            <div className="text-slate-100 light:text-slate-800">{s.player_name}</div>
            <div className="text-xs text-slate-400 light:text-slate-500">
              {s.category_cs ?? s.category} · {s.type_name_cs}
              {s.games_missed ? ` · ${t("mx.side.missed", { n: s.games_missed })}` : ""}
            </div>
          </div>
          <span
            className={`badge text-xs ${
              s.likely_available
                ? "bg-amber-500/20 text-amber-300 light:bg-amber-100 light:text-amber-700"
                : "bg-rose-500/20 text-rose-300 light:bg-rose-100 light:text-rose-700"
            }`}
          >
            {s.likely_available ? t("mx.side.maybe") : t("mx.side.out")}
          </span>
        </li>
      ))}
      {list.length === 0 && <li className="text-slate-400 light:text-slate-500">{t("mx.side.empty")}</li>}
    </ul>
  );

  return (
    <Section
      title={t("mx.side.title")}
      note={t("mx.side.note")}
    >
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="font-medium text-white light:text-slate-900 mb-2">
            {home.name} <span className="text-slate-400 light:text-slate-500">({homeList.length})</span>
          </h3>
          {renderList(homeList)}
        </div>
        <div>
          <h3 className="font-medium text-white light:text-slate-900 mb-2">
            {away.name} <span className="text-slate-400 light:text-slate-500">({awayList.length})</span>
          </h3>
          {renderList(awayList)}
        </div>
      </div>
    </Section>
  );
}
