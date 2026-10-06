import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { hasPitchData } from "../lib/pitchMatch";
import { plural } from "../mc2/kit";
import type { LeagueMeta } from "../types";
import { Flag } from "./Flag";
import { lastLeagueId, rememberLeague } from "./LeagueSwitcher";

/**
 * Přepínač soutěží, který vydrží i 30 lig:
 *  - nahoře max. 5 čipů (otevřená liga + oblíbené + ostatní živé),
 *  - „Všechny soutěže“ otevře panel s hledáním, řazený podle zemí, s hvězdičkou pro oblíbené.
 * Dokud lig není víc než čipů, tlačítko panelu se nezobrazuje.
 */

const PINS_KEY = "ft-league-pins";
const MAX_CHIPS = 5;

const loadPins = (): number[] => {
  try {
    const v = JSON.parse(localStorage.getItem(PINS_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "number") : [];
  } catch {
    return [];
  }
};

function Logo({ league, size, soon }: { league: LeagueMeta; size: number; soon?: boolean }) {
  const dim = soon ? "opacity-40 grayscale" : "";
  if (!league.logo) {
    return (
      <span
        style={{ width: size, height: size }}
        className={`flex shrink-0 items-center justify-center rounded-full bg-(--c-raised) text-[10px] font-bold text-(--c-muted) ${dim}`}
      >
        {(league.short || league.name).slice(0, 2)}
      </span>
    );
  }
  return <img src={league.logo} alt="" style={{ width: size, height: size }} className={`shrink-0 object-contain ${dim}`} />;
}

const Soon = () => (
  <span className="rounded-md bg-(--c-raised) px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-(--c-muted)">Připravujeme</span>
);

export function LeaguePicker({ leagues, activeId, base }: { leagues: LeagueMeta[]; activeId: number; base: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pins, setPins] = useState<number[]>(loadPins);

  useEffect(() => {
    try {
      localStorage.setItem(PINS_KEY, JSON.stringify(pins));
    } catch {
      /* soukromý režim apod. */
    }
  }, [pins]);

  const byId = useMemo(() => new Map(leagues.map((l) => [l.id, l])), [leagues]);

  // pořadí čipů: otevřená, oblíbené, naposledy otevřená, pak ostatní živé, nakonec zbytek
  const chips = useMemo(() => {
    const live = leagues.filter((l) => hasPitchData(l.id)).map((l) => l.id);
    const order = [activeId, ...pins, lastLeagueId() ?? -1, ...live, ...leagues.map((l) => l.id)];
    return [...new Set(order)].filter((id) => byId.has(id)).slice(0, MAX_CHIPS).map((id) => byId.get(id)!);
  }, [leagues, activeId, pins, byId]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const map = new Map<string, LeagueMeta[]>();
    for (const l of leagues) {
      if (needle && !`${l.name} ${l.country ?? ""}`.toLowerCase().includes(needle)) continue;
      const c = l.country || "Ostatní";
      map.set(c, [...(map.get(c) ?? []), l]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "cs"));
  }, [leagues, q]);

  const toggle = (id: number) => setPins((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const showAll = leagues.length > chips.length;

  return (
    <nav aria-label="Soutěže">
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((l) => {
          const live = hasPitchData(l.id);
          const active = l.id === activeId;
          const inner = (
            <>
              <Logo league={l} size={26} soon={!live} />
              <span className="whitespace-nowrap">{l.name}</span>
              <Flag country={l.country} />
              {!live && <Soon />}
            </>
          );
          if (!live) {
            return (
              <span
                key={l.id}
                aria-disabled
                title="Match Center pro tuhle soutěž připravujeme"
                className="flex cursor-default items-center gap-2 rounded-full border border-dashed border-(--c-line) py-1.5 pl-1.5 pr-3 text-sm font-medium text-(--c-faint)"
              >
                {inner}
              </span>
            );
          }
          return (
            <Link
              key={l.id}
              to={`${base}/${l.id}`}
              onClick={() => rememberLeague(l.id)}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-sm font-semibold transition-colors ${
                active ? "border-(--c-accent) bg-(--c-accent)/12 text-(--c-accent)" : "border-(--c-line) bg-(--c-surface) hover:border-(--c-faint)"
              }`}
            >
              {inner}
            </Link>
          );
        })}

        {showAll && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="ml-auto flex items-center gap-2 rounded-full border border-(--c-line) bg-(--c-surface) px-4 py-2 text-sm font-medium hover:border-(--c-faint)"
          >
            Všechny soutěže
            <span className="rounded-md bg-(--c-raised) px-1.5 text-[11px] tabular-nums text-(--c-muted)">{leagues.length}</span>
            <span aria-hidden>{open ? "▴" : "▾"}</span>
          </button>
        )}
      </div>

      {showAll && open && (
        <div className="mt-3 rounded-2xl border border-(--c-line) bg-(--c-surface) p-3 shadow-lg">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Hledat ligu nebo zemi…"
            aria-label="Hledat ligu nebo zemi"
            className="w-full rounded-xl border border-(--c-line) bg-(--c-page) px-3 py-2 text-sm outline-none focus:border-(--c-accent)"
          />
          <div className="mt-2 max-h-80 overflow-y-auto pr-1">
            {groups.length === 0 && <p className="py-6 text-center text-sm text-(--c-muted)">Nic jsme nenašli.</p>}
            {groups.map(([country, ls]) => (
              <div key={country}>
                <p className="sticky top-0 z-10 flex items-center gap-2 bg-(--c-surface) px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">
                  <Flag country={ls[0].country} width={16} />
                  {country}
                </p>
                {ls.map((l) => {
                  const live = hasPitchData(l.id);
                  const n = l.round_count ?? l.match_count ?? 0;
                  const row = (
                    <>
                      <Logo league={l} size={26} soon={!live} />
                      <span className={`min-w-0 flex-1 truncate text-sm font-medium ${live ? "" : "text-(--c-faint)"}`}>{l.name}</span>
                      {live ? (
                        <span className="text-[11px] tabular-nums text-(--c-muted)">
                          {n} {plural(n, "zápas", "zápasy", "zápasů")}
                        </span>
                      ) : (
                        <Soon />
                      )}
                    </>
                  );
                  return (
                    <div key={l.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-(--c-raised)/60">
                      {live ? (
                        <Link
                          to={`${base}/${l.id}`}
                          onClick={() => {
                            rememberLeague(l.id);
                            setOpen(false);
                          }}
                          className="flex min-w-0 flex-1 items-center gap-2.5"
                        >
                          {row}
                        </Link>
                      ) : (
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">{row}</div>
                      )}
                      <button
                        type="button"
                        aria-label={pins.includes(l.id) ? `Odebrat ${l.name} z oblíbených` : `Přidat ${l.name} do oblíbených`}
                        aria-pressed={pins.includes(l.id)}
                        onClick={() => toggle(l.id)}
                        className={`px-1 text-base ${pins.includes(l.id) ? "text-amber-400" : "text-(--c-faint) hover:text-(--c-muted)"}`}
                      >
                        {pins.includes(l.id) ? "★" : "☆"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
