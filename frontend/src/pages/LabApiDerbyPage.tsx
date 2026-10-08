import { useEffect, useMemo, useState } from "react";
import { Link } from "../i18n/router";
import { Pill, Section } from "../components/ui";
import { intlTag } from "../i18n/locale";

type Verdict = "same" | "diff" | "sm_only" | "ts_only" | "empty";
type Side = "home" | "away";
type Filter = "all" | "diff" | "same" | "sm" | "ts";

type Ha = { home: number | null; away: number | null };

type CompareRow = {
  id: string;
  label: string;
  sm_home: number | null;
  sm_away: number | null;
  ts_home: number | null;
  ts_away: number | null;
  ts_home_1h: number | null;
  ts_away_1h: number | null;
  ts_home_2h: number | null;
  ts_away_2h: number | null;
  home_verdict: Verdict;
  away_verdict: Verdict;
};

type PlayerRow = {
  name: string;
  side: Side;
  jersey?: number | null;
  starter?: boolean;
  minutes?: number | null;
  goals?: number | null;
  shots?: number | null;
  sot?: number | null;
  rating?: number | null;
  xg?: number | null;
  xa?: number | null;
};

type Shot = {
  player: string;
  side: Side;
  x: number;
  y: number;
  xg: number | null;
  minute: number | null;
  result: string | null;
  goal: boolean;
  on_target: boolean;
  penalty: boolean;
};

type OddsMarket = Record<string, { opening?: string; last_seen?: string } | Record<string, unknown>>;

type Derby = {
  generated_at: string;
  note: string;
  match: {
    date: string;
    kickoff_sm: string | null;
    competition_sm: string | null;
    venue: string | null;
    home: { sm_id: number; ts_id: string | null; name: string };
    away: { sm_id: number; ts_id: string | null; name: string };
    score_sm: Ha & { ht_home: number | null; ht_away: number | null };
    score_ts: Ha;
  };
  summary: {
    same: number;
    diff: number;
    sm_only: number;
    ts_only: number;
    empty: number;
    overlap: number;
    same_pct: number | null;
  };
  endpoints: Record<string, { status: number; ok: boolean }>;
  coverage_ts: { name: string; data_types?: Record<string, { available?: boolean }> }[];
  compare: CompareRow[];
  sm: {
    fixture_id: number;
    events: { minute: number | null; type: string; player: string | null; side: Side | null }[];
    coaches: { name: string | null }[];
    referee: { name: string | null; career: { name: string | null; stat_rows: number } | null };
    weather: { temperature?: { current?: number }; description?: string; humidity?: string } | null;
    odds: unknown[];
    h2h: { date: string; home: string; away: string; score: string }[];
    xi: { home: XiPlayer[]; away: XiPlayer[] };
    formations: { formation: string; location: string }[] | null;
    players_rows: PlayerRow[];
  };
  ts: {
    match_id: string | null;
    flags: {
      odds_available?: boolean;
      xg_available?: boolean;
      shotmap_available?: boolean;
      xg_quality?: string;
    } | null;
    managers: { home: { name: string } | null; away: { name: string } | null } | null;
    np_xg: { stored?: { home_team?: number; away_team?: number } } | null;
    shotmap: Shot[];
    heatmaps: { side: Side; name: string; ok: boolean; points: { x: number; y: number }[] }[];
    timeline: { minute: number | null; type: string; player: string | null }[];
    referee: { referee?: { name: string; career?: { games: number; yellow_cards: number; red_cards: number } } } | null;
    odds: { bookmaker: string; markets: Record<string, OddsMarket> }[];
    lineups: {
      home: { formation: string | null; xi: { name: string; position: string | null; jersey: number | null }[]; bench: number };
      away: { formation: string | null; xi: { name: string; position: string | null; jersey: number | null }[]; bench: number };
    };
    players_rows: PlayerRow[];
  };
  players_compare: {
    name: string;
    side: Side;
    matched: boolean;
    fields: Record<string, { sm: number | null; ts: number | null; verdict: Verdict }>;
  }[];
};

