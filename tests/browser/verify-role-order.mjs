import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from '@playwright/test'

const exec = promisify(execFile)
const directory = fileURLToPath(new URL('.', import.meta.url))
const output = resolve(process.argv[2] || '/tmp/jg-role-order-verification')
const base = 'http://127.0.0.1:5179/tests/browser/role-permissions/index.html?view=users'
const session = `role-order-${process.pid}`
const defaults = [
  ['ADMIN', '系統管理員', 1], ['MANAGER', '管理員', 9], ['HEAD_COACH', '總教練', 10],
  ['SCHEDULINGCOACH', '排班教練', 15], ['COACH', '教練', 16], ['FINANCE', '財務', 20],
  ['COMMITTEE', '委員', 21], ['MEMBER', '一般成員', 99],
  ['CUSTOM_LONG', '協助週末訓練行政聯絡與場地維護的客製化角色', 100]
]
const evidence = { fixture: base, externalRequests: [], consoleErrors: [], checks: [], screenshots: [] }
const record = (width, check, detail = {}) => evidence.checks.push({ width, check, detail })
const ab = (...args) => exec('npx', ['--yes', 'agent-browser', '--session', session, ...args], { timeout: 60_000, maxBuffer: 2_000_000 })
await mkdir(output, { recursive: true })
const server = await createServer({ configFile: resolve(directory, 'role-permissions/vite.config.ts') })
let browser

