export interface DashboardStats {
  totalMembers: number
  schoolTeamMembers: number
  communityMembers: number
  coachMembers: number
  todayLeaves: number
  todayLeaveRequests: number
  todayAttendanceLeaves: number
  todayAttendanceEvents: number
}

export interface DashboardPendingCounts {
  joinInquiries: number
  unpaidFees: number
  upcomingLeaves: number
  weeklyEvents: number
}

export interface DashboardAnnouncement {
  id: string
  title: string
  content: string | null
  createdAt: string
  isPinned: boolean
  imageUrl?: string | null
}

export interface DashboardEvent {
  id: string
  title: string
  date: string
  eventType: string | null
  createdAt: string
}

export interface DashboardTodayAttendanceEvent {
  id: string
  title: string
  date: string
  eventType: string | null
}

export interface DashboardTodayAttendanceStatus {
  todayEvent: DashboardTodayAttendanceEvent | null
  todayLeaveNames: string[]
  todayLeaveCount: number
}

export interface DashboardSnapshot {
  stats: DashboardStats
  pendingCounts: DashboardPendingCounts
  todayEvent: DashboardEvent | null
  recentAnnouncements: DashboardAnnouncement[]
}

export type NotificationSource = 'leave' | 'member' | 'join' | 'fee' | 'match' | 'announcement' | 'equipment' | 'training'

export interface NotificationFeedRow {
  id: string
  source: NotificationSource
  title: string
  body: string
  created_at: string
  link: string
  highlight_member_id: string | null
}

export interface NotificationFeedItem {
  id: string
  source: NotificationSource
  title: string
  body: string
  createdAt: string
  link: string
  highlightMemberId: string | null
}

export const createEmptyDashboardStats = (): DashboardStats => ({
  totalMembers: 0,
  schoolTeamMembers: 0,
  communityMembers: 0,
  coachMembers: 0,
  todayLeaves: 0,
  todayLeaveRequests: 0,
  todayAttendanceLeaves: 0,
  todayAttendanceEvents: 0
})

export const createEmptyDashboardPendingCounts = (): DashboardPendingCounts => ({
  joinInquiries: 0,
  unpaidFees: 0,
  upcomingLeaves: 0,
  weeklyEvents: 0
})

export const createEmptyDashboardTodayAttendanceStatus = (): DashboardTodayAttendanceStatus => ({
  todayEvent: null,
  todayLeaveNames: [],
  todayLeaveCount: 0
})

export const createEmptyDashboardSnapshot = (): DashboardSnapshot => ({
  stats: createEmptyDashboardStats(),
  pendingCounts: createEmptyDashboardPendingCounts(),
  todayEvent: null,
  recentAnnouncements: []
})

export const buildNotificationFeedItemId = (source: NotificationSource, id: string) => `${source}:${id}`
