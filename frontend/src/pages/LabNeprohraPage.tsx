import { useEffect, useMemo, useState } from "react";
import { Link } from "../i18n/router";
import { Frame } from "../cat/kit";
import { Card } from "../mc2/kit";
import { TIP_WIN_FROM } from "../lib/tip";

/* Lab: kde nastavit hranici tipu „výhra / neprohra favorita". Cíl je úspěšnost, ne výnos.
   Backtest na 330 zápasech Chance Ligy (2025/26 + 2026/27). Data: scripts/odds_analysis.py.
   Samotný tip je v Match Center (Přehled a Predikce), logika v lib/tip.ts. */

type Row = {
  /** model: domácí, remíza, hosté v % */
  p: [number, number, number];
  /** skutečný výsledek */
  y: "h" | "x" | "a";
  s: string;
};

type Lab = { n: number; rows: Row[] };
type Kind = "win" | "dc";

const pf = (p: [number, number, number]) => Math.max(p[0], p[2]);
const side = (p: [number, number, number]) => (p[0] >= p[2] ? "h" : "a");

function tipHit(r: Row, ts: number): { kind: Kind; ok: boolean } {
  const s = side(r.p);
  return pf(r.p) >= ts ? { kind: "win", ok: r.y === s } : { kind: "dc", ok: r.y === s || r.y === "x" };
}

function stats(rows: Row[], ts: number) {
  const per = { win: { n: 0, hit: 0 }, dc: { n: 0, hit: 0 } };
  for (const r of rows) {
    const t = tipHit(r, ts);
    per[t.kind].n++;
    per[t.kind].hit += +t.ok;
  }
  const n = per.win.n + per.dc.n;
  const hit = per.win.hit + per.dc.hit;
  return { n, hit: n ? (hit / n) * 100 : 0, per };
}

const pct = (v: number | null | undefined, d = 1) => (v == null ? "–" : `${v.toFixed(d).replace(".", ",")} %`);
const rate = (b: { n: number; hit: number }) => (b.n ? (b.hit / b.n) * 100 : null);

function useLab() {
  const [data, setData] = useState<Lab | null>(null);
  useEffect(() => {
    fetch("/data/lab/neprohra.json")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);
  return data;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-(--c-line) bg-(--c-raised)/50 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-(--c-faint)">{label}</div>
      <div className="mt-0.5 text-xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-(--c-muted)">{sub}</div>}
    </div>
  );
}