try {
  await server.listen()
  await ab('--allowed-domains', '127.0.0.1', 'open', base)
  await ab('wait', '--load', 'networkidle')
  await ab('screenshot', resolve(output, 'agent-browser-startup.png'))
  const snapshot = (await ab('snapshot', '-i')).stdout
  assert.match(snapshot, /系統帳號管理/)
  assert.ok(!(await ab('eval', 'document.querySelector("vite-error-overlay") ? "ERROR_OVERLAY" : "OK"')).stdout.includes('ERROR_OVERLAY'))
  await writeFile(resolve(output, 'agent-browser-startup.txt'), snapshot)
  evidence.screenshots.push(resolve(output, 'agent-browser-startup.png'))

  browser = await chromium.launch({ headless: true })
  for (const width of [360, 390, 700, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768, timezoneId: 'Asia/Taipei' })
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.hostname === '127.0.0.1' && url.port === '5179') return route.continue()
      evidence.externalRequests.push(route.request().url())
      return route.abort()
    })
    const page = await context.newPage()
    page.on('pageerror', (error) => evidence.consoleErrors.push({ width, error: error.message }))
    page.on('console', (message) => { if (message.type() === 'error') evidence.consoleErrors.push({ width, error: message.text() }) })
    const capture = async (name, keepMessage = false) => {
      if (!keepMessage) await page.waitForFunction(() => ![...document.querySelectorAll('.el-message')].some((element) => element.getClientRects().length))
      const path = resolve(output, `${width}-${name}.png`)
      await page.screenshot({ path, animations: 'disabled' })
      evidence.screenshots.push(path)
    }
    const noOverflow = async (locator, scope) => {
      const bounds = await locator.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }))
      assert.ok(bounds.scroll <= bounds.client + 1, `${width}px ${scope} overflow ${JSON.stringify(bounds)}`)
      record(width, 'no horizontal overflow', { scope, ...bounds })
    }
    const userPanel = page.getByRole('tabpanel', { name: '系統帳號管理', exact: true })
    const rolePanel = page.getByRole('tabpanel', { name: '角色與權限設定', exact: true })
    const cards = () => rolePanel.locator('div.cursor-pointer').filter({ has: page.locator('span.text-gray-400') })
    const roleCard = (key) => rolePanel.locator('div.cursor-pointer').filter({ has: page.getByText(key, { exact: true }) })
    const matrix = () => width < 1024 ? page.locator('.permissions-drawer:visible') : rolePanel
    const editor = () => matrix().locator('.role-sort-editor')
    const input = () => editor().getByRole('spinbutton')
    const save = () => editor().getByRole('button', { name: '儲存排序', exact: true })
    const waitEditor = async () => {
      await input().waitFor({ state: 'visible' })
      if (width < 1024) {
        await page.waitForFunction(() => {
          const element = [...document.querySelectorAll('.permissions-drawer .role-sort-editor')].find((editor) => editor.getClientRects().length)
          const overlay = element?.closest('.el-overlay')
          return element && element.getBoundingClientRect().top >= 0 && element.getBoundingClientRect().bottom <= innerHeight
            && (!overlay || Number(getComputedStyle(overlay).opacity) >= 0.999)
            && !document.querySelector('.el-drawer-fade-enter-active, .el-drawer-fade-enter-from')
        })
      }
    }
    const readRoleKeys = async () => cards().evaluateAll((elements) => elements.map((element) =>
      element.textContent.match(/\b(ADMIN|MANAGER|HEAD_COACH|SCHEDULINGCOACH|COACH|FINANCE|COMMITTEE|MEMBER|CUSTOM_LONG)\b/)?.[1]))
    const readGroups = async () => userPanel.locator('section > div h3').allTextContents()
    const closeDrawer = async () => {
      if (width < 1024) await page.getByRole('button', { name: '關閉權限設定', exact: true }).click()
    }
    const selectFinance = async () => {
      await page.getByRole('tab', { name: '角色與權限設定', exact: true }).click()
      await roleCard('FINANCE').click()
      await waitEditor()
      return editor()
    }
    const checkTouch = async () => {
      const bounds = await editor().evaluate((element) => [...element.querySelectorAll('.el-input-number, .el-input-number__increase, .el-input-number__decrease, button')]
        .map((control) => ({ role: control.getAttribute('aria-label') || control.className, height: control.getBoundingClientRect().height, width: control.getBoundingClientRect().width })))
      for (const box of bounds) assert.ok(box.height >= 44 && box.width >= 44, `${width}px touch control ${JSON.stringify(box)}`)
      record(width, 'sorting number and save controls meet 44px touch target', bounds)
      await noOverflow(editor(), 'role sort editor')
    }
    const checkGroupsBothModes = async (expected, name) => {
      await page.getByRole('tab', { name: '系統帳號管理', exact: true }).click()
      await page.getByRole('button', { name: '網格', exact: true }).click()
      assert.deepEqual(await readGroups(), expected)
      assert.equal(await userPanel.locator('article').count(), expected.length)
      await capture(`${name}-users-grid`)
      await page.getByRole('button', { name: '表格', exact: true }).click()
      assert.deepEqual(await readGroups(), expected)
      assert.equal(await userPanel.locator('.el-table').count(), expected.length)
      await noOverflow(page.locator('body'), 'users table body')
      await capture(`${name}-users-table`)
      record(width, 'real UsersView grid and table use the saved role order', { expected })
    }

    await page.goto(base)
    await userPanel.getByText('系統管理員測試帳號', { exact: true }).first().waitFor()
    assert.deepEqual(await readGroups(), defaults.map((role) => role[1]))
    await noOverflow(page.locator('body'), 'users grid body')
    await page.getByRole('tab', { name: '角色與權限設定', exact: true }).click()
    await roleCard('CUSTOM_LONG').waitFor()
    assert.deepEqual(await readRoleKeys(), defaults.map((role) => role[0]))
    for (const [key, , weight] of defaults) assert.match(await roleCard(key).innerText(), new RegExp(`排序\\s*${weight}`))
    record(width, 'eight default roles and unrelated custom role show their configured sort numbers', { defaults })
    await roleCard('FINANCE').click()
    await waitEditor()
    assert.equal(await input().inputValue(), '20')
    await checkTouch()
    await input().fill('5')
    await input().press('Tab')
    await page.evaluate(() => { window.__roleFixture.holdNext = true })
    await save().click()
    await page.waitForFunction(() => window.__roleFixture.calls.filter((call) => call.action === 'update_app_role_weight').length === 1)
    assert.ok(await save().isDisabled())
    assert.ok(await input().isDisabled())
    await save().evaluate((button) => { button.click(); button.click() })
    assert.equal(await page.evaluate(() => window.__roleFixture.calls.filter((call) => call.action === 'update_app_role_weight').length), 1)
    await capture('saving-sort')
    await page.evaluate(() => window.__roleFixture.releasePending())
    await page.waitForFunction(() => window.__roleAssignableRoles().find((role) => role.role_key === 'FINANCE')?.weight === 5)
    await roleCard('FINANCE').getByText('排序 5', { exact: true }).waitFor()
    assert.equal(await input().inputValue(), '5')
    const update = await page.evaluate(() => window.__roleFixture.calls.find((call) => call.action === 'update_app_role_weight').data)
    assert.deepEqual(update, { p_role_key: 'FINANCE', p_weight: 5 })
    record(width, 'weight update goes through one RPC and refreshes selected role and permissions store', update)
    await capture('saved-sort')
    await closeDrawer()
    const firstOrder = ['ADMIN', 'FINANCE', 'MANAGER', 'HEAD_COACH', 'SCHEDULINGCOACH', 'COACH', 'COMMITTEE', 'MEMBER', 'CUSTOM_LONG']
    assert.deepEqual(await readRoleKeys(), firstOrder)
    await checkGroupsBothModes(firstOrder.map((key) => defaults.find((role) => role[0] === key)[1]), 'finance-five')

    await selectFinance()
    await input().fill('4')
    await input().press('Tab')
    await page.evaluate(() => { window.__roleFixture.failNext = true })
    await save().click()
    await page.getByText(/測試排序儲存失敗，請稍後再試/).waitFor()
    assert.equal(await input().inputValue(), '4')
    assert.ok(await save().isEnabled())
    assert.equal(await page.evaluate(() => window.__roleAssignableRoles().find((role) => role.role_key === 'FINANCE').weight), 5)
    record(width, 'failed save preserves entered number and prior persisted order')
    await capture('failed-sort-keeps-draft', true)
    await save().click()
    await page.waitForFunction(() => window.__roleAssignableRoles().find((role) => role.role_key === 'FINANCE')?.weight === 4)
    await input().fill('10')
    await input().press('Tab')
    await save().click()
    await page.waitForFunction(() => window.__roleAssignableRoles().find((role) => role.role_key === 'FINANCE')?.weight === 10)
    await closeDrawer()
    const tied = ['ADMIN', 'MANAGER', 'FINANCE', 'HEAD_COACH', 'SCHEDULINGCOACH', 'COACH', 'COMMITTEE', 'MEMBER', 'CUSTOM_LONG']
    assert.deepEqual(await readRoleKeys(), tied)
    await checkGroupsBothModes(tied.map((key) => defaults.find((role) => role[0] === key)[1]), 'same-score')
    record(width, 'multiple saves and equal weights follow stable role_key order', { tied })

    await page.evaluate(() => {
      document.documentElement.classList.add('app-readable-text-mode')
      document.getElementById('app').classList.add('app-readable-text-mode')
    })
    await page.getByRole('tab', { name: '角色與權限設定', exact: true }).click()
    await roleCard('CUSTOM_LONG').click()
    await waitEditor()
    await checkTouch()
    await noOverflow(page.locator('body'), 'readable text body')
    if (width < 1024) await noOverflow(page.locator('.permissions-drawer__scroll'), 'readable text drawer')
    await capture('readable-text-sort-editor')
    record(width, 'long role name and sorting controls remain operable in readable text mode')
    await context.close()
  }
  assert.deepEqual(evidence.externalRequests, [])
  assert.deepEqual(evidence.consoleErrors, [])
  evidence.result = 'PASS'
  evidence.limits = 'Real RolePermissionsManager, RoleSortEditor and UsersView with Element Plus at simulated Chromium widths; local Supabase/RPC fixtures only, not physical phones, hardware safe area or deployed database verification.'
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ result: 'PASS', checks: evidence.checks.length, output }))
} catch (error) {
  if (browser) {
    const failedPage = browser.contexts().flatMap((context) => context.pages())[0]
    if (failedPage) {
      const path = resolve(output, 'failed-state.png')
      await failedPage.screenshot({ path, animations: 'disabled' }).catch(() => {})
      evidence.screenshots.push(path)
      evidence.failedBody = await failedPage.locator('body').innerText().catch(() => '')
    }
  }
  evidence.result = 'FAIL'
  evidence.error = error.stack || String(error)
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2))
  throw error
} finally {
  if (browser) await browser.close()
  await ab('close').catch(() => {})
  await server.close()
}
