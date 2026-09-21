import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CatalogPlayerRadar } from "../components/CatalogPlayerRadar";
import { EmptyNote } from "../components/CatalogStats";
import { Pill } from "../components/ui";
import { formatDate } from "../lib/format";
import {
  PLAYER_STATS,
  RADAR_AXES,
  ROLE_LABEL,
  SELECT,
  badgesFor,
  csMatches,
  fdrBuckets,
  filterMatches,
  fmt,
  gamesPerTeam,
  metricValue,
  minuteThreshold,
  minutesOf,
  per90,
  rankBar,
  rankDesc,
  rankTone,
  seasonLabel,
  sumKey,
  type Badge,
  type ClubKey,
  type Half,
  type ProfileGroup,
  type RankScope,
  type SeasonKey,
  type Venue,
} from "../lib/playerCatalog";
import { useCatalogPlayer, useCatalogPlayerIndex } from "../lib/useData";
import type { CatalogPlayerIndexRow, CatalogPlayerMatch, CatalogPlayerRole } from "../types";
import { CatalogNotFound } from "./CatalogNotFound";

const PROFILE_TABS: { id: ProfileGroup; label: string }[] = [
  { id: "attack", label: "Ofenzivní" },
  { id: "defense", label: "Defenzivní" },
  { id: "discipline", label: "Disciplína" },
];

