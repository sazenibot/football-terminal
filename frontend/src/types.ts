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
  odds?: number | null;
}

export interface AiAnalysis {
  text: string;
  model?: string;
  generated_at?: string;
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
  ai_analysis?: AiAnalysis | null;
}

export interface AppData {
  generated_at: string;
  league: { id: number; name: string };
  round: RoundFixture[];
  matches: MatchData[];
}

export interface CatalogLeagueMeta {
  id: number;
  name: string;
  short?: string | null;
  country?: string | null;
  country_id?: number | null;
  logo?: string | null;
  season_id?: number | null;
  season_name?: string | null;
  enabled?: boolean;
}

export interface CatalogTeamCard {
  id: number;
  name: string;
  short?: string | null;
  image?: string | null;
  secondary?: string | null;
}

export interface CatalogPlayerCard {
  id: number;
  name: string;
  image?: string | null;
  team_id: number;
  team_name: string;
  position?: string | null;
  number?: number | null;
}

export interface CatalogRefereeCard {
  id: number;
  name: string;
  image?: string | null;
  country?: string | null;
  in_league: boolean;
  league_matches?: number;
}

export interface CatalogHub {
  generated_at: string;
  league: CatalogLeagueMeta;
  teams: CatalogTeamCard[];
  players: CatalogPlayerCard[];
  referees: CatalogRefereeCard[];
}

export interface CatalogSquadPlayer {
  id: number;
  name: string;
  image?: string | null;
  number?: number | null;
  position?: string | null;
  captain?: boolean;
  position_id?: number | null;
  status?: "active" | "loan" | "left" | null;
  season?: CatalogPlayerSeason;
}

export interface CatalogUpcoming {
  fixture_id: number;
  starting_at: string | null;
  is_home: boolean;
  opponent: TeamBrief;
  has_match_page?: boolean;
  opponent_position?: number | null;
  fdr?: "easy" | "mid" | "hard" | null;
  fdr_rating?: number | null;
}

export interface CatalogPlayerSeason {
  appearances?: number;
  lineups?: number;
  minutes?: number;
  goals?: number;
  assists?: number;
  yellow?: number;
  red?: number;
  rating?: number;
  shots?: number;
  sot?: number;
  clean_sheets?: number;
  saves?: number;
  goals_conceded?: number;
}

export interface CatalogRecentMatch {
  fixture_id: number;
  starting_at: string | null;
  is_home: boolean;
  opponent: TeamBrief;
  gf: number;
  ga: number;
  result: "V" | "R" | "P";
  has_match_page?: boolean;
}

export interface CatalogTeamTable {
  position?: number | null;
  points?: number | null;
  played?: number | null;
  won?: number | null;
  drawn?: number | null;
  lost?: number | null;
  gf?: number | null;
  ga?: number | null;
  form?: string | null;
}

export interface CatalogProfileStat {
  key?: string;
  group?: "attack" | "defense" | "discipline" | "setpiece";
  label: string;
  value?: number | null;
  league_avg?: number | null;
  percentile?: number | null;
  rank?: number | null;
  league_size?: number | null;
  higher_better?: boolean;
}

export interface CatalogEraSummary {
  matches?: number;
  won?: number;
  drawn?: number;
  lost?: number;
  goals_for?: number | null;
  goals_against?: number | null;
  shots?: number | null;
  sot?: number | null;
  corners?: number | null;
  possession?: number | null;
  fouls?: number | null;
  fouls_committed?: number | null;
  fouls_received?: number | null;
  yellow?: number | null;
  cards?: number | null;
}

export interface CatalogEra {
  coach_id?: number | null;
  coach_name: string;
  from?: string | null;
  to?: string | null;
  matches: number;
  all: CatalogEraSummary;
  home: CatalogEraSummary;
  away: CatalogEraSummary;
  radar: {
    all: RadarAverages;
    home: RadarAverages;
    away: RadarAverages;
  };
}

