import { useEffect, useMemo, type ReactNode } from "react";
import { Link, useSearchParams } from "../i18n/router";
import { Crest } from "../cat/kit";
import { Card, Empty, Seg, n1 } from "../mc2/kit";
import { Flag } from "../components/Flag";
import { useCatalogDirectory, useCatalogExplorers, usePitchLeague, useUpcoming } from "../lib/useData";
import { LEAGUE_SHORT, orderedLeagues } from "../lib/leagues";
import {
  buildTrendRows,
  nextHomeByTeam,
  parseTdDir,
  parseTdPage,
  parseTdPreset,
  parseTdSort,
  parseTdVenue,
  parseTdWindow,
  presetQuery,
  sortTdRows,
  type TdPreset,
  type TdRow,
  type TdSort,
  type TdTrend,
} from "../lib/trendDetector";
import { t, type Key } from "../i18n/locale";
import { Gate } from "../access/Gate";
import { LOCK } from "../access/locks";

const PAGE = 20;
const RULE = "border-l border-(--c-line)";
const STICK = "sticky left-0 z-20 bg-(--c-surface) shadow-[8px_0_10px_-8px_rgba(0,0,0,0.45)] group-hover:bg-(--c-raised)";

const PRESETS: { id: TdPreset; icon: string; label: Key; tip: Key }[] = [
  { id: "hot", icon: "🔥", label: "td.preset.hot", tip: "td.preset.hotTip" },
  { id: "unlucky", icon: "🎯", label: "td.preset.unlucky", tip: "td.preset.unluckyTip" },
  { id: "lucky", icon: "🍀", label: "td.preset.lucky", tip: "td.preset.luckyTip" },
  { id: "corners", icon: "🚩", label: "td.preset.corners", tip: "td.preset.cornersTip" },
  { id: "away_fouls", icon: "⚔️", label: "td.preset.away_fouls", tip: "td.preset.away_foulsTip" },
];

const GROUPS: { label: Key; cols: { id: TdSort; label: Key; tip: Key }[] }[] = [
  {
    label: "td.g.shots",
    cols: [
      { id: "shots", label: "td.col.shots", tip: "td.tip.shots" },
      { id: "sot", label: "td.col.sot", tip: "td.tip.sot" },
    ],
  },
  {
    label: "td.g.corners",
    cols: [
      { id: "corners", label: "td.col.corners", tip: "td.tip.corners" },
      { id: "cornersAg", label: "td.col.cornersAg", tip: "td.tip.cornersAg" },
    ],
  },
  {
    label: "td.g.fouls",
    cols: [
      { id: "fouls", label: "td.col.fouls", tip: "td.tip.fouls" },
      { id: "foulsWon", label: "td.col.foulsWon", tip: "td.tip.foulsWon" },
    ],
  },
];

function signedPct(n: number): string {
  const body = t("fmt.pct", { n: Math.round(Math.abs(n)) });
  return n > 0 ? `+${body}` : `−${body}`;
}

function metricOf(row: TdRow, col: TdSort): ReactNode {
  const v =
    col === "shots" ? row.shots : col === "sot" ? row.sot : col === "corners" ? row.corners : col === "cornersAg" ? row.cornersAg : col === "fouls" ? row.fouls : col === "foulsWon" ? row.foulsWon : null;
  return v == null ? "—" : n1(v);
}

