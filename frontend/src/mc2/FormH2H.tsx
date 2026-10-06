import { useMemo, useState } from "react";
import type { H2HMatch, MatchData, MatchFacts, TeamBrief, TeamMatchStats } from "../types";
import { formatDate } from "../lib/format";
import { formRows, formSummary, h2hRecord, resOf } from "./derive";
import { Card, Chip, Empty, MirrorRow, ResBadge, Seg, SideHeads, TeamTitle, VenueTag, n1, pct, type Res } from "./kit";

const short = (iso: string) => new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });

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
            <b className="text-(--c-text)">{s.pts} b.</b> · {s.w}V {s.d}R {s.l}P · skóre {s.gf}:{s.ga}
          </>
        ) : (
          "Zatím žádný zápas v téhle sezóně"
        )}
      </p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.fixture_id} className="grid grid-cols-[2.75rem_1.5rem_2.25rem_1fr_auto] items-center gap-2 rounded-lg px-1 py-1 text-[13px] hover:bg-(--c-raised)">
            <span className="text-xs text-(--c-faint)">{short(r.date)}</span>
            <ResBadge r={resOf(r)} title={`${resOf(r)} ${r.gf}:${r.ga} vs ${r.opponent}`} />
            <span className="font-semibold tabular-nums">
              {r.gf}:{r.ga}
            </span>
            <span className="min-w-0 truncate text-(--c-muted)">
              {r.opponent}
              {!r.is_league_match && (
                <span className="ml-1.5 rounded bg-(--c-raised) px-1 py-0.5 text-[10px] text-(--c-faint)">{r.league_name ?? "pohár"}</span>
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
      title="Forma týmů"
      lead="Posledních 6 zápasů letošní sezóny. Nejnovější nahoře."
      aside={
        <Seg
          label="Které zápasy"
          value={venueOnly ? "venue" : "all"}
          onChange={(v) => setVenueOnly(v === "venue")}
          options={[
            { id: "all", label: "Všechny" },
            { id: "venue", label: "Doma / venku" },
          ]}
        />
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <FormColumn team={m.home} side="home" rows={formRows(m.form.home, venueOnly, true)} />
        <FormColumn team={m.away} side="away" rows={formRows(m.form.away, venueOnly, false)} />
      </div>
      {venueOnly && <p className="mt-3 text-[11px] text-(--c-faint)">Domácí tým jen z domácích zápasů, hosté jen z venkovních. Takhle se nejlíp vidí, jak tým hraje v roli, kterou čeká v tomhle zápase.</p>}
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
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${r.w} výher domácích, ${r.d} remíz, ${r.l} výher hostů`}>
        <div style={{ width: w(r.w), background: "var(--c-home)" }} />
        <div style={{ width: w(r.d), background: "var(--c-draw)", opacity: 0.55 }} />
        <div style={{ width: w(r.l), background: "var(--c-away)" }} />
      </div>
      <div className="mt-2 grid grid-cols-3 text-xs">
        <span style={{ color: "var(--c-home)" }} className="truncate font-semibold">
          {m.home.name} {r.w}×
        </span>
        <span className="text-center text-(--c-muted)">remíza {r.d}×</span>
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
      title="Vzájemné zápasy"
      lead={`Posledních ${m.h2h.length} z ${m.h2h_total_available} dostupných.`}
      aside={
        <Seg
          label="Filtr zápasů"
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setAll(false);
          }}
          options={[
            { id: "all", label: "Všechny" },
            { id: "home", label: `${m.home.name} doma` },
          ]}
        />
      }
    >
      {m.h2h.length === 0 ? (
        <Empty>Tyto týmy spolu v dostupných datech zatím nehrály.</Empty>
      ) : (
        <>
          <H2HRecordBar m={m} />
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-(--c-muted)">
            <div>
              <b className="block text-base text-(--c-text)">{n1(r.avgGoals)}</b>gólu na zápas
            </div>
            <div>
              <b className="block text-base text-(--c-text)">{pct(r.over25Pct)}</b>over 2,5
            </div>
            <div>
              <b className="block text-base text-(--c-text)">{pct(r.bttsPct)}</b>oba skórovali
            </div>
          </div>
          <ul className="mt-4 space-y-1">
            {shown.map((x) => (
              <H2HRow key={x.fixture_id} x={x} />
            ))}
          </ul>
          {list.length > 5 && (
            <button type="button" onClick={() => setAll((a) => !a)} className="mt-2 min-h-9 text-[13px] font-medium text-(--c-accent) hover:underline">
              {all ? "Zobrazit méně" : `Zobrazit dalších ${list.length - 5}`}
            </button>
          )}
          <p className="mt-2 text-[11px] text-(--c-faint)">Písmeno a barva = výsledek z pohledu týmu {m.home.name}.</p>
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

const ROWS: { key: keyof TeamMatchStats; label: string; digits?: number; hint?: string }[] = [
  { key: "shots", label: "Střely" },
  { key: "sot", label: "Střely na branku" },
  { key: "xgot", label: "xGOT", digits: 2, hint: "Kvalita střel na branku: kolik gólů by z nich dal průměrný střelec. Máme ho jen u novějších zápasů." },
  { key: "corners", label: "Rohy" },
  { key: "fouls", label: "Fauly" },
  { key: "yellow", label: "Žluté karty" },
  { key: "red", label: "Červené karty", digits: 2 },
  { key: "possession", label: "Držení míče", digits: 0 },
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
      title="Statistiky ze vzájemných zápasů"
      lead={
        venue === "home"
          ? `Průměr na zápas za každý tým ze vzájemných zápasů, ve kterých ${m.home.name} hrála doma.`
          : "Průměr na zápas za každý tým ze všech vzájemných zápasů, ať hrál doma, nebo venku."
      }
      aside={
        <Seg
          label="Domácí prostředí"
          value={venue}
          onChange={setVenue}
          options={[
            { id: "all", label: "Všechny" },
            { id: "home", label: `${m.home.name} doma` },
          ]}
        />
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-(--c-muted)">Roky</span>
        {years.map((y) => (
          <Chip key={y} active={sel.has(y)} onClick={() => toggleYear(y)}>
            {y}
          </Chip>
        ))}
        {sel.size > 0 && (
          <button type="button" onClick={() => setSel(new Set())} className="min-h-8 px-2 text-xs text-(--c-muted) underline">
            zrušit
          </button>
        )}
      </div>
      {(homeCoaches.length > 1 || awayCoaches.length > 1) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs text-(--c-muted)">Trenér</span>
          {homeCoaches.length > 1 && (
            <select aria-label={`Trenér ${m.home.name}`} value={hc} onChange={(e) => setHc(e.target.value)} className={selectCls}>
              <option value="all">{m.home.name}: všichni</option>
              {homeCoaches.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          )}
          {awayCoaches.length > 1 && (
            <select aria-label={`Trenér ${m.away.name}`} value={ac} onChange={(e) => setAc(e.target.value)} className={selectCls}>
              <option value="all">{m.away.name}: všichni</option>
              {awayCoaches.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {f.length === 0 ? (
        <Empty>Pro tenhle výběr nemáme žádný zápas. Zkuste zrušit filtr.</Empty>
      ) : (
        <>
          <div className="mb-1 flex items-center justify-between text-[11px] text-(--c-faint)">
            <span>
              {f.length} {f.length === 1 ? "zápas" : f.length < 5 ? "zápasy" : "zápasů"} ve výběru
            </span>
          </div>
          <SideHeads home={m.home} away={m.away} />
          {rows.map((r) => {
            const d = r.digits ?? 1;
            return (
              <MirrorRow
                key={r.key}
                label={r.label}
                hint={r.hint}
                digits={d}
                suffix={r.key === "possession" ? " %" : ""}
                home={avg(f.map((x) => x.team_home_stats[r.key] as number | null), d)}
                away={avg(f.map((x) => x.team_away_stats[r.key] as number | null), d)}
              />
            );
          })}
          {withXgot && <p className="mt-1 text-[11px] text-(--c-faint)">xGOT máme u {xgotN} z {f.length} zápasů, starší sezóny a poháry ho nemají.</p>}
        </>
      )}
    </Card>
  );
}
