export interface TeamBrief {
  id: number;
  name: string;
  image?: string | null;
}

export interface LeagueMeta {
  id: number;
  name: string;
  short?: string | null;
  country?: string | null;
  enabled: boolean;
  logo?: string | null;
  match_count?: number;
  round_count?: number;
}

export interface DataIndex {
  generated_at: string;
  default_league_id: number;
  stale_after_hours: number;
  window_days: number;
  leagues: LeagueMeta[];
}

export interface RoundFixture {
  fixture_id: number;
  starting_at: string;
  venue: string | null;
  home: TeamBrief;
  away: TeamBrief;
  has_full_data?: boolean;
}

export interface LeagueRoundData {
  generated_at: string;
  league: LeagueMeta;
  round: RoundFixture[];
}

export interface TeamMatchStats {
  shots: number | null;
  sot: number | null;
  corners: number | null;
  fouls: number | null;
  possession: number | null;
  yellow: number | null;
  red: number | null;
}

export interface H2HMatch {
  fixture_id: number;
  date: string;
  home: TeamBrief;
  away: TeamBrief;
  home_score: number | null;
  away_score: number | null;
  result_for_home_team: "V" | "R" | "P";
  is_home_team_at_home: boolean;
  team_home_stats: TeamMatchStats;
  team_away_stats: TeamMatchStats;
  coach_home: string | null;
  coach_away: string | null;
  referee_id: number | null;
}

export interface MatchFacts {
  date: string;
  fixture_id: number;
  is_home: boolean;
  opponent: string | null;
  league_id: number | null;
  league_name: string | null;
  is_league_match: boolean;
  gf: number;
  ga: number;
  ht_gf: number | null;
  ht_ga: number | null;
  shots: number;
  sot: number;
  corners: number;
  opp_corners: number;
  possession: number | null;
  fouls: number;
  opp_fouls: number;
  offsides: number;
  opp_offsides: number;
  yellow: number;
  opp_yellow: number;
  red: number;
  opp_red: number;
  referee_id: number | null;
}

export interface FormSide {
  matches: MatchFacts[];
  results_sequence: string[];
  points: number;
  goals_for: number;
  goals_against: number;
  played: number;
  recent_all: MatchFacts[];
  season_start: string;
}

export interface RadarAverages {
  goals_for: number;
  goals_against: number;
  shots: number;
  sot: number;
  corners: number;
  possession: number;
  cards: number;
  fouls_committed: number;
  fouls_received: number;
}

export interface TrendItem {
  key: string;
  label: string;
  hits: number;
  total: number;
  pct: number;
}

export interface SimulationResult {
  n: number;
  expected_goals: { home: number; away: number };
  home_win_pct: number;
  draw_pct: number;
  away_win_pct: number;
  btts_pct: number;
  over25_pct: number;
  under25_pct: number;
  top_scorelines: { score: string; pct: number }[];
}

export interface LineupStatsView {
  appearances: number;
  stats: Record<string, number>;
}

export interface PlayerBrief {
  id: number;
  name: string;
  position_id: number | null;
  is_gk: boolean;
  jersey_number: number | null;
  season_stats: Record<string, number>;
  last5_stats: LineupStatsView;
  h2h_stats: LineupStatsView;
}

export interface SidelinedItem {
  side: "home" | "away";
  player_id: number;
  player_name: string;
  type_id: number;
  type_name: string;
  type_name_cs: string;
  category: string | null;
  category_cs: string | null;
  start_date: string | null;
  end_date: string | null;
  games_missed: number | null;
  likely_available: boolean;
}

export interface PredictedLineupPlayer {
  player_name: string;
  jersey_number: number | null;
  formation_field: string | null;
}

export interface RefereeTeamMatch {
  fixture_id: number;
  date: string;
  home_name: string;
  away_name: string;
  home_score: number | null;
  away_score: number | null;
  result: "V" | "R" | "P";
  total_fouls: number;
}

export interface RefereeTeamSummary {
  matches: number;
  avg_fouls_by_team: number;
  avg_fouls_total: number;
  avg_yellow_by_team: number;
  avg_red_by_team: number;
  recent_matches: RefereeTeamMatch[];
}

export interface RefereeLeagueContext {
  fouls_per_match: number;
  yellow_per_match: number;
  red_per_match: number;
  matches_sampled: number;
}

export interface RefereeInfo {
  id: number;
  name: string;
  season_stats: Record<string, any> | null;
  league_context: RefereeLeagueContext | null;
  career_stats: {
    total_seasons_tracked: number;
    matches: number;
    yellow_cards: number;
    red_cards: number;
    avg_yellow_per_match: number | null;
  };
  h2h_matches_officiated: {
    fixture_id: number;
    date: string;
    home: string;
    away: string;
    home_score: number | null;
    away_score: number | null;
    result_for_home_team: "V" | "R" | "P";
  }[];
  home_team_matches_officiated: RefereeTeamSummary | null;
  away_team_matches_officiated: RefereeTeamSummary | null;
}

export interface MatchData {
  fixture_id: number;
  league_id?: number;
  league_name?: string;
  built_at?: string;
  refreshed_at?: string;
  build_mode?: "full" | "refresh";
  starting_at: string;
  venue: string | null;
  home: TeamBrief;
  away: TeamBrief;
  referee: RefereeInfo | null;
  sidelined: SidelinedItem[];
  predicted_lineups: Record<string, PredictedLineupPlayer[]>;
  h2h: H2HMatch[];
  h2h_total_available: number;
  form: { home: FormSide; away: FormSide };
  radar: {
    categories: string[];
    season: { home: RadarAverages; away: RadarAverages };
    last5: { home: RadarAverages; away: RadarAverages };
    last3_h2h: { home: RadarAverages; away: RadarAverages };
    last3_h2h_home_venue: { home: RadarAverages | null; away: RadarAverages | null; sample_size: number };
  };
  trends: {
    team_last5: { home: TrendItem[]; away: TrendItem[] };
    h2h: { last3: TrendItem[]; last5: TrendItem[] };
  };
  simulation: SimulationResult;
  players: { home: PlayerBrief[]; away: PlayerBrief[] };
}

export interface AppData {
  generated_at: string;
  league: { id: number; name: string };
  round: RoundFixture[];
  matches: MatchData[];
}
