import { beforeEach, describe, expect, it, vi } from 'vitest'

const orderMock = vi.fn()
const selectMock = vi.fn(() => ({ order: orderMock }))
const fromMock = vi.fn(() => ({ select: selectMock }))
const getSessionMock = vi.fn()
const storageDownloadMock = vi.fn()

vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: { getSession: getSessionMock },
    from: fromMock,
    storage: {
      from: vi.fn(() => ({ download: storageDownloadMock }))
    }
  }
}))

describe('registrationFormsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'user-token' } },
      error: null
    })
  })

  it('lists templates newest first', async () => {
    orderMock.mockResolvedValue({
      data: [{ id: 'template-1', name: '就是棒' }],
      error: null
    })
    const { fetchRegistrationFormTemplates } = await import('./registrationFormsApi')
    await expect(fetchRegistrationFormTemplates()).resolves.toEqual([{ id: 'template-1', name: '就是棒' }])
    expect(fromMock).toHaveBeenCalledWith('registration_form_templates')
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false })
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
    expect(init?.body).toBeInstanceOf(FormData)
    const form = init?.body as FormData
    expect(form.get('original_file_name')).toBe(file.name)
    expect(form.get('file')).toBeInstanceOf(File)
    expect((form.get('file') as File).name).toBe('template.docx')
  })

  it('surfaces JSON errors before attempting a binary download', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: '第 1 位球員缺少生日'
    }), { status: 400, headers: { 'Content-Type': 'application/json' } }))
    const { generateRegistrationFormDocument } = await import('./registrationFormsApi')
    await expect(generateRegistrationFormDocument({
      template_id: 'template-1',
      fields: {} as any,
      players: []
    }, 'fallback.xlsx')).rejects.toThrow('缺少生日')
  })
})
