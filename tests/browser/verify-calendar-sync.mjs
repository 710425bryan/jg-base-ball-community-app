import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { chromium, expect } from '@playwright/test'

// Real dialog, service, parser, Pinia store, matches API and Supabase SDK.
// Only HTTP is replaced; this is not a real authenticated/production test.
const root = fileURLToPath(new URL('../..', import.meta.url))
const base = 'http://127.0.0.1:5194'
const fixtureOrigin = 'https://calendar-sync-fixture.invalid'
const output = resolve(process.argv[2] || 'output/playwright/calendar-source-recovery/manual-sync')
const fixtureId = '\0calendar-sync-client'
const entryId = '\0calendar-sync-entry'
const clientPath = resolve(root, 'src/services/supabase.ts').replaceAll('\\', '/')
const clientSource = `
  import { createClient } from '@supabase/supabase-js'
  export const supabase = createClient('${fixtureOrigin}', 'fixture-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  })
`
const entrySource = `
  import { createApp, h, ref } from 'vue'
  import { createPinia } from 'pinia'
  import ElementPlus from 'element-plus'
  import zhTw from 'element-plus/es/locale/lang/zh-tw'
  import 'element-plus/dist/index.css'
  import '@/style.css'
  import Dialog from '@/components/match-records/SyncCalendarDialog.vue'
  createApp({ setup() {
    const visible = ref(true)
    return () => h('main', { class: 'p-4 bg-slate-50 min-h-screen' }, [
      h('button', { onClick: () => visible.value = true }, '開啟同步'),
      h(Dialog, { modelValue: visible.value, 'onUpdate:modelValue': value => visible.value = value })
    ])
  } }).use(createPinia()).use(ElementPlus, { locale: zhTw }).mount('#app')
`
const server = await createServer({
  configFile: false, root, envDir: resolve(tmpdir(), 'jg-calendar-sync-empty-env'),
  cacheDir: resolve(tmpdir(), 'jg-calendar-sync-vite-cache'),
  plugins: [{
    name: 'calendar-sync-isolated-client', enforce: 'pre',
    resolveId(id, importer) {
      const normalized = id.replaceAll('\\', '/')
      if (id === '/fixture-entry.js') return entryId
      if (normalized === '@/services/supabase' || normalized === clientPath || normalized === clientPath.replace(/\.ts$/, '')
        || (id === './supabase' && importer?.replaceAll('\\', '/').includes('/src/services/'))) return fixtureId
    },
    load(id) {
      if (id === fixtureId) return clientSource
      if (id === entryId) return entrySource
    },
    configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (request.url !== '/') return next()
        response.setHeader('Content-Type', 'text/html')
        response.end('<!doctype html><html lang="zh-Hant"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><div id="app"></div><script type="module" src="/fixture-entry.js"></script></body></html>')
      })
    }
  }, vue()],
  resolve: { alias: { '@': resolve(root, 'src') } },
  server: { host: '127.0.0.1', port: 5194, strictPort: true }
})

