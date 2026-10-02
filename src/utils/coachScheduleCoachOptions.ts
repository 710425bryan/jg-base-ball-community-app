import type { AppRole } from '@/types/appRole'
import type { SchedulableCoach } from '@/types/coachSchedule'
import { compareUserRoleKeys, getUserRoleOrder } from './userRoleOrder'

export type CoachScheduleCoachRole = Pick<AppRole, 'role_key' | 'role_name' | 'weight'>
export type CoachScheduleCoachGroup = { key: string; label: string; coaches: SchedulableCoach[] }

const canonicalRole = (role: string) => {
  const key = role.trim().toUpperCase()
  return key === '總教練' ? 'HEAD_COACH' : key === '教練' ? 'COACH' : key
}
const displayName = (coach: SchedulableCoach) => coach.nickname?.trim() || coach.name.trim()
const compareCoachNames = (left: SchedulableCoach, right: SchedulableCoach) =>
  displayName(left).localeCompare(displayName(right), 'zh-Hant')
  || left.name.localeCompare(right.name, 'zh-Hant')
  || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)

export const buildCoachScheduleCoachGroups = (
  coaches: readonly SchedulableCoach[], roles: readonly CoachScheduleCoachRole[]
): CoachScheduleCoachGroup[] => {
  const metadata = roles.map((role) => ({ ...role, role_key: canonicalRole(role.role_key) }))
    .filter((role) => role.role_key)
  const weights = getUserRoleOrder(metadata)
  const labels = new Map(metadata.map((role) => [role.role_key, role.role_name.trim()]))
  const grouped = new Map<string, SchedulableCoach[]>()
  for (const coach of coaches) {
    const key = canonicalRole(coach.role)
    const rows = grouped.get(key) || []
    rows.push(coach)
    grouped.set(key, rows)
  }
  return [...grouped].sort(([left], [right]) => compareUserRoleKeys(left, right, weights))
    .map(([key, rows]) => ({
      key,
      label: labels.get(key) || (key === 'HEAD_COACH' ? '總教練' : key === 'COACH' ? '教練' : key || '其他教練'),
      coaches: [...rows].sort(compareCoachNames)
    }))
}
