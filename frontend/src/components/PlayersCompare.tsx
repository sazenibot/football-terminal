import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PlayerBrief, TeamBrief } from "../types";
import { Pill, Section } from "./ui";

type ViewKey = "season" | "last5" | "h2h";
type TeamTab = "home" | "away" | "both";
type SortDir = "asc" | "desc";

interface StatView {
  appearances: number;
  stats: Record<string, number>;
}

interface Col {
  key: string;
  label: string;
  tooltip?: string;
  value: (v: StatView) => number;
  decimals?: number;
  hideIfEmpty?: boolean;
}

const OUTFIELD_COLS: Col[] = [
  { key: "apps", label: "Zápasy", value: (v) => v.appearances },
  { key: "minutes", label: "Minuty", value: (v) => v.stats["Minutes Played"] ?? 0 },
  { key: "goals", label: "Góly", value: (v) => v.stats["Goals"] ?? 0 },
  { key: "assists", label: "Asistence", value: (v) => v.stats["Assists"] ?? 0 },
  { key: "shots", label: "Střely", value: (v) => v.stats["Shots Total"] ?? 0 },
  {
    key: "shots_pm",
    label: "Střely/zápas",
    value: (v) => (v.appearances > 0 ? (v.stats["Shots Total"] ?? 0) / v.appearances : 0),
    decimals: 1,
  },
  { key: "sot", label: "SnB", tooltip: "Střely na branku", value: (v) => v.stats["Shots On Target"] ?? 0 },
  {
    key: "sot_pm",
    label: "SnB/zápas",
    tooltip: "Střely na branku za zápas",
    value: (v) => (v.appearances > 0 ? (v.stats["Shots On Target"] ?? 0) / v.appearances : 0),
    decimals: 1,
  },
  { key: "fouls", label: "Fauly", value: (v) => v.stats["Fouls"] ?? 0 },
  {
    key: "fouls_pm",
    label: "Fauly/zápas",
    value: (v) => (v.appearances > 0 ? (v.stats["Fouls"] ?? 0) / v.appearances : 0),
    decimals: 1,
  },
  { key: "yellow", label: "Žluté", value: (v) => v.stats["Yellowcards"] ?? 0 },
  { key: "red", label: "Červené", value: (v) => v.stats["Redcards"] ?? 0 },
  { key: "clean", label: "Čistá konta", value: (v) => v.stats["Cleansheets"] ?? 0 },
  { key: "rating", label: "Rating", value: (v) => v.stats["Rating"] ?? 0, decimals: 1, hideIfEmpty: true },
];

const GK_COLS: Col[] = [
  { key: "apps", label: "Zápasy", value: (v) => v.appearances },
  { key: "minutes", label: "Minuty", value: (v) => v.stats["Minutes Played"] ?? 0 },
  { key: "saves", label: "Zákroky", value: (v) => v.stats["Saves"] ?? 0 },
  { key: "conceded", label: "Obdržené góly", value: (v) => v.stats["Goals Conceded"] ?? 0 },
  { key: "clean", label: "Čistá konta", value: (v) => v.stats["Cleansheets"] ?? 0 },
  { key: "yellow", label: "Žluté", value: (v) => v.stats["Yellowcards"] ?? 0 },
  { key: "red", label: "Červené", value: (v) => v.stats["Redcards"] ?? 0 },
  { key: "rating", label: "Rating", value: (v) => v.stats["Rating"] ?? 0, decimals: 1, hideIfEmpty: true },
];

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 2) return name;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function viewData(p: PlayerBrief, view: ViewKey): StatView {
  if (view === "season") {
    return { appearances: p.season_stats["Appearances"] ?? 0, stats: p.season_stats };
  }
  if (view === "last5") return p.last5_stats;
  return p.h2h_stats;
}

function fmt(v: number, decimals = 0): string {
  return decimals > 0 ? v.toFixed(decimals) : String(Math.round(v));
}

