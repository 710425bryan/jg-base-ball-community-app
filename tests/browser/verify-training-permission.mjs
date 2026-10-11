import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'

// Real app/router/store; every external HTTP/WebSocket request stays in this fixture.
const base = process.env.TRAINING_PERMISSION_TEST_URL || 'http://127.0.0.1:5188'
const output = resolve(process.argv[2] || '/tmp/jg-training-permission-browser')
const project = 'training-permission'
const userId = '11111111-1111-4111-8111-111111111111'
const memberId = '22222222-2222-4222-8222-222222222222'
const email = 'training-permission@example.invalid'
const exp = Math.floor(Date.now() / 1000) + 3600
const user = { id: userId, email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() }
const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', role: 'authenticated', exp })).toString('base64url'), 'local-fixture'].join('.')
const session = { access_token: token, refresh_token: 'local-fixture-only', token_type: 'bearer', expires_in: 3600, expires_at: exp, user }
const evidence = { scope: 'Real local UI with isolated Auth/REST/Realtime; no remote mutation or notification', checks: [], screenshots: [], pageErrors: [], blockedExternalRequests: [] }
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const width of [390, 1365]) {
    const state = { role: 'COMMITTEE', actions: [], linked: true, trainingCalls: [] }
    const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: 'Asia/Taipei', serviceWorkers: 'block' })
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin === base) return route.continue()
      if (url.hostname !== `${project}.supabase.co`) {
        evidence.blockedExternalRequests.push(url.origin + url.pathname)
        return route.abort()
      }
      const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
      if (url.pathname === '/rest/v1/profiles') return json({ id: userId, email, name: '權限測試帳號', role: state.role, is_active: true, access_start: null, access_end: null, linked_team_member_ids: state.linked ? [memberId] : [] })
      if (url.pathname === '/rest/v1/app_role_permissions') return json(state.actions.map(action => ({ feature: 'training', action })))
      if (url.pathname === '/rest/v1/app_roles') return json([{ role_key: 'COMMITTEE', role_name: '新泰太陽社區', weight: 21 }, { role_key: 'ADMIN', role_name: '系統管理員', weight: 1 }])
      if (url.pathname === '/auth/v1/user') return json(user)
      if (url.pathname === '/auth/v1/token') return json(session)
      if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 })
      const rpc = url.pathname.split('/rpc/')[1]
      if (rpc === 'get_my_home_snapshot') return json({ members: state.linked ? [{ id: memberId, name: '測試球員', role: '球員', status: '在隊', point_balance: 10, reserved_training_points: 0, available_training_points: 10 }] : [], training_locations: [], training_month_dates: [] })
      if (rpc === 'get_my_home_next_event' || rpc === 'get_public_holiday_theme_config') return json(null)
      if (rpc === 'list_my_training_members') {
        state.trainingCalls.push(rpc)
        return json(state.linked ? [{ member_id: memberId, name: '測試球員', role: '球員', point_balance: 10, reserved_points: 0, available_points: 10, active_block_count: 0 }] : [])
      }
      if (rpc === 'list_training_sessions' || rpc === 'list_player_point_transactions' || rpc === 'list_training_admin_registrations') {
        state.trainingCalls.push(rpc)
        return json([])
      }
      if (url.pathname === '/rest/v1/team_members_safe') return json(state.linked ? [{ id: memberId, name: '測試球員', role: '球員', status: '在隊', is_inactive_or_graduated: false }] : [])
      if (rpc) return json([])
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
        } else if (event === 'heartbeat' || event === 'phx_leave') {
          ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]))
        }
      })
    })
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    page.on('pageerror', error => evidence.pageErrors.push({ width, message: error.message }))
    await page.addInitScript(({ base, project, session }) => {
      if (location.origin === base) localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify(session))
    }, { base, project, session })
    const shot = async name => {
      const path = resolve(output, `${width}-${name}.png`)
      await page.screenshot({ path, animations: 'disabled' })
      evidence.screenshots.push(path)
    }
    const go = async path => {
      await page.goto(base + '/?fixture=' + Math.random().toString(36).slice(2) + '#' + path)
      await page.locator('.app-main-scroll').waitFor()
    }
    const routerPush = path => page.evaluate(path => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path), path)
    const refreshPermissions = () => page.evaluate(() => {
      const stores = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s
      return stores.get('permissions').fetchPermissions(stores.get('auth').profile.role)
    })

    await go('/training')
    await page.waitForURL(url => url.hash === '#/dashboard')
    await expect(page.locator('.training-view-page')).toHaveCount(0)
    await expect(page.locator('a[href="#/training"]')).toHaveCount(0)
    await expect(page.locator('.training-point-card')).toHaveCount(0)
    assert.deepEqual(state.trainingCalls, [])
    evidence.checks.push({ width, check: 'linked COMMITTEE without VIEW: deep link rejected, no menu/point card/training RPC' })
    await shot('denied-linked')

    state.actions = ['CREATE', 'EDIT', 'DELETE']
    await refreshPermissions()
    await routerPush('/training')
    await page.waitForURL(url => url.hash === '#/dashboard')
    assert.deepEqual(state.trainingCalls, [])
    evidence.checks.push({ width, check: 'CRUD without VIEW cannot enter or load training' })

    state.actions = ['VIEW']
    await refreshPermissions()
    await routerPush('/training')
    await expect(page.locator('.training-view-page')).toBeVisible()
    await expect(page.getByText('目前沒有即將到來的特訓課。', { exact: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: '教練管理' })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: '點數管理' })).toHaveCount(0)
    assert.ok(state.trainingCalls.includes('list_my_training_members'))
    assert.ok(state.trainingCalls.includes('list_training_sessions'))
    evidence.checks.push({ width, check: 'VIEW permits linked personal workspace but no management tabs' })
    await shot('allowed-view')

    state.actions = []
    await refreshPermissions()
    await page.waitForURL(url => url.hash === '#/dashboard')
    await expect(page.locator('.training-view-page')).toHaveCount(0)
    await expect(page.locator('.training-point-card')).toHaveCount(0)
    evidence.checks.push({ width, check: 'revoking VIEW unmounts active workspace and redirects' })
    await shot('revoked')

    state.actions = ['VIEW']
    state.linked = false
    await go('/training')
    await page.reload()
    await expect(page.locator('.training-view-page')).toBeVisible()
    await expect(page.getByRole('tab', { name: '教練管理' })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: '點數管理' })).toHaveCount(0)
    evidence.checks.push({ width, check: 'VIEW without linked member does not grant management' })

    state.role = 'ADMIN'
    state.actions = []
    await page.reload()
    await expect(page.locator('.training-view-page')).toBeVisible()
    await expect(page.getByRole('tab', { name: '教練管理' })).toBeVisible()
    await expect(page.getByRole('tab', { name: '點數管理' })).toBeVisible()
    evidence.checks.push({ width, check: 'ADMIN retains existing bypass and management workspace' })
    await shot('admin')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await context.close()
  }
  assert.equal(evidence.pageErrors.length, 0)
  evidence.result = 'PASS'
} catch (error) {
  evidence.result = 'FAIL'
  evidence.error = String(error)
  throw error
} finally {
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence, null, 2))
  await browser.close()
}
