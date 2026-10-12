import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { chromium, expect } from '@playwright/test'

const root = fileURLToPath(new URL('../..', import.meta.url))
const base = 'http://127.0.0.1:5193'
const output = resolve(process.argv[2] || 'output/playwright/match-fee-cancellation')
const selectedWidths = process.env.MATCH_FEE_WIDTHS?.split(',').map(Number)
const widths = [390, 768, 1365].filter(width => !selectedWidths || selectedWidths.includes(width))
assert.ok(widths.length > 0, 'Select at least one supported viewport')
const longReason = '因連日豪雨導致河濱棒球場積水，場地管理單位確認當天無法安全使用，雙方教練討論後決定取消本次友誼賽。請家長保留原本付款回報與收款紀錄，後續安排將另行公告；已繳及待確認款項仍需由管理員依實際情況核對處理。'
const names = { active: '正常友誼賽', cancelled: '雨天取消友誼賽', mixed: '取消但保留付款紀錄', exempt: '僅球員單場免繳' }
const makeItem = (id, matchId, name, overrides = {}) => ({
  id, match_id: matchId, member_id: `member-${id}`, member_name: `球員${id}`, member_role: '球員',
  match_name: name, tournament_name: '秋季社區交流賽', match_date: '2026-10-18',
  match_time: '09:00 - 11:30', category_group: 'U12', fee_month: '2026-10', amount: 300,
  match_fee_amount: 300, payment_opened_at: null, payment_opened_by_name: null,
  has_payment_history: false, is_exempt: false, payment_status: 'unpaid',
  payment_submission_id: null, paid_at: null, cancelled_reason: null,
  match_cancelled_at: null, match_cancellation_reason: null,
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-12T00:00:00Z', ...overrides
})
const cancelledFields = { match_cancelled_at: '2026-10-12T00:00:00Z', match_cancellation_reason: longReason }
const items = [
  makeItem('active', 'match-active', names.active),
  makeItem('cancelled-a', 'match-cancelled', names.cancelled, { ...cancelledFields, payment_status: 'cancelled', cancelled_reason: '比賽取消' }),
  makeItem('cancelled-b', 'match-cancelled', names.cancelled, { ...cancelledFields, payment_status: 'cancelled', cancelled_reason: '比賽取消' }),
  makeItem('mixed-pending', 'match-mixed', names.mixed, { ...cancelledFields, payment_status: 'pending_review', payment_submission_id: 'submission-pending', has_payment_history: true }),
  makeItem('mixed-paid', 'match-mixed', names.mixed, { ...cancelledFields, payment_status: 'paid', payment_submission_id: 'submission-paid', paid_at: '2026-10-10T02:00:00Z', has_payment_history: true, payment_method: '銀行轉帳', account_last_5: '12345', remittance_date: '2026-10-10' }),
  makeItem('exempt-a', 'match-exempt', names.exempt, { payment_status: 'cancelled', is_exempt: true, cancelled_reason: '單場免繳' }),
  makeItem('exempt-b', 'match-exempt', names.exempt)
]

