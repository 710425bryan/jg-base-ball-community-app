// @vitest-environment jsdom
// @ts-nocheck

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'

import LeaveMemberPicker from '@/components/leave/LeaveMemberPicker.vue'
import LeaveRequestsView from './LeaveRequestsView.vue'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} })
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    profile: {
      linked_team_member_ids: []
    }
  })
}))

vi.mock('@/stores/permissions', () => ({
  usePermissionsStore: () => ({
    can: () => true
  })
}))

vi.mock('@/stores/teamGroups', () => ({
  useTeamGroupsStore: () => ({
    options: [],
    loadGroups: vi.fn().mockResolvedValue(undefined)
  })
}))

vi.mock('@/utils/pushNotifications', () => ({
  buildGroupedPushEventKey: vi.fn(() => 'leave:test'),
  describePushDispatchIssue: vi.fn(() => ''),
  dispatchPushNotification: vi.fn().mockResolvedValue({ success: true })
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn()
  },
  ElMessageBox: {
    confirm: vi.fn()
  }
}))

vi.mock('@/services/supabase', () => {
  const createQuery = () => {
    const query: Record<string, any> = {}
    ;['select', 'order', 'lte', 'gte', 'in', 'insert', 'delete', 'eq'].forEach((method) => {
      query[method] = vi.fn(() => query)
    })
    query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve, reject)
    return query
  }

  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn(() => channel)
  }

  return {
    supabase: {
      from: vi.fn(() => createQuery()),
      channel: vi.fn(() => channel),
      removeChannel: vi.fn()
    }
  }
})

const wrappers: Array<ReturnType<typeof shallowMount>> = []

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))
  })
})

const mountView = async () => {
  const wrapper = shallowMount(LeaveRequestsView, {
    global: {
      directives: {
        loading: {}
      },
      stubs: {
        AppPageHeader: {
          template: '<section><slot name="actions" /><slot /></section>'
        },
        AppLoadingState: true,
        AppSearchInput: true,
        PushSettingsDialog: true,
        ViewModeSwitch: true,
        'el-date-picker': true,
        'el-checkbox-button': true,
        'el-checkbox-group': {
          template: '<div><slot /></div>'
        },
        'el-dialog': {
          template: '<section><slot /><slot name="footer" /></section>'
        },
        'el-form': {
          template: '<form><slot /></form>',
          methods: {
            clearValidate: vi.fn(),
            validateField: vi.fn().mockResolvedValue(undefined)
          }
        },
        'el-form-item': {
          template: '<label><slot /></label>'
        },
        'el-icon': {
          template: '<span><slot /></span>'
        },
        'el-input': true,
        'el-option': true,
        'el-radio-button': true,
        'el-radio-group': {
          template: '<div><slot /></div>'
        },
        'el-select': true,
        'el-tab-pane': {
          template: '<section><slot /></section>'
        },
        'el-tabs': {
          template: '<div><slot /></div>'
        },
        'el-table': {
          template: '<div><slot /></div>'
        },
        'el-table-column': {
          template: '<div><slot :row="{}" /></div>'
        }
      }
    }
  })

  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
})

describe('LeaveRequestsView', () => {
  it('loads the roster picker from the safe team member view', async () => {
    const { supabase } = await import('@/services/supabase')

    await mountView()

    expect(supabase.from).toHaveBeenCalledWith('team_members_safe')
  })

  it('uses the direct mobile member picker and applies its selection', async () => {
    const wrapper = await mountView()
    wrapper.vm.isDesktopViewport = false
    wrapper.vm.team_members_list = [
      {
        id: 'member-1',
        name: '王小明',
        role: '球員',
        team_group: 'U12熊戰組',
        jersey_number: '10'
      },
      {
        id: 'member-2',
        name: '陳大華',
        role: '校隊',
        team_group: '校隊',
        jersey_number: '18'
      }
    ]

    await wrapper.vm.$nextTick()

    const picker = wrapper.findComponent(LeaveMemberPicker)
    expect(picker.exists()).toBe(true)
    expect(picker.props('members')).toHaveLength(2)

    picker.vm.$emit('update:modelValue', 'member-1')
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.form.user_id).toBe('member-1')
  })
})
