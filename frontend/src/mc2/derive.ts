import type { SimV2 } from "../components/SimulationV2";
import type { XgotBadge } from "../lib/xgEfficiency";
import type { FormSide, MatchData, MatchFacts } from "../types";
import { n1, n2, pct, plural, VALUE_THRESHOLD, type Res } from "./kit";

/* ---------- jednotná predikce (nový model nebo starší simulace jiných lig) ---------- */

export type Prediction = {
  kind: "v2" | "legacy";
  home: number;
  draw: number;
  away: number;
  xg: { home: number; away: number };
  over15?: number;
  over25: number;
  under25: number;
  over35?: number;
  btts: number;
  scorelines: { score: string; pct: number }[];
  shots?: SimV2["model"]["expected_shots"];
  sot?: SimV2["model"]["expected_sot"];
  corners?: SimV2["model"]["expected_corners"];
  market: SimV2["market"];
  sim?: SimV2;
};

export function buildPrediction(m: MatchData, sim: SimV2 | null): Prediction {
  if (sim) {
    const s = sim.model;
    return {
      kind: "v2",
      home: s.home_win_pct,
      draw: s.draw_pct,
      away: s.away_win_pct,
      xg: s.expected_goals,
      over15: s.over15_pct,
      over25: s.over25_pct,
      under25: s.under25_pct,
      over35: s.over35_pct,
      btts: s.btts_pct,
      scorelines: s.top_scorelines,
      shots: s.expected_shots,
      sot: s.expected_sot,
      corners: s.expected_corners,
      market: sim.market,
      sim,
    };
  }
  const s = m.simulation;
  return {
    kind: "legacy",
    home: s.home_win_pct,
    draw: s.draw_pct,
    away: s.away_win_pct,
    xg: s.expected_goals,
    over25: s.over25_pct,
    under25: s.under25_pct,
    btts: s.btts_pct,
    scorelines: s.top_scorelines,
    market: null,
  };
}

/* ---------- forma ---------- */

export const resOf = (m: MatchFacts): Res => (m.gf > m.ga ? "V" : m.gf === m.ga ? "R" : "P");

export function formRows(form: FormSide, venueOnly: boolean, isHome: boolean, n = 6): MatchFacts[] {
  const all = form.recent_all.length ? form.recent_all : form.matches;
  const rows = venueOnly ? all.filter((r) => r.is_home === isHome) : all;
  return rows.slice(0, n);
}

export function formSummary(rows: MatchFacts[]) {
  const w = rows.filter((r) => r.gf > r.ga).length;
  const d = rows.filter((r) => r.gf === r.ga).length;
  const l = rows.length - w - d;
  return {
    n: rows.length,
    w,
    d,
    l,
    pts: w * 3 + d,
    gf: rows.reduce((a, r) => a + r.gf, 0),
    ga: rows.reduce((a, r) => a + r.ga, 0),
  };
}

/* ---------- vzájemné zápasy ---------- */

export function h2hRecord(m: MatchData) {
  const list = m.h2h;
  const n = list.length;
  const w = list.filter((x) => x.result_for_home_team === "V").length;
  const d = list.filter((x) => x.result_for_home_team === "R").length;
  const l = n - w - d;
  const goals = list.reduce((a, x) => a + (x.home_score ?? 0) + (x.away_score ?? 0), 0);
  const btts = list.filter((x) => (x.home_score ?? 0) > 0 && (x.away_score ?? 0) > 0).length;
  const over25 = list.filter((x) => (x.home_score ?? 0) + (x.away_score ?? 0) > 2).length;
  return { n, w, d, l, avgGoals: n ? goals / n : 0, bttsPct: n ? (btts / n) * 100 : 0, over25Pct: n ? (over25 / n) * 100 : 0 };
}

/* ---------- čas do výkopu ---------- */

export function kickoffLabel(iso: string, now = new Date()): { text: string; live: boolean } {
  const k = new Date(iso);
  const diffMs = k.getTime() - now.getTime();
  const sameDay = k.toDateString() === now.toDateString();
  const time = k.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  if (diffMs < -2.5 * 3600e3) return { text: "odehráno", live: false };
  if (diffMs < 0) return { text: "právě se hraje", live: true };
  if (sameDay) return { text: `dnes v ${time}`, live: false };
  const days = Math.round((new Date(k.toDateString()).getTime() - new Date(now.toDateString()).getTime()) / 86400e3);
  if (days === 1) return { text: `zítra v ${time}`, live: false };
  return { text: `za ${days} ${plural(days, "den", "dny", "dní")}`, live: false };
}

/* ---------- klíčová zjištění ---------- */

export type Insight = { tone: "pos" | "neutral" | "warn"; text: string };

