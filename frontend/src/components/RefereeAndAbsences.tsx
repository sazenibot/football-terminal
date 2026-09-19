import { useState } from "react";
import type { MatchData, RefereeInfo, RefereeTeamMatch, TeamBrief } from "../types";
import { formatDate } from "../lib/format";
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
      <Section title="9. Rozhodčí">
        <p className="text-slate-500 light:text-slate-400 text-sm">Rozhodčí ještě není přiřazen.</p>
      </Section>
    );
  }

  const s = referee.season_stats;
  const c = referee.career_stats;

  return (
    <Section title="9. Rozhodčí" subtitle={referee.name}>
      <div className="flex flex-wrap gap-2 mb-4">
        <Pill active={tab === "season"} onClick={() => setTab("season")}>
          Tato sezóna
        </Pill>
        <Pill active={tab === "career"} onClick={() => setTab("career")}>
          Kariérní data
        </Pill>
        <Pill active={tab === "h2h"} onClick={() => setTab("h2h")}>
          Vzájemné zápasy
        </Pill>
        <Pill active={tab === "home"} onClick={() => setTab("home")}>
          Zápasy {home.name}
        </Pill>
        <Pill active={tab === "away"} onClick={() => setTab("away")}>
          Zápasy {away.name}
        </Pill>
      </div>

      {tab === "season" && (
        s ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              <Metric label="Zápasy v sezóně" value={statCount(s["Season Matches"])} />
              <Metric
                label="Fauly/zápas"
                value={s["Fouls"]?.average ?? "—"}
                sub={referee.league_context ? `ligový průměr: ${referee.league_context.fouls_per_match}` : undefined}
              />
              <Metric
                label="Žluté/zápas"
                value={statAvg(s["Yellowcards"])}
                sub={referee.league_context ? `ligový průměr: ${referee.league_context.yellow_per_match}` : undefined}
              />
              <Metric
                label="Červené/zápas"
                value={statAvg(s["Redcards"])}
                sub={referee.league_context ? `ligový průměr: ${referee.league_context.red_per_match}` : undefined}
              />
              <Metric label="Penalty/zápas" value={statAvg(s["Penalties"])} />
            </div>
            {referee.league_context && (
              <p className="text-xs text-slate-500 light:text-slate-400 mt-3">
                Ligový průměr = průměr přes {referee.league_context.matches_sampled} odehraných zápasů celé soutěže v
                této sezóně (kontext, jestli je rozhodčí nadprůměrně přísný, nebo naopak).
              </p>
            )}
          </>
        ) : (
          <p className="text-slate-500 light:text-slate-400 text-sm">Pro tuto sezónu ještě nemá rozhodčí žádný zápas.</p>
        )
      )}

      {tab === "career" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          <Metric label="Sledovaných sezón" value={c.total_seasons_tracked} />
          <Metric label="Odpískané zápasy" value={c.matches} />
          <Metric label="Žluté karty celkem" value={c.yellow_cards} />
          <Metric label="Červené karty celkem" value={c.red_cards} />
          <Metric label="Žluté/zápas (kariéra)" value={c.avg_yellow_per_match ?? "—"} />
        </div>
      )}

      {tab === "h2h" && (
        <div>
          {referee.h2h_matches_officiated.length === 0 ? (
            <p className="text-slate-500 light:text-slate-400 text-sm">
              {referee.name} v dostupných datech nepískal žádný vzájemný zápas této dvojice.
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
              <p className="text-[11px] text-slate-600 light:text-slate-400 mt-2">
                Všechny dostupné vzájemné zápasy, které {referee.name} pískal. Barva = výsledek z pohledu {home.name}.
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
              <p className="text-slate-500 light:text-slate-400 text-sm">
                {referee.name} nepískal žádný zápas týmu {teamName} za posledních ~2 sezóny v datech, ze kterých
                čerpáme.
              </p>
            );
          }
          return (
            <div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center mb-4">
                <Metric label={`Zápasy ${teamName} s tímto rozhodčím`} value={summary.matches} />
                <Metric label="Fauly týmu/zápas" value={summary.avg_fouls_by_team} />
                <Metric label="Fauly celkem/zápas" value={summary.avg_fouls_total} />
                <Metric label="Žluté týmu/zápas" value={summary.avg_yellow_by_team} />
                <Metric label="Červené týmu/zápas" value={summary.avg_red_by_team} />
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
              <p className="text-[11px] text-slate-600 light:text-slate-400 mt-2">
                Zahrnuje zápasy za posledních ~2 sezóny (ne jen aktuální), ať má statistika rozumný vzorek i na
                začátku sezóny.
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
      {sub && <div className="text-[11px] text-slate-500 light:text-slate-400 mt-0.5">{sub}</div>}
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
            <div className="text-xs text-slate-500 light:text-slate-400">
              {s.category_cs ?? s.category} · {s.type_name_cs}
              {s.games_missed ? ` · zameškal ${s.games_missed} zápasů` : ""}
            </div>
          </div>
          <span
            className={`badge text-xs ${
              s.likely_available
                ? "bg-amber-500/20 text-amber-300 light:bg-amber-100 light:text-amber-700"
                : "bg-rose-500/20 text-rose-300 light:bg-rose-100 light:text-rose-700"
            }`}
          >
            {s.likely_available ? "možný návrat" : "chybí"}
          </span>
        </li>
      ))}
      {list.length === 0 && <li className="text-slate-500 light:text-slate-400">Žádné hlášené absence.</li>}
    </ul>
  );

  return (
    <Section
      title="10. Absence hráčů (zranění / tresty)"
      note="'Možný návrat' = SportMonks eviduje očekávaný konec absence (end_date) před termínem tohoto zápasu — orientační odhad, ne garance. 'Chybí' = konec absence není znám nebo je až po termínu zápasu. Data se doplňují postupně, jak se blíží zápas."
    >
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="font-medium text-white light:text-slate-900 mb-2">
            {home.name} <span className="text-slate-500 light:text-slate-400">({homeList.length})</span>
          </h3>
          {renderList(homeList)}
        </div>
        <div>
          <h3 className="font-medium text-white light:text-slate-900 mb-2">
            {away.name} <span className="text-slate-500 light:text-slate-400">({awayList.length})</span>
          </h3>
          {renderList(awayList)}
        </div>
      </div>
    </Section>
  );
}
