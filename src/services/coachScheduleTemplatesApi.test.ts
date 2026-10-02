import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCoachScheduleTemplate } from '@/utils/coachScheduleTemplates'
import type { CoachScheduleTemplateInput } from '@/types/coachScheduleTemplate'

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), rpc: vi.fn() }))
vi.mock('@/services/supabase', () => ({ supabase: { auth: { getSession: mocks.getSession }, rpc: mocks.rpc } }))
import { coachScheduleTemplatesApi as api } from './coachScheduleTemplatesApi'

describe('coachScheduleTemplatesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'token' } }, error: null })
    mocks.rpc.mockResolvedValue({ data: null, error: null })
  })
  it('requires a session before reading templates, venue names or previews', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
    await expect(api.list()).rejects.toThrow('登入狀態已過期')
    await expect(api.listVenues()).rejects.toThrow('登入狀態已過期')
    await expect(api.preview('2026-10')).rejects.toThrow('登入狀態已過期')
    await expect(api.save(createCoachScheduleTemplate())).rejects.toThrow('登入狀態已過期')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('reads an independent active venue dictionary and drops legacy template modes', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ id: 'v', name: ' 中港國小 ' }], error: null })
    expect(await api.listVenues()).toEqual([{ id: 'v', name: '中港國小' }])
    expect(mocks.rpc).toHaveBeenLastCalledWith('list_coach_schedule_template_venues', undefined)
    const legacy = { id: 'old', source_type: 'training_date', weekday: 6, start_time: '09:00', title: '舊精確範本' }
    mocks.rpc.mockResolvedValueOnce({ data: [legacy, { id: 'venue-rule', match_mode: 'venue', name: '中港固定教練',
      venue_id: 'v', venue_name: '中港國小', venue_is_active: true, is_active: true, coach_profile_ids: ['a'] }], error: null })
    expect(await api.list()).toMatchObject([{ id: 'venue-rule', match_mode: 'venue', venue_name: '中港國小' }])
  })
  it('atomically saves a typed Chinese venue and optional blank name in one protected RPC', async () => {
    const draft = { ...createCoachScheduleTemplate(), venue_name: ' 新埔球場 ', name: '  ', coach_profile_ids: ['a', 'a'] }
    await api.save(draft)
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('save_coach_schedule_template', { p_template: {
      id: null, updated_at: null, match_mode: 'venue', name: '', is_active: true,
      venue_name: '新埔球場', coach_profile_ids: ['a']
    } })
  })
  it('whitelists venue-mode fields, uses an existing venue ID and preserves optimistic revision', async () => {
    const draft = { ...createCoachScheduleTemplate(), id: 't', updated_at: 'version', venue_id: 'v',
      venue_name: 'display metadata', name: ' 名稱 ', coach_profile_ids: ['a'], weekday: 6, title: '不再傳送', start_time: '09:00', source_type: 'training_date' }
    await api.save(draft)
    expect(mocks.rpc).toHaveBeenLastCalledWith('save_coach_schedule_template', { p_template: {
      id: 't', updated_at: 'version', match_mode: 'venue', venue_id: 'v', name: '名稱', is_active: true, coach_profile_ids: ['a']
    } })
    await api.delete({ ...draft, venue_is_active: true })
    expect(mocks.rpc).toHaveBeenLastCalledWith('delete_coach_schedule_template', { p_template_id: 't', p_updated_at: 'version' })
  })
  it('rejects legacy save input instead of silently creating a broad venue rule', async () => {
    await expect(api.save({ match_mode: 'exact' } as unknown as CoachScheduleTemplateInput)).rejects.toThrow('此範本格式已不支援')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('keeps backend duplicate/stale errors and uses the month fingerprint for confirmation', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { fingerprint: 'v', rows: [] }, error: null })
    expect(await api.preview('2026-10')).toEqual({ fingerprint: 'v', rows: [] })
    await api.confirm('2026-10', 'fingerprint', ['event-a', 'event-a'])
    expect(mocks.rpc).toHaveBeenLastCalledWith('confirm_coach_schedule_auto_fill', { p_month: '2026-10-01', p_fingerprint: 'fingerprint', p_event_keys: ['event-a'] })
    const error = { message: '此場地已有啟用範本' }
    mocks.rpc.mockResolvedValue({ data: null, error })
    await expect(api.save({ ...createCoachScheduleTemplate(), venue_name: '中港國小' })).rejects.toBe(error)
    await expect(api.confirm('2026-10', 'v', ['event-a'])).rejects.toBe(error)
  })
})
