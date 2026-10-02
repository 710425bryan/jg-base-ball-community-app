// @vitest-environment jsdom
import { defineComponent, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeCoachScheduleMonthPayload } from '@/utils/coachSchedules'
import { useCoachScheduleEditor } from './useCoachScheduleEditor'

const mocks = vi.hoisted(() => ({ listAdminMonth: vi.fn(), listSchedulableCoaches: vi.fn(), saveEvent: vi.fn(), deleteEvent: vi.fn(), confirm: vi.fn(), error: vi.fn() }))
vi.mock('@/services/coachSchedulesApi', () => ({ coachSchedulesApi: mocks }))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: mocks.error }, ElMessageBox: { confirm: mocks.confirm } }))
const payload = (revision = 'v1', coachIds = ['a']) => normalizeCoachScheduleMonthPayload({ events: [
  { id: 'event', source_type: 'training_date', schedule_date: '2026-10-03', title: '訓練', updated_at: revision, coach_profile_ids: coachIds },
  { id: 'other', source_type: 'training_date', schedule_date: '2026-10-10', title: '訓練', updated_at: 'v1', coach_profile_ids: ['b'] }
] })
const create = async () => {
  let editor!: ReturnType<typeof useCoachScheduleEditor>
  const wrapper = mount(defineComponent({ setup() {
    editor = useCoachScheduleEditor(ref('2026-10'), { canCreate: ref(true), canEdit: ref(true), canDelete: ref(true) }, () => false)
    return () => null
  } }))
  await editor.loadMonth()
  return { editor, wrapper }
}
describe('useCoachScheduleEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listAdminMonth.mockResolvedValue(payload())
    mocks.listSchedulableCoaches.mockResolvedValue([])
    mocks.saveEvent.mockResolvedValue('event')
    mocks.confirm.mockResolvedValue(true)
  })
  it('rejects a draft when leave removed an assignment remotely instead of restoring the old roster', async () => {
    const { editor, wrapper } = await create()
    const original = editor.events.value[0]!
    editor.getEventForm(original).note = '本機修改'
    mocks.listAdminMonth.mockResolvedValue(payload('v2', []))
    await editor.saveEvent(original)
    expect(mocks.saveEvent).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('請重新整理'))
    expect(editor.getEventForm(original).note).toBe('本機修改')
    wrapper.unmount()
  })
  it('skips focus refresh while dirty and refreshes clean forms after focus', async () => {
    const { editor, wrapper } = await create()
    editor.getEventForm(editor.events.value[0]!).note = '本機修改'
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(mocks.listAdminMonth).toHaveBeenCalledTimes(1)
    editor.getEventForm(editor.events.value[0]!).note = ''
    mocks.listAdminMonth.mockResolvedValue(payload('v2', []))
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(editor.events.value[0]!.coach_profile_ids).toEqual([])
    wrapper.unmount()
  })
  it('preserves another edited row after a successful save and asks before manual reload', async () => {
    const { editor, wrapper } = await create()
    editor.getEventForm(editor.events.value[1]!).note = '其他未儲存內容'
    await editor.saveEvent(editor.events.value[0]!)
    expect(mocks.saveEvent).toHaveBeenCalledTimes(1)
    expect(editor.getEventForm(editor.events.value[1]!).note).toBe('其他未儲存內容')
    mocks.confirm.mockRejectedValue('cancel')
    await editor.reload()
    expect(editor.getEventForm(editor.events.value[1]!).note).toBe('其他未儲存內容')
    wrapper.unmount()
  })
})