export function TrendDetectorPage() {
  const dir = useCatalogDirectory();
  const leagues = useMemo(() => orderedLeagues(dir?.leagues ?? []), [dir]);
  const explorers = useCatalogExplorers(
    leagues.map((l) => l.id),
    dir != null,
  );
  const pitch = usePitchLeague(leagues.length ? "all" : null);
  const upcoming = useUpcoming();
  const [params, setParams] = useSearchParams();

  const window = parseTdWindow(params.get("w"));
  const venue = parseTdVenue(params.get("v"));
  const preset = parseTdPreset(params.get("preset"));
  const sort = parseTdSort(params.get("sort"));
  const dirSort = parseTdDir(params.get("dir"));
  const page = parseTdPage(params.get("p"));

  useEffect(() => {
    document.title = t("td.docTitle");
  }, []);

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  const pickPreset = (id: TdPreset) => {
    if (preset === id) {
      set({ preset: null });
      return;
    }
    const p = presetQuery(id);
    set({
      preset: id,
      w: p.window === "season" ? null : p.window,
      v: p.venue === "all" ? null : p.venue,
      sort: p.sort,
      dir: p.dir,
      p: null,
    });
  };

  const toggleSort = (col: TdSort) => {
    if (sort === col) set({ sort: col, dir: dirSort === "desc" ? "asc" : "desc", p: null });
    else set({ sort: col, dir: col === "team" ? "asc" : "desc", p: null });
  };

  const meta = leagues.map((l) => ({
    id: l.id,
    name: l.name,
    short: LEAGUE_SHORT[l.id] ?? l.name.slice(0, 3).toUpperCase(),
    country: l.country ?? null,
    logo: l.logo,
  }));

  const nextHome = useMemo(() => nextHomeByTeam(upcoming.data?.fixtures), [upcoming.data]);

  const rows = useMemo(() => {
    if (!explorers) return null;
    return buildTrendRows(explorers, meta, pitch, window, venue, nextHome);
  }, [explorers, meta, pitch, window, venue, nextHome]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const byPreset = preset ? rows.filter((r) => r.pass[preset]) : rows;
    return sortTdRows(byPreset, sort, dirSort);
  }, [rows, preset, sort, dirSort]);

  const loading = dir == null || (leagues.length > 0 && explorers == null);
  const pageCount = Math.max(1, Math.ceil((filtered?.length ?? 0) / PAGE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const from = (safePage - 1) * PAGE;
  const slice = filtered?.slice(from, from + PAGE) ?? [];

  return (
    <div className="mc2 mx-auto max-w-7xl px-4 pb-16 pt-20">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-(--c-accent)">{t("td.eyebrow")}</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{t("td.title")}</h1>
        <p className="mt-1.5 max-w-2xl text-[14px] leading-snug text-(--c-muted) sm:text-[15px] sm:leading-relaxed">{t("td.lead")}</p>
      </header>

      <Card
        title={t("td.filters")}
        aside={filtered ? <span className="text-[13px] text-(--c-muted)">{t("td.count", { n: filtered.length })}</span> : null}
        className="mt-5"
      >
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("td.preset.aria")}>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              title={t(p.tip)}
              aria-pressed={preset === p.id}
              onClick={() => pickPreset(p.id)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium ${
                preset === p.id ? "border-(--c-accent) bg-(--c-accent)/15 text-(--c-text)" : "border-(--c-line) text-(--c-muted) hover:text-(--c-text)"
              }`}
            >
              <span aria-hidden>{p.icon}</span>
              {t(p.label)}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Seg
            wrap
            label={t("td.window.aria")}
            value={window}
            onChange={(v) => set({ w: v === "season" ? null : v, p: null })}
            options={[
              { id: "season", label: t("td.window.season") },
              { id: "3", label: t("td.window.3") },
              { id: "5", label: t("td.window.5") },
            ]}
          />
          <Seg
            wrap
            label={t("td.venue.aria")}
            value={venue}
            onChange={(v) => set({ v: v === "all" ? null : v, p: null })}
            options={[
              { id: "all", label: t("td.venue.all") },
              { id: "home", label: t("td.venue.home") },
              { id: "away", label: t("td.venue.away") },
            ]}
          />
        </div>
      </Card>

      {loading ? (
        <div className="mt-5">
          <Empty>{t("td.loading")}</Empty>
        </div>
      ) : !filtered?.length ? (
        <div className="mt-5">
          <Empty>{explorers && explorers.length ? t("td.empty") : t("td.missing")}</Empty>
        </div>
      ) : (
        <div className="mt-5">
          <Gate need={LOCK.tdTable} title={t("td.gateTitle")} text={t("td.gateText")}>
          <div className="overflow-auto rounded-xl border border-(--c-line) bg-(--c-surface)">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-(--c-raised) text-[11px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">
                  <SortTh col="team" sort={sort} dir={dirSort} onClick={toggleSort} sticky rowSpan={2}>
                    {t("td.col.team")}
                  </SortTh>
                  <SortTh col="played" sort={sort} dir={dirSort} onClick={toggleSort} title={t("td.col.playedFull")} align="right" rowSpan={2}>
                    {t("td.col.played")}
                  </SortTh>
                  {GROUPS.map((g) => (
                    <th key={g.label} colSpan={g.cols.length} scope="colgroup" className={`px-1.5 pb-0 pt-2 text-center ${RULE}`}>
                      {t(g.label)}
                    </th>
                  ))}
                  <SortTh col="xgot" sort={sort} dir={dirSort} onClick={toggleSort} title={t("td.tip.xgot")} align="right" rule rowSpan={2}>
                    {t("td.col.xgot")}
                  </SortTh>
                  <SortTh col="trend" sort={sort} dir={dirSort} onClick={toggleSort} title={t("td.tip.trend")} align="right" rule rowSpan={2}>
                    {t("td.col.trend")}
                  </SortTh>
                </tr>
                <tr className="border-b border-(--c-line) bg-(--c-raised)">
                  {GROUPS.flatMap((g) =>
                    g.cols.map((c, i) => (
                      <SortTh
                        key={c.id}
                        col={c.id}
                        sort={sort}
                        dir={dirSort}
                        onClick={toggleSort}
                        title={t(c.tip)}
                        align="right"
                        rule={i === 0}
                      >
                        {t(c.label)}
                      </SortTh>
                    )),
                  )}
                </tr>
              </thead>
              <tbody>
                {slice.map((r) => (
                  <tr key={`${r.leagueId}-${r.teamId}`} className="group border-b border-(--c-line)/60 last:border-0 hover:bg-(--c-raised)/70">
                    <td className={`${STICK} px-2 py-2`}>
                      <TeamCell row={r} />
                    </td>
                    <td className={`px-1.5 py-2 text-right text-[13px] tabular-nums ${sort === "played" ? "font-semibold" : "text-(--c-muted)"}`}>{r.played}</td>
                    {GROUPS.flatMap((g) =>
                      g.cols.map((c, i) => (
                        <td
                          key={c.id}
                          className={`px-1.5 py-2 text-right text-[13px] tabular-nums whitespace-nowrap ${i === 0 ? RULE : ""} ${
                            sort === c.id ? "font-semibold text-(--c-text)" : "text-(--c-muted)"
                          }`}
                        >
                          {metricOf(r, c.id)}
                        </td>
                      )),
                    )}
                    <td className={`px-2 py-2 ${RULE} ${sort === "xgot" ? "font-semibold" : ""}`}>
                      <XgotCell row={r} />
                    </td>
                    <td className={`px-2 py-2 ${RULE} ${sort === "trend" ? "font-semibold" : ""}`}>
                      <TrendCell row={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </Gate>
          <p className="mt-2 text-xs text-(--c-faint) xl:hidden">{t("td.scroll")}</p>
          {pageCount > 1 && (
            <nav className="mt-3 flex flex-wrap justify-center gap-1.5 sm:justify-start" aria-label={t("td.pages")}>
              {Array.from({ length: pageCount }, (_, i) => {
                const n = i + 1;
                const lo = i * PAGE + 1;
                const hi = Math.min((i + 1) * PAGE, filtered.length);
                const label = t("td.page", { from: lo, to: hi });
                return (
                  <button
                    key={n}
                    type="button"
                    aria-current={n === safePage ? "page" : undefined}
                    aria-label={t("td.pageAria", { from: lo, to: hi })}
                    onClick={() => set({ p: n === 1 ? null : String(n) })}
                    className={`inline-flex min-h-9 min-w-9 items-center justify-center rounded-full border px-3 text-[13px] font-medium ${
                      n === safePage ? "border-(--c-accent) bg-(--c-accent)/15 text-(--c-text)" : "border-(--c-line) text-(--c-muted) hover:text-(--c-text)"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      )}
    </div>
  );
}

