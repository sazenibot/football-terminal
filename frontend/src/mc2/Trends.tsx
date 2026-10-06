import { useState } from "react";
import { buildH2hTrends, type H2hScope } from "../lib/h2hTrends";
import {
  buildTrendmetr,
  overLabel,
  teamShort,
  TRENDMETR_METRICS,
} from "../lib/trendmetr";
import type { MatchData, TrendItem } from "../types";
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
const czNum = (s: string) => s.replace(/(\d)\.(\d)/g, "$1,$2");

function TrendRows({ items, min, scopeOf }: { items: TrendItem[]; min: Min; scopeOf: (t: TrendItem) => Scope }) {
  const [all, setAll] = useState(false);
  // „-0,5+“ platí vždy, takže nic neříká
  const list = items
    .filter((i) => i.pct >= min && !i.label.includes("-0.5"))
    .sort((a, b) => b.pct - a.pct);
  if (!list.length)
    return <Empty>V tomhle vzorku není žádný trend nad {min} %.</Empty>;
  const shown = all ? list : list.slice(0, LIMIT);
  return (
    <>
      <ul className="divide-y divide-(--c-line)">
        {shown.map((t) => {
          const color =
            t.pct >= 80
              ? "var(--c-win)"
              : t.pct >= 60
                ? "var(--c-warn)"
                : "var(--c-faint)";
          const sc = scopeOf(t);
          return (
            <li key={t.key} className="py-2">
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
                  <span className="align-middle">{czNum(t.label)}</span>
                </span>
                {t.odds != null && (
                  <span
                    className="shrink-0 rounded-md bg-(--c-raised) px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-(--c-muted)"
                    title="Kurz sázkové kanceláře"
                  >
                    {n2(t.odds)}
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-(--c-raised)">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${t.pct}%`, background: color }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-(--c-muted)">
                  <b className="font-semibold text-(--c-text)">
                    {Math.round(t.pct)} %
                  </b>{" "}
                  · {t.hits}/{t.total}
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
          {all ? "Zobrazit méně" : `Zobrazit všech ${list.length}`}
        </button>
      )}
    </>
  );
}

const scopeFor =
  (team: string, color: string) =>
  (t: TrendItem): Scope =>
    BOTH_KEYS.has(t.key) ? { text: "Oba týmy dohromady", color: "var(--c-muted)" } : { text: team, color };

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
          Trendy, co se opakují
          <Info>
            Jak často se v posledních zápasech stala daná věc. 5/5 = pokaždé.
            Malý vzorek (5 zápasů) znamená, že jde o vodítko, ne o pravidlo.
            Kurz je desetinný kurz sázkové kanceláře k tomuto zápasu, pokud ho k trhu máme.
          </Info>
        </>
      }
      lead="Vzorce z posledních zápasů. Řazeno od nejčastějších."
      aside={
        <Seg
          label="Zdroj trendů"
          value={source}
          onChange={setSource}
          options={[
            { id: "team", label: "Poslední zápasy týmů" },
            { id: "h2h", label: "Vzájemné zápasy" },
          ]}
        />
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-(--c-muted)">Zobrazit od</span>
        <Seg
          label="Minimální četnost"
          value={String(min) as "0" | "60" | "80" | "100"}
          onChange={(v) => setMin(Number(v) as Min)}
          options={[
            { id: "0", label: "vše" },
            { id: "60", label: "60 %" },
            { id: "80", label: "80 %" },
            { id: "100", label: "100 %" },
          ]}
        />
        {source === "h2h" && (
          <>
            <Seg
              label="Vzorek"
              value={span}
              onChange={setSpan}
              options={[
                { id: "3", label: "poslední 3" },
                { id: "5", label: "posledních 5" },
              ]}
            />
            <Seg
              label="Pro koho"
              value={scope}
              onChange={setScope}
              options={[
                { id: "match", label: "oba týmy" },
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
            <TrendRows items={m.trends.team_last5.home} min={min} scopeOf={scopeFor(m.home.name, "var(--c-home)")} />
          </div>
          <div>
            <div className="mb-1">
              <TeamTitle team={m.away} side="away" />
            </div>
            <TrendRows items={m.trends.team_last5.away} min={min} scopeOf={scopeFor(m.away.name, "var(--c-away)")} />
          </div>
        </div>
      ) : m.h2h.length ? (
        <TrendRows
          items={h2hItems}
          min={min}
          scopeOf={() => (scope === "match" ? { text: "Oba týmy dohromady", color: "var(--c-muted)" } : null)}
        />
      ) : (
        <Empty>Tyto týmy spolu zatím nehrály.</Empty>
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
          Betbuilder linie
          <Info>
            Nejvyšší hranice, kterou tým překonal alespoň v 70 % posledních
            zápasů ve stejné roli (doma/venku) a zároveň v zápasech proti tomuto
            soupeři. Např. „Střely 11,5+“ znamená 12 a víc střel. Není to
            doporučení sázky.
          </Info>
        </>
      }
      lead="Minimální hodnoty opakující se v posledních a vzájemných zápasech, vhodné převážně do betbuilderů."
    >
      <div className="grid gap-5 md:grid-cols-2">
        {rows.map((row, i) => (
          <div key={row.team.id}>
            <div className="mb-2 flex items-center gap-2">
              <TeamTitle team={row.team} side={i === 0 ? "home" : "away"} />
              <span className="text-[11px] text-(--c-faint)">{row.role}</span>
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
          <p className="text-xs text-(--c-muted)">Zatím nic nevybráno.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {picked.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => toggle(p.key, p.text)}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-(--c-accent)/50 bg-(--c-accent)/10 px-2.5 text-xs text-(--c-accent)"
                aria-label={`Odebrat ${p.text}`}
              >
                {p.text} <span aria-hidden>×</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPicked([])}
              className="ml-auto min-h-8 px-2 text-xs text-(--c-muted) hover:text-(--c-text)"
            >
              vyčistit
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