type XiPlayer = {
  name: string | null;
  jersey: number | null;
  formation_field: string | null;
  minutes: number | null;
  goals: number | null;
};

function fmt(n: number | null | undefined, d = 0): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString(intlTag(), { minimumFractionDigits: d, maximumFractionDigits: d });
}

function ha(h: number | null | undefined, a: number | null | undefined, d = 0): string {
  if (h === null && a === null) return "—";
  return `${fmt(h, d)} – ${fmt(a, d)}`;
}

function czDate(iso: string): string {
  const [y, m, d] = (iso || "").split("-");
  if (!y || !m || !d) return iso;
  return `${Number(d)}. ${Number(m)}. ${y}`;
}

function verdictTone(v: Verdict): string {
  if (v === "same") return "text-emerald-400 light:text-emerald-700";
  if (v === "diff") return "text-rose-400 light:text-rose-600";
  if (v === "sm_only") return "text-sky-400 light:text-sky-700";
  if (v === "ts_only") return "text-amber-400 light:text-amber-700";
  return "text-slate-400 light:text-slate-500";
}

function rowKind(r: CompareRow): Filter | "empty" {
  const vs = [r.home_verdict, r.away_verdict];
  if (vs.includes("diff")) return "diff";
  if (vs.every((v) => v === "same" || v === "empty") && vs.includes("same")) return "same";
  if (vs.includes("sm_only") && !vs.includes("ts_only")) return "sm";
  if (vs.includes("ts_only") && !vs.includes("sm_only")) return "ts";
  return "all";
}

function oddLast(node: unknown): string {
  if (!node || typeof node !== "object") return "—";
  const o = node as { last_seen?: string; opening?: string };
  if (o.last_seen) return String(o.last_seen);
  if (o.opening) return String(o.opening);
  return "—";
}

