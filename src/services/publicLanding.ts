import { supabase } from '@/services/supabase'
import {
  createEmptyPublicLandingSnapshot,
  type PublicLandingAnnouncement,
  type PublicLandingEvent,
  type PublicLandingMatch,
  type PublicLandingSnapshot
} from '@/types/publicLanding'

type PublicLandingSnapshotPayload = Partial<PublicLandingSnapshot> | null

export type PublicJoinInquiryInput = {
  parent_name: string
  phone: string
  line_id: string | null
  child_age_or_grade: string
  message: string
}

const ensureArray = <T>(value: unknown): T[] => {
  return Array.isArray(value) ? (value as T[]) : []
}

export const createPublicJoinInquiryId = () => {
  const cryptoApi = globalThis.crypto

  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }

  const bytes = new Uint8Array(16)

  if (typeof cryptoApi?.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }

  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80

  return Array.from(bytes, (byte, index) => {
    const hex = byte.toString(16).padStart(2, '0')
    return [4, 6, 8, 10].includes(index) ? `-${hex}` : hex
  }).join('')
}

export const createPublicJoinInquiry = async (input: PublicJoinInquiryInput) => {
  const inquiryId = createPublicJoinInquiryId()
  const { error } = await supabase
    .from('join_inquiries')
    .insert({
      id: inquiryId,
      ...input
    })

  if (error) {
    throw error
  }

  return inquiryId
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
