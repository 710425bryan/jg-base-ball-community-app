// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import TrainingLocationSessionSummary from './TrainingLocationSessionSummary.vue'
import type { TrainingLocationSessionVenue } from '@/types/trainingLocation'

const createVenue = (
  venueName: string,
  memberIds: string[],
  id: string | null = null
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
  assignments: []
})

describe('TrainingLocationSessionSummary', () => {
  it('shows the total and each venue member count', () => {
    const wrapper = mount(TrainingLocationSessionSummary, {
      props: {
        session: {
          venue_count: 2,
          assignment_count: 3,
          venues: [
            createVenue('中港國小', ['member-1', 'member-2'], 'venue-1'),
            createVenue('新泰國中', ['member-3'], 'venue-2')
          ]
        }
      }
    })

    expect(wrapper.get('[data-test="training-location-session-total"]').text()).toBe('2 場地｜3 人')
    expect(wrapper.findAll('[data-test="training-location-venue-count"]').map((item) => item.text())).toEqual([
      '場地 1・中港國小：2 人',
      '場地 2・新泰國中：1 人'
    ])
  })

  it('uses the venue number when the venue name is blank', () => {
    const wrapper = mount(TrainingLocationSessionSummary, {
      props: {
        session: {
          venue_count: 1,
          assignment_count: 0,
          venues: [createVenue('  ', [])]
        }
      }
    })

    expect(wrapper.get('[data-test="training-location-venue-count"]').text()).toBe('場地 1：0 人')
  })
})
