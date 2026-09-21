import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useCatalogReferee } from "../lib/useData";
import { CatalogNotFound } from "./CatalogNotFound";
import { EmptyNote } from "../components/CatalogStats";
import { formatDate } from "../lib/format";
import type { CatalogRefereeDiscStat, CatalogRefereeMatch, CatalogRefereeSeason } from "../types";

type SeasonKey = "all" | number;

const SELECT =
  "mt-1 w-full rounded-lg border border-slate-700 bg-[#12161f] text-slate-100 text-sm px-3 py-2 light:bg-white light:border-slate-300 light:text-slate-800";

export function CatalogRefereePage() {
  const id = Number(useParams().id);
  const [params] = useSearchParams();
  const { data: ref, error, missing } = useCatalogReferee(Number.isFinite(id) ? id : null);
  const [season, setSeason] = useState<SeasonKey | null>(null);
  const [teamId, setTeamId] = useState<number | "all">("all");

  const overlay = ref?.overlay;
  const currentSeasonId = overlay?.current_season_id ?? null;
  const resolvedSeason: SeasonKey = season ?? currentSeasonId ?? "all";
  const matches = overlay?.matches || [];
  const seasons = overlay?.seasons || [];

  const seasonMatches = useMemo(
    () => matches.filter((m) => resolvedSeason === "all" || m.s === resolvedSeason),
    [matches, resolvedSeason],
  );

  const teams = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of seasonMatches) {
      if (m.hid && m.hn) map.set(m.hid, m.hn);
      if (m.aid && m.an) map.set(m.aid, m.an);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "cs"));
  }, [seasonMatches]);

  const tableMatches = useMemo(
    () =>
      seasonMatches.filter((m) => teamId === "all" || m.hid === teamId || m.aid === teamId),
    [seasonMatches, teamId],
  );

  if (missing) return <CatalogNotFound kind="rozhodčí" />;
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
  if (!ref) {
    return <p className="max-w-6xl mx-auto py-16 px-4 text-slate-400">Načítám rozhodčího…</p>;
  }

  const fromQuery = Number(params.get("league"));
  const primary =
    (ref.leagues || []).find((l) => l.id === fromQuery) ||
    [...(ref.leagues || [])].sort(
      (a, b) => Number(b.in_league) - Number(a.in_league) || (b.league_matches || 0) - (a.league_matches || 0),
    )[0] || { id: ref.league_id, name: ref.league_name, in_league: ref.in_league, league_matches: ref.league_matches };

  const career = overlay?.career_matches ?? matches.length;
  const sm = smFor(seasons, resolvedSeason);
  const split = resultSplit(seasonMatches);
  const disc = discFor(overlay?.discipline, resolvedSeason);

  return (
    <div className="max-w-6xl mx-auto py-12 px-4 pt-20 flex flex-col gap-8">
      <Link to={`/catalog?league=${primary.id}`} className="text-emerald-400 text-sm w-fit">
        ← {primary.name}
      </Link>

      <header className="card px-5 py-4 flex items-center justify-between gap-6">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-400/85">Hlavní rozhodčí</p>
          <h1 className="text-2xl font-bold text-white light:text-slate-900 mt-0.5">{ref.name}</h1>
          <p className="text-sm text-slate-400 light:text-slate-500 mt-1">
            <span className="text-white light:text-slate-900 font-semibold">{seasonMatches.length}</span>
            {` ${csMatches(seasonMatches.length)}`}
            {resolvedSeason !== "all" ? ` · ${seasonLabel(resolvedSeason, seasons, currentSeasonId)}` : ""}
            <span className="text-slate-500">{` (${career} ${csMatches(career)} celkem)`}</span>
          </p>
        </div>
        <label className="text-xs text-slate-500 w-52 shrink-0">
          Sezóna
          <select
            className={SELECT}
            value={resolvedSeason === "all" ? "all" : String(resolvedSeason)}
            onChange={(e) => {
              const v = e.target.value;
              setSeason(v === "all" ? "all" : Number(v));
              setTeamId("all");
            }}
          >
            <option value="all">Všechny sezony</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.id}
                {s.id === currentSeasonId ? " (aktuální)" : ""} · {s.matches}×
              </option>
            ))}
          </select>
        </label>
      </header>

      {seasonMatches.length === 0 ? (
        <EmptyNote>V tomto filtru zatím nemáme zápas, kde je hlavní.</EmptyNote>
      ) : (
        <>
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-400">Poměr výsledků v jeho zápasech</h2>
            <ResultSplitBar homePct={split.home} drawPct={split.draw} awayPct={split.away} />
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-400">
              Disciplinární tendence (na zápas, oba týmy dohromady)
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <DiscCard
                swatch="bg-amber-400"
                label="Žluté karty"
                value={avgSum(seasonMatches, "yellow")}
                ctx={disc.yellow}
              />
              <DiscCard swatch="bg-red-500" label="Červené karty" value={avgSum(seasonMatches, "red")} ctx={disc.red} />
              <DiscCard
                swatch="bg-orange-400"
                label="Druhá žlutá"
                value={avgSum(seasonMatches, "yellowred") ?? sm.yellowred ?? null}
                ctx={disc.yellowred}
              />
              <DiscCard ring label="Fauly" value={avgSum(seasonMatches, "fouls")} ctx={disc.fouls} />
              <DiscCard
                swatch="bg-emerald-400"
                label="Penalty"
                value={avgSum(seasonMatches, "penalties")}
                ctx={disc.penalties}
              />
              <DiscCard
                swatch="bg-sky-400"
                label="Použití VAR"
                value={avgSum(seasonMatches, "var") ?? sm.var ?? null}
                ctx={disc.var}
              />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              1. = nejvíc v lize (přísnější). Ligový průměr je ze všech zápasů soutěže v tomto filtru. Použití VAR =
              kolikrát v zápase zasáhl videoasistent (kontrola i případná změna verdiktu). SportMonks nerozlišuje, jestli
              rozhodnutí padlo, nebo zůstalo.
            </p>
          </section>

          <section>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-400">Zápasy</h2>
              <label className="text-xs text-slate-500 sm:w-64">
                Tým
                <select
                  className={SELECT}
                  value={teamId === "all" ? "all" : String(teamId)}
                  onChange={(e) => setTeamId(e.target.value === "all" ? "all" : Number(e.target.value))}
                >
                  <option value="all">Všechny týmy</option>
                  {teams.map(([tid, name]) => (
                    <option key={tid} value={tid}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <MatchTable rows={tableMatches} />
          </section>
        </>
      )}
    </div>
  );
}

function discFor(
  discipline: { all?: Record<string, CatalogRefereeDiscStat>; seasons?: Record<string, Record<string, CatalogRefereeDiscStat>> } | undefined,
  season: SeasonKey,
): Record<string, CatalogRefereeDiscStat> {
  if (!discipline) return {};
  if (season === "all") return discipline.all || {};
  return discipline.seasons?.[String(season)] || {};
}

function smFor(
  seasons: CatalogRefereeSeason[] | undefined,
  season: SeasonKey,
): { yellowred?: number | null; var?: number | null } {
  const rows = seasons || [];
  if (season === "all") {
    const yellow = mean(rows.map((s) => s.sm?.yellowred));
    const varr = mean(rows.map((s) => s.sm?.var));
    return { yellowred: yellow, var: varr };
  }
  const hit = rows.find((s) => s.id === season)?.sm;
  return { yellowred: hit?.yellowred ?? null, var: hit?.var ?? null };
}

function seasonLabel(season: SeasonKey, seasons: { id: number; name?: string | null }[], current?: number | null) {
  if (season === "all") return "Všechny sezony";
  const name = seasons.find((s) => s.id === season)?.name;
  if (season === current) return "Tato sezona";
  return name || `Sezona ${season}`;
}

function resultSplit(rows: CatalogRefereeMatch[]) {
  const n = rows.length || 1;
  const home = rows.filter((m) => m.hs > m.as).length;
  const draw = rows.filter((m) => m.hs === m.as).length;
  const away = rows.filter((m) => m.hs < m.as).length;
  return {
    home: round1((100 * home) / n),
    draw: round1((100 * draw) / n),
    away: round1((100 * away) / n),
  };
}

function pairSum(pair?: Array<number | null> | null): number | null {
  if (!pair) return null;
  const vals = pair.filter((v): v is number => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0);
}

function avgSum(rows: CatalogRefereeMatch[], key: string): number | null {
  const zeroIfAbsent = key === "red" || key === "penalties";
  const vals = rows
    .map((m) => {
      const sum = pairSum(m.st?.[key]);
      if (sum != null) return sum;
      if (zeroIfAbsent && (m.st?.fouls || m.st?.yellow || m.st?.red || m.st?.penalties)) return 0;
      return null;
    })
    .filter((v): v is number => v != null);
  return mean(vals);
}

function mean(values: Array<number | null | undefined>): number | null {
  const clean = values.filter((v): v is number => v != null);
  if (!clean.length) return null;
  return Math.round((clean.reduce((a, b) => a + b, 0) / clean.length) * 100) / 100;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
}

function csMatches(n: number) {
  if (n === 1) return "zápas";
  if (n >= 2 && n <= 4) return "zápasy";
  return "zápasů";
}

function rankTone(rank: number, size: number): string {
  const edge = Math.max(1, Math.round(size * 0.2));
  if (rank <= edge) return "text-rose-400";
  if (rank > size - edge) return "text-emerald-400";
  return "text-slate-400";
}

function DiscCard({
  swatch,
  ring,
  label,
  value,
  ctx,
}: {
  swatch?: string;
  ring?: boolean;
  label: string;
  value: number | null;
  ctx?: CatalogRefereeDiscStat;
}) {
  const rank = ctx?.rank ?? null;
  const size = ctx?.size ?? 0;
  const tone = rank != null && size >= 2 ? rankTone(rank, size) : "text-slate-400";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-800 light:border-slate-200 bg-slate-900/30 light:bg-white px-4 py-3">
      <span
        className={`h-4 w-4 shrink-0 rounded-sm ${swatch || ""} ${ring ? "border-2 border-slate-400 bg-transparent" : ""}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-lg font-semibold tabular-nums text-white light:text-slate-900">{fmt(value)}</p>
          {rank != null && size >= 2 && (
            <p className={`text-[11px] font-semibold tabular-nums ${tone}`}>
              {rank}. z {size}
            </p>
          )}
        </div>
        <p className="text-[11px] text-slate-500">{label}</p>
        <p className="text-[11px] text-slate-500">liga {fmt(ctx?.league_avg)}</p>
      </div>
    </div>
  );
}

function ResultSplitBar({ homePct, drawPct, awayPct }: { homePct: number; drawPct: number; awayPct: number }) {
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-800 light:bg-slate-200">
        <div className="h-full bg-emerald-500" style={{ width: `${homePct}%` }} />
        <div className="h-full bg-zinc-500" style={{ width: `${drawPct}%` }} />
        <div className="h-full bg-sky-500" style={{ width: `${awayPct}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Domácí {fmt(homePct)} %
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-zinc-500" /> Remíza {fmt(drawPct)} %
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-sky-500" /> Hosté {fmt(awayPct)} %
        </span>
      </div>
    </div>
  );
}

function MatchTable({ rows }: { rows: CatalogRefereeMatch[] }) {
  if (!rows.length) {
    return <EmptyNote>Pro vybraný tým v této sezoně nic není.</EmptyNote>;
  }
  return (
    <div className="overflow-x-auto card">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-semibold">Datum</th>
            <th className="px-3 py-2 font-semibold">Domácí</th>
            <th className="px-3 py-2 font-semibold text-center">Výsledek</th>
            <th className="px-3 py-2 font-semibold">Hosté</th>
            <th className="px-3 py-2 font-semibold text-right">Fauly</th>
            <th className="px-3 py-2 font-semibold text-right">D</th>
            <th className="px-3 py-2 font-semibold text-right">H</th>
            <th className="px-3 py-2 font-semibold text-right">Žluté</th>
            <th className="px-3 py-2 font-semibold text-right">Červené</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const fouls = m.st?.fouls;
            const score = `${m.hs}:${m.as}`;
            return (
              <tr key={m.fid} className="border-t border-slate-800/80 light:border-slate-200">
                <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{m.d ? formatDate(m.d) : "—"}</td>
                <td className="px-3 py-2 text-white light:text-slate-900">{m.hn}</td>
                <td className="px-3 py-2 text-center tabular-nums font-semibold">
                  {m.mp ? (
                    <Link to={`/match/${m.fid}`} className="text-emerald-400 hover:underline">
                      {score}
                    </Link>
                  ) : (
                    <span className="text-white light:text-slate-900">{score}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-white light:text-slate-900">{m.an}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(pairSum(fouls))}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-400">{fmt(fouls?.[0] ?? null)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-400">{fmt(fouls?.[1] ?? null)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(pairSum(m.st?.yellow))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(pairSum(m.st?.red))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
