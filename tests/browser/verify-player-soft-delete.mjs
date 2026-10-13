import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from '@playwright/test'

const directory = fileURLToPath(new URL('.', import.meta.url))
const output = resolve(process.argv[2] || 'output/playwright/player-soft-delete')
const base = 'http://127.0.0.1:5194/tests/browser/player-soft-delete/index.html'
const evidence = { fixture: base, widths: [390, 1365], checks: [], externalRequests: [], consoleErrors: [], screenshots: [] }
const record = (width, check, detail = {}) => evidence.checks.push({ width, check, detail })
const server = await createServer({ configFile: resolve(directory, 'player-soft-delete/vite.config.ts') })
await mkdir(output, { recursive: true })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true })
  for (const width of evidence.widths) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768, timezoneId: 'Asia/Taipei' })
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.hostname === '127.0.0.1' && url.port === '5194') return route.continue()
      evidence.externalRequests.push(url.href)
      return route.abort()
    })
    const page = await context.newPage()
    page.setDefaultTimeout(10_000)
    page.on('pageerror', (error) => evidence.consoleErrors.push({ width, error: error.message }))
    page.on('console', (message) => { if (message.type() === 'error') evidence.consoleErrors.push({ width, error: message.text() }) })
    const capture = async (name) => {
      const path = resolve(output, `${width}-${name}.png`)
      await page.screenshot({ path, animations: 'disabled' })
      evidence.screenshots.push(path)
    }
    const mutationCalls = () => page.evaluate(() => window.__playerFixture.calls.filter((call) => call.name === 'soft_delete_team_member' || ['UPDATE', 'DELETE'].includes(call.operation)))
    const editDialog = page.getByRole('dialog', { name: '編輯隊職員資料', exact: true })
    const removeButton = editDialog.getByRole('button', { name: '刪除', exact: true })
    const confirmation = page.locator('.el-message-box:visible')
    const openEditor = async () => {
      await page.getByRole('button', { name: '查看 軟刪除驗證球員 資料', exact: true }).click()
      await editDialog.waitFor()
    }
    const startDelete = async () => {
      await removeButton.click()
      await confirmation.waitFor()
      const text = await confirmation.innerText()
      assert.match(text, /付款|歷史/)
      assert.match(text, /軟刪除驗證球員/)
      assert.doesNotMatch(text, /尚未儲存的新姓名/)
    }
    const selectStatus = async (status) => {
      if (width < 768) {
        await page.getByRole('button', { name: '開啟球員篩選', exact: true }).click()
        await page.locator('.app-mobile-filter-sheet:visible .el-select').first().click()
      } else {
        await page.locator('.players-toolbar-filters .el-select').first().click()
      }
      const label = status === '全部' && width >= 768 ? '全狀態' : status
      await page.locator('.el-select-dropdown:visible').getByRole('option', { name: label, exact: true }).click()
      if (width < 768) await page.locator('.app-mobile-filter-sheet:visible').getByRole('button', { name: '完成', exact: true }).click()
    }

    await page.goto(base)
    await page.getByRole('heading', { name: '球員名單', exact: true }).waitFor()
    await page.getByRole('button', { name: '查看 軟刪除驗證球員 資料', exact: true }).waitFor()
    assert.equal(await page.locator('vite-error-overlay').count(), 0)
    await writeFile(resolve(output, `${width}-startup.txt`), await page.locator('body').ariaSnapshot())
    await capture('roster')
    record(width, 'real PlayersView and Element Plus load without production configuration')
    const originalMember = await page.evaluate(() => structuredClone(window.__playerFixture.members[0]))
    const originalDeletedSibling = await page.evaluate(() => structuredClone(window.__playerFixture.members[1]))
    const originalHistory = await page.evaluate(() => structuredClone(window.__playerFixture.history))
    assert.deepEqual(originalMember.sibling_ids, ['fixture-deleted-sibling'])
    assert.deepEqual(originalDeletedSibling.sibling_ids, ['fixture-member'])
    assert.ok(originalDeletedSibling.deleted_at)
    assert.equal(originalMember.is_half_price, true)
    assert.equal(originalMember.is_primary_payer, false)
    assert.doesNotMatch(await page.locator('body').innerText(), /已刪除手足驗證姓名|fixture-deleted-sibling/)
    assert.equal(await page.locator('.players-member-card').getByText('半價優惠', { exact: true }).count(), 0)

    await openEditor()
    assert.doesNotMatch(await editDialog.innerText(), /已刪除手足驗證姓名|fixture-deleted-sibling/)
    const siblingSelect = editDialog.locator('.el-form-item').filter({ hasText: '相關手足 (兄弟姊妹)' }).locator('.el-select')
    assert.equal(await siblingSelect.locator('.el-tag').count(), 0)
    assert.match(await siblingSelect.innerText(), /無/)
    await siblingSelect.click()
    await page.locator('.el-select-dropdown:visible').waitFor()
    assert.equal(await page.locator('.el-select-dropdown:visible').getByRole('option').count(), 0)
    assert.doesNotMatch(await page.locator('body').innerText(), /已刪除手足驗證姓名|fixture-deleted-sibling/)
    await siblingSelect.locator('.el-select__suffix').click()
    assert.deepEqual(await page.evaluate(() => window.__playerFixture.members[0].sibling_ids), ['fixture-deleted-sibling'])
    record(width, 'deleted sibling is absent from roster and editor choices without displaying UUID or manual half-price badge; original bidirectional links remain')
    await editDialog.getByPlaceholder('隊職員姓名', { exact: true }).fill('尚未儲存的新姓名')
    await editDialog.getByPlaceholder('附加說明或注意事項', { exact: true }).fill('尚未儲存的新備註')
    await startDelete()
    await capture('confirmation')
    await confirmation.getByRole('button', { name: '取消', exact: true }).click()
    await confirmation.waitFor({ state: 'hidden' })
    assert.equal((await mutationCalls()).length, 0)
    assert.equal(await editDialog.getByPlaceholder('隊職員姓名', { exact: true }).inputValue(), '尚未儲存的新姓名')
    record(width, 'confirmation identifies saved member name; cancelling retains unsaved draft and performs no mutation')

    await startDelete()
    await confirmation.locator('.el-message-box__headerbtn').click()
    await confirmation.waitFor({ state: 'hidden' })
    assert.equal((await mutationCalls()).length, 0)
    assert.equal(await editDialog.getByPlaceholder('附加說明或注意事項', { exact: true }).inputValue(), '尚未儲存的新備註')
    record(width, 'closing confirmation retains unsaved draft and performs no mutation')

    await page.evaluate(() => { window.__playerFixture.failNextUpdate = true })
    await startDelete()
    await confirmation.getByRole('button', { name: '確定刪除', exact: true }).click()
    await editDialog.locator('.el-alert').getByText(/測試連線失敗/).waitFor()
    await page.waitForFunction(() => !document.querySelector('.el-message--error'))
    assert.match(await editDialog.locator('.el-alert').innerText(), /測試連線失敗/)
    assert.equal(await editDialog.getByPlaceholder('隊職員姓名', { exact: true }).inputValue(), '尚未儲存的新姓名')
    assert.equal(await editDialog.getByPlaceholder('附加說明或注意事項', { exact: true }).inputValue(), '尚未儲存的新備註')
    assert.deepEqual(await page.evaluate(() => window.__playerFixture.members[0]), originalMember)
    const alertVisibility = await editDialog.locator('.el-alert').evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const middle = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      return { top: rect.top, bottom: rect.bottom, viewport: window.innerHeight, unobscured: element.contains(middle) }
    })
    assert.ok(alertVisibility.top >= 0 && alertVisibility.bottom <= alertVisibility.viewport && alertVisibility.unobscured, JSON.stringify(alertVisibility))
    await capture('failed-draft-retained')
    record(width, 'persistent failure is in the current viewport without scrolling after toast disappears; draft and stored member remain intact', alertVisibility)

    await page.evaluate(() => { window.__playerFixture.holdUpdate = true })
    await startDelete()
    await confirmation.getByRole('button', { name: '確定刪除', exact: true }).click()
    await page.waitForFunction(() => window.__playerFixture.releaseUpdate !== null)
    assert.equal((await mutationCalls()).length, 2)
    const busyButton = editDialog.getByRole('button', { name: '處理中', exact: true })
    assert.equal(await busyButton.isDisabled(), true)
    assert.equal(await editDialog.getByRole('button', { name: '取消', exact: true }).isDisabled(), true)
    assert.equal(await editDialog.getByRole('button', { name: '儲存資料', exact: true }).isDisabled(), true)
    await busyButton.dispatchEvent('click')
    await page.keyboard.press('Escape')
    assert.equal(await editDialog.isVisible(), true)
    assert.equal((await mutationCalls()).length, 2)
    await capture('pending-single-request')
    await page.evaluate(() => { window.__playerFixture.holdUpdate = false; window.__playerFixture.releaseUpdate() })
    await editDialog.waitFor({ state: 'hidden' })
    await page.getByText('NO DATA', { exact: true }).waitFor()
    const calls = await mutationCalls()
    assert.deepEqual(calls.map((call) => ({ operation: call.operation, name: call.name, payload: call.payload })), [
      { operation: 'RPC', name: 'soft_delete_team_member', payload: { p_member_id: 'fixture-member' } },
      { operation: 'RPC', name: 'soft_delete_team_member', payload: { p_member_id: 'fixture-member' } }
    ])
    const storedMember = await page.evaluate(() => window.__playerFixture.members[0])
    assert.ok(storedMember.deleted_at)
    assert.equal(storedMember.deleted_by, 'fixture-editor')
    assert.equal(storedMember.status, '退隊')
    assert.deepEqual({ ...storedMember, status: originalMember.status, deleted_at: null, deleted_by: null }, originalMember)
    assert.deepEqual(await page.evaluate(() => window.__playerFixture.members[1]), originalDeletedSibling)
    assert.deepEqual(await page.evaluate(() => window.__playerFixture.history), originalHistory)
    record(width, 'pending operation prevents duplicates and close; retry sends only member ID, keeps stored row and related records', { calls, deletedAt: storedMember.deleted_at })

    for (const status of ['退隊', '全部', '在隊']) {
      await selectStatus(status)
      await page.getByText('NO DATA', { exact: true }).waitFor()
      assert.equal(await page.getByText('軟刪除驗證球員', { exact: true }).count(), 0)
      record(width, `deleted member is absent from ${status} filter`)
    }
    await capture('hidden-all-filters')
    await selectStatus('全部')
    const search = page.getByPlaceholder('搜尋姓名或學校...', { exact: true }).filter({ visible: true })
    await search.fill('軟刪除驗證球員')
    await page.getByText('NO DATA', { exact: true }).waitFor()
    assert.equal(await page.locator('.players-member-card').count(), 0)
    await search.fill('')
    await page.getByRole('button', { name: '更多操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '下載比賽資料', exact: true }).click()
    await page.getByText('目前沒有球員資料可匯出', { exact: true }).waitFor()
    assert.equal(await page.getByRole('dialog', { name: '下載比賽球員資料', exact: true }).isVisible(), false)
    record(width, 'search across all statuses and export entry cannot find or export deleted member although source retains tombstone')
    await capture('search-export-excluded')

    // A new document creates a fresh isolated fixture, without production login.
    await page.reload()
    await openEditor()
    await page.evaluate(() => { window.__playerPermissions.denied = ['players:DELETE'] })
    await removeButton.waitFor({ state: 'hidden' })
    assert.equal((await mutationCalls()).length, 0)
    await capture('no-delete-permission')
    record(width, 'missing DELETE permission hides removal action')
    await editDialog.getByRole('button', { name: '取消', exact: true }).click()
    await page.evaluate(() => { window.__playerPermissions.denied = ['players:EDIT', 'players:CREATE', 'players:DELETE'] })
    await page.locator('.players-member-card').first().click()
    assert.equal(await editDialog.isVisible(), false)
    assert.equal((await mutationCalls()).length, 0)
    record(width, 'readonly card does not open editor or offer deletion')

    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    assert.equal(horizontalOverflow, false)
    await context.close()
  }
  assert.deepEqual(evidence.externalRequests, [])
  assert.deepEqual(evidence.consoleErrors, [])
  evidence.result = 'PASS'
  evidence.limits = 'Chromium at simulated mobile and desktop widths, real PlayersView/Element Plus/roster store/mutation service with an isolated Supabase fixture. Does not validate production deployment, database RPC authorization, or physical-device safe areas.'
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ result: 'PASS', checks: evidence.checks.length, output }))
} catch (error) {
  const page = browser?.contexts().flatMap((context) => context.pages())[0]
  if (page) {
    await page.screenshot({ path: resolve(output, 'failed-state.png') }).catch(() => {})
    evidence.failedBody = await page.locator('body').innerText().catch(() => '')
  }
  evidence.result = 'FAIL'
  evidence.error = error.stack || String(error)
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2))
  throw error
} finally {
  await browser?.close()
  await server.close()
}
