import { useMemo, useState } from "react";
import { Link } from "../i18n/router";
import { Back, Frame } from "../cat/kit";
import { GoalDistributionCard } from "../cat/GoalDistributionCard";
import { Card } from "../mc2/kit";
import { usePitchLeague } from "../lib/useData";
import { buildDistribution, type Bin, type GoalDistribution } from "../lib/goalDistribution";

const SLAVIA = 216;
const CHANCE = 262;

function heat(share: number, tone: "score" | "concede"): string {
  const a = Math.round(Math.min(52, 8 + share * 140));
  const c = tone === "score" ? "var(--c-accent)" : "var(--c-loss)";
  return `color-mix(in oklab, ${c} ${a}%, var(--c-raised))`;
}

function colRule(i: number): string {
  if (i === 3) return "border-l border-dashed border-(--c-line) pl-2";
  if (i === 6) return "border-l border-(--c-line) pl-2";
  return "";
}

function headLabel(b: Bin): string {
  if (b.id === "1h") return "1. p";
  if (b.id === "2h") return "2. p";
  return b.label;
}

function MiniCell({ bin, tone }: { bin: Bin; tone: "score" | "concede" }) {
  return (
    <div className="rounded-lg px-0.5 py-1.5 text-center text-[12px] font-semibold tabular-nums leading-none" style={{ background: heat(bin.share, tone) }}>
      {Math.round(bin.share * 100)}
    </div>
  );
}

function CompactCard({ d, team }: { d: GoalDistribution; team: string }) {
  const cols = [...d.scoredBins, ...d.scoredHalves];
  const n = d.scored || 1;
  const p = (x: number) => `${Math.round(x * 100)}\u00a0%`;
  return (
    <Card title="Kompaktní varianta (Lab)" lead={`Návrh na přehled týmu. Čísla v tabulce jsou %. ${team} · ${d.matches} zápasů.`}>
      <div className="overflow-x-auto">
        <div className="grid min-w-[36rem] grid-cols-[4.5rem_repeat(8,minmax(0,1fr))] items-center gap-1">
          <div />
          {cols.map((b, i) => (
            <div key={b.id} className={`pb-1 text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-(--c-faint) ${colRule(i)}`}>
              {headLabel(b)}
            </div>
          ))}
          <div className="pr-1 text-right text-[11px] font-medium text-(--c-muted)">Skóruje</div>
          {cols.map((b, i) => (
            <div key={b.id} className={colRule(i)}>
              <MiniCell bin={b} tone="score" />
            </div>
          ))}
          <div className="pr-1 text-right text-[11px] font-medium text-(--c-muted)">Inkasuje</div>
          {[...d.concededBins, ...d.concededHalves].map((b, i) => (
            <div key={b.id} className={colRule(i)}>
              <MiniCell bin={b} tone="concede" />
            </div>
          ))}
          <div className="pr-1 text-right text-[10px] text-(--c-faint)">ø liga</div>
          {cols.map((b, i) => (
            <div key={b.id} className={`text-center text-[10px] tabular-nums text-(--c-faint) ${colRule(i)}`}>
              {Math.round(b.leagueShare * 100)}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-(--c-muted)">
        Ze hry {p(d.play / n)} · standardky {p(d.set / n)} · vápno {p(d.box / n)} · mimo {p(d.outside / n)}
        <span className="mx-2 text-(--c-line)">·</span>
        první {p(d.matches ? d.first / d.matches : 0)} · poslední {p(d.matches ? d.last / d.matches : 0)}
      </p>
    </Card>
  );
}

export function LabGoalDistributionPage() {
  const files = usePitchLeague(CHANCE);
  const [teamId, setTeamId] = useState(SLAVIA);
  const team = files?.find((f) => f.team?.id === teamId) ?? files?.[0];
  const d = useMemo(() => (team && files ? buildDistribution(team, files, "all") : null), [team, files]);

  return (
    <Frame wide>
      <Back to="/lab">Lab</Back>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-500">Sandbox · katalog týmu</p>
      <h1 className="mt-1 text-2xl font-bold">Distribuce gólů</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-(--c-muted)">
        Větší karta je stejná jako v katalogu týmu (záložka Statistiky, pod mapou střel). Kompaktní zůstává jen tady.
      </p>

      {!files && <p className="mt-10 text-center text-sm text-(--c-muted)">Načítám Chance Ligu…</p>}

      {team && files && (
        <>
          <div className="mt-5">
            <label className="text-xs text-(--c-muted)">
              Tým
              <select
                value={team.team?.id ?? teamId}
                onChange={(e) => setTeamId(Number(e.target.value))}
                className="ml-2 min-h-9 rounded-xl border border-(--c-line) bg-(--c-raised) px-3 text-xs font-medium text-(--c-text)"
              >
                {[...files]
                  .sort((a, b) => (a.team?.name ?? "").localeCompare(b.team?.name ?? "", "cs"))
                  .map((f) => (
                    <option key={f.team?.id} value={f.team?.id}>
                      {f.team?.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="mt-5 space-y-5">
            <GoalDistributionCard team={team} league={files} />
            {d && <CompactCard d={d} team={team.team?.name ?? ""} />}
          </div>
        </>
      )}

      <Link to="/catalog/teams/216?tab=stats" className="mt-6 inline-flex min-h-9 items-center text-[13px] text-(--c-accent) hover:underline">
        Katalog Slavie · statistiky →
      </Link>
    </Frame>
  );
}
