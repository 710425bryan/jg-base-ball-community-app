import { normalizeCoachScheduleEvent } from '@/utils/coachSchedules'

export const schedulingCoach = {
  id: 'coach-scheduling', name: '林排班', nickname: null, role: 'SCHEDULINGCOACH', avatar_url: null
}
const names: Record<string, string> = { 'coach-a': '王文豪', 'coach-b': '張國強', 'coach-c': '陳志豪', 'coach-scheduling': '林排班' }
const event = (input: Record<string, unknown>) => normalizeCoachScheduleEvent({
  ...input,
  assignments: (input.coach_profile_ids as string[] || []).map((id) => ({
    coach_profile_id: id, coach_name: names[id], coach_nickname: null,
    coach_role: id === schedulingCoach.id ? schedulingCoach.role : id === 'coach-c' ? 'HEAD_COACH' : 'COACH'
  }))
})

export const createMonthOverviewEvents = () => [
  event({ id: 'overview-first', source_type: 'training_date', source_id: '2026-10-01',
    schedule_date: '2026-10-01', start_time: '08:00', end_time: '10:00', title: '月初晨間訓練',
    location: '中港國小棒球場', venue_id: 'venue-a', coach_profile_ids: [schedulingCoach.id], updated_at: 'overview-v1' }),
  event({ id: 'overview-manual', source_type: 'manual', source_id: 'overview-manual',
    schedule_date: '2026-10-01', start_time: '14:00', end_time: '16:00', title: '月份總覽手動加課',
    location: '中港國小棒球場', coach_profile_ids: ['coach-c'], updated_at: 'overview-v1' }),
  ...[5, 8, 10, 12, 18, 20, 22, 24, 26, 28, 30].map((day) => event({
    source_type: 'training_date', source_id: `2026-10-${String(day).padStart(2, '0')}`,
    schedule_date: `2026-10-${String(day).padStart(2, '0')}`, start_time: '09:00', end_time: '10:00',
    title: `全月訓練 ${day} 日`, location: '中港國小棒球場', venue_id: 'venue-a', coach_profile_ids: []
  })),
  event({ id: 'overview-match', source_type: 'match', source_id: 'overview-match-source',
    schedule_date: '2026-10-15', start_time: '10:00', end_time: '12:30', title: '十月友誼賽',
    location: '市立棒球場', coach_profile_ids: ['coach-c'], updated_at: 'overview-v1' }),
  event({ id: 'overview-training-class', source_type: 'training_class', source_id: 'overview-class-source',
    schedule_date: '2026-10-15', start_time: '14:00', end_time: '16:00', title: '十月投捕特訓',
    location: '河濱球場', coach_profile_ids: ['coach-a'], updated_at: 'overview-v1' }),
  event({ id: 'overview-venue-a', source_type: 'training_location', source_id: 'overview-session', source_venue_id: 'overview-block-a',
    schedule_date: '2026-10-15', start_time: '09:00', end_time: '11:00', title: '同日雙場地甲課',
    location: '中港國小棒球場', venue_id: 'venue-a', coach_profile_ids: ['coach-b'], updated_at: 'overview-v1' }),
  event({ id: 'overview-venue-b', source_type: 'training_location', source_id: 'overview-session', source_venue_id: 'overview-block-b',
    schedule_date: '2026-10-15', start_time: '09:00', end_time: '11:00', title: '同日雙場地乙課',
    location: '中港國小練習場', venue_id: 'venue-b', coach_profile_ids: [], updated_at: 'overview-v1' }),
  event({ id: 'overview-last', source_type: 'training_location', source_id: 'overview-last-session', source_venue_id: 'overview-last-block',
    schedule_date: '2026-10-31', start_time: null, end_time: null, title: '月底取消訓練', status: 'cancelled',
    location: '中港國小棒球場第二分區與室內投捕練習區（長名稱場地驗證）', venue_id: 'venue-a',
    coach_profile_ids: [], updated_at: 'overview-v1' }),
  event({ source_type: 'training_date', source_id: '2026-11-01', schedule_date: '2026-11-01',
    title: '十一月獨立訓練', location: '河濱球場', coach_profile_ids: [] })
]
