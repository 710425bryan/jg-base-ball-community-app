export interface PlayerRef {
  id?: string;
  name: string;
}

export interface AbsentPlayer {
  name: string;
  type: string;
}

export interface LineupEntry {
  order: number;
  position: string; // 1~9, DH, 預備
  name: string;
  number?: string;
  remark?: string;
}

export interface InningLog {
  inning: string; // '一上', '一下', etc.
  log: string;
  selectedPlayerId?: string; // or name
}

export interface BattingStat {
  name: string;
  number?: string;
  pa: number;  // 打席
  ab: number;  // 打數
  h1: number;  // 一壘安打
  h2: number;  // 二壘安打
  h3: number;  // 三壘安打
  hr: number;  // 全壘打
  rbi: number; // 打點
  r: number;   // 得分
  bb: number;  // 四死球 (保送)
  hbp: number; // 觸身球
  so: number;  // 三振
  sb: number;  // 盜壘
}

export interface PitchingStat {
  name: string;
  number?: string;
  ip: number;  // 出局數，顯示時換算成局數
  h: number;   // 被安打
  h2: number;  // 被二壘安
  h3: number;  // 被三壘安
  hr: number;  // 被全壘打
  r: number;   // 失分
  er: number;  // 自責分
  bb: number;  // 保送
  so: number;  // 三振
  np: number;  // 用球數
  ab: number;  // 被打數
  go: number;  // 滾地出局
  ao: number;  // 飛球出局
}

export interface LineScoreInning {
  home?: string | number;
  opponent?: string | number;
  away?: string | number;
}

export interface LineScoreData {
  innings?: LineScoreInning[];
  home_h?: number;
  home_e?: number;
  opponent_h?: number;
  opponent_e?: number;
  homeH?: number;
  homeE?: number;
  awayH?: number;
  awayE?: number;
  [key: string]: unknown;
}

export interface MatchRecord {
  id: string;
  google_calendar_event_id?: string | null;
  match_name: string;
  opponent: string;
  match_date: string; // YYYY-MM-DD
  match_time: string; // HH:mm - HH:mm
  location?: string;
  category_group?: string; // U12, etc.
  match_level?: string; // 友誼賽, etc.
  tournament_name?: string | null;
  home_score: number;
  opponent_score: number;
  coaches?: string; // Comma separated
  players?: string; // Comma separated
  absent_players: AbsentPlayer[];
  note?: string;
  photo_url?: string;
  lineup: LineupEntry[];
  current_lineup?: LineupEntry[];
  inning_logs: InningLog[];
  batting_stats: BattingStat[];
  pitching_stats?: PitchingStat[];
  current_batter_name?: string | null;
  current_inning?: string | null;
  current_b?: number | null;
  current_s?: number | null;
  current_o?: number | null;
  base_1?: boolean | null;
  base_2?: boolean | null;
  base_3?: boolean | null;
  bat_first?: boolean | null;
  show_lineup_intro?: boolean | null;
  show_line_score?: boolean | null;
  show_3d_field?: boolean | null;
  line_score_data?: LineScoreData | null;
  locked_by_user_id?: string | null;
  locked_by_user_name?: string | null;
  locked_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type MatchRecordInput = Omit<MatchRecord, 'id' | 'created_at' | 'updated_at'>;
