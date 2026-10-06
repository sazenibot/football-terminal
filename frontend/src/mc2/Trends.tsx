import { useState } from "react";
import { buildH2hTrends, type H2hScope } from "../lib/h2hTrends";
import {
  buildTrendmetr,
  overLabel,
  teamShort,
  TRENDMETR_METRICS,
} from "../lib/trendmetr";
import type { MatchData, TrendItem } from "../types";
import { getLocale, t, type Key } from "../i18n/locale";
import { Card, Empty, Info, Seg, TeamTitle, n2 } from "./kit";

/* ---------- Trendy ---------- */

type Min = 0 | 60 | 80 | 100;

const LIMIT = 8;

/** Trendy, které se počítají za oba týmy dohromady (zbytek platí pro konkrétní tým). */
const BOTH_KEYS = new Set([
  "btts",
  "over15",
  "over25",
  "under25",
  "corners_over95",
  "corners_under95",
  "yellow_under5",
  "yellow_5plus",
  "red_card",
  "ht_draw",
]);

type Scope = { text: string; color: string } | null;
/** Desetinná čárka jen v češtině. */
const czNum = (s: string) => (getLocale() === "cs" ? s.replace(/(\d)\.(\d)/g, "$1,$2") : s);

/** Popisky trendů, které přicházejí z dat (česky). Překládáme podle klíče, neznámý klíč zůstane beze změny. */
const DATA_LABEL: Record<string, Key> = {
  btts: "mc.tr.d.btts",
  clean_sheet: "mc.tr.d.clean_sheet",
  scoreless: "mc.tr.d.scoreless",
  over15: "mc.tr.d.over15",
  over25: "mc.tr.d.over25",
  under25: "mc.tr.d.under25",
  scored2plus: "mc.tr.d.scored2plus",
  corners_over95: "mc.tr.d.corners_over95",
  corners_under95: "mc.tr.d.corners_under95",
  more_corners: "mc.tr.d.more_corners",
  yellow_under5: "mc.tr.d.yellow_under5",
  yellow_5plus: "mc.tr.d.yellow_5plus",
  red_card: "mc.tr.d.red_card",
  team_2plus_yellow: "mc.tr.d.team_2plus_yellow",
  ht_leading: "mc.tr.d.ht_leading",
  ht_draw: "mc.tr.d.ht_draw",
  ht_behind: "mc.tr.d.ht_behind",
  shots_over: "mc.tr.d.shots_over",
  shots_under: "mc.tr.d.shots_under",
  sot_over: "mc.tr.d.sot_over",
  sot_under: "mc.tr.d.sot_under",
  fouls_over: "mc.tr.d.fouls_over",
  fouls_under: "mc.tr.d.fouls_under",
  offsides_over: "mc.tr.d.offsides_over",
  offsides_under: "mc.tr.d.offsides_under",
};

function dataLabel(i: TrendItem): string {
  const k = DATA_LABEL[i.key];
  if (!k) return i.label;
  const n = i.label.match(/-?\d+(?:\.\d+)?/)?.[0] ?? "";
  return t(k, { n });
}