// This harness only replaces data and permissions. All rendered components,
// Element Plus interactions and product styles come from the real source.
const fixtureId = '\0match-fee-fixture'
const entryId = '\0match-fee-entry'
const replacementPaths = [
  '@/services/matchFees', '@/stores/permissions', '@/utils/pushNotifications'
].flatMap(path => [path, resolve(root, path.replace('@/', 'src/')).replaceAll('\\', '/')])
const fixtureSource = `
  import { reactive } from 'vue'
  const state = reactive({ readonly: false, reads: [], writes: [] })
  const items = ${JSON.stringify(items)}
  const rejectWrite = (name, args) => {
    state.writes.push({ name, args })
    throw new Error('Unexpected fixture mutation: ' + name)
  }
  window.__matchFeesFixture = {
    setReadonly(value) { state.readonly = value },
    inspect() { return JSON.parse(JSON.stringify(state)) }
  }
  export const usePermissionsStore = () => ({ can: (feature, action) =>
    feature === 'fees' && (action === 'VIEW' || !state.readonly)
  })
  export const listMatchFeeItemsByMonth = async month => {
    state.reads.push(month)
    return structuredClone(items)
  }
  export const setMatchFeePaymentOpenState = (...args) => rejectWrite('open-state', args)
  export const deleteCancelledMatchFeeGroup = (...args) => rejectWrite('delete-group', args)
  export const rollbackMatchPaymentSubmission = (...args) => rejectWrite('rollback', args)
  export const setMatchFeeItemExemption = (...args) => rejectWrite('exemption', args)
  export const buildPushEventKey = (...args) => args.join(':')
  export const dispatchPushNotification = (...args) => rejectWrite('push', args)
`
const entrySource = `
  import { createApp, h } from 'vue'
  import ElementPlus from 'element-plus'
  import zhTw from 'element-plus/es/locale/lang/zh-tw'
  import 'element-plus/dist/index.css'
  import '@/style.css'
  import Panel from '@/components/fees/MatchFeeManagementPanel.vue'
  createApp({ render: () => h('main', {
    class: 'app-main-scroll min-h-screen bg-slate-50 p-4 md:p-6',
    style: { height: '100dvh', overflowY: 'auto' }
  }, [h('div', { class: 'mx-auto max-w-7xl' }, [h(Panel)])]) })
    .use(ElementPlus, { locale: zhTw }).mount('#app')
`
const evidence = { scope: 'Real match-fee components and Element Plus; isolated fixture services/permissions, no Auth account or remote writes.', checks: [], screenshots: [], pageErrors: [], externalRequests: [], writes: [] }
const server = await createServer({
  configFile: false, root, envDir: resolve(tmpdir(), 'jg-match-fee-empty-env'),
  cacheDir: resolve(tmpdir(), 'jg-match-fee-cancellation-vite-cache'),
  plugins: [{
    name: 'match-fee-isolated-fixture', enforce: 'pre',
    resolveId(id) {
      if (id === '/fixture-entry.js') return entryId
      if (replacementPaths.includes(id.replaceAll('\\', '/'))) return fixtureId
    },
    load(id) {
      if (id === fixtureId) return fixtureSource
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
  server: { host: '127.0.0.1', port: 5193, strictPort: true }
})

let browser
let currentPage
await mkdir(output, { recursive: true })
try {
  await server.listen()
  browser = await chromium.launch({ headless: true })
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, timezoneId: 'Asia/Taipei', serviceWorkers: 'block' })
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin === base) return route.continue()
      evidence.externalRequests.push(url.origin + url.pathname)
      return route.abort()
    })
    const page = await context.newPage()
    currentPage = page
    page.setDefaultTimeout(10000)
    page.setDefaultNavigationTimeout(45000)
    page.on('pageerror', error => evidence.pageErrors.push(String(error)))
    await page.clock.setFixedTime(new Date('2026-10-12T08:00:00+08:00'))
    await page.goto(base, { waitUntil: 'domcontentloaded' })
    const group = name => page.getByTestId(`match-fee-group-${name}`)
    await expect(group(names.active)).toBeVisible()
    await expect(page.locator('.el-date-editor input')).toBeVisible()
    const check = (name, detail = {}) => evidence.checks.push({ width, name, ...detail })
    const screenshot = async (locator, name) => {
      const path = resolve(output, `${width}-${name}.png`)
      await locator.screenshot({ path, animations: 'disabled' })
      evidence.screenshots.push(path)
    }
    const noOverflow = async state => {
      const size = await page.locator('.app-main-scroll').evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }))
      assert.ok(size.scroll <= size.client + 1, `${width} ${state}: horizontal page overflow`)
      check(`no horizontal page overflow: ${state}`, size)
    }

    for (const name of Object.values(names)) {
      await expect(group(name).getByTestId('match-fee-group-details')).not.toBeVisible()
      await expect(group(name).getByTestId('match-fee-collapse-toggle')).toHaveAttribute('aria-expanded', 'false')
    }
    await expect(group(names.active).getByTestId('open-payment-button')).toBeVisible()
    await expect(group(names.active).getByText('比賽已取消', { exact: true })).toHaveCount(0)
    check('normal unpaid match keeps its payment-opening entry')

    for (const name of [names.cancelled, names.mixed]) {
      const card = group(name)
      await expect(card.getByTestId('match-cancelled-badge')).toHaveText('比賽已取消')
      await expect(card.getByTestId('match-cancelled-badge')).toBeVisible()
      await expect(card.getByTestId('payment-open-state')).toHaveCount(0)
      const reason = card.getByTestId('match-cancellation-notice').getByText(longReason, { exact: false })
      await expect(reason).toBeVisible()
      await expect(card.getByTestId('open-payment-button')).toHaveCount(0)
      await expect(card.getByTestId('close-payment-button')).toHaveCount(0)
      const layout = await reason.evaluate(element => ({ height: element.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(element).lineHeight), whiteSpace: getComputedStyle(element).whiteSpace, client: element.clientWidth, scroll: element.scrollWidth }))
      assert.ok(layout.height > layout.lineHeight * 1.5, `${width} ${name}: long reason must wrap`)
      assert.ok(layout.scroll <= layout.client + 1, `${width} ${name}: reason must not overflow`)
      check('cancelled header and full reason remain visible while details are collapsed, with no payment-opening entry', { match: name, ...layout })
    }
    await expect(group(names.exempt).getByText('比賽已取消', { exact: true })).toHaveCount(0)
    await expect(group(names.exempt).getByTestId('open-payment-button')).toBeVisible()
    check('single-player exemption is not a cancelled match and leaves other unpaid members payable')
    await noOverflow('collapsed manager view')
    await screenshot(group(names.mixed), 'manager-cancelled-payment-history')

    const mixed = group(names.mixed)
    await mixed.getByTestId('match-fee-collapse-toggle').click()
    await expect(mixed.getByTestId('match-fee-group-details')).toBeVisible()
    await expect(mixed.getByText('待確認', { exact: true })).toBeVisible()
    await expect(mixed.getByText('已確認', { exact: true })).toBeVisible()
    await expect(mixed.getByText('比賽已取消', { exact: true })).toBeVisible()
    await expect(mixed.getByTestId('open-payment-button')).toHaveCount(0)
    await noOverflow('expanded mixed payment history')
    check('cancelled match preserves pending-review and paid details')
    await mixed.getByTestId('match-fee-collapse-toggle').click()
    await expect(mixed.getByTestId('match-fee-group-details')).not.toBeVisible()
    await expect(mixed.getByText('比賽已取消', { exact: true })).toBeVisible()

    const exempt = group(names.exempt)
    await exempt.getByTestId('match-fee-collapse-toggle').click()
    await expect(exempt.getByTestId('match-fee-member-exempt-a')).toContainText('單場免繳')
    await expect(exempt.getByText('比賽已取消', { exact: true })).toHaveCount(0)
    await exempt.getByTestId('match-fee-collapse-toggle').click()

    await page.evaluate(() => window.__matchFeesFixture.setReadonly(true))
    await expect(page.getByTestId('open-payment-button')).toHaveCount(0)
    await expect(page.getByTestId('close-payment-button')).toHaveCount(0)
    await expect(page.getByTestId('delete-cancelled-group-button')).toHaveCount(0)
    for (const name of [names.cancelled, names.mixed]) {
      await expect(group(name).getByText('比賽已取消', { exact: true })).toBeVisible()
      await expect(group(name).getByText(longReason, { exact: false })).toBeVisible()
    }
    await mixed.getByTestId('match-fee-collapse-toggle').click()
    await expect(mixed.getByText('待確認', { exact: true })).toBeVisible()
    await expect(mixed.getByText('已確認', { exact: true })).toBeVisible()
    await expect(mixed.getByRole('button', { name: '退回確認', exact: true })).toHaveCount(0)
    await mixed.getByTestId('match-fee-collapse-toggle').click()
    check('VIEW-only mode can read cancellation and payment history without mutation actions')
    await noOverflow('readonly collapsed view')
    await screenshot(group(names.cancelled), 'readonly-cancelled-card')
    const fixture = await page.evaluate(() => window.__matchFeesFixture.inspect())
    assert.deepEqual(fixture.reads, ['2026-10'])
    evidence.writes.push(...fixture.writes)
    await context.close()
    currentPage = null
  }
  assert.deepEqual(evidence.pageErrors, [])
  assert.deepEqual(evidence.externalRequests, [])
  assert.deepEqual(evidence.writes, [])
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
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ result: evidence.result, checks: evidence.checks.length, output, error: evidence.error }, null, 2))
  await server.close()
  await browser?.close()
}
