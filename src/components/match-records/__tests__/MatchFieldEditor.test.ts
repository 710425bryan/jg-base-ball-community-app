// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MatchFieldEditor from '../MatchFieldEditor.vue'

const buildLineup = () => ([
  { order: 1, position: '1', name: '王大雷', number: '18', remark: '' },
  { order: 2, position: '2', name: '李小捕', number: '5', remark: '' },
  { order: 3, position: 'DH', name: '黃打者', number: '1', remark: 'DH' },
  { order: 4, position: '預備', name: '洪替補', number: '17', remark: '' },
  { order: 5, position: '', name: '', number: '', remark: '' }
])

const buildMeta = () => ({
  王大雷: { number: '18' },
  李小捕: { number: '5' },
  黃打者: { number: '1' },
  洪替補: { number: '17' }
})

const matchesMediaQuery = (query: string, state: { hover: boolean; fine: boolean }) => {
  const expectsHover = query.includes('(hover: hover)')
  const expectsNoHover = query.includes('(hover: none)')
  const expectsFine = query.includes('(pointer: fine)')
  const expectsCoarse = query.includes('(pointer: coarse)')

  let matches = true
  if (expectsHover) matches &&= state.hover
  if (expectsNoHover) matches &&= !state.hover
  if (expectsFine) matches &&= state.fine
  if (expectsCoarse) matches &&= !state.fine
  return matches
}

const setHoverCapability = ({ hover = true, fine = true } = {}) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      media: query,
      matches: matchesMediaQuery(query, { hover, fine }),
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  })
}

const mountEditor = (props = {}) => mount(MatchFieldEditor, {
  props: {
    lineup: buildLineup(),
    playerMetaByName: buildMeta(),
    ...props
  },
  global: {
    plugins: [ElementPlus]
  }
})

describe('MatchFieldEditor', () => {
  beforeEach(() => {
    setHoverCapability({ hover: true, fine: true })
  })

  it('defaults to an open docked drawer on hover-capable devices', () => {
    const wrapper = mountEditor()
    const vm = wrapper.vm as any

    expect(vm.supportsHoverPreview).toBe(true)
    expect(vm.isDrawerPinnedOpen).toBe(true)
    expect(vm.isDrawerVisible).toBe(true)
    expect(wrapper.find('[data-testid="field-drawer"]').attributes('data-mode')).toBe('docked')
    expect(wrapper.find('[data-testid="field-slot-1"]').text()).toContain('王大雷')
    expect(wrapper.find('[data-testid="field-slot-DH"]').text()).toContain('黃打者')
    expect(wrapper.find('[data-testid="field-bench-zone"]').text()).toContain('洪替補')
  })

  it('defaults to a collapsed drawer on coarse pointers and toggles it with the handle', async () => {
    setHoverCapability({ hover: false, fine: false })
    const wrapper = mountEditor()
    const vm = wrapper.vm as any

    expect(vm.supportsHoverPreview).toBe(false)
    expect(vm.isDrawerPinnedOpen).toBe(false)
    expect(vm.isDrawerVisible).toBe(false)
    expect(wrapper.find('[data-testid="field-inline-bench-zone"]').exists()).toBe(true)

    await wrapper.find('[data-testid="field-drawer-handle"]').trigger('click')

    expect(vm.isDrawerPinnedOpen).toBe(true)
    expect(vm.isDrawerVisible).toBe(true)
    expect(wrapper.find('[data-testid="field-drawer"]').attributes('data-mode')).toBe('overlay')

    await wrapper.find('[data-testid="field-drawer-close"]').trigger('click')

    expect(vm.isDrawerPinnedOpen).toBe(false)
    expect(vm.isDrawerVisible).toBe(false)
  })

  it('moves selected players with tap-to-assign and swaps occupied slots', async () => {
    const wrapper = mountEditor()
    const vm = wrapper.vm as any
    const dhPlayer = vm.editorPlayers.find((player: any) => player.name === '黃打者')

    await wrapper.find(`[data-testid="field-order-item-${dhPlayer.editorId}"]`).trigger('click')
    await wrapper.find('[data-testid="field-slot-1"]').trigger('click')

    const movedLineup = wrapper.emitted('update:lineup')?.at(-1)?.[0] as any[]
    expect(movedLineup.find((player) => player.name === '黃打者')?.position).toBe('1')
    expect(movedLineup.find((player) => player.name === '王大雷')?.position).toBe('DH')
  })

  it('highlights the selected field slot border', async () => {
    const wrapper = mountEditor()
    const vm = wrapper.vm as any
    const pitcher = vm.editorPlayers.find((player: any) => player.name === '王大雷')

    await wrapper.find(`[data-testid="field-player-${pitcher.editorId}"]`).trigger('click')

    expect(wrapper.find('[data-testid="field-slot-1"] .match-field-editor__slot-card').classes()).toContain('border-sky-300')
  })

  it('keeps the bench zone available on the field when the drawer is collapsed', async () => {
    setHoverCapability({ hover: false, fine: false })
    const wrapper = mountEditor()
    const vm = wrapper.vm as any
    const benchPlayer = vm.editorPlayers.find((player: any) => player.name === '洪替補')

    await wrapper.find(`[data-testid="field-inline-bench-player-${benchPlayer.editorId}"]`).trigger('dragstart', {
      dataTransfer: {
        effectAllowed: 'move',
        setData: vi.fn()
      }
    })
    await wrapper.find('[data-testid="field-slot-3"]').trigger('drop')

    const movedLineup = wrapper.emitted('update:lineup')?.at(-1)?.[0] as any[]
    expect(movedLineup.find((player) => player.name === '洪替補')?.position).toBe('3')
  })

  it('reorders batting order while preserving player positions', () => {
    const wrapper = mountEditor()
    const vm = wrapper.vm as any
    const reorderedIds = vm.editorPlayers.map((player: any) => player.editorId).reverse()

    vm.applyOrderByIdsForTest(reorderedIds)

    const reorderedLineup = wrapper.emitted('update:lineup')?.at(-1)?.[0] as any[]
    expect(reorderedLineup.filter((player) => player.name).map((player) => player.order)).toEqual([1, 2, 3, 4])
    expect(reorderedLineup.find((player) => player.name === '王大雷')?.position).toBe('1')
    expect(reorderedLineup.find((player) => player.name === '李小捕')?.position).toBe('2')
  })

  it('hides interactive drawer controls in readonly mode', () => {
    const wrapper = mountEditor({ readonly: true })
    const vm = wrapper.vm as any

    expect(vm.isDrawerVisible).toBe(false)
    expect(wrapper.find('[data-testid="field-drawer-handle"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('唯讀檢視')
    expect(wrapper.text()).not.toContain('攻守名單抽屜')
  })
})
