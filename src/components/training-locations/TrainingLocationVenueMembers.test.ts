// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { TrainingLocationRosterMember } from '@/types/trainingLocation'
import TrainingLocationVenueMembers from './TrainingLocationVenueMembers.vue'

const member = (id: string, role: string, team_group: string): TrainingLocationRosterMember => ({
  member_id: id, name: id, role, team_group, jersey_number: '10',
  fee_billing_mode: 'role_default', is_on_leave: false
})
const mountMembers = (members: TrainingLocationRosterMember[]) => mount(TrainingLocationVenueMembers, {
  props: { members }, global: { stubs: { 'el-icon': { template: '<span><slot /></span>' } } }
})

describe('TrainingLocationVenueMembers', () => {
  it('renders group headings, counts, and leave metadata in the requested order', async () => {
    const wrapper = mountMembers([
      member('不參賽球員', '校隊', 'U12熊戰組（不參賽）'),
      member('社區球員', '球員', 'U12熊戰組'),
      { ...member('請假球員', '校隊', 'U8熊戰組'), is_on_leave: true },
      member('校隊球員', '校隊', 'U12熊戰組')
    ])
    expect(wrapper.findAll('h4').map((heading) => heading.find('span').text())).toEqual([
      '校隊｜U12熊戰組', '校隊｜U8熊戰組', '球員｜U12熊戰組', '校隊｜U12熊戰組（不參賽）'
    ])
    expect(wrapper.findAll('h4').every((heading) => heading.text().endsWith('1 人'))).toBe(true)
    expect(wrapper.get('[data-member-id="請假球員"]').text()).toContain('#10｜已請假')
    await wrapper.get('button[aria-label="移除社區球員"]').trigger('click')
    expect(wrapper.emitted('remove')).toEqual([['社區球員']])
    await wrapper.setProps({ members: [] })
    expect(wrapper.findAll('h4')).toHaveLength(0)
    expect(wrapper.text()).toContain('拖曳或移入球員到這個場地。')
  })

  it('retains the no-fee badge for an existing assignment', () => {
    const wrapper = mountMembers([{ ...member('不收費球員', '球員', 'U8熊戰組'), fee_billing_mode: 'no_fee' }])
    expect(wrapper.get('[data-test="venue-member"]').text()).toContain('不收費')
    expect(wrapper.get('button').attributes('title')).toBe('移除不收費球員')
  })
})
