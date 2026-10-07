import { useMemo, useState } from "react";
import type { H2HMatch, MatchData, MatchFacts, TeamBrief, TeamMatchStats } from "../types";
import { formatDate } from "../lib/format";
import { formRows, formSummary, h2hRecord, resOf } from "./derive";
import { Card, Chip, Empty, MirrorRow, ResBadge, Seg, SideHeads, TeamTitle, VenueTag, n1, pct, resLetter, type Res } from "./kit";
import { intlTag, t, type Key } from "../i18n/locale";

const short = (iso: string) => new Date(iso).toLocaleDateString(intlTag(), { day: "numeric", month: "numeric" });

/* ---------- Forma ---------- */

function FormColumn({ team, side, rows }: { team: TeamBrief; side: "home" | "away"; rows: MatchFacts[] }) {
  const s = formSummary(rows);
  return (
    <div className="min-w-0">
      <div className="mb-1">
        <TeamTitle team={team} side={side} />
      </div>
      <p className="mb-2 text-xs text-(--c-muted)">
        {s.n ? (
          <>
            <b className="text-(--c-text)">{t("mc.fh.pts", { n: s.pts })}</b> · {s.w}{resLetter("V")} {s.d}{resLetter("R")} {s.l}{resLetter("P")} · {t("mc.fh.score", { gf: s.gf, ga: s.ga })}
          </>
        ) : (
          t("mc.fh.noMatches")
        )}
      </p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.fixture_id} className="grid grid-cols-[2.75rem_1.5rem_2.25rem_1fr_auto] items-center gap-2 rounded-lg px-1 py-1 text-[13px] hover:bg-(--c-raised)">
            <span className="text-xs text-(--c-faint)">{short(r.date)}</span>
            <ResBadge r={resOf(r)} title={`${resLetter(resOf(r))} ${r.gf}:${r.ga} vs ${r.opponent}`} />
            <span className="font-semibold tabular-nums">
              {r.gf}:{r.ga}
            </span>
            <span className="min-w-0 truncate text-(--c-muted)">
              {r.opponent}
              {!r.is_league_match && (
                <span className="ml-1.5 rounded bg-(--c-raised) px-1 py-0.5 text-[10px] text-(--c-faint)">{r.league_name ?? t("mc.fh.cup")}</span>
              )}
            </span>
            <VenueTag home={r.is_home} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FormCard({ m }: { m: MatchData }) {
  const [venueOnly, setVenueOnly] = useState(false);
  return (
    <Card
      title={t("mc.fh.title")}
      lead={t("mc.fh.lead")}
      aside={
        <Seg
          label={t("mc.fh.which")}
          value={venueOnly ? "venue" : "all"}
          onChange={(v) => setVenueOnly(v === "venue")}
          options={[
            { id: "all", label: t("mc.fh.all") },
            { id: "venue", label: t("mc.fh.homeAway") },
          ]}
        />
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <FormColumn team={m.home} side="home" rows={formRows(m.form.home, venueOnly, true)} />
        <FormColumn team={m.away} side="away" rows={formRows(m.form.away, venueOnly, false)} />
      </div>
      {venueOnly && <p className="mt-3 text-[11px] text-(--c-faint)">{t("mc.fh.venueNote")}</p>}
    </Card>
  );
}

/* ---------- Vzájemné zápasy ---------- */

export function H2HRecordBar({ m }: { m: MatchData }) {
  const r = h2hRecord(m);
  if (!r.n) return null;
  const w = (v: number) => `${(v / r.n) * 100}%`;
  return (
    <div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={t("mc.fh.recAria", { w: r.w, d: r.d, l: r.l })}>
        <div style={{ width: w(r.w), background: "var(--c-home)" }} />
        <div style={{ width: w(r.d), background: "var(--c-draw)", opacity: 0.55 }} />
        <div style={{ width: w(r.l), background: "var(--c-away)" }} />
      </div>
      <div className="mt-2 grid grid-cols-3 text-xs">
        <span style={{ color: "var(--c-home)" }} className="truncate font-semibold">
          {m.home.name} {r.w}×
        </span>
        <span className="text-center text-(--c-muted)">{t("mc.fh.drawN", { n: r.d })}</span>
        <span style={{ color: "var(--c-away)" }} className="truncate text-right font-semibold">
          {m.away.name} {r.l}×
        </span>
      </div>
    </div>
  );
}

export function H2HCard({ m }: { m: MatchData }) {
  const [filter, setFilter] = useState<"all" | "home">("all");
  const [all, setAll] = useState(false);
  const list = m.h2h.filter((x) => (filter === "all" ? true : x.is_home_team_at_home));
  const shown = all ? list : list.slice(0, 5);
  const r = h2hRecord(m);

  return (
    <Card
      title={t("mc.ov.h2h.title")}
      lead={
        <>
          {m.h2h.length > 0 && t("mc.fh.h2hLead", { n: m.h2h.length, total: m.h2h_total_available })}
          {!!m.h2h_excluded_older && <> {t("mc.fh.h2hWindow", { years: m.h2h_window_years ?? 5, n: m.h2h_excluded_older })}</>}
        </>
      }
      aside={
        <Seg
          label={t("mc.fh.filter")}
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setAll(false);
          }}
          options={[
            { id: "all", label: t("mc.fh.all") },
            { id: "home", label: t("mc.fh.teamHome", { team: m.home.name }) },
          ]}
        />
      }
    >
      {m.h2h.length === 0 ? (
        <Empty>{t("mc.ov.h2h.none", { years: m.h2h_window_years ?? 5 })}</Empty>
      ) : (
        <>
          <H2HRecordBar m={m} />
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-(--c-muted)">
            <div>
              <b className="block text-base text-(--c-text)">{n1(r.avgGoals)}</b>{t("mc.fh.goalsPer")}
            </div>
            <div>
              <b className="block text-base text-(--c-text)">{pct(r.over25Pct)}</b>{t("mc.ins.item.over25")}
            </div>
            <div>
              <b className="block text-base text-(--c-text)">{pct(r.bttsPct)}</b>{t("mc.fh.bothScored")}
            </div>
          </div>
          <ul className="mt-4 space-y-1">
            {shown.map((x) => (
              <H2HRow key={x.fixture_id} x={x} />
            ))}
          </ul>
          {list.length > 5 && (
            <button type="button" onClick={() => setAll((a) => !a)} className="mt-2 min-h-9 text-[13px] font-medium text-(--c-accent) hover:underline">
              {all ? t("home.news.less") : t("mc.fh.showMore", { n: list.length - 5 })}
            </button>
          )}
          <p className="mt-2 text-[11px] text-(--c-faint)">{t("mc.fh.letterNote", { team: m.home.name })}</p>
        </>
      )}
    </Card>
  );
}

