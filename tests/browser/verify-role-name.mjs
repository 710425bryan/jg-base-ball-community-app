import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from '@playwright/test'

const directory = fileURLToPath(new URL('.', import.meta.url))
const output = resolve(process.argv[2] || '/tmp/jg-role-name-verification')
const base = 'http://127.0.0.1:5179/tests/browser/role-permissions/index.html?view=users'
const evidence = { fixture: base, externalRequests: [], consoleErrors: [], checks: [], screenshots: [] }
const record = (width, check, detail = {}) => evidence.checks.push({ width, check, detail })
await mkdir(output, { recursive: true })
const server = await createServer({ configFile: resolve(directory, 'role-permissions/vite.config.ts') })
let browser

try {
  await server.listen()
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
    const activate = async (locator) => width < 768 ? locator.tap() : locator.click()
    const capture = async (name) => {
      await page.waitForFunction(() => ![...document.querySelectorAll('.el-message')].some((element) => element.getClientRects().length))
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
    const roleCard = (key) => rolePanel.locator('div.cursor-pointer').filter({ has: page.getByText(key, { exact: true }) })
    const matrix = () => width < 1024 ? page.locator('.permissions-drawer:visible') : rolePanel
    const editor = () => matrix().locator('.role-name-editor')
    const input = () => editor().getByRole('textbox', { name: '顯示名稱 (中文)', exact: true })
    const save = () => editor().getByRole('button', { name: '儲存名稱', exact: true })
    const closeDrawer = async () => {
      if (width < 1024) {
        await activate(page.getByRole('button', { name: '關閉權限設定', exact: true }))
        await page.locator('.permissions-drawer:visible').waitFor({ state: 'hidden' })
      }
    }
    const selectRole = async (key) => {
      await activate(page.getByRole('tab', { name: '角色與權限設定', exact: true }))
      await activate(roleCard(key))
      await input().waitFor({ state: 'visible' })
      await page.waitForFunction(() => !document.querySelector('.el-drawer-fade-enter-active, .el-drawer-fade-enter-from'))
      await input().scrollIntoViewIfNeeded()
    }
    const matrixChecks = () => matrix().locator(width < 1024 ? '.permissions-drawer__scroll > .space-y-3 button' : 'tbody button')
    const matrixState = () => matrixChecks().evaluateAll((buttons) => buttons.map((button) => ({ checked: Boolean(button.querySelector('svg')), disabled: button.disabled })))
    const callCount = () => page.evaluate(() => window.__roleFixture.calls.filter((call) => call.action === 'update_app_role_name').length)
    const savedName = () => page.evaluate(() => window.__roleAssignableRoles().find((role) => role.role_key === 'COACH')?.role_name)
    const checkTouch = async () => {
      const bounds = await editor().evaluate((element) => [...element.querySelectorAll('.el-input__wrapper, button')]
        .map((control) => ({ control: control.tagName, height: control.getBoundingClientRect().height, width: control.getBoundingClientRect().width })))
      for (const box of bounds) assert.ok(box.height >= 44 && box.width >= 44, `${width}px touch control ${JSON.stringify(box)}`)
      if (width < 768) assert.ok(Number.parseFloat(await input().evaluate((element) => getComputedStyle(element).fontSize)) >= 16)
      await noOverflow(editor(), 'name editor')
      record(width, 'name input and save button meet 44px touch targets', bounds)
    }

    await page.goto(base)
    await userPanel.getByText('系統管理員測試帳號', { exact: true }).first().waitFor()
    const original = await page.evaluate(() => ({
      permissions: structuredClone(window.__roleFixture.permissions),
      users: structuredClone(window.__roleFixture.users),
      roles: structuredClone(window.__roleFixture.roles)
    }))
    await selectRole('COACH')
    const originalMatrix = await matrixState()
    assert.ok(originalMatrix.some((button) => button.checked), 'fixture must include persisted coach permissions')
    assert.equal(await input().inputValue(), '教練')
    assert.equal(await editor().getByRole('textbox').count(), 1)
    assert.match(await editor().innerText(), /角色識別碼：COACH（不可修改）/)
    assert.ok(await save().isDisabled())
    await checkTouch()
    record(width, 'role key is read-only and unchanged display name disables save')

    const sortEditor = () => matrix().locator('.role-sort-editor')
    const sortInput = () => sortEditor().getByRole('spinbutton')
    await input().fill('尚未儲存的名稱草稿')
    for (const weight of [17, 16]) {
      await sortInput().fill(String(weight))
      await sortInput().press('Tab')
      await activate(sortEditor().getByRole('button', { name: '儲存排序', exact: true }))
      await page.waitForFunction((expected) => window.__roleAssignableRoles().find((role) => role.role_key === 'COACH')?.weight === expected, weight)
      assert.equal(await input().inputValue(), '尚未儲存的名稱草稿')
    }
    record(width, 'saving and restoring sorting weight preserves the unsaved name draft')

    const firstName = '球隊指導教練'
    await input().fill(`  ${firstName}  `)
    await sortInput().fill('19')
    await sortInput().press('Tab')
    await page.evaluate(() => { window.__roleFixture.holdNext = true })
    await activate(save())
    await page.waitForFunction(() => window.__roleFixture.calls.some((call) => call.action === 'update_app_role_name'))
    assert.ok(await save().isDisabled())
    assert.ok(await input().isDisabled())
    await save().evaluate((button) => { button.click(); button.click() })
    assert.equal(await callCount(), 1)
    await capture('saving-name')
    await page.evaluate(() => window.__roleFixture.releasePending())
    await page.waitForFunction((name) => window.__roleAssignableRoles().find((role) => role.role_key === 'COACH')?.role_name === name, firstName)
    assert.equal(await input().inputValue(), firstName)
    assert.equal(await sortInput().inputValue(), '19')
    await sortInput().fill('16')
    await sortInput().press('Tab')
    assert.ok(await save().isDisabled())
    assert.deepEqual(await page.evaluate(() => window.__roleFixture.calls.find((call) => call.action === 'update_app_role_name').data), { p_role_key: 'COACH', p_role_name: firstName })
    assert.deepEqual(await matrixState(), originalMatrix)
    record(width, 'one trimmed-name RPC saves once, refreshes the store and leaves the permission matrix unchanged')
    record(width, 'saving the name preserves the unsaved sorting draft')
    await capture('saved-name')
    await closeDrawer()
    assert.match(await roleCard('COACH').innerText(), new RegExp(firstName))

    await activate(page.getByRole('tab', { name: '系統帳號管理', exact: true }))
    for (const mode of ['網格', '表格']) {
      await activate(page.getByRole('button', { name: mode, exact: true }))
      const headings = await userPanel.locator('section > div h3').allTextContents()
      assert.ok(headings.includes(firstName))
      assert.equal(headings.length, original.roles.length)
      assert.deepEqual(headings, original.roles.map((role) => role.role_key === 'COACH' ? firstName : role.role_name))
      const section = userPanel.locator('section').filter({ has: page.getByRole('heading', { name: firstName, exact: true }) })
      assert.equal(await section.getByText(firstName, { exact: true }).count(), 2)
      assert.match(await section.innerText(), /教練測試帳號/)
      await section.scrollIntoViewIfNeeded()
      await noOverflow(page.locator('body'), `users ${mode} body`)
      await capture(`users-${mode === '網格' ? 'grid' : 'table'}`)
    }
    record(width, 'UsersView grid and table show the renamed group and badge without regrouping accounts')
    await activate(page.getByRole('button', { name: '新增使用者', exact: true }))
    const dialog = page.getByRole('dialog', { name: '新增使用者', exact: true })
    await dialog.waitFor({ state: 'visible' })
    const select = dialog.locator('.el-form-item').filter({ has: page.getByText('角色權限', { exact: true }) }).locator('.el-select')
    await activate(select)
    const option = page.getByRole('option', { name: `COACH — ${firstName}`, exact: true })
    await option.waitFor({ state: 'visible' })
    await activate(option)
    assert.match(await select.innerText(), new RegExp(`COACH — ${firstName}`))
    await capture('user-role-option')
    await activate(dialog.getByRole('button', { name: '取消', exact: true }))
    record(width, 'new-user role option reflects the renamed label and keeps COACH as the identifier')

    await selectRole('COACH')
    const retryName = '訓練指導教練'
    await input().fill(retryName)
    await page.evaluate(() => { window.__roleFixture.failNext = true })
    await activate(save())
    await editor().getByRole('alert').filter({ hasText: '測試名稱儲存失敗，請稍後再試' }).waitFor()
    assert.equal(await input().inputValue(), retryName)
    assert.equal(await savedName(), firstName)
    assert.ok(await save().isEnabled())
    await capture('failed-save-keeps-draft')
    await activate(save())
    await page.waitForFunction((name) => window.__roleAssignableRoles().find((role) => role.role_key === 'COACH')?.role_name === name, retryName)
    record(width, 'failed save keeps the draft and previous label, then retries successfully')

    const beforeInvalid = await callCount()
    for (const invalid of ['   ', '教'.repeat(101)]) {
      await input().fill(invalid)
      await activate(save())
      assert.match(await editor().getByRole('alert').innerText(), /1 到 100 個字/)
      assert.equal(await input().inputValue(), invalid)
      assert.equal(await callCount(), beforeInvalid)
    }
    record(width, 'blank and over-100-character names remain editable and never call the RPC')
    await input().fill(retryName)
    await closeDrawer()

    await selectRole('ADMIN')
    await input().fill('球隊系統管理者')
    await activate(save())
    await page.waitForFunction(() => window.__roleAssignableRoles().find((role) => role.role_key === 'ADMIN')?.role_name === '球隊系統管理者')
    assert.match(await matrix().innerText(), /ADMIN 為.*最高權限/)
    const adminState = await matrixState()
    assert.ok(adminState.every((button) => button.disabled))
    await closeDrawer()
    record(width, 'ADMIN display name is editable while its highest-permission behavior remains locked')

    await selectRole('CUSTOM_LONG')
    const unbrokenName = 'Coach'.repeat(20)
    await input().fill(unbrokenName)
    await activate(save())
    await page.waitForFunction((name) => window.__roleAssignableRoles().find((role) => role.role_key === 'CUSTOM_LONG')?.role_name === name, unbrokenName)
    await noOverflow(roleCard('CUSTOM_LONG'), '100-character unbroken role card name')
    await noOverflow(matrix().getByRole('heading', { level: 3 }).filter({ hasText: unbrokenName }).first(), '100-character unbroken role heading')
    record(width, '100-character unbroken names wrap within role cards and matrix headings')
    const longName = '協助週末訓練行政聯絡與場地維護的客製化角色'.repeat(4)
    assert.ok(Array.from(longName).length <= 100)
    await input().fill(longName)
    await activate(save())
    await page.waitForFunction((name) => window.__roleAssignableRoles().find((role) => role.role_key === 'CUSTOM_LONG')?.role_name === name, longName)
    await page.evaluate(() => {
      document.documentElement.classList.add('app-readable-text-mode')
      document.getElementById('app').classList.add('app-readable-text-mode')
    })
    await input().scrollIntoViewIfNeeded()
    await checkTouch()
    await noOverflow(page.locator('body'), 'long name readable-text body')
    if (width < 1024) {
      const scroll = page.locator('.permissions-drawer__scroll')
      await noOverflow(scroll, 'long name drawer')
      await scroll.evaluate((element) => { element.scrollTop = 0 })
      const scrollBounds = await scroll.boundingBox()
      const touch = await context.newCDPSession(page)
      const point = { x: Math.floor(width / 2), y: Math.floor(scrollBounds.y + scrollBounds.height - 30) }
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
      for (let step = 1; step <= 6; step += 1) {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, y: Math.floor(point.y - step * (scrollBounds.height - 60) / 6) }] })
        await new Promise((resolve) => setTimeout(resolve, 16))
      }
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForFunction(() => document.querySelector('.permissions-drawer__scroll')?.scrollTop > 0)
      await touch.detach()
      await scroll.evaluate((element) => { element.scrollTop = element.scrollHeight })
      const reachedBottom = await scroll.evaluate((element) => ({ top: element.scrollTop, height: element.scrollHeight, client: element.clientHeight }))
      assert.ok(reachedBottom.top > 0 && reachedBottom.top + reachedBottom.client >= reachedBottom.height - 2)
      record(width, 'drawer supports actual touch scrolling, reaches the final permission and returns to the name editor', reachedBottom)
      await input().scrollIntoViewIfNeeded()
      const close = page.getByRole('button', { name: '關閉權限設定', exact: true })
      const bounds = await close.boundingBox()
      assert.ok(bounds && bounds.width >= 44 && bounds.height >= 44 && bounds.x + bounds.width <= width + 1)
    }
    await capture('long-name-readable-text')
    await closeDrawer()
    await noOverflow(page.locator('body'), 'long name role cards')
    await capture('long-name-role-card')
    record(width, 'long custom name remains scrollable and controls stay reachable with readable text')

    if (width >= 1024) {
      await selectRole('COACH')
      await input().fill('切換角色後完成保存的教練')
      const beforeDelayed = await callCount()
      await page.evaluate(() => { window.__roleFixture.holdNext = true })
      await activate(save())
      await page.waitForFunction((count) => window.__roleFixture.calls.filter((call) => call.action === 'update_app_role_name').length === count + 1, beforeDelayed)
      await activate(roleCard('FINANCE'))
      await page.waitForFunction(() => [...document.querySelectorAll('.role-name-editor')].some((element) => element.textContent.includes('角色識別碼：FINANCE')))
      await page.evaluate(() => window.__roleFixture.releasePending())
      await page.waitForFunction(() => window.__roleAssignableRoles().find((role) => role.role_key === 'COACH')?.role_name === '切換角色後完成保存的教練')
      assert.equal(await input().inputValue(), '財務')
      assert.match(await editor().innerText(), /角色識別碼：FINANCE/)
      assert.match(await roleCard('COACH').innerText(), /切換角色後完成保存的教練/)
      await capture('delayed-save-after-role-switch')
      record(width, 'delayed name save refreshes the original role after switching without overwriting the selected role')
    }

    const finalState = await page.evaluate(() => ({
      permissions: window.__roleFixture.permissions,
      users: window.__roleFixture.users,
      roles: window.__roleFixture.roles.map(({ role_name, ...role }) => role),
      writes: window.__roleFixture.calls.filter((call) => !call.action.startsWith('read:')).map((call) => call.action)
    }))
    assert.deepEqual(finalState.permissions, original.permissions)
    assert.deepEqual(finalState.users, original.users)
    assert.deepEqual(finalState.roles, original.roles.map(({ role_name, ...role }) => role))
    assert.ok(finalState.writes.every((action) => action === 'update_app_role_name' || action === 'update_app_role_weight'))
    assert.equal(finalState.writes.filter((action) => action === 'update_app_role_weight').length, 2)
    record(width, 'all saves preserve role keys, weights, system flags, profile roles and permission rows', { writes: finalState.writes })
    await context.close()
  }
  assert.deepEqual(evidence.externalRequests, [])
  assert.deepEqual(evidence.consoleErrors, [])
  evidence.result = 'PASS'
  evidence.limits = 'Real RoleNameEditor, RolePermissionsManager and UsersView with Element Plus at simulated Chromium widths; isolated local Supabase/RPC fixtures, not physical phones, hardware safe area or deployed database verification.'
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
  await server.close()
}
