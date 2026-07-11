// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { RouterLinkStub, flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import dayjs from 'dayjs'
import { createEmptyMyHomeSnapshot } from '@/types/myHome'

const pushMock = vi.fn()
const fetchMock = vi.fn()
const fetchEquipmentsMock = vi.fn()
const listCoachScheduleDashboardMonthMock = vi.fn()
const rpcMock = vi.fn()
const myHomeServiceMocks = vi.hoisted(() => ({
  getMyHomeSnapshot: vi.fn(),
  getMyHomeNextEvent: vi.fn()
}))
let latestTeamMembersRealtimeHandler: (() => void) | null = null

const teamMembersInMock = vi.fn()
const teamMembersSelectMock = vi.fn(() => ({
  in: teamMembersInMock
}))

const leaveRequestsGteMock = vi.fn()
const leaveRequestsLteMock = vi.fn(() => ({
  gte: leaveRequestsGteMock
}))
const leaveRequestsSelectMock = vi.fn(() => ({
  lte: leaveRequestsLteMock
}))

const attendanceEventsEqMock = vi.fn()
const attendanceEventsSelectMock = vi.fn(() => ({
  eq: attendanceEventsEqMock
}))

const announcementsLimitMock = vi.fn()
const announcementsOrderSecondMock = vi.fn(() => ({
  limit: announcementsLimitMock
}))
const announcementsOrderFirstMock = vi.fn(() => ({
  order: announcementsOrderSecondMock
}))
const announcementsSelectMock = vi.fn(() => ({
  order: announcementsOrderFirstMock
}))

const fromMock = vi.fn((table: string) => {
  if (table === 'team_members') {
    return {
      select: teamMembersSelectMock
    }
  }

  if (table === 'leave_requests') {
    return {
      select: leaveRequestsSelectMock
    }
  }

  if (table === 'attendance_events') {
    return {
      select: attendanceEventsSelectMock
    }
  }

  if (table === 'announcements') {
    return {
      select: announcementsSelectMock
    }
  }

  throw new Error(`Unexpected table: ${table}`)
})
const realtimeChannelMock = {
  on: vi.fn((_event: string, config: { table?: string }, callback: () => void) => {
    if (config?.table === 'team_members') {
      latestTeamMembersRealtimeHandler = callback
    }
    return realtimeChannelMock
  }),
  subscribe: vi.fn(() => realtimeChannelMock)
}
const channelMock = vi.fn(() => realtimeChannelMock)
const removeChannelMock = vi.fn()

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')
  return {
    ...actual,
    useRouter: () => ({
      push: pushMock
    })
  }
})

vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {},
    rpc: rpcMock,
    from: fromMock,
    channel: channelMock,
    removeChannel: removeChannelMock
  }
}))

vi.mock('@/services/myHome', () => myHomeServiceMocks)

vi.mock('@/services/equipmentApi', () => ({
  fetchEquipments: fetchEquipmentsMock,
  fetchEquipmentMembers: vi.fn(),
  fetchEquipmentTransactions: vi.fn(),
  createEquipment: vi.fn(),
  updateEquipment: vi.fn(),
  deleteEquipment: vi.fn(),
  createEquipmentTransaction: vi.fn(),
  deleteEquipmentTransaction: vi.fn()
}))

vi.mock('@/services/coachSchedulesApi', () => ({
  listCoachScheduleDashboardMonth: listCoachScheduleDashboardMonthMock
}))

vi.mock('@/components/match-records/MatchDetailDialog.vue', () => ({
  default: {
    name: 'MatchDetailDialog',
    template: '<div data-test="match-detail-dialog-stub"></div>'
  }
}))

const mountedWrappers: VueWrapper[] = []

