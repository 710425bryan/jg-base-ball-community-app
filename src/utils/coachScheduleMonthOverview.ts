import dayjs from 'dayjs'
import type { CoachScheduleEvent } from '@/types/coachSchedule'
import { getCoachScheduleEventKey, normalizeCoachScheduleMonth } from './coachSchedules'

export type CoachScheduleMonthOverviewRow = { key: string; event: CoachScheduleEvent; coachNames: string[] }
export type CoachScheduleMonthOverviewDate = { date: string; rows: CoachScheduleMonthOverviewRow[] }

const timeOrder = (value: string | null) => {
  const parts = value?.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d+)?)?$/)
  return parts ? Number(parts[1]) * 3600 + Number(parts[2]) * 60 + Number(parts[3] || 0) : Infinity
}
const savedCoachNames = (event: CoachScheduleEvent) => event.is_persisted
  ? [...new Set(event.coach_profile_ids)].map((id) => {
    const assignment = event.assignments.find((row) => row.coach_profile_id === id)
    return assignment?.coach_nickname?.trim() || assignment?.coach_name.trim() || '教練（姓名未提供）'
  }) : []

export const buildCoachScheduleMonthOverview = (
  events: readonly CoachScheduleEvent[], month: string
): CoachScheduleMonthOverviewDate[] => {
  const monthKey = normalizeCoachScheduleMonth(month)
  const groups = new Map<string, CoachScheduleMonthOverviewRow[]>()
  for (const event of events) {
    const date = event.schedule_date
    if (!date.startsWith(`${monthKey}-`) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || dayjs(date).format('YYYY-MM-DD') !== date) continue
    const rows = groups.get(date) || []
    rows.push({ key: getCoachScheduleEventKey(event), event, coachNames: savedCoachNames(event) })
    groups.set(date, rows)
  }
  return [...groups].sort(([left], [right]) => left.localeCompare(right)).map(([date, rows]) => ({
    date,
    rows: rows.sort((left, right) => timeOrder(left.event.start_time) - timeOrder(right.event.start_time)
      || left.event.title.localeCompare(right.event.title, 'zh-Hant') || left.key.localeCompare(right.key))
  }))
}