function SortTh({
  col,
  sort,
  dir,
  onClick,
  children,
  title,
  sticky,
  align = "left",
  rule,
  rowSpan,
}: {
  col: TdSort;
  sort: TdSort;
  dir: "asc" | "desc";
  onClick: (c: TdSort) => void;
  children: ReactNode;
  title?: string;
  sticky?: boolean;
  align?: "left" | "right";
  rule?: boolean;
  rowSpan?: number;
}) {
  const active = sort === col;
  return (
    <th
      scope="col"
      rowSpan={rowSpan}
      className={`px-1.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap ${
        active ? "text-(--c-text)" : "text-(--c-faint)"
      } ${align === "right" ? "text-right" : "text-left"} ${rule ? RULE : ""} ${
        sticky ? "sticky left-0 z-30 bg-(--c-raised) shadow-[8px_0_10px_-8px_rgba(0,0,0,0.45)]" : "bg-(--c-raised)"
      } ${rowSpan ? "align-bottom" : ""}`}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        title={title}
        aria-label={t("td.sort", { col: title ?? String(children) })}
        onClick={() => onClick(col)}
        className={`inline-flex min-h-9 items-center gap-0.5 ${active ? "text-(--c-accent)" : ""}`}
      >
        {children}
        <span aria-hidden className="text-[10px] text-(--c-faint)">
          {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

function NextVenue({ home }: { home: boolean }) {
  const label = t("td.next", { side: home ? t("td.next.home") : t("td.next.away") });
  const c = home ? "var(--c-home)" : "var(--c-away)";
  return (
    <span
      title={label}
      aria-label={label}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md sm:h-7 sm:w-7"
      style={{ background: `color-mix(in oklab, ${c} 16%, transparent)`, color: c }}
    >
      {home ? <HomeIcon /> : <AwayIcon />}
    </span>
  );
}

function HomeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 1.6 1.8 6.7c-.3.24-.3.7.04.9l.66.48c.22.16.52.11.7-.1L8 3.7l4.8 4.28c.18.21.48.26.7.1l.66-.48c.34-.2.34-.66.04-.9L8 1.6Z" />
      <path d="M4.2 8.4V13.2c0 .44.36.8.8.8h2.1V11c0-.33.27-.6.6-.6h.6c.33 0 .6.27.6.6v3h2.1c.44 0 .8-.36.8-.8V8.4L8 5.05 4.2 8.4Z" />
    </svg>
  );
}

function AwayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M3.2 8c0-.33.27-.6.6-.6h6.05L8.2 5.75a.6.6 0 0 1 .85-.85l3.4 3.4c.23.23.23.62 0 .85l-3.4 3.4a.6.6 0 1 1-.85-.85L9.85 8.6H3.8A.6.6 0 0 1 3.2 8Z" />
    </svg>
  );
}

