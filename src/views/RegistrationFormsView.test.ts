// @vitest-environment jsdom
import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RegistrationFormsView from './RegistrationFormsView.vue'

const mocks = vi.hoisted(() => ({
  fetchEvents: vi.fn(),
  fetchTemplates: vi.fn(),
  fetchLogs: vi.fn(),
  generateDocument: vi.fn(),
  loadRoster: vi.fn()
}))

vi.mock('@/services/registrationFormsApi', () => ({
  fetchRegistrationFormEvents: mocks.fetchEvents,
  fetchRegistrationFormTemplates: mocks.fetchTemplates,
  fetchRegistrationFormGenerationLogs: mocks.fetchLogs,
  saveRegistrationFormEvent: vi.fn(),
  deleteRegistrationFormEvent: vi.fn(),
  uploadRegistrationFormTemplate: vi.fn(),
  deleteRegistrationFormTemplate: vi.fn(),
  downloadRegistrationFormTemplate: vi.fn(),
  generateRegistrationFormDocument: mocks.generateDocument
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'user-1' } })
}))

vi.mock('@/stores/permissions', () => ({
  usePermissionsStore: () => ({
    can: (feature: string, action: string) =>
      feature === 'registration_forms' || (feature === 'players' && action === 'EDIT')
  })
}))

vi.mock('@/stores/playerRoster', () => ({
  usePlayerRosterStore: () => ({
    members: [{ id: 'member-1', name: '小熊' }],
    loadRoster: mocks.loadRoster
  })
}))

const template = {
  id: 'template-1',
  name: '就是棒臺北',
  original_file_name: 'template.xlsx',
  file_type: 'xlsx',
  profile_key: 'just_baseball_taipei',
  profile_version: 1,
  max_players: 30,
  has_photo_slots: true,
  storage_path: 'template.xlsx',
  created_by: null,
  updated_by: null,
  created_at: '2026-08-18',
  updated_at: '2026-08-18'
} as const

const event = {
  id: 'event-1',
  name: '就是棒秋季聯賽',
  season_year: 2026,
  category: 'U12',
  organizer: '',
  registration_deadline: '2026-09-01',
  status: 'draft',
  notes: '',
  template_ids: ['template-1'],
  created_by: null,
  updated_by: null,
  created_at: '2026-08-18',
  updated_at: '2026-08-18'
} as const

const stubs = {
  'el-button': true,
  'el-alert': true,
  'el-empty': true,
  'el-icon': true,
  'el-tag': true,
  'el-tabs': { template: '<div><slot/></div>' },
  'el-tab-pane': { template: '<section><slot/></section>' },
  'el-upload': true
}

describe('RegistrationFormsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetchTemplates.mockResolvedValue([template])
    mocks.fetchEvents.mockResolvedValue([event])
    mocks.fetchLogs.mockResolvedValue([])
    mocks.loadRoster.mockResolvedValue([])
    mocks.generateDocument.mockResolvedValue('output.xlsx')
  })

  it('loads event, template and generation metadata and opens the scoped wizard', async () => {
    const wrapper = shallowMount(RegistrationFormsView, { global: { stubs } })
    await flushPromises()
    const vm = wrapper.vm as any
    expect(mocks.fetchEvents).toHaveBeenCalled()
    expect(mocks.fetchTemplates).toHaveBeenCalled()
    expect(mocks.fetchLogs).toHaveBeenCalled()
    expect(vm.events).toHaveLength(1)
    expect(vm.templatesForEvent(vm.events[0])).toHaveLength(1)

    await vm.openWizard(vm.events[0], vm.templates[0])
    expect(mocks.loadRoster).toHaveBeenCalledWith({ userId: 'user-1', canEditPlayers: true })
    expect(vm.wizardOpen).toBe(true)
  })

  it('always sends the selected event id with the generate request', async () => {
    const wrapper = shallowMount(RegistrationFormsView, { global: { stubs } })
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.openWizard(vm.events[0], vm.templates[0])
    await vm.generate({ template_id: 'template-1', fields: {}, players: [] })
    expect(mocks.generateDocument).toHaveBeenCalledWith(expect.objectContaining({
      event_id: 'event-1',
      template_id: 'template-1'
    }), expect.stringContaining('就是棒秋季聯賽'))
  })
})
