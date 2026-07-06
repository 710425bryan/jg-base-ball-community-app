// @vitest-environment jsdom
// @ts-nocheck

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'

import TrainingLocationsView from './TrainingLocationsView.vue'

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  ensureInitialized: vi.fn(),
  signOut: vi.fn(),
  permissionsCan: vi.fn(),
  loadGroups: vi.fn(),
  listSettings: vi.fn(),
  listVenues: vi.fn(),
  listSessions: vi.fn(),
  listRoster: vi.fn(),
  saveSession: vi.fn(),
  publishSession: vi.fn(),
  deleteSession: vi.fn(),
  createAttendanceEvent: vi.fn(),
  dispatchNotifications: vi.fn(),
  messageSuccess: vi.fn(),
  messageWarning: vi.fn(),
  messageError: vi.fn(),
  messageBoxConfirm: vi.fn()
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mocks.routerPush,
    replace: mocks.routerReplace
  })
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    ensureInitialized: mocks.ensureInitialized,
    signOut: mocks.signOut
  })
}))

vi.mock('@/stores/permissions', () => ({
  usePermissionsStore: () => ({
    can: mocks.permissionsCan
  })
}))

vi.mock('@/stores/teamGroups', () => ({
  useTeamGroupsStore: () => ({
    options: [],
    loadGroups: mocks.loadGroups
  })
}))

vi.mock('@/services/trainingProgramsApi', () => ({
  trainingProgramsApi: {
    listSettings: mocks.listSettings
  }
}))

vi.mock('@/services/trainingLocationsApi', () => ({
  TrainingLocationAuthError: class TrainingLocationAuthError extends Error {},
  trainingLocationsApi: {
    listVenues: mocks.listVenues,
    listSessions: mocks.listSessions,
    listRoster: mocks.listRoster,
    saveSession: mocks.saveSession,
    publishSession: mocks.publishSession,
    deleteSession: mocks.deleteSession,
    createAttendanceEvent: mocks.createAttendanceEvent,
    dispatchNotifications: mocks.dispatchNotifications
  }
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    success: mocks.messageSuccess,
    warning: mocks.messageWarning,
    error: mocks.messageError
  },
  ElMessageBox: {
    confirm: mocks.messageBoxConfirm
  }
}))

const mountView = async () => {
  const wrapper = shallowMount(TrainingLocationsView, {
    global: {
      stubs: {
        AppPageHeader: {
          template: '<section><slot name="actions" /><slot /></section>'
        },
        AppLoadingState: true,
        'el-checkbox': true,
        'el-checkbox-button': true,
        'el-checkbox-group': true,
        'el-date-picker': true,
        'el-form-item': {
          template: '<label><slot /></label>'
        },
        'el-icon': {
          template: '<span><slot /></span>'
        },
        'el-input': true,
        'el-option': true,
        'el-select': true,
        'el-switch': true,
        'el-time-picker': true,
        'el-tooltip': {
          template: '<span><slot /></span>'
        }
      }
    }
  })

  await flushPromises()
  return wrapper
}

describe('TrainingLocationsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.permissionsCan.mockReturnValue(true)
    mocks.ensureInitialized.mockResolvedValue(undefined)
    mocks.signOut.mockResolvedValue(undefined)
    mocks.loadGroups.mockResolvedValue(undefined)
    mocks.listSettings.mockResolvedValue([
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
    mocks.listVenues.mockResolvedValue([])
    mocks.listSessions.mockResolvedValue([])
    mocks.listRoster.mockResolvedValue([])
    mocks.saveSession.mockResolvedValue(null)
    mocks.publishSession.mockResolvedValue(null)
    mocks.deleteSession.mockResolvedValue(undefined)
    mocks.createAttendanceEvent.mockResolvedValue('attendance-1')
    mocks.dispatchNotifications.mockResolvedValue(null)
    mocks.messageBoxConfirm.mockResolvedValue(undefined)
  })

  it('uses 訓練課程 as the default title for new training location sessions and venues', async () => {
    const wrapper = await mountView()

    expect(wrapper.vm.form.title).toBe('訓練課程')
    expect(wrapper.vm.form.venues[0].title).toBe('訓練課程')

    await wrapper.vm.startCreate()
    await flushPromises()

    expect(wrapper.vm.form.title).toBe('訓練課程')
    expect(wrapper.vm.form.venues[0].title).toBe('訓練課程')
  })
})
