import { useMemo, useState } from "react";
import type { PitchCatalogFile } from "../components/PitchCards";
import { Card, Info, Seg, Stat } from "../mc2/kit";
import { t } from "../i18n/locale";
import { buildDistribution, type Bin, type GoalDistribution, type Venue } from "../lib/goalDistribution";

function pct(n: number): string {
  return t("fmt.pct", { n: Math.round(n * 100) });
}

function goalsWord(n: number): string {
  return t("ct.gd.goals", { n });
}

function heat(share: number, tone: "score" | "concede"): string {
  const a = Math.round(Math.min(52, 8 + share * 140));
  const c = tone === "score" ? "var(--c-accent)" : "var(--c-loss)";
  return `color-mix(in oklab, ${c} ${a}%, var(--c-raised))`;
}

function headLabel(b: Bin): string {
  if (b.id === "1h") return t("ct.gd.h1");
  if (b.id === "2h") return t("ct.gd.h2");
  return b.label;
}

function SectionTitle({ label }: { label: string }) {
  return (
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">
      {label} <span className="font-medium normal-case tracking-normal">({t("ct.gd.byMinute")})</span>
      <Info>{t("ct.gd.avgInfo")}</Info>
    </h3>
  );
}

function Cell({ bin, tone }: { bin: Bin; tone: "score" | "concede" }) {
  return (
    <div className="rounded-xl px-1.5 py-2.5 text-center" style={{ background: heat(bin.share, tone) }}>
      <div className="text-[18px] font-bold tabular-nums leading-none">{pct(bin.share)}</div>
      <div className="mt-1 text-[11px] tabular-nums text-(--c-muted)">{goalsWord(bin.n)}</div>
      <div className="mt-0.5 text-[10px] tabular-nums text-(--c-faint)">ø {pct(bin.leagueShare)}</div>
    </div>
  );
}

function Col({ bin, tone, rule }: { bin: Bin; tone: "score" | "concede"; rule?: string }) {
  return (
    <div className={`min-w-0 ${rule ?? ""}`}>
      <div className="mb-1 whitespace-nowrap text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-(--c-faint)">{headLabel(bin)}</div>
      <Cell bin={bin} tone={tone} />
    </div>
  );
}

function TimeGrid({ bins, halves, tone }: { bins: Bin[]; halves: Bin[]; tone: "score" | "concede" }) {
  return (
    <div className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-8">
      {bins.map((b, i) => (
        <Col key={b.id} bin={b} tone={tone} rule={i === 3 ? "sm:border-l sm:border-dashed sm:border-(--c-line) sm:pl-2" : undefined} />
      ))}
      <div className="col-span-3 grid grid-cols-2 gap-2 sm:contents">
        {halves.map((b, i) => (
          <Col key={b.id} bin={b} tone={tone} rule={i === 0 ? "sm:border-l sm:border-(--c-line) sm:pl-2" : undefined} />
        ))}
      </div>
    </div>
  );
}

function Origin({ d }: { d: GoalDistribution }) {
  const n = d.scored || 1;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat value={pct(d.play / n)} label={t("ct.gd.play")} sub={goalsWord(d.play)} />
      <Stat value={pct(d.set / n)} label={t("ct.gd.set")} sub={goalsWord(d.set)} />
      <Stat value={pct(d.box / n)} label={t("ct.gd.box")} sub={goalsWord(d.box)} />
      <Stat value={pct(d.outside / n)} label={t("ct.gd.outside")} sub={goalsWord(d.outside)} />
    </div>
  );
}

export function GoalDistributionCard({ team, league }: { team: PitchCatalogFile; league: PitchCatalogFile[] }) {
  const [venue, setVenue] = useState<Venue>("all");
  const d = useMemo(() => buildDistribution(team, league, venue), [team, league, venue]);
  if (!d.matches) return null;
  const name = team.team?.name ?? "";

  return (
    <Card
      title={t("ct.gd.title")}
      lead={`${name} · ${t("ct.nMatches", { n: d.matches })} · ${t("ct.gd.leadCounts", { scored: d.scored, conceded: d.conceded })}`}
      aside={
        <div className="w-full sm:w-auto">
          <Seg
            label={t("ct.pv.venueAria")}
            value={venue}
            onChange={setVenue}
            options={[
              { id: "all", label: t("ct.gd.all") },
              { id: "home", label: t("ct.pv.home") },
              { id: "away", label: t("ct.pv.away") },
            ]}
          />
        </div>
      }
    >
      <div className="space-y-6">
        <div>
          <SectionTitle label={t("ct.gd.whenScores")} />
          <TimeGrid bins={d.scoredBins} halves={d.scoredHalves} tone="score" />
        </div>
        <div>
          <SectionTitle label={t("ct.gd.whenConcedes")} />
          <TimeGrid bins={d.concededBins} halves={d.concededHalves} tone="concede" />
        </div>
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">{t("ct.gd.origin")}</h3>
          <Origin d={d} />
        </div>
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">{t("ct.gd.order")}</h3>
          <div className="grid grid-cols-2 gap-2">
            <Stat value={pct(d.matches ? d.first / d.matches : 0)} label={t("ct.gd.first")} sub={t("ct.gd.ofMatches", { k: d.first, n: d.matches })} />
            <Stat value={pct(d.matches ? d.last / d.matches : 0)} label={t("ct.gd.last")} sub={t("ct.gd.ofMatches", { k: d.last, n: d.matches })} />
          </div>
        </div>
      </div>
    </Card>
  );
}
