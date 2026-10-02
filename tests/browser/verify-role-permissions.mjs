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
const output = resolve(process.argv[2] || '/tmp/jg-role-permissions-verification')
const base = 'http://127.0.0.1:5179/tests/browser/role-permissions/index.html'
const session = `role-permissions-${process.pid}`
const evidence = { fixture: base, externalRequests: [], consoleErrors: [], checks: [], screenshots: [] }
const record = (width, check, detail = {}) => evidence.checks.push({ width, check, detail })
const ab = (...args) => exec('npx', ['--yes', 'agent-browser', '--session', session, ...args], { timeout: 60_000, maxBuffer: 2_000_000 })
await mkdir(output, { recursive: true })
const server = await createServer({ configFile: resolve(directory, 'role-permissions/vite.config.ts') })
let browser

try {
  await server.listen()
  // Required startup gut-check before the detailed Playwright interactions.
  await ab('--allowed-domains', '127.0.0.1', 'open', base)
  await ab('wait', '--load', 'networkidle')
  await ab('screenshot', resolve(output, 'agent-browser-startup.png'))
  const snapshot = (await ab('snapshot', '-i')).stdout
  assert.match(snapshot, /新增角色/)
  const overlay = (await ab('eval', 'document.querySelector("vite-error-overlay") ? "ERROR_OVERLAY" : "OK"')).stdout
  assert.ok(!overlay.includes('ERROR_OVERLAY'))
  await writeFile(resolve(output, 'agent-browser-startup.txt'), snapshot)
  evidence.screenshots.push(resolve(output, 'agent-browser-startup.png'))

  browser = await chromium.launch({ headless: true })
  for (const width of [360, 390, 700, 1280]) {
    const mobile = width < 768
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: mobile, hasTouch: mobile, timezoneId: 'Asia/Taipei' })
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
      if (!keepMessage) {
        await page.waitForFunction(() => ![...document.querySelectorAll('.el-message')].some((element) => element.getClientRects().length))
      }
      const path = resolve(output, `${width}-${name}.png`)
      await page.screenshot({ path, animations: 'disabled' })
      evidence.screenshots.push(path)
    }
    const noOverflow = async (locator, scope) => {
      const result = await locator.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }))
      assert.ok(result.scroll <= result.client + 1, `${width}px ${scope} overflow ${JSON.stringify(result)}`)
      record(width, 'horizontal overflow', { scope, ...result })
    }
    const openForm = async () => {
      await page.getByRole('button', { name: '新增角色', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: '新增客製化角色', exact: true })
      await dialog.waitFor({ state: 'visible' })
      await page.waitForFunction(() => !document.querySelector('.dialog-fade-enter-active, .dialog-fade-enter-from'))
      await noOverflow(dialog.locator('.el-dialog__body'), 'new-role dialog body')
      const bounds = await dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const body = element.querySelector('.el-dialog__body').getBoundingClientRect()
        const footer = element.querySelector('.el-dialog__footer').getBoundingClientRect()
        const fields = [...element.querySelectorAll('.el-input__wrapper, .el-select__wrapper')].map((field) => {
          const box = field.getBoundingClientRect()
          return { width: box.width, height: box.height }
        })
        const buttons = [...element.querySelectorAll('.el-dialog__footer button')].map((button) => {
          const box = button.getBoundingClientRect()
          return { text: button.textContent.trim(), width: box.width, height: box.height, scroll: button.scrollWidth, client: button.clientWidth }
        })
        return { width: rect.width, height: rect.height, top: rect.top, bodyBottom: body.bottom, footerTop: footer.top, footerBottom: footer.bottom, fields, buttons }
      })
      if (mobile) {
        assert.ok(Math.abs(bounds.width - width) <= 1)
        assert.ok(Math.abs(bounds.height - 844) <= 1)
        assert.ok(Math.abs(bounds.top) <= 1)
        for (const field of bounds.fields) assert.ok(field.height >= 44)
        for (const button of bounds.buttons) assert.ok(button.height >= 44 && button.scroll <= button.client + 1)
      }
      assert.ok(bounds.footerBottom <= 845 && bounds.bodyBottom <= bounds.footerTop + 1)
      assert.equal(await dialog.getByRole('button', { name: '確認新增', exact: true }).evaluate((button) => getComputedStyle(button).backgroundColor), 'rgb(216, 143, 34)')
      record(width, 'dialog bounds, fixed footer and touch targets', bounds)
      return dialog
    }
    const source = (dialog) => dialog.locator('.el-form-item').filter({ hasText: '複製角色權限' }).locator('.el-select')
    const chooseSource = async (dialog, name) => {
      await source(dialog).click()
      await page.locator('.el-select-dropdown:visible').getByRole('option', { name, exact: true }).click()
      await page.waitForFunction(() => ![...document.querySelectorAll('.el-select-dropdown')].some((element) => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden'))
    }
    const fillIdentity = async (dialog, key, name) => {
      await dialog.getByPlaceholder('例如: ASST_COACH').fill(key)
      await dialog.getByPlaceholder('例如: 助理教練').fill(name)
    }
    const permissionScope = () => width < 1024 ? page.locator('.permissions-drawer:visible') : page.locator('main')
    const flags = async (feature) => {
      const scope = permissionScope()
      const row = width < 1024
        ? scope.locator('.permissions-drawer__scroll .space-y-3 > div').filter({ has: page.getByText(feature, { exact: true }) })
        : scope.locator('tr').filter({ has: page.getByText(feature, { exact: true }) })
      await row.waitFor({ state: 'visible' })
      return row.locator('button').evaluateAll((buttons) => buttons.map((button) => Boolean(button.querySelector('svg'))))
    }
    const closePermissions = async () => {
      if (width < 1024) await page.getByRole('button', { name: '關閉權限設定', exact: true }).click()
    }
    await page.goto(base)
    await page.getByText('協助週末訓練行政聯絡與場地維護的客製化角色', { exact: true }).waitFor()
    await noOverflow(page.locator('body'), 'body')
    let dialog = await openForm()
    assert.match(await source(dialog).innerText(), /不複製/)
    await capture('default-no-copy-dialog')
    await source(dialog).click()
    const admin = page.locator('.el-select-dropdown:visible').getByRole('option', { name: '系統管理員（最高權限無法複製）', exact: true })
    assert.equal(await admin.getAttribute('aria-disabled'), 'true')
    assert.equal(await page.locator('.el-select-dropdown:visible').getByRole('option', { name: /協助週末訓練行政聯絡/ }).count(), 1)
    await page.locator('.el-select-dropdown:visible').getByRole('option', { name: '教練 (COACH)', exact: true }).click()
    await fillIdentity(dialog, 'COPY_COACH', '測試助理教練')
    await capture('copy-source-dialog')
    await page.evaluate(() => { window.__roleFixture.holdNext = true })
    const submit = dialog.getByRole('button', { name: '確認新增', exact: true })
    await submit.click()
    await page.waitForFunction(() => window.__roleFixture.calls.filter((call) => call.action === 'create_app_role').length === 1)
    const loading = dialog.getByRole('button', { name: '確認新增', exact: true })
    assert.ok(await loading.isDisabled())
    assert.ok(await loading.evaluate((button) => button.classList.contains('is-loading')))
    assert.ok(await dialog.getByPlaceholder('例如: ASST_COACH').isDisabled())
    assert.ok(await dialog.getByPlaceholder('例如: 助理教練').isDisabled())
    assert.ok(await source(dialog).locator('.el-select__wrapper').evaluate((element) => element.classList.contains('is-disabled')))
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    assert.ok(await dialog.isVisible())
    // A native repeated click on the disabled button must not send another RPC.
    await loading.evaluate((button) => { button.click(); button.click() })
    assert.equal(await page.evaluate(() => window.__roleFixture.calls.filter((call) => call.action === 'create_app_role').length), 1)
    await capture('loading')
    await page.evaluate(() => window.__roleFixture.releasePending())
    await dialog.waitFor({ state: 'hidden' })
    await permissionScope().getByRole('heading', { name: /測試助理教練/ }).waitFor()
    assert.deepEqual(await flags('球員名單'), [true, false, true, false])
    await page.waitForFunction(() => window.__roleAssignableRoles().some((role) => role.role_key === 'COPY_COACH'))
    const copied = await page.evaluate(() => window.__roleFixture.calls.find((call) => call.action === 'create_app_role').data)
    assert.deepEqual(copied, { p_role_key: 'COPY_COACH', p_role_name: '測試助理教練', p_copy_from_role_key: 'COACH' })
    record(width, 'copy source, disabled ADMIN, one RPC while loading, selected role and assignable roles refreshed', copied)
    await capture('copied-permission-matrix')
    await closePermissions()

    dialog = await openForm()
    assert.match(await source(dialog).innerText(), /不複製/)
    await fillIdentity(dialog, 'BLANK_ROLE', '測試空白角色')
    await dialog.getByRole('button', { name: '確認新增', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    await permissionScope().getByRole('heading', { name: /測試空白角色/ }).waitFor()
    assert.deepEqual(await flags('球員名單'), [false, false, false, false])
    const matrixButtons = width < 1024
      ? permissionScope().locator('.permissions-drawer__scroll .space-y-3 > div button')
      : permissionScope().locator('tr button')
    assert.equal(await matrixButtons.evaluateAll((buttons) => buttons.filter((button) => button.querySelector('svg')).length), 0)
    assert.deepEqual(await page.evaluate(() => window.__roleFixture.permissions.filter((row) => row.role_key === 'BLANK_ROLE')), [])
    const blank = await page.evaluate(() => window.__roleFixture.calls.filter((call) => call.action === 'create_app_role')[1].data)
    assert.equal(blank.p_copy_from_role_key, null)
    record(width, 'no-copy defaults reset and new role starts with empty permissions', blank)
    await closePermissions()

    dialog = await openForm()
    await chooseSource(dialog, '教練 (COACH)')
    await fillIdentity(dialog, 'ERROR_ROLE', '測試錯誤角色')
    await page.evaluate(() => { window.__roleFixture.failNext = true })
    await dialog.getByRole('button', { name: '確認新增', exact: true }).click()
    await page.getByText(/測試建立失敗，請稍後再試/).waitFor()
    assert.ok(await dialog.isVisible())
    assert.equal(await dialog.getByPlaceholder('例如: ASST_COACH').inputValue(), 'ERROR_ROLE')
    assert.equal(await dialog.getByPlaceholder('例如: 助理教練').inputValue(), '測試錯誤角色')
    assert.match(await source(dialog).innerText(), /教練 \(COACH\)/)
    assert.ok(await dialog.getByRole('button', { name: '確認新增', exact: true }).isEnabled())
    record(width, 'RPC failure retains identity and copy source and restores submit state')
    await capture('failure-retains-form', true)
    await dialog.getByRole('button', { name: '取消', exact: true }).click()

    await page.evaluate(() => {
      document.documentElement.classList.add('app-readable-text-mode')
      document.getElementById('app').classList.add('app-readable-text-mode')
    })
    dialog = await openForm()
    await chooseSource(dialog, '協助週末訓練行政聯絡與場地維護的客製化角色 (CUSTOM_LONG)')
    await noOverflow(page.locator('body'), 'body in readable text mode')
    await capture('readable-text-long-source')
    record(width, 'readable text mode, long source label and footer remain operable')
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await context.close()
  }
  assert.deepEqual(evidence.externalRequests, [])
  assert.deepEqual(evidence.consoleErrors, [])
  evidence.result = 'PASS'
  evidence.limits = 'Real Vue/Element Plus at Chromium simulated widths with isolated Supabase/RPC fixtures; not physical phones, hardware safe area or deployed database verification.'
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
