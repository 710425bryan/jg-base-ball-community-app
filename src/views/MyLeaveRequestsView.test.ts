// @vitest-environment jsdom
// @ts-nocheck

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import MyLeaveRequestsView from './MyLeaveRequestsView.vue'

const mocks = vi.hoisted(() => ({
  listMyLeaveMembers: vi.fn(),
  listMyLeaveRequests: vi.fn(),
  createMyLeaveRequests: vi.fn(),
  deleteMyLeaveRequest: vi.fn(),
  listTrainingProgramSettings: vi.fn(),
  getMonthDates: vi.fn(),
  dispatchPushNotification: vi.fn(),
  messageSuccess: vi.fn(),
  messageWarning: vi.fn(),
  messageError: vi.fn(),
  messageBoxConfirm: vi.fn()
}))

vi.mock('@/services/myLeaveRequests', () => ({
  listMyLeaveMembers: mocks.listMyLeaveMembers,
  listMyLeaveRequests: mocks.listMyLeaveRequests,
  createMyLeaveRequests: mocks.createMyLeaveRequests,
  deleteMyLeaveRequest: mocks.deleteMyLeaveRequest
}))

vi.mock('@/services/trainingProgramsApi', () => ({
  trainingProgramsApi: {
    listSettings: mocks.listTrainingProgramSettings
  }
}))

vi.mock('@/services/trainingDatesApi', () => ({
  trainingDatesApi: {
    getMonthDates: mocks.getMonthDates
  }
}))

vi.mock('@/utils/pushNotifications', () => ({
  buildGroupedPushEventKey: (_prefix: string, ids: string[]) => `leave_request:${ids.join(',')}`,
  describePushDispatchIssue: () => '',
  dispatchPushNotification: mocks.dispatchPushNotification
}))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...actual,
    ElMessage: {
      success: mocks.messageSuccess,
      warning: mocks.messageWarning,
      error: mocks.messageError
    },
    ElMessageBox: {
      confirm: mocks.messageBoxConfirm
    }
  }
})

const ElDialogStub = defineComponent({
  props: {
    modelValue: { type: Boolean, default: false }
  },
  setup(props, { slots }) {
    return () => props.modelValue
      ? h('section', { 'data-test': 'create-dialog' }, [
        slots.default?.(),
        slots.footer?.()
      ])
      : null
  }
})

const ElFormStub = defineComponent({
  setup(_props, { slots, expose }) {
    expose({
      validate: vi.fn().mockResolvedValue(true),
      clearValidate: vi.fn()
    })

    return () => h('form', { 'data-test': 'leave-form' }, slots.default?.())
  }
})

const ElFormItemStub = defineComponent({
  props: {
    label: { type: String, default: '' }
  },
  setup(props, { slots }) {
    return () => h('label', {}, [
      props.label ? h('span', {}, props.label) : null,
      slots.default?.()
    ])
  }
})

const passthroughStub = (tag = 'div') => defineComponent({
  setup(_props, { slots }) {
    return () => h(tag, {}, slots.default?.())
  }
})

const mountView = async () => {
  const wrapper = mount(MyLeaveRequestsView, {
    global: {
      stubs: {
        AppLoadingState: true,
        AppPageHeader: {
          template: '<header><slot name="actions" /><slot /></header>'
        },
        'el-alert': passthroughStub('section'),
        'el-checkbox-button': passthroughStub('span'),
        'el-checkbox-group': passthroughStub('div'),
        'el-date-picker': true,
        'el-dialog': ElDialogStub,
        'el-form': ElFormStub,
        'el-form-item': ElFormItemStub,
        'el-input': true,
        'el-option': true,
        'el-radio-button': passthroughStub('span'),
        'el-radio-group': passthroughStub('div'),
        'el-select': passthroughStub('div')
      }
    }
  })

  await flushPromises()
  await nextTick()
  return wrapper
}

const openCreateDialog = async (wrapper: ReturnType<typeof mount>) => {
  await (wrapper.vm as any).openCreateDialog()
  await flushPromises()
  await nextTick()
}

describe('MyLeaveRequestsView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-08T00:00:00+08:00'))
    vi.clearAllMocks()

    mocks.listTrainingProgramSettings.mockResolvedValue([
      {
        program_key: 'chunggang_school_team',
        label: '中港總部',
        team_group: '中港校隊',
        default_weekdays: [6],
        default_start_time: '09:00',
        default_end_time: '12:30',
        default_venue_name: '中港國小',
        default_venue_address: null,
        default_venue_maps_url: null,
        sort_order: 10,
        is_active: true,
        created_at: null,
        updated_at: null
      }
    ])
    mocks.listMyLeaveMembers.mockResolvedValue([
      {
        member_id: 'member-1',
        name: '王小明',
        role: '校隊',
        team_group: '中港校隊',
        training_program: 'chunggang_school_team',
        is_linked: true
      }
    ])
    mocks.listMyLeaveRequests.mockResolvedValue([])
    mocks.createMyLeaveRequests.mockResolvedValue([
      { id: 'leave-1', reason: '家庭活動' },
      { id: 'leave-2', reason: '家庭活動' }
    ])
    mocks.dispatchPushNotification.mockResolvedValue({ success: true })
    mocks.getMonthDates.mockImplementation((month: string) => Promise.resolve({
      month_start: `${month}-01`,
      month,
      program_key: 'chunggang_school_team',
      program_label: '中港總部',
      training_dates: {
        '2026-07': ['2026-07-04', '2026-07-11'],
        '2026-08': ['2026-08-01', '2026-08-08'],
        '2026-09': ['2026-09-05']
      }[month] || [],
      note: null,
      is_default: false,
      updated_at: null
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads current and future training dates when opening the create dialog', async () => {
    const wrapper = await mountView()

    await openCreateDialog(wrapper)

    expect(mocks.getMonthDates).toHaveBeenCalledWith('2026-07', expect.objectContaining({
      programKey: 'chunggang_school_team'
    }))
    expect(mocks.getMonthDates).toHaveBeenCalledWith('2026-08', expect.objectContaining({
      programKey: 'chunggang_school_team'
    }))
    expect(mocks.getMonthDates).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-test="training-date-quick-select"]').exists()).toBe(true)
    expect(wrapper.find('[data-date="2026-07-04"]').exists()).toBe(true)
    expect(wrapper.get('[data-date="2026-07-04"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-date="2026-07-11"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-date="2026-08-01"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="load-previous-training-month"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="load-next-training-month"]').exists()).toBe(true)
  })

  it('submits selected training dates as separate one-day leave requests', async () => {
    const wrapper = await mountView()
    await openCreateDialog(wrapper)

    await wrapper.get('[data-date="2026-07-04"]').trigger('click')
    await wrapper.get('[data-date="2026-07-11"]').trigger('click')
    await wrapper.get('[data-date="2026-08-01"]').trigger('click')
    await wrapper.get('[data-test="submit-leave-request"]').trigger('click')
    await flushPromises()

    expect(mocks.createMyLeaveRequests).toHaveBeenCalledWith({
      member_id: 'member-1',
      records: [
        {
          leave_type: '事假',
          leave_time_segment: 'full_day',
          start_date: '2026-07-11',
          end_date: '2026-07-11',
          reason: null
        },
        {
          leave_type: '事假',
          leave_time_segment: 'full_day',
          start_date: '2026-08-01',
          end_date: '2026-08-01',
          reason: null
        }
      ]
    })
  })
})
