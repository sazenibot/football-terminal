import { useMemo, useState, type ReactNode } from "react";
import { Link } from "../i18n/router";
import { last5BadgeForTeam } from "../lib/xgEfficiency";
import { hasSimV2 } from "../lib/pitchMatch";
import { useLeagueRound, useMatch, useSimV2, useTeamColors, useXgotIndex } from "../lib/useData";
import { buildPrediction, kickoffLabel } from "../mc2/derive";
import { AiCard, FormMini, H2HMini, InsightsCard, OverviewTab, RefereeMini } from "../mc2/Overview";
import { PlayerTrendsCard } from "../mc2/PlayerTrends";
import { PredictionSummary } from "../mc2/Prediction";
import { Card, ProbBar, Seg, TeamLogo } from "../mc2/kit";
import type { RoundFixture, TeamBrief } from "../types";
import { fmtTime, fmtWeekdayDate } from "../lib/format";
import { t } from "../i18n/locale";
import { Whistle } from "./MatchListPage";

/* Náhledy k audit ID 10 a 26. Jen Lab (npm run dev). Produkce se nemění, dokud Petr neschválí. */

const NEUTRAL = "#6b7280";
type Fav = "home" | "away" | "none";
type CardLook = "now" | "proposed";
type DetailLook = "now" | "proposed";

function favourite(p?: [number, number, number]): Fav {
  if (!p) return "none";
  const [h, , a] = p;
  if (h >= 45 && h >= a) return "home";
  if (a >= 45 && a > h) return "away";
  return "none";
}