const sampleMatches = [
  {
    id: 'future-1',
    match_name: '春季聯賽',
    opponent: '台東新生',
    match_date: '2026-04-21',
    match_time: '09:00 - 11:00',
    location: '新莊棒球場',
    category_group: 'U12',
    match_level: '友誼賽',
    home_score: 0,
    opponent_score: 0,
    coaches: '',
    players: '',
    note: '',
    photo_url: '',
    absent_players: [],
    lineup: [],
    inning_logs: [],
    batting_stats: []
  },
  {
    id: 'past-1',
    match_name: '聯賽回顧',
    opponent: '忠孝國小',
    match_date: '2026-04-18',
    match_time: '14:00 - 16:00',
    location: '迪化球場',
    category_group: 'U12',
    match_level: '正式賽',
    home_score: 5,
    opponent_score: 3,
    coaches: '',
    players: '',
    note: '',
    photo_url: '',
    absent_players: [],
    lineup: [],
    inning_logs: [],
    batting_stats: []
  }
]

const sampleAnnouncements = [
  {
    id: 'announcement-1',
    title: '最新公告一',
    content: '公告內容一',
    created_at: '2026-04-20T10:00:00.000Z',
    is_pinned: true,
    image_url: null
  },
  {
    id: 'announcement-2',
    title: '最新公告二',
    content: '公告內容二',
    created_at: '2026-04-19T10:00:00.000Z',
    is_pinned: false,
    image_url: null
  }
]

const sampleAttendanceEvents = [
  {
    id: 'attendance-1',
    attendance_records: [
      { member_id: 'school-1', status: '請假' },
      { member_id: 'community-1', status: '請假' },
      { member_id: 'present-1', status: '出席' }
    ]
  },
  {
    id: 'attendance-2',
    attendance_records: [
      { member_id: 'community-1', status: '請假' }
    ]
  }
]

const sampleTeamMembers = [
  { id: 'school-1', role: '校隊', status: '在隊' },
  { id: 'community-1', role: '球員', status: '在隊' },
  { id: 'leave-only-1', role: '球員', status: '在隊' },
  { id: 'coach-1', role: '教練', status: '在隊' },
  { id: 'inactive-community-1', role: '球員', status: '離隊' },
  { id: 'inactive-coach-1', role: '教練', status: '退隊' }
]

const sampleTodayAttendanceStatus = {
  todayEvent: {
    id: 'attendance-1',
    title: '週六訓練點名',
    date: '2026-04-20',
    eventType: '練習'
  },
  todayEvents: [
    {
      id: 'attendance-1',
      title: '週六訓練點名',
      date: '2026-04-20',
      eventType: '練習'
    },
    {
      id: 'attendance-2',
      title: '室內體能點名',
      date: '2026-04-20',
      eventType: '練習'
    }
  ],
  todayLeaveNames: ['小明', '小華'],
  todayLeaveCount: 2
}

const sampleEquipments = [
  {
    id: 'equipment-1',
    name: '練習球帽',
    category: '服飾類',
    specs: '兒童尺寸',
    notes: null,
    image_url: null,
    image_urls: [],
    purchase_price: 450,
    quick_purchase_enabled: true,
    is_custom_order: false,
    requires_jersey_number: false,
    jersey_number_min: 0,
    jersey_number_max: 99,
    jersey_number_options: [],
    total_quantity: 10,
    purchased_by: null,
    sizes_stock: [{ size: 'M', quantity: 6 }],
    created_at: '2026-04-20T10:00:00.000Z',
    updated_at: '2026-04-20T10:00:00.000Z',
    equipment_transactions: [],
    reserved_request_items: []
  },
  {
    id: 'equipment-2',
    name: '隊徽水壺',
    category: '其他',
    specs: null,
    notes: '限量商品',
    image_url: null,
    image_urls: [],
    purchase_price: 320,
    quick_purchase_enabled: true,
    is_custom_order: false,
    requires_jersey_number: false,
    jersey_number_min: 0,
    jersey_number_max: 99,
    jersey_number_options: [],
    total_quantity: 5,
    purchased_by: null,
    sizes_stock: [],
    created_at: '2026-04-19T10:00:00.000Z',
    updated_at: '2026-04-19T10:00:00.000Z',
    equipment_transactions: [],
    reserved_request_items: []
  }
]

