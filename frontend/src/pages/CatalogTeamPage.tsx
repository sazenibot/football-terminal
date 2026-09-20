import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCatalogExplorer, useCatalogTeam } from "../lib/useData";
import { CatalogNotFound } from "./CatalogNotFound";
import { CatalogTeamExplorer } from "../components/CatalogTeamExplorer";
import { EmptyNote, Metric, RecentList } from "../components/CatalogStats";
import { Pill, ResultBadge } from "../components/ui";
import { formatDate } from "../lib/format";
import type {
  CatalogProfileStat,
  CatalogSquadPlayer,
  CatalogTeamCoach,
  CatalogTeamDetail,
  CatalogUpcoming,
} from "../types";

const FDR_TILE: Record<number, string> = {
  1: "bg-emerald-500/15 ring-2 ring-emerald-400",
  2: "bg-emerald-500/10 ring-2 ring-emerald-500/70",
  3: "bg-amber-500/15 ring-2 ring-amber-400",
  4: "bg-orange-500/15 ring-2 ring-orange-400",
  5: "bg-rose-500/15 ring-2 ring-rose-400",
};

const FDR_NUM: Record<number, string> = {
  1: "bg-emerald-500 text-black",
  2: "bg-emerald-400 text-black",
  3: "bg-amber-400 text-black",
  4: "bg-orange-400 text-black",
  5: "bg-rose-500 text-white",
};

export function CatalogTeamPage() {
  const id = Number(useParams().id);
  const { data: team, error, missing } = useCatalogTeam(Number.isFinite(id) ? id : null);
  const { data: explorer } = useCatalogExplorer(team?.league_id ?? null);
  const [openRecent, setOpenRecent] = useState(false);
  const [profileTab, setProfileTab] = useState<ProfileGroup>("attack");

  if (missing) return <CatalogNotFound kind="tým" />;
  if (error) {
    return (
      <div className="max-w-6xl mx-auto py-12 px-4 text-rose-400">
        <Link to="/catalog" className="text-emerald-400 text-sm">
          ← katalog
        </Link>
        <p className="mt-4">{error}</p>
      </div>
    );
  }
  if (!team) {
    return <p className="max-w-6xl mx-auto py-16 px-4 text-slate-400">Načítám tým…</p>;
  }

  const overlay = team.overlay;
  const table = overlay?.table;
  const profile = overlay?.profile;
  const upcoming = team.upcoming || [];
  const coach = resolveCoach(team);

  return (
    <div className="max-w-6xl mx-auto py-12 px-4 pt-20 flex flex-col gap-6">
      <Link to={`/catalog?league=${team.league_id}`} className="text-emerald-400 text-sm w-fit">
        ← Datový katalog
      </Link>
      <header className="flex items-start gap-4">
        {team.image && <img src={team.image} alt="" className="h-16 w-16 shrink-0 object-contain mt-1" />}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-400/85">Profil týmu</p>
          <h1 className="text-3xl font-bold text-white light:text-slate-900 mt-1">{team.name}</h1>
          <p className="text-sm text-slate-400 light:text-slate-500 mt-1">
            {team.league_name}
            {overlay?.season_name ? ` · ${overlay.season_name}` : ""}
          </p>
        </div>
      </header>

      <section className="card p-5 grid md:grid-cols-2 gap-6 items-center">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 content-start">
          <IdentityField label="Zkratka" value={team.short} />
          <IdentityField label="Stadion" value={team.venue?.name} />
          <IdentityField label="Založeno" value={team.founded != null ? String(team.founded) : null} />
          <IdentityField label="Město" value={team.venue?.city} />
        </div>
        <CoachCard coach={coach} />
      </section>

      <section className="card p-5 ring-1 ring-emerald-500/15">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400">The Hook</p>
        <h2 className="text-lg font-semibold text-white light:text-slate-900 mt-1">AI herní styl</h2>
        <p className="text-[15px] leading-relaxed text-slate-200 light:text-slate-700 mt-2">{team.hook}</p>
        {overlay?.hook_kind === "mock" && (
          <p className="text-xs text-slate-500 mt-3">Mockup copy z návrhu. Definici Hook modelu doplníme později.</p>
        )}
      </section>

      <SquadBlock players={team.squad} />

      <section className="card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">FDR kalendář</p>
            <h2 className="text-lg font-semibold text-white light:text-slate-900 mt-1">Nadcházející zápasy</h2>
          </div>
          <FdrLegend />
        </div>
        <FdrStrip items={upcoming} />
      </section>

      <section className="card p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Tabulka a sezóna</p>
        <h2 className="text-lg font-semibold text-white light:text-slate-900 mt-1 mb-4">Aktuální soutěž</h2>
        {table ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Pozice" value={table.position != null ? `${table.position}.` : null} />
            <Metric label="Body" value={table.points} />
            <Metric label="Zápasy" value={table.played} />
            <Metric
              label="V–R–P"
              value={table.won != null ? `${table.won}–${table.drawn ?? 0}–${table.lost ?? 0}` : null}
            />
            <Metric
              label="Skóre"
              value={table.gf != null && table.ga != null ? `${table.gf}:${table.ga}` : null}
            />
            <div className="rounded-lg bg-slate-900/40 light:bg-slate-100 px-3 py-3 text-center col-span-2 md:col-span-1">
              <FormPills form={table.form} />
              <div className="text-xs text-slate-500 mt-1">Forma</div>
            </div>
          </div>
        ) : (
          <EmptyNote>Tabulku doplníme, až ji SportMonks pošle pro tuhle sezónu.</EmptyNote>
        )}
        {(overlay?.recent || []).length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setOpenRecent((v) => !v)}
              className="text-sm text-emerald-400 hover:underline"
            >
              {openRecent ? "Skrýt poslední zápasy" : `Zobrazit poslední zápasy (${overlay?.recent?.length})`}
            </button>
            {openRecent && (
              <div className="mt-3">
                <RecentList items={overlay?.recent || []} />
              </div>
            )}
          </div>
        )}
      </section>

      <section className="card p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Profil zápasu</p>
        <h2 className="text-lg font-semibold text-white light:text-slate-900 mt-1 mb-1">Sezónní průměry</h2>
        <p className="text-xs text-slate-500 mb-3">
          Pořadí mezi týmy aktuální ligy. Zelená 1.–5., žlutá do 10., červená spodní šestka.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {PROFILE_TABS.map((tab) => (
            <Pill key={tab.id} active={profileTab === tab.id} onClick={() => setProfileTab(tab.id)}>
              {tab.label}
            </Pill>
          ))}
        </div>
        {profile ? (
          profileStats(profile, profileTab).length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {profileStats(profile, profileTab).map((stat) => (
                <ProfileCard key={stat.key || stat.label} stat={stat} />
              ))}
            </div>
          ) : (
            <EmptyNote>Pro tento štítek zatím nemáme spočtené průměry.</EmptyNote>
          )
        ) : (
          <EmptyNote>Sezónní průměry ještě nejsou spočtené.</EmptyNote>
        )}
      </section>

      <CatalogTeamExplorer explorer={explorer} defaultTeamId={team.id} />
    </div>
  );
}

