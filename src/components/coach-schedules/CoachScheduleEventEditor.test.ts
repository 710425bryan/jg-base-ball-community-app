// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import type { ComponentPublicInstance } from 'vue'
import type { CoachScheduleCoachRole } from '@/utils/coachScheduleCoachOptions'
import CoachScheduleEventEditor from './CoachScheduleEventEditor.vue'
import { normalizeCoachScheduleEvent } from '@/utils/coachSchedules'

const mocks = vi.hoisted(() => ({ permissionState: null as unknown as { roles: CoachScheduleCoachRole[] }, fetchRoles: vi.fn() }))
vi.mock('@/stores/permissions', async () => {
  const { reactive } = await import('vue')
  const state = reactive({ roles: [] as CoachScheduleCoachRole[], fetchRoles: mocks.fetchRoles })
  mocks.permissionState = state
  return { usePermissionsStore: () => state }
})

describe('CoachScheduleEventEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.permissionState.roles = [
      { role_key: 'HEAD_COACH', role_name: '總教練', weight: 10 }, { role_key: 'COACH', role_name: '教練', weight: 16 }
    ]
  })
  const create = (canEdit = true) => shallowMount(CoachScheduleEventEditor, {
    props: {
      event: normalizeCoachScheduleEvent({ id: 'saved', unavailable_coach_profile_ids: ['absent'],
        assignment_changes: [{ coach_profile_id: 'absent', coach_name: '甲教練', leave_id: 'leave' }] }),
      form: { coachProfileIds: [], status: 'scheduled', note: '' },
      coaches: [{ id: 'absent', name: '甲教練', nickname: null, role: 'COACH', avatar_url: null }],
      canCreate: false, canEdit, canDelete: false, saving: false, deleting: false, coachLoading: false
    }, global: { stubs: { 'el-option': true, 'el-option-group': { template: '<div><slot /></div>' }, 'el-input': true, 'el-icon': true, 'el-dropdown': true, 'el-dropdown-menu': true, 'el-dropdown-item': true,
      'el-form-item': { template: '<div><slot /></div>' },
      'el-select': { template: '<div><slot /></div>' }, 'el-button': { template: '<button><slot /></button>' } } }
  })
  it('explains leave removal, keeps removed coaches unavailable, and exposes only the saved empty roster', () => {
    const wrapper = create()
    expect(wrapper.find('div[reserve-keyword="false"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="leave-removal"]').text()).toContain('甲教練')
    expect(wrapper.text()).toContain('待補排班')
    const options = wrapper.findAll('el-option-stub')
    expect(options[0]!.attributes('disabled')).toBe('true')
    expect(options[0]!.attributes('label')).toContain('請假')
    wrapper.get('button').trigger('click')
    expect(wrapper.emitted('save')).toHaveLength(1)
  })
  it('provides a read-only editor without save actions when edit permission is absent', () => {
    const wrapper = create(false)
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.findAll('div[disabled="true"]').length).toBeGreaterThan(0)
  })

  it('offers venue-template copying for training cards without a start time and checks permission on commands', async () => {
    const wrapper = shallowMount(CoachScheduleEventEditor, {
      props: { event: normalizeCoachScheduleEvent({ source_type: 'training_date', location: '中港國小', start_time: null }),
        form: { coachProfileIds: [], status: 'scheduled', note: '' }, coaches: [],
        canCreate: true, canEdit: false, canDelete: false, saving: false, deleting: false, coachLoading: false },
      global: { stubs: { 'el-icon': true, 'el-input': true, 'el-option': true, 'el-option-group': true, 'el-form-item': true, 'el-select': true, 'el-button': true,
        'el-dropdown': { name: 'ElDropdown', emits: ['command'], template: '<div><slot /><slot name="dropdown" /></div>' },
        'el-dropdown-menu': { template: '<div><slot /></div>' }, 'el-dropdown-item': true } }
    })
    expect(wrapper.find('el-dropdown-item-stub[command="copy"]').exists()).toBe(true)
    const menu = wrapper.findComponent({ name: 'ElDropdown' })
    menu.vm.$emit('command', 'copy')
    expect(wrapper.emitted('copy-template')).toHaveLength(1)
    await wrapper.setProps({ saving: true })
    menu.vm.$emit('command', 'copy')
    expect(wrapper.emitted('copy-template')).toHaveLength(1)
    await wrapper.setProps({ saving: false, canCreate: false })
    menu.vm.$emit('command', 'copy')
    menu.vm.$emit('command', 'delete')
    menu.vm.$emit('command', 'unrecognized')
    expect(wrapper.emitted('copy-template')).toHaveLength(1)
    expect(wrapper.emitted('delete')).toBeUndefined()
    wrapper.unmount()
  })

  it('does not offer a venue-template command for match cards', () => {
    const wrapper = shallowMount(CoachScheduleEventEditor, { props: {
      event: normalizeCoachScheduleEvent({ source_type: 'match', location: '中港國小' }),
      form: { coachProfileIds: [], status: 'scheduled', note: '' }, coaches: [],
      canCreate: true, canEdit: false, canDelete: false, saving: false, deleting: false, coachLoading: false
    }, global: { stubs: {
      'el-option': true, 'el-option-group': true, 'el-select': true, 'el-form-item': true, 'el-input': true, 'el-icon': true,
      'el-button': true, 'el-dropdown-item': true, 'el-dropdown-menu': true, 'el-dropdown': true
    } } })
    expect(wrapper.findComponent({ name: 'ElDropdown' }).exists()).toBe(false)
    wrapper.unmount()
  })

  it('groups the supplied coaches by role metadata while preserving leave-disabled options and selected IDs', async () => {
    const wrapper = create()
    const coaches = [
      { id: 'coach-b', name: '乙教練', nickname: 'Z教練', role: 'COACH', avatar_url: null },
      { id: 'head', name: '總教練', nickname: null, role: ' head_coach ', avatar_url: null },
      { id: 'absent', name: '甲教練', nickname: 'A教練', role: ' 教練 ', avatar_url: null }
    ]
    await wrapper.setProps({ coaches, form: { coachProfileIds: ['absent'], status: 'scheduled', note: '保留備註' } })
    const groups = () => wrapper.findAll('[data-test="schedule-coach-role-group"]')
    expect(groups().map((group) => group.attributes('label'))).toEqual(['總教練', '教練'])
    expect(groups().map((group) => group.findAll('el-option-stub').map((option) => option.attributes('value'))))
      .toEqual([['head'], ['absent', 'coach-b']])
    const absent = wrapper.get('el-option-stub[value="absent"]')
    expect(absent.attributes('disabled')).toBe('true')
    expect(absent.attributes('label')).toBe('A教練（請假）')
    expect(wrapper.props('form').coachProfileIds).toEqual(['absent'])
    expect(wrapper.emitted('update:form')).toBeUndefined()
    mocks.permissionState.roles = [
      { role_key: 'HEAD_COACH', role_name: '總指導', weight: 20 }, { role_key: 'COACH', role_name: '排班教練', weight: 1 }
    ]
    await wrapper.vm.$nextTick()
    expect(groups().map((group) => group.attributes('label'))).toEqual(['排班教練', '總指導'])
    wrapper.findComponent<ComponentPublicInstance>('[data-test="card-coaches-select"]').vm.$emit('update:modelValue', ['head', 'absent'])
    expect(wrapper.emitted('update:form')).toEqual([[{ coachProfileIds: ['head', 'absent'], status: 'scheduled', note: '保留備註' }]])
    expect(coaches.map((coach) => coach.id)).toEqual(['coach-b', 'head', 'absent'])
    expect(mocks.fetchRoles).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
