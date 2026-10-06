import { useMemo, useState } from "react";
import type { MatchData, PlayerBrief, RefereeInfo, RefereeTeamMatch, TeamBrief } from "../types";
import { formatDate } from "../lib/format";
import { Card, Empty, Info, ResBadge, Seg, Stat, TeamTitle, n2, plural, type Res } from "./kit";

/* ---------- Absence ---------- */

export function AbsencesCard({ m }: { m: MatchData }) {
  const list = (side: "home" | "away") => m.sidelined.filter((s) => s.side === side).sort((a, b) => Number(a.likely_available) - Number(b.likely_available));
  const col = (team: TeamBrief, side: "home" | "away") => {
    const items = list(side);
    return (
      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-between gap-2">
          <TeamTitle team={team} side={side} />
          <span className="shrink-0 text-xs text-(--c-muted)">{items.length}</span>
        </div>
        {items.length === 0 ? (
          <p className="rounded-xl bg-(--c-raised) px-3 py-3 text-[13px] text-(--c-muted)">Žádné hlášené absence.</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((s) => (
              <li key={`${s.player_id}-${s.type_id}`} className="flex items-center justify-between gap-3 rounded-xl bg-(--c-raised) px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">{s.player_name}</div>
                  <div className="truncate text-[11px] text-(--c-muted)">
                    {s.type_name_cs}
                    {s.games_missed ? ` · vynechal ${s.games_missed} ${plural(s.games_missed, "zápas", "zápasy", "zápasů")}` : ""}
                  </div>
                </div>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    color: s.likely_available ? "var(--c-warn)" : "var(--c-loss)",
                    background: `color-mix(in oklab, ${s.likely_available ? "var(--c-warn)" : "var(--c-loss)"} 15%, transparent)`,
                  }}
                >
                  {s.likely_available ? "možný návrat" : "chybí"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };
  return (
    <Card
      title={
        <>
          Absence
          <Info>
            „Chybí“ = konec absence neznáme, nebo je až po zápase. „Možný návrat“ = čekáme, že hráč bude do zápasu k dispozici. Jde o odhad, data
            se doplňují postupně, jak se zápas blíží.
          </Info>
        </>
      }
      lead="Zranění a tresty před zápasem."
    >
      <div className="grid gap-5 md:grid-cols-2">
        {col(m.home, "home")}
        {col(m.away, "away")}
      </div>
    </Card>
  );
}

/* ---------- Hráči ---------- */

type View = "season" | "last5" | "h2h";
type SV = { appearances: number; stats: Record<string, number> };
type Col = { key: string; label: string; title?: string; value: (v: SV) => number; digits?: number; group: string };

const perGame = (stat: string) => (v: SV) => (v.appearances > 0 ? (v.stats[stat] ?? 0) / v.appearances : 0);

const OUT: Col[] = [
  { key: "apps", label: "Zápasy", value: (v) => v.appearances, group: "" },
  { key: "min", label: "Minuty", value: (v) => v.stats["Minutes Played"] ?? 0, group: "" },
  { key: "g", label: "Góly", value: (v) => v.stats["Goals"] ?? 0, group: "Ofenzivní" },
  { key: "a", label: "Asist.", title: "Asistence", value: (v) => v.stats["Assists"] ?? 0, group: "Ofenzivní" },
  { key: "shT", label: "Střely", value: (v) => v.stats["Shots Total"] ?? 0, group: "Ofenzivní" },
  { key: "sotT", label: "SnB", title: "Střely na bránu", value: (v) => v.stats["Shots On Target"] ?? 0, group: "Ofenzivní" },
  { key: "sh", label: "Střely/z", title: "Střely na zápas", value: perGame("Shots Total"), digits: 1, group: "Ofenzivní" },
  { key: "sot", label: "SnB/z", title: "Střely na bránu na zápas", value: perGame("Shots On Target"), digits: 1, group: "Ofenzivní" },
  { key: "fT", label: "Fauly", value: (v) => v.stats["Fouls"] ?? 0, group: "Defenzivní" },
  { key: "f", label: "Fauly/z", title: "Fauly na zápas", value: perGame("Fouls"), digits: 1, group: "Defenzivní" },
  { key: "y", label: "Žluté", value: (v) => v.stats["Yellowcards"] ?? 0, group: "Defenzivní" },
  { key: "r", label: "Červené", value: (v) => v.stats["Redcards"] ?? 0, group: "Defenzivní" },
];
const GK: Col[] = [
  { key: "apps", label: "Zápasy", value: (v) => v.appearances, group: "" },
  { key: "min", label: "Minuty", value: (v) => v.stats["Minutes Played"] ?? 0, group: "" },
  { key: "sv", label: "Zákroky", value: (v) => v.stats["Saves"] ?? 0, group: "Brankář" },
  { key: "gc", label: "Obdržené", title: "Obdržené góly", value: (v) => v.stats["Goals Conceded"] ?? 0, group: "Brankář" },
  { key: "cs", label: "Čistá konta", value: (v) => v.stats["Cleansheets"] ?? 0, group: "Brankář" },
  { key: "y", label: "Žluté", value: (v) => v.stats["Yellowcards"] ?? 0, group: "Disciplína" },
  { key: "r", label: "Červené", value: (v) => v.stats["Redcards"] ?? 0, group: "Disciplína" },
];

const viewOf = (p: PlayerBrief, v: View): SV =>
  v === "season" ? { appearances: p.season_stats["Appearances"] ?? 0, stats: p.season_stats } : v === "last5" ? p.last5_stats : p.h2h_stats;

const shortName = (n: string) => {
  const parts = n.trim().split(/\s+/);
  return parts.length <= 2 ? n : `${parts[0]} ${parts[parts.length - 1]}`;
};

export function PlayersCard({ m }: { m: MatchData }) {
  const [team, setTeam] = useState<"home" | "away" | "both">("home");
  const [pos, setPos] = useState<"out" | "gk">("out");
  const [view, setView] = useState<View>("season");
  const [all, setAll] = useState(false);
  const [sortKey, setSortKey] = useState("min");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    const pick = (list: PlayerBrief[], t: TeamBrief, side: "home" | "away") =>
      list.filter((p) => (pos === "gk" ? p.is_gk : !p.is_gk)).map((p) => ({ p, t, side, v: viewOf(p, view) }));
    const h = pick(m.players.home ?? [], m.home, "home");
    const a = pick(m.players.away ?? [], m.away, "away");
    return team === "home" ? h : team === "away" ? a : [...h, ...a];
  }, [m, team, pos, view]);

  const defs = pos === "gk" ? GK : OUT;
  const cols = defs;
  const groups = cols.reduce<{ name: string; span: number }[]>((acc, c) => {
    const last = acc[acc.length - 1];
    if (last && last.name === c.group) last.span += 1;
    else acc.push({ name: c.group, span: 1 });
    return acc;
  }, []);
  const startsGroup = (i: number) => i > 0 && cols[i - 1].group !== cols[i].group;
  const active = cols.find((c) => c.key === sortKey) ?? cols.find((c) => c.key === "min") ?? cols[0];
  const sorted = [...rows].sort((x, y) => (dir === "asc" ? 1 : -1) * (active.value(x.v) - active.value(y.v)));
  const shown = all ? sorted : sorted.slice(0, 12);
  const fmt = (v: number, d = 0) => (d ? v.toFixed(d) : String(Math.round(v)));
  const sort = (k: string) => {
    if (k === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setDir("desc");
    }
  };

  return (
    <Card title="Hráči" lead="Klepnutím na název sloupce seřadíte tabulku.">
      <div className="mb-4 flex flex-wrap gap-2">
        <Seg
          label="Tým"
          value={team}
          onChange={setTeam}
          options={[
            { id: "home", label: m.home.name },
            { id: "away", label: m.away.name },
            { id: "both", label: "Oba" },
          ]}
        />
        <Seg
          label="Post"
          value={pos}
          onChange={(v) => {
            setPos(v);
            setSortKey("min");
          }}
          options={[
            { id: "out", label: "Hráči v poli" },
            { id: "gk", label: "Brankáři" },
          ]}
        />
        <Seg
          label="Období"
          value={view}
          onChange={setView}
          options={[
            { id: "season", label: "Sezóna" },
            { id: "last5", label: "Posledních 5" },
            { id: "h2h", label: "Vzájemné zápasy" },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <Empty>Žádní hráči v téhle kategorii.</Empty>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-(--c-line)">
            <table className="w-full whitespace-nowrap text-[13px]">
              <thead>
                <tr className="bg-(--c-raised) text-[10px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">
                  <th aria-hidden className="sticky left-0 z-10 bg-(--c-raised)" />
                  {groups.map((g, i) => (
                    <th
                      key={i}
                      colSpan={g.span}
                      scope="colgroup"
                      className={`px-3 pb-0 pt-2 text-left font-semibold ${i > 0 ? "border-l border-(--c-line)" : ""}`}
                    >
                      {g.name}
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-(--c-line) bg-(--c-raised) text-xs text-(--c-muted)">
                  <th scope="col" className="sticky left-0 z-10 bg-(--c-raised) px-3 py-2 text-left font-medium">
                    Hráč
                  </th>
                  {cols.map((c, i) => (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={c.key === active.key ? (dir === "asc" ? "ascending" : "descending") : "none"}
                      className={`px-1 py-1 text-right font-medium ${startsGroup(i) ? "border-l border-(--c-line)" : ""}`}
                    >
                      <button type="button" title={c.title} onClick={() => sort(c.key)} className={`min-h-8 rounded-md px-2 hover:text-(--c-text) ${c.key === active.key ? "text-(--c-accent)" : ""}`}>
                        {c.label}
                        {c.key === active.key && <span aria-hidden> {dir === "asc" ? "↑" : "↓"}</span>}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map(({ p, t, side, v }) => (
                  <tr key={`${t.id}-${p.id}`} className="border-b border-(--c-line)/60 last:border-0 hover:bg-(--c-raised)/60">
                    <td className="sticky left-0 z-10 bg-(--c-surface) px-3 py-2">
                      <span className="mr-2 inline-block w-5 text-right text-xs text-(--c-faint)">{p.jersey_number ?? ""}</span>
                      <span className="font-medium">{shortName(p.name)}</span>
                      {team === "both" && (
                        <span className="ml-2 text-[10px]" style={{ color: side === "home" ? "var(--c-home)" : "var(--c-away)" }}>
                          {t.name}
                        </span>
                      )}
                    </td>
                    {cols.map((c, i) => (
                      <td
                        key={c.key}
                        className={`px-3 py-2 text-right tabular-nums ${c.key === active.key ? "font-semibold" : "text-(--c-muted)"} ${startsGroup(i) ? "border-l border-(--c-line)" : ""}`}
                      >
                        {fmt(c.value(v), c.digits)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4">
            {sorted.length > 12 && (
              <button type="button" onClick={() => setAll((a) => !a)} className="min-h-9 text-[13px] font-medium text-(--c-accent) hover:underline">
                {all ? "Zobrazit méně" : `Zobrazit všech ${sorted.length}`}
              </button>
            )}
            {view !== "season" && (
              <span className="text-[11px] text-(--c-faint)">U hráčů, kteří v daném období nenastoupili, jsou nuly.</span>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

/* ---------- Rozhodčí ---------- */

const statCount = (s: any): number => (!s ? 0 : s.all ? (s.all.count ?? 0) : (s.count ?? 0));
const statAvg = (s: any): number => (!s ? 0 : s.all ? (s.all.average ?? 0) : (s.average ?? 0));

function Played({ date, home, away, hs, as, result }: { date: string; home: string; away: string; hs: number | null; as: number | null; result: string }) {
  return (
    <li className="grid grid-cols-[4.5rem_1.5rem_1fr] items-center gap-2 rounded-lg px-1 py-1.5 text-[13px] hover:bg-(--c-raised)">
      <span className="text-xs text-(--c-faint)">{formatDate(date)}</span>
      <ResBadge r={result as Res} />
      <span className="truncate">
        {home} <b className="mx-1 tabular-nums">{hs ?? "—"}:{as ?? "—"}</b> {away}
      </span>
    </li>
  );
}

export const REFEREE_PENDING = "Pro zápas zatím nebyl delegován rozhodčí, data se zobrazí po jeho delegaci.";

export function RefereeCard({ referee, home, away }: { referee: RefereeInfo | null; home: TeamBrief; away: TeamBrief }) {
  const [tab, setTab] = useState<"season" | "teams" | "h2h" | "career">("season");
  if (!referee) {
    return (
      <Card title="Rozhodčí">
        <Empty>{REFEREE_PENDING}</Empty>
      </Card>
    );
  }
  const s = referee.season_stats;
  const c = referee.career_stats;
  const lc = referee.league_context;
  const teamBlock = (team: TeamBrief, summary: RefereeInfo["home_team_matches_officiated"], side: "home" | "away") => (
    <div className="min-w-0">
      <div className="mb-2">
        <TeamTitle team={team} side={side} />
      </div>
      {!summary ? (
        <p className="rounded-xl bg-(--c-raised) px-3 py-3 text-[13px] text-(--c-muted)">Tenhle rozhodčí nepískal zápas týmu za poslední dvě sezóny.</p>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <Stat value={summary.matches} label="zápasů" />
            <Stat value={n2(summary.avg_fouls_by_team)} label="faulů týmu" />
            <Stat value={n2(summary.avg_yellow_by_team)} label="žlutých týmu" />
          </div>
          <ul className="space-y-0.5">
            {summary.recent_matches.map((x: RefereeTeamMatch) => (
              <Played key={x.fixture_id} date={x.date} home={x.home_name} away={x.away_name} hs={x.home_score} as={x.away_score} result={x.result} />
            ))}
          </ul>
        </>
      )}
    </div>
  );

  return (
    <Card
      title={`Rozhodčí: ${referee.name}`}
      lead="Jak moc píská, v porovnání s ligovým průměrem."
      aside={
        <Seg
          label="Přehled rozhodčího"
          value={tab}
          onChange={setTab}
          options={[
            { id: "season", label: "Sezóna" },
            { id: "teams", label: "S těmito týmy" },
            { id: "h2h", label: "Jejich souboje" },
            { id: "career", label: "Kariéra" },
          ]}
        />
      }
    >
      {tab === "season" &&
        (s ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat value={statCount(s["Season Matches"])} label="zápasů v sezóně" />
              <Stat value={s["Fouls"]?.average ?? "—"} label="faulů na zápas" hint={lc ? `Ligový průměr: ${lc.fouls_per_match}` : undefined} />
              <Stat value={statAvg(s["Yellowcards"])} label="žlutých na zápas" hint={lc ? `Ligový průměr: ${lc.yellow_per_match}` : undefined} />
              <Stat value={statAvg(s["Redcards"])} label="červených na zápas" hint={lc ? `Ligový průměr: ${lc.red_per_match}` : undefined} />
            </div>
            {lc && <p className="mt-3 text-[11px] text-(--c-faint)">Ligový průměr z {lc.matches_sampled} odehraných zápasů soutěže. Ukáže, jestli je rozhodčí přísnější než ostatní.</p>}
          </>
        ) : (
          <Empty>V téhle sezóně zatím žádný zápas neodpískal.</Empty>
        ))}

      {tab === "teams" && (
        <div className="grid gap-6 md:grid-cols-2">
          {teamBlock(home, referee.home_team_matches_officiated, "home")}
          {teamBlock(away, referee.away_team_matches_officiated, "away")}
        </div>
      )}

      {tab === "h2h" &&
        (referee.h2h_matches_officiated.length === 0 ? (
          <Empty>Souboje těchto dvou týmů zatím nepískal.</Empty>
        ) : (
          <>
            <ul className="space-y-0.5">
              {referee.h2h_matches_officiated.map((x) => (
                <Played key={x.fixture_id} date={x.date} home={x.home} away={x.away} hs={x.home_score} as={x.away_score} result={x.result_for_home_team} />
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-(--c-faint)">Barva = výsledek z pohledu týmu {home.name}.</p>
          </>
        ))}

      {tab === "career" && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat value={c.matches} label="odpískaných zápasů" />
          <Stat value={c.total_seasons_tracked} label="sledovaných sezón" />
          <Stat value={c.yellow_cards} label="žlutých celkem" />
          <Stat value={c.avg_yellow_per_match ?? "—"} label="žlutých na zápas" />
        </div>
      )}
    </Card>
  );
}
