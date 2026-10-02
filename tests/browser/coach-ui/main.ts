import { createApp, defineComponent, h } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory, RouterLink, RouterView } from 'vue-router'
import ElementPlus from 'element-plus'
import zhTw from 'element-plus/es/locale/lang/zh-tw'
import 'element-plus/dist/index.css'
import '@/style.css'
import AppGlobalDialog from '@/components/common/AppGlobalDialog.vue'
import AppGlobalSelect from '@/components/common/AppGlobalSelect.vue'
import CoachLeaveRequestsView from '@/views/CoachLeaveRequestsView.vue'
import CoachSchedulesView from '@/views/CoachSchedulesView.vue'
import { coachSchedulesApi } from '@/services/coachSchedulesApi'
import { coachScheduleTemplatesApi } from '@/services/coachScheduleTemplatesApi'
import { coachLeaveRequestsApi } from '@/services/coachLeaveRequestsApi'
import { normalizeCoachScheduleEvent, getCoachScheduleEventKey } from '@/utils/coachSchedules'
import { normalizeCoachScheduleAutoFillPreview } from '@/utils/coachScheduleTemplates'
import { usePermissionsStore } from '@/stores/permissions'
import type { CoachLeaveRequest } from '@/types/coachLeaveRequest'
import type { CoachScheduleTemplate } from '@/types/coachScheduleTemplate'
import { createMonthOverviewEvents, schedulingCoach } from './monthOverviewFixture'

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const coaches = [
  { id: 'coach-b', name: '張國強', nickname: null, role: 'COACH', avatar_url: null },
  { id: 'coach-a', name: '王文豪', nickname: null, role: 'COACH', avatar_url: null },
  { id: 'coach-c', name: '陳志豪', nickname: null, role: 'HEAD_COACH', avatar_url: null }
]
const state = {
  revision: 1,
  failNextBatch: false,
  failNextTemplate: false,
  failNextMonthRead: false,
  failTrainingMonths: [] as string[],
  batchReceipts: {} as Record<string, string[]>,
  calls: [] as Array<{ action: string; data: unknown }>,
  coaches,
  venues: [
    { id: 'venue-a', name: '中港國小棒球場' },
    { id: 'venue-b', name: '中港國小練習場' },
    { id: 'venue-c', name: '河濱球場' }
  ],
  events: [
    normalizeCoachScheduleEvent({ source_type: 'training_location', source_id: 'session-a', source_venue_id: 'block-a',
      venue_id: 'venue-a', schedule_date: '2026-10-03', start_time: '09:00', end_time: '12:00',
      title: '週末投捕與內外野分組訓練', location: '中港國小棒球場', coach_profile_ids: [] }),
    normalizeCoachScheduleEvent({ id: 'empty-saved', source_type: 'training_location', source_id: 'session-b', source_venue_id: 'block-b',
      venue_id: 'venue-b', schedule_date: '2026-10-03', start_time: '14:00', end_time: '17:00',
      title: '下午守備訓練', location: '中港國小練習場', updated_at: 'version-1',
      unavailable_coach_profile_ids: ['coach-b'], assignment_changes: [{ coach_profile_id: 'coach-b', coach_name: '張國強', leave_id: 'leave-existing', changed_at: '2026-10-02T02:00:00Z' }] }),
    normalizeCoachScheduleEvent({ source_type: 'training_location', source_id: 'session-c', source_venue_id: 'block-c',
      venue_id: 'venue-a', schedule_date: '2026-10-03', start_time: '10:00', end_time: '11:00',
      title: '同場地技術課程', location: '中港國小棒球場', coach_profile_ids: [] })
  ],
  templates: [{ id: 'blocked-template', name: '下午固定排班', is_active: true, match_mode: 'venue',
    venue_id: 'venue-b', venue_name: '中港國小練習場', venue_is_active: true,
    coach_profile_ids: ['coach-b'], updated_at: 'version-1' }] as CoachScheduleTemplate[],
  leaves: [{ id: 'leave-existing', coach_profile_id: 'coach-b', coach_name: '張國強', coach_nickname: null,
    start_date: '2026-10-03', end_date: '2026-10-03', time_segment: 'afternoon', reason: '行程安排', status: 'active',
    created_at: '2026-10-02T02:00:00Z', updated_at: 'version-1' }] as CoachLeaveRequest[]
}
const record = (action: string, data: unknown) => state.calls.push({ action, data: copy(data) })
coachSchedulesApi.listSchedulableCoaches = async () => { record('listCoaches', null); return copy(coaches) }
coachSchedulesApi.listAdminMonth = async (month) => {
  record('listScheduleMonth', month)
  if (state.failNextMonthRead) { state.failNextMonthRead = false; throw new Error('Fixture 月份總覽讀取失敗') }
  return { month_start: `${month}-01`, scope: 'admin', events: copy(state.events.filter((event) => event.schedule_date.startsWith(`${month}-`))) }
}
coachSchedulesApi.saveEvent = async (input) => {
  record('saveSchedule', input)
  const key = getCoachScheduleEventKey(normalizeCoachScheduleEvent(input))
  const index = state.events.findIndex((event) => getCoachScheduleEventKey(event) === key)
  const event = normalizeCoachScheduleEvent({ ...(index >= 0 ? state.events[index] : {}), ...input,
    id: input.id || `saved-${++state.revision}`, updated_at: `version-${++state.revision}`,
    assignments: input.coach_profile_ids.map((id) => {
      const coach = coaches.find((row) => row.id === id)!
      return { coach_profile_id: id, coach_name: coach.name, coach_nickname: coach.nickname, coach_role: coach.role }
    }) })
  if (index >= 0) state.events[index] = event
  else state.events.push(event)
  return event.id!
}
coachSchedulesApi.deleteEvent = async (id) => { record('deleteSchedule', id); state.events = state.events.filter((event) => event.id !== id) }
coachScheduleTemplatesApi.list = async () => copy(state.templates)
coachScheduleTemplatesApi.listVenues = async () => { record('listTemplateVenues', null); return copy(state.venues) }
coachScheduleTemplatesApi.save = async (template) => {
  record('saveTemplate', template)
  if (state.failNextTemplate) { state.failNextTemplate = false; throw new Error('Fixture 範本儲存失敗，請保留表單並重試。') }
  let venue = template.venue_id ? state.venues.find((row) => row.id === template.venue_id) : undefined
  const venueName = template.venue_name?.trim() || ''
  if (!venue && venueName) venue = state.venues.find((row) => row.name === venueName)
  if (!venue && venueName) {
    venue = { id: `venue-${++state.revision}`, name: venueName }
    state.venues.push(venue)
  }
  if (!venue) throw new Error('請選擇或輸入場地。')
  const id = template.id || `template-${++state.revision}`
  state.templates = [...state.templates.filter((row) => row.id !== id), {
    id, name: template.name?.trim() || venue.name, is_active: template.is_active,
    match_mode: 'venue', venue_id: venue.id, venue_name: venue.name, venue_is_active: true,
    coach_profile_ids: [...template.coach_profile_ids], updated_at: `version-${state.revision}`
  }]
  return id
}
coachScheduleTemplatesApi.delete = async (template) => { record('deleteTemplate', template); state.templates = state.templates.filter((row) => row.id !== template.id) }
coachScheduleTemplatesApi.preview = async (month) => {
  record('preview', month)
  const reserved: { coach: string; date: string; start: string; end: string }[] = []
  const sorted = state.events.filter((event) => !event.coach_profile_ids.length && event.status !== 'cancelled' && event.schedule_date >= '2026-10-02')
    .sort((left, right) => `${left.schedule_date} ${left.start_time} ${getCoachScheduleEventKey(left)}`.localeCompare(`${right.schedule_date} ${right.start_time} ${getCoachScheduleEventKey(right)}`))
  const rows = sorted.flatMap((event) => {
    const template = state.templates.find((row) => row.venue_id === event.venue_id && row.is_active)
    if (!template) return []
    const excluded: Array<{ id: string; name: string; reason: string }> = []
    const proposed: string[] = []
    for (const id of template.coach_profile_ids) {
      const overlapping = (date: string, start: string | null, end: string | null) => date === event.schedule_date
        && (!event.start_time || !event.end_time || !start || !end || event.start_time < end && start < event.end_time)
      const leave = event.unavailable_coach_profile_ids?.includes(id)
      const conflict = reserved.some((slot) => slot.coach === id && overlapping(slot.date, slot.start, slot.end))
        || state.events.some((row) => row.status !== 'cancelled' && row.coach_profile_ids.includes(id) && overlapping(row.schedule_date, row.start_time, row.end_time))
      if (leave || conflict) excluded.push({ id, name: coaches.find((row) => row.id === id)!.name, reason: leave ? '教練已請假' : '教練同時段撞班' })
      else { proposed.push(id); reserved.push({ coach: id, date: event.schedule_date, start: event.start_time || '', end: event.end_time || '' }) }
    }
    return [{ event_key: getCoachScheduleEventKey(event), event, template_id: template.id, template_name: template.name,
      proposed_coach_profile_ids: proposed,
      excluded_coaches: excluded,
      vacancy_count: excluded.length, time_incomplete: false }]
  })
  return normalizeCoachScheduleAutoFillPreview({ fingerprint: `fixture-${state.revision}`, rows })
}
coachScheduleTemplatesApi.confirm = async (month, fingerprint, keys) => {
  record('confirmAutoFill', { month, fingerprint, keys })
  const preview = await coachScheduleTemplatesApi.preview(month)
  if (preview.fingerprint !== fingerprint) throw new Error('預覽已過期')
  const ids = []
  for (const row of preview.rows.filter((item) => keys.includes(item.event_key))) {
    ids.push(await coachSchedulesApi.saveEvent({ ...row.event, coach_profile_ids: row.proposed_coach_profile_ids }))
  }
  return ids
}
coachLeaveRequestsApi.list = async (filters = {}) => ({
  coaches: copy(coaches), leaves: copy(state.leaves.filter((leave) =>
    (filters.manage || leave.coach_profile_id === 'coach-a')
    && (!filters.status || filters.status === 'all' || leave.status === filters.status)
    && (!filters.coachProfileId || leave.coach_profile_id === filters.coachProfileId)))
})
coachLeaveRequestsApi.trainingDates = async (month, manage) => {
  record('trainingDates', { month, manage })
  if (state.failTrainingMonths.includes(month)) {
    state.failTrainingMonths = state.failTrainingMonths.filter((value) => value !== month)
    throw new Error('Fixture 上課日期暫時無法載入')
  }
  const dates: Record<string, { headquarters: string[]; junior: string[] }> = {
    '2026-10': { headquarters: ['2026-10-01', '2026-10-03', '2026-10-09', '2026-10-17', '2026-10-24', '2026-10-31'], junior: ['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25'] },
    '2026-11': { headquarters: ['2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28'], junior: ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29'] },
    '2026-12': { headquarters: ['2026-12-05', '2026-12-12', '2026-12-19', '2026-12-26'], junior: ['2026-12-06', '2026-12-13', '2026-12-20', '2026-12-27'] }
  }
  return {
    month_start: `${month}-01`, programs: [
      { program_key: 'chunggang_school_team', program_label: '中港總部', training_dates: dates[month]?.headquarters || [] },
      { program_key: 'junior_high_school_team', program_label: '國中部', training_dates: dates[month]?.junior || [] }
    ]
  }
}
coachLeaveRequestsApi.createBatch = async (input, manage, batchId) => {
  record('createLeaveBatch', { input, manage, batchId })
  if (state.failNextBatch) { state.failNextBatch = false; throw new Error('Fixture 批次送出失敗，請保留表單並重試。') }
  const receipt = state.batchReceipts[batchId]
  if (receipt) return copy(receipt)
  const coachId = manage ? input.coach_profile_id! : 'coach-a'
  const coach = coaches.find((row) => row.id === coachId)!
  const ids = input.records.map((record) => {
    const id = `leave-${++state.revision}`
    state.leaves.push({
      ...record, id, coach_profile_id: coachId, coach_name: coach.name, coach_nickname: null,
      reason: input.reason || null, status: 'active', created_at: '2026-10-02T02:00:00Z', updated_at: `version-${state.revision}`
    })
    return id
  })
  state.batchReceipts[batchId] = ids
  return copy(ids)
}
coachLeaveRequestsApi.save = async (input, manage, requestId) => {
  record('saveLeave', { input, manage, requestId })
  const coachId = manage ? input.coach_profile_id! : 'coach-a'
  const coach = coaches.find((row) => row.id === coachId)!
  const id = input.id || `leave-${++state.revision}`
  state.leaves = [...state.leaves.filter((leave) => leave.id !== id), {
    ...input, id, coach_profile_id: coachId, coach_name: coach.name, coach_nickname: null,
    reason: input.reason || null, status: 'active', created_at: '2026-10-02T02:00:00Z', updated_at: `version-${++state.revision}`
  }]
  return id
}
coachLeaveRequestsApi.cancel = async (id, updatedAt, manage) => {
  record('cancelLeave', { id, updatedAt, manage })
  state.leaves = state.leaves.map((leave) => leave.id === id ? { ...leave, status: 'cancelled', updated_at: `version-${++state.revision}` } : leave)
}
Object.assign(window, { __coachFixture: state })

const router = createRouter({ history: createWebHashHistory(), routes: [
  { path: '/', redirect: '/coach-schedules?month=2026-10' },
  { path: '/coach-schedules', component: CoachSchedulesView },
  { path: '/coach-leave-requests', component: CoachLeaveRequestsView, props: { manage: true } },
  { path: '/my-coach-leave-requests', component: CoachLeaveRequestsView }
] })
const App = defineComponent({ setup() {
  return () => h('div', { style: 'height:100dvh;display:flex;flex-direction:column;min-width:0;' }, [
    h('nav', { style: 'display:flex;flex-wrap:wrap;gap:8px;padding:8px;background:white;flex:none;' },
      [['/coach-schedules?month=2026-10', '排班'], ['/coach-leave-requests', '教練假單'], ['/my-coach-leave-requests', '我的假單']]
        .map(([to, text]) => h(RouterLink, { to, style: 'min-height:44px;display:flex;align-items:center;padding:0 12px;' }, () => text))),
    h('main', { class: 'app-main-scroll', style: 'flex:1;min-height:0;overflow:auto;' }, [h(RouterView)]),
    h('div', { style: 'height:4.5rem;flex:none;background:white;display:flex;align-items:center;justify-content:center;' }, '測試行動導覽（隔離資料）')
  ])
} })
const app = createApp(App)
const pinia = createPinia()
app.use(pinia).use(router).use(ElementPlus, { locale: zhTw })
Object.assign(window, { __coachPermissions: usePermissionsStore(pinia) })
Object.assign(window, { __enableCoachMonthOverviewFixture: () => {
  if (coaches.some((coach) => coach.id === schedulingCoach.id)) return
  coaches.push(schedulingCoach)
  state.events.push(...createMonthOverviewEvents())
  state.revision += 1
  usePermissionsStore(pinia).roles = [
    { role_key: 'ADMIN', role_name: '管理員', weight: 1 },
    { role_key: 'HEAD_COACH', role_name: '總教練', weight: 10 },
    { role_key: schedulingCoach.role, role_name: '排班教練', weight: 15 },
    { role_key: 'COACH', role_name: '教練', weight: 20 }
  ]
} })
app.component('el-dialog', AppGlobalDialog).component('el-select', AppGlobalSelect)
app.mount('#app')
