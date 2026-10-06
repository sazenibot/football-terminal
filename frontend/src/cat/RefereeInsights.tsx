import { useState } from "react";
import type { LeagueUniverse } from "../lib/useData";
import { Card, Empty, Info, MirrorRow, Seg, SubTitle } from "../mc2/kit";
import type { CatalogRefereeMatch } from "../types";
import { csMatches } from "./kit";

const fmtNum = (n: number, digits: number) => n.toLocaleString("cs-CZ", { minimumFractionDigits: digits, maximumFractionDigits: digits });
import { METRICS, avg, combineAgg, othersAvg, refAgg, universeAgg, type Field, type Metric, type Venue } from "./refStats";

/* Dvě karty, které říkají, jak rozhodčí zachází s týmy: konkrétní tým (záložka Zápasy)
   a domácí proti hostům (Přehled). Vždy ve srovnání s ostatními rozhodčími téže ligy. */

const SMALL = 3;

function Delta({ value, base, digits }: { value: number | null; base: number | null; digits: number }) {
  if (value == null || base == null) return null;
  const d = value - base;
  const rounded = Math.round(d * 10 ** digits) / 10 ** digits;
  if (rounded === 0) return <span className="text-xs text-(--c-faint)">stejně jako ostatní</span>;
  return (
    <span className="text-xs font-semibold tabular-nums text-(--c-muted)">
      {rounded > 0 ? "▲ +" : "▼ −"}
      {fmtNum(Math.abs(rounded), digits)}
    </span>
  );
}

function Cell({ title, value, base, n, digits }: { title: string; value: number | null; base: number | null; n: number; digits: number }) {
  const small = n > 0 && n < SMALL;
  return (
    <div className="rounded-xl bg-(--c-raised) px-3.5 py-3">
      <div className="text-xs text-(--c-muted)">{title}</div>
      <div className={`mt-1 flex flex-wrap items-baseline gap-x-2 ${small ? "opacity-70" : ""}`}>
        <span className="text-xl font-bold tabular-nums">{value == null ? "—" : fmtNum(value, digits)}</span>
        {!small && <Delta value={value} base={base} digits={digits} />}
      </div>
      <div className="mt-1 text-[11px] text-(--c-faint)">
        {n} {csMatches(n)}
        {base != null && ` · ostatní rozhodčí ${fmtNum(base, digits)}`}
        {small && " · malý vzorek"}
      </div>
    </div>
  );
}

export function TeamTreatment({
  rows,
  teamId,
  teamName,
  universe,
  seasonIds,
}: {
  rows: CatalogRefereeMatch[];
  teamId: number;
  teamName: string;
  universe: LeagueUniverse | null;
  seasonIds: number[];
}) {
  const [metric, setMetric] = useState<Metric>("fouls");
  const def = METRICS[metric];
  const digits = metric === "fouls" ? 1 : 2;
  const possible = universe ? universeAgg(universe, seasonIds, "home", teamId).m + universeAgg(universe, seasonIds, "away", teamId).m : null;

  const blocks: { venue: Venue; title: string }[] = [
    { venue: "home", title: "Když hraje doma" },
    { venue: "away", title: "Když hraje venku" },
  ];

  return (
    <Card
      title={`Jak rozhodčí zachází s týmem ${teamName}`}
      lead={
        <>
          Průměr na zápas v jeho zápasech tohoto týmu, rozdělený podle toho, kde tým hrál. Šipka ukazuje rozdíl proti ostatním rozhodčím ligy.
          <Info>Ostatní rozhodčí = všechny zápasy týmu ve stejném období a na stejné straně hřiště bez zápasů tohoto rozhodčího. Při méně než třech zápasech rozdíl neukazujeme.</Info>
        </>
      }
      aside={
        <Seg
          label="Statistika"
          value={metric}
          onChange={setMetric}
          options={(Object.keys(METRICS) as Metric[]).map((k) => ({ id: k, label: k === "fouls" ? "Fauly" : k === "yellow" ? "ŽK" : "ČK" }))}
        />
      }
    >
      {possible != null && possible > 0 && (
        <p className="mb-4 text-[13px] text-(--c-muted)">
          Odpískal <b className="text-(--c-text)">{rows.length}</b> z {possible} {csMatches(possible)} týmu ve vybraném období.
        </p>
      )}
      <div className="space-y-4">
        {blocks.map((b) => {
          const own = refAgg(rows, b.venue, teamId);
          const all = universeAgg(universe, seasonIds, b.venue, teamId);
          return (
            <section key={b.venue}>
              <SubTitle>{b.title}</SubTitle>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Cell
                  title={`${def.label} týmu`}
                  value={avg(own[def.own])}
                  base={universe ? othersAvg(all, own, def.own) : null}
                  n={own[def.own].n}
                  digits={digits}
                />
                <Cell
                  title={`${def.label} soupeře`}
                  value={avg(own[def.opp])}
                  base={universe ? othersAvg(all, own, def.opp) : null}
                  n={own[def.opp].n}
                  digits={digits}
                />
              </div>
            </section>
          );
        })}
      </div>
    </Card>
  );
}

