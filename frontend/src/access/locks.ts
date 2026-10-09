import type { Tier } from "./tiers";

/**
 * Minimální tarif podle canvasu Strom webu (sidecar item-tiers).
 * Unlimited je nejvyšší — kdo ho má, vidí i Pro.
 * Nová stránka / záložka / karta sem musí dostat řádek, jinak se nesmí mergeovat.
 */
export const LOCK = {
  mcPicker: "account",
  mcSort: "pro",
  mcListProbs: "unlimited",
  mcOverviewPlus: "account",
  mcPrediction: "account",
  mcForm: "pro",
  mcStats: "pro",
  mcPlayersTable: "pro",
  mcReferee: "pro",
  teamStats: "account",
  teamSquad: "account",
  teamGoals: "pro",
  teamRadar: "pro",
  teamCoaches: "pro",
  playerStats: "account",
  playerFdrExtra: "account",
  playerShots: "pro",
  playerCompare: "pro",
  playerMatches: "pro",
  refResults: "account",
  refHomeAway: "account",
  refTeams: "pro",
  refRecent: "pro",
  refMatches: "pro",
  tdTable: "pro",
  resultsBacktest: "account",
} as const satisfies Record<string, Tier>;

export type LockKey = keyof typeof LOCK;
