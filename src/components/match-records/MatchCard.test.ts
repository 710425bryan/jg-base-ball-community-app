// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MatchCard from './MatchCard.vue'
import type { MatchRecord } from '@/types/match'
import { DEFAULT_MATCH_COVER } from '@/utils/matchPresentation'

const mocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), copy: vi.fn() }))
vi.mock('element-plus', () => ({
  ElMessage: { success: mocks.success, error: mocks.error },
  ElImageViewer: { props: ['urlList'], emits: ['close'], template: '<div data-testid="photo-preview"><button @click="$emit(\'close\')">關閉預覽</button></div>' }
}))

const baseMatch: MatchRecord = {
  id: 'match-1', match_name: '中港熊戰友誼賽', opponent: '測試國小', match_date: '2099-06-28', match_time: '08:00 - 10:00',
  location: '中港球場', home_score: 8, opponent_score: 2, note: '集合時間：07:30', match_level: '友誼賽',
  absent_players: [], lineup: [], inning_logs: [], batting_stats: []
}
const Dropdown = { name: 'ElDropdown', emits: ['command'], template: '<div><slot /><slot name="dropdown" /></div>' }
const DropdownItem = { name: 'ElDropdownItem', props: ['command', 'disabled'], template: '<div :data-command="command" :aria-disabled="disabled"><slot /></div>' }
const render = (changes: Partial<MatchRecord> = {}, permissions = {}) => mount(MatchCard, {
  props: { match: { ...baseMatch, ...changes }, ...permissions },
  global: { stubs: { ElIcon: { template: '<span><slot /></span>' }, ElDropdown: Dropdown, ElDropdownMenu: { template: '<div><slot /></div>' }, ElDropdownItem: DropdownItem } }
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.copy.mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.copy } })
})

describe('MatchCard media', () => {
  it('shows the uploaded image immediately and uses a separate preview action', async () => {
    const wrapper = render({ photo_url: 'https://example.com/match.webp' })
    expect(wrapper.get('[data-testid="match-cover"]').attributes('src')).toBe('https://example.com/match.webp')
    expect(wrapper.find('[data-testid="photo-preview"]').exists()).toBe(false)
    await wrapper.get('button[aria-label^="預覽"]').trigger('click')
    expect(wrapper.find('[data-testid="photo-preview"]').exists()).toBe(true)
    expect(wrapper.emitted('view')).toBeUndefined()
    await wrapper.get('article').trigger('click')
    expect(wrapper.emitted('view')).toEqual([['match-1']])
  })

  it('uses the team default for absent, unsafe and failed images, and recovers for a replacement', async () => {
    const wrapper = render()
    expect(wrapper.get('img').attributes('src')).toBe(DEFAULT_MATCH_COVER)
    expect(wrapper.get('img').attributes('alt')).toBe('中港熊戰社區棒球隊Logo預設封面')
    expect(wrapper.get('img').classes()).toContain('object-contain')
    expect(wrapper.find('button[aria-label^="預覽"]').exists()).toBe(false)
    await wrapper.setProps({ match: { ...baseMatch, photo_url: 'javascript:alert(1)' } })
    expect(wrapper.get('img').attributes('src')).toBe(DEFAULT_MATCH_COVER)
    await wrapper.setProps({ match: { ...baseMatch, photo_url: 'https://example.com/broken.webp' } })
    await wrapper.get('img').trigger('error')
    expect(wrapper.get('img').attributes('src')).toBe(DEFAULT_MATCH_COVER)
    expect(wrapper.find('button[aria-label^="預覽"]').exists()).toBe(false)
    await wrapper.setProps({ match: { ...baseMatch, photo_url: 'https://example.com/replacement.webp' } })
    expect(wrapper.get('img').attributes('src')).toBe('https://example.com/replacement.webp')
    expect(wrapper.get('img').classes()).toContain('object-cover')
  })
})

