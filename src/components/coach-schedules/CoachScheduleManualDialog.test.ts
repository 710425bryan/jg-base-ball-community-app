// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import type { ComponentPublicInstance } from 'vue'
import type { CoachScheduleCoachRole } from '@/utils/coachScheduleCoachOptions'
import AppDialogFooter from '@/components/common/AppDialogFooter.vue'
import CoachScheduleManualDialog from './CoachScheduleManualDialog.vue'

const mocks = vi.hoisted(() => ({ saveEvent: vi.fn(), warning: vi.fn(), fetchRoles: vi.fn(), permissionState: null as unknown as { roles: CoachScheduleCoachRole[] } }))
vi.mock('@/services/coachSchedulesApi', () => ({ coachSchedulesApi: mocks }))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: vi.fn(), warning: mocks.warning } }))
vi.mock('@/stores/permissions', async () => {
  const { reactive } = await import('vue')
  const state = reactive({ roles: [] as CoachScheduleCoachRole[], fetchRoles: mocks.fetchRoles })
  mocks.permissionState = state
  return { usePermissionsStore: () => state }
})
const create = (canCreate = true) => shallowMount(CoachScheduleManualDialog, { props: { modelValue: true, month: '2026-10', coaches: [], canCreate },
  global: { renderStubDefaultSlot: true, stubs: { 'el-input': true, 'el-option': true, 'el-option-group': { template: '<div><slot /></div>' }, 'el-date-picker': true, 'el-time-picker': true, 'el-select': true,
    'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
    'el-form': { template: '<div><slot /></div>' }, 'el-form-item': { template: '<div><slot /></div>' } } } })
describe('CoachScheduleManualDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.saveEvent.mockResolvedValue('saved')
    mocks.permissionState.roles = [
      { role_key: 'HEAD_COACH', role_name: '總教練', weight: 10 }, { role_key: 'COACH', role_name: '教練', weight: 16 }
    ]
  })
  it('requires a title and saves the selected month through the existing schedule API', async () => {
    const wrapper = create()
    expect(wrapper.classes()).toContain('coach-feature-theme')
    expect(wrapper.find('el-select-stub[reserve-keyword="false"]').exists()).toBe(true)
    wrapper.findComponent(AppDialogFooter).vm.$emit('confirm')
    await flushPromises()
    expect(mocks.saveEvent).not.toHaveBeenCalled()
    wrapper.findComponent({ name: 'ElInput' }).vm.$emit('update:modelValue', '投手加練')
    await flushPromises()
    wrapper.findComponent(AppDialogFooter).vm.$emit('confirm')
    await flushPromises()
    expect(mocks.saveEvent).toHaveBeenCalledWith(expect.objectContaining({ source_type: 'manual', title: '投手加練', schedule_date: '2026-10-01' }))
    expect(wrapper.emitted('saved')).toHaveLength(1)
    wrapper.unmount()
  })

  it('uses the same reactive role groups and submits only the selected coach IDs without fetching roles', async () => {
    const wrapper = create()
    const coaches = [
      { id: 'b', name: 'B教練', nickname: null, role: 'COACH', avatar_url: null },
      { id: 'head', name: '總教練', nickname: null, role: '總教練', avatar_url: null },
      { id: 'a', name: 'A教練', nickname: null, role: ' coach ', avatar_url: null }
    ]
    await wrapper.setProps({ coaches })
    const groups = () => wrapper.findAll('[data-test="manual-coach-role-group"]')
    expect(groups().map((group) => group.attributes('label'))).toEqual(['總教練', '教練'])
    expect(groups().map((group) => group.findAll('el-option-stub').map((option) => option.attributes('value'))))
      .toEqual([['head'], ['a', 'b']])
    wrapper.findComponent<ComponentPublicInstance>('[data-test="manual-coaches-select"]').vm.$emit('update:modelValue', ['head', 'a'])
    wrapper.findComponent({ name: 'ElInput' }).vm.$emit('update:modelValue', '投手加練')
    mocks.permissionState.roles = [
      { role_key: 'COACH', role_name: '排班教練', weight: 1 }, { role_key: 'HEAD_COACH', role_name: '總指導', weight: 20 }
    ]
    await wrapper.vm.$nextTick()
    expect(groups().map((group) => group.attributes('label'))).toEqual(['排班教練', '總指導'])
    wrapper.findComponent(AppDialogFooter).vm.$emit('confirm')
    await flushPromises()
    expect(mocks.saveEvent).toHaveBeenCalledWith(expect.objectContaining({ coach_profile_ids: ['head', 'a'] }))
    expect(mocks.fetchRoles).not.toHaveBeenCalled()
    expect(coaches.map((coach) => coach.id)).toEqual(['b', 'head', 'a'])
    wrapper.unmount()
  })

  it('keeps grouped coach fields read-only and blocks submission without CREATE', async () => {
    const wrapper = create(false)
    wrapper.findComponent({ name: 'ElInput' }).vm.$emit('update:modelValue', '投手加練')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('div[disabled="true"]').exists()).toBe(true)
    expect(wrapper.findComponent(AppDialogFooter).props('confirmDisabled')).toBe(true)
    wrapper.findComponent(AppDialogFooter).vm.$emit('confirm')
    await flushPromises()
    expect(mocks.saveEvent).not.toHaveBeenCalled()
    expect(mocks.fetchRoles).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('blocks repeat submits and closing while a manual save is pending', async () => {
    const wrapper = create()
    let resolve!: (value: string) => void
    mocks.saveEvent.mockReturnValueOnce(new Promise<string>((done) => { resolve = done }))
    wrapper.findComponent({ name: 'ElInput' }).vm.$emit('update:modelValue', '投手加練')
    await wrapper.vm.$nextTick()
    wrapper.findComponent(AppDialogFooter).vm.$emit('confirm')
    await wrapper.vm.$nextTick()
    wrapper.findComponent(AppDialogFooter).vm.$emit('confirm')
    wrapper.findComponent(AppDialogFooter).vm.$emit('cancel')
    expect(mocks.saveEvent).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.findComponent(AppDialogFooter).props('loading')).toBe(true)
    resolve('saved')
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    wrapper.unmount()
  })
})
