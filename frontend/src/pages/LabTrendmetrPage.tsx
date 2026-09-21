import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

type Team = {
  id: number;
  name: string;
  short: string;
  image: string | null;
};

type Metric = {
  key: string;
  name: string;
  line: number | null;
};

type Side = {
  label: string;
  note: string;
  cases: number;
  metrics: Metric[];
};

type CardData = {
  title: string;
  subtitle: string;
  league: string;
  excluded_note: string;
  teams: { home: Team; away: Team };
  sides: Side[];
};

type CardMetric = {
  key: string;
  short: string;
  name: string;
};

type Leg = {
  sideKey: string;
  metricKey: string;
  team: string;
  short: string;
  metric: string;
  line: number;
};

const CARD_METRICS: CardMetric[] = [
  { key: "shots", short: "Střely", name: "Střely" },
  { key: "sot", short: "Na branku", name: "Střely na branku" },
  { key: "corners", short: "Rohy", name: "Rohy získané" },
  { key: "fouls", short: "Fauly", name: "Fauly způsobené" },
  { key: "offsides", short: "Ofsajdy", name: "Ofsajdy" },
];

function metricByKey(side: Side, key: string): Metric | undefined {
  return side.metrics.find((m) => m.key === key);
}

function overLabel(line: number): string {
  return `${String(line - 0.5).replace(".", ",")}+`;
}

export function LabTrendmetrPage() {
  const [data, setData] = useState<CardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Leg[]>([]);

  useEffect(() => {
    fetch("/data/lab/trendmetr-slavia-plzen.json")
      .then((r) => {
        if (!r.ok) throw new Error("Soubor Trendmetru chybí.");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    return [
      { team: data.teams.home, side: data.sides[0], role: "doma" },
      { team: data.teams.away, side: data.sides[1], role: "venku" },
    ].filter((row) => row.side);
  }, [data]);

  function toggle(leg: Leg) {
    setPicked((prev) => {
      const same = prev.find((p) => p.sideKey === leg.sideKey && p.metricKey === leg.metricKey);
      if (same) return prev.filter((p) => p !== same);
      return [...prev, leg];
    });
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 pt-20 text-rose-400">
        <Link to="/lab" className="text-amber-400 text-sm">
          ← Lab
        </Link>
        <p className="mt-4">{error}</p>
      </div>
    );
  }

  if (!data) {
    return <p className="max-w-4xl mx-auto py-16 px-4 pt-20 text-slate-400">Načítám Trendmetr…</p>;
  }

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 pt-20 flex flex-col gap-6">
      <Link to="/lab" className="text-amber-400 text-sm w-fit">
        ← Lab
      </Link>

      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-400">Lab · ukázka karty</p>
        <h1 className="text-3xl font-bold text-white light:text-slate-900 mt-1">Trendmetr</h1>
        <p className="text-sm text-slate-400 light:text-slate-500 mt-1">
          {data.subtitle} · {data.league}
        </p>
        <p className="mt-3 text-sm text-slate-300 light:text-slate-600 max-w-2xl">
          Tak by karta seděla v detailu zápasu před výkopem. Čipy jdou skládat do builderu.
        </p>
      </header>

      <article className="card overflow-hidden">
        <div className="px-4 pt-4 pb-3 md:px-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400">Trendmetr</p>
          <p className="text-sm text-slate-400 light:text-slate-500 mt-0.5">Ideální tipy do betbuilder</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500 border-y border-slate-800 light:border-slate-200">
                <th className="text-left font-medium pl-4 md:pl-5 pr-3 py-2 w-[11rem]">Tým</th>
                {CARD_METRICS.map((col) => (
                  <th key={col.key} className="font-medium text-center px-1.5 py-2">
                    {col.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ team, side, role }) => (
                <tr key={team.id} className="border-b border-slate-800/80 light:border-slate-200 last:border-b-0">
                  <td className="pl-4 md:pl-5 pr-3 py-3 align-middle">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {team.image ? (
                        <img src={team.image} alt="" className="h-8 w-8 object-contain shrink-0" />
                      ) : null}
                      <div className="min-w-0">
                        <p className="font-semibold text-white light:text-slate-900 truncate">{team.name}</p>
                        <p className="text-[11px] text-slate-500">{role}</p>
                      </div>
                    </div>
                  </td>
                  {CARD_METRICS.map((col) => {
                    const metric = metricByKey(side, col.key);
                    const line = metric?.line != null && metric.line >= 1 ? metric.line : null;
                    const selected = picked.some((p) => p.sideKey === String(team.id) && p.metricKey === col.key);
                    if (line == null) {
                      return (
                        <td key={col.key} className="px-1.5 py-3 text-center align-middle">
                          <div className="mx-auto w-[5rem] rounded-lg border border-dashed border-slate-800 light:border-slate-200 px-2 py-2 text-slate-600 light:text-slate-400">
                            —
                          </div>
                        </td>
                      );
                    }
                    return (
                      <td key={col.key} className="px-1.5 py-3 text-center align-middle">
                        <button
                          type="button"
                          onClick={() =>
                            toggle({
                              sideKey: String(team.id),
                              metricKey: col.key,
                              team: team.name,
                              short: team.short,
                              metric: col.name,
                              line,
                            })
                          }
                          className={`mx-auto w-[5rem] rounded-lg border px-2 py-2 tabular-nums font-semibold transition-colors ${
                            selected
                              ? "border-emerald-400 bg-emerald-500/15 text-emerald-300 light:text-emerald-700"
                              : "border-slate-700 bg-slate-800/70 text-white hover:border-amber-400 light:border-slate-300 light:bg-slate-50 light:text-slate-900"
                          }`}
                        >
                          {overLabel(line)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 md:px-5 py-3 border-t border-slate-800 light:border-slate-200 bg-slate-950/40 light:bg-slate-50">
          {picked.length === 0 ? (
            <p className="text-xs text-slate-500">Klikni na nohu. Tady by se skládal builder.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mr-1">Builder</p>
              {picked.map((leg) => (
                <button
                  key={`${leg.sideKey}-${leg.metricKey}`}
                  type="button"
                  onClick={() => toggle(leg)}
                  className="rounded-md bg-emerald-500/15 border border-emerald-400/50 px-2 py-1 text-xs text-emerald-300 light:text-emerald-800"
                >
                  {leg.short} {leg.metric.toLowerCase()} {overLabel(leg.line)}
                </button>
              ))}
            </div>
          )}
        </div>
      </article>

      <section className="grid gap-3 sm:grid-cols-2">
        {rows.map(({ team, side }) => (
          <div key={team.id} className="card p-4">
            <p className="text-sm font-semibold text-white light:text-slate-900">{side.label}</p>
            <p className="text-xs text-slate-400 light:text-slate-500 mt-1">{side.note}</p>
            <p className="text-[11px] text-slate-500 mt-2">{side.cases} zápasů ve vzorku.</p>
          </div>
        ))}
      </section>

      <p className="text-xs text-slate-500 max-w-2xl">{data.excluded_note}</p>
    </div>
  );
}