export function buildInsights(m: MatchData, p: Prediction, badges: { home: XgotBadge | null; away: XgotBadge | null }): Insight[] {
  const out: Insight[] = [];
  const hn = m.home.name;
  const an = m.away.name;

  // 1) kdo je favorit
  const fav = p.home >= p.away ? { name: hn, v: p.home } : { name: an, v: p.away };
  const gap = Math.abs(p.home - p.away);
  if (gap >= 15) out.push({ tone: "pos", text: `Model vidí jako favorita ${fav.name}: ${pct(fav.v)} na výhru.` });
  else out.push({ tone: "neutral", text: `Vyrovnaný zápas. ${hn} ${pct(p.home)}, remíza ${pct(p.draw)}, ${an} ${pct(p.away)}.` });

  // 2) kde se model liší od sázkové kanceláře
  if (p.market) {
    const mk = p.market;
    const items: { name: string; d: number; model: number; market: number }[] = [];
    const add = (name: string, model: number | undefined, market: number | undefined) => {
      if (model != null && market != null) items.push({ name, d: model - market, model, market });
    };
    add(`výhra ${hn}`, p.home, mk.home_win_pct);
    add("remíza", p.draw, mk.draw_pct);
    add(`výhra ${an}`, p.away, mk.away_win_pct);
    add("over 1,5", p.over15, mk.over15_pct);
    add("over 2,5", p.over25, mk.over25_pct);
    add("over 3,5", p.over35, mk.over35_pct);
    add("under 2,5", p.under25, mk.under25_pct);
    const fmt = (i: (typeof items)[number]) => `${i.name} (model ${pct(i.model)}, sázková kancelář ${pct(i.market)})`;
    const up = items.filter((i) => i.d >= VALUE_THRESHOLD).sort((x, y) => y.d - x.d).slice(0, 2);
    const down = items.filter((i) => i.d <= -VALUE_THRESHOLD).sort((x, y) => x.d - y.d).slice(0, 2);
    if (up.length) out.push({ tone: "pos", text: `Vidíme hodnotu: ${up.map(fmt).join("; ")}.` });
    if (down.length) out.push({ tone: "neutral", text: `Sázková kancelář tomu věří víc: ${down.map(fmt).join("; ")}.` });
    if (!up.length && !down.length) out.push({ tone: "neutral", text: "Model i sázková kancelář vidí zápas skoro stejně." });
  }

  // 3) forma
  const fh = formSummary(formRows(m.form.home, false, true));
  const fa = formSummary(formRows(m.form.away, false, false));
  if (fh.n >= 3 && fa.n >= 3) {
    const diff = fh.pts / fh.n - fa.pts / fa.n;
    if (Math.abs(diff) >= 0.8) {
      const better = diff > 0 ? { n: hn, s: fh } : { n: an, s: fa };
      const other = diff > 0 ? { n: an, s: fa } : { n: hn, s: fh };
      out.push({
        tone: "pos",
        text: `Ve formě vede ${better.n}: ${better.s.pts} bodů z ${better.s.n} zápasů, ${other.n} má ${other.s.pts} z ${other.s.n}.`,
      });
    }
  }

  // 4) vzájemné zápasy
  const h = h2hRecord(m);
  if (h.n >= 3) {
    out.push({
      tone: "neutral",
      text: `Z posledních ${h.n} vzájemných zápasů: ${hn} ${h.w}× vyhrála, ${h.d}× remíza, ${h.l}× prohrála. Průměrně padlo ${n1(h.avgGoals)} gólu.`,
    });
  }

  // 5) góly
  const total = p.xg.home + p.xg.away;
  out.push({
    tone: "neutral",
    text:
      p.over25 >= 58
        ? `Čekají se góly: model dává na over 2,5 ${pct(p.over25)} (očekáváno ${n1(total)} gólu).`
        : p.over25 <= 42
          ? `Spíš uzavřený zápas: over 2,5 jen ${pct(p.over25)} (očekáváno ${n1(total)} gólu).`
          : `Gólově nejasno: over 2,5 ${pct(p.over25)} (očekáváno ${n1(total)} gólu).`,
  });

  // 6) šťastné / smolné finišování
  for (const [name, b] of [
    [hn, badges.home],
    [an, badges.away],
  ] as const) {
    if (b) {
      out.push({
        tone: "warn",
        text:
          b.id === "lucky_scoring_team"
            ? `${name} v posledních 5 zápasech dává víc gólů, než odpovídá kvalitě střel (číslo se může vrátit k normálu).`
            : `${name} v posledních 5 zápasech dává míň gólů, než odpovídá kvalitě střel (může se to otočit).`,
      });
    }
  }

  // 7) rozhodčí
  const ref = m.referee;
  const lc = ref?.league_context;
  const avgYellow = ref?.season_stats?.["Yellowcards"]?.average ?? ref?.season_stats?.["Yellowcards"]?.all?.average;
  if (ref && lc && typeof avgYellow === "number" && lc.yellow_per_match) {
    const rel = avgYellow / lc.yellow_per_match;
    if (rel >= 1.15) out.push({ tone: "warn", text: `Rozhodčí ${ref.name} dává víc žlutých než liga (${n2(avgYellow)} vs. ${n2(lc.yellow_per_match)} na zápas).` });
    else if (rel <= 0.85) out.push({ tone: "neutral", text: `Rozhodčí ${ref.name} dává méně žlutých než liga (${n2(avgYellow)} vs. ${n2(lc.yellow_per_match)} na zápas).` });
  }

  return out.slice(0, 7);
}
