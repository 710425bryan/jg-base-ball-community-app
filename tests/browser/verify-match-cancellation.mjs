import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { chromium, expect } from '@playwright/test'

const root = fileURLToPath(new URL('../..', import.meta.url))
const base = 'http://127.0.0.1:5192'
const project = 'match-cancellation-fixture'
const output = resolve(process.argv[2] || 'output/playwright/match-cancellation')
const captureOnly = process.env.MATCH_CANCELLATION_CAPTURE_ONLY === '1'
const calendarRestoreOnly = process.env.MATCH_RESTORATION_CALENDAR_ONLY === '1'
const readonlyRestoreOnly = process.env.MATCH_RESTORATION_READONLY_ONLY === '1'
const measureMobileDensity = process.env.MATCH_CARD_MOBILE_DENSITY === '1'
const selectedWidths = process.env.MATCH_CARD_WIDTHS?.split(',').map(Number)
const viewports = (measureMobileDensity
  ? [{ width: 375, height: 812 }, { width: 390, height: 844 }, { width: 360, height: 740 }, { width: 320, height: 568 }]
  : [390, 768, 1365].map(width => ({ width, height: 960 })))
  .filter(viewport => !selectedWidths || selectedWidths.includes(viewport.width))
assert.ok(viewports.length > 0, 'Select at least one supported viewport')
const userId = '11111111-1111-4111-8111-111111111111'
const memberId = '22222222-2222-4222-8222-222222222222'
const fixedDate = new Date('2026-10-12T08:00:00+08:00')
const email = 'match-cancellation@example.invalid'
const expiry = Math.floor(new Date('2030-01-01T00:00:00Z').valueOf() / 1000)
const user = { id: userId, email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: fixedDate.toISOString() }
const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', role: 'authenticated', exp: expiry })).toString('base64url'), 'local-fixture'].join('.')
const session = { access_token: token, refresh_token: 'local-fixture-only', token_type: 'bearer', expires_in: 3600, expires_at: expiry, user }
const imageBytes = await readFile(resolve(root, 'public/images/match-default-cover.webp'))
const imageOrigin = `https://${project}.supabase.co/storage/v1/object/public/matches-photos`
const longLocation = '臺北市大同區延平北路四段一百七十九號迪化運動公園棒球場第三壘側集合區（請由河濱步道入口進入）'
const makeMatch = (id, name, extra = {}) => ({
  id, match_name: name, tournament_name: '秋季社區友誼交流賽', opponent: '新太陽社區棒球隊',
  match_date: '2026-10-18', match_time: '09:00 - 11:30', location: longLocation,
  category_group: 'U12', match_level: '友誼賽', home_score: 0, opponent_score: 0,
  coaches: '測試教練', players: '測試球員', note: '集合時間：08:15\n請穿球隊制服',
  photo_url: '', video_url: '', absent_players: [], lineup: [], current_lineup: [], inning_logs: [], batting_stats: [], pitching_stats: [],
  cancelled_at: null, cancellation_reason: null, cancelled_by: null,
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-11T00:00:00Z', ...extra
})
const createMatches = () => [
  makeMatch('33333333-3333-4333-8333-333333333331', '有照片友誼賽', { photo_url: `${imageOrigin}/uploaded.webp` }),
  makeMatch('33333333-3333-4333-8333-333333333332', '預設照片友誼賽', { location: '新北大都會棒球場' }),
  makeMatch('33333333-3333-4333-8333-333333333333', '照片失效友誼賽', { photo_url: `${imageOrigin}/missing.webp` }),
  makeMatch('33333333-3333-4333-8333-333333333334', '已取消友誼賽', { match_date: '2026-10-20', cancelled_at: '2026-10-11T08:00:00Z', cancellation_reason: '對手行程調整', cancelled_by: userId }),
  makeMatch('33333333-3333-4333-8333-333333333335', '歷史勝利賽事', { match_date: '2026-10-11', home_score: 8, opponent_score: 3, photo_url: `${imageOrigin}/uploaded.webp` }),
  makeMatch('33333333-3333-4333-8333-333333333336', '歷史取消賽事', { match_date: '2026-10-11', cancelled_at: '2026-10-10T08:00:00Z', cancellation_reason: '天候不佳', cancelled_by: userId })
]