function TrendRows({ items, min, scopeOf, fromData = false }: { items: TrendItem[]; min: Min; scopeOf: (i: TrendItem) => Scope; fromData?: boolean }) {
  const [all, setAll] = useState(false);
  // „-0,5+“ platí vždy, takže nic neříká
  const list = items
    .filter((i) => i.pct >= min && !/-0[.,]5/.test(i.label))
    .sort((a, b) => b.pct - a.pct);
  if (!list.length)
    return <Empty>{t("mc.tr.none", { p: t("fmt.pct", { n: min }) })}</Empty>;
  const shown = all ? list : list.slice(0, LIMIT);
  return (
    <>
      <ul className="divide-y divide-(--c-line)">
        {shown.map((it) => {
          const color =
            it.pct >= 80
              ? "var(--c-win)"
              : it.pct >= 60
                ? "var(--c-warn)"
                : "var(--c-faint)";
          const sc = scopeOf(it);
          return (
            <li key={it.key} className="py-2">
              <div className="flex items-start justify-between gap-3">
                <span className="text-[13px] leading-snug">
                  {sc && (
                    <span
                      className="mr-2 inline-block rounded-md px-1.5 py-0.5 align-middle text-[10px] font-semibold leading-tight"
                      style={{ color: sc.color, background: `color-mix(in oklab, ${sc.color} 16%, transparent)` }}
                    >
                      {sc.text}
                    </span>
                  )}
                  <span className="align-middle">{czNum(fromData ? dataLabel(it) : it.label)}</span>
                </span>
                {it.odds != null && (
                  <span
                    className="shrink-0 rounded-md bg-(--c-raised) px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-(--c-muted)"
                    title={t("mc.tr.oddsTitle")}
                  >
                    {n2(it.odds)}
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-(--c-raised)">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${it.pct}%`, background: color }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-(--c-muted)">
                  <b className="font-semibold text-(--c-text)">
                    {t("fmt.pct", { n: Math.round(it.pct) })}
                  </b>{" "}
                  · {it.hits}/{it.total}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {list.length > LIMIT && (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          className="mt-1 min-h-9 text-[13px] font-medium text-(--c-accent) hover:underline"
        >
          {all ? t("home.news.less") : t("mc.pe.pl.showAll", { n: list.length })}
        </button>
      )}
    </>
  );
}

const scopeFor =
  (team: string, color: string) =>
  (it: TrendItem): Scope =>
    BOTH_KEYS.has(it.key) ? { text: t("mc.tr.both"), color: "var(--c-muted)" } : { text: team, color };

export function TrendsCard({ m }: { m: MatchData }) {
  const [source, setSource] = useState<"team" | "h2h">("team");
  const [min, setMin] = useState<Min>(80);
  const [scope, setScope] = useState<H2hScope>("match");
  const [span, setSpan] = useState<"3" | "5">("5");
  const h2hStored = span === "3" ? m.trends.h2h.last3 : m.trends.h2h.last5;
  const h2hItems = buildH2hTrends(
    m.h2h,
    m.home,
    m.away,
    scope,
    span === "3" ? 3 : 5,
    h2hStored,
  );

  return (
    <Card
      title={
        <>
          {t("mc.tr.title")}
          <Info>{t("mc.tr.info")}</Info>
        </>
      }
      lead={t("mc.tr.lead")}
      aside={
        <Seg
          label={t("mc.tr.source")}
          value={source}
          onChange={setSource}
          options={[
            { id: "team", label: t("mc.tr.srcTeam") },
            { id: "h2h", label: t("mc.ov.h2h.title") },
          ]}
        />
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-(--c-muted)">{t("mc.tr.showFrom")}</span>
        <Seg
          label={t("mc.tr.minFreq")}
          value={String(min) as "0" | "60" | "80" | "100"}
          onChange={(v) => setMin(Number(v) as Min)}
          options={[
            { id: "0", label: t("mc.tr.all") },
            { id: "60", label: t("fmt.pct", { n: 60 }) },
            { id: "80", label: t("fmt.pct", { n: 80 }) },
            { id: "100", label: t("fmt.pct", { n: 100 }) },
          ]}
        />
        {source === "h2h" && (
          <>
            <Seg
              label={t("mc.tr.sample")}
              value={span}
              onChange={setSpan}
              options={[
                { id: "3", label: t("mc.tr.last3") },
                { id: "5", label: t("mc.xb.last5") },
              ]}
            />
            <Seg
              label={t("mc.tr.forWhom")}
              value={scope}
              onChange={setScope}
              options={[
                { id: "match", label: t("mc.tr.bothTeams") },
                { id: "home", label: m.home.name },
                { id: "away", label: m.away.name },
              ]}
            />
          </>
        )}
      </div>

      {source === "team" ? (
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <div className="mb-1">
              <TeamTitle team={m.home} side="home" />
            </div>
            <TrendRows fromData items={m.trends.team_last5.home} min={min} scopeOf={scopeFor(m.home.name, "var(--c-home)")} />
          </div>
          <div>
            <div className="mb-1">
              <TeamTitle team={m.away} side="away" />
            </div>
            <TrendRows fromData items={m.trends.team_last5.away} min={min} scopeOf={scopeFor(m.away.name, "var(--c-away)")} />
          </div>
        </div>
      ) : m.h2h.length ? (
        <TrendRows
          items={h2hItems}
          min={min}
          scopeOf={() => (scope === "match" ? { text: t("mc.tr.both"), color: "var(--c-muted)" } : null)}
        />
      ) : (
        <Empty>{t("mc.tr.noH2h")}</Empty>
      )}
    </Card>
  );
}

/* ---------- Betbuilder linie (dřív Trendmetr) ---------- */

export function BetbuilderCard({ m }: { m: MatchData }) {
  const rows = buildTrendmetr(m);
  const [picked, setPicked] = useState<{ key: string; text: string }[]>([]);
  if (!rows.some((r) => Object.keys(r.lines).length)) return null;

  const toggle = (key: string, text: string) =>
    setPicked((prev) =>
      prev.some((p) => p.key === key)
        ? prev.filter((p) => p.key !== key)
        : [...prev, { key, text }],
    );

  return (
    <Card
      title={
        <>
          {t("mc.bb.title")}
          <Info>{t("mc.bb.info")}</Info>
        </>
      }
      lead={t("mc.bb.lead")}
    >
      <div className="grid gap-5 md:grid-cols-2">
        {rows.map((row, i) => (
          <div key={row.team.id}>
            <div className="mb-2 flex items-center gap-2">
              <TeamTitle team={row.team} side={i === 0 ? "home" : "away"} />
              <span className="text-[11px] text-(--c-faint)">{row.role === "doma" ? t("mc.kit.home") : t("mc.kit.away")}</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {TRENDMETR_METRICS.map((col) => {
                const line = row.lines[col.key] ?? null;
                const key = `${row.team.id}-${col.key}`;
                const on = picked.some((p) => p.key === key);
                return (
                  <button
                    key={col.key}
                    type="button"
                    disabled={line == null}
                    aria-pressed={on}
                    onClick={() =>
                      line != null &&
                      toggle(
                        key,
                        `${teamShort(row.team.name)} ${col.name.toLowerCase()} ${overLabel(line)}`,
                      )
                    }
                    className={`flex min-h-[3.75rem] flex-col items-center justify-center rounded-xl border px-1 py-2 text-center transition-colors ${
                      line == null
                        ? "cursor-default border-dashed border-(--c-line) text-(--c-faint)"
                        : on
                          ? "border-(--c-accent) bg-(--c-accent)/15"
                          : "border-(--c-line) bg-(--c-raised) hover:border-(--c-faint)"
                    }`}
                  >
                    <span className="text-[10px] leading-tight text-(--c-muted)">
                      {col.short}
                    </span>
                    <span className="mt-0.5 text-sm font-bold tabular-nums">
                      {line == null ? "—" : overLabel(line)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl bg-(--c-raised) px-3 py-2.5">
        {picked.length === 0 ? (
          <p className="text-xs text-(--c-muted)">{t("mc.bb.nothing")}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {picked.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => toggle(p.key, p.text)}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-(--c-accent)/50 bg-(--c-accent)/10 px-2.5 text-xs text-(--c-accent)"
                aria-label={t("mc.bb.remove", { text: p.text })}
              >
                {p.text} <span aria-hidden>×</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPicked([])}
              className="ml-auto min-h-8 px-2 text-xs text-(--c-muted) hover:text-(--c-text)"
            >
              {t("mc.bb.clear")}
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