function FormPills({ form }: { form?: string | null }) {
  if (!form) return <div className="text-xl font-semibold text-white light:text-slate-900">—</div>;
  return (
    <div className="flex justify-center gap-1">
      {form.split("").map((ch, i) => (
        <ResultBadge key={`${ch}-${i}`} result={ch} />
      ))}
    </div>
  );
}

function rankTone(rank: number, size: number): string {
  if (rank <= 5) return "text-emerald-400";
  if (size > 0 && rank > size - 6) return "text-rose-400";
  return "text-amber-400";
}

function rankBar(rank: number, size: number): string {
  if (rank <= 5) return "bg-emerald-500";
  if (size > 0 && rank > size - 6) return "bg-rose-500";
  return "bg-amber-400";
}

type ProfileGroup = "attack" | "defense" | "discipline" | "setpiece";

const PROFILE_TABS: { id: ProfileGroup; label: string }[] = [
  { id: "attack", label: "Ofenzivní" },
  { id: "defense", label: "Defenzivní" },
  { id: "discipline", label: "Disciplína" },
  { id: "setpiece", label: "Standardní situace" },
];

const LEGACY_PROFILE_KEYS = ["shots", "sot", "corners", "possession", "fouls", "yellow"] as const;

function resolveCoach(team: CatalogTeamDetail): CatalogTeamCoach | null {
  if (team.coach?.name) return team.coach;
  if (team.overlay?.coach?.name) return team.overlay.coach;
  const era = team.overlay?.eras?.[0];
  if (!era?.coach_name) return null;
  return {
    id: era.coach_id,
    name: era.coach_name,
    start: era.from ? era.from.slice(0, 10) : null,
    image: null,
  };
}