export interface CatalogExplorerMatch {
  s?: number | null;
  d: string;
  h: 0 | 1;
  gf: number;
  ga: number;
  sh?: number | null;
  sot?: number | null;
  c?: number | null;
  p?: number | null;
  f?: number | null;
  of?: number | null;
  y?: number | null;
  r?: number | null;
}

export interface CatalogExplorerSeason {
  id: number;
  name?: string | null;
  starting_at?: string | null;
}

export interface CatalogExplorerTeam {
  id: number;
  name: string;
  short?: string | null;
  image?: string | null;
  matches?: CatalogExplorerMatch[];
  eras: CatalogEra[];
}

export interface CatalogExplorer {
  generated_at?: string;
  league_id: number;
  season_id?: number;
  season_name?: string;
  seasons?: CatalogExplorerSeason[];
  teams: CatalogExplorerTeam[];
}

export interface CatalogTeamOverlay {
  generated_at?: string;
  hook_kind?: "mock" | "facts";
  season_name?: string | null;
  table?: CatalogTeamTable | null;
  recent?: CatalogRecentMatch[];
  season_avgs?: CatalogEraSummary;
  coach?: CatalogTeamCoach | null;
  profile?: {
    matches?: number;
    stats?: CatalogProfileStat[];
    shots?: CatalogProfileStat;
    sot?: CatalogProfileStat;
    corners?: CatalogProfileStat;
    possession?: CatalogProfileStat;
    fouls?: CatalogProfileStat;
    yellow?: CatalogProfileStat;
  };
  eras?: CatalogEra[];
}

export interface CatalogTeamCoach {
  id?: number | null;
  name?: string | null;
  image?: string | null;
  start?: string | null;
  end?: string | null;
  active?: boolean;
}

export interface CatalogTeamDetail {
  id: number;
  name: string;
  short?: string | null;
  image?: string | null;
  country?: string | null;
  founded?: number | null;
  venue?: { name?: string | null; city?: string | null; capacity?: number | null } | null;
  league_id: number;
  league_name: string;
  hook: string;
  coach?: CatalogTeamCoach | null;
  squad: CatalogSquadPlayer[];
  upcoming: CatalogUpcoming[];
  overlay?: CatalogTeamOverlay | null;
}

export interface CatalogPlayerDetail {
  id: number;
  name: string;
  common_name?: string | null;
  image?: string | null;
  date_of_birth?: string | null;
  age?: number | null;
  team_id: number;
  team_name: string;
  team_image?: string | null;
  league_id: number;
  league_name: string;
  number?: number | null;
  position?: string | null;
  hook: string;
  overlay?: {
    generated_at?: string;
    season?: CatalogPlayerSeason;
  } | null;
}

export interface CatalogRefereeRecent {
  fixture_id: number;
  starting_at?: string | null;
  home?: string | null;
  away?: string | null;
  has_match_page?: boolean;
}

export interface CatalogRefereeOverlay {
  generated_at?: string;
  season?: {
    matches?: number | null;
    fouls_avg?: number | null;
    yellow_avg?: number | null;
    red_avg?: number | null;
    penalties_avg?: number | null;
  };
  career?: {
    seasons?: number | null;
    matches?: number | null;
    yellow?: number | null;
    red?: number | null;
    yellow_avg?: number | null;
  };
  league_context?: {
    matches_sampled?: number;
    fouls_per_match?: number;
    yellow_per_match?: number;
    red_per_match?: number;
  } | null;
  recent?: CatalogRefereeRecent[];
}

export interface CatalogRefereeDetail {
  id: number;
  name: string;
  image?: string | null;
  country?: string | null;
  date_of_birth?: string | null;
  league_id: number;
  league_name: string;
  in_league: boolean;
  league_matches: number;
  leagues?: { id: number; name: string; in_league: boolean; league_matches: number }[];
  hook: string;
  overlay?: CatalogRefereeOverlay | null;
}
