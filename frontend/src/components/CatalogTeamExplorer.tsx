import { useEffect, useMemo, useState } from "react";
import { CatalogEraRadar } from "./CatalogEraRadar";
import { EmptyNote } from "./CatalogStats";
import { Pill } from "./ui";
import type {
  CatalogEra,
  CatalogEraSummary,
  CatalogExplorer,
  CatalogExplorerMatch,
  RadarAverages,
} from "../types";

type Venue = "all" | "home" | "away";
type Half = "all" | "autumn" | "spring";
type Tab = "team" | "coach";
type SeasonKey = "all" | number;

function sliceOf(era: CatalogEra, venue: Venue): { summary: CatalogEraSummary; radar: RadarAverages } {
  return { summary: era[venue], radar: era.radar[venue] };
}

function eraLabel(team: string, era: CatalogEra) {
  return `${team} · ${era.coach_name}`;
}

function mean(values: Array<number | null | undefined>): number | null {
  const clean = values.filter((v): v is number => v != null);
  if (!clean.length) return null;
  return Math.round((clean.reduce((a, b) => a + b, 0) / clean.length) * 100) / 100;
}

function filterMatches(rows: CatalogExplorerMatch[], season: SeasonKey, venue: Venue, half: Half) {
  return rows.filter((row) => {
    if (season !== "all" && row.s !== season) return false;
    if (venue === "home" && !row.h) return false;
    if (venue === "away" && row.h) return false;
    const month = Number((row.d || "").slice(5, 7));
    if (!month) return true;
    if (half === "autumn" && month < 7) return false;
    if (half === "spring" && month >= 7) return false;
    return true;
  });
}

function summarizeMatches(rows: CatalogExplorerMatch[]): CatalogEraSummary {
  if (!rows.length) return { matches: 0 };
  const won = rows.filter((r) => r.gf > r.ga).length;
  const drawn = rows.filter((r) => r.gf === r.ga).length;
  const lost = rows.filter((r) => r.gf < r.ga).length;
  return {
    matches: rows.length,
    won,
    drawn,
    lost,
    goals_for: mean(rows.map((r) => r.gf)),
    goals_against: mean(rows.map((r) => r.ga)),
    shots: mean(rows.map((r) => r.sh)),
    sot: mean(rows.map((r) => r.sot)),
    corners: mean(rows.map((r) => r.c)),
    possession: mean(rows.map((r) => r.p)),
    fouls: mean(rows.map((r) => r.f)),
    fouls_committed: mean(rows.map((r) => r.f)),
    fouls_received: mean(rows.map((r) => r.of)),
    yellow: mean(rows.map((r) => r.y)),
    cards: mean(rows.map((r) => (r.y ?? 0) + (r.r ?? 0))),
  };
}

function radarFrom(summary: CatalogEraSummary): RadarAverages {
  return {
    goals_for: summary.goals_for ?? 0,
    goals_against: summary.goals_against ?? 0,
    shots: summary.shots ?? 0,
    sot: summary.sot ?? 0,
    corners: summary.corners ?? 0,
    possession: summary.possession ?? 0,
    cards: summary.cards ?? 0,
    fouls_committed: summary.fouls_committed ?? summary.fouls ?? 0,
    fouls_received: summary.fouls_received ?? 0,
  };
}

function sideLabel(team: string, season: SeasonKey, seasons: CatalogExplorer["seasons"], venue: Venue, half: Half) {
  const seasonName =
    season === "all" ? "5 sezon" : seasons?.find((s) => s.id === season)?.name || String(season);
  const venueName = venue === "home" ? "doma" : venue === "away" ? "venku" : "vše";
  const halfName = half === "autumn" ? "podzim" : half === "spring" ? "jaro" : "celá";
  return `${team} · ${seasonName} · ${venueName} · ${halfName}`;
}