function profileStats(
  profile: NonNullable<CatalogTeamDetail["overlay"]>["profile"],
  group: ProfileGroup,
): CatalogProfileStat[] {
  if (!profile) return [];
  if (profile.stats?.length) {
    return profile.stats.filter((s) => (s.group || "attack") === group && s.value != null);
  }
  if (group !== "attack" && group !== "discipline" && group !== "setpiece") return [];
  return LEGACY_PROFILE_KEYS.map((key) => profile[key])
    .filter((s): s is CatalogProfileStat => Boolean(s && s.value != null))
    .filter((s) => {
      if (group === "discipline") return s.label.toLowerCase().includes("faul") || s.label.toLowerCase().includes("žlut");
      if (group === "setpiece") return s.label.toLowerCase().includes("roh");
      return !s.label.toLowerCase().includes("faul") && !s.label.toLowerCase().includes("žlut") && !s.label.toLowerCase().includes("roh");
    });
}

function IdentityField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white light:text-slate-900">{value || "—"}</p>
    </div>
  );
}

function formatCoachSince(start?: string | null): string | null {
  if (!start) return null;
  const part = start.slice(0, 10);
  const [year, month, day] = part.split("-").map(Number);
  if (!year || !month || !day) return start;
  return `ve funkci od ${day}. ${month}. ${year}`;
}

function daysSince(start?: string | null): number | null {
  if (!start) return null;
  const [year, month, day] = start.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  const from = Date.UTC(year, month - 1, day);
  const now = new Date();
  const to = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

function csDays(n: number): string {
  if (n === 1) return "1 den";
  if (n >= 2 && n <= 4) return `${n} dny`;
  return `${n.toLocaleString("cs-CZ")} dní`;
}

function coachInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function CoachCard({ coach }: { coach?: CatalogTeamCoach | null }) {
  if (!coach?.name) {
    return <p className="text-sm text-slate-500 self-center">Hlavního trenéra SportMonks u tohoto klubu neposlal.</p>;
  }
  const photo = coach.image && !coach.image.includes("placeholder") ? coach.image : null;
  const days = daysSince(coach.start);
  return (
    <div className="flex items-center gap-4 rounded-xl bg-slate-900/40 light:bg-slate-100 px-4 py-3">
      {photo ? (
        <img src={photo} alt="" className="h-24 w-24 shrink-0 rounded-full object-cover ring-1 ring-white/10" />
      ) : (
        <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-3xl font-bold tracking-wide text-emerald-400 light:bg-emerald-500/10">
          {coachInitials(coach.name)}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Hlavní trenér</p>
        <p className="mt-1 text-xl font-bold text-white light:text-slate-900">{coach.name}</p>
        <p className="mt-1 text-sm text-slate-300 light:text-slate-600">
          {formatCoachSince(coach.start) || "datum začátku funkce neznáme"}
        </p>
        {days != null && <p className="text-sm text-slate-400">{csDays(days)}</p>}
      </div>
    </div>
  );
}

function ProfileCard({ stat }: { stat?: CatalogProfileStat }) {
  if (!stat) return null;
  const rank = stat.rank ?? null;
  const size = stat.league_size ?? 0;
  const width = rank != null && size > 0 ? Math.max(8, Math.round(((size - rank + 1) / size) * 100)) : 0;
  const tone = rank != null ? rankTone(rank, size) : "text-slate-400";
  const bar = rank != null ? rankBar(rank, size) : "bg-slate-600";
  return (
    <div className="rounded-xl bg-slate-900/40 light:bg-slate-100 px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xl font-semibold text-white light:text-slate-900">{stat.value ?? "—"}</span>
        <span className={`text-sm font-semibold ${tone}`}>
          {rank != null ? `${rank}. v lize` : "bez pořadí"}
        </span>
      </div>
      <div className="text-xs text-slate-400 mt-1">{stat.label}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">liga {stat.league_avg ?? "—"}</div>
      <div className="mt-3 h-2.5 rounded-full bg-slate-800 light:bg-slate-200 overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${width}%` }} />
      </div>
      {rank != null && size > 0 && (
        <p className={`mt-1.5 text-[11px] font-medium ${tone}`}>
          {rank}. z {size}
        </p>
      )}
    </div>
  );
}

function FdrLegend() {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">lehčí</span>
      <div className="flex gap-1">
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <span
            key={n}
            className={`flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold ${FDR_NUM[n]}`}
          >
            {n}
          </span>
        ))}
      </div>
      <span className="text-[10px] uppercase tracking-wider text-slate-500">těžší</span>
    </div>
  );
}

