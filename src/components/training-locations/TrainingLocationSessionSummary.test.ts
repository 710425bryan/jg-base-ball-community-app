// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import TrainingLocationSessionSummary from './TrainingLocationSessionSummary.vue'
import type { TrainingLocationSession, TrainingLocationSessionVenue } from '@/types/trainingLocation'
import {
  CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY,
  JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY
} from '@/utils/trainingPrograms'

const createVenue = (
  venueName: string,
  memberIds: string[],
  id: string | null = null,
  leaveMemberIds: string[] = [],
  schoolTeamMemberIds: string[] = [],
  memberNames: Record<string, string> = {}
): TrainingLocationSessionVenue => ({
  id,
  venue_id: null,
  title: '訓練課程',
  training_date: '2026-08-29',
  start_time: '09:00',
  end_time: '12:30',
  venue_name: venueName,
  venue_address: null,
  venue_maps_url: null,
  attendance_event_id: null,
  sort_order: 0,
  note: null,
  member_ids: memberIds,
  assignments: memberIds.map((memberId, index) => ({
    member_id: memberId,
    name: memberNames[memberId] || `球員 ${index + 1}`,
    role: schoolTeamMemberIds.includes(memberId) ? '校隊' : '球員',
    team_group: null,
    jersey_number: null,
    fee_billing_mode: 'role_default',
    is_on_leave: leaveMemberIds.includes(memberId)
  }))
})

const PopoverStub = defineComponent({
  name: 'ElPopover',
  props: {
    trigger: {
      type: String,
      default: 'hover'
    }
  },
  setup(props, { slots }) {
    return () => h('div', {
      'data-test': 'training-location-leave-popover',
      'data-trigger': props.trigger
    }, [
      slots.reference?.(),
      h('div', { 'data-test': 'training-location-leave-popover-content' }, slots.default?.())
    ])
  }
})

type SummarySession = Pick<TrainingLocationSession, 'program_key' | 'venue_count' | 'assignment_count' | 'venues'>

const mountSummary = (session: SummarySession) => mount(TrainingLocationSessionSummary, {
  props: { session },
  global: {
    stubs: {
      ElPopover: PopoverStub
    }
  }
})

const setMobileViewport = (matches: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches,
      media: '(max-width: 767px)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    })
  })
}

describe('TrainingLocationSessionSummary', () => {
  beforeEach(() => {
    setMobileViewport(false)
  })

  it('shows the total and each venue member count', () => {
    const wrapper = mountSummary({
      program_key: CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY,
      venue_count: 2,
      assignment_count: 3,
      venues: [
        createVenue('中港國小', ['member-1', 'member-2'], 'venue-1', ['member-2']),
        createVenue('新泰國中', ['member-3'], 'venue-2')
      ]
    })

    expect(wrapper.get('[data-test="training-location-session-total"]').text()).toBe('2 場地｜3 人')
    expect(wrapper.findAll('[data-test="training-location-venue-total-count"]').map((item) => item.text())).toEqual([
      '：2 人',
      '：1 人'
    ])
    expect(wrapper.findAll('[data-test="training-location-venue-attending-count"]').map((item) => item.text())).toEqual([
      '上課 1 人',
      '上課 1 人'
    ])
    expect(wrapper.findAll('[data-test="training-location-venue-leave-count"]').map((item) => item.text())).toEqual([
      '請假 1 人',
      '請假 0 人'
    ])
  })

  it('uses the venue number when the venue name is blank', () => {
    const wrapper = mountSummary({
      program_key: CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY,
      venue_count: 1,
      assignment_count: 0,
      venues: [createVenue('  ', [])]
    })

    expect(wrapper.get('[data-test="training-location-venue-count"]').text()).toContain('場地 1：0 人')
    expect(wrapper.get('[data-test="training-location-venue-attending-count"]').text()).toBe('上課 0 人')
    expect(wrapper.get('[data-test="training-location-venue-leave-count"]').text()).toBe('請假 0 人')
  })

  it('shows zero attending members when everyone at a venue is on leave', () => {
    const wrapper = mountSummary({
      program_key: CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY,
      venue_count: 1,
      assignment_count: 2,
      venues: [
        createVenue('中港國小', ['member-1', 'member-2'], 'venue-1', ['member-1', 'member-2'])
      ]
    })

    expect(wrapper.get('[data-test="training-location-venue-attending-count"]').text()).toBe('上課 0 人')
    expect(wrapper.get('[data-test="training-location-venue-leave-count"]').text()).toBe('請假 2 人')
  })

  it('shows community and school team counts for Chunggang headquarters', () => {
    const wrapper = mountSummary({
      program_key: CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY,
      venue_count: 1,
      assignment_count: 3,
      venues: [
        createVenue(
          '中港國小',
          ['community-1', 'community-2', 'school-team-1'],
          'venue-1',
          [],
          ['school-team-1']
        )
      ]
    })

    expect(wrapper.get('[data-test="training-location-venue-community-count"]').text()).toBe('社區 2 人')
    expect(wrapper.get('[data-test="training-location-venue-school-team-count"]').text()).toBe('校隊 1 人')
  })

  it('hides the role breakdown outside Chunggang headquarters', () => {
    const wrapper = mountSummary({
      program_key: JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY,
      venue_count: 1,
      assignment_count: 1,
      venues: [createVenue('新泰國中', ['school-team-1'], 'venue-1', [], ['school-team-1'])]
    })

    expect(wrapper.find('[data-test="training-location-venue-role-counts"]').exists()).toBe(false)
  })

  it('groups leave member names vertically by community and school team on desktop hover', () => {
    const wrapper = mountSummary({
      program_key: CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY,
      venue_count: 1,
      assignment_count: 3,
      venues: [createVenue(
        '中港國小',
        ['community-1', 'school-team-1', 'community-2'],
        'venue-1',
        ['community-1', 'school-team-1', 'community-2'],
        ['school-team-1'],
        {
          'community-1': '王小明',
          'community-2': '李小華',
          'school-team-1': '陳小英'
        }
      )]
    })

    expect(wrapper.get('[data-test="training-location-leave-popover"]').attributes('data-trigger')).toBe('hover')
    const groups = wrapper.get('[data-test="training-location-leave-tooltip"]').findAll('section')
    expect(groups).toHaveLength(2)
    expect(groups[0].attributes('data-test')).toBe('training-location-community-leave-group')
    expect(groups[0].text()).toContain('社區2 人')
    expect(groups[0].text()).toContain('王小明')
    expect(groups[0].text()).toContain('李小華')
    expect(groups[1].attributes('data-test')).toBe('training-location-school-team-leave-group')
    expect(groups[1].text()).toContain('校隊1 人')
    expect(groups[1].text()).toContain('陳小英')
  })

  it('uses click to open the leave tooltip in mobile mode', async () => {
    setMobileViewport(true)
    const wrapper = mountSummary({
      program_key: CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY,
      venue_count: 1,
      assignment_count: 1,
      venues: [createVenue('中港國小', ['community-1'], 'venue-1', ['community-1'])]
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[data-test="training-location-leave-popover"]').attributes('data-trigger')).toBe('click')
    expect(wrapper.get('[data-test="training-location-venue-leave-count"]').attributes('aria-label')).toBe(
      '請假 1 人，查看社區與校隊請假球員'
    )
    expect(wrapper.get('[data-test="training-location-school-team-leave-group"]').text()).toContain('校隊0 人無')
  })
})