const sampleCoachSchedulePayload = {
  month_start: dayjs().startOf('month').format('YYYY-MM-DD'),
  scope: 'own',
  events: [
    {
      id: 'coach-schedule-1',
      is_persisted: true,
      is_candidate: false,
      source_type: 'training_date',
      source_id: null,
      source_venue_id: null,
      schedule_date: dayjs().format('YYYY-MM-DD'),
      start_time: '09:00',
      end_time: '12:30',
      title: '週六訓練',
      location: '中港國小',
      location_url: null,
      legacy_coaches: null,
      status: 'scheduled',
      note: null,
      coach_profile_ids: ['user-1'],
      assignments: [],
      created_at: null,
      updated_at: null
    }
  ]
}

vi.stubGlobal('fetch', fetchMock)

const mountHomeView = async ({
  role = 'MANAGER',
  linkedTeamMemberIds = [] as string[],
  permissions = [] as string[],
  matches = sampleMatches,
  announcements = sampleAnnouncements,
  attendanceEvents = sampleAttendanceEvents,
  todayAttendanceStatus = sampleTodayAttendanceStatus,
  teamMembers = sampleTeamMembers,
  equipments = sampleEquipments,
  coachSchedulePayload = sampleCoachSchedulePayload
} = {}) => {
  setActivePinia(createPinia())

  const [{ useAuthStore }, { usePermissionsStore }, { useMatchesStore }, { default: HomeView }] = await Promise.all([
    import('@/stores/auth'),
    import('@/stores/permissions'),
    import('@/stores/matches'),
    import('./HomeView.vue')
  ])

  const authStore = useAuthStore()
  const permissionsStore = usePermissionsStore()
  const matchesStore = useMatchesStore()

  authStore.profile = {
    id: 'user-1',
    name: 'Bryan',
    role,
    linked_team_member_ids: linkedTeamMemberIds
  }

  permissionsStore.currentRole = role
  permissionsStore.permissions = permissions.map((feature) => ({
    feature,
    action: 'VIEW'
  }))

  vi.spyOn(matchesStore, 'fetchDashboardMatches').mockImplementation(async () => {
    matchesStore.matches = matches as any
    return matches as any
  })

  teamMembersInMock.mockResolvedValue({
    data: teamMembers,
    error: null
  })
  leaveRequestsGteMock.mockResolvedValue({
    data: [
      { user_id: 'school-1' },
      { user_id: 'leave-only-1' }
    ],
    error: null
  })
  attendanceEventsEqMock.mockResolvedValue({
    data: attendanceEvents,
    error: null
  })
  announcementsLimitMock.mockResolvedValue({
    data: announcements,
    error: null
  })
  rpcMock.mockResolvedValue({
    data: todayAttendanceStatus,
    error: null
  })
  listCoachScheduleDashboardMonthMock.mockResolvedValue(coachSchedulePayload)
  fetchEquipmentsMock.mockResolvedValue(equipments)
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      current: {
        temperature_2m: 28,
        weather_code: 1,
        is_day: 1,
        wind_speed_10m: 10
      },
      daily: {
        weather_code: [1],
        temperature_2m_max: [31],
        temperature_2m_min: [24],
        precipitation_probability_max: [15],
        wind_speed_10m_max: [18]
      }
    })
  })

  const wrapper = shallowMount(HomeView, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
        MatchDetailDialog: true,
        CoachScheduleDashboardPanel: {
          props: ['payload', 'isLoading', 'canManage'],
          template: '<section data-test="coach-schedule-dashboard-stub">{{ payload?.scope }} {{ payload?.events?.length || 0 }} {{ canManage ? "manage" : "own" }}</section>'
        },
        'el-icon': true
      }
    }
  })

  mountedWrappers.push(wrapper)
  await flushPromises()

  return { wrapper }
}

beforeEach(() => {
  vi.clearAllMocks()
  latestTeamMembersRealtimeHandler = null
  myHomeServiceMocks.getMyHomeSnapshot.mockResolvedValue(createEmptyMyHomeSnapshot())
  myHomeServiceMocks.getMyHomeNextEvent.mockResolvedValue(null)
})

afterEach(() => {
  while (mountedWrappers.length > 0) {
    mountedWrappers.pop()?.unmount()
  }
})

