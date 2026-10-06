import { useState, type ReactNode } from "react";
import { Link } from "../i18n/router";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Gate } from "../access/Gate";
import { Frame, Pill, TD, TH, TableWrap } from "../cat/kit";
import { Card, Disclosure, Empty, Stat, n1, n2 } from "../mc2/kit";
import { fmtDate, fmtDateTime, useTrackRecord, type BacktestMatch, type TrackRecord } from "../site/data";
import { t, type Key } from "../i18n/locale";

const WORD: Record<"home" | "draw" | "away", Key> = { home: "res.word.home", draw: "res.word.draw", away: "res.word.away" };
const p1 = (x: number) => t("fmt.pct", { n: n1(x) });
const IDX = { home: 0, draw: 1, away: 2 } as const;

export function ResultsPage() {
  const { data, done } = useTrackRecord();
  return (
    <Frame wide>
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--c-accent)">{t("res.eyebrow")}</p>
      <h1 className="mt-1 text-3xl font-bold">{t("res.title")}</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-(--c-muted)">
        {t("res.lead.pre")} <b className="text-(--c-text)">{t("res.lead.liveBold")}</b>
        {t("res.lead.live")} <b className="text-(--c-text)">{t("res.lead.backBold")}</b>
        {t("res.lead.back")}
      </p>
      {!data ? (
        <div className="mt-6">
          <Empty>{done ? t("res.loadError") : t("res.loading")}</Empty>
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
      {t("res.live.title")} <Pill>{t("res.live.since", { date: fmtDate(live.since) })}</Pill>
    </>
  );
  return (
    <Card
      title={title}
      lead={t("res.live.lead")}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat value={live.locked} label={t("res.live.locked")} />
        <Stat value={live.settled} label={t("res.live.settled")} />
        <Stat value={live.upcoming.length} label={t("res.live.upcoming")} />
      </div>
      {live.settled === 0 ? (
        <p className="mt-3 rounded-xl bg-(--c-raised)/60 px-4 py-3 text-[13px] leading-snug text-(--c-muted)">
          {t("res.live.empty")}
        </p>
      ) : (
        live.model && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat value={p1(live.model.accuracy)} label={t("res.live.hitModel")} />
            <Stat value={n2(live.model.logloss)} label={t("res.live.loglossModel")} />
            {live.market && <Stat value={p1(live.market.accuracy)} label={t("res.live.hitMarket")} />}
            {live.market && <Stat value={n2(live.market.logloss)} label={t("res.live.loglossMarket")} />}
          </div>
        )
      )}
      <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">{t("res.live.pendingTitle")}</h3>
      <TableWrap>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-(--c-line)">
              <th className={TH}>{t("res.col.kickoff")}</th>
              <th className={TH}>{t("res.col.match")}</th>
              <th className={TH}>{t("res.col.locked")}</th>
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
      title={t("res.bt.title")}
      lead={t("res.bt.lead", { league: b.league, season: b.season, from: fmtDate(b.from), to: fmtDate(b.to) })}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          value={p1(b.model.accuracy)}
          label={t("res.bt.accuracy")}
          hint={t("res.bt.accuracyHint", { pct: p1(b.baselines.always_home_accuracy), lift: n1(lift) })}
        />
        <Stat value={n2(b.model.logloss)} label={t("res.bt.logloss")} hint={t("res.bt.loglossHint", { v: n2(b.baselines.frequency_logloss) })} />
        <Stat value={n2(b.model.brier)} label={t("res.bt.brier")} />
        <Stat
          value={b.n}
          label={t("res.bt.matches")}
          hint={t("res.bt.matchesHint", { home: p1(b.actual_1x2.home), draw: p1(b.actual_1x2.draw), away: p1(b.actual_1x2.away) })}
        />
      </div>
      <p className="mt-3 text-[12px] leading-snug text-(--c-faint)">
        {t("res.bt.margin", { n: b.n, pm })}
      </p>

      <div className="mt-2">
        <Gate feature="results.detail" mode="blur" title={t("res.bt.gateTitle")} text={t("res.bt.gateText")}>
          <Calibration bins={b.calibration} />
          <Matches rows={b.matches} />
        </Gate>
      </div>
    </Card>
  );
}