const evidence = { scope: captureOnly ? 'Capture at rest only; full behavior verification is recorded separately in evidence.json.' : calendarRestoreOnly || readonlyRestoreOnly ? 'Readonly/calendar restoration supplement with isolated Auth/REST/Realtime. Full card behavior is recorded separately.' : 'Actual App/Router/Pinia/Element Plus with isolated Auth/REST/Realtime. No production account or remote writes.', base, checks: [], screenshots: [], pageErrors: [], blockedExternalRequests: [], unexpectedWrites: [] }
const record = (width, check, detail = {}) => evidence.checks.push({ width, check, ...detail })
await mkdir(output, { recursive: true })
// Avoid .env, the production version writer, and service workers entirely.
const server = await createServer({
  configFile: false, root, envDir: resolve(tmpdir(), 'jg-match-cancellation-empty-env'),
  cacheDir: resolve(tmpdir(), 'jg-match-cancellation-vite-cache'), plugins: [vue()],
  resolve: { alias: { '@': resolve(root, 'src') } },
  define: {
    __APP_VERSION__: JSON.stringify(JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version),
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(`https://${project}.supabase.co`),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('local-fixture-anon-key')
  },
  server: { host: '127.0.0.1', port: 5192, strictPort: true }
})
let browser
let currentPage
try {
  await server.listen()
  browser = await chromium.launch({ headless: true })
  for (const { width, height } of viewports) {
    const state = {
      role: 'ADMIN', matches: createMatches(), cancellationRequests: [], rejectCancellation: true,
      restorationRequests: [], rejectRestoration: true
    }
    const context = await browser.newContext({ viewport: { width, height }, timezoneId: 'Asia/Taipei', serviceWorkers: 'block' })
    await context.route('**/*', route => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === base) return route.continue()
      if (url.hostname === 'calendar.google.com' && url.pathname === '/calendar/embed') {
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>隔離行事曆預覽</body></html>' })
      }
      if (url.hostname !== `${project}.supabase.co`) {
        evidence.blockedExternalRequests.push(url.origin + url.pathname)
        return route.abort()
      }
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
      if (url.pathname.endsWith('/uploaded.webp')) return route.fulfill({ status: 200, contentType: 'image/webp', body: imageBytes })
      if (url.pathname.endsWith('/missing.webp')) return route.fulfill({ status: 404, body: '' })
      if (url.pathname === '/auth/v1/user') return json(user)
      if (url.pathname === '/auth/v1/token') return json(session)
      if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 })
      if (url.pathname === '/rest/v1/profiles') return json({ id: userId, email, name: '賽事驗收帳號', role: state.role, is_active: true, access_start: null, access_end: null, linked_team_member_ids: [memberId] })
      if (url.pathname === '/rest/v1/app_roles') return json([{ role_key: 'ADMIN', role_name: '管理員', weight: 1 }, { role_key: 'VIEWER', role_name: '唯讀測試', weight: 20 }])
      if (url.pathname === '/rest/v1/app_role_permissions') return json([{ feature: 'matches', action: 'VIEW' }])
      if (url.pathname === '/rest/v1/matches' && request.method() === 'GET') {
        const idFilter = url.searchParams.get('id')
        let rows = idFilter ? state.matches.filter(match => match.id === idFilter.replace('eq.', '')) : [...state.matches]
        const cancellationFilter = url.searchParams.get('cancelled_at')
        if (cancellationFilter === 'is.null') rows = rows.filter(match => !match.cancelled_at)
        if (cancellationFilter === 'not.is.null') rows = rows.filter(match => Boolean(match.cancelled_at))
        const dateFilter = url.searchParams.get('match_date')
        if (dateFilter?.startsWith('gte.')) rows = rows.filter(match => match.match_date >= dateFilter.slice(4))
        if (dateFilter?.startsWith('lt.')) rows = rows.filter(match => match.match_date < dateFilter.slice(3))
        const sortOrder = url.searchParams.get('order')
        if (sortOrder) rows.sort((left, right) => {
          const comparison = left.match_date.localeCompare(right.match_date) || left.match_time.localeCompare(right.match_time)
          return sortOrder.startsWith('match_date.desc') ? -comparison : comparison
        })
        const limit = Number(url.searchParams.get('limit'))
        if (limit > 0) rows = rows.slice(0, limit)
        return json(request.headers().accept?.includes('vnd.pgrst.object') ? rows[0] : rows)
      }
      const rpc = url.pathname.split('/rpc/')[1]
      if (rpc === 'cancel_match') {
        const body = request.postDataJSON()
        state.cancellationRequests.push(body)
        if (state.rejectCancellation) return json({ code: 'P0001', message: '測試：賽事已被更新，請重新確認' }, 409)
        const original = state.matches.find(match => match.id === body.p_match_id)
        const result = { ...original, cancelled_at: fixedDate.toISOString(), cancellation_reason: body.p_reason, cancelled_by: userId, updated_at: fixedDate.toISOString() }
        state.matches = state.matches.map(match => match.id === result.id ? result : match)
        return json(result)
      }
      if (rpc === 'restore_match') {
        const body = request.postDataJSON()
        state.restorationRequests.push(body)
        if (state.rejectRestoration) return json({ code: 'P0001', message: '測試：恢復失敗，請重新確認' }, 409)
        const original = state.matches.find(match => match.id === body.p_match_id)
        const result = {
          ...original, cancelled_at: null, cancellation_reason: null, cancelled_by: null,
          updated_at: new Date(fixedDate.valueOf() + 1000).toISOString()
        }
        state.matches = state.matches.map(match => match.id === result.id ? result : match)
        return json(result)
      }
      if (rpc === 'get_public_holiday_theme_config' || rpc === 'get_my_home_next_event') return json(null)
      if (rpc === 'get_my_home_snapshot') return json({ members: [], training_locations: [], training_month_dates: [] })
      if (rpc) return json([])
      if (url.pathname.startsWith('/rest/v1/') && request.method() === 'GET') return json([])
      evidence.unexpectedWrites.push({ method: request.method(), path: url.pathname })
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
        } else if (event === 'heartbeat' || event === 'phx_leave') ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]))
      })
    })
    const page = await context.newPage()
    currentPage = page
    page.setDefaultTimeout(15000)
    page.on('pageerror', error => evidence.pageErrors.push({ width, message: error.message }))
    await page.clock.setFixedTime(fixedDate)
    await page.addInitScript(({ base, project, session }) => {
      if (location.origin === base) localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify(session))
    }, { base, project, session })
    const shot = async name => {
      const path = resolve(output, `${width}-${name}.png`)
      await page.screenshot({ path, animations: 'disabled' })
      evidence.screenshots.push(path)
    }
    const restAtTop = () => page.locator('.app-main-scroll').evaluate(async element => {
      element.scrollTop = 0
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })
    const noOverflow = async (scope = '.app-main-scroll') => {
      const metrics = await page.locator(scope).evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }))
      assert.ok(metrics.scroll <= metrics.client + 1, `${width}px ${scope} horizontal overflow ${JSON.stringify(metrics)}`)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
      record(width, 'no horizontal overflow', { scope, ...metrics })
    }
    const article = name => page.getByRole('article', { name, exact: true })
    await page.goto(`${base}/#/match-records`, { waitUntil: 'domcontentloaded' })
    await article('有照片友誼賽').waitFor()
    await page.getByRole('button', { name: '關閉設定', exact: true }).click()
    await expect(page.getByRole('button', { name: '關閉設定', exact: true })).not.toBeVisible()
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    for (const [name, expected] of [['有照片友誼賽', '/uploaded.webp'], ['預設照片友誼賽', '/images/match-default-cover.webp'], ['照片失效友誼賽', '/images/match-default-cover.webp']]) {
      const cover = article(name).getByTestId('match-cover')
      await cover.scrollIntoViewIfNeeded()
      await expect(cover).toHaveAttribute('src', new RegExp(expected.replaceAll('.', '\\.')))
      await expect.poll(() => cover.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
    }
    await expect(article('預設照片友誼賽').getByRole('button', { name: /預覽/ })).toHaveCount(0)
    const first = article('有照片友誼賽')
    await first.scrollIntoViewIfNeeded()
    await expect(first.getByTestId('gather-time')).toContainText('08:15')
    await expect(first.getByTestId('match-time')).toContainText('09:00 - 11:30')
    await expect(first.getByTestId('match-location')).toHaveText(longLocation)
    const layout = await first.evaluate(element => {
      const gather = element.querySelector('[data-testid="gather-time"] dd')
      const location = element.querySelector('[data-testid="match-location"]')
      const buttons = [...element.querySelectorAll('button, a')].map(button => ({ name: button.textContent.trim(), height: button.getBoundingClientRect().height }))
      return { gatherFont: getComputedStyle(gather).fontSize, locationFont: getComputedStyle(location).fontSize, locationHeight: location.getBoundingClientRect().height, locationLineHeight: getComputedStyle(location).lineHeight, buttons }
    })
    assert.ok(parseFloat(layout.gatherFont) >= 24)
    assert.ok(parseFloat(layout.locationFont) >= 16)
    assert.ok(layout.buttons.every(button => button.height >= 43.5))
    record(width, 'uploaded/default/broken covers and prominent wrapped schedule', layout)
    await noOverflow()
    await restAtTop()
    await shot('future-cards')

    if (measureMobileDensity) {
      for (const name of ['有照片友誼賽', '預設照片友誼賽', '已取消友誼賽']) {
        const card = article(name)
        const metrics = await card.evaluate(async element => {
          const main = document.querySelector('.app-main-scroll')
          const routeRoot = main.querySelector('[style*="--match-records-sticky-offset"]')
          const toolbar = routeRoot.firstElementChild
          const month = element.closest('.animate-fade-in').querySelector('.match-month-heading')
          const stickyToolbarHeight = getComputedStyle(toolbar).position === 'sticky' ? toolbar.getBoundingClientRect().height : 0
          const stickyMonthHeight = getComputedStyle(month).position === 'sticky' ? month.getBoundingClientRect().height : 0
          const readingTop = main.getBoundingClientRect().top + stickyToolbarHeight + stickyMonthHeight
          main.scrollTop += element.getBoundingClientRect().top - readingTop
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          const cardRect = element.getBoundingClientRect()
          const mainRect = main.getBoundingClientRect()
          const location = element.querySelector('[data-testid="match-location"]')
          return {
            windowViewportHeight: innerHeight,
            mainViewportHeight: mainRect.height,
            stickyToolbarHeight,
            stickyMonthHeight,
            readingViewportHeight: mainRect.height - stickyToolbarHeight - stickyMonthHeight,
            cardHeight: cardRect.height,
            cardWidth: cardRect.width,
            locationText: location.textContent,
            locationLines: location.getBoundingClientRect().height / parseFloat(getComputedStyle(location).lineHeight),
            locationFont: getComputedStyle(location).fontSize,
            gatherFont: getComputedStyle(element.querySelector('[data-testid="gather-time"] dd')).fontSize,
            cardScrollHeight: element.scrollHeight,
            cardClientHeight: element.clientHeight,
            controls: [...element.querySelectorAll('button, a')].map(control => ({ name: control.textContent.trim(), height: control.getBoundingClientRect().height }))
          }
        })
        metrics.additionalScrollRequired = Math.max(0, metrics.cardHeight - metrics.readingViewportHeight)
        record(width, 'mobile single-card reading density', { name, height, ...metrics })
        assert.ok(parseFloat(metrics.locationFont) >= 16)
        assert.ok(parseFloat(metrics.gatherFont) >= 24)
        assert.ok(metrics.controls.every(control => control.height >= 43.5))
        assert.ok(metrics.cardScrollHeight <= metrics.cardClientHeight + 1, 'Card must not have nested scrolling or clipped content')
        await noOverflow()
        await shot(`density-${name}`)
        // A tall locator screenshot can include sticky shell overlays. Only use
        // "full-card" evidence when the real reading viewport fits the card.
        if (metrics.additionalScrollRequired === 0) {
          const path = resolve(output, `${width}-full-card-${name}.png`)
          await card.screenshot({ path, animations: 'disabled' })
          evidence.screenshots.push(path)
        }
      }
    }

    if (captureOnly) {
      await page.getByRole('button', { name: /賽事紀錄/ }).click()
      await article('歷史勝利賽事').waitFor()
      await restAtTop()
      await shot('past-cards')
      await context.close()
      currentPage = null
      continue
    }

    const restoreDialog = page.getByRole('dialog', { name: '恢復比賽', exact: true })
    if (!calendarRestoreOnly && !readonlyRestoreOnly) {
    await first.getByRole('button', { name: '預覽有照片友誼賽照片' }).click()
    await expect(page.locator('.el-image-viewer__wrapper')).toBeVisible()
    await expect(page.locator('.el-dialog:visible')).toHaveCount(0)
    await shot('photo-preview')
    await page.locator('.el-image-viewer__close').click()
    await expect(page.locator('.el-image-viewer__wrapper')).toHaveCount(0)
    record(width, 'photo preview does not open match detail')

    const target = article('預設照片友誼賽')
    await target.getByRole('button', { name: '預設照片友誼賽更多操作' }).click()
    await page.getByRole('menuitem', { name: '取消比賽', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '取消比賽', exact: true })
    await dialog.waitFor()
    await dialog.getByRole('button', { name: '確認取消比賽' }).click()
    await expect(dialog.getByRole('alert')).toContainText('請選擇取消原因')
    assert.equal(state.cancellationRequests.length, 0)
    await dialog.locator('.el-select__wrapper').click()
    await page.getByRole('option', { name: '其他', exact: true }).click()
    await dialog.getByRole('button', { name: '確認取消比賽' }).click()
    assert.equal(state.cancellationRequests.length, 0)
    await dialog.getByRole('textbox', { name: '補充說明' }).fill('球場積水，家長與球員無須到場')
    await dialog.getByRole('button', { name: '確認取消比賽' }).click()
    await expect(dialog.getByRole('alert')).toContainText('測試：賽事已被更新')
    await expect(dialog.getByRole('button', { name: '確認取消比賽' })).toBeEnabled()
    await expect(dialog.getByRole('button', { name: '確認取消比賽' })).not.toHaveClass(/is-loading/)
    await expect(dialog.getByRole('textbox', { name: '補充說明' })).toHaveValue('球場積水，家長與球員無須到場')
    await noOverflow('.el-dialog:visible')
    await page.mouse.move(5, 5)
    await shot('cancel-error-retains-fields')
    state.rejectCancellation = false
    await dialog.getByRole('button', { name: '確認取消比賽' }).click()
    await expect(dialog).not.toBeVisible()
    await expect(target.getByTestId('match-result')).toHaveText('已取消')
    await expect(target).toContainText('已取消・無須集合')
    await expect(target).toContainText('球場積水，家長與球員無須到場')
    assert.equal(state.cancellationRequests.length, 2)
    assert.deepEqual(state.cancellationRequests[0], state.cancellationRequests[1])
    await target.getByRole('button', { name: '預設照片友誼賽更多操作' }).click()
    await expect(page.getByRole('menuitem', { name: '取消比賽', exact: true })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: '發送賽事通知', exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    record(width, 'cancel validation, failed save retains reason, retry marks cancelled and removes reminder action')
    await target.scrollIntoViewIfNeeded()
    await shot('cancel-success')

    await target.getByRole('button', { name: '預設照片友誼賽更多操作' }).click()
    await page.getByRole('menuitem', { name: '恢復比賽', exact: true }).click()
    await expect(restoreDialog).toBeVisible()
    await expect(restoreDialog).toContainText('預設照片友誼賽')
    await expect(restoreDialog).toContainText('球場積水，家長與球員無須到場')
    assert.equal(state.restorationRequests.length, 0, 'Opening restoration must not restore the match')
    await restoreDialog.getByRole('button', { name: '返回', exact: true }).click()
    await expect(restoreDialog).not.toBeVisible()
    assert.equal(state.restorationRequests.length, 0, 'Returning from confirmation must not restore the match')
    await expect(target.getByTestId('match-result')).toHaveText('已取消')

    await target.getByRole('button', { name: '預設照片友誼賽更多操作' }).click()
    await page.getByRole('menuitem', { name: '恢復比賽', exact: true }).click()
    await restoreDialog.getByRole('button', { name: '確認恢復比賽', exact: true }).click()
    await expect(restoreDialog.getByRole('alert')).toContainText('測試：恢復失敗')
    await expect(restoreDialog.getByRole('button', { name: '確認恢復比賽', exact: true })).toBeEnabled()
    await expect(restoreDialog).toContainText('球場積水，家長與球員無須到場')
    await expect(target.getByTestId('match-result')).toHaveText('已取消')
    const restorationControls = await restoreDialog.locator('button:visible').evaluateAll(buttons => buttons.map(button => ({
      name: button.textContent.trim() || button.getAttribute('aria-label'), height: button.getBoundingClientRect().height
    })))
    assert.ok(restorationControls.every(control => control.height >= 43.5), 'Restoration controls must remain touch-sized')
    await noOverflow('.el-dialog:visible')
    await page.mouse.move(5, 5)
    await shot('restore-error-retains-context')
    state.rejectRestoration = false
    await restoreDialog.getByRole('button', { name: '確認恢復比賽', exact: true }).click()
    await expect(restoreDialog).not.toBeVisible()
    await expect(target.getByTestId('match-result')).toHaveText('未賽')
    await expect(target).not.toContainText('已取消・無須集合')
    await expect(target.getByTestId('gather-time')).toContainText('08:15')
    await expect(target.getByTestId('match-time')).toContainText('09:00 - 11:30')
    await expect(target.getByTestId('match-location')).toHaveText('新北大都會棒球場')
    assert.equal(state.restorationRequests.length, 2)
    assert.deepEqual(state.restorationRequests[0], state.restorationRequests[1])
    assert.deepEqual(state.restorationRequests[1], {
      p_match_id: '33333333-3333-4333-8333-333333333332', p_expected_updated_at: fixedDate.toISOString()
    })
    await target.getByRole('button', { name: '預設照片友誼賽更多操作' }).click()
    await expect(page.getByRole('menuitem', { name: '恢復比賽', exact: true })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: '取消比賽', exact: true })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: '發送賽事通知', exact: true })).toBeVisible()
    await page.getByRole('heading', { name: '比賽紀錄', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: '發送賽事通知', exact: true })).not.toBeVisible()
    record(width, 'restore confirmation, return without writes, failed retry preserves context, success returns the same match to active', { controls: restorationControls })
    await target.evaluate(async element => {
      const main = document.querySelector('.app-main-scroll')
      const toolbar = document.querySelector('.match-records-toolbar').closest('[class*="backdrop-blur-md"]')
      const month = document.querySelector('.match-month-heading')
      const toolbarHeight = getComputedStyle(toolbar).position === 'sticky' ? toolbar.getBoundingClientRect().height : 0
      const readingTop = main.getBoundingClientRect().top + toolbarHeight + month.getBoundingClientRect().height
      main.scrollTop += element.getBoundingClientRect().top - readingTop
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })
    await shot('restore-success')

    await page.getByRole('button', { name: /賽事紀錄/ }).click()
    await article('歷史勝利賽事').waitFor()
    await expect(article('歷史勝利賽事').getByTestId('match-result')).toHaveText('勝利')
    await expect(article('歷史勝利賽事').getByTestId('home-score')).toHaveText('8')
    await expect(article('歷史取消賽事').getByTestId('match-result')).toHaveText('已取消')
    await expect(article('歷史取消賽事').getByTestId('home-score')).toHaveCount(0)
    await noOverflow()
    await restAtTop()
    await shot('past-cards')
    record(width, 'past cards preserve score and cancelled games never show draw/score')
    }

    if (!calendarRestoreOnly) {
    const restorationCountBeforeReadonly = state.restorationRequests.length
    state.role = 'VIEWER'
    // App-ready locators below establish readiness; delayed nonessential assets
    // must not hold a role-switch verification at the browser's load event.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await article('有照片友誼賽').waitFor()
    await page.getByRole('button', { name: '關閉設定', exact: true }).click()
    await expect(page.getByRole('button', { name: '關閉設定', exact: true })).not.toBeVisible()
    await article('有照片友誼賽').getByRole('button', { name: '有照片友誼賽更多操作' }).click()
    for (const name of ['取消比賽', '恢復比賽', '編輯比賽', '刪除比賽', '發送賽事通知']) await expect(page.getByRole('menuitem', { name, exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await article('已取消友誼賽').getByRole('button', { name: '已取消友誼賽更多操作' }).click()
    await expect(page.getByRole('menuitem', { name: '恢復比賽', exact: true })).toHaveCount(0)
    assert.equal(state.restorationRequests.length, restorationCountBeforeReadonly)
    record(width, 'VIEW-only role has no mutation, restoration or notification actions')
    await page.keyboard.press('Escape')
    await shot('readonly-cards')
    }

    // Calendar uses the same detail entry point as reminder deep links. Its
    // restore flow must close both dialogs and return the match to active rows.
    state.rejectRestoration = false
    state.role = 'VIEWER'
    const calendarMatchId = '33333333-3333-4333-8333-333333333334'
    const restorationCountBeforeCalendar = state.restorationRequests.length
    await page.goto(`${base}/#/calendar?match_id=${calendarMatchId}`, { waitUntil: 'domcontentloaded' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '關閉設定', exact: true }).click()
    await expect(page.getByRole('button', { name: '關閉設定', exact: true })).not.toBeVisible()
    const calendarDetail = page.locator('.el-dialog:visible').filter({ has: page.getByRole('heading', { name: '已取消友誼賽', exact: true }) })
    await expect(calendarDetail).toBeVisible()
    await expect(calendarDetail.getByRole('button', { name: '恢復比賽', exact: true })).toHaveCount(0)
    assert.equal(state.restorationRequests.length, restorationCountBeforeCalendar)
    record(width, 'VIEW-only calendar detail does not expose restoration')
    state.role = 'ADMIN'
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '關閉設定', exact: true }).click()
    await expect(page.getByRole('button', { name: '關閉設定', exact: true })).not.toBeVisible()
    await expect(calendarDetail.getByRole('button', { name: '恢復比賽', exact: true })).toBeVisible()
    await calendarDetail.getByRole('button', { name: '恢復比賽', exact: true }).click()
    await expect(restoreDialog).toBeVisible()
    await expect(restoreDialog).toContainText('對手行程調整')
    const restoreButtonColor = await restoreDialog.getByRole('button', { name: '確認恢復比賽', exact: true })
      .evaluate(button => getComputedStyle(button).backgroundColor)
    assert.equal(restoreButtonColor, 'rgb(216, 143, 34)', 'Restore confirmation follows the team primary color')
    await shot('calendar-restore-confirmation')
    await restoreDialog.getByRole('button', { name: '確認恢復比賽', exact: true }).click()
    await expect(page.locator('.el-dialog:visible')).toHaveCount(0)
    await expect(page.locator('[aria-label="已取消賽事"]')).toHaveCount(0)
    assert.equal(state.restorationRequests.length, restorationCountBeforeCalendar + 1)
    assert.deepEqual(state.restorationRequests.at(-1), {
      p_match_id: calendarMatchId, p_expected_updated_at: '2026-10-11T00:00:00Z'
    })
    await expect(page.getByRole('button').filter({ hasText: '10/20' })).toBeVisible()
    await noOverflow()
    await restAtTop()
    await shot('calendar-restored-schedule')
    record(width, 'calendar reminder deep-link detail restores the same match and returns to the active schedule', { restoreButtonColor })
    await context.close()
    currentPage = null
  }
  assert.deepEqual(evidence.pageErrors, [])
  assert.deepEqual(evidence.unexpectedWrites, [])
  evidence.result = 'PASS'
} catch (error) {
  evidence.result = 'FAIL'
  evidence.error = String(error)
  if (currentPage && !currentPage.isClosed()) {
    await currentPage.screenshot({ path: resolve(output, 'failure.png'), animations: 'disabled' }).catch(() => {})
    await writeFile(resolve(output, 'failure.txt'), await currentPage.locator('body').innerText().catch(() => '')).catch(() => {})
  }
  throw error
} finally {
  await writeFile(resolve(output, captureOnly ? 'evidence-capture.json' : 'evidence.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ result: evidence.result, checks: evidence.checks.length, output, error: evidence.error }, null, 2))
  await server.close()
  await browser?.close()
}
