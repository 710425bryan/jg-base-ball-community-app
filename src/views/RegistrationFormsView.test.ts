// @vitest-environment jsdom
import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RegistrationFormsView from './RegistrationFormsView.vue'

const { fetchTemplatesMock, loadRosterMock } = vi.hoisted(() => ({
  fetchTemplatesMock: vi.fn(),
  loadRosterMock: vi.fn()
}))

vi.mock('@/services/registrationFormsApi', () => ({
  fetchRegistrationFormTemplates: fetchTemplatesMock,
  uploadRegistrationFormTemplate: vi.fn(),
  deleteRegistrationFormTemplate: vi.fn(),
  downloadRegistrationFormTemplate: vi.fn(),
  generateRegistrationFormDocument: vi.fn()
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
    loadRoster: loadRosterMock
  })
}))

describe('RegistrationFormsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchTemplatesMock.mockResolvedValue([{
      id: 'template-1',
      name: '就是棒臺北',
      original_file_name: 'template.xlsx',
      file_type: 'xlsx',
      profile_key: 'just_baseball_taipei',
      profile_version: 1,
      max_players: 30,
      has_photo_slots: true,
      storage_path: 'template.xlsx',
      created_at: '2026-08-18',
      updated_at: '2026-08-18'
    }])
    loadRosterMock.mockResolvedValue([])
  })

  it('loads template metadata and requires the full roster scope before opening the wizard', async () => {
    const wrapper = shallowMount(RegistrationFormsView, {
      global: {
        stubs: {
          'el-alert': true,
          'el-button': true,
          'el-empty': true,
          'el-icon': true,
          'el-upload': true
        }
      }
    })
    await flushPromises()
    const vm = wrapper.vm as any
    expect(fetchTemplatesMock).toHaveBeenCalled()
    expect(vm.templates).toHaveLength(1)
    await vm.openWizard(vm.templates[0])
    expect(loadRosterMock).toHaveBeenCalledWith({
      userId: 'user-1',
      canEditPlayers: true
    })
    expect(vm.wizardOpen).toBe(true)
  })
})