function H2HRow({ x }: { x: H2HMatch }) {
  const hw = (x.home_score ?? 0) > (x.away_score ?? 0);
  const aw = (x.home_score ?? 0) < (x.away_score ?? 0);
  return (
    <li className="grid grid-cols-[1.5rem_1fr_auto_1fr] items-center gap-x-2 gap-y-0.5 rounded-lg px-1 py-1.5 text-[13px] hover:bg-(--c-raised) sm:grid-cols-[4.75rem_1.5rem_1fr_auto_1fr]">
      <span className="col-span-4 whitespace-nowrap text-[11px] text-(--c-faint) sm:col-span-1 sm:text-xs">{formatDate(x.date).replace(/\s/g, "")}</span>
      <ResBadge r={x.result_for_home_team as Res} />
      <span className={`truncate text-right ${hw ? "font-semibold" : "text-(--c-muted)"}`}>{x.home.name}</span>
      <span className="min-w-[3.25rem] rounded-md bg-(--c-raised) px-2 py-0.5 text-center font-bold tabular-nums">
        {x.home_score}:{x.away_score}
      </span>
      <span className={`truncate ${aw ? "font-semibold" : "text-(--c-muted)"}`}>{x.away.name}</span>
    </li>
  );
}

/* ---------- Statistiky ze vzájemných zápasů ---------- */

const ROWS: { key: keyof TeamMatchStats; label: Key; digits?: number; hint?: Key }[] = [
  { key: "shots", label: "mc.pr.shots" },
  { key: "sot", label: "mc.pr.sot" },
  { key: "xgot", label: "mc.fh.xgot", digits: 2, hint: "mc.fh.xgotHint" },
  { key: "corners", label: "mc.pr.corners" },
  { key: "fouls", label: "mc.pe.col.fT" },
  { key: "yellow", label: "mc.fh.yellowCards" },
  { key: "red", label: "mc.fh.redCards", digits: 2 },
  { key: "possession", label: "mc.fh.possession", digits: 0 },
];

function avg(nums: (number | null | undefined)[], digits: number): number | null {
  const v = nums.filter((n): n is number => n != null);
  if (!v.length) return null;
  const f = 10 ** digits;
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * f) / f;
}

