export type PublicLandingEvent = {
  id: string
  title: string
  date: string
  event_type?: string | null
}

export type PublicLandingMatch = {
  id: string
  match_name: string
  opponent?: string | null
  match_date: string
  match_time?: string | null
  location?: string | null
  category_group?: string | null
}

export type PublicLandingAnnouncement = {
  id: string
  title: string
  content?: string | null
  created_at: string
  is_pinned?: boolean | null
  image_url?: string | null
}

export type PublicLandingSnapshot = {
  todayEvent: PublicLandingEvent | null
  todayLeaveNames: string[]
  todayLeaveCount: number
  upcomingMatches: PublicLandingMatch[]
  latestAnnouncements: PublicLandingAnnouncement[]
}

export const createEmptyPublicLandingSnapshot = (): PublicLandingSnapshot => ({
  todayEvent: null,
  todayLeaveNames: [],
  todayLeaveCount: 0,
  upcomingMatches: [],
  latestAnnouncements: []
})
