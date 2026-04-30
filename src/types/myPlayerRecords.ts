import type { MatchRecord } from '@/types/match'

export interface MyPlayerRecordMember {
  member_id: string
  name: string
  role: string | null
  team_group: string | null
  status: string | null
  jersey_number: string | null
  avatar_url: string | null
  is_linked: boolean
}

export type MyPlayerMatchRecord = MatchRecord