export function CatalogPlayerPage() {
  const id = Number(useParams().id);
  const { data: player, error, missing } = useCatalogPlayer(Number.isFinite(id) ? id : null);
  const { data: index } = useCatalogPlayerIndex(player?.league_id ?? null);

  const [season, setSeason] = useState<SeasonKey | null>(null);
  const [club, setClub] = useState<ClubKey>("current");
  const [venue, setVenue] = useState<Venue>("all");
  const [half, setHalf] = useState<Half>("all");
  const [scope, setScope] = useState<RankScope>("league");
  const [tab, setTab] = useState<ProfileGroup>("attack");
  const [openMatches, setOpenMatches] = useState(false);
  const [compareTeamId, setCompareTeamId] = useState<number | "">("");
  const [compareId, setCompareId] = useState<number | "">("");
  const [radarVenue, setRadarVenue] = useState<Venue>("all");
  const [radarSeason, setRadarSeason] = useState<SeasonKey | null>(null);
  const [radarHalf, setRadarHalf] = useState<Half>("all");

  const overlay = player?.overlay;
  const currentSeasonId = overlay?.current_season_id ?? index?.current_season_id ?? null;
  const resolvedSeason: SeasonKey = season ?? currentSeasonId ?? "all";
  const resolvedRadarSeason: SeasonKey = radarSeason ?? currentSeasonId ?? "all";
  const role: CatalogPlayerRole = overlay?.role || roleFromPosition(player?.position);
  const matches = overlay?.matches || [];
  const seasons = overlay?.seasons || index?.seasons || [];
  const clubs = overlay?.clubs || [];

  const slice = useMemo(
    () => filterMatches(matches, resolvedSeason, venue, half, club, player?.team_id),
    [matches, resolvedSeason, venue, half, club, player?.team_id],
  );

  const games = useMemo(() => gamesInSlice(seasons, resolvedSeason, index?.players), [seasons, resolvedSeason, index?.players]);
  const threshold = minuteThreshold(gamesPerTeam(games));

  const poolRows = useMemo(() => {
    if (!index) return [] as CatalogPlayerMatch[][];
    return index.players
      .filter((p) => scope === "league" || p.role === role)
      .map((p) => filterMatches(p.matches, resolvedSeason, venue, half, "all"))
      .filter((rows) => minutesOf(rows) >= threshold);
  }, [index, scope, role, resolvedSeason, venue, half, threshold]);

  const kpiPool = useMemo(() => {
    if (!index) return [] as CatalogPlayerMatch[][];
    return index.players
      .map((p) => filterMatches(p.matches, resolvedSeason, venue, half, "all"))
      .filter((rows) => minutesOf(rows) >= threshold);
  }, [index, resolvedSeason, venue, half, threshold]);

  const badges = useMemo(
    () => badgesFor(slice, role, poolRows, 90 * gamesPerTeam(games)),
    [slice, role, poolRows, games],
  );

  const peers = useMemo(() => {
    if (!index) return [] as CatalogPlayerIndexRow[];
    return index.players
      .filter((p) => p.role === role && p.id !== id)
      .filter((p) => p.matches.some((m) => resolvedRadarSeason === "all" || m.s === resolvedRadarSeason))
      .sort((a, b) => a.name.localeCompare(b.name, "cs"));
  }, [index, role, id, resolvedRadarSeason]);

  const radarTeams = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of peers) {
      if (p.team_id && p.team_name) map.set(p.team_id, p.team_name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "cs"));
  }, [peers]);

  const teamPeers = useMemo(
    () => (compareTeamId === "" ? [] : peers.filter((p) => p.team_id === compareTeamId)),
    [peers, compareTeamId],
  );

  const compare =
    compareId !== "" && teamPeers.some((p) => p.id === compareId)
      ? index?.players.find((p) => p.id === compareId) || null
      : null;
  const radarA = useMemo(
    () => filterMatches(matches, resolvedRadarSeason, radarVenue, radarHalf, "all"),
    [matches, resolvedRadarSeason, radarVenue, radarHalf],
  );
  const radarB = useMemo(
    () => (compare ? filterMatches(compare.matches, resolvedRadarSeason, radarVenue, radarHalf, "all") : []),
    [compare, resolvedRadarSeason, radarVenue, radarHalf],
  );
  const radarPool = useMemo(() => {
    if (!index) return [] as CatalogPlayerMatch[][];
    const gamesN = gamesInSlice(seasons, resolvedRadarSeason, index.players);
    const min = minuteThreshold(gamesPerTeam(gamesN));
    return index.players
      .filter((p) => p.role === role)
      .map((p) => filterMatches(p.matches, resolvedRadarSeason, radarVenue, radarHalf, "all"))
      .filter((rows) => minutesOf(rows) >= min);
  }, [index, role, resolvedRadarSeason, radarVenue, radarHalf, seasons]);
  const radarAvg = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const key of RADAR_AXES[role]) {
      const def = PLAYER_STATS.find((s) => s.key === key);
      out[key] = mean(radarPool.map((rows) => (def ? metricValue(rows, def) : null)));
    }
    return out;
  }, [radarPool, role]);

  if (missing) return <CatalogNotFound kind="hráč" />;
  if (error) {
    return (
      <div className="max-w-6xl mx-auto py-12 px-4 text-rose-400">
        <Link to="/catalog" className="text-emerald-400 text-sm">
          ← katalog
        </Link>
        <p className="mt-4">{error}</p>
      </div>
    );
  }
  if (!player) {
    return <p className="max-w-6xl mx-auto py-16 px-4 text-slate-400">Načítám hráče…</p>;
  }

  const photo = player.image && !player.image.includes("placeholder") ? player.image : null;
  const kpi = kpiFor(role, slice, kpiPool);
  const buckets = fdrBuckets(slice);
  const explorerStats = PLAYER_STATS.filter((s) => s.group === tab && metricValue(slice, s) != null);

  return (
    <div className="max-w-6xl mx-auto py-12 px-4 pt-20 flex flex-col gap-8">
      <Link to={`/catalog?league=${player.league_id}`} className="text-emerald-400 text-sm w-fit">
        ← {player.league_name}
      </Link>

      <header className="card px-5 py-5 flex flex-col gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4 min-w-0">
            {photo ? (
              <img src={photo} alt="" className="h-24 w-24 rounded-full object-cover ring-1 ring-white/10 light:ring-slate-200" />
            ) : (
              <span className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500/15 text-2xl font-bold text-emerald-400">
                {initials(player.name)}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-400/85">Profil hráče</p>
              <h1 className="text-2xl font-bold text-white light:text-slate-900">{player.name}</h1>
              <p className="text-sm text-slate-400 mt-1">
                <Link to={`/catalog/teams/${player.team_id}`} className="hover:text-emerald-400">
                  {player.team_name}
                </Link>
                {` · ${player.position || ROLE_LABEL[role]}`}
                {player.number != null ? ` · #${player.number}` : ""}
                {player.age != null ? ` · ${player.age} let` : ""}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                <span className="text-white light:text-slate-900 font-semibold">{slice.length}</span>
                {` ${csMatches(slice.length)}`}
                {resolvedSeason !== "all" ? ` · ${seasonLabel(resolvedSeason, seasons, currentSeasonId)}` : ""}
                <span>{` · celkem dostupných ${overlay?.career_matches ?? matches.length} ${csMatches(overlay?.career_matches ?? matches.length)}`}</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {badges.length ? (
                  badges.map((b) => <BadgeChip key={b.label} badge={b} />)
                ) : (
                  <span className="text-xs text-slate-500">V tomto filtru žádný příznak nesedí.</span>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:w-[28rem] shrink-0">
            <label className="text-xs text-slate-500">
              Sezóna
              <select
                className={SELECT}
                value={resolvedSeason === "all" ? "all" : String(resolvedSeason)}
                onChange={(e) => setSeason(e.target.value === "all" ? "all" : Number(e.target.value))}
              >
                <option value="all">Všechny sezony</option>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.id}
                    {s.id === currentSeasonId ? " (aktuální)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              Klub
              <select
                className={SELECT}
                value={String(club)}
                onChange={(e) => {
                  const v = e.target.value;
                  setClub(v === "all" || v === "current" ? v : Number(v));
                }}
              >
                <option value="current">Současný klub</option>
                <option value="all">Všechny kluby</option>
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.from && c.to ? ` (${c.from.slice(0, 4)}–${c.to.slice(0, 4)})` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpi.map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-slate-800/80 light:border-slate-200 bg-slate-900/30 light:bg-slate-50 px-4 py-3"
            >
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{item.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-white light:text-slate-900">
                {fmt(item.value, item.digits)}
              </p>
              {item.sub ? (
                <p className={`mt-1 text-[11px] font-medium ${item.tone || "text-slate-500"}`}>{item.sub}</p>
              ) : null}
            </div>
          ))}
        </div>
      </header>

      <section className="card p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">FDR Impact</p>
        <h2 className="text-lg font-semibold text-white light:text-slate-900 mt-1">Výkon podle loňské tabulky soupeře</h2>
        <p className="text-xs text-slate-500 mt-1 mb-4">
          Těžké = 1.–5. minulé sezony, střed 6.–11., lehké 12.–16. a nováčci. Čísla jsou eventová, ne xG.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <FdrCard title="Těžké" tone="hard" role={role} rows={buckets.hard} />
          <FdrCard title="Střed" tone="mid" role={role} rows={buckets.mid} />
          <FdrCard title="Lehké" tone="easy" role={role} rows={buckets.easy} />
        </div>
      </section>

      <section className="card p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between mb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pro Data Explorer</p>
            <h2 className="text-lg font-semibold text-white light:text-slate-900 mt-1">Sezónní sazby</h2>
            <p className="text-xs text-slate-500 mt-1">
              Pořadí mezi hráči s alespoň 20 % minut. /90 z odehraných minut v tomto filtru.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill active={scope === "league"} onClick={() => setScope("league")}>
              Celá liga
            </Pill>
            <Pill active={scope === "role"} onClick={() => setScope("role")}>
              Stejná role
            </Pill>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 mb-4">
          <Filter label="Doma / venku" value={venue} onChange={setVenue} options={VENUE_OPTS} />
          <Filter label="Jaro / podzim" value={half} onChange={setHalf} options={HALF_OPTS} />
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {PROFILE_TABS.map((t) => (
            <Pill key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </Pill>
          ))}
        </div>
        {tab === "attack" ? (
          <p className="text-xs text-slate-500 mb-4">
            Centrující přihrávky = křížné nahrávky z boku hřiště do vápna (cross). Penalty jsou eventové
            trefené kopy, ne xG z penalty.
          </p>
        ) : null}
        {explorerStats.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {explorerStats.map((stat) => {
              const value = metricValue(slice, stat);
              const pool = poolRows.map((rows) => metricValue(rows, stat));
              const { rank, size } = rankDesc(value, pool, stat.higherBetter);
              const avg = mean(pool);
              return <StatCard key={stat.key} label={stat.label} value={value} rank={rank} size={size} avg={avg} />;
            })}
          </div>
        ) : (
          <EmptyNote>Pro tento štítek v tomto filtru nic není.</EmptyNote>
        )}
      </section>

      <section className="card p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Radar</p>
        <h2 className="text-lg font-semibold text-white light:text-slate-900 mt-1 mb-3">Porovnání s hráčem stejné role</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 mb-3">
          <Filter
            label="Sezóna"
            value={resolvedRadarSeason === "all" ? "all" : String(resolvedRadarSeason)}
            onChange={(v) => setRadarSeason(v === "all" ? "all" : Number(v))}
            options={[
              { id: "all", label: "Všechny sezony" },
              ...seasons.map((s) => ({ id: String(s.id), label: String(s.name || s.id) })),
            ]}
          />
          <Filter label="Doma / venku" value={radarVenue} onChange={setRadarVenue} options={VENUE_OPTS} />
          <Filter label="Jaro / podzim" value={radarHalf} onChange={setRadarHalf} options={HALF_OPTS} />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 mb-4">
          <label className="text-xs text-slate-500">
            Tým
            <select
              className={SELECT}
              value={compareTeamId === "" ? "" : String(compareTeamId)}
              onChange={(e) => {
                setCompareTeamId(e.target.value ? Number(e.target.value) : "");
                setCompareId("");
              }}
            >
              <option value="">— vyber tým —</option>
              {radarTeams.map(([tid, name]) => (
                <option key={tid} value={tid}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Hráč
            <select
              className={SELECT}
              value={compare && compareId !== "" ? String(compareId) : ""}
              onChange={(e) => setCompareId(e.target.value ? Number(e.target.value) : "")}
              disabled={compareTeamId === ""}
            >
              <option value="">— vyber hráče —</option>
              {teamPeers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.number != null ? ` · #${p.number}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        {radarA.length ? (
          <CatalogPlayerRadar
            a={radarValues(radarA, role)}
            b={compare && radarB.length ? radarValues(radarB, role) : null}
            avg={radarAvg}
            axes={RADAR_AXES[role]}
            nameA={player.name}
            nameB={compare?.name}
          />
        ) : (
          <EmptyNote>V tomto filtru nemáme minuty.</EmptyNote>
        )}
      </section>

      <section className="overflow-hidden rounded-xl ring-1 ring-slate-800 light:ring-slate-200">
        <button
          type="button"
          onClick={() => setOpenMatches((v) => !v)}
          className="w-full flex items-center justify-between gap-4 px-5 py-3.5 text-left bg-slate-900/60 light:bg-slate-100 hover:bg-slate-900 light:hover:bg-slate-200/80 border-y border-dashed border-slate-700 light:border-slate-300"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-slate-400 text-lg leading-none">{openMatches ? "▾" : "▸"}</span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Rozpad zápasů</p>
              <p className="mt-0.5 text-sm font-semibold text-white light:text-slate-900">
                {openMatches ? "Skrýt výpis" : `${slice.length} ${csMatches(slice.length)} v aktuálním filtru`}
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-500/15 text-emerald-300 light:bg-emerald-100 light:text-emerald-800 px-2.5 py-1 text-xs font-semibold tabular-nums">
            {slice.length}
          </span>
        </button>
        {openMatches && (
          <div className="border-t border-slate-800 light:border-slate-200">
            <MatchTable rows={slice} />
          </div>
        )}
      </section>
    </div>
  );
}

const VENUE_OPTS = [
  { id: "all", label: "Doma + venku" },
  { id: "home", label: "Doma" },
  { id: "away", label: "Venku" },
];
const HALF_OPTS = [
  { id: "all", label: "Celá sezona" },
  { id: "autumn", label: "Podzim" },
  { id: "spring", label: "Jaro" },
];

function Filter<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <label className="text-xs text-slate-500">
      {label}
      <select className={SELECT} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function kpiFor(role: CatalogPlayerRole, rows: CatalogPlayerMatch[], pool: CatalogPlayerMatch[][]) {
  const mn = minutesOf(rows);
  if (role === "gk") {
    return [
      kpiCell("Zákroky", rows.length ? sumKey(rows, "sv") : null, 0, pool.map((p) => (p.length ? sumKey(p, "sv") : null)), true),
      kpiCell("Zákroky/90", per90(sumKey(rows, "sv"), mn), 2, pool.map((p) => per90(sumKey(p, "sv"), minutesOf(p))), true, true),
      kpiCell("Nuly", rows.length ? sumKey(rows, "cs") : null, 0, pool.map((p) => (p.length ? sumKey(p, "cs") : null)), true),
      kpiCell("Obdržené", rows.length ? sumKey(rows, "gc") : null, 0, pool.map((p) => (p.length ? sumKey(p, "gc") : null)), false),
    ];
  }
  if (role === "def") {
    return [
      kpiCell("Minuty", mn || null, 0, pool.map(minutesOf), true),
      kpiCell("Nuly", rows.length ? sumKey(rows, "cs") : null, 0, pool.map((p) => (p.length ? sumKey(p, "cs") : null)), true),
      kpiCell("Fauly/90", per90(sumKey(rows, "f"), mn), 2, pool.map((p) => per90(sumKey(p, "f"), minutesOf(p))), false, true),
      kpiCell("Souboje/90", per90(sumKey(rows, "dw"), mn), 2, pool.map((p) => per90(sumKey(p, "dw"), minutesOf(p))), true, true),
    ];
  }
  return [
    kpiCell("Minuty", mn || null, 0, pool.map(minutesOf), true),
    kpiCell("Góly", rows.length ? sumKey(rows, "g") : null, 0, pool.map((p) => (p.length ? sumKey(p, "g") : null)), true),
    kpiCell("Asistence", rows.length ? sumKey(rows, "a") : null, 0, pool.map((p) => (p.length ? sumKey(p, "a") : null)), true),
    kpiCell("Střely/90", per90(sumKey(rows, "sh"), mn), 2, pool.map((p) => per90(sumKey(p, "sh"), minutesOf(p))), true, true),
  ];
}

function kpiCell(
  label: string,
  value: number | null,
  digits: number,
  pool: Array<number | null>,
  higherBetter: boolean,
  withAvg = false,
) {
  const { rank, size } = rankDesc(value, pool, higherBetter);
  const parts: string[] = [];
  if (rank != null && size >= 2) parts.push(`${rank}. z ${size}`);
  if (withAvg) {
    const avg = mean(pool);
    if (avg != null) parts.push(`liga ${fmt(avg, digits)}`);
  }
  return {
    label,
    value,
    digits,
    sub: parts.join(" · ") || undefined,
    tone: rank != null && size >= 2 ? rankTone(rank, size) : "text-slate-500",
  };
}

function BadgeChip({ badge }: { badge: Badge }) {
  const tone =
    badge.tone === "warning"
      ? "bg-rose-500/25 text-rose-100 ring-rose-400/40 light:bg-rose-100 light:text-rose-800 light:ring-rose-300"
      : badge.tone === "value"
        ? "bg-emerald-500/25 text-emerald-100 ring-emerald-400/40 light:bg-emerald-100 light:text-emerald-800 light:ring-emerald-300"
        : "bg-slate-600/80 text-slate-100 ring-slate-400/40 light:bg-slate-200 light:text-slate-800 light:ring-slate-300";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tone}`}>
      {badge.emoji} {badge.label}
    </span>
  );
}

function FdrCard({
  title,
  tone,
  role,
  rows,
}: {
  title: string;
  tone: "easy" | "mid" | "hard";
  role: CatalogPlayerRole;
  rows: CatalogPlayerMatch[];
}) {
  const color = tone === "easy" ? "text-emerald-400" : tone === "hard" ? "text-rose-400" : "text-amber-400";
  const ring = tone === "easy" ? "ring-emerald-500/25" : tone === "hard" ? "ring-rose-500/25" : "ring-amber-400/25";
  const mn = minutesOf(rows);
  const pair =
    role === "gk"
      ? [
          { label: "Zákroky/90", value: per90(sumKey(rows, "sv"), mn) },
          { label: "Obdržené/90", value: per90(sumKey(rows, "gc"), mn) },
        ]
      : role === "def"
        ? [
            { label: "Souboje/90", value: per90(sumKey(rows, "dw"), mn) },
            { label: "Nuly", value: sumKey(rows, "cs") || null },
          ]
        : [
            { label: "Góly/90", value: per90(sumKey(rows, "g"), mn) },
            { label: "Střely/90", value: per90(sumKey(rows, "sh"), mn) },
          ];
  return (
    <div className={`rounded-xl bg-slate-900/30 light:bg-slate-100 px-4 py-4 ring-1 ${ring}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${color}`}>{title}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {pair.map((p) => (
          <div key={p.label}>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{p.label}</p>
            <p className={`text-2xl font-semibold tabular-nums ${color}`}>{fmt(p.value)}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        {rows.length} {csMatches(rows.length)} · {fmt(mn, 0)} min
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  rank,
  size,
  avg,
}: {
  label: string;
  value: number | null;
  rank: number | null;
  size: number;
  avg: number | null;
}) {
  const tone = rank != null && size >= 2 ? rankTone(rank, size) : "text-slate-400";
  const bar = rank != null && size >= 2 ? rankBar(rank, size) : "bg-slate-600";
  const width = rank != null && size > 0 ? Math.max(8, Math.round(((size - rank + 1) / size) * 100)) : 0;
  return (
    <div className="rounded-xl bg-slate-900/40 light:bg-slate-100 px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xl font-semibold tabular-nums text-white light:text-slate-900">{fmt(value)}</span>
        {rank != null && size >= 2 && <span className={`text-sm font-semibold ${tone}`}>{rank}. v lize</span>}
      </div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">liga {fmt(avg)}</div>
      <div className="mt-3 h-2.5 rounded-full bg-slate-800 light:bg-slate-200 overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${width}%` }} />
      </div>
      {rank != null && size >= 2 && (
        <p className={`mt-1.5 text-[11px] font-medium ${tone}`}>
          {rank}. z {size}
        </p>
      )}
    </div>
  );
}

function MatchTable({ rows }: { rows: CatalogPlayerMatch[] }) {
  if (!rows.length) return <EmptyNote>V tomto filtru žádný zápas.</EmptyNote>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-semibold">Datum</th>
            <th className="px-3 py-2 font-semibold">Zápas</th>
            <th className="px-3 py-2 font-semibold text-right">Min</th>
            <th className="px-3 py-2 font-semibold text-right">G</th>
            <th className="px-3 py-2 font-semibold text-right">A</th>
            <th className="px-3 py-2 font-semibold text-right">Střely</th>
            <th className="px-3 py-2 font-semibold text-right">Fauly</th>
            <th className="px-3 py-2 font-semibold text-right">ŽK</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const score = `${m.hs}:${m.as}`;
            const line = m.h ? `${m.tn} ${score} ${m.on}` : `${m.on} ${score} ${m.tn}`;
            return (
              <tr key={m.fid} className="border-t border-slate-800/80 light:border-slate-200">
                <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{m.d ? formatDate(m.d) : "—"}</td>
                <td className="px-3 py-2">
                  {m.mp ? (
                    <Link to={`/match/${m.fid}`} className="text-emerald-400 hover:underline">
                      {line}
                    </Link>
                  ) : (
                    <span className="text-white light:text-slate-900">{line}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(m.st?.mn, 0)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(m.st?.g, 0)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(m.st?.a, 0)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(m.st?.sh, 0)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(m.st?.f, 0)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(m.st?.y, 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function radarValues(rows: CatalogPlayerMatch[], role: CatalogPlayerRole) {
  const out: Record<string, number | null> = {};
  for (const key of RADAR_AXES[role]) {
    const def = PLAYER_STATS.find((s) => s.key === key);
    out[key] = def ? metricValue(rows, def) : per90(sumKey(rows, key), minutesOf(rows));
  }
  return out;
}

function gamesInSlice(
  seasons: { id: number; games?: number | null }[],
  season: SeasonKey,
  players?: CatalogPlayerIndexRow[],
) {
  if (season !== "all") {
    return seasons.find((s) => s.id === season)?.games || uniqueFixtures(players, season);
  }
  return seasons.reduce((s, row) => s + (row.games || 0), 0) || uniqueFixtures(players, "all");
}

function uniqueFixtures(players: CatalogPlayerIndexRow[] | undefined, season: SeasonKey) {
  const set = new Set<number>();
  for (const p of players || []) {
    for (const m of p.matches) {
      if (season !== "all" && m.s !== season) continue;
      set.add(m.fid);
    }
  }
  return set.size;
}

function mean(values: Array<number | null>) {
  const clean = values.filter((v): v is number => v != null);
  if (!clean.length) return null;
  return Math.round((clean.reduce((a, b) => a + b, 0) / clean.length) * 100) / 100;
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function roleFromPosition(position?: string | null): CatalogPlayerRole {
  const p = (position || "").toLowerCase();
  if (p.includes("brank")) return "gk";
  if (p.includes("obrán") || p.includes("obran")) return "def";
  if (p.includes("zálož") || p.includes("zaloz")) return "mid";
  return "att";
}
