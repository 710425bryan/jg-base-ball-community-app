import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'

// Uses the actual local app + SDK. All Auth/REST/Realtime traffic is intercepted;
// no real session, account mutation, OTP email, or remote websocket is used.
const base = process.env.SUSPENSION_TEST_URL || 'http://127.0.0.1:5174'
const output = resolve(process.argv[2] || '/tmp/jg-account-suspension')
const project = 'qwxzwomzoyfkorbwsscv'
const userId = '11111111-1111-4111-8111-111111111111'
const email = 'suspended-demo@example.com'
const exp = Math.floor(Date.now() / 1000) + 3600
const token = [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', role: 'authenticated', exp })).toString('base64url'),
  'local-fixture'
].join('.')
const user = { id: userId, email, aud: 'authenticated', role: 'authenticated', created_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {} }
const session = { access_token: token, refresh_token: 'local-fixture-only', token_type: 'bearer', expires_in: 3600, expires_at: exp, user }
const evidence = { scope: 'Local app + mocked REST/Auth/Realtime protocol; no production mutation or email', checks: [], screenshots: [], pageErrors: [], blockedExternalRequests: [] }
const state = { active: true, otpRequests: 0 }
const profile = () => ({ id: userId, email, name: '停權測試帳號', role: 'PARENT', is_active: state.active, access_start: null, access_end: null, linked_team_member_ids: [] })
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const clients = []
const capture = async (page, name) => {
  const path = resolve(output, name + '.png')
  await page.screenshot({ path, animations: 'disabled' })
  evidence.screenshots.push(path)
}
try {
  for (const width of [390, 1365]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: 'Asia/Taipei', serviceWorkers: 'block' })
    let publish
    let subscribed = false
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin === base) return route.continue()
      if (url.hostname !== `${project}.supabase.co`) {
        evidence.blockedExternalRequests.push(url.origin + url.pathname)
        return route.abort()
      }
      const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
      if (url.pathname === '/rest/v1/profiles') return json(profile())
      if (url.pathname === '/rest/v1/rpc/can_request_magic_link') return json(state.active)
      if (url.pathname === '/auth/v1/otp') { state.otpRequests++; return json({}) }
      if (url.pathname === '/auth/v1/settings') return json({ external: { email: true }, passkey_enabled: false })
      if (url.pathname === '/auth/v1/token' || url.pathname === '/auth/v1/verify') return json(session)
      if (url.pathname === '/auth/v1/user') return json(user)
      if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 })
      if (url.pathname === '/rest/v1/rpc/get_public_landing_snapshot') return json({ todayEvent: null, todayLeaveNames: [], todayLeaveCount: 0, upcomingMatches: [], latestAnnouncements: [] })
      if (url.pathname.includes('/rpc/')) return json(null)
      if (url.pathname.startsWith('/rest/v1/')) return json([])
      return route.abort()
    })
    await context.routeWebSocket('**/*', ws => {
      const url = new URL(ws.url())
      if (url.host === new URL(base).host) { ws.connectToServer(); return }
      if (url.hostname !== `${project}.supabase.co`) { ws.close(); return }
      ws.onMessage(raw => {
        const [joinRef, ref, topic, event, payload] = JSON.parse(String(raw))
        if (event === 'phx_join') {
          const filters = (payload.config?.postgres_changes || []).map((filter, index) => ({ ...filter, id: index + 1 }))
          ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: filters } }]))
          if (topic === `realtime:profile-access:${userId}`) {
            assert.deepEqual(filters[0], { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}`, id: 1 })
            subscribed = true
            publish = () => ws.send(JSON.stringify([joinRef, null, topic, 'postgres_changes', {
              ids: [1], data: { schema: 'public', table: 'profiles', type: 'UPDATE', commit_timestamp: new Date().toISOString(), errors: null,
                columns: [{ name: 'id', type: 'uuid' }, { name: 'is_active', type: 'bool' }], record: profile(), old_record: { id: userId } }
            }]))
          }
        } else if (event === 'heartbeat' || event === 'phx_leave') {
          ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]))
        }
      })
    })
    const page = await context.newPage()
    page.setDefaultTimeout(10_000)
    page.on('pageerror', error => evidence.pageErrors.push({ width, message: error.message }))
    await page.addInitScript(({ base, project, session }) => {
      if (location.origin === base && !sessionStorage.getItem('suspension-fixture-seeded')) {
        localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify(session))
        sessionStorage.setItem('suspension-fixture-seeded', 'true')
      }
    }, { base, project, session })
    await page.goto(base + '/#/calendar')
    await page.locator('.app-main-scroll').waitFor()
    await page.waitForFunction(() => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('auth').isAuthenticated)
    await expect.poll(() => subscribed, { timeout: 5000 }).toBe(true)
    assert.ok(subscribed, 'profile realtime subscription must be established')
    clients.push({ width, context, page, publish: () => publish() })
  }
  state.active = false
  const sentAt = Date.now()
  for (const client of clients) client.publish()
  for (const { width, page } of clients) {
    await page.getByRole('heading', { name: '已自動登出' }).waitFor({ timeout: 5000 })
    await page.waitForURL('**/#/')
    assert.equal(await page.locator('.app-main-scroll').count(), 0)
    const stateAfter = await page.evaluate(project => {
      const auth = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('auth')
      return { authenticated: auth.isAuthenticated, profile: auth.profile, storedSession: !!localStorage.getItem(`sb-${project}-auth-token`) }
    }, project)
    assert.equal(stateAfter.authenticated, false)
    assert.equal(stateAfter.profile, null)
    await page.waitForFunction(project => !localStorage.getItem(`sb-${project}-auth-token`), project)
    evidence.checks.push({ width, check: 'realtime suspension unmounts protected content and clears session without reload', elapsedMs: Date.now() - sentAt })
    await capture(page, `${width}-01-immediate-signout`)
    const bounds = await page.getByRole('button', { name: '返回首頁' }).boundingBox()
    assert.ok(bounds.height >= 44)
    const noticeBounds = await page.locator('.auth-access-notice').boundingBox()
    assert.ok(noticeBounds.height >= 844)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.getByRole('button', { name: '返回首頁' }).click()
    await page.getByRole('button', { name: '登入', exact: true }).click()
    await page.getByRole('textbox', { name: '登入 email' }).fill(email)
    const before = state.otpRequests
    await page.getByRole('button', { name: '寄送登入驗證碼', exact: true }).click()
    await page.locator('#email-error').waitFor()
    assert.match(await page.locator('#email-error').innerText(), /已停權/)
    assert.equal(state.otpRequests, before)
    assert.equal(await page.getByText('驗證碼已寄出', { exact: true }).count(), 0)
    await capture(page, `${width}-02-blocked-email`)
    evidence.checks.push({ width, check: 'suspended account has persistent send error, zero Auth OTP calls' })
  }
  // The same send form recovers after an administrator re-enables the account.
  const page = clients[0].page
  state.active = true
  await page.getByRole('button', { name: '寄送登入驗證碼', exact: true }).click()
  await page.getByText('驗證碼已寄出', { exact: true }).waitFor()
  assert.equal(state.otpRequests, 1)
  evidence.checks.push({ check: 'active account can request OTP again', otpRequests: state.otpRequests })
  assert.equal(evidence.pageErrors.length, 0)
  evidence.result = 'PASS'
} catch (error) {
  evidence.result = 'FAIL'
  evidence.error = String(error)
  for (const { page, width } of clients) await capture(page, `${width}-failure`).catch(() => {})
  throw error
} finally {
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence, null, 2))
  await browser.close()
}