/**
 * Táhnoucí se tabulka, kde je posuvník zdvojený i NAD tabulkou (ne jen pod ní) —
 * ať uživatel při posunu doprava neztratí z očí, na co se právě dívá.
 * Oba pruhy jsou vzájemně synchronizované přes scrollLeft.
 */
function ScrollSyncTable({ children }: { children: ReactNode }) {
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const syncingFrom = useRef<"top" | "bottom" | null>(null);

  useLayoutEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    const update = () => setScrollWidth(el.scrollWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  useEffect(() => {
    const top = topRef.current;
    const bottom = bottomRef.current;
    if (!top || !bottom) return;
    const onTop = () => {
      if (syncingFrom.current === "bottom") return;
      syncingFrom.current = "top";
      bottom.scrollLeft = top.scrollLeft;
      syncingFrom.current = null;
    };
    const onBottom = () => {
      if (syncingFrom.current === "top") return;
      syncingFrom.current = "bottom";
      top.scrollLeft = bottom.scrollLeft;
      syncingFrom.current = null;
    };
    top.addEventListener("scroll", onTop);
    bottom.addEventListener("scroll", onBottom);
    return () => {
      top.removeEventListener("scroll", onTop);
      bottom.removeEventListener("scroll", onBottom);
    };
  }, []);

  return (
    <div>
      <div ref={topRef} className="stat-table-scroll overflow-x-auto overflow-y-hidden h-3 mb-1">
        <div style={{ width: scrollWidth, height: 1 }} />
      </div>
      <div ref={bottomRef} className="stat-table-scroll overflow-x-auto rounded-lg border border-slate-800 light:border-slate-200">
        {children}
      </div>
    </div>
  );
}

function PlayerTable({
  teamLabel,
  groups,
  view,
  isGk,
}: {
  teamLabel: string;
  /** Jedna nebo víc skupin hráčů. Když je jich víc (režim "Oba týmy"), zobrazí
   *  se všichni v JEDNÉ tabulce s malým logem/názvem týmu u jména. */
  groups: { team: TeamBrief; players: PlayerBrief[] }[];
  view: ViewKey;
  isGk: boolean;
}) {
  const [sortKey, setSortKey] = useState("minutes");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const showTeamTag = groups.length > 1;

  const allCols = isGk ? GK_COLS : OUTFIELD_COLS;
  const rows = useMemo(
    () =>
      groups.flatMap(({ team, players }) => players.map((p) => ({ p, team, v: viewData(p, view) }))),
    [groups, view]
  );

  const cols = useMemo(
    () => allCols.filter((c) => !c.hideIfEmpty || rows.some((r) => c.value(r.v) > 0)),
    [allCols, rows]
  );

  const activeCol = cols.find((c) => c.key === sortKey) ?? cols[0];
  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const diff = activeCol.value(a.v) - activeCol.value(b.v);
      return sortDir === "asc" ? diff : -diff;
    });
    return copy;
  }, [rows, activeCol, sortDir]);

  const toggleSort = (key: string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  if (rows.length === 0) {
    return (
      <div>
        <h3 className="font-medium text-white light:text-slate-900 mb-2">{teamLabel}</h3>
        <p className="text-slate-500 light:text-slate-400 text-sm py-4">Žádní hráči v této kategorii.</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="font-medium text-white light:text-slate-900 mb-2">{teamLabel}</h3>
      <ScrollSyncTable>
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-slate-400 light:text-slate-500 text-left border-b border-slate-800 light:border-slate-200">
              <th className="py-1.5 pl-3 pr-3 sticky left-0 bg-[#12161f] light:bg-white z-10">Hráč</th>
              {cols.map((c) => (
                <th
                  key={c.key}
                  title={c.tooltip}
                  onClick={() => toggleSort(c.key)}
                  className="py-1.5 pr-3 text-right cursor-pointer hover:text-slate-200 light:hover:text-slate-800 select-none whitespace-nowrap"
                >
                  {c.label}
                  {sortKey === c.key && <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(({ p, team, v }) => (
              <tr key={`${team.id}-${p.id}`} className="border-b border-slate-900 light:border-slate-100 hover:bg-slate-900/40 light:hover:bg-slate-50">
                <td className="py-1.5 pl-3 pr-3 sticky left-0 bg-[#12161f] light:bg-white text-slate-100 light:text-slate-800">
                  <span className="text-slate-500 mr-1.5">{p.jersey_number ?? "—"}</span>
                  {shortName(p.name)}
                  {showTeamTag && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-light text-slate-500 light:text-slate-400">
                      {team.image && (
                        <img src={team.image} alt="" className="w-3.5 h-3.5 object-contain inline-block" />
                      )}
                      {team.name}
                    </span>
                  )}
                </td>
                {cols.map((c) => (
                  <td key={c.key} className="py-1.5 pr-3 text-right font-mono text-slate-300 light:text-slate-700">
                    {fmt(c.value(v), c.decimals)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollSyncTable>
      <p className="text-[11px] text-slate-600 light:text-slate-400 mt-1">
        ↔ táhni posuvník nahoře nad tabulkou pro další statistiky · klikni na název sloupce pro seřazení
      </p>
    </div>
  );
}

export function PlayersCompare({
  home,
  away,
  playersHome,
  playersAway,
}: {
  home: TeamBrief;
  away: TeamBrief;
  playersHome: PlayerBrief[];
  playersAway: PlayerBrief[];
}) {
  const [view, setView] = useState<ViewKey>("season");
  const [posTab, setPosTab] = useState<"outfield" | "gk">("outfield");
  const [teamTab, setTeamTab] = useState<TeamTab>("home");

  const filterPos = (list: PlayerBrief[]) =>
    list.filter((p) => (posTab === "gk" ? p.is_gk : !p.is_gk));

  return (
    <Section
      title="8. Srovnání hráčů"
      note="Rating a detailní statistiky u 'Posledních 5' a 'Vzájemné zápasy' vycházejí z lineup dat jednotlivých zápasů — u hráčů, kteří v daném okně nenastoupili, budou nuly."
    >
      <div className="flex flex-wrap gap-2 mb-3">
        <Pill active={view === "season"} onClick={() => setView("season")}>
          Celá sezóna
        </Pill>
        <Pill active={view === "last5"} onClick={() => setView("last5")}>
          Posledních 5 zápasů
        </Pill>
        <Pill active={view === "h2h"} onClick={() => setView("h2h")}>
          Vzájemné zápasy
        </Pill>
        <span className="w-px bg-slate-700 light:bg-slate-300 mx-1" />
        <Pill active={posTab === "outfield"} onClick={() => setPosTab("outfield")}>
          Hráči v poli
        </Pill>
        <Pill active={posTab === "gk"} onClick={() => setPosTab("gk")}>
          Brankáři
        </Pill>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <Pill active={teamTab === "home"} onClick={() => setTeamTab("home")}>
          {home.name}
        </Pill>
        <Pill active={teamTab === "away"} onClick={() => setTeamTab("away")}>
          {away.name}
        </Pill>
        <Pill active={teamTab === "both"} onClick={() => setTeamTab("both")}>
          Oba týmy
        </Pill>
      </div>

      <div className="space-y-6">
        {teamTab === "home" && (
          <PlayerTable
            teamLabel={home.name}
            groups={[{ team: home, players: filterPos(playersHome) }]}
            view={view}
            isGk={posTab === "gk"}
          />
        )}
        {teamTab === "away" && (
          <PlayerTable
            teamLabel={away.name}
            groups={[{ team: away, players: filterPos(playersAway) }]}
            view={view}
            isGk={posTab === "gk"}
          />
        )}
        {teamTab === "both" && (
          <PlayerTable
            teamLabel={`${home.name} + ${away.name}`}
            groups={[
              { team: home, players: filterPos(playersHome) },
              { team: away, players: filterPos(playersAway) },
            ]}
            view={view}
            isGk={posTab === "gk"}
          />
        )}
      </div>
    </Section>
  );
}
