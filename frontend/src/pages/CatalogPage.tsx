import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useCatalogHub, useDataIndex } from "../lib/useData";
import { Pill } from "../components/ui";
import type { CatalogPlayerCard, CatalogRefereeCard, CatalogTeamCard } from "../types";

const CATALOG_LEAGUE_KEY = "ft-catalog-league";
type Tab = "teams" | "players" | "referees";

function rememberCatalogLeague(id: number) {
  try {
    localStorage.setItem(CATALOG_LEAGUE_KEY, String(id));
  } catch {
    /* ignore */
  }
}

function lastCatalogLeague(): number | null {
  try {
    const raw = localStorage.getItem(CATALOG_LEAGUE_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesQuery(hay: string, q: string): boolean {
  if (!q) return true;
  return norm(hay).includes(norm(q));
}

function Crest({ src, label }: { src?: string | null; label: string }) {
  if (src && !src.includes("placeholder")) {
    return <img src={src} alt="" className="h-10 w-10 object-contain shrink-0" />;
  }
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-300 light:bg-slate-200 light:text-slate-600 shrink-0">
      {label.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function CatalogPage() {
  const { index } = useDataIndex();
  const [params, setParams] = useSearchParams();
  const enabled = (index?.leagues || []).filter((l) => l.enabled);
  const defaultId = index?.default_league_id ?? 262;

  const leagueId = useMemo(() => {
    const fromQuery = Number(params.get("league"));
    if (fromQuery && enabled.some((l) => l.id === fromQuery)) return fromQuery;
    const saved = lastCatalogLeague();
    if (saved && enabled.some((l) => l.id === saved)) return saved;
    return enabled[0]?.id ?? defaultId;
  }, [params, enabled, defaultId]);

  const [tab, setTab] = useState<Tab>("teams");
  const [q, setQ] = useState("");
  const { data, error, missing } = useCatalogHub(leagueId);

  useEffect(() => {
    if (!leagueId) return;
    rememberCatalogLeague(leagueId);
    if (params.get("league") !== String(leagueId)) {
      setParams({ league: String(leagueId) }, { replace: true });
    }
  }, [leagueId, params, setParams]);

  const teams = useMemo(
    () =>
      (data?.teams || []).filter((t) => matchesQuery(`${t.name} ${t.short || ""} ${t.secondary || ""}`, q)),
    [data, q],
  );
  const players = useMemo(
    () =>
      (data?.players || []).filter((p) =>
        matchesQuery(`${p.name} ${p.team_name} ${p.position || ""} ${p.number ?? ""}`, q),
      ),
    [data, q],
  );
  const referees = useMemo(
    () => (data?.referees || []).filter((r) => matchesQuery(`${r.name} ${r.country || ""}`, q)),
    [data, q],
  );

  const onLeague = (id: number) => {
    setQ("");
    setParams({ league: String(id) }, { replace: true });
  };

  return (
    <div className="max-w-6xl mx-auto py-12 px-4 pt-20">
      <header className="mb-6">
        <div className="text-emerald-400 text-sm font-mono mb-1">KATALOG</div>
        <h1 className="text-2xl font-bold text-white light:text-slate-900">Datový katalog</h1>
        <p className="text-sm text-slate-500 light:text-slate-400 mt-1">
          Encyklopedie ligy — týmy, hráči a hlavní rozhodčí. Asistenti a VAR sem nepatří.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <label className="text-xs uppercase tracking-wide text-slate-500">Liga</label>
        <select
          value={leagueId}
          onChange={(e) => onLeague(Number(e.target.value))}
          className="rounded-lg border border-slate-700 bg-[#12161f] text-slate-100 text-sm px-3 py-2 light:bg-white light:border-slate-300 light:text-slate-800"
        >
          {enabled.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Hledat jméno, klub, pozici…"
          className="flex-1 min-w-[12rem] rounded-lg border border-slate-700 bg-[#12161f] text-slate-100 text-sm px-3 py-2 light:bg-white light:border-slate-300 light:text-slate-800"
        />
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        <Pill active={tab === "teams"} onClick={() => setTab("teams")}>
          Týmy ({teams.length})
        </Pill>
        <Pill active={tab === "players"} onClick={() => setTab("players")}>
          Hráči ({players.length})
        </Pill>
        <Pill active={tab === "referees"} onClick={() => setTab("referees")}>
          Rozhodčí ({referees.length})
        </Pill>
      </div>

      {error && <p className="text-rose-400">Adresář se nepodařilo načíst: {error}</p>}
      {missing && (
        <div className="card p-8 text-center text-slate-400 light:text-slate-500">
          Pro tuhle ligu ještě není stažený katalog. Objeví se po dalším ingestu.
        </div>
      )}
      {!data && !error && !missing && (
        <p className="text-slate-400 light:text-slate-500">Načítám katalog…</p>
      )}

      {data && tab === "teams" && (
        <TeamGrid items={teams} />
      )}
      {data && tab === "players" && <PlayerGrid items={players} />}
      {data && tab === "referees" && <RefereeGrid items={referees} leagueId={leagueId} />}
    </div>
  );
}

function TeamGrid({ items }: { items: CatalogTeamCard[] }) {
  if (items.length === 0) {
    return <Empty label="Žádný tým neodpovídá hledání." />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((t) => (
        <Link key={t.id} to={`/catalog/teams/${t.id}`} className="card catalog-tile p-4 flex items-center gap-3">
          <Crest src={t.image} label={t.short || t.name} />
          <div className="min-w-0">
            <div className="font-medium text-white light:text-slate-900 truncate">{t.name}</div>
            <div className="text-xs text-slate-500 truncate">{t.secondary || t.short || "—"}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function PlayerGrid({ items }: { items: CatalogPlayerCard[] }) {
  if (items.length === 0) {
    return <Empty label="Žádný hráč neodpovídá hledání." />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((p) => (
        <Link key={p.id} to={`/catalog/players/${p.id}`} className="card catalog-tile p-4 flex items-center gap-3">
          <Crest src={p.image} label={p.name} />
          <div className="min-w-0">
            <div className="font-medium text-white light:text-slate-900 truncate">{p.name}</div>
            <div className="text-xs text-slate-500 truncate">
              {p.team_name}
              {p.position ? ` · ${p.position}` : ""}
              {p.number != null ? ` · ${p.number}` : ""}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function RefereeGrid({ items, leagueId }: { items: CatalogRefereeCard[]; leagueId: number }) {
  if (items.length === 0) {
    return <Empty label="Žádný rozhodčí neodpovídá hledání." />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((r) => (
        <Link key={r.id} to={`/catalog/referees/${r.id}?league=${leagueId}`} className="card catalog-tile p-4 flex items-center gap-3">
          <Crest src={r.image} label={r.name} />
          <div className="min-w-0">
            <div className="font-medium text-white light:text-slate-900 truncate">{r.name}</div>
            <div className="text-xs text-slate-500 truncate">
              {r.in_league ? "V lize · hlavní" : "Země ligy"}
              {r.country ? ` · ${r.country}` : ""}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="card p-8 text-center text-slate-400 light:text-slate-500">{label}</div>
  );
}
