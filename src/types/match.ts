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
  home_score: number;
  opponent_score: number;
  coaches?: string; // Comma separated
  players?: string; // Comma separated
  absent_players: AbsentPlayer[];
  note?: string;
  photo_url?: string;
  lineup: LineupEntry[];
  inning_logs: InningLog[];
  batting_stats: BattingStat[];
  created_at?: string;
  updated_at?: string;
}

export type MatchRecordInput = Omit<MatchRecord, 'id' | 'created_at' | 'updated_at'>;
