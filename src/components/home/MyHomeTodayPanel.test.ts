// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RouterLinkStub, flushPromises, mount } from '@vue/test-utils'
import { getMyHomeTrainingMonthDates } from '@/services/myHome'
import MyHomeTodayPanel from './MyHomeTodayPanel.vue'
import { createEmptyMyHomeSnapshot, type MyHomeSnapshot } from '@/types/myHome'

vi.mock('@/services/myHome', () => ({
  getMyHomeTrainingMonthDates: vi.fn()
}))

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')
  return {
    ...actual,
    useRouter: () => ({
      push: vi.fn()
    })
  }
})

const getMyHomeTrainingMonthDatesMock = vi.mocked(getMyHomeTrainingMonthDates)

const buildSnapshot = (matchLevel: string | null): MyHomeSnapshot => ({
  ...createEmptyMyHomeSnapshot(),
  members: [
    {
      id: 'member-1',
      name: '測試球員',
      role: '球員',
      team_group: null,
      training_program: 'chunggang_school_team',
      training_program_label: '中港總部',
      status: '在隊',
      jersey_number: null,
      avatar_url: null,
      point_balance: 3,
      reserved_training_points: 0,
      available_training_points: 3
    }
  ],
  next_event: {
    id: 'match-1',
    type: 'match',
    title: '週末特訓課',
    date: '2026-05-09',
    time: '09:00 - 12:00',
    location: '中港球場',
    opponent: null,
    category_group: 'U12',
    match_level: matchLevel,
    coaches: null,
    players: null,
    route: '/calendar?match_id=match-1'
  },
  training_month_dates: [
    {
      date: '2026-05-02',
      weekday: '週六',
      label: '5/2 週六',
      is_today: false,
      is_past: true
    },
    {
      date: '2026-05-09',
      weekday: '週六',
      label: '5/9 週六',
      is_today: false,
      is_past: false
    }
  ]
})

const mountPanel = (snapshot: MyHomeSnapshot) => mount(MyHomeTodayPanel, {
  props: {
    snapshot,
    selectedMemberId: 'member-1',
    showTrainingRegistrationAction: true
  },
  global: {
    stubs: {
      RouterLink: RouterLinkStub,
      'el-icon': true,
      'el-option': true,
      'el-select': true
    }
  }
})

describe('MyHomeTodayPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-15T04:00:00.000Z'))
    getMyHomeTrainingMonthDatesMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('links to training registration when Next Up is a training class', () => {
    const wrapper = mountPanel(buildSnapshot('特訓課'))

    expect(wrapper.text()).toContain('特訓報名')
    expect(wrapper.findAllComponents(RouterLinkStub).some((link) => link.props('to') === '/training')).toBe(true)
    expect(wrapper.findAllComponents(RouterLinkStub).some((link) => link.props('to') === '/my-leave-requests')).toBe(false)
  })

  it('hides Next Up training and leave shortcuts for regular matches', () => {
    const wrapper = mountPanel(buildSnapshot('友誼賽'))

    expect(wrapper.text()).not.toContain('特訓報名')
    expect(wrapper.findAllComponents(RouterLinkStub).some((link) => link.props('to') === '/training')).toBe(false)
    expect(wrapper.text()).not.toContain('我要請假')
    expect(wrapper.findAllComponents(RouterLinkStub).some((link) => link.props('to') === '/my-leave-requests')).toBe(false)
  })

  it('shows all training dates for the current month', () => {
    const wrapper = mountPanel(buildSnapshot('友誼賽'))

    expect(wrapper.text()).toContain('本月訓練日期')
    expect(wrapper.text()).toContain('5/2 週六')
    expect(wrapper.text()).toContain('5/9 週六')
    expect(wrapper.text()).toContain('下一次 5/9 週六')
  })

  it('switches monthly training dates by selected member program', async () => {
    const snapshot = buildSnapshot('友誼賽')
    snapshot.members.push({
      id: 'member-2',
      name: '國中球員',
      role: '校隊',
      team_group: '國中校隊',
      training_program: 'junior_high_school_team',
      training_program_label: '新泰總部',
      status: '在隊',
      jersey_number: null,
      avatar_url: null,
      point_balance: 0,
      reserved_training_points: 0,
      available_training_points: 0
    })
    snapshot.training_month_dates_by_program = {
      chunggang_school_team: snapshot.training_month_dates,
      junior_high_school_team: [
        {
          date: '2026-05-03',
          weekday: '週日',
          label: '5/3 週日',
          is_today: false,
          is_past: false
        }
      ]
    }

    const wrapper = mountPanel(snapshot)
    await wrapper.setProps({ selectedMemberId: 'member-2' })

    expect(wrapper.text()).toContain('新泰總部')
    expect(wrapper.text()).toContain('5/3 週日')
    expect(wrapper.text()).not.toContain('5/2 週六')
  })

  it('loads the next month training dates from the month controls', async () => {
    getMyHomeTrainingMonthDatesMock.mockResolvedValue([
      {
        date: '2026-06-06',
        weekday: '週六',
        label: '6/6 週六',
        is_today: false,
        is_past: false
      }
    ])

    const wrapper = mountPanel(buildSnapshot('友誼賽'))
    await wrapper.find('[data-test="training-month-next"]').trigger('click')
    await flushPromises()

    expect(getMyHomeTrainingMonthDatesMock).toHaveBeenCalledWith({
      month: '2026-06',
      programKey: 'chunggang_school_team'
    })
    expect(wrapper.text()).toContain('6 月訓練日期')
    expect(wrapper.text()).toContain('6/6 週六')
    expect(wrapper.text()).toContain('共 1 天上課')
  })

  it('shows the year when the selected training month crosses years', async () => {
    vi.setSystemTime(new Date('2026-12-15T04:00:00.000Z'))
    getMyHomeTrainingMonthDatesMock.mockResolvedValue([
      {
        date: '2027-01-03',
        weekday: '週日',
        label: '1/3 週日',
        is_today: false,
        is_past: false
      }
    ])

    const wrapper = mountPanel(buildSnapshot('友誼賽'))
    await wrapper.find('[data-test="training-month-next"]').trigger('click')
    await flushPromises()

    expect(getMyHomeTrainingMonthDatesMock).toHaveBeenCalledWith({
      month: '2027-01',
      programKey: 'chunggang_school_team'
    })
    expect(wrapper.text()).toContain('2027 年 1 月訓練日期')
    expect(wrapper.text()).toContain('1/3 週日')
  })
})
