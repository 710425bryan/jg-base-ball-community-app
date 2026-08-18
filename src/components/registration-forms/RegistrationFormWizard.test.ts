// @vitest-environment jsdom
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RegistrationFormWizard from './RegistrationFormWizard.vue'

const template = {
  id: 'template-1',
  name: '就是棒',
  original_file_name: 'template.xlsx',
  file_type: 'xlsx',
  profile_key: 'just_baseball_taipei',
  profile_version: 1,
  max_players: 30,
  has_photo_slots: true,
  storage_path: 'templates/template.xlsx',
  created_by: null,
  updated_by: null,
  created_at: '2026-08-18',
  updated_at: '2026-08-18'
} as const

const members = [{
  id: 'member-1',
  name: '小熊',
  role: '球員',
  status: '在隊',
  jersey_number: '7',
  birth_date: '2015-06-18',
  national_id: 'A123456789',
  throwing_hand: '左右開弓',
  batting_hand: '左打',
  school_name: '中港國小',
  grade: '五年級',
  portrait_auth: false,
  avatar_url: 'https://example.com/photo.jpg'
}, {
  id: 'coach-1',
  name: '熊教練',
  role: '教練',
  status: '在隊',
  guardian_phone: '0912-345-678'
}, {
  id: 'inactive-coach',
  name: '離隊教練',
  role: '教練',
  status: '離隊',
  guardian_phone: '0900-000-000'
}]

const sortingMembers = [
  { ...members[0], id: 'member-12', name: '十二號', jersey_number: '12' },
  { ...members[0], id: 'member-3', name: '三號', jersey_number: '3' },
  { ...members[0], id: 'member-7', name: '七號', jersey_number: '7' }
]

const quickFilterMembers = [
  { ...members[0], id: 'u12-7', name: 'U12 七號', jersey_number: '7', birth_date: '2015-06-18' },
  { ...members[0], id: 'u12-3', name: 'U12 三號', jersey_number: '3', birth_date: '2015-01-18' },
  { ...members[0], id: 'u10-9', name: 'U10 九號', jersey_number: '9', birth_date: '2017-01-18' }
]

const stubs = {
  'el-dialog': { template: '<div><slot/><slot name="footer"/></div>' },
  'el-steps': { template: '<div><slot/></div>' },
  'el-step': true,
  'el-alert': { template: '<div><slot/></div>' },
  'el-form': { template: '<form><slot/></form>' },
  'el-form-item': { template: '<label><slot/></label>' },
  'el-input': true,
  'el-select': { template: '<div><slot/></div>' },
  'el-option': true,
  'el-tag': true,
  'el-empty': true,
  'el-icon': { template: '<i><slot/></i>' },
  'el-button': { template: '<button type="button"><slot/></button>' },
  'el-date-picker': true
}

describe('RegistrationFormWizard', () => {
  it('searches active roster staff and fills the selected member phone', async () => {
    const wrapper = mount(RegistrationFormWizard, {
      props: { modelValue: true, template, members },
      global: { stubs }
    })
    const vm = wrapper.vm as any
    expect(vm.staffMemberOptions.map((member: any) => member.id)).toEqual(['coach-1', 'member-1'])
    expect(vm.sortedMembers.map((member: any) => member.id)).toEqual(['member-1'])

    vm.applyStaffMember(vm.staffFieldConfigs[0], 'coach-1')
    await nextTick()
    expect(vm.fields.leader_name).toBe('熊教練')
    expect(vm.fields.leader_phone).toBe('0912-345-678')

    vm.applyStaffMember(vm.staffFieldConfigs[0], '外部領隊')
    expect(vm.fields.leader_name).toBe('外部領隊')
    expect(vm.fields.leader_phone).toBe('')
  })

  it('sorts the initial selection by jersey number and keeps a manual reorder', async () => {
    const wrapper = mount(RegistrationFormWizard, {
      props: { modelValue: true, template, members: sortingMembers },
      global: { stubs }
    })
    const vm = wrapper.vm as any
    vm.selectedIds = ['member-12', 'member-3', 'member-7']
    await nextTick()
    expect(vm.playerRows.map((row: any) => row.member_id)).toEqual(['member-3', 'member-7', 'member-12'])

    vm.move(0, 1)
    await nextTick()
    expect(vm.playerRows.map((row: any) => row.member_id)).toEqual(['member-7', 'member-3', 'member-12'])
  })

  it('quickly selects all players or one U-level within the template capacity', async () => {
    const wrapper = mount(RegistrationFormWizard, {
      props: {
        modelValue: true,
        template: { ...template, max_players: 2 },
        members: quickFilterMembers
      },
      global: { stubs }
    })
    const vm = wrapper.vm as any

    vm.selectPlayersBy('U12')
    await nextTick()
    expect(vm.selectedIds).toEqual(['u12-3', 'u12-7'])
    expect(vm.quickSelectionNotice).toBe('')

    vm.selectPlayersBy('all')
    await nextTick()
    expect(vm.selectedIds).toEqual(['u12-3', 'u12-7'])
    expect(vm.quickSelectionNotice).toContain('共有 3 人')
    expect(vm.quickSelectionNotice).toContain('最多 2 人')

    vm.clearPlayerSelection()
    expect(vm.selectedIds).toEqual([])
  })

  it('keeps portrait authorization read-only and blocks ambiguous batting/throwing values', async () => {
    const wrapper = mount(RegistrationFormWizard, {
      props: { modelValue: true, template, members },
      global: { stubs }
    })
    const vm = wrapper.vm as any
    Object.assign(vm.fields, {
      leader_name: '領隊',
      head_coach_name: '總教練',
      manager_name: '管理',
      contact_name: '聯絡人',
      contact_phone: '0900'
    })
    vm.next()
    vm.selectedIds = ['member-1']
    await nextTick()
    expect(vm.playerRows[0].portrait_auth).toBe(false)
    expect(vm.playerRows[0].overrides).not.toHaveProperty('portrait_auth')
    vm.next()
    expect(vm.validation.blocking.some((message: string) => message.includes('守位'))).toBe(false)
    expect(vm.validation.blocking.some((message: string) => message.includes('投球慣用手'))).toBe(true)
    expect(vm.validation.warnings.some((message: string) => message.includes('肖像授權'))).toBe(true)
  })

  it('emits only allowed export overrides after validation', async () => {
    const wrapper = mount(RegistrationFormWizard, {
      props: { modelValue: true, template, members },
      global: { stubs }
    })
    const vm = wrapper.vm as any
    Object.assign(vm.fields, {
      leader_name: '領隊',
      head_coach_name: '總教練',
      manager_name: '管理',
      contact_name: '聯絡人',
      contact_phone: '0900'
    })
    vm.step = 1
    vm.selectedIds = ['member-1']
    await nextTick()
    Object.assign(vm.playerRows[0].overrides, { position: 'IF', throwing_hand: '右投' })
    vm.step = 2
    vm.submit()
    const payload = wrapper.emitted('generate')?.[0]?.[0] as any
    expect(payload.players[0]).toEqual({
      member_id: 'member-1',
      overrides: expect.objectContaining({ position: 'IF', throwing_hand: '右投' })
    })
    expect(payload.players[0]).not.toHaveProperty('portrait_auth')
    expect(payload.players[0]).not.toHaveProperty('name')
  })
})