describe('HomeView dashboard redesign', () => {
  it('loads a personalized Next Up event and refreshes it when the selected member changes', async () => {
    const snapshot = {
      ...createEmptyMyHomeSnapshot(),
      members: [
        { id: 'member-1', name: '小安', role: '球員', team_group: null, status: '在隊', jersey_number: null, avatar_url: null },
        { id: 'member-2', name: '小宇', role: '球員', team_group: null, status: '在隊', jersey_number: null, avatar_url: null }
      ],
      next_event: {
        id: 'unregistered-training',
        type: 'match' as const,
        title: '未報名特訓',
        date: '2026-07-12',
        time: '09:00 - 11:00',
        location: '中港國小',
        opponent: null,
        category_group: null,
        match_level: '特訓課',
        coaches: null,
        players: null,
        route: '/calendar?match_id=unregistered-training'
      }
    }
    const regularEvent = {
      ...snapshot.next_event,
      id: 'regular-match',
      title: '週末友誼賽',
      match_level: '友誼賽',
      route: '/calendar?match_id=regular-match'
    }
    const registeredTrainingEvent = {
      ...snapshot.next_event,
      id: 'registered-training',
      title: '已報名特訓',
      training_registration_status: 'selected' as const,
      is_training_registration_open: true,
      route: '/calendar?match_id=registered-training'
    }
    myHomeServiceMocks.getMyHomeSnapshot.mockResolvedValue(snapshot)
    myHomeServiceMocks.getMyHomeNextEvent
      .mockResolvedValueOnce(regularEvent)
      .mockResolvedValueOnce(registeredTrainingEvent)

    const { wrapper } = await mountHomeView({
      role: 'MEMBER',
      linkedTeamMemberIds: ['member-1', 'member-2']
    })
    const panel = wrapper.findComponent({ name: 'MyHomeTodayPanel' })

    expect(myHomeServiceMocks.getMyHomeNextEvent).toHaveBeenNthCalledWith(1, {
      memberId: 'member-1',
      today: dayjs().format('YYYY-MM-DD')
    })
    expect(panel.props('nextEvent')).toMatchObject({ id: 'regular-match' })

    panel.vm.$emit('update:selectedMemberId', 'member-2')
    await flushPromises()

    expect(myHomeServiceMocks.getMyHomeNextEvent).toHaveBeenNthCalledWith(2, {
      memberId: 'member-2',
      today: dayjs().format('YYYY-MM-DD')
    })
    expect(panel.props('nextEvent')).toMatchObject({ id: 'registered-training' })
  })

  it('does not fall back to an unverified training event when the personalized RPC fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    myHomeServiceMocks.getMyHomeSnapshot.mockResolvedValue({
      ...createEmptyMyHomeSnapshot(),
      members: [
        { id: 'member-1', name: '小安', role: '球員', team_group: null, status: '在隊', jersey_number: null, avatar_url: null }
      ],
      next_event: {
        id: 'unverified-training',
        type: 'match',
        title: '特訓課',
        date: '2026-07-12',
        time: '09:00 - 11:00',
        location: '中港國小',
        opponent: null,
        category_group: null,
        match_level: '特訓課',
        coaches: null,
        players: null,
        route: '/calendar?match_id=unverified-training'
      }
    })
    myHomeServiceMocks.getMyHomeNextEvent.mockRejectedValue(new Error('RPC unavailable'))

    const { wrapper } = await mountHomeView({
      role: 'MEMBER',
      linkedTeamMemberIds: ['member-1']
    })

    expect(wrapper.findComponent({ name: 'MyHomeTodayPanel' }).props('nextEvent')).toBeNull()
  })

  it('shows the admin stats cards for ADMIN users', async () => {
    const { wrapper } = await mountHomeView({
      role: 'ADMIN'
    })

    expect(wrapper.find('[data-test="admin-stats"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Team Members')
    expect(wrapper.text()).toContain('Today Leaves')
    expect(wrapper.find('[data-test="team-members-total"]').text()).toContain('3')
    expect(wrapper.find('[data-test="school-team-count"]').text()).toContain('校隊 1')
    expect(wrapper.find('[data-test="community-members-count"]').text()).toContain('社區 2')
    expect(wrapper.find('[data-test="coach-members-count"]').text()).toContain('教練 1')
    expect(wrapper.find('[data-test="inactive-members-count"]').text()).toContain('退隊/離隊 1')
    expect(wrapper.find('[data-test="today-leaves-total"]').text()).toContain('3')
    expect(wrapper.find('[data-test="today-leave-requests-count"]').text()).toContain('請假系統 2')
    expect(wrapper.find('[data-test="today-attendance-leaves-count"]').text()).toContain('今日點名 2')
    expect(wrapper.find('[data-test="today-attendance-events-count"]').text()).toContain('點名單 2')
    expect(teamMembersInMock).toHaveBeenCalledWith('role', ['球員', '校隊', '教練'])
    expect(attendanceEventsSelectMock).toHaveBeenCalledWith('id, attendance_records(member_id, status)')
    expect(channelMock).toHaveBeenCalledWith('dashboard-admin-team-members-stats')
    expect(realtimeChannelMock.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'team_members' },
      expect.any(Function)
    )
  })

  it('excludes coaches from the Team Members total while keeping the coach count visible', async () => {
    const teamMembers = [
      ...Array.from({ length: 16 }, (_, index) => ({ id: `school-${index}`, role: '校隊', status: '在隊' })),
      ...Array.from({ length: 60 }, (_, index) => ({ id: `community-${index}`, role: '球員', status: '在隊' })),
      ...Array.from({ length: 6 }, (_, index) => ({ id: `coach-${index}`, role: '教練', status: '在隊' }))
    ]

    const { wrapper } = await mountHomeView({
      role: 'ADMIN',
      teamMembers
    })

    expect(wrapper.find('[data-test="team-members-total"]').text()).toContain('76')
    expect(wrapper.find('[data-test="school-team-count"]').text()).toContain('校隊 16')
    expect(wrapper.find('[data-test="community-members-count"]').text()).toContain('社區 60')
    expect(wrapper.find('[data-test="coach-members-count"]').text()).toContain('教練 6')
  })

  it('refreshes admin stats when team member rows change', async () => {
    const { wrapper } = await mountHomeView({
      role: 'ADMIN'
    })

    expect(wrapper.find('[data-test="team-members-total"]').text()).toContain('3')
    expect(latestTeamMembersRealtimeHandler).toEqual(expect.any(Function))

    teamMembersInMock.mockResolvedValueOnce({
      data: [
        { id: 'school-1', role: '校隊', status: '在隊' },
        { id: 'community-1', role: '球員', status: '在隊' },
        { id: 'community-2', role: '球員', status: '在隊' },
        { id: 'community-3', role: '球員', status: '在隊' },
        { id: 'coach-1', role: '教練', status: '在隊' }
      ],
      error: null
    })

    latestTeamMembersRealtimeHandler?.()
    await flushPromises()

    expect(wrapper.find('[data-test="team-members-total"]').text()).toContain('4')
    expect(wrapper.find('[data-test="community-members-count"]').text()).toContain('社區 3')
  })

  it('hides the admin stats cards for non-admin users', async () => {
    const { wrapper } = await mountHomeView({
      role: 'MANAGER',
      permissions: ['matches', 'announcements']
    })

    expect(wrapper.find('[data-test="admin-stats"]').exists()).toBe(false)
  })

  it('shows this month coach schedule for coach users', async () => {
    const { wrapper } = await mountHomeView({
      role: 'COACH',
      permissions: []
    })

    const panel = wrapper.find('[data-test="coach-schedule-dashboard-stub"]')

    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('own 1 own')
    expect(listCoachScheduleDashboardMonthMock).toHaveBeenCalledWith(dayjs().format('YYYY-MM'))
  })

  it('shows all coach schedules for coach schedule viewers', async () => {
    const { wrapper } = await mountHomeView({
      role: 'MANAGER',
      permissions: ['coach_schedules'],
      coachSchedulePayload: {
        ...sampleCoachSchedulePayload,
        scope: 'all'
      }
    })

    const panel = wrapper.find('[data-test="coach-schedule-dashboard-stub"]')

    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('all 1 manage')
  })

  it('hides coach schedule dashboard for users without coach role or permission', async () => {
    const { wrapper } = await mountHomeView({
      role: 'MANAGER',
      permissions: ['matches', 'announcements']
    })

    expect(wrapper.find('[data-test="coach-schedule-dashboard-stub"]').exists()).toBe(false)
    expect(listCoachScheduleDashboardMonthMock).not.toHaveBeenCalled()
  })

  it('shows the collapsible today attendance status for leave request viewers', async () => {
    const { wrapper } = await mountHomeView({
      role: 'MANAGER',
      permissions: ['leave_requests']
    })

    const panel = wrapper.find('[data-test="today-attendance-status"]')
    const toggle = wrapper.find('[data-test="today-attendance-toggle"]')

    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('今日訓練點名狀態')
    expect(panel.text()).toContain('今日 2 張點名單')
    expect(panel.text()).toContain('週六訓練點名')
    expect(panel.text()).toContain('室內體能點名')
    expect(wrapper.findAll('[data-test="today-attendance-event-item"]')).toHaveLength(2)
    expect(wrapper.find('[data-test="today-attendance-leave-total"]').text()).toContain('2')
    expect(panel.text()).toContain('小明')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(rpcMock).toHaveBeenCalledWith('get_dashboard_today_attendance_status', {
      p_today: dayjs().format('YYYY-MM-DD')
    })

    await toggle.trigger('click')

    expect(toggle.attributes('aria-expanded')).toBe('true')
  })

  it('hides the today attendance status and skips its RPC without leave request view permission', async () => {
    const { wrapper } = await mountHomeView({
      role: 'MANAGER',
      permissions: ['matches', 'announcements']
    })

    expect(wrapper.find('[data-test="today-attendance-status"]').exists()).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('removes the old todo and live/standings blocks from the dashboard', async () => {
    const { wrapper } = await mountHomeView({
      role: 'MANAGER',
      permissions: ['matches', 'announcements']
    })

    expect(wrapper.text()).not.toContain('待辦清單')
    expect(wrapper.text()).not.toContain('比賽直播')
    expect(wrapper.text()).not.toContain('戰績表')
  })

  it('keeps the dashboard match sections available to authenticated users', async () => {
    const { wrapper } = await mountHomeView({
      role: 'MANAGER',
      permissions: ['announcements'],
      matches: []
    })

    expect(wrapper.find('[data-test="upcoming-section"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="recent-section"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="hero-action-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="hero-match-info"]').exists()).toBe(false)
  })

  it('hides the announcements section when the user has no announcements permission', async () => {
    const { wrapper } = await mountHomeView({
      role: 'MANAGER',
      permissions: ['matches']
    })

    expect(wrapper.find('[data-test="news-section"]').exists()).toBe(false)
  })

  it('shows available equipment add-ons and links to the add-ons page', async () => {
    const { wrapper } = await mountHomeView({
      role: 'MANAGER',
      permissions: ['matches', 'announcements']
    })

    expect(wrapper.find('[data-test="equipment-addons-section"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('裝備加購')
    expect(wrapper.text()).toContain('練習球帽')
    expect(wrapper.text()).toContain('隊徽水壺')

    await wrapper.find('[data-test="equipment-addons-link"]').trigger('click')

    expect(pushMock).toHaveBeenCalledWith('/equipment-addons')
  })

  it('fetches dashboard weather for the next match location', async () => {
    const matchDate = dayjs().add(2, 'day').format('YYYY-MM-DD')

    const { wrapper } = await mountHomeView({
      role: 'MANAGER',
      permissions: ['matches'],
      matches: [
        {
          ...sampleMatches[0],
          id: 'future-weather-match',
          match_date: matchDate,
          location: '新莊棒球場'
        }
      ]
    })

    const weatherRequestUrl = new URL(String(fetchMock.mock.calls[0][0]))

    expect(weatherRequestUrl.hostname).toBe('api.open-meteo.com')
    expect(weatherRequestUrl.searchParams.get('latitude')).toBe('25.0411')
    expect(weatherRequestUrl.searchParams.get('longitude')).toBe('121.4478')
    expect(weatherRequestUrl.searchParams.get('start_date')).toBe(matchDate)
    expect(wrapper.text()).toContain('新莊棒球場')
  })
})
