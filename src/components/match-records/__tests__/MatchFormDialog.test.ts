// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import MatchFormDialog from '../MatchFormDialog.vue'

vi.mock('@/stores/matches', () => ({
  useMatchesStore: () => ({
    fetchMatch: vi.fn(),
    addMatch: vi.fn(),
    updateMatch: vi.fn(),
    deleteMatch: vi.fn()
  })
}))

const teamMembersChain = {
  select: vi.fn(() => teamMembersChain),
  order: vi.fn(() => teamMembersChain),
  then: (resolve: (value: unknown) => void) => resolve({
    data: [
      { id: 'p1', name: '王大雷', role: '球員', status: '在隊', jersey_number: '18', avatar_url: 'https://example.com/wang.jpg' }
    ]
  })
}

vi.mock('@/services/supabase', () => ({
  supabase: {
    from: vi.fn(() => teamMembersChain),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: '' } }))
      }))
    },
    functions: {
      invoke: vi.fn()
    }
  }
}))

vi.mock('@/utils/imageCompressor', () => ({
  compressImage: vi.fn()
}))

vi.mock('@/utils/matchAudioDraftStore', () => ({
  listMatchAudioDrafts: vi.fn(async () => []),
  getMatchAudioDraftChunks: vi.fn(async () => []),
  updateMatchAudioDraft: vi.fn(),
  deleteMatchAudioDraft: vi.fn(),
  saveMatchAudioDraft: vi.fn(),
  addMatchAudioDraftChunk: vi.fn()
}))

const ElButtonStub = {
  props: ['disabled', 'loading'],
  emits: ['click'],
  template: '<button :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>'
}

const mountDialog = async () => {
  const wrapper = mount(MatchFormDialog, {
    props: {
      modelValue: true,
      matchId: null,
      mode: 'add'
    },
    global: {
      stubs: {
        ElDialog: {
          props: ['modelValue'],
          template: '<div v-if="modelValue"><slot /></div>'
        },
        ElButton: ElButtonStub,
        ElCollapseTransition: { template: '<div><slot /></div>' },
        ElDatePicker: true,
        ElIcon: { template: '<span><slot /></span>' },
        ElImage: true,
        ElInput: true,
        ElInputNumber: true,
        ElOption: true,
        ElSelect: true,
        ElTag: { template: '<span><slot /></span>' },
        MatchAudioRecorder: true,
        MatchFieldEditor: {
          emits: ['update:lineup'],
          template: `
            <button
              data-testid="stub-field-editor"
              @click="$emit('update:lineup', [{ order: 1, position: '1', name: '王大雷', number: '18' }])"
            >
              field editor
            </button>
          `
        },
        MatchLineupTab: true,
        MatchLiveController: true
      }
    }
  })

  ;(wrapper.vm as any).activeTab = 'sync'
  await nextTick()
  return wrapper
}

describe('MatchFormDialog sync current lineup editor', () => {
  it('collapses and expands the current lineup section', async () => {
    const wrapper = await mountDialog()
    const vm = wrapper.vm as any

    expect(vm.currentLineupCollapsed).toBe(false)

    await wrapper.find('[data-testid="current-lineup-collapse-toggle"]').trigger('click')
    expect(vm.currentLineupCollapsed).toBe(true)

    await wrapper.find('[data-testid="current-lineup-collapse-toggle"]').trigger('click')
    expect(vm.currentLineupCollapsed).toBe(false)
  })

  it('opens the editor and detail rows when adding a current lineup player', async () => {
    const wrapper = await mountDialog()
    const vm = wrapper.vm as any

    vm.currentLineupCollapsed = true
    vm.currentLineupDetailsCollapsed = true
    await nextTick()

    await wrapper.find('[data-testid="add-current-lineup-player"]').trigger('click')

    expect(vm.currentLineupCollapsed).toBe(false)
    expect(vm.currentLineupDetailsCollapsed).toBe(false)
    expect(vm.formData.current_lineup).toHaveLength(1)
    expect(vm.currentLineupMode).toBe('manual')
  })

  it('marks current lineup as manual when the field editor updates it', async () => {
    const wrapper = await mountDialog()
    const vm = wrapper.vm as any

    vm.currentLineupMode = 'synced'
    await nextTick()

    await wrapper.find('[data-testid="stub-field-editor"]').trigger('click')

    expect(vm.currentLineupMode).toBe('manual')
    expect(vm.formData.current_lineup[0]).toMatchObject({
      order: 1,
      position: '1',
      name: '王大雷',
      number: '18'
    })
  })
})
