// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RegistrationEventDialog from './RegistrationEventDialog.vue'

const templates = [{
  id: 'template-1',
  name: '主委盃 U9',
  original_file_name: 'u9.docx',
  file_type: 'docx',
  profile_key: 'chairperson_cup_u9',
  profile_version: 1,
  max_players: 20,
  has_photo_slots: true,
  storage_path: 'template.docx',
  created_by: null,
  updated_by: null,
  created_at: '2026-08-18',
  updated_at: '2026-08-18'
}] as const

const stubs = {
  'el-dialog': { template: '<div><slot/><slot name="footer"/></div>' },
  'el-form': { template: '<form><slot/></form>' },
  'el-form-item': { template: '<label><slot/></label>' },
  'el-input': true,
  'el-input-number': true,
  'el-date-picker': true,
  'el-select': { template: '<div><slot/></div>' },
  'el-option': true,
  AppDialogFooter: { template: '<button type="button" @click="$emit(\'confirm\')">儲存</button>' }
}

describe('RegistrationEventDialog', () => {
  it('creates a normalized event and de-duplicates attached templates', async () => {
    const wrapper = mount(RegistrationEventDialog, {
      props: { modelValue: true, event: null, templates: templates as any },
      global: { stubs }
    })
    const vm = wrapper.vm as any
    vm.form.name = '  115 年主委盃 U9  '
    vm.form.category = ' U9 '
    vm.form.template_ids = ['template-1', 'template-1']
    vm.submit()
    expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({
      name: '115 年主委盃 U9',
      category: 'U9',
      template_ids: ['template-1']
    })
  })

  it('loads an existing event without sharing its template array', () => {
    const event = {
      id: 'event-1',
      name: '就是棒秋季聯賽',
      season_year: 2026,
      category: 'U12',
      organizer: '',
      registration_deadline: '2026-09-01',
      status: 'in_progress',
      notes: '',
      template_ids: ['template-1'],
      created_by: null,
      updated_by: null,
      created_at: '2026-08-18',
      updated_at: '2026-08-18'
    } as const
    const wrapper = mount(RegistrationEventDialog, {
      props: { modelValue: true, event: event as any, templates: templates as any },
      global: { stubs }
    })
    const vm = wrapper.vm as any
    vm.form.template_ids.push('template-2')
    expect(event.template_ids).toEqual(['template-1'])
    expect(vm.form.status).toBe('in_progress')
  })
})
