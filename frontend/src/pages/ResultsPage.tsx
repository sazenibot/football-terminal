import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Gate } from "../access/Gate";
import { Frame, Pill, TD, TH, TableWrap } from "../cat/kit";
import { Card, Disclosure, Empty, Stat, n1, n2 } from "../mc2/kit";
import { fmtDate, fmtDateTime, useTrackRecord, type BacktestMatch, type TrackRecord } from "../site/data";

const WORD = { home: "Domácí", draw: "Remíza", away: "Hosté" } as const;
const IDX = { home: 0, draw: 1, away: 2 } as const;

export function ResultsPage() {
  const { data, done } = useTrackRecord();
  return (
    <Frame wide>
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--c-accent)">Výsledky</p>
      <h1 className="mt-1 text-3xl font-bold">Funguje náš model?</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-(--c-muted)">
        Dvě oddělené věci, které se nesmí míchat. <b className="text-(--c-text)">Živá kniha</b>: predikce, které zamkneme před výkopem a po zápase vyhodnotíme. Nic se
        zpětně nepřepisuje. <b className="text-(--c-text)">Zpětný test</b>: jak by model předpověděl už odehrané zápasy, kdyby znal jen data před nimi.
      </p>
      {!data ? (
        <div className="mt-6">
          <Empty>{done ? "Výsledky se nepodařilo načíst." : "Načítám…"}</Empty>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <Live data={data} />
          <Backtest data={data} />
          <Limits n={data.backtest.n} />
        </div>
      )}
    </Frame>
  );
}

/* ---------- živá kniha ---------- */