describe('MatchCard schedule, results and operations', () => {
  it('displays prominent date and both times, without scores for future games', () => {
    const wrapper = render()
    expect(wrapper.get('[data-testid="match-date"]').text()).toContain('2099/06/28')
    expect(wrapper.text()).toContain('集合時間07:30')
    expect(wrapper.text()).toContain('比賽時間08:00 - 10:00')
    expect(wrapper.get('[data-testid="match-result"]').text()).toBe('未賽')
    expect(wrapper.find('[data-testid="home-score"]').exists()).toBe(false)
  })

  it.each([[8, 2, '勝利'], [2, 8, '敗場'], [3, 3, '平手']])('shows historical score %s:%s as %s', (home_score, opponent_score, label) => {
    const wrapper = render({ match_date: '2020-01-01', home_score, opponent_score })
    expect(wrapper.get('[data-testid="home-score"]').text()).toBe(String(home_score))
    expect(wrapper.get('[data-testid="opponent-score"]').text()).toBe(String(opponent_score))
    expect(wrapper.get('[data-testid="match-result"]').text()).toBe(label)
    expect(wrapper.get('[data-testid="gather-time"]').classes()).not.toContain('bg-amber-50')
  })

  it('retains copy, edit, notify and delete in the overflow and adds cancellation', async () => {
    const wrapper = render({}, { canNotify: true })
    const dropdown = wrapper.getComponent(Dropdown)
    for (const command of ['edit', 'notify', 'delete', 'cancel']) {
      expect(wrapper.find(`[data-command="${command}"]`).exists()).toBe(true)
      dropdown.vm.$emit('command', command)
      expect(wrapper.emitted(command)).toEqual([['match-1']])
    }
    dropdown.vm.$emit('command', 'copy')
    await flushPromises()
    expect(mocks.copy).toHaveBeenCalledWith(expect.stringContaining('集合時間：07:30'))
    expect(mocks.success).toHaveBeenCalled()
    expect(wrapper.emitted('view')).toBeUndefined()
    await wrapper.get('button[aria-label^="查看"]').trigger('click')
    expect(wrapper.emitted('view')).toEqual([['match-1']])
  })

  it('hides and guards unavailable operations while allowing read-only viewing and copy', () => {
    const wrapper = render({}, { canEdit: false, canDelete: false, canNotify: false })
    for (const command of ['edit', 'notify', 'delete', 'cancel', 'restore']) {
      expect(wrapper.find(`[data-command="${command}"]`).exists()).toBe(false)
      wrapper.getComponent(Dropdown).vm.$emit('command', command)
      expect(wrapper.emitted(command)).toBeUndefined()
    }
    expect(wrapper.find('[data-command="copy"]').exists()).toBe(true)
  })

  it('prevents repeated notification while one is pending', () => {
    const wrapper = render({}, { canNotify: true, notifyingMatchId: 'match-1' })
    expect(wrapper.get('[data-command="notify"]').attributes('aria-disabled')).toBe('true')
    wrapper.getComponent(Dropdown).vm.$emit('command', 'notify')
    expect(wrapper.emitted('notify')).toBeUndefined()
  })

  it('opens a safe video URL from the keyboard-compatible menu command', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const wrapper = render({ video_url: 'https://example.com/match-video' })
    expect(wrapper.get('[data-command="video"]').text()).toBe('觀看比賽影片')
    wrapper.getComponent(Dropdown).vm.$emit('command', 'video')
    expect(open).toHaveBeenCalledWith('https://example.com/match-video', '_blank', 'noopener,noreferrer')
    expect(wrapper.emitted('view')).toBeUndefined()
    open.mockRestore()
  })

  it('keeps cancelled records readable without scores, editing or reminders', async () => {
    const wrapper = render({ match_date: '2020-01-01', cancelled_at: '2026-10-12T02:00:00Z', cancellation_reason: '球場積水' }, { canNotify: true })
    expect(wrapper.text()).toContain('無須集合')
    expect(wrapper.text()).toContain('球場積水')
    expect(wrapper.get('[data-testid="match-result"]').text()).toBe('已取消')
    expect(wrapper.find('[data-testid="home-score"]').exists()).toBe(false)
    for (const command of ['edit', 'notify', 'cancel']) {
      expect(wrapper.find(`[data-command="${command}"]`).exists()).toBe(false)
      wrapper.getComponent(Dropdown).vm.$emit('command', command)
      expect(wrapper.emitted(command)).toBeUndefined()
    }
    wrapper.getComponent(Dropdown).vm.$emit('command', 'copy')
    await flushPromises()
    expect(mocks.copy).toHaveBeenCalledWith(expect.stringContaining('狀態：已取消，無須集合'))
    expect(mocks.copy).toHaveBeenCalledWith(expect.stringContaining('取消原因：球場積水'))
  })

  it('does not offer cancellation for training sessions', () => {
    const wrapper = render({ match_level: '特訓課' })
    expect(wrapper.find('[data-command="cancel"]').exists()).toBe(false)
    wrapper.getComponent(Dropdown).vm.$emit('command', 'cancel')
    expect(wrapper.emitted('cancel')).toBeUndefined()
  })

  it('offers recovery only for an editable cancelled non-training game and waits for its confirmed state', async () => {
    const wrapper = render({ cancelled_at: '2026-10-12T02:00:00Z' })
    expect(wrapper.get('[data-command="restore"]').text()).toBe('恢復比賽')
    wrapper.getComponent(Dropdown).vm.$emit('command', 'restore')
    expect(wrapper.emitted('restore')).toEqual([['match-1']])
    expect(wrapper.get('[data-testid="match-result"]').text()).toBe('已取消')
    await wrapper.setProps({ match: { ...baseMatch, cancelled_at: null } })
    expect(wrapper.find('[data-command="restore"]').exists()).toBe(false)
    expect(wrapper.find('[data-command="cancel"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="match-result"]').text()).toBe('未賽')
    wrapper.getComponent(Dropdown).vm.$emit('command', 'restore')
    expect(wrapper.emitted('restore')).toHaveLength(1)
  })

  it.each([{ canEdit: false, match_level: '友誼賽' }, { canEdit: true, match_level: '特訓課' }])('does not restore through an unavailable menu: %j', ({ canEdit, match_level }) => {
    const wrapper = render({ cancelled_at: '2026-10-12', match_level }, { canEdit })
    expect(wrapper.find('[data-command="restore"]').exists()).toBe(false)
    wrapper.getComponent(Dropdown).vm.$emit('command', 'restore')
    expect(wrapper.emitted('restore')).toBeUndefined()
  })

  it('reports a clipboard failure', async () => {
    mocks.copy.mockRejectedValueOnce(new Error('Denied'))
    const wrapper = render()
    wrapper.getComponent(Dropdown).vm.$emit('command', 'copy')
    await flushPromises()
    expect(mocks.error).toHaveBeenCalledWith('複製失敗，請手動複製')
  })
})
