// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MatchScheduleInfo from './MatchScheduleInfo.vue'
import type { MatchRecord } from '@/types/match'

const baseMatch = { id: 'match-1', note: '集合時間：07:30', match_time: '08:00 - 10:00', location: '新北大都會公園棒球場第二區 A 球場（中港國小集合入口）' } as MatchRecord
const render = (changes: Partial<MatchRecord> = {}, props = {}) => mount(MatchScheduleInfo, {
  props: { match: { ...baseMatch, ...changes }, ...props },
  global: { stubs: { ElIcon: { template: '<span><slot /></span>' } } }
})

describe('MatchScheduleInfo', () => {
  it('keeps gathering and game times distinct, with stronger gathering emphasis', () => {
    const wrapper = render()
    expect(wrapper.get('[data-testid="gather-time"]').text()).toBe('集合時間07:30')
    expect(wrapper.get('[data-testid="gather-time"]').classes()).toContain('bg-amber-50')
    expect(wrapper.get('[data-testid="match-time"]').text()).toBe('比賽時間08:00 - 10:00')
  })

  it('keeps the full location visible and stops map navigation from opening details', async () => {
    const wrapper = render()
    const location = wrapper.get('[data-testid="match-location"]')
    expect(location.text()).toBe(baseMatch.location)
    expect(location.classes()).toContain('break-words')
    expect(location.classes()).not.toContain('truncate')
    const link = wrapper.get('a')
    expect(link.get('[data-testid="match-location"]').text()).toBe(baseMatch.location)
    expect(link.attributes('href')).toContain(encodeURIComponent(baseMatch.location!))
    expect(link.classes()).toContain('min-h-11')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
    const openDetails = vi.fn()
    wrapper.element.addEventListener('click', openDetails)
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.element.dispatchEvent(event)
    expect(openDetails).not.toHaveBeenCalled()
  })

  it('makes missing times and location explicit without inventing gathering time', () => {
    const wrapper = render({ note: '', match_time: '', location: '' })
    expect(wrapper.get('[data-testid="gather-time"]').text()).toContain('待確認')
    expect(wrapper.get('[data-testid="match-time"]').text()).toContain('待確認')
    expect(wrapper.get('[data-testid="match-location"]').text()).toBe('待確認')
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('shows cancellation reason, labels original times and removes navigation', () => {
    const wrapper = render({ cancelled_at: '2026-10-12T02:00:00Z', cancellation_reason: '球場積水' })
    expect(wrapper.text()).toContain('已取消・無須集合')
    expect(wrapper.text()).toContain('球場積水')
    expect(wrapper.get('[data-testid="gather-time"]').text()).toBe('原集合時間07:30')
    expect(wrapper.get('[data-testid="gather-time"]').classes()).not.toContain('bg-amber-50')
    expect(wrapper.text()).toContain('原比賽時間')
    expect(wrapper.text()).toContain('原比賽地點')
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('can defer the cancellation banner to a parent without reactivating the schedule', () => {
    const wrapper = render({ cancelled_at: '2026-10-12T02:00:00Z' }, { showCancellationStatus: false })
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('原集合時間')
    expect(wrapper.find('a').exists()).toBe(false)
  })
})