export function LabNeprohraPage() {
  const lab = useLab();
  const [ts, setTs] = useState(TIP_WIN_FROM);

  const cur = useMemo(() => (lab ? stats(lab.rows, ts) : null), [lab, ts]);
  const sweep = useMemo(() => (lab ? [50, 55, 60, 65, 70, 101].map((t) => ({ t, s: stats(lab.rows, t) })) : []), [lab]);
  const bySeason = useMemo(
    () => (lab ? ["2025/26", "2026/27"].map((s) => ({ s, st: stats(lab.rows.filter((r) => r.s === s), ts) })) : []),
    [lab, ts],
  );
  const winBins = useMemo(() => {
    if (!lab) return [];
    return [[0, 45], [45, 50], [50, 55], [55, 60], [60, 65], [65, 70], [70, 101]].map(([lo, hi]) => {
      const s = lab.rows.filter((r) => pf(r.p) >= lo && pf(r.p) < hi);
      const win = { n: s.length, hit: s.filter((r) => r.y === side(r.p)).length };
      const dc = { n: s.length, hit: s.filter((r) => r.y === side(r.p) || r.y === "x").length };
      return { lo, hi, win, dc };
    });
  }, [lab]);

  return (
    <Frame wide>
      <Link to="/lab" className="text-[13px] text-(--c-accent) hover:underline">
        ← Lab
      </Link>
      <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Tip: výhra, nebo neprohra favorita</h1>
      <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-(--c-muted)">
        Každý zápas dostane jeden tip. Když je favorit jasný, tipujeme jeho výhru (1 / 2), jinak jeho neprohru (10 / 02). Tip je v Match Center v kartě Predikce zápasu, ve výpisu zápasů
        není. Tady se ladí hranice a měří úspěšnost.
      </p>
      <p className="mt-3">
        <Link to="/match/19725030" className="text-[13px] font-medium text-(--c-accent) hover:underline">
          Ukázka v Match Center →
        </Link>
      </p>

      {lab && cur && (
        <>
          <section className="mt-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-(--c-line) bg-(--c-surface) p-3 sm:p-4">
              <label className="flex min-w-0 flex-1 items-center gap-3 text-[13px] text-(--c-muted)">
                <span className="shrink-0">Výhru tipujeme od</span>
                <input type="range" min={45} max={75} step={1} value={ts} onChange={(e) => setTs(+e.target.value)} className="min-w-0 flex-1 accent-(--c-accent)" />
                <b className="w-12 shrink-0 text-right text-(--c-text) tabular-nums">{ts} %</b>
              </label>
              <span className="text-[12px] text-(--c-faint)">P(výhry) favorita; pod hranicí tipujeme neprohru. Nasazeno: {TIP_WIN_FROM} %.</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Úspěšnost všech tipů" value={pct(cur.hit)} sub={`${cur.n} zápasů`} />
              <Stat label="Z toho výhry" value={pct(rate(cur.per.win))} sub={`${cur.per.win.n} tipů`} />
              <Stat label="Z toho neprohry" value={pct(rate(cur.per.dc))} sub={`${cur.per.dc.n} tipů`} />
              <Stat
                label="Sezóny"
                value={bySeason.map((b) => pct(b.st.hit, 0)).join(" / ")}
                sub={bySeason.map((b) => `${b.s} (${b.st.n})`).join(" · ")}
              />
            </div>
          </section>

          <section className="mt-6">
            <h2 className="text-lg font-semibold">Podle hranice</h2>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-(--c-line) bg-(--c-surface)">
              <table className="w-full min-w-[480px] text-[13px] tabular-nums">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-(--c-faint)">
                    <th className="px-3 py-2">Výhra od</th>
                    <th className="px-3 py-2">Výhry (úsp.)</th>
                    <th className="px-3 py-2">Neprohry (úsp.)</th>
                    <th className="px-3 py-2">Celkem</th>
                  </tr>
                </thead>
                <tbody>
                  {sweep.map(({ t, s }) => (
                    <tr key={t} className={`border-t border-(--c-line) ${t === ts ? "bg-(--c-accent)/10" : ""}`}>
                      <td className="px-3 py-2 font-semibold">{t > 100 ? "nikdy (jen neprohra)" : `${t} %`}</td>
                      <td className="px-3 py-2">
                        {s.per.win.n} {s.per.win.n > 0 && <span className="text-(--c-muted)">({pct(rate(s.per.win), 0)})</span>}
                      </td>
                      <td className="px-3 py-2">
                        {s.per.dc.n} <span className="text-(--c-muted)">({pct(rate(s.per.dc), 0)})</span>
                      </td>
                      <td className="px-3 py-2 font-semibold">{pct(s.hit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6">
            <Card title="Výhra a neprohra na stejných zápasech" lead="Podle toho, jak silný je favorit. Vlevo kolik zápasů, vpravo jak často by vyšla výhra a jak často neprohra.">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-[13px] tabular-nums">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-(--c-faint)">
                      <th className="py-2 pr-3">P(výhry) favorita</th>
                      <th className="py-2 pr-3">Zápasů</th>
                      <th className="py-2 pr-3">Výhra favorita</th>
                      <th className="py-2">Neprohra favorita</th>
                    </tr>
                  </thead>
                  <tbody>
                    {winBins.map((b) => (
                      <tr key={b.lo} className="border-t border-(--c-line)">
                        <td className="py-2 pr-3 font-semibold">{b.lo === 0 ? `do ${b.hi} %` : b.hi > 100 ? `od ${b.lo} %` : `${b.lo}–${b.hi} %`}</td>
                        <td className="py-2 pr-3">{b.win.n}</td>
                        <td className="py-2 pr-3">{pct(rate(b.win), 0)}</td>
                        <td className="py-2">{pct(rate(b.dc), 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          <Card className="mt-5" title="Co z toho plyne">
            <ul className="list-disc space-y-2 pl-4 text-[13px] leading-relaxed text-(--c-muted)">
              <li>
                <b className="text-(--c-text)">Čistě podle úspěšnosti vyhrává „vždy neprohra"</b> (76 %). Je ale málo informativní, proto se výhra tipuje tam, kde je favorit opravdu jasný.
              </li>
              <li>
                <b className="text-(--c-text)">Hranice výhry kolem 65 %.</b> Pod ní favorit vyhrál jen ve 44–55 % zápasů, od ní zhruba ve 72 %. Celková úspěšnost při {TIP_WIN_FROM} % je 72,7 %.
              </li>
              <li>
                <b className="text-(--c-text)">Čísla jsou na stejných datech, na kterých byla hranice zvolena.</b> Skutečná úspěšnost bude nejspíš o něco nižší. Ověří ji Kniha predikcí na ostrých zápasech.
              </li>
              <li>Nad hranicí je jen 57 zápasů, takže odhad úspěšnosti výher má rozptyl zhruba ±12 bodů.</li>
            </ul>
          </Card>
        </>
      )}
    </Frame>
  );
}