function TeamCell({ row }: { row: TdRow }) {
  return (
    <div className="flex min-w-[8.5rem] items-center gap-1.5 sm:min-w-[11.5rem] sm:gap-2">
      {row.nextHome != null && <NextVenue home={row.nextHome} />}
      <Link to={`/catalog/teams/${row.teamId}`} className="flex min-w-0 items-center gap-2 text-(--c-text) hover:underline">
        <Crest src={row.image} name={row.name} size={24} />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold">{row.name}</span>
          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-(--c-faint)">
            <Flag country={row.country} width={12} />
            {row.leagueShort}
          </span>
        </span>
      </Link>
    </div>
  );
}

const TREND_LABEL: Record<TdTrend["metric"], Key> = {
  shots: "td.trend.shots",
  sot: "td.trend.sot",
  corners: "td.trend.corners",
  fouls: "td.trend.fouls",
};

function XgotCell({ row }: { row: TdRow }) {
  if (row.xgot == null || row.goals == null || row.delta == null) {
    return <span className="block text-right text-[13px] text-(--c-faint)">—</span>;
  }
  const lucky = row.delta <= -0.15;
  const unlucky = row.delta >= 0.15;
  const tone = lucky ? "var(--c-win)" : unlucky ? "var(--c-loss)" : "var(--c-muted)";
  const mark = lucky ? t("td.badge.lucky") : unlucky ? t("td.badge.unlucky") : null;
  return (
    <span className="whitespace-nowrap text-[13px] tabular-nums">
      {n1(row.xgot)} / {n1(row.goals)}{" "}
      <span style={{ color: tone }}>
        {row.delta > 0 ? "+" : ""}
        {n1(row.delta)}
      </span>
      {mark && (
        <span title={mark} aria-label={mark} className="ml-1">
          {lucky ? "🍀" : "🌧️"}
        </span>
      )}
    </span>
  );
}

function TrendCell({ row }: { row: TdRow }) {
  const tr = row.trend;
  if (!tr) return <span className="block text-right text-[13px] text-(--c-faint)">—</span>;
  const more = tr.pct > 0;
  const good = tr.metric === "fouls" ? !more : more;
  const tone = good ? "var(--c-win)" : tr.metric === "fouls" ? "var(--c-loss)" : "var(--c-warn)";
  return (
    <span
      className="ml-auto flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{
        color: tone,
        background: `color-mix(in oklab, ${tone} 14%, transparent)`,
      }}
    >
      {good && tr.metric !== "fouls" && <span aria-hidden>🔥</span>}
      {t(TREND_LABEL[tr.metric], { p: signedPct(tr.pct), n: tr.n })}
    </span>
  );
}
