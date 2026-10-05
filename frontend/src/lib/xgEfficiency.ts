export const XGOT_BADGE_MIN = 5;
export const XGOT_BADGE_PCT = 20;

export type XgotWindow = "season" | "last5";

export type XgotBadge = {
  id: "lucky_scoring_team" | "unlucky_finishing_team";
  label: string;
  tooltip: string;
  efficiency_pct: number;
  window: XgotWindow;
};

export type XgotTotals = {
  goals: number;
  xgot: number;
  matches?: number;
};

export type XgotTeamRow = {
  name: string;
  season: XgotTotals;
  last5: XgotTotals;
};

export type XgotIndex = {
  league_id: number;
  season: string;
  source: string;
  teams: Record<string, XgotTeamRow>;
};

function pct1(n: number): string {
  return n.toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function windowPhrase(window: XgotWindow): string {
  return window === "last5" ? "v posledních 5 zápasech" : "v této sezóně";
}

/** Stateless: ze součtů gólů a xGOT vrátí štítek, nebo nic. */
export function xgotEfficiencyBadge(goals: number, xgot: number, window: XgotWindow = "season"): XgotBadge | null {
  if (xgot < XGOT_BADGE_MIN) return null;
  const efficiency_pct = (goals / xgot - 1) * 100;
  if (efficiency_pct >= XGOT_BADGE_PCT) {
    return {
      id: "lucky_scoring_team",
      label: "Šťastně skórující mužstvo",
      tooltip: `Tento tým dává ${windowPhrase(window)} o ${pct1(efficiency_pct)} % více gólů, než odpovídá kvalitě jejich střel na bránu (xGOT). Proměňuje i těžké šance nebo těží z chyb brankářů.`,
      efficiency_pct,
      window,
    };
  }
  if (efficiency_pct <= -XGOT_BADGE_PCT) {
    return {
      id: "unlucky_finishing_team",
      label: "Smolní paliči šancí",
      tooltip: `Tento tým dává ${windowPhrase(window)} o ${pct1(Math.abs(efficiency_pct))} % méně gólů, než odpovídá kvalitě jejich střel na bránu (xGOT). Dlouhodobě zaostává za očekáváním.`,
      efficiency_pct,
      window,
    };
  }
  return null;
}

export function goalUnit(n: number): string {
  const a = Math.abs(n);
  if (Math.abs(a - Math.round(a)) > 0.001) return "gólu";
  const i = Math.round(a);
  if (i === 1) return "gól";
  if (i >= 2 && i <= 4) return "góly";
  return "gólů";
}

export function finishingLead(team: string, goals: number, xgot: number): string {
  const delta = goals - xgot;
  const abs = Math.abs(delta).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const unit = goalUnit(Math.abs(delta));
  const gUnit = goalUnit(goals);
  const xgotTxt = xgot.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const head = `${team} v tomhle okně dala ${goals} ${gUnit} z ${xgotTxt} xGOT`;
  if (delta > 0.15) return `${head} — o ${abs} ${unit} více než měla podle kvality střel na bránu.`;
  if (delta < -0.15) return `${head} — vstřelila o ${abs} ${unit} méně než měla podle kvality střel na bránu.`;
  return `${head}.`;
}

export function last5BadgeForTeam(index: XgotIndex | null | undefined, teamId: number | null | undefined): XgotBadge | null {
  if (!index || teamId == null) return null;
  const row = index.teams[String(teamId)];
  if (!row) return null;
  return xgotEfficiencyBadge(row.last5.goals, row.last5.xgot, "last5");
}