function FdrStrip({ items }: { items: CatalogUpcoming[] }) {
  if (items.length === 0) {
    return <EmptyNote>V kalendáři nic není.</EmptyNote>;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {items.map((fx) => {
        const rating = fx.fdr_rating ?? 0;
        const inner = (
          <div
            className={`flex flex-col items-center gap-2 rounded-2xl px-2 py-3 ${FDR_TILE[rating] || "bg-slate-900/40 ring-2 ring-white/15 light:bg-slate-100"}`}
          >
            {fx.opponent.image ? (
              <img src={fx.opponent.image} alt="" className="h-9 w-9 object-contain" />
            ) : (
              <span className="h-9 w-9 rounded-full bg-slate-800 light:bg-slate-200" />
            )}
            <p className="text-[11px] font-bold text-white light:text-slate-900">
              {(fx.opponent.name || "").replace(/\b(FC|FK|SK|AC|MFK)\b/gi, "").trim().slice(0, 3).toUpperCase() || "—"}
            </p>
            <p className="text-center text-[10px] leading-tight text-slate-400">
              {fx.starting_at ? formatDate(fx.starting_at) : "—"}
              <br />
              {fx.is_home ? "Doma" : "Venku"}
              {fx.opponent_position != null ? ` · ${fx.opponent_position}.` : ""}
            </p>
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${FDR_NUM[rating] || "bg-slate-600 text-white"}`}
            >
              {rating || "—"}
            </span>
          </div>
        );
        return fx.has_match_page ? (
          <Link key={fx.fixture_id} to={`/match/${fx.fixture_id}`}>
            {inner}
          </Link>
        ) : (
          <div key={fx.fixture_id}>{inner}</div>
        );
      })}
    </div>
  );
}

const SQUAD_PREVIEW = 4;

function SquadBlock({ players }: { players: CatalogSquadPlayer[] }) {
  const active = players.filter((p) => p.status !== "loan" && p.status !== "left");
  const groups = groupSquad(active);
  return (
    <section className="card p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Soupiska</p>
      <h2 className="text-lg font-semibold text-white light:text-slate-900 mt-1">
        Aktuální kádr · {active.length} hráčů
      </h2>
      <p className="text-xs text-slate-500 mb-4">Bez hráčů na hostování a bez těch, kteří už klub opustili.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groups.map((g) => (
          <SquadGroup key={g.label} label={g.label} players={g.players} />
        ))}
      </div>
    </section>
  );
}

function SquadGroup({ label, players }: { label: string; players: CatalogSquadPlayer[] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? players : players.slice(0, SQUAD_PREVIEW);
  const hidden = players.length - shown.length;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400/85 mb-2">
        {label}
        <span className="ml-1.5 text-slate-500">{players.length}</span>
      </p>
      <ul className="flex flex-col gap-1.5">
        {shown.map((p) => (
          <li key={p.id}>
            <Link
              to={`/catalog/players/${p.id}`}
              className="flex items-center gap-2.5 rounded-lg bg-slate-900/40 light:bg-slate-100 px-2.5 py-1.5 hover:ring-1 hover:ring-emerald-500/40"
            >
              <span className="w-6 text-center text-xs text-slate-500">{p.number ?? "–"}</span>
              {p.image && !p.image.includes("placeholder") ? (
                <img src={p.image} alt="" className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 light:bg-slate-200 text-[10px] font-bold">
                  {p.name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white light:text-slate-900">
                {p.name}
                {p.captain ? <span className="ml-1.5 text-[10px] text-amber-400">C</span> : null}
              </p>
              <span className="text-[11px] tabular-nums text-slate-500">
                {p.season?.appearances != null ? `${p.season.appearances} z` : "0 z"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button type="button" onClick={() => setOpen(true)} className="mt-1.5 text-xs text-emerald-400 hover:underline">
          Zobrazit další {hidden}
        </button>
      )}
      {open && players.length > SQUAD_PREVIEW && (
        <button type="button" onClick={() => setOpen(false)} className="mt-1.5 text-xs text-slate-500 hover:underline">
          Méně
        </button>
      )}
    </div>
  );
}

function groupSquad(players: CatalogSquadPlayer[]): { label: string; players: CatalogSquadPlayer[] }[] {
  const labels = ["Brankáři", "Obránci", "Záložníci", "Útočníci", "Ostatní"];
  const buckets: CatalogSquadPlayer[][] = [[], [], [], [], []];
  for (const p of players) {
    const rank =
      p.position_id === 24 ? 0 : p.position_id === 25 ? 1 : p.position_id === 26 ? 2 : p.position_id === 27 ? 3 : 4;
    buckets[rank].push(p);
  }
  for (const group of buckets) {
    group.sort((a, b) => (b.season?.appearances ?? 0) - (a.season?.appearances ?? 0) || a.name.localeCompare(b.name));
  }
  return buckets.map((group, i) => ({ label: labels[i], players: group })).filter((g) => g.players.length > 0);
}
