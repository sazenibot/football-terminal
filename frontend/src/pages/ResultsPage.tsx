import { useState, type ReactNode } from "react";
import { Link } from "../i18n/router";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Gate } from "../access/Gate";
import { Frame, Pill, TD, TH, TableWrap } from "../cat/kit";
import { Card, Disclosure, Empty, Info, Stat, n1, n2 } from "../mc2/kit";
import { fmtDate, fmtDateTime, useTrackRecord, type MatchTip, type TipCount, type TipOu, type TipSummary, type TipX, type TrackRecord } from "../site/data";
import { t, type Key } from "../i18n/locale";

const WORD: Record<"home" | "draw" | "away", Key> = { home: "res.word.home", draw: "res.word.draw", away: "res.word.away" };
const p1 = (x: number) => t("fmt.pct", { n: n1(x) });
const IDX = { home: 0, draw: 1, away: 2 } as const;

type Y = "h" | "d" | "a";
type Row = { date: string; home: string; away: string; score: string; p: number[]; y: Y; tip?: MatchTip };

const toY = (y: string): Y => (y === "home" || y === "h" ? "h" : y === "away" || y === "a" ? "a" : "d");
const hitX = (x: TipX, y: Y) => (x.k === "win" ? y === x.s : y === x.s || y === "d");
const goalsOf = (score: string) => score.split("-").reduce((a, b) => a + Number(b), 0);
const hitOu = (ou: TipOu, score: string) => (goalsOf(score) > 2.5) === (ou.k === "over");
const share = (c: TipCount) => (c.n ? p1((100 * c.hits) / c.n) : "–");

function Mark({ ok }: { ok: boolean }) {
  return <span style={{ color: ok ? "var(--c-win)" : "var(--c-loss)" }}>{ok ? "✓" : "✗"}</span>;
}

function xLabel(x: TipX) {
  const key = `res.tip.${x.k}${x.s === "h" ? "Home" : "Away"}` as Key;
  const code = t(`mc.pr.tip.c.${x.s === "h" ? "home" : "away"}${x.k === "dc" ? "Dc" : ""}` as Key);
  return { code, text: t(key) };
}

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
      {live.tips && live.tips.x12.n > 0 && (
        <div className="mt-4">
          <TipsBlock tips={live.tips} />
        </div>
      )}
      {live.matches && live.matches.length > 0 && (
        <Matches rows={live.matches.map((m) => ({ date: m.kickoff, home: m.home, away: m.away, score: m.score, p: m.p, y: toY(m.y), tip: m.tip }))} />
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

      {b.tips && (
        <div className="mt-6">
          <TipsBlock tips={b.tips} tuning={b.tips_tuning ?? undefined} retro />
        </div>
      )}

      <div className="mt-2">
        <Gate feature="results.detail" mode="blur" title={t("res.bt.gateTitle")} text={t("res.bt.gateText")}>
          <Calibration bins={b.calibration} />
          <Matches rows={b.matches.map((m) => ({ ...m, y: toY(m.y) }))} />
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

function Matches({ rows }: { rows: Row[] }) {
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
              <th className={TH}>{t("res.list.tip")}</th>
              <th className={TH}>{t("res.list.goalsTip")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m, i) => {
              const x = m.tip?.x;
              const ou = m.tip?.ou;
              const lbl = x ? xLabel(x) : null;
              const pick = m.p.indexOf(Math.max(...m.p));
              return (
                <tr key={i} className="border-b border-(--c-line) last:border-0">
                  <td className={`${TD} text-(--c-muted)`}>{fmtDate(m.date)}</td>
                  <td className={`${TD} font-medium`}>
                    {m.home} – {m.away}
                  </td>
                  <td className={TD}>{m.score.replace("-", ":")}</td>
                  <td className={`${TD} text-(--c-muted)`}>{m.p.map((v) => Math.round(v)).join(" / ")}</td>
                  <td className={TD}>
                    {x && lbl ? (
                      <>
                        <Mark ok={hitX(x, m.y)} />{" "}
                        <span className="rounded bg-(--c-raised) px-1 text-[11px] font-semibold tabular-nums">{lbl.code}</span> {lbl.text}{" "}
                        <span className="text-(--c-faint)">{p1(x.p)}</span>
                      </>
                    ) : (
                      <>
                        <Mark ok={pick === IDX[m.y === "h" ? "home" : m.y === "a" ? "away" : "draw"]} /> {t(WORD[(["home", "draw", "away"] as const)[pick]])}
                      </>
                    )}
                  </td>
                  <td className={TD}>
                    {ou ? (
                      <>
                        <Mark ok={hitOu(ou, m.score)} /> {t(ou.k === "over" ? "res.tip.over" : "res.tip.under")} <span className="text-(--c-faint)">{p1(ou.p)}</span>
                        <span className="text-(--c-muted)"> · {t("res.tip.goals", { n: goalsOf(m.score) })}</span>
                      </>
                    ) : (
                      <span className="text-(--c-faint)">–</span>
                    )}
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

/* ---------- tipy: výsledek a góly ---------- */

function TipStat({ value, label, sub, hint }: { value: string; label: string; sub?: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-(--c-raised) px-3 py-3 text-center">
      <div className="text-xl font-bold leading-none tabular-nums">{value}</div>
      <div className="mt-1.5 text-xs text-(--c-muted)">
        {label}
        {hint && <Info>{hint}</Info>}
      </div>
      {sub && <div className="mt-1 text-[11px] leading-snug text-(--c-faint)">{sub}</div>}
    </div>
  );
}

function TipsBlock({ tips, tuning, retro = false }: { tips: TipSummary; tuning?: TipSummary & { season: string; n: number }; retro?: boolean }) {
  const { x12, ou25 } = tips;
  return (
    <div>
      <h3 className="text-[15px] font-semibold">{t("res.tips.title")}</h3>
      <p className="mb-3 mt-0.5 text-[13px] leading-snug text-(--c-muted)">{t("res.tips.lead")}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <TipStat
          value={share(x12)}
          label={t("res.tips.x12")}
          hint={t("res.tips.x12Hint")}
          sub={t("res.tips.x12Sub", { win: x12.win.n, winPct: share(x12.win), dc: x12.dc.n, dcPct: share(x12.dc) })}
        />
        <TipStat
          value={share(ou25)}
          label={t("res.tips.ou")}
          hint={t("res.tips.ouHint")}
          sub={t("res.tips.ouSub", { actual: ou25.actual_over, over: ou25.over.n })}
        />
        <TipStat value={share(ou25.strong)} label={t("res.tips.ouStrong")} sub={t("res.tips.ouStrongSub", { n: ou25.strong.n })} />
      </div>
      {tuning && (
        <p className="mt-2 text-[12px] leading-snug text-(--c-faint)">
          {t("res.tips.tuning", { season: tuning.season, x: share(tuning.x12), ou: share(tuning.ou25), n: tuning.n })}
        </p>
      )}
      {retro && <p className="mt-1 text-[12px] leading-snug text-(--c-faint)">{t("res.tips.retro")}</p>}
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
        <li>
          <b className="text-(--c-text)">{t("res.limits.5.b")}</b> {t("res.limits.5.t")}
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