function Live({ data }: { data: TrackRecord }) {
  const live = data.live;
  const title: ReactNode = (
    <>
      Živá kniha predikcí <Pill>od {fmtDate(live.since)}</Pill>
    </>
  );
  return (
    <Card
      title={title}
      lead="Predikce se zamykají před výkopem. Pravděpodobnosti zveřejníme po zápase, vedle skutečného výsledku, ať nikdo nemůže tvrdit, že se upravily."
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat value={live.locked} label="Zamčených predikcí" />
        <Stat value={live.settled} label="Vyhodnoceno" />
        <Stat value={live.upcoming.length} label="Čeká na výkop" />
      </div>
      {live.settled === 0 ? (
        <p className="mt-3 rounded-xl bg-(--c-raised)/60 px-4 py-3 text-[13px] leading-snug text-(--c-muted)">
          Zatím není co vyhodnocovat. První výsledky přibudou po prvním odehraném zápase z knihy. Dokud nebude vyhodnocených aspoň několik desítek zápasů, nebudeme počítat
          žádnou úspěšnost.
        </p>
      ) : (
        live.model && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat value={`${n1(live.model.accuracy)} %`} label="Trefeno (model)" />
            <Stat value={n2(live.model.logloss)} label="Logloss modelu" />
            {live.market && <Stat value={`${n1(live.market.accuracy)} %`} label="Trefeno (kurz)" />}
            {live.market && <Stat value={n2(live.market.logloss)} label="Logloss kurzu" />}
          </div>
        )
      )}
      <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">Zamčeno, čeká na zápas</h3>
      <TableWrap>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-(--c-line)">
              <th className={TH}>Výkop</th>
              <th className={TH}>Zápas</th>
              <th className={TH}>Zamčeno</th>
            </tr>
          </thead>
          <tbody>
            {live.upcoming.map((u) => (
              <tr key={u.fid} className="border-b border-(--c-line) last:border-0">
                <td className={TD}>{fmtDateTime(u.kickoff)}</td>
                <td className={`${TD} font-medium`}>
                  <Link to={`/match/${u.fid}`} className="hover:text-(--c-accent)">
                    {u.home} – {u.away}
                  </Link>
                </td>
                <td className={`${TD} text-(--c-muted)`}>🔒 {fmtDateTime(u.locked_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}

/* ---------- zpětný test ---------- */

function Backtest({ data }: { data: TrackRecord }) {
  const b = data.backtest;
  const lift = b.model.accuracy - b.baselines.always_home_accuracy;
  const pm = Math.round(196 * Math.sqrt(((b.model.accuracy / 100) * (1 - b.model.accuracy / 100)) / b.n));
  return (
    <Card
      title="Zpětný test"
      lead={`${b.league}, sezóna ${b.season}, ${fmtDate(b.from)} – ${fmtDate(b.to)}. Model u každého zápasu používá jen data, která byla k dispozici před ním.`}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat value={`${n1(b.model.accuracy)} %`} label="Trefený výsledek" hint={`Vždy domácí: ${n1(b.baselines.always_home_accuracy)} % (+${n1(lift)} p. b.)`} />
        <Stat value={n2(b.model.logloss)} label="Logloss (nižší je lepší)" hint={`Podle samotných frekvencí: ${n2(b.baselines.frequency_logloss)}`} />
        <Stat value={n2(b.model.brier)} label="Brier skóre (nižší je lepší)" />
        <Stat value={b.n} label="Zápasů" hint={`Skutečně: ${n1(b.actual_1x2.home)} % domácí, ${n1(b.actual_1x2.draw)} % remíza, ${n1(b.actual_1x2.away)} % hosté`} />
      </div>
      <p className="mt-3 text-[12px] leading-snug text-(--c-faint)">
        Přesnost je u {b.n} zápasů zatížená odchylkou přibližně ±{pm} procentních bodů. Logloss a Brier hodnotí i to, jak moc si model věřil, ne jen jestli trefil.
      </p>

      <div className="mt-2">
        <Gate feature="results.detail" mode="blur" title="Kalibraci a rozpis zápasů vidí registrovaní" text="Stačí bezplatný účet.">
          <Calibration bins={b.calibration} />
          <Matches rows={b.matches} />
        </Gate>
      </div>
    </Card>
  );
}

function Calibration({ bins }: { bins: TrackRecord["backtest"]["calibration"] }) {
  const rows = bins.map((x) => ({ name: `${x.lo}–${x.hi} %`, n: x.n, model: x.predicted, real: x.actual }));
  return (
    <div className="mt-6">
      <h3 className="mb-1 text-[15px] font-semibold">Kalibrace: když model řekne X %, jak často to vyjde?</h3>
      <p className="mb-3 text-[13px] leading-snug text-(--c-muted)">
        Každý výsledek (domácí, remíza, hosté) v každém zápase je jedna predikce. Pokud je model vyvážený, sloupce vedle sebe jsou stejně vysoké. Čím méně predikcí v pásmu,
        tím víc je rozdíl náhoda.
      </p>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 4, right: 8, left: -12, bottom: 4 }}>
            <CartesianGrid stroke="var(--c-line)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "var(--c-muted)", fontSize: 11 }} stroke="var(--c-line)" />
            <YAxis tick={{ fill: "var(--c-muted)", fontSize: 11 }} stroke="var(--c-line)" unit=" %" domain={[0, 100]} />
            <Tooltip
              contentStyle={{ background: "var(--c-surface)", border: "1px solid var(--c-line)", borderRadius: 12, fontSize: 12 }}
              formatter={(v, name) => [`${n1(Number(v))} %`, String(name)]}
              labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload?.n ?? 0} predikcí`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="model" name="Model čekal" fill="var(--c-accent)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="real" name="Skutečně nastalo" fill="var(--c-away)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-(--c-faint)">
        {rows.map((r) => (
          <span key={r.name}>
            {r.name}: {r.n} predikcí
          </span>
        ))}
      </div>
    </div>
  );
}

function Matches({ rows }: { rows: BacktestMatch[] }) {
  const [all, setAll] = useState(false);
  const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  const shown = all ? sorted : sorted.slice(0, 12);
  return (
    <div className="mt-6">
      <h3 className="mb-2 text-[15px] font-semibold">Rozpis zápasů</h3>
      <TableWrap>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-(--c-line)">
              <th className={TH}>Datum</th>
              <th className={TH}>Zápas</th>
              <th className={TH}>Skóre</th>
              <th className={TH}>Model D / R / H</th>
              <th className={TH}>Tip modelu</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m, i) => {
              const pick = m.p.indexOf(Math.max(...m.p));
              const hit = pick === IDX[m.y];
              const pickKey = (["home", "draw", "away"] as const)[pick];
              return (
                <tr key={i} className="border-b border-(--c-line) last:border-0">
                  <td className={`${TD} text-(--c-muted)`}>{fmtDate(m.date)}</td>
                  <td className={`${TD} font-medium`}>
                    {m.home} – {m.away}
                  </td>
                  <td className={TD}>{m.score.replace("-", ":")}</td>
                  <td className={`${TD} text-(--c-muted)`}>{m.p.map((x) => Math.round(x)).join(" / ")}</td>
                  <td className={TD}>
                    <span style={{ color: hit ? "var(--c-win)" : "var(--c-loss)" }}>{hit ? "✓" : "✗"}</span> {WORD[pickKey]}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      {rows.length > 12 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-[13px] text-(--c-accent) hover:underline">
          {all ? "Zobrazit méně" : `Zobrazit všech ${rows.length}`}
        </button>
      )}
    </div>
  );
}

/* ---------- omezení ---------- */

function Limits({ n }: { n: number }) {
  return (
    <Card title="Co z těchto čísel vyčíst a co ne">
      <ul className="space-y-2 text-[13px] leading-relaxed text-(--c-muted)">
        <li>
          <b className="text-(--c-text)">{n} zápasů je málo.</b> Čísla ukazují směr, ne jistotu. S přibývajícími koly se zpřesní.
        </li>
        <li>
          <b className="text-(--c-text)">Zpětný test není živý výsledek.</b> Nastavení modelu jsme ladili na sezóně 2025/26, sezóna 2026/27 slouží jako nezávislé ověření.
          I tak jde o zpětný pohled, proto vedeme zvlášť živou knihu, která se nedá upravit.
        </li>
        <li>
          <b className="text-(--c-text)">S kurzy se zatím neporovnáváme.</b> K zápasům z minulosti nemáme historické kurzy. Srovnání modelu a trhu bude možné z živé knihy, kde
          si kurz ukládáme spolu s predikcí.
        </li>
        <li>
          <b className="text-(--c-text)">Trefit vítěze neznamená vydělat.</b> Rozhoduje poměr mezi pravděpodobností a kurzem. Proto sledujeme i logloss a kalibraci.
        </li>
      </ul>
      <div className="mt-3">
        <Disclosure summary="Jak model funguje">
          <p className="text-[13px] leading-relaxed text-(--c-muted)">
            Krátké vysvětlení najdete v článku{" "}
            <Link to="/clanky/jak-funguje-simulace" className="text-(--c-accent) hover:underline">
              Jak funguje simulace zápasu
            </Link>
            .
          </p>
        </Disclosure>
      </div>
    </Card>
  );
}