function DemoCard({ f, colors, look }: { f: RoundFixture; colors: Record<string, string>; look: CardLook }) {
  const ready = f.has_full_data !== false;
  const time = fmtTime(f.starting_at);
  const live = kickoffLabel(f.starting_at).live;
  const probs = f.signals?.probs;
  const fav = look === "proposed" ? favourite(probs) : "none";
  const homeColor = colors[f.home.id] ?? NEUTRAL;
  const awayColor = colors[f.away.id] ?? NEUTRAL;
  const nameCls = (side: "home" | "away") => {
    if (look !== "proposed") return "w-full truncate text-[14px] font-semibold";
    if (fav === side) return "w-full truncate text-[14px] font-bold";
    if (fav === "none") return "w-full truncate text-[14px] font-semibold";
    return "w-full truncate text-[14px] font-medium text-(--c-muted)";
  };
  const pctCls = (side: Fav) => {
    const on = look === "proposed" && fav === side;
    return `tabular-nums ${on ? "font-bold" : ""}`;
  };
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-(--c-line) bg-(--c-surface) ${ready ? "" : "opacity-70"}`}>
      <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 opacity-25" style={{ background: homeColor }} />
      <span aria-hidden className="absolute inset-y-0 right-0 w-0.5 opacity-25" style={{ background: awayColor }} />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-(--c-raised)/70 px-4 py-1.5">
        <span aria-hidden />
        <div className="flex items-baseline justify-center gap-2">
          <span className="text-[13px] font-bold tabular-nums">{time}</span>
          {live && <span className="text-[11px] font-semibold uppercase text-(--c-loss)">{t("list.live")}</span>}
        </div>
        <div className="flex justify-end text-(--c-muted)">{f.signals?.referee ? <Whistle /> : null}</div>
      </div>
      <div className="px-5 py-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <TeamBlock team={f.home} className={nameCls("home")} />
          <span aria-hidden className="text-xs font-semibold text-(--c-faint)">
            vs
          </span>
          <TeamBlock team={f.away} className={nameCls("away")} />
        </div>
        {probs && (
          <div className="mt-3">
            <ProbBar home={probs[0]} draw={probs[1]} away={probs[2]} height={6} />
            <div className="mt-1 grid grid-cols-3 text-xs">
              <span className={pctCls("home")} style={{ color: "var(--c-home)" }}>
                {t("fmt.pct", { n: probs[0] })}
              </span>
              <span className="text-center text-(--c-faint)">{t("fmt.pct", { n: probs[1] })}</span>
              <span className={`text-right ${pctCls("away")}`} style={{ color: "var(--c-away)" }}>
                {t("fmt.pct", { n: probs[2] })}
              </span>
            </div>
            {look === "proposed" && (
              <div className="mt-0.5 grid grid-cols-3 text-[11px] font-semibold uppercase tracking-wide text-(--c-faint)">
                <span>D</span>
                <span className="text-center">R</span>
                <span className="text-right">H</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TeamBlock({ team, className }: { team: TeamBrief; className: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      <TeamLogo team={team} size={32} />
      <span className={className}>{team.name}</span>
    </div>
  );
}

function Legend({ sticky }: { sticky: boolean }) {
  return (
    <div
      className={`${sticky ? "sticky top-16 z-20 " : ""}mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl border border-(--c-line) bg-(--c-surface)/95 px-4 py-2.5 text-[12px] text-(--c-muted) backdrop-blur`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">{t("list.legend")}</span>
      <span>
        <b className="text-(--c-text)">D</b> domácí
      </span>
      <span>
        <b className="text-(--c-text)">R</b> remíza
      </span>
      <span>
        <b className="text-(--c-text)">H</b> hosté
      </span>
      <span>tučné jméno = favorit modelu</span>
      <span className="inline-flex items-center gap-1.5">
        <Whistle />
        rozhodčí
      </span>
    </div>
  );
}

function CardGrid({ rows, colors, look }: { rows: RoundFixture[]; colors: Record<string, string>; look: CardLook }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((f) => (
        <DemoCard key={f.fixture_id} f={f} colors={colors} look={look} />
      ))}
    </div>
  );
}

function TabsBar() {
  const items = ["Přehled", "Predikce", "Forma", "Statistiky", "Sestavy", "Rozhodčí"];
  return (
    <div className="flex gap-1 overflow-hidden rounded-2xl border border-(--c-line) bg-(--c-surface) p-1">
      {items.map((label, i) => (
        <span
          key={label}
          className={`min-h-10 min-w-0 flex-1 truncate rounded-xl px-2 text-center text-[12px] font-semibold leading-10 sm:px-3 sm:text-[13px] ${
            i === 0 ? "bg-(--c-accent) text-(--c-on-accent)" : "text-(--c-muted)"
          }`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function HeroLite({
  home,
  away,
  league,
  venue,
  startingAt,
}: {
  home: TeamBrief;
  away: TeamBrief;
  league?: string;
  venue?: string | null;
  startingAt: string;
}) {
  const k = kickoffLabel(startingAt);
  const d = new Date(startingAt);
  const side = (tm: TeamBrief, which: "home" | "away") => (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <TeamLogo team={tm} size={56} />
      <div className="text-[15px] font-bold leading-tight sm:text-xl" style={{ overflowWrap: "anywhere" }}>
        {tm.name}
      </div>
      <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: which === "home" ? "var(--c-home)" : "var(--c-away)" }}>
        {which === "home" ? t("mc.side.home") : t("mc.side.away")}
      </div>
    </div>
  );
  return (
    <header className="rounded-2xl border border-(--c-line) bg-(--c-surface) px-4 py-5 sm:px-6">
      <div className="mb-4 text-center text-xs text-(--c-muted)">
        {league}
        {venue ? ` · ${venue}` : ""}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 sm:gap-6">
        {side(home, "home")}
        <div className="flex flex-col items-center gap-1.5 pt-1 text-center">
          <div className="text-xs capitalize text-(--c-muted)">{fmtWeekdayDate(d)}</div>
          <div className="text-2xl font-bold leading-none tabular-nums sm:text-3xl">{fmtTime(d)}</div>
          <span
            className="mt-1 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{
              color: k.live ? "var(--c-loss)" : "var(--c-accent)",
              background: `color-mix(in oklab, ${k.live ? "var(--c-loss)" : "var(--c-accent)"} 14%, transparent)`,
            }}
          >
            {k.text}
          </span>
        </div>
        {side(away, "away")}
      </div>
    </header>
  );
}

function DesktopStage({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-(--c-line) bg-(--c-raised)/35 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-(--c-faint)">{caption}</p>
      <div className="rounded-xl bg-(--c-page) p-3 sm:p-4">{children}</div>
    </div>
  );
}

function DetailNow({ children }: { children: ReactNode }) {
  return (
    <DesktopStage caption="Teď · max-w-4xl (~896 px) uprostřed širokého desktopu">
      <div className="mx-auto max-w-4xl space-y-4">{children}</div>
    </DesktopStage>
  );
}

function DetailProposed({ children }: { children: ReactNode }) {
  return (
    <DesktopStage caption="Návrh · max-w-6xl (stejně jako homepage) · vlevo text, vpravo data">
      <div className="mx-auto max-w-6xl space-y-4">{children}</div>
    </DesktopStage>
  );
}

export function LabUxPreviewPage() {
  const { data } = useLeagueRound(262);
  const colors = useTeamColors();
  const rows = useMemo(() => (data?.round ?? []).slice(0, 4), [data]);
  const fid = rows.find((f) => f.has_full_data !== false)?.fixture_id ?? rows[0]?.fixture_id ?? null;
  const { match: m } = useMatch(fid);
  const xgotIndex = useXgotIndex();
  const sim = useSimV2(m && hasSimV2(m.league_id) ? m.fixture_id : null);
  const [cardLook, setCardLook] = useState<CardLook>("proposed");
  const [sticky, setSticky] = useState(false);
  const [detailLook, setDetailLook] = useState<DetailLook>("proposed");

  const badges = m ? { home: last5BadgeForTeam(xgotIndex, m.home.id), away: last5BadgeForTeam(xgotIndex, m.away.id) } : { home: null, away: null };
  const p = m ? buildPrediction(m, sim) : null;
  const noop = () => {};

  return (
    <div className="mc2 mx-auto max-w-7xl px-4 pb-16 pt-20">
      <Link to="/lab" className="inline-flex min-h-9 items-center text-[13px] text-(--c-accent) hover:underline">
        ← Lab
      </Link>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-500">Sandbox · neschváleno</p>
      <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Náhledy z UX auditu</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-(--c-muted)">
        ID 10 a 26. Produkční stránky se nemění. Data jsou skutečná (Chance Liga). Na desktopu otevřete okno aspoň na 1200 px.
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">ID 26 · Karta zápasu</h2>
        <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-(--c-muted)">
          Pod lištou jsou dnes tři procenta bez popisku. Návrh: favorit tučně, pod čísla D / R / H a vysvětlivka nad výpisem (volitelně přilepená při scrollu).
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Seg
            label="Podoba karty"
            value={cardLook}
            onChange={setCardLook}
            options={[
              { id: "now", label: "Teď" },
              { id: "proposed", label: "Návrh" },
            ]}
          />
          {cardLook === "proposed" && (
            <label className="inline-flex min-h-10 items-center gap-2 text-[13px]">
              <input type="checkbox" checked={sticky} onChange={(e) => setSticky(e.target.checked)} className="size-4 accent-(--c-accent)" />
              Přilepit vysvětlivku
            </label>
          )}
        </div>
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 rounded-3xl border border-(--c-line) bg-(--c-page) p-3 sm:p-4">
            {cardLook === "proposed" && <Legend sticky={sticky} />}
            {rows.length ? <CardGrid rows={rows} colors={colors} look={cardLook} /> : <p className="py-10 text-center text-(--c-muted)">Načítám zápasy…</p>}
          </div>
          <aside className="text-[13px] leading-relaxed text-(--c-muted)">
            <Card title={cardLook === "now" ? "Co je špatně" : "Co se mění"}>
              {cardLook === "now" ? (
                <ul className="list-disc space-y-1.5 pl-4">
                  <li>Obě jména stejně tučně, favorit nejde poznat bez čtení čísel.</li>
                  <li>7 / 14 / 79 % bez D, R, H. Vysvětlení je až pod všemi dny.</li>
                </ul>
              ) : (
                <ul className="list-disc space-y-1.5 pl-4">
                  <li>Favorit je tučně, druhý tým slabší.</li>
                  <li>Pod procenty je D / R / H.</li>
                  <li>Vysvětlivka je nad kartami, ne pod čtyřmi dny zápasů.</li>
                </ul>
              )}
            </Card>
          </aside>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-lg font-semibold">ID 10 · Detail zápasu na desktopu</h2>
        <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-(--c-muted)">
          Dnes je Přehled jeden úzký sloupec. Návrh: širší kontejner (jako homepage) a dva sloupce — vlevo predikce, postřehy a AI, vpravo trendy pod sebou, forma, H2H a rozhodčí. Na mobilu zůstane jeden sloupec.
        </p>
        <div className="mt-4">
          <Seg
            label="Rozvržení Přehledu"
            value={detailLook}
            onChange={setDetailLook}
            options={[
              { id: "now", label: "Teď" },
              { id: "proposed", label: "Návrh" },
            ]}
          />
        </div>
        <div className="mt-4">
          {!m || !p ? (
            <p className="py-10 text-center text-(--c-muted)">Načítám zápas…</p>
          ) : detailLook === "now" ? (
            <DetailNow>
              <HeroLite home={m.home} away={m.away} league={m.league_name} venue={m.venue} startingAt={m.starting_at} />
              <TabsBar />
              <OverviewTab m={m} p={p} badges={badges} go={noop} />
            </DetailNow>
          ) : (
            <DetailProposed>
              <HeroLite home={m.home} away={m.away} league={m.league_name} venue={m.venue} startingAt={m.starting_at} />
              <TabsBar />
              <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                <div className="space-y-5">
                  <PredictionSummary p={p} home={m.home} away={m.away} onMore={noop} />
                  <InsightsCard m={m} p={p} badges={badges} />
                  <AiCard m={m} />
                </div>
                <div className="space-y-5">
                  <PlayerTrendsCard m={m} stack />
                  <FormMini m={m} onMore={noop} />
                  <H2HMini m={m} onMore={noop} />
                  <RefereeMini m={m} onMore={noop} />
                </div>
              </div>
            </DetailProposed>
          )}
        </div>
      </section>
    </div>
  );
}
