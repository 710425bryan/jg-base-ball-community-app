import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript'
import { describe, expect, it, vi } from 'vitest'

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
const runtimeSource = transpileModule(source.replace(/^import .+;\r?$/gm, ''), {
  compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.None }
}).outputText

const createHarness = ({
  model,
  hasPermission = true,
  upstreamStatus = 200
}: { model?: string; hasPermission?: boolean; upstreamStatus?: number } = {}) => {
  let handler!: (request: Request) => Promise<Response>
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(
    upstreamStatus === 200
      ? { candidates: [{ content: { parts: [{ text: JSON.stringify({
        lineup: [{ order: 1, position: 'C', raw_position: '捕手', name: '王小明', number: '10' }],
        reserves: []
      }) }] } }] }
      : { error: { code: upstreamStatus, status: 'NOT_FOUND', message: 'model unavailable' } }
  ), { status: upstreamStatus }))
  const env: Record<string, string | undefined> = {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    SUPABASE_ANON_KEY: 'test-anon-key',
    GEMINI_API_KEY: 'test-gemini-key',
    GEMINI_LINEUP_MODEL: model
  }
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null })
  const rpc = vi.fn().mockResolvedValue({ data: hasPermission, error: null })
  runInNewContext(runtimeSource, {
    Deno: { env: { get: (name: string) => env[name] } },
    serve: (callback: typeof handler) => { handler = callback },
    createClient: (_url: string, key: string) => key === env.SUPABASE_SERVICE_ROLE_KEY
      ? { auth: { getUser } }
      : { rpc },
    fetch: fetcher,
    Request,
    Response,
    console: { error: vi.fn() }
  })
  const request = (authorized = true) => new Request('https://test.supabase.co/functions/v1/parse-lineup', {
    method: 'POST',
    headers: authorized ? { Authorization: 'Bearer test-user-token' } : {},
    body: JSON.stringify({
      image: 'data:image/jpeg;base64,dGVzdA==',
      mimeType: 'image/jpeg',
      roster: [{ name: '王小明', uniform_number: '10' }]
    })
  })
  return { handler, fetcher, request, rpc }
}

describe('parse-lineup Edge Function', () => {
  it.each([undefined, ''])('uses Gemini 3.1 Pro when the model setting is %s', async (model) => {
    const { handler, fetcher, request, rpc } = createHarness({ model })
    const response = await handler(request())

    expect(response.status).toBe(200)
    expect(fetcher).toHaveBeenCalledOnce()
    const [url, options] = fetcher.mock.calls[0]!
    expect(new URL(url).pathname).toBe('/v1beta/models/gemini-3.1-pro-preview:generateContent')
    const body = JSON.parse(options.body)
    expect(body.contents[0].parts[1].inlineData).toEqual({ mimeType: 'image/jpeg', data: 'dGVzdA==' })
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    expect(body.generationConfig.responseSchema.required).toEqual(['lineup', 'reserves'])
    expect(rpc).toHaveBeenCalledWith('has_app_permission', { p_feature: 'matches', p_action: 'CREATE' })
    expect(rpc).toHaveBeenCalledWith('has_app_permission', { p_feature: 'matches', p_action: 'EDIT' })
    expect(await response.json()).toEqual({
      lineup: [{ order: 1, position: '2', name: '王小明', number: '10' }],
      reserves: []
    })
  })

  it('honors an explicitly configured model', async () => {
    const { handler, fetcher, request } = createHarness({ model: 'custom-lineup-model' })
    expect((await handler(request())).status).toBe(200)
    expect(new URL(fetcher.mock.calls[0]![0]).pathname).toBe('/v1beta/models/custom-lineup-model:generateContent')
  })

  it('rejects a request without a bearer token before calling Gemini', async () => {
    const { handler, fetcher, request } = createHarness()
    expect((await handler(request(false))).status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects a user without match create or edit permission before calling Gemini', async () => {
    const { handler, fetcher, request } = createHarness({ hasPermission: false })
    expect((await handler(request())).status).toBe(403)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('returns an upstream model error without applying a lineup', async () => {
    const { handler, request } = createHarness({ upstreamStatus: 404 })
    const response = await handler(request())
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: expect.stringContaining('Gemini API responded with status 404:')
    })
  })
})