export function LabApiDerbyPage() {
  const [data, setData] = useState<Derby | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [hover, setHover] = useState<Shot | null>(null);
  const [startersOnly, setStartersOnly] = useState(true);

  useEffect(() => {
    fetch("/data/lab/derby.json")
      .then((r) => {
        if (!r.ok) throw new Error("Soubor derby.json chybí.");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.compare.filter((r) => {
      if (filter === "all") return true;
      return rowKind(r) === filter;
    });
  }, [data, filter]);

  const playerRows = useMemo(() => {
    if (!data) return [];
    return data.players_compare.filter((p) => {
      if (!startersOnly) return true;
      const min = p.fields.minutes?.sm ?? p.fields.minutes?.ts;
      const started = (data.sm.players_rows.find((s) => s.name === p.name)?.starter ??
        data.ts.players_rows.find((s) => s.name === p.name)?.starter) === true;
      return started || (min != null && min >= 1);
    });
  }, [data, startersOnly]);

  if (error) {
    return (
      <div className="max-w-6xl mx-auto py-12 px-4 pt-20 text-rose-400">
        <Link to="/lab/api" className="text-amber-400 text-sm">
          ← API
        </Link>
        <p className="mt-4">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-6xl mx-auto py-12 px-4 pt-20 text-slate-400 light:text-slate-500">Načítám TEST snapshot…</div>
    );
  }

  const { match: m, summary: s, sm, ts } = data;
  const nDiff = data.compare.filter((r) => rowKind(r) === "diff").length;
  const nSm = data.compare.filter((r) => rowKind(r) === "sm").length;
  const nTs = data.compare.filter((r) => rowKind(r) === "ts").length;
  const smForm = Object.fromEntries((sm.formations || []).map((f) => [f.location, f.formation]));
  const coverage = data.coverage_ts.find((c) => /first league|chance/i.test(c.name));
  const bet365 = ts.odds.find((b) => b.bookmaker === "Bet365") || ts.odds[0];
  const xg = data.compare.find((r) => r.id === "expected_goals");

  return (
    <div className="max-w-6xl mx-auto py-12 px-4 pt-20">
      <Link to="/lab/api" className="text-amber-400 text-sm">
        ← API tabulka
      </Link>
      <header className="mt-4 mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-400">TEST · neprodukt</p>
        <h1 className="text-3xl font-bold text-white light:text-slate-900 mt-1">
          {m.home.name} {m.score_sm.home}:{m.score_sm.away} {m.away.name}
        </h1>
        <p className="text-sm text-slate-400 light:text-slate-500 mt-2 max-w-3xl">
          {czDate(m.date)} · {m.venue} · HT {m.score_sm.ht_home}:{m.score_sm.ht_away}. Cíl: která API dává
          užitečnější data na konkrétním zápase, a jestli se čísla vůbec shodují. Prázdné = pole chybí,
          tarif to nepustí, nebo coverage.
        </p>
        <p className="text-[11px] font-mono text-slate-400 light:text-slate-500 mt-2">
          SM #{sm.fixture_id} · TS {ts.match_id || "—"} · xG quality {ts.flags?.xg_quality || "—"}
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="Shoda překryvu" value={`${s.same_pct ?? "—"} %`} tone="emerald" hint={`${s.same} z ${s.overlap} čísel`} />
        <StatCard label="Neshoda" value={String(nDiff)} tone="rose" hint={`${s.diff} čísel v ${nDiff} metrikách`} />
        <StatCard label="Jen SportMonks" value={String(nSm)} tone="sky" hint="TS pole nemá" />
        <StatCard label="Jen TheStatsAPI" value={String(nTs)} tone="amber" hint="SM pole nemá / 403" />
        <StatCard
          label="xG (jen TS)"
          value={xg ? `${fmt(xg.ts_home, 2)} – ${fmt(xg.ts_away, 2)}` : "—"}
          tone="amber"
          hint={`npxG ${fmt(ts.np_xg?.stored?.home_team, 2)} – ${fmt(ts.np_xg?.stored?.away_team, 2)}`}
        />
      </div>

      <Section title="Co z toho plyne" subtitle="TEST čtení, ne verdikt tarifu">
        <ul className="text-sm text-slate-300 light:text-slate-600 space-y-1.5 list-disc pl-5">
          <li>
            Základní box (střely, držení, rohy, fauly, karty, skluzy, auty) se <strong className="text-emerald-400">shoduje</strong>.
            Score 0:3 obě API.
          </li>
          <li>
            Neshody: přihrávky 461 vs 463, velké šance 2–4 vs 1–3, tyče 1–0 vs 0–0, interceptions hostů 11 vs 9.
            Stejné názvy, jiný provider.
          </li>
          <li>
            TheStatsAPI navíc xG, shotmapa, poločasy, PSxG, kurzy pěti sázkovek. Heatmapa na tomto zápase{" "}
            <strong className="text-rose-400">404</strong> (dva hráči s nejvíc střelami).
          </li>
          <li>
            SportMonks navíc útoky / nebezpečné útoky, H2H endpoint, počasí, VAR-ready eventy. Kurzy a xG na Starteru{" "}
            <strong className="text-rose-400">403</strong>.
          </li>
        </ul>
      </Section>

      <div className="flex flex-wrap gap-2 mb-3">
        <Pill active={filter === "all"} onClick={() => setFilter("all")}>
          Vše ({data.compare.length})
        </Pill>
        <Pill active={filter === "diff"} onClick={() => setFilter("diff")}>
          Neshoda
        </Pill>
        <Pill active={filter === "same"} onClick={() => setFilter("same")}>
          Shoda
        </Pill>
        <Pill active={filter === "sm"} onClick={() => setFilter("sm")}>
          Jen SM
        </Pill>
        <Pill active={filter === "ts"} onClick={() => setFilter("ts")}>
          Jen TS
        </Pill>
      </div>

      <div className="overflow-x-auto card mb-6">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-400 light:text-slate-500 border-b border-slate-800 light:border-slate-200">
              <th className="text-left font-medium px-4 py-3">Metrika</th>
              <th className="text-center font-medium px-3 py-3">SportMonks<br />Sparta – Slavia</th>
              <th className="text-center font-medium px-3 py-3">TheStatsAPI<br />Sparta – Slavia</th>
              <th className="text-center font-medium px-3 py-3">TS 1. poločas</th>
              <th className="text-center font-medium px-3 py-3">TS 2. poločas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const kind = rowKind(r);
              const tone = kind === "diff" ? "bg-rose-500/8" : "";
              return (
                <tr key={r.id} className={`border-t border-slate-800/80 light:border-slate-200 ${tone}`}>
                  <td className="px-4 py-2.5">
                    <p className="text-white light:text-slate-900">{r.label}</p>
                    <p className={`text-[11px] ${verdictTone(kind === "all" ? r.home_verdict : (kind as Verdict))}`}>
                      {kind === "diff" ? "čísla se neshodují" : kind === "same" ? "stejné" : kind === "sm" ? "jen SM" : kind === "ts" ? "jen TS" : ""}
                    </p>
                  </td>
                  <td className={`text-center tabular-nums px-3 py-2.5 ${verdictTone(r.home_verdict)}`}>
                    {ha(r.sm_home, r.sm_away, Number.isInteger(r.sm_home) || r.sm_home == null ? 0 : 2)}
                  </td>
                  <td className={`text-center tabular-nums px-3 py-2.5 ${verdictTone(r.away_verdict === "diff" || r.home_verdict === "diff" ? "diff" : r.ts_home == null ? r.home_verdict : "same")}`}>
                    {ha(r.ts_home, r.ts_away, Number.isInteger(r.ts_home) || r.ts_home == null ? 0 : 2)}
                  </td>
                  <td className="text-center tabular-nums px-3 py-2.5 text-slate-400 light:text-slate-500">
                    {ha(r.ts_home_1h, r.ts_away_1h, Number.isInteger(r.ts_home_1h) || r.ts_home_1h == null ? 0 : 2)}
                  </td>
                  <td className="text-center tabular-nums px-3 py-2.5 text-slate-400 light:text-slate-500">
                    {ha(r.ts_home_2h, r.ts_away_2h, Number.isInteger(r.ts_home_2h) || r.ts_home_2h == null ? 0 : 2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Section title="Shotmapa" subtitle="TheStatsAPI · 30 střel">
          {ts.shotmap.length ? (
            <>
              <ShotPitch shots={ts.shotmap} hover={hover} onHover={setHover} />
              <p className="text-[12px] text-slate-400 light:text-slate-500 mt-2">
                Obě strany útočí doprava. Velikost = xG.
                {hover
                  ? ` ${hover.player} ${hover.minute}' · xG ${fmt(hover.xg, 3)} · ${hover.result}`
                  : " SportMonks shotmapu na Starteru nemá (xG include 403)."}
              </p>
            </>
          ) : (
            <EmptyBoard text="TheStatsAPI shotmapu na tenhle zápas nevrátilo." />
          )}
        </Section>
        <Section title="Heatmapa" subtitle="1 hráč / tým">
          <div className="grid grid-cols-2 gap-3">
            {(ts.heatmaps.length ? ts.heatmaps : [
              { side: "home" as Side, name: "Sparta", ok: false, points: [] },
              { side: "away" as Side, name: "Slavia", ok: false, points: [] },
            ]).map((h) => (
              <div key={h.side}>
                <p className="text-xs text-slate-400 light:text-slate-500 mb-1">
                  {h.side === "home" ? "Sparta" : "Slavia"} · {h.name}
                </p>
                {h.ok && h.points.length ? (
                  <HeatPitch points={h.points} />
                ) : (
                  <EmptyBoard text="404 — movement coverage na Chance Lize u těchto hráčů není." />
                )}
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Section title="Sestava SportMonks" subtitle={`${smForm.home || "?"} / ${smForm.away || "?"}`}>
          <div className="grid grid-cols-2 gap-3">
            <XiList label="Sparta" formation={smForm.home} players={sm.xi.home} />
            <XiList label="Slavia" formation={smForm.away} players={sm.xi.away} />
          </div>
        </Section>
        <Section title="Sestava TheStatsAPI" subtitle={`${ts.lineups.home.formation || "?"} / ${ts.lineups.away.formation || "?"}`}>
          <div className="grid grid-cols-2 gap-3">
            <XiList
              label="Sparta"
              formation={ts.lineups.home.formation}
              players={ts.lineups.home.xi.map((p) => ({
                name: p.name,
                jersey: p.jersey,
                formation_field: p.position,
                minutes: null,
                goals: null,
              }))}
            />
            <XiList
              label="Slavia"
              formation={ts.lineups.away.formation}
              players={ts.lineups.away.xi.map((p) => ({
                name: p.name,
                jersey: p.jersey,
                formation_field: p.position,
                minutes: null,
                goals: null,
              }))}
            />
          </div>
        </Section>
      </div>

      <Section title="Kurzy" subtitle="jen pokud API pustí přístup">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400 light:text-slate-500 mb-2">SportMonks</p>
            <EmptyBoard text="403 — odds / inplayOdds / xGFixture na Starteru nejsou. PulseScore Chance.cz do TESTu nedáváme." />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400 light:text-slate-500 mb-2">TheStatsAPI · last seen</p>
            {bet365 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase text-slate-400 light:text-slate-500">
                      <th className="text-left py-1">Sázkovka</th>
                      <th className="text-center">1</th>
                      <th className="text-center">X</th>
                      <th className="text-center">2</th>
                      <th className="text-center">BTTS ano</th>
                      <th className="text-center">O 2.5</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ts.odds.map((b) => {
                      const mo = b.markets.match_odds as OddsMarket | undefined;
                      const btts = b.markets.btts as OddsMarket | undefined;
                      const tg = b.markets.total_goals as Record<string, OddsMarket> | undefined;
                      return (
                        <tr key={b.bookmaker} className="border-t border-slate-800 light:border-slate-200 tabular-nums">
                          <td className="py-1.5 pr-2">{b.bookmaker}</td>
                          <td className="text-center">{oddLast(mo?.home)}</td>
                          <td className="text-center">{oddLast(mo?.draw)}</td>
                          <td className="text-center">{oddLast(mo?.away)}</td>
                          <td className="text-center">{oddLast(btts?.yes)}</td>
                          <td className="text-center">{oddLast((tg?.["2.5"] as { over?: unknown } | undefined)?.over)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-[11px] text-slate-400 light:text-slate-500 mt-2">
                  Opening Bet365 1X2 {oddLast((bet365.markets.match_odds as OddsMarket)?.home)} /{" "}
                  {oddLast((bet365.markets.match_odds as OddsMarket)?.draw)} /{" "}
                  {oddLast((bet365.markets.match_odds as OddsMarket)?.away)} · živé kurzy 404 · hráčské 0
                </p>
              </div>
            ) : (
              <EmptyBoard text="TheStatsAPI kurzy na tenhle zápas nevrátilo." />
            )}
          </div>
        </div>
      </Section>

      <Section
        title="Hráči vedle sebe"
        subtitle={`${playerRows.filter((p) => p.matched).length} spárovaných jmen`}
      >
        <div className="flex gap-2 mb-3">
          <Pill active={startersOnly} onClick={() => setStartersOnly(true)}>
            S hrami
          </Pill>
          <Pill active={!startersOnly} onClick={() => setStartersOnly(false)}>
            Celá soupiska
          </Pill>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="text-[11px] uppercase text-slate-400 light:text-slate-500">
                <th className="text-left py-2">Hráč</th>
                <th className="text-center">Min SM / TS</th>
                <th className="text-center">Góly</th>
                <th className="text-center">Střely</th>
                <th className="text-center">Rating</th>
                <th className="text-center">xG TS</th>
              </tr>
            </thead>
            <tbody>
              {playerRows.map((p) => (
                <tr key={`${p.side}-${p.name}`} className="border-t border-slate-800/70 light:border-slate-200">
                  <td className="py-1.5">
                    <span className="text-white light:text-slate-900">{p.name}</span>
                    <span className="text-[11px] text-slate-400 light:text-slate-500 ml-2">{p.side === "home" ? "SPA" : "SLA"}</span>
                  </td>
                  <PairCell f={p.fields.minutes} />
                  <PairCell f={p.fields.goals} />
                  <PairCell f={p.fields.shots} />
                  <PairCell f={p.fields.rating} digits={2} />
                  <td className="text-center tabular-nums text-amber-400">
                    {fmt(p.fields.xg?.ts, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 light:text-slate-500 mt-2">
          Rating se skoro nikdy neshoduje (jiný model). xG hráče má jen TheStatsAPI. Minuty a střely většinou ano.
        </p>
      </Section>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Section title="Rozhodčí / trenéři / H2H">
          <dl className="text-sm space-y-2">
            <Row k="Sudí SM" v={sm.referee.career?.name || sm.referee.name || "—"} />
            <Row
              k="Sudí TS"
              v={
                ts.referee?.referee
                  ? `${ts.referee.referee.name} · kariéra ${ts.referee.referee.career?.games} zápasů, ${ts.referee.referee.career?.yellow_cards} žlutých`
                  : "—"
              }
            />
            <Row k="Trenéři SM" v={(sm.coaches.map((c) => c.name).filter(Boolean) as string[]).join(" · ") || "—"} />
            <Row
              k="Trenéři TS"
              v={`${ts.managers?.home?.name || "—"} / ${ts.managers?.away?.name || "—"}`}
            />
            <Row
              k="Počasí SM"
              v={sm.weather ? `${Math.round(sm.weather.temperature?.current || 0)} °C, ${sm.weather.description}` : "—"}
            />
            <Row k="Eventy SM / timeline TS" v={`${sm.events.length} / ${ts.timeline.length}`} />
          </dl>
          <p className="text-xs text-slate-400 light:text-slate-500 mt-3 mb-1">Poslední H2H (jen SportMonks endpoint)</p>
          <ul className="text-sm space-y-1">
            {sm.h2h.slice(0, 6).map((h) => (
              <li key={h.date} className="text-slate-300 light:text-slate-600">
                {h.date.slice(0, 10)} · {h.home} {h.score} {h.away}
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Coverage + volání">
          <p className="text-sm text-slate-300 light:text-slate-600 mb-2">
            {coverage?.name || "Czech First League"}:{" "}
            {coverage?.data_types
              ? Object.entries(coverage.data_types)
                  .map(([k, v]) => `${k} ${v.available ? "ano" : "ne"}`)
                  .join(" · ")
              : "—"}
          </p>
          <ul className="text-[12px] font-mono text-slate-400 light:text-slate-500 space-y-0.5 max-h-64 overflow-auto">
            {Object.entries(data.endpoints).map(([k, v]) => (
              <li key={k}>
                <span className={v.ok ? "text-emerald-500" : "text-rose-400"}>{v.status}</span> {k}
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "emerald" | "rose" | "sky" | "amber";
}) {
  const c = {
    emerald: "text-emerald-400",
    rose: "text-rose-400",
    sky: "text-sky-400",
    amber: "text-amber-400",
  }[tone];
  return (
    <div className="card p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-400 light:text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums mt-1 ${c}`}>{value}</p>
      <p className="text-[11px] text-slate-400 light:text-slate-500 mt-1">{hint}</p>
    </div>
  );
}

function EmptyBoard({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-700 light:border-slate-300 px-3 py-8 text-center text-sm text-slate-400 light:text-slate-500">
      {text}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-400 light:text-slate-500">{k}</dt>
      <dd className="text-right text-slate-200 light:text-slate-800">{v}</dd>
    </div>
  );
}

function PairCell({ f, digits = 0 }: { f?: { sm: number | null; ts: number | null; verdict: Verdict }; digits?: number }) {
  if (!f) return <td className="text-center text-slate-400 light:text-slate-500">—</td>;
  return (
    <td className={`text-center tabular-nums ${verdictTone(f.verdict)}`}>
      {fmt(f.sm, digits)} / {fmt(f.ts, digits)}
    </td>
  );
}

function XiList({
  label,
  formation,
  players,
}: {
  label: string;
  formation?: string | null;
  players: XiPlayer[];
}) {
  return (
    <div>
      <p className="text-xs text-slate-400 light:text-slate-500 mb-1">
        {label} · {formation || "?"}
      </p>
      <ol className="text-sm space-y-0.5">
        {players.map((p) => (
          <li key={`${p.jersey}-${p.name}`} className="flex gap-2">
            <span className="w-6 tabular-nums text-slate-400 light:text-slate-500">{p.jersey ?? ""}</span>
            <span className="text-white light:text-slate-900">{p.name}</span>
            {p.formation_field && !String(p.formation_field).includes(":") ? (
              <span className="text-slate-400 light:text-slate-500 text-[11px]">{p.formation_field}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function ShotPitch({
  shots,
  hover,
  onHover,
}: {
  shots: Shot[];
  hover: Shot | null;
  onHover: (s: Shot | null) => void;
}) {
  const W = 640;
  const H = 420;
  const padX = 24;
  const padY = 16;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const depth = 40;
  const toX = (apiX: number) => padX + ((depth - Math.min(apiX, depth)) / depth) * innerW;
  const toY = (apiY: number) => padY + (apiY / 100) * innerH;
  const boxH = (40.32 / 68) * innerH;
  const sixH = (18.32 / 68) * innerH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-lg bg-emerald-950/80 light:bg-emerald-900" role="img" aria-label="Shotmapa Sparta Slavia">
      <rect x="16" y="8" width={W - 32} height={H - 16} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
      <rect x={toX(16.5)} y={toY(50) - boxH / 2} width={toX(0) - toX(16.5)} height={boxH} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" />
      <rect x={toX(5.5)} y={toY(50) - sixH / 2} width={toX(0) - toX(5.5)} height={sixH} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" />
      <line x1={toX(0)} y1={toY(50) - 20} x2={toX(0)} y2={toY(50) + 20} stroke="white" strokeWidth="3" />
      {shots.map((s, i) => {
        const r = 4 + (s.xg || 0) * 14;
        const fill = s.side === "home" ? "#f43f5e" : "#38bdf8";
        const active = hover === s;
        return (
          <g key={`${s.minute}-${s.player}-${i}`}>
            {s.goal ? <circle cx={toX(s.x)} cy={toY(s.y)} r={r + 4} fill="none" stroke={fill} strokeWidth="2" /> : null}
            <circle
              cx={toX(s.x)}
              cy={toY(s.y)}
              r={r}
              fill={fill}
              opacity={s.on_target || s.goal ? 0.95 : 0.55}
              stroke={active ? "white" : "transparent"}
              strokeWidth="2"
              className="cursor-pointer"
              onMouseEnter={() => onHover(s)}
              onMouseLeave={() => onHover(null)}
            />
          </g>
        );
      })}
    </svg>
  );
}

function HeatPitch({ points }: { points: { x: number; y: number }[] }) {
  return (
    <svg viewBox="0 0 100 68" className="w-full h-auto rounded-lg bg-emerald-950/80">
      <rect x="1" y="1" width="98" height="66" fill="none" stroke="rgba(255,255,255,0.3)" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={(p.y / 100) * 68} r="1.4" fill="#fbbf24" opacity="0.45" />
      ))}
    </svg>
  );
}