export function CatalogTeamExplorer({
  explorer,
  defaultTeamId,
}: {
  explorer: CatalogExplorer | null;
  defaultTeamId: number;
}) {
  const teams = explorer?.teams || [];
  const seasons = explorer?.seasons || [];
  const [tab, setTab] = useState<Tab>("team");

  const [teamA, setTeamA] = useState(defaultTeamId);
  const [teamB, setTeamB] = useState(defaultTeamId);
  const [seasonA, setSeasonA] = useState<SeasonKey>(explorer?.season_id ?? "all");
  const [seasonB, setSeasonB] = useState<SeasonKey>("all");
  const [venueA, setVenueA] = useState<Venue>("all");
  const [venueB, setVenueB] = useState<Venue>("all");
  const [halfA, setHalfA] = useState<Half>("all");
  const [halfB, setHalfB] = useState<Half>("all");

  const [coachTeamA, setCoachTeamA] = useState(defaultTeamId);
  const [coachTeamB, setCoachTeamB] = useState(
    () => teams.find((t) => t.id === 2727 && t.id !== defaultTeamId)?.id ?? teams.find((t) => t.id !== defaultTeamId)?.id ?? defaultTeamId,
  );
  const [coachA, setCoachA] = useState("");
  const [coachB, setCoachB] = useState("");
  const [coachVenueA, setCoachVenueA] = useState<Venue>("all");
  const [coachVenueB, setCoachVenueB] = useState<Venue>("all");

  useEffect(() => {
    if (explorer?.season_id) setSeasonA(explorer.season_id);
  }, [explorer?.season_id]);

  const recA = teams.find((t) => t.id === teamA) ?? teams.find((t) => t.id === defaultTeamId);
  const recB = teams.find((t) => t.id === teamB) ?? recA;
  const coachRecA = teams.find((t) => t.id === coachTeamA) ?? teams.find((t) => t.id === defaultTeamId);
  const coachRecB = teams.find((t) => t.id === coachTeamB);
  const eraA = coachRecA?.eras.find((e) => String(e.coach_id ?? e.coach_name) === coachA) ?? coachRecA?.eras[0];
  const eraB = coachRecB?.eras.find((e) => String(e.coach_id ?? e.coach_name) === coachB) ?? coachRecB?.eras[0];

  const teamSliceA = useMemo(() => {
    const rows = filterMatches(recA?.matches || [], seasonA, venueA, halfA);
    const summary = summarizeMatches(rows);
    return { rows, summary, radar: radarFrom(summary) };
  }, [recA, seasonA, venueA, halfA]);

  const teamSliceB = useMemo(() => {
    const rows = filterMatches(recB?.matches || [], seasonB, venueB, halfB);
    const summary = summarizeMatches(rows);
    return { rows, summary, radar: radarFrom(summary) };
  }, [recB, seasonB, venueB, halfB]);

  const coachSliceA = eraA ? sliceOf(eraA, coachVenueA) : null;
  const coachSliceB = eraB ? sliceOf(eraB, coachVenueB) : null;
  const nameCoachA = coachRecA && eraA ? eraLabel(coachRecA.name, eraA) : "Éra A";
  const nameCoachB = coachRecB && eraB ? eraLabel(coachRecB.name, eraB) : "Éra B";
  const nameTeamA = recA ? sideLabel(recA.name, seasonA, seasons, venueA, halfA) : "Tým A";
  const nameTeamB = recB ? sideLabel(recB.name, seasonB, seasons, venueB, halfB) : "Tým B";

  if (!explorer || teams.length === 0) {
    return (
      <section className="card p-5 mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pro Data Explorer</p>
        <h2 className="text-lg font-semibold text-white light:text-slate-900 mt-1">Porovnání</h2>
        <EmptyNote>Explorer ligy ještě není spočtený. Objeví se po overlay ingestu.</EmptyNote>
      </section>
    );
  }

  return (
    <section className="card p-5 mb-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between mb-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pro Data Explorer</p>
          <h2 className="text-lg font-semibold text-white light:text-slate-900 mt-1">
            {tab === "team" ? "Radar týmu" : "Srovnání trenérů"}
          </h2>
          <p className="text-sm text-slate-400 light:text-slate-500 mt-1 max-w-xl">
            {tab === "team"
              ? "Stejný radar jako Match detail. Filtr sezony, domácí/venkovní a podzim/jaro (řez 31. 12.)."
              : "Seskupeno z odehraných ligových zápasů podle trenéra. Čísla jsou eventová, ne xG."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill active={tab === "team"} onClick={() => setTab("team")}>
            Radar týmu
          </Pill>
          <Pill active={tab === "coach"} onClick={() => setTab("coach")}>
            Srovnání trenérů
          </Pill>
        </div>
      </div>

      {tab === "team" ? (
        <>
          <div className="flex flex-col gap-3 mb-5">
            <TeamFilters
              teams={teams}
              seasons={seasons}
              teamId={recA?.id ?? defaultTeamId}
              season={seasonA}
              venue={venueA}
              half={halfA}
              onTeam={setTeamA}
              onSeason={setSeasonA}
              onVenue={setVenueA}
              onHalf={setHalfA}
            />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400/80">Porovnat s</p>
            <TeamFilters
              teams={teams}
              seasons={seasons}
              teamId={recB?.id ?? teamB}
              season={seasonB}
              venue={venueB}
              half={halfB}
              onTeam={setTeamB}
              onSeason={setSeasonB}
              onVenue={setVenueB}
              onHalf={setHalfB}
            />
          </div>
          <p className="text-xs text-slate-500 mb-4">
            {nameTeamA}: {teamSliceA.summary.matches ?? 0} zápasů vs {nameTeamB}: {teamSliceB.summary.matches ?? 0}{" "}
            zápasů
          </p>
          {teamSliceA.summary.matches ? (
            <>
              <CatalogEraRadar
                key={`${teamA}-${seasonA}-${venueA}-${halfA}-${teamB}-${seasonB}-${venueB}-${halfB}`}
                a={teamSliceA.radar}
                b={teamSliceB.summary.matches ? teamSliceB.radar : null}
                nameA={nameTeamA}
                nameB={teamSliceB.summary.matches ? nameTeamB : undefined}
              />
              <CompareTable
                titleA={nameTeamA}
                titleB={nameTeamB}
                a={teamSliceA.summary}
                b={teamSliceB.summary}
              />
            </>
          ) : (
            <EmptyNote>Pro tento filtr nemáme odehraný zápas.</EmptyNote>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-col gap-3 mb-5">
            <CoachFilters
              teams={teams}
              teamId={coachRecA?.id ?? defaultTeamId}
              coachKey={eraA ? String(eraA.coach_id ?? eraA.coach_name) : ""}
              venue={coachVenueA}
              coaches={coachRecA?.eras || []}
              onTeam={(id) => {
                setCoachTeamA(id);
                setCoachA("");
              }}
              onCoach={setCoachA}
              onVenue={setCoachVenueA}
            />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400/80">Porovnat s</p>
            <CoachFilters
              teams={teams}
              teamId={coachRecB?.id ?? coachTeamB}
              coachKey={eraB ? String(eraB.coach_id ?? eraB.coach_name) : ""}
              venue={coachVenueB}
              coaches={coachRecB?.eras || []}
              onTeam={(id) => {
                setCoachTeamB(id);
                setCoachB("");
              }}
              onCoach={setCoachB}
              onVenue={setCoachVenueB}
            />
          </div>
          {eraA && coachSliceA ? (
            <p className="text-xs text-slate-500 mb-4">
              {nameCoachA}: {eraA.matches} zápasů
              {eraA.from ? ` · ${eraA.from.slice(0, 4)}–${(eraA.to || "").slice(0, 4)}` : ""}
              {eraB ? `  vs  ${nameCoachB}: ${eraB.matches} zápasů` : ""}
            </p>
          ) : null}
          {coachSliceA && eraA ? (
            <>
              <CatalogEraRadar
                a={coachSliceA.radar}
                b={coachSliceB?.radar}
                nameA={nameCoachA}
                nameB={coachSliceB ? nameCoachB : undefined}
              />
              <CompareTable
                titleA={nameCoachA}
                titleB={nameCoachB}
                a={coachSliceA.summary}
                b={coachSliceB?.summary ?? { matches: 0 }}
              />
            </>
          ) : (
            <EmptyNote>Pro tento klub zatím nemáme zápas s vyplněným trenérem.</EmptyNote>
          )}
        </>
      )}
    </section>
  );
}

const SELECT =
  "mt-1 w-full rounded-lg border border-slate-700 bg-[#12161f] text-slate-100 text-sm px-3 py-2 light:bg-white light:border-slate-300 light:text-slate-800";

function TeamFilters({
  teams,
  seasons,
  teamId,
  season,
  venue,
  half,
  onTeam,
  onSeason,
  onVenue,
  onHalf,
}: {
  teams: CatalogExplorer["teams"];
  seasons: NonNullable<CatalogExplorer["seasons"]>;
  teamId: number;
  season: SeasonKey;
  venue: Venue;
  half: Half;
  onTeam: (id: number) => void;
  onSeason: (s: SeasonKey) => void;
  onVenue: (v: Venue) => void;
  onHalf: (h: Half) => void;
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      <label className="text-xs text-slate-500">
        Tým
        <select value={teamId} onChange={(e) => onTeam(Number(e.target.value))} className={SELECT}>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-500">
        Sezona
        <select
          value={String(season)}
          onChange={(e) => onSeason(e.target.value === "all" ? "all" : Number(e.target.value))}
          className={SELECT}
        >
          <option value="all">Všechny sezony</option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name || s.id}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-500">
        Doma / Venku
        <select value={venue} onChange={(e) => onVenue(e.target.value as Venue)} className={SELECT}>
          <option value="all">Doma + venku</option>
          <option value="home">Jen doma</option>
          <option value="away">Jen venku</option>
        </select>
      </label>
      <label className="text-xs text-slate-500">
        Část sezony
        <select value={half} onChange={(e) => onHalf(e.target.value as Half)} className={SELECT}>
          <option value="all">Celá sezona</option>
          <option value="autumn">Podzim</option>
          <option value="spring">Jaro</option>
        </select>
      </label>
    </div>
  );
}

function CoachFilters({
  teams,
  teamId,
  coachKey,
  venue,
  coaches,
  onTeam,
  onCoach,
  onVenue,
}: {
  teams: CatalogExplorer["teams"];
  teamId: number;
  coachKey: string;
  venue: Venue;
  coaches: CatalogEra[];
  onTeam: (id: number) => void;
  onCoach: (key: string) => void;
  onVenue: (v: Venue) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <label className="text-xs text-slate-500">
        Tým
        <select value={teamId} onChange={(e) => onTeam(Number(e.target.value))} className={SELECT}>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-500">
        Trenér
        <select value={coachKey} onChange={(e) => onCoach(e.target.value)} className={SELECT}>
          {coaches.map((e) => (
            <option key={String(e.coach_id ?? e.coach_name)} value={String(e.coach_id ?? e.coach_name)}>
              {e.coach_name} · {e.matches} z
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-500">
        Doma / Venku
        <select value={venue} onChange={(e) => onVenue(e.target.value as Venue)} className={SELECT}>
          <option value="all">Doma + venku</option>
          <option value="home">Jen doma</option>
          <option value="away">Jen venku</option>
        </select>
      </label>
    </div>
  );
}

type RowDef = {
  key: keyof CatalogEraSummary | "record" | "ppg";
  label: string;
  group: string;
  higher?: boolean;
};

const COMPARE_ROWS: RowDef[] = [
  { key: "matches", label: "Zápasy", group: "Výsledky", higher: true },
  { key: "record", label: "V–R–P", group: "Výsledky" },
  { key: "ppg", label: "Body / zápas", group: "Výsledky", higher: true },
  { key: "goals_for", label: "Góly", group: "Zápas", higher: true },
  { key: "goals_against", label: "Obdrženo", group: "Zápas", higher: false },
  { key: "shots", label: "Střely", group: "Zápas", higher: true },
  { key: "sot", label: "Na bránu", group: "Zápas", higher: true },
  { key: "corners", label: "Rohy", group: "Zápas", higher: true },
  { key: "possession", label: "Držení %", group: "Zápas", higher: true },
  { key: "fouls_committed", label: "Fauly", group: "Disciplína", higher: false },
  { key: "cards", label: "Karty", group: "Disciplína", higher: false },
];

function ppg(summary: CatalogEraSummary): number | null {
  const n = summary.matches || 0;
  if (!n) return null;
  return Math.round((((summary.won ?? 0) * 3 + (summary.drawn ?? 0)) / n) * 100) / 100;
}

function cellValue(summary: CatalogEraSummary, key: RowDef["key"]): number | string | null {
  if (key === "record") {
    if (summary.won == null) return null;
    return `${summary.won}–${summary.drawn ?? 0}–${summary.lost ?? 0}`;
  }
  if (key === "ppg") return ppg(summary);
  if (key === "fouls_committed") return summary.fouls_committed ?? summary.fouls ?? null;
  return summary[key] ?? null;
}

function numeric(summary: CatalogEraSummary, key: RowDef["key"]): number | null {
  if (key === "record") return ppg(summary);
  const v = cellValue(summary, key);
  return typeof v === "number" ? v : null;
}

function CompareTable({
  titleA,
  titleB,
  a,
  b,
}: {
  titleA: string;
  titleB: string;
  a: CatalogEraSummary;
  b: CatalogEraSummary;
}) {
  const groups = [...new Set(COMPARE_ROWS.map((r) => r.group))];
  return (
    <div className="mt-5 overflow-hidden rounded-xl ring-1 ring-white/10 light:ring-slate-200">
      <div className="grid grid-cols-[1fr_8rem_1fr] sm:grid-cols-[1fr_10rem_1fr] gap-2 bg-slate-900/50 light:bg-slate-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        <span className="text-right text-emerald-400 truncate">{titleA}</span>
        <span className="text-center">Metrika</span>
        <span className="text-amber-400 truncate">{titleB}</span>
      </div>
      {groups.map((group) => (
        <div key={group}>
          <p className="px-3 pt-3 pb-1 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {group}
          </p>
          {COMPARE_ROWS.filter((r) => r.group === group).map((row) => {
            const va = cellValue(a, row.key);
            const vb = cellValue(b, row.key);
            const na = numeric(a, row.key);
            const nb = numeric(b, row.key);
            let win: "a" | "b" | null = null;
            if (row.higher != null && na != null && nb != null && na !== nb) {
              win = row.higher ? (na > nb ? "a" : "b") : na < nb ? "a" : "b";
            }
            return (
              <div
                key={row.key}
                className="grid grid-cols-[1fr_8rem_1fr] sm:grid-cols-[1fr_10rem_1fr] gap-2 items-center px-3 py-2 border-t border-white/5 light:border-slate-100"
              >
                <p
                  className={`text-right text-[15px] font-semibold tabular-nums ${
                    win === "a" ? "text-emerald-400" : "text-slate-300 light:text-slate-700"
                  }`}
                >
                  {row.key === "record" && typeof va === "string" ? <RecordValue value={va} /> : (va ?? "—")}
                </p>
                <p className="text-center text-[12px] text-slate-500">{row.label}</p>
                <p
                  className={`text-[15px] font-semibold tabular-nums ${
                    win === "b" ? "text-amber-400" : "text-slate-300 light:text-slate-700"
                  }`}
                >
                  {row.key === "record" && typeof vb === "string" ? <RecordValue value={vb} /> : (vb ?? "—")}
                </p>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function RecordValue({ value }: { value: string }) {
  const [w, d, l] = value.split("–");
  return (
    <span className="tabular-nums">
      <span className="text-emerald-400">{w}</span>
      <span className="text-slate-500">–</span>
      <span className="text-slate-300">{d}</span>
      <span className="text-slate-500">–</span>
      <span className="text-rose-400">{l}</span>
    </span>
  );
}
