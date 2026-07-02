// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MatchFormDialog from '../MatchFormDialog.vue'
import { previewMatchLeaveAbsences } from '@/services/matchLeaveAbsences'

vi.mock('@/stores/matches', () => ({
  useMatchesStore: () => ({
    matches: [],
    loading: false,
    fetchMatch: vi.fn(),
    createMatch: vi.fn(),
    updateMatch: vi.fn(),
    deleteMatch: vi.fn()
  })
}))

const teamMembersChain = {
  select: vi.fn(() => teamMembersChain),
  order: vi.fn(() => teamMembersChain),
  then: (resolve: (value: unknown) => void) => resolve({
    data: [
      { id: 'p1', name: '王大雷', role: '球員', status: '在隊', jersey_number: '18', fee_billing_mode: 'role_default', avatar_url: 'https://example.com/wang.jpg' },
      { id: 'p-no-fee', name: '免收費', role: '球員', status: '在隊', jersey_number: '99', fee_billing_mode: 'no_fee', avatar_url: 'https://example.com/no-fee.jpg' }
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

vi.mock('@/services/matchLeaveAbsences', () => ({
  previewMatchLeaveAbsences: vi.fn(async () => [])
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

beforeEach(() => {
  vi.mocked(previewMatchLeaveAbsences).mockReset()
  vi.mocked(previewMatchLeaveAbsences).mockResolvedValue([])
})

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

describe('MatchFormDialog no-fee roster exclusions', () => {
  it('excludes no-fee players from match roster candidates', async () => {
    const wrapper = await mountDialog()
    const vm = wrapper.vm as any

    await Promise.resolve()
    await nextTick()

    expect(vm.playerOptions.map((player: any) => player.name)).toEqual(['王大雷'])

    vm.formData.players = '王大雷,免收費'
    vm.formData.lineup = [
      { order: 1, position: '1', name: '王大雷', number: '18' },
      { order: 2, position: '2', name: '免收費', number: '99' }
    ]
    vm.formData.current_lineup = [
      { order: 1, position: '1', name: '免收費', number: '99' }
    ]
    vm.formData.batting_stats = [
      { name: '免收費', number: '99' },
      { name: '王大雷', number: '18' }
    ]
    vm.formData.pitching_stats = [
      { name: '免收費', number: '99' },
      { name: '王大雷', number: '18' }
    ]
    await nextTick()

    expect(vm.availablePlayerNames).toEqual(['王大雷'])
    expect(vm.getLineupRosterCandidates().map((player: any) => player.name)).toEqual(['王大雷'])
    expect(vm.matchAudioRoster.map((player: any) => player.name)).toEqual(['王大雷'])
  })
})

describe('MatchFormDialog leave request absence sync', () => {
  it('adds leave request absences for selected future match players', async () => {
    const wrapper = await mountDialog()
    const vm = wrapper.vm as any

    vm.formData.match_date = '2099-06-28'
    vm.formData.players = '王小明,李小華'
    await nextTick()
    vi.mocked(previewMatchLeaveAbsences).mockClear()
    vi.mocked(previewMatchLeaveAbsences).mockResolvedValueOnce([
      {
        name: '王小明',
        type: '事假',
        source: 'leave_request',
        member_id: 'member-1',
        leave_request_ids: ['leave-1'],
        start_date: '2099-06-28',
        end_date: '2099-06-28'
      }
    ])
    await vm.syncLeaveRequestAbsences()

    expect(previewMatchLeaveAbsences).toHaveBeenLastCalledWith('2099-06-28', ['王小明', '李小華'])
    expect(vm.formData.absent_players).toEqual([
      expect.objectContaining({
        name: '王小明',
        type: '事假',
        source: 'leave_request',
        member_id: 'member-1',
        leave_request_ids: ['leave-1']
      })
    ])
  })

  it('removes stale leave request absences while preserving manual absences', async () => {
    const wrapper = await mountDialog()
    const vm = wrapper.vm as any

    vm.formData.match_date = '2099-06-28'
    vm.formData.players = '王小明'
    vm.formData.absent_players = [
      {
        name: '王小明',
        type: '事假',
        source: 'leave_request',
        member_id: 'member-1',
        leave_request_ids: ['leave-1']
      },
      { name: '手動球員', type: '病假' }
    ]

    await vm.syncLeaveRequestAbsences()

    expect(vm.formData.absent_players).toEqual([{ name: '手動球員', type: '病假' }])
  })

  it('does not remove manual absences when no selected players can match leave requests', async () => {
    const wrapper = await mountDialog()
    const vm = wrapper.vm as any

    vi.mocked(previewMatchLeaveAbsences).mockClear()
    vm.formData.match_date = '2099-06-28'
    vm.formData.players = ''
    vm.formData.absent_players = [
      {
        name: '舊假單球員',
        type: '事假',
        source: 'leave_request',
        member_id: 'member-1',
        leave_request_ids: ['leave-1']
      },
      { name: '手動球員', type: '病假' }
    ]

    await vm.syncLeaveRequestAbsences()

    expect(previewMatchLeaveAbsences).not.toHaveBeenCalled()
    expect(vm.formData.absent_players).toEqual([{ name: '手動球員', type: '病假' }])
  })
})