/** Domácí proti hostům: komu rozhodčí píská víc faulů a karet, vedle ligového kontextu. */
export function HomeAwaySplit({ rows, universe, seasonIds }: { rows: CatalogRefereeMatch[]; universe: LeagueUniverse | null; seasonIds: number[] }) {
  const homeOwn = refAgg(rows, "home");
  const awayOwn = refAgg(rows, "away");
  const homeAll = universeAgg(universe, seasonIds, "home");
  const awayAll = universeAgg(universe, seasonIds, "away");
  const line = (field: "f" | "y", digits: number) => {
    const hb = universe ? othersAvg(homeAll, homeOwn, field) : null;
    const ab = universe ? othersAvg(awayAll, awayOwn, field) : null;
    return hb != null && ab != null ? `ostatní rozhodčí ${fmtNum(hb, digits)} : ${fmtNum(ab, digits)}` : undefined;
  };
  if (homeOwn[("f")].n === 0) return null;
  return (
    <Card title="Domácí a hosté" lead="Kolik faulů a žlutých karet dostali v jeho zápasech domácí a kolik hosté.">
      <SideCaption />
      <div className="divide-y divide-(--c-line)">
        <MirrorRow label="Fauly" home={avg(homeOwn.f)} away={avg(awayOwn.f)} digits={1} note={line("f", 1)} />
        <MirrorRow label="Žluté karty" home={avg(homeOwn.y)} away={avg(awayOwn.y)} digits={2} note={line("y", 2)} />
      </div>
    </Card>
  );
}

function SideCaption() {
  return (
    <div className="mb-1 grid grid-cols-2 text-xs font-semibold">
      <span style={{ color: "var(--c-home)" }}>Domácí</span>
      <span className="text-right" style={{ color: "var(--c-away)" }}>
        Hosté
      </span>
    </div>
  );
}

/* ---------- žebříček týmů ---------- */

const MIN_MATCHES = 3;
type Mode = "delta" | "avg";
type Scope = "current" | "all";

/** Kterému týmu píská nejvíc a nejmíň faulů či žlutých. V aktuální sezoně je zápasů málo, takže jen průměr na zápas
    bez minima. Za všechny sezony jde řadit i proti ostatním rozhodčím, protože holý průměr hlavně opisuje styl hry
    týmu (kdo faulí hodně, faulí hodně u každého). */