function Calibration({ bins }: { bins: TrackRecord["backtest"]["calibration"] }) {
  const rows = bins.map((x) => ({ name: t("fmt.pct", { n: `${x.lo}–${x.hi}` }), n: x.n, model: x.predicted, real: x.actual }));
  return (
    <div className="mt-6">
      <h3 className="mb-1 text-[15px] font-semibold">{t("res.cal.title")}</h3>
      <p className="mb-3 text-[13px] leading-snug text-(--c-muted)">
        {t("res.cal.lead")}
      </p>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 4, right: 8, left: -12, bottom: 4 }}>
            <CartesianGrid stroke="var(--c-line)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "var(--c-muted)", fontSize: 11 }} stroke="var(--c-line)" />
            <YAxis tick={{ fill: "var(--c-muted)", fontSize: 11 }} stroke="var(--c-line)" tickFormatter={(v) => t("fmt.pct", { n: v })} domain={[0, 100]} />
            <Tooltip
              contentStyle={{ background: "var(--c-surface)", border: "1px solid var(--c-line)", borderRadius: 12, fontSize: 12 }}
              formatter={(v, name) => [p1(Number(v)), String(name)]}
              labelFormatter={(l, p) => `${l} · ${t("res.cal.count", { n: p?.[0]?.payload?.n ?? 0 })}`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="model" name={t("res.cal.model")} fill="var(--c-accent)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="real" name={t("res.cal.real")} fill="var(--c-away)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-(--c-faint)">
        {rows.map((r) => (
          <span key={r.name}>
            {r.name}: {t("res.cal.count", { n: r.n })}
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
      <h3 className="mb-2 text-[15px] font-semibold">{t("res.list.title")}</h3>
      <TableWrap>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-(--c-line)">
              <th className={TH}>{t("res.list.date")}</th>
              <th className={TH}>{t("res.list.match")}</th>
              <th className={TH}>{t("res.list.score")}</th>
              <th className={TH}>{t("res.list.probs")}</th>
              <th className={TH}>{t("res.list.pick")}</th>
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
                    <span style={{ color: hit ? "var(--c-win)" : "var(--c-loss)" }}>{hit ? "✓" : "✗"}</span> {t(WORD[pickKey])}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      {rows.length > 12 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-[13px] text-(--c-accent) hover:underline">
          {all ? t("res.list.less") : t("res.list.all", { n: rows.length })}
        </button>
      )}
    </div>
  );
}

/* ---------- omezení ---------- */

function Limits({ n }: { n: number }) {
  return (
    <Card title={t("res.limits.title")}>
      <ul className="space-y-2 text-[13px] leading-relaxed text-(--c-muted)">
        <li>
          <b className="text-(--c-text)">{t("res.limits.1.b", { n })}</b> {t("res.limits.1.t")}
        </li>
        <li>
          <b className="text-(--c-text)">{t("res.limits.2.b")}</b> {t("res.limits.2.t")}
        </li>
        <li>
          <b className="text-(--c-text)">{t("res.limits.3.b")}</b> {t("res.limits.3.t")}
        </li>
        <li>
          <b className="text-(--c-text)">{t("res.limits.4.b")}</b> {t("res.limits.4.t")}
        </li>
      </ul>
      <div className="mt-3">
        <Disclosure summary={t("res.limits.how")}>
          <p className="text-[13px] leading-relaxed text-(--c-muted)">
            {t("res.limits.howText")}{" "}
            <Link to="/clanky/jak-funguje-simulace" className="text-(--c-accent) hover:underline">
              {t("res.limits.howLink")}
            </Link>
            .
          </p>
        </Disclosure>
      </div>
    </Card>
  );
}