const event = (id, day, opponent) => `BEGIN:VEVENT\nUID:${id}@google.com\nDTSTART:202610${day}T000000Z\nDTEND:202610${day}T020000Z\nSUMMARY:友誼賽 中港熊戰 vs ${opponent}\nDESCRIPTION:組別 / 類別：U12\\n賽事等級：友誼賽\\n集合時間：07:30\nLOCATION:更新後球場\nEND:VEVENT`
const ical = `BEGIN:VCALENDAR\nVERSION:2.0\n${event('active', 18, '台北熊')}\n${event('cancelled', 19, '新北熊')}\n${event('race', 20, '桃園熊')}\nEND:VCALENDAR`
const evidence = { scope: 'Isolated HTTP fixtures; real product manual sync chain. No genuine user session, remote business writes, or production validation.', checks: [], screenshots: [], pageErrors: [], unexpectedRequests: [] }
let browser
let currentPage
await mkdir(output, { recursive: true })
try {
  await server.listen()
  const parser = await server.ssrLoadModule('/src/utils/googleCalendarParser.ts')
  const parsed = parser.parseICalText(ical)
  assert.equal(parsed.length, 3)
  const buildRows = () => parsed.map((item, index) => ({
    ...parser.createMatchRecordInput(item), id: ['active', 'cancelled', 'race'][index],
    location: '原球場', home_score: 8, opponent_score: 2,
    photo_url: '/preserved-match-photo.webp', batting_stats: [{ name: '原球員', h1: 1 }],
    cancelled_at: index === 1 ? '2026-10-12T00:01:00Z' : null,
    cancellation_reason: index === 1 ? '場地關閉' : null,
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-12T00:00:00Z'
  }))
  browser = await chromium.launch({ headless: true })
  for (const scenario of ['edge-preview', 'legacy-preview', 'cancel-after-preview', 'rate-limited']) {
    let rows = buildRows()
    const originals = structuredClone(rows)
    const requests = []
    const writes = []
    let proxyReads = 0
    const width = scenario === 'rate-limited' ? 390 : 1365
    const context = await browser.newContext({ viewport: { width, height: 960 }, timezoneId: 'Asia/Taipei', serviceWorkers: 'block' })
    await context.route('**/*', async route => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === base) return route.continue()
      const json = (body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', ...headers }, body: JSON.stringify(body) })
      if (url.origin === fixtureOrigin) {
        if (request.method() === 'OPTIONS') return json({}, 200, { 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' })
        requests.push({ method: request.method(), path: url.pathname, query: url.search })
        if (url.pathname === '/functions/v1/sync-match-calendar') {
          assert.deepEqual(request.postDataJSON(), { calendar_url: 'https://calendar.google.com/calendar/ical/jg.baseball.bear%40gmail.com/public/basic.ics', dry_run: true, include_items: true })
          if (scenario === 'rate-limited') return json({ success: false, error_code: 'CALENDAR_SOURCE_RATE_LIMITED', upstream_status: 429, retry_after_seconds: 60 }, 503, { 'Retry-After': '60' })
          if (scenario === 'legacy-preview') return json({ code: 'NOT_FOUND' }, 404)
          return json({ success: true, sync_items: parser.planCalendarSync(rows, parsed, { rosterMembers: [] }) })
        }
        if (url.pathname === '/rest/v1/team_members_safe' && request.method() === 'GET') return json([])
        if (url.pathname === '/rest/v1/matches') {
          const id = url.searchParams.get('id')?.replace(/^eq\./, '')
          if (request.method() === 'GET') return json(id ? rows.find(row => row.id === id) : rows)
          if (request.method() === 'PATCH') {
            assert.equal(url.searchParams.get('cancelled_at'), 'is.null', 'Every sync write must have an atomic active-only filter')
            const row = rows.find(item => item.id === id)
            const payload = request.postDataJSON()
            writes.push({ id, payload, activeFilter: true, rejected: Boolean(row.cancelled_at) })
            assert.ok(!('cancelled_at' in payload), 'Sync cannot restore a cancelled match')
            if (row.cancelled_at) return json({ code: 'PGRST116', message: 'No row matches the active-only filter', details: '0 rows' }, 406)
            Object.assign(row, payload, { updated_at: '2026-10-12T02:00:00Z' })
            return json(row)
          }
        }
      }
      if (url.origin === 'https://api.codetabs.com' && scenario === 'legacy-preview') {
        proxyReads++
        return route.fulfill({ status: 200, contentType: 'text/calendar', headers: { 'Access-Control-Allow-Origin': '*' }, body: ical })
      }
      evidence.unexpectedRequests.push({ scenario, method: request.method(), origin: url.origin, path: url.pathname })
      return route.abort()
    })
    const page = await context.newPage()
    currentPage = page
    page.setDefaultTimeout(15000)
    page.on('pageerror', error => evidence.pageErrors.push(String(error)))
    await page.clock.setFixedTime(new Date('2026-10-12T08:00:00+08:00'))
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 45000 })
    const dialog = page.getByRole('dialog', { name: 'Google 行事曆同步' })
    await expect(dialog).toBeVisible()
    await page.getByRole('button', { name: '解析同步', exact: true }).click()
    if (scenario === 'rate-limited') {
      await expect(page.getByText('解析失敗：Google 行事曆暫時限制讀取，請等待 60 秒後再試。', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: '寫入同步 (0)' })).toBeDisabled()
      assert.equal(proxyReads, 0)
      assert.equal(writes.length, 0)
      assert.equal(requests.filter(item => item.path.startsWith('/functions')).length, 1)
    } else {
      await expect(page.getByText('準備更新的賽事 (2)', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: '寫入同步 (2)' })).toBeEnabled()
      assert.equal(writes.length, 0, 'Preview must not write')
      assert.equal(proxyReads, scenario === 'legacy-preview' ? 1 : 0)
      const preview = resolve(output, `${scenario}-plan.png`)
      await page.screenshot({ path: preview, fullPage: true })
      evidence.screenshots.push(preview)
      if (scenario === 'cancel-after-preview') {
        Object.assign(rows.find(row => row.id === 'race'), { cancelled_at: '2026-10-12T01:00:00Z', cancellation_reason: '預覽後取消', updated_at: '2026-10-12T01:00:00Z' })
      }
      await page.getByRole('button', { name: '寫入同步 (2)' }).click()
      const expected = scenario === 'cancel-after-preview' ? '同步完成：新增 0 筆，更新 1 筆，略過 2 筆' : '同步完成：新增 0 筆，更新 2 筆，略過 1 筆'
      await expect(page.getByText(expected, { exact: true })).toBeVisible()
      await expect(dialog).not.toBeVisible()
      assert.deepEqual(rows.find(row => row.id === 'cancelled'), originals.find(row => row.id === 'cancelled'))
      assert.equal(rows.find(row => row.id === 'active').location, '更新後球場')
      assert.equal(rows.length, 3, 'Cancelled matches must never be recreated')
      assert.deepEqual(writes.map(item => item.id).sort(), ['active', 'race'])
      for (const row of rows) {
        assert.equal(row.home_score, 8)
        assert.equal(row.photo_url, '/preserved-match-photo.webp')
        assert.deepEqual(row.batting_stats, [{ name: '原球員', h1: 1 }])
      }
      if (scenario === 'cancel-after-preview') {
        assert.equal(rows.find(row => row.id === 'race').location, '原球場')
        assert.equal(rows.find(row => row.id === 'race').cancellation_reason, '預覽後取消')
        assert.ok(requests.some(item => item.method === 'GET' && item.query.includes('id=eq.race')), 'Race must re-read to verify cancellation')
        assert.equal(writes.filter(item => item.rejected).length, 1)
      }
    }
    const screenshot = resolve(output, `${scenario}-result.png`)
    await page.screenshot({ path: screenshot, fullPage: true })
    evidence.screenshots.push(screenshot)
    evidence.checks.push({ scenario, width, passed: true, proxyReads, requests, writes, rows })
    await context.close()
  }
  assert.deepEqual(evidence.pageErrors, [])
  assert.deepEqual(evidence.unexpectedRequests, [])
  evidence.passed = true
  console.log(`PASS: ${evidence.checks.length} manual calendar sync scenarios; isolated HTTP only.`)
} catch (error) {
  evidence.passed = false
  evidence.error = String(error)
  if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {})
  throw error
} finally {
  await writeFile(resolve(output, 'manual-sync-evidence.json'), JSON.stringify(evidence, null, 2))
  await browser?.close()
  await server.close()
}