export function TeamLeaderboard({
  rows: allRows,
  universe,
  currentSeasonId,
  allSeasonIds,
}: {
  rows: CatalogRefereeMatch[];
  universe: LeagueUniverse | null;
  currentSeasonId: number | null;
  allSeasonIds: number[];
}) {
  const [metric, setMetric] = useState<"fouls" | "yellow">("fouls");
  const [mode, setMode] = useState<Mode>("avg");
  const [scope, setScope] = useState<Scope>(currentSeasonId != null ? "current" : "all");
  const isCurrent = scope === "current" && currentSeasonId != null;
  const rows = isCurrent ? allRows.filter((m) => m.s === currentSeasonId) : allRows;
  const seasonIds = isCurrent ? [currentSeasonId as number] : allSeasonIds;
  const canDelta = !!universe && !isCurrent;
  const effMode: Mode = canDelta ? mode : "avg";
  const minMatches = isCurrent ? 1 : MIN_MATCHES;
  const field: Field = METRICS[metric].own;
  const digits = metric === "fouls" ? 1 : 2;

  const teams = new Map<number, string>();
  for (const m of rows) {
    if (m.hid && m.hn) teams.set(m.hid, m.hn);
    if (m.aid && m.an) teams.set(m.aid, m.an);
  }
  const list = [...teams.entries()]
    .map(([id, name]) => {
      const own = combineAgg(refAgg(rows, "home", id), refAgg(rows, "away", id));
      const all = combineAgg(universeAgg(universe, seasonIds, "home", id), universeAgg(universe, seasonIds, "away", id));
      const value = avg(own[field]);
      const base = canDelta ? othersAvg(all, own, field) : null;
      const delta = value != null && base != null ? value - base : null;
      return { id, name, n: own[field].n, value, base, delta, sort: effMode === "delta" ? delta : value };
    })
    .filter((t) => t.n >= minMatches && t.sort != null)
    .sort((a, b) => (b.sort as number) - (a.sort as number));

  const top = list.slice(0, Math.min(3, Math.ceil(list.length / 2)));
  const bottom = list.length > 1 ? list.slice(-Math.min(3, Math.floor(list.length / 2))).reverse() : [];
  const sign = (d: number) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${fmtNum(Math.abs(d), digits)}`;

  const column = (title: string, items: typeof list, tone: string) => (
    <section>
      <SubTitle>{title}</SubTitle>
      <ol className="divide-y divide-(--c-line) rounded-xl bg-(--c-raised)">
        {items.map((t, i) => (
          <li key={t.id} className="flex items-center gap-3 px-3.5 py-2.5">
            <span className="w-4 shrink-0 text-xs font-semibold tabular-nums text-(--c-faint)">{i + 1}.</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold">{t.name}</div>
              <div className="text-[11px] text-(--c-faint)">
                {t.n} {csMatches(t.n)}
                {effMode === "delta" && t.value != null && ` · průměr ${fmtNum(t.value, digits)}`}
                {effMode === "avg" && t.delta != null && ` · ${sign(t.delta)} proti ostatním`}
              </div>
            </div>
            <span className="shrink-0 text-lg font-bold tabular-nums" style={{ color: tone }}>
              {effMode === "delta" && t.delta != null ? sign(t.delta) : fmtNum(t.value as number, digits)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );

  const label = metric === "fouls" ? "faulů" : "žlutých karet";
  return (
    <Card
      title="Týmy: komu píská nejvíc a nejmíň"
      lead={`Průměrný počet ${label} na zápas, které dostal tým v jeho zápasech.${isCurrent ? " V aktuální sezoně je zápasů málo, proto se počítá jen průměr na zápas a stačí jeden zápas." : ` Jen týmy, kterým odpískal aspoň ${MIN_MATCHES} zápasy.`}`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {currentSeasonId != null && (
          <Seg label="Období" value={scope} onChange={setScope} options={[{ id: "current", label: "Aktuální sezona" }, { id: "all", label: "Všechny sezony" }]} />
        )}
        <Seg label="Statistika" value={metric} onChange={setMetric} options={[{ id: "fouls", label: "Fauly" }, { id: "yellow", label: "Žluté karty" }]} />
        {canDelta && (
          <div className="flex items-center gap-2">
            <Seg
              label="Řazení"
              value={mode}
              onChange={setMode}
              options={[
                { id: "avg", label: "Průměr na zápas" },
                { id: "delta", label: "Proti ostatním rozhodčím" },
              ]}
            />
            <Info>
              Holý průměr hodně opisuje styl hry týmu: kdo faulí často, faulí často u každého rozhodčího. „Proti ostatním rozhodčím" odečte, kolik týmu běžně píská zbytek ligy, a ukáže skutečně rozdílné zacházení.
            </Info>
          </div>
        )}
      </div>
      {list.length < 2 ? (
        <Empty>Zatím málo týmů s dostatkem odpískaných zápasů. Zkuste vybrat všechny sezony.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {column(effMode === "delta" ? "Nejvíc proti ostatním" : "Nejvíc", top, "var(--c-warn)")}
          {column(effMode === "delta" ? "Nejmíň proti ostatním" : "Nejmíň", bottom, "var(--c-home)")}
        </div>
      )}
    </Card>
  );
}