const coachOf = (x: H2HMatch, forHome: boolean) =>
  x.is_home_team_at_home ? (forHome ? x.coach_home : x.coach_away) : forHome ? x.coach_away : x.coach_home;

export function H2HStatsCard({ m, h2h, withXgot }: { m: MatchData; h2h: H2HMatch[]; withXgot: boolean }) {
  const years = useMemo(() => Array.from(new Set(h2h.map((x) => new Date(x.date).getFullYear()))).sort((a, b) => b - a), [h2h]);
  const homeCoaches = useMemo(() => Array.from(new Set(h2h.map((x) => coachOf(x, true)).filter((c): c is string => !!c))), [h2h]);
  const awayCoaches = useMemo(() => Array.from(new Set(h2h.map((x) => coachOf(x, false)).filter((c): c is string => !!c))), [h2h]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [venue, setVenue] = useState<"all" | "home">("all");
  const [hc, setHc] = useState("all");
  const [ac, setAc] = useState("all");

  const rows = ROWS.filter((r) => r.key !== "xgot" || withXgot);
  const f = h2h.filter(
    (x) =>
      (!sel.size || sel.has(new Date(x.date).getFullYear())) &&
      (venue === "all" || x.is_home_team_at_home) &&
      (hc === "all" || coachOf(x, true) === hc) &&
      (ac === "all" || coachOf(x, false) === ac),
  );
  const toggleYear = (y: number) =>
    setSel((p) => {
      const n = new Set(p);
      n.has(y) ? n.delete(y) : n.add(y);
      return n;
    });
  const xgotN = f.filter((x) => x.team_home_stats.xgot != null).length;
  const selectCls = "min-h-9 rounded-lg border border-(--c-line) bg-(--c-raised) px-2 text-xs text-(--c-text)";

  if (!h2h.length) return null;

  return (
    <Card
      title={t("mc.fh.stats.title")}
      lead={venue === "home" ? t("mc.fh.stats.leadHome", { team: m.home.name }) : t("mc.fh.stats.leadAll")}
      aside={
        <Seg
          label={t("mc.fh.venue")}
          value={venue}
          onChange={setVenue}
          options={[
            { id: "all", label: t("mc.fh.all") },
            { id: "home", label: t("mc.fh.teamHome", { team: m.home.name }) },
          ]}
        />
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-(--c-muted)">{t("mc.fh.years")}</span>
        {years.map((y) => (
          <Chip key={y} active={sel.has(y)} onClick={() => toggleYear(y)}>
            {y}
          </Chip>
        ))}
        {sel.size > 0 && (
          <button type="button" onClick={() => setSel(new Set())} className="min-h-8 px-2 text-xs text-(--c-muted) underline">
            {t("mc.fh.clear")}
          </button>
        )}
      </div>
      {(homeCoaches.length > 1 || awayCoaches.length > 1) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs text-(--c-muted)">{t("mc.fh.coach")}</span>
          {homeCoaches.length > 1 && (
            <select aria-label={t("mc.fh.coachOf", { team: m.home.name })} value={hc} onChange={(e) => setHc(e.target.value)} className={selectCls}>
              <option value="all">{t("mc.fh.allCoaches", { team: m.home.name })}</option>
              {homeCoaches.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          )}
          {awayCoaches.length > 1 && (
            <select aria-label={t("mc.fh.coachOf", { team: m.away.name })} value={ac} onChange={(e) => setAc(e.target.value)} className={selectCls}>
              <option value="all">{t("mc.fh.allCoaches", { team: m.away.name })}</option>
              {awayCoaches.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {f.length === 0 ? (
        <Empty>{t("mc.fh.noSelection")}</Empty>
      ) : (
        <>
          <div className="mb-1 flex items-center justify-between text-[11px] text-(--c-faint)">
            <span>
              {t("mc.fh.inSelection", { n: f.length })}
            </span>
          </div>
          <SideHeads home={m.home} away={m.away} />
          {rows.map((r) => {
            const d = r.digits ?? 1;
            return (
              <MirrorRow
                key={r.key}
                label={t(r.label)}
                hint={r.hint ? t(r.hint) : undefined}
                digits={d}
                suffix={r.key === "possession" ? t("mc.fh.pctSuffix") : ""}
                home={avg(f.map((x) => x.team_home_stats[r.key] as number | null), d)}
                away={avg(f.map((x) => x.team_away_stats[r.key] as number | null), d)}
              />
            );
          })}
          {withXgot && <p className="mt-1 text-[11px] text-(--c-faint)">{t("mc.fh.xgotNote", { n: xgotN, total: f.length })}</p>}
        </>
      )}
    </Card>
  );
}
