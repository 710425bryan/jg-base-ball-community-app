// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { RouterLinkStub, flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'

const pushMock = vi.fn()
const fetchMock = vi.fn()
const fetchEquipmentsMock = vi.fn()

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

  if (table === 'announcements') {
    return {
      select: announcementsSelectMock
    }
  }

  throw new Error(`Unexpected table: ${table}`)
})

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
    from: fromMock
  }
}))

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

const sampleEquipments = [
  {
    id: 'equipment-1',
    name: '練習球帽',
    category: '服飾類',
    specs: '兒童尺寸',
    notes: null,
    image_url: null,
    purchase_price: 450,
    quick_purchase_enabled: true,
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
    purchase_price: 320,
    quick_purchase_enabled: true,
    total_quantity: 5,
    purchased_by: null,
    sizes_stock: [],
    created_at: '2026-04-19T10:00:00.000Z',
    updated_at: '2026-04-19T10:00:00.000Z',
    equipment_transactions: [],
    reserved_request_items: []
  }
]

vi.stubGlobal('fetch', fetchMock)

const mountHomeView = async ({
  role = 'MANAGER',
  permissions = [] as string[],
  matches = sampleMatches,
  announcements = sampleAnnouncements,
  equipments = sampleEquipments
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
    role
  }

  permissionsStore.currentRole = role
  permissionsStore.permissions = permissions.map((feature) => ({
    feature,
    action: 'VIEW'
  }))

  vi.spyOn(matchesStore, 'fetchMatches').mockImplementation(async () => {
    matchesStore.matches = matches as any
  })

  teamMembersInMock.mockResolvedValue({
    data: [
      { role: '校隊', status: '在隊' },
      { role: '球員', status: '在隊' },
      { role: '球員', status: '離隊' }
    ],
    error: null
  })
  leaveRequestsGteMock.mockResolvedValue({
    count: 2,
    error: null
  })
  announcementsLimitMock.mockResolvedValue({
    data: announcements,
    error: null
  })
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
        temperature_2m_max: [31],
        temperature_2m_min: [24],
        precipitation_probability_max: [15]
      }
    })
  })

  const wrapper = shallowMount(HomeView, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
        MatchDetailDialog: true,
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
})

afterEach(() => {
  while (mountedWrappers.length > 0) {
    mountedWrappers.pop()?.unmount()
  }
})

describe('HomeView dashboard redesign', () => {
  it('shows the admin stats cards for ADMIN users', async () => {
    const { wrapper } = await mountHomeView({
      role: 'ADMIN'
    })

    expect(wrapper.find('[data-test="admin-stats"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Team Members')
    expect(wrapper.text()).toContain('Today Leaves')
  })

  it('hides the admin stats cards for non-admin users', async () => {
    const { wrapper } = await mountHomeView({
      role: 'MANAGER',
      permissions: ['matches', 'announcements']
    })

    expect(wrapper.find('[data-test="admin-stats"]').exists()).toBe(false)
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

  it('hides match sections when the user has no matches permission', async () => {
    const { wrapper } = await mountHomeView({
      role: 'MANAGER',
      permissions: ['announcements'],
      matches: []
    })

    expect(wrapper.find('[data-test="upcoming-section"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="recent-section"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="hero-action-panel"]').exists()).toBe(false)
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
})
