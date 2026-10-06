import { getLocale, intlTag, t } from "../i18n/locale";

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
  return n.toLocaleString(intlTag(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}


/** Stateless: ze součtů gólů a xGOT vrátí štítek, nebo nic. */
export function xgotEfficiencyBadge(goals: number, xgot: number, window: XgotWindow = "season"): XgotBadge | null {
  if (xgot < XGOT_BADGE_MIN) return null;
  const efficiency_pct = (goals / xgot - 1) * 100;
  if (efficiency_pct >= XGOT_BADGE_PCT) {
    return {
      id: "lucky_scoring_team",
      label: t("mc.xg.badge.lucky"),
      tooltip: t(window === "last5" ? "mc.xg.tip.lucky.last5" : "mc.xg.tip.lucky.season", { p: t("fmt.pct", { n: pct1(efficiency_pct) }) }),
      efficiency_pct,
      window,
    };
  }
  if (efficiency_pct <= -XGOT_BADGE_PCT) {
    return {
      id: "unlucky_finishing_team",
      label: t("mc.xg.badge.unlucky"),
      tooltip: t(window === "last5" ? "mc.xg.tip.unlucky.last5" : "mc.xg.tip.unlucky.season", { p: t("fmt.pct", { n: pct1(Math.abs(efficiency_pct)) }) }),
      efficiency_pct,
      window,
    };
  }
  return null;
}

export function goalUnit(n: number): string {
  const a = Math.abs(n);
  if (Math.abs(a - Math.round(a)) > 0.001) return t("mc.xg.goal.frac");
  const i = Math.round(a);
  if (i === 1) return t("mc.xg.goal.one");
  if (i >= 2 && i <= 4) return t("mc.xg.goal.few");
  return t("mc.xg.goal.many");
}

export function finishingLead(team: string, goals: number, xgot: number): string {
  const delta = goals - xgot;
  const abs = Math.abs(delta).toLocaleString(intlTag(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // rozdíl se píše na dvě desetinná místa, v angličtině je jednotka vždy množné číslo
  const unit = getLocale() === "en" ? t("mc.xg.goal.many") : goalUnit(Math.abs(delta));
  const gUnit = goalUnit(goals);
  const xgotTxt = xgot.toLocaleString(intlTag(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const vars = { team, goals, gUnit, xgot: xgotTxt, abs, unit };
  if (delta > 0.15) return t("mc.xg.lead.more", vars);
  if (delta < -0.15) return t("mc.xg.lead.less", vars);
  return t("mc.xg.lead.flat", vars);
}

export function last5BadgeForTeam(index: XgotIndex | null | undefined, teamId: number | null | undefined): XgotBadge | null {
  if (!index || teamId == null) return null;
  const row = index.teams[String(teamId)];
  if (!row) return null;
  return xgotEfficiencyBadge(row.last5.goals, row.last5.xgot, "last5");
}
