import { supabase } from '@/services/supabase'
import {
  createEmptyPublicLandingSnapshot,
  type PublicLandingAnnouncement,
  type PublicLandingEvent,
  type PublicLandingMatch,
  type PublicLandingSnapshot
} from '@/types/publicLanding'

type PublicLandingSnapshotPayload = Partial<PublicLandingSnapshot> | null

const ensureArray = <T>(value: unknown): T[] => {
  return Array.isArray(value) ? (value as T[]) : []
}

export const getPublicLandingSnapshot = async (today?: string | null) => {
  const { data, error } = await supabase.rpc('get_public_landing_snapshot', {
    p_today: today || null
  })

  if (error) {
    throw error
  }

  const payload = (data ?? null) as PublicLandingSnapshotPayload
  const fallback = createEmptyPublicLandingSnapshot()

  return {
    todayEvent: (payload?.todayEvent ?? fallback.todayEvent) as PublicLandingEvent | null,
    todayLeaveNames: ensureArray<string>(payload?.todayLeaveNames),
    todayLeaveCount: Number(payload?.todayLeaveCount ?? 0),
    upcomingMatches: ensureArray<PublicLandingMatch>(payload?.upcomingMatches),
    latestAnnouncements: ensureArray<PublicLandingAnnouncement>(payload?.latestAnnouncements)
  }
}
