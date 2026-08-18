import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  templatesOrder: vi.fn(),
  eventsSecondOrder: vi.fn(),
  logsLimit: vi.fn(),
  deleteEventEq: vi.fn(),
  getSession: vi.fn(),
  storageDownload: vi.fn(),
  rpc: vi.fn()
}))

const fromMock = vi.hoisted(() => vi.fn((table: string) => {
  if (table === 'registration_form_templates') {
    return { select: vi.fn(() => ({ order: mocks.templatesOrder })) }
  }
  if (table === 'registration_form_events') {
    return {
      select: vi.fn(() => ({
        order: vi.fn(() => ({ order: mocks.eventsSecondOrder }))
      })),
      delete: vi.fn(() => ({ eq: mocks.deleteEventEq }))
    }
  }
  if (table === 'registration_form_generation_logs') {
    return {
      select: vi.fn(() => ({
        order: vi.fn(() => ({ limit: mocks.logsLimit }))
      }))
    }
  }
  return {}
}))

vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    from: fromMock,
    rpc: mocks.rpc,
    storage: {
      from: vi.fn(() => ({ download: mocks.storageDownload }))
    }
  }
}))

describe('registrationFormsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'user-token' } },
      error: null
    })
  })

  it('lists templates and normalizes ordered event template links', async () => {
    mocks.templatesOrder.mockResolvedValue({
      data: [{ id: 'template-1', name: '就是棒' }],
      error: null
    })
    mocks.eventsSecondOrder.mockResolvedValue({
      data: [{
        id: 'event-1',
        name: '秋季聯賽',
        registration_form_event_templates: [
          { template_id: 'template-2', sort_order: 1 },
          { template_id: 'template-1', sort_order: 0 }
        ]
      }],
      error: null
    })
    const { fetchRegistrationFormEvents, fetchRegistrationFormTemplates } = await import('./registrationFormsApi')
    await expect(fetchRegistrationFormTemplates()).resolves.toEqual([{ id: 'template-1', name: '就是棒' }])
    await expect(fetchRegistrationFormEvents()).resolves.toEqual([{
      id: 'event-1',
      name: '秋季聯賽',
      template_ids: ['template-1', 'template-2']
    }])
    expect(fromMock).toHaveBeenCalledWith('registration_form_templates')
    expect(fromMock).toHaveBeenCalledWith('registration_form_events')
  })

  it('saves an event through the atomic RPC and lists privacy-minimized logs', async () => {
    mocks.rpc.mockResolvedValue({ data: 'event-1', error: null })
    mocks.logsLimit.mockResolvedValue({
      data: [{ id: 'log-1', event_id: 'event-1', player_count: 20 }],
      error: null
    })
    const { fetchRegistrationFormGenerationLogs, saveRegistrationFormEvent } = await import('./registrationFormsApi')
    await expect(saveRegistrationFormEvent({
      name: ' 主委盃 ',
      season_year: 2026,
      category: ' U9 ',
      organizer: '',
      registration_deadline: '2026-09-01',
      status: 'draft',
      notes: '',
      template_ids: ['template-1']
    })).resolves.toBe('event-1')
    expect(mocks.rpc).toHaveBeenCalledWith('save_registration_form_event', expect.objectContaining({
      p_event_id: null,
      p_name: '主委盃',
      p_category: 'U9',
      p_template_ids: ['template-1']
    }))
    await expect(fetchRegistrationFormGenerationLogs()).resolves.toEqual([
      { id: 'log-1', event_id: 'event-1', player_count: 20 }
    ])
  })

  it('deletes an event through its RLS-protected table', async () => {
    mocks.deleteEventEq.mockResolvedValue({ error: null })
    const { deleteRegistrationFormEvent } = await import('./registrationFormsApi')
    await expect(deleteRegistrationFormEvent('event-1')).resolves.toBeUndefined()
    expect(mocks.deleteEventEq).toHaveBeenCalledWith('id', 'event-1')
  })

  it('uploads a template with JWT and anon key headers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      template: { id: 'template-1', name: '主委盃 U9' }
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
    const { uploadRegistrationFormTemplate } = await import('./registrationFormsApi')
    const file = new File(['zip'], '115年主委盃U9幼兒軟式棒球=報名表.docx')
    await expect(uploadRegistrationFormTemplate(file)).resolves.toMatchObject({ id: 'template-1' })
    const [, init] = fetchMock.mock.calls[0]
    const headers = new Headers(init?.headers)
    expect(headers.get('Authorization')).toBe('Bearer user-token')
    expect(headers.get('apikey')).toBe('anon-key')
    const form = init?.body as FormData
    expect(form.get('original_file_name')).toBe(file.name)
    expect((form.get('file') as File).name).toBe('template.docx')
  })

  it('surfaces JSON errors before attempting a binary download', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: '第 1 位球員缺少生日'
    }), { status: 400, headers: { 'Content-Type': 'application/json' } }))
    const { generateRegistrationFormDocument } = await import('./registrationFormsApi')
    await expect(generateRegistrationFormDocument({
      event_id: 'event-1',
      template_id: 'template-1',
      fields: {} as any,
      players: []
    }, 'fallback.xlsx')).rejects.toThrow('缺少生日')
  })
})
