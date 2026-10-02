import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium, selectors } from '@playwright/test'
import { verifyCoachMonthOverview } from './coach-month-overview.mjs'

const exec = promisify(execFile)
const directory = fileURLToPath(new URL('.', import.meta.url))
const output = resolve(process.argv[2] || '/tmp/jg-coach-ui-verification')
const config = resolve(directory, 'coach-ui/vite.config.ts')
const base = 'http://127.0.0.1:5178/tests/browser/coach-ui/index.html'
const session = `coach-ui-${process.pid}`
const overviewOnly = process.env.COACH_UI_OVERVIEW_ONLY === '1'
const widths = overviewOnly ? (process.env.COACH_UI_OVERVIEW_WIDTHS || '360').split(',').map(Number) : [360, 390, 767]
assert.ok(widths.length && widths.every((width) => [360, 390, 767].includes(width)) && new Set(widths).size === widths.length)
selectors.setTestIdAttribute('data-test')
const evidence = { fixture: base, scope: overviewOnly ? 'month-overview-only' : 'full-coach-ui', widths, externalRequests: [], consoleErrors: [], checks: [], screenshots: [] }
const record = (width, check, detail = {}) => evidence.checks.push({ width, check, detail })
const ab = (...args) => exec('npx', ['--yes', 'agent-browser', '--session', session, ...args], { timeout: 60_000, maxBuffer: 2_000_000 })
await mkdir(output, { recursive: true })
const server = await createServer({ configFile: config })
let browser
try {
  await server.listen()
  // Required immediate verification after startup, before further test work.
  await ab('--allowed-domains', '127.0.0.1', 'open', base)
  await ab('wait', '--load', 'networkidle')
  await ab('screenshot', resolve(output, 'agent-browser-startup.png'))
  const snapshot = (await ab('snapshot', '-i')).stdout
  assert.match(snapshot, /自動帶入|排班月份/)
  const overlay = (await ab('eval', 'document.querySelector("vite-error-overlay") ? "ERROR_OVERLAY" : "OK"')).stdout
  assert.ok(!overlay.includes('ERROR_OVERLAY'))
  await writeFile(resolve(output, 'agent-browser-startup.txt'), snapshot)
  evidence.screenshots.push(resolve(output, 'agent-browser-startup.png'))

  browser = await chromium.launch({ headless: true })
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Taipei' })
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.hostname === '127.0.0.1' && url.port === '5178') return route.continue()
      evidence.externalRequests.push(route.request().url())
      return route.abort()
    })
    const page = await context.newPage()
    page.on('pageerror', (error) => evidence.consoleErrors.push({ width, error: error.message }))
    page.on('console', (message) => { if (message.type() === 'error') evidence.consoleErrors.push({ width, error: message.text() }) })
    await page.clock.setFixedTime(new Date('2026-10-02T02:00:00+00:00'))
    const capture = async (name, options = {}) => {
      await page.waitForFunction(() => ![...document.querySelectorAll('.el-message')].some((element) => element.getClientRects().length))
      const path = resolve(output, `${width}-${name}.png`)
      const { directViewport, ...screenshotOptions } = options
      if (directViewport) {
        const client = await context.newCDPSession(page)
        const result = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
        await writeFile(path, Buffer.from(result.data, 'base64'))
        await client.detach()
      } else await page.screenshot({ path, animations: 'disabled', ...screenshotOptions })
      evidence.screenshots.push(path)
    }
    const noOverflow = async (scope = 'body') => {
      const result = await page.locator(scope).evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }))
      assert.ok(result.scroll <= result.client + 1, `${width}px ${scope} overflow ${JSON.stringify(result)}`)
      record(width, 'horizontal overflow', { scope, ...result })
    }
    const checkDialog = async () => {
      const dialog = page.locator('.el-dialog:visible').last()
      await dialog.waitFor({ state: 'visible' })
      assert.ok(await dialog.evaluate((element) => element.classList.contains('coach-feature-theme')))
      assert.equal((await dialog.evaluate((element) => getComputedStyle(element).getPropertyValue('--el-color-primary'))).trim(), '#D88F22')
      await page.waitForFunction(() => {
        const element = [...document.querySelectorAll('.el-dialog')].find((dialog) => dialog.getClientRects().length)
        const overlay = element?.closest('.el-overlay')
        return element && Math.abs(element.getBoundingClientRect().top) <= 1
          && Number(getComputedStyle(element).opacity) >= 0.999
          && (!overlay || Number(getComputedStyle(overlay).opacity) >= 0.999)
          && !document.querySelector('.dialog-fade-enter-active, .dialog-fade-enter-from')
      })
      const result = await dialog.evaluate((element) => {
        const body = element.querySelector('.el-dialog__body')
        const footer = element.querySelector('.el-dialog__footer')
        const close = element.querySelector('.el-dialog__headerbtn')
        const rect = element.getBoundingClientRect()
        const bodyRect = body.getBoundingClientRect()
        const footerRect = footer.getBoundingClientRect()
        const closeRect = close.getBoundingClientRect()
        return { width: rect.width, height: rect.height, top: rect.top,
          bodyBottom: bodyRect.bottom, footerTop: footerRect.top, footerBottom: footerRect.bottom,
          closeWidth: closeRect.width, closeHeight: closeRect.height,
          overflow: body.scrollWidth - body.clientWidth }
      })
      assert.ok(Math.abs(result.width - width) <= 1)
      assert.ok(result.height <= 845 && result.height >= 843)
      assert.ok(Math.abs(result.top) <= 1)
      assert.ok(result.footerBottom <= 845 && result.bodyBottom <= result.footerTop + 1)
      assert.ok(result.closeWidth >= 44 && result.closeHeight >= 44)
      assert.ok(result.overflow <= 1)
      record(width, 'dialog bounds, scroll and touch', result)
      return dialog
    }
    const checkTemplateControls = async (dialog, state) => {
      const metrics = await dialog.locator('.el-form').evaluate((form) => {
        const controls = [...form.querySelectorAll('.el-input__wrapper, .el-select__wrapper, .el-date-editor.el-input, .el-switch')]
          .map((element) => {
            const bounds = element.getBoundingClientRect()
            return { classes: element.className, label: element.closest('.el-form-item')?.querySelector('.el-form-item__label')?.textContent?.trim(),
              width: bounds.width, height: bounds.height }
          })
        const textInputs = [...form.querySelectorAll('.el-input__inner, .el-select__input')]
          .map((element) => ({ classes: element.className, fontSize: getComputedStyle(element).fontSize }))
        return { controls, textInputs, switchLabel: form.querySelector('input[role="switch"]')?.getAttribute('aria-label') }
      })
      assert.equal(metrics.controls.length, 4)
      assert.ok(metrics.textInputs.length >= 3)
      for (const control of metrics.controls) {
        assert.ok(control.height >= 44 && control.width >= 44, `${width}px ${state}: ${JSON.stringify(control)}`)
      }
      assert.ok(metrics.textInputs.every((input) => input.fontSize === '16px'), `${width}px ${state}: ${JSON.stringify(metrics.textInputs)}`)
      assert.equal(metrics.switchLabel, '啟用範本')
      record(width, 'template controls have 44px touch targets, 16px inputs and named switch', { state, ...metrics })
    }
    const coachDropdown = page.locator('.el-select-dropdown:visible')
    const groupLabels = () => coachDropdown.locator('.el-select-group__title:visible').allTextContents()
    const waitGroupLabels = (labels) => page.waitForFunction((expected) => {
      const actual = [...document.querySelectorAll('.el-select-dropdown .el-select-group__title')]
        .filter((element) => {
          const bounds = element.getBoundingClientRect()
          return bounds.width > 0 && bounds.height > 0 && getComputedStyle(element).visibility !== 'hidden'
        })
        .map((element) => element.textContent.trim())
      return JSON.stringify(actual) === JSON.stringify(expected)
    }, labels)
    const measureCoachSelector = async (select, state) => {
      // Floating options animate with a scale transform; measure their completed touch targets.
      await page.waitForFunction(() => !document.querySelector('.el-zoom-in-top-enter-active, .el-zoom-in-bottom-enter-active, .el-zoom-in-top-enter-from, .el-zoom-in-bottom-enter-from'))
      const control = await select.locator('.el-select__wrapper').boundingBox()
      const font = await select.locator('input').evaluate((element) => getComputedStyle(element).fontSize)
      const options = await coachDropdown.getByRole('option').evaluateAll((elements) => elements.map((element) => {
        const bounds = element.getBoundingClientRect()
        return { width: bounds.width, height: bounds.height }
      }))
      assert.ok(control.width >= 44 && control.height >= 44, `${width}px ${state}: ${JSON.stringify({ control, font, options })}`)
      assert.equal(font, '16px')
      assert.ok(options.length && options.every((option) => option.width >= 44 && option.height >= 44), `${width}px ${state}: ${JSON.stringify(options)}`)
      record(width, 'grouped coach selector and options retain mobile touch and input sizes', { state, control, font, options })
    }

    if (overviewOnly) {
      await page.goto(`${base}#/coach-schedules?month=2026-10`)
      await page.getByRole('heading', { name: /^教練排班表/ }).waitFor()
      await verifyCoachMonthOverview({ page, width, checkDialog, capture, noOverflow, record, waitGroupLabels })
      await context.close()
      continue
    }
    await page.goto(`${base}#/coach-leave-requests`)
    await page.getByRole('heading', { name: '教練請假管理' }).waitFor()
    await page.getByText('張國強', { exact: true }).first().waitFor()
    await noOverflow()
    const primaryTouch = await page.getByTestId('create-leave').boundingBox()
    assert.ok(primaryTouch.height >= 44)
    assert.equal(await page.getByTestId('create-leave').evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(216, 143, 34)')
    record(width, 'primary touch target', primaryTouch)
    const createDialog = async (coachName = '張國強') => {
      await page.getByTestId('create-leave').tap()
      const dialog = await checkDialog()
      const coachSelect = dialog.locator('.el-select').first()
      await coachSelect.tap()
      await coachSelect.locator('input').fill(coachName.slice(0, 1))
      const list = page.locator('.el-select-dropdown:visible')
      await list.getByRole('option', { name: coachName, exact: true }).waitFor()
      assert.equal(await list.getByRole('option').count(), 1)
      await list.getByRole('option', { name: coachName, exact: true }).tap()
      return dialog
    }
    const selectSegment = async (dialog, name) => {
      const segment = dialog.locator('.el-form-item').filter({ hasText: '請假時段' }).locator('.el-select')
      await segment.tap()
      await page.locator('.el-select-dropdown:visible').getByRole('option', { name, exact: true }).tap()
      return segment
    }
    const fillDate = async (input, value) => {
      await input.fill(value)
      await input.press('Enter')
      await input.press('Tab')
    }
    const batchCalls = () => page.evaluate(() => window.__coachFixture.calls.filter((call) => call.action === 'createLeaveBatch'))
    const submitBatch = async (dialog) => {
      await dialog.locator('.el-dialog__body').evaluate((element) => { element.scrollTop = element.scrollHeight })
      await dialog.getByTestId('save-leave').tap()
      await dialog.waitFor({ state: 'hidden' })
      return (await batchCalls()).at(-1)
    }

    const leaveDialog = await createDialog()
    await leaveDialog.getByTestId('training-date-option').first().waitFor()
    assert.equal(await leaveDialog.getByTestId('leave-mode-quick').locator('input').isChecked(), true)
    const past = leaveDialog.locator('[data-date="2026-10-01"]')
    assert.equal(await past.isDisabled(), true)
    const quickDate = leaveDialog.locator('[data-date="2026-10-09"]')
    const touchDate = await quickDate.boundingBox()
    assert.ok(touchDate.height >= 44)
    await quickDate.tap()
    await leaveDialog.locator('[data-date="2026-11-07"]').tap()
    assert.equal(await quickDate.getAttribute('aria-pressed'), 'true')
    record(width, 'quick mode defaults, past disabled, 44px multi-date selection', touchDate)
    await page.evaluate(() => { window.__coachFixture.failTrainingMonths = ['2026-12'] })
    await leaveDialog.getByTestId('load-next-training-month').tap()
    await leaveDialog.getByRole('alert').filter({ hasText: '上課日期載入失敗' }).waitFor()
    assert.equal(await quickDate.getAttribute('aria-pressed'), 'true')
    await leaveDialog.getByTestId('retry-class-dates').tap()
    await leaveDialog.locator('[data-date="2026-12-05"]').waitFor()
    assert.equal(await quickDate.getAttribute('aria-pressed'), 'true')
    await leaveDialog.locator('[data-date="2026-12-05"]').tap()
    assert.match(await leaveDialog.getByTestId('selected-training-dates').innerText(), /已選 3 天/)
    const programSelect = leaveDialog.getByTestId('training-program-select')
    await programSelect.tap()
    await page.locator('.el-select-dropdown:visible').getByRole('option', { name: '國中部', exact: true }).tap()
    await leaveDialog.locator('[data-date="2026-10-04"]').waitFor()
    assert.match(await leaveDialog.getByTestId('selected-training-dates').innerText(), /已選 3 天/)
    await programSelect.tap()
    await page.locator('.el-select-dropdown:visible').getByRole('option', { name: '中港總部', exact: true }).tap()
    assert.equal(await quickDate.getAttribute('aria-pressed'), 'true')
    record(width, 'append third month and change program retain selected dates')
    await noOverflow('.el-dialog:visible .el-dialog__body')
    await leaveDialog.locator('.el-dialog__body').evaluate((element) => { element.scrollTop = 0 })
    await capture('leave-quick-date-selection')
    await selectSegment(leaveDialog, '上午（13:00 前）')
    await leaveDialog.locator('textarea').fill('跨月多選上午手機操作驗證')
    await leaveDialog.locator('.el-dialog__body').evaluate((element) => { element.scrollTop = element.scrollHeight })
    await capture('leave-quick-multidate')
    await page.evaluate(() => { window.__coachFixture.failNextBatch = true })
    const leaveCountBeforeFailure = await page.evaluate(() => window.__coachFixture.leaves.length)
    await leaveDialog.getByTestId('save-leave').tap()
    await leaveDialog.getByRole('alert').filter({ hasText: 'Fixture 批次送出失敗' }).waitFor()
    assert.equal(await page.evaluate(() => window.__coachFixture.leaves.length), leaveCountBeforeFailure)
    assert.match(await leaveDialog.getByTestId('selected-training-dates').innerText(), /已選 3 天/)
    const failedCall = (await batchCalls()).at(-1)
    const quickCall = await submitBatch(leaveDialog)
    assert.equal(quickCall.data.batchId, failedCall.data.batchId)
    assert.deepEqual(quickCall.data.input, failedCall.data.input)
    assert.deepEqual(quickCall.data.input.records, [
      { start_date: '2026-10-09', end_date: '2026-10-09', time_segment: 'morning' },
      { start_date: '2026-11-07', end_date: '2026-11-07', time_segment: 'morning' },
      { start_date: '2026-12-05', end_date: '2026-12-05', time_segment: 'morning' }
    ])
    assert.equal(quickCall.data.input.coach_profile_id, 'coach-b')
    assert.equal(quickCall.data.manage, true)
    record(width, 'quick multi-date batch retains content and UUID after failed first-touch submission', quickCall.data)

    const rangeDialog = await createDialog()
    await rangeDialog.getByTestId('leave-mode-range').tap()
    const rangeDates = rangeDialog.locator('.el-date-editor input')
    await selectSegment(rangeDialog, '上午（13:00 前）')
    await fillDate(rangeDates.nth(0), '2026/10/04')
    await fillDate(rangeDates.nth(1), '2026/10/05')
    const rangeSegment = rangeDialog.locator('.el-form-item').filter({ hasText: '請假時段' }).locator('.el-select')
    assert.match(await rangeSegment.innerText(), /全日/)
    assert.ok(await rangeSegment.locator('.el-select__wrapper').evaluate((element) => element.classList.contains('is-disabled')))
    await capture('leave-multiday-dialog')
    const rangeCall = await submitBatch(rangeDialog)
    assert.deepEqual(rangeCall.data.input.records, [{ start_date: '2026-10-04', end_date: '2026-10-05', time_segment: 'full_day' }])
    record(width, 'continuous multi-day range automatically becomes full day', rangeCall.data.input)

    const recurringDialog = await createDialog('陳志豪')
    await recurringDialog.getByTestId('leave-mode-recurring').tap()
    await recurringDialog.getByText('週二', { exact: true }).tap()
    await recurringDialog.getByText('週六', { exact: true }).tap()
    const recurringDates = recurringDialog.locator('.el-date-editor input')
    await fillDate(recurringDates.nth(0), '2026/10/02')
    await fillDate(recurringDates.nth(1), '2026/10/17')
    await selectSegment(recurringDialog, '下午（13:00 起）')
    await capture('leave-recurring-dialog')
    const recurringCall = await submitBatch(recurringDialog)
    assert.deepEqual(recurringCall.data.input.records.map((record) => record.start_date), ['2026-10-03', '2026-10-06', '2026-10-10', '2026-10-13', '2026-10-17'])
    assert.ok(recurringCall.data.input.records.every((record) => record.start_date === record.end_date && record.time_segment === 'afternoon'))
    record(width, 'fixed multiple weekdays expand to individual afternoon records', recurringCall.data.input)

    await page.getByRole('link', { name: '我的假單', exact: true }).tap()
    await page.getByRole('heading', { name: '我的教練假單', exact: true }).waitFor()
    await page.getByTestId('create-leave').tap()
    const ownDialog = await checkDialog()
    assert.match(await ownDialog.getByTestId('fixed-coach').innerText(), /王文豪/)
    assert.equal(await ownDialog.getByPlaceholder('選擇教練').count(), 0)
    await ownDialog.getByTestId('leave-mode-single').tap()
    await fillDate(ownDialog.locator('.el-date-editor input'), '2026/10/06')
    await selectSegment(ownDialog, '下午（13:00 起）')
    const ownCall = await submitBatch(ownDialog)
    assert.deepEqual(ownCall.data.input.records, [{ start_date: '2026-10-06', end_date: '2026-10-06', time_segment: 'afternoon' }])
    assert.equal(ownCall.data.manage, false)
    assert.equal(ownCall.data.input.coach_profile_id, undefined)
    record(width, 'own single-day afternoon batch fixes coach identity and hash navigation', ownCall.data.input)
    await page.getByTestId('edit-leave').first().tap()
    const editDialog = await checkDialog()
    assert.equal(await editDialog.getByTestId('coach-leave-date-selection').count(), 0)
    assert.match(await editDialog.getByTestId('fixed-coach').innerText(), /王文豪/)
    await editDialog.locator('textarea').fill('更新既有假單原因')
    await editDialog.getByTestId('save-leave').tap()
    await editDialog.waitFor({ state: 'hidden' })
    const editCall = await page.evaluate(() => window.__coachFixture.calls.find((call) => call.action === 'saveLeave'))
    assert.ok(editCall.data.input.id)
    assert.equal(editCall.data.requestId, null)
    record(width, 'existing edit keeps individual record and exact revision API', editCall.data.input)

    await page.getByRole('link', { name: '排班', exact: true }).click()
    await page.getByRole('heading', { name: /^教練排班表/ }).waitFor()
    assert.equal(await page.locator('.app-page-header-actions button').count(), 2)
    record(width, 'at most two visible header actions')
    const cards = page.getByTestId('coach-schedule-event')
    await cards.first().waitFor()
    await noOverflow()
    // Keep this activity identity when a newly added manual event sorts before the training day.
    const first = cards.filter({ hasText: '週末投捕與內外野分組訓練' })
    const firstCoach = first.getByTestId('card-coaches-select')
    await firstCoach.tap()
    await coachDropdown.getByRole('option', { name: '陳志豪', exact: true }).waitFor()
    await waitGroupLabels(['總教練', '教練'])
    assert.deepEqual(await coachDropdown.getByRole('option').allTextContents(), ['陳志豪', '王文豪', '張國強'])
    await measureCoachSelector(firstCoach, 'schedule card')
    record(width, 'schedule card groups existing coach candidates by role and name')
    await first.locator('.el-select').first().locator('input').fill('王')
    await page.locator('.el-select-dropdown:visible').getByRole('option', { name: '王文豪', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('[data-test="coach-schedule-event"] .el-select input')?.value === '')
    await page.keyboard.press('Escape')
    assert.equal(await first.locator('.el-select').first().locator('input').getAttribute('aria-expanded'), 'false')
    await first.getByRole('button', { name: '更多排班操作', exact: true }).tap()
    await page.getByRole('menuitem', { name: '建立固定範本', exact: true }).tap()
    record(width, 'coach selection clears search and template menu opens with first touch')
    const templateDialog = await checkDialog()
    await noOverflow('.el-dialog:visible .el-dialog__body')
    await templateDialog.locator('.el-dialog__body').evaluate((element) => { element.scrollTop = element.scrollHeight })
    await capture('template-dialog')
    await templateDialog.getByRole('button', { name: '儲存範本', exact: true }).tap()
    await page.waitForFunction(() => window.__coachFixture.calls.some((call) => call.action === 'saveTemplate'))
    const savedTemplate = await page.evaluate(() => window.__coachFixture.calls.find((call) => call.action === 'saveTemplate').data)
    assert.deepEqual(savedTemplate.coach_profile_ids, ['coach-a'])
    assert.equal(savedTemplate.venue_id, 'venue-a')
    assert.equal(savedTemplate.match_mode, 'venue')
    for (const removed of ['weekday', 'source_type', 'start_time', 'title']) assert.equal(removed in savedTemplate, false)
    await templateDialog.getByRole('button', { name: '關閉', exact: true }).click()
    record(width, 'copies fixed identity and selected draft coaches into a template', savedTemplate)

    await page.getByRole('button', { name: '自動帶入', exact: true }).click()
    const discard = page.getByRole('dialog', { name: '未儲存的變更' })
    await discard.getByRole('button', { name: '捨棄變更', exact: true }).click()
    const previewDialog = await checkDialog()
    await previewDialog.getByText('排除：張國強（教練已請假）').waitFor()
    assert.ok((await previewDialog.innerText()).includes('待補 1 位教練'))
    await previewDialog.getByText('排除：王文豪（教練同時段撞班）').waitFor()
    assert.equal(await previewDialog.locator('input[type="checkbox"]:disabled').count(), 2)
    await previewDialog.locator('.el-dialog__body').evaluate((element) => { element.scrollTop = element.scrollHeight })
    await capture('auto-fill-preview')
    await previewDialog.getByRole('button', { name: '確認帶入 1 筆', exact: true }).click()
    await previewDialog.waitFor({ state: 'hidden' })
    const confirmed = await page.evaluate(() => window.__coachFixture.calls.find((call) => call.action === 'confirmAutoFill').data)
    assert.equal(confirmed.keys.length, 1)
    assert.ok(confirmed.fingerprint.startsWith('fixture-'))
    await first.getByText('已指派教練：王文豪').waitFor()
    record(width, 'preview excludes leave, shows vacancies and confirms only selected eligible event', confirmed)
    await capture('schedules-after-auto-fill')
    await noOverflow()

    const second = cards.filter({ hasText: '下午守備訓練' })
    await second.getByTestId('card-coaches-select').tap()
    await coachDropdown.getByRole('option', { name: '張國強（請假）', exact: true }).waitFor()
    await waitGroupLabels(['總教練', '教練'])
    assert.equal(await coachDropdown.getByRole('option', { name: '張國強（請假）', exact: true }).getAttribute('aria-disabled'), 'true')
    await second.getByTestId('card-coaches-select').locator('input').fill('張')
    await waitGroupLabels(['教練'])
    assert.equal(await coachDropdown.getByRole('option').count(), 1)
    assert.equal(await coachDropdown.getByRole('option').getAttribute('aria-disabled'), 'true')
    record(width, 'schedule coach search hides empty groups and keeps coach leave option disabled')
    await second.locator('.el-select').first().locator('input').fill('陳')
    await page.locator('.el-select-dropdown:visible').getByRole('option', { name: '陳志豪', exact: true }).tap()
    await second.locator('.el-select').first().locator('.el-select__suffix').tap()
    assert.equal(await second.locator('.el-select').first().locator('input').getAttribute('aria-expanded'), 'false')
    await second.getByRole('button', { name: '更新排班', exact: true }).tap()
    await page.waitForFunction(() => window.__coachFixture.calls.some((call) => call.action === 'saveSchedule' && call.data.id === 'empty-saved' && call.data.coach_profile_ids.includes('coach-c')))
    record(width, 'first-touch save after Chinese coach selection and explicit dropdown close')

    await page.locator('.app-page-header-actions').getByRole('button', { name: '更多', exact: true }).tap()
    await page.getByRole('menuitem', { name: '新增手動排班', exact: true }).tap()
    const manualDialog = await checkDialog()
    await manualDialog.getByPlaceholder('例：投捕加練').fill('手機加練')
    const manualCoach = manualDialog.getByTestId('manual-coaches-select')
    await manualCoach.tap()
    await coachDropdown.getByRole('option', { name: '陳志豪', exact: true }).waitFor()
    await waitGroupLabels(['總教練', '教練'])
    assert.deepEqual(await coachDropdown.getByRole('option').allTextContents(), ['陳志豪', '王文豪', '張國強'])
    await measureCoachSelector(manualCoach, 'manual schedule')
    record(width, 'manual schedule groups and sorts existing coach candidates')
    await manualCoach.locator('input').fill('陳')
    await page.locator('.el-select-dropdown:visible').getByRole('option', { name: '陳志豪', exact: true }).tap()
    await manualCoach.locator('input').fill('王')
    await coachDropdown.getByRole('option', { name: '王文豪', exact: true }).waitFor()
    await waitGroupLabels(['教練'])
    await coachDropdown.getByRole('option', { name: '王文豪', exact: true }).tap()
    await manualCoach.locator('.el-select__suffix').tap()
    assert.equal(await manualCoach.locator('input').getAttribute('aria-expanded'), 'false')
    await manualDialog.locator('.el-dialog__body').evaluate((element) => { element.scrollTop = element.scrollHeight })
    await capture('manual-dialog')
    await manualDialog.getByRole('button', { name: '新增', exact: true }).tap()
    await manualDialog.waitFor({ state: 'hidden' })
    const manualCall = await page.evaluate(() => window.__coachFixture.calls.find((call) => call.action === 'saveSchedule' && call.data.source_type === 'manual'))
    assert.deepEqual(manualCall.data.coach_profile_ids, ['coach-c', 'coach-a'])
    record(width, 'manual dialog scroll, searchable coach and immediate first-touch save', manualCall.data)
    const confirmCount = await page.evaluate(() => window.__coachFixture.calls.filter((call) => call.action === 'confirmAutoFill').length)
    assert.equal(confirmCount, 1)
    record(width, 'exactly one auto-fill confirmation call', { count: confirmCount })

    const scheduleWriteCount = await page.evaluate(() => window.__coachFixture.calls.filter((call) => call.action === 'saveSchedule').length)
    const templateCalls = () => page.evaluate(() => window.__coachFixture.calls.filter((call) => call.action === 'saveTemplate'))
    const openTemplateManager = async () => {
      await page.locator('.app-page-header-actions').getByRole('button', { name: '更多', exact: true }).tap()
      await page.getByRole('menuitem', { name: '固定範本', exact: true }).tap()
      return checkDialog()
    }
    const directTemplateDialog = await openTemplateManager()
    const createTemplate = directTemplateDialog.getByTestId('create-template')
    const createTarget = await createTemplate.boundingBox()
    assert.ok(createTarget.height >= 44 && createTarget.width >= 44)
    await createTemplate.tap()
    // Element Plus forwards this input attribute to its native input, rather than the wrapper.
    const templateName = directTemplateDialog.getByPlaceholder('未填寫時使用場地名稱')
    const templateVenue = directTemplateDialog.getByTestId('template-venue-select')
    const templateCoaches = directTemplateDialog.getByTestId('template-coaches-select')
    const assertFourFields = async () => {
      const labels = await directTemplateDialog.locator('.el-form-item__label').allTextContents()
      assert.deepEqual(labels.map((label) => label.trim()).sort(), ['場地', '固定教練', '範本名稱（選填）', '啟用範本'].sort())
      assert.equal(await directTemplateDialog.locator('.el-date-editor, .el-time-picker').count(), 0)
      assert.equal(await directTemplateDialog.getByTestId('template-activity-select').count(), 0)
      assert.equal(await directTemplateDialog.getByTestId('template-source-select').count(), 0)
    }
    const selectVenue = async (name) => {
      await templateVenue.tap()
      await templateVenue.locator('input').fill(name)
      await page.locator('.el-select-dropdown:visible').getByRole('option', { name, exact: true }).tap()
    }
    const selectTemplateCoach = async (name) => {
      await templateCoaches.tap()
      await templateCoaches.locator('input').fill(name.slice(0, 1))
      await page.locator('.el-select-dropdown:visible').getByRole('option', { name, exact: true }).tap()
      await templateCoaches.locator('.el-select__suffix').tap()
      assert.equal(await templateCoaches.locator('input').getAttribute('aria-expanded'), 'false')
    }
    const saveTemplateOnce = async () => {
      const count = (await templateCalls()).length
      await directTemplateDialog.getByRole('button', { name: '儲存範本', exact: true }).tap()
      await page.waitForFunction((previous) => window.__coachFixture.calls.filter((call) => call.action === 'saveTemplate').length === previous + 1, count)
      await directTemplateDialog.getByRole('button', { name: '刪除範本', exact: true }).waitFor()
      return (await templateCalls()).at(-1).data
    }
    await assertFourFields()
    assert.equal(await templateName.inputValue(), '')
    assert.equal(await templateCoaches.locator('.el-tag').count(), 0)
    await checkTemplateControls(directTemplateDialog, 'blank venue template')
    record(width, 'direct create opens exactly four fields with no activity, date, time or title inputs', createTarget)

    const originalVenueCount = await page.evaluate(() => window.__coachFixture.venues.length)
    await selectVenue('河濱球場')
    await selectTemplateCoach('王文豪')
    await noOverflow('.el-dialog:visible .el-dialog__body')
    await capture('template-existing-venue')
    const directSaved = await saveTemplateOnce()
    assert.equal(directSaved.id, null)
    assert.equal(directSaved.match_mode, 'venue')
    assert.equal(directSaved.venue_id, 'venue-c')
    assert.ok(!directSaved.name || directSaved.name === '河濱球場')
    assert.deepEqual(directSaved.coach_profile_ids, ['coach-a'])
    const directStored = await page.evaluate(() => window.__coachFixture.templates.find((row) => row.venue_id === 'venue-c'))
    assert.equal(directStored.name, '河濱球場')
    assert.equal(await page.evaluate(() => window.__coachFixture.venues.length), originalVenueCount)
    record(width, 'venue dictionary includes a venue outside current month and blank name uses venue name', { submitted: directSaved, stored: directStored })

    await createTemplate.tap()
    const customVenueName = '新太陽練習基地'
    await selectVenue(customVenueName)
    await selectTemplateCoach('陳志豪')
    await checkTemplateControls(directTemplateDialog, 'new Chinese venue draft')
    await page.evaluate(() => { window.__coachFixture.failNextTemplate = true })
    const failedTemplateCount = (await templateCalls()).length
    await directTemplateDialog.getByRole('button', { name: '儲存範本', exact: true }).tap()
    await directTemplateDialog.getByTestId('template-save-error').filter({ hasText: 'Fixture 範本儲存失敗，請保留表單並重試。' }).waitFor()
    assert.equal((await templateCalls()).length, failedTemplateCount + 1)
    assert.equal(await page.evaluate(() => window.__coachFixture.venues.length), originalVenueCount)
    assert.match(await templateVenue.innerText(), /新太陽練習基地/)
    assert.match(await templateCoaches.innerText(), /陳志豪/)
    const failedTemplate = (await templateCalls()).at(-1).data
    await capture('template-custom-venue-retry')
    const customSaved = await saveTemplateOnce()
    assert.deepEqual(customSaved, failedTemplate)
    assert.equal(customSaved.venue_id, null)
    assert.equal(customSaved.venue_name, customVenueName)
    assert.equal(customSaved.match_mode, 'venue')
    assert.deepEqual(customSaved.coach_profile_ids, ['coach-c'])
    const customVenue = await page.evaluate(() => window.__coachFixture.venues.find((row) => row.name === '新太陽練習基地'))
    assert.ok(customVenue.id)
    assert.equal(await page.evaluate(() => window.__coachFixture.venues.filter((row) => row.name === '新太陽練習基地').length), 1)
    record(width, 'new Chinese venue only persists after successful save and failed draft survives intact', { submitted: customSaved, venue: customVenue })

    await directTemplateDialog.getByRole('button', { name: '關閉', exact: true }).tap()
    await directTemplateDialog.waitFor({ state: 'hidden' })
    await openTemplateManager()
    await createTemplate.tap()
    await selectVenue(customVenueName)
    await selectTemplateCoach('王文豪')
    await directTemplateDialog.getByTestId('template-enabled-switch').tap()
    const reusedSaved = await saveTemplateOnce()
    assert.equal(reusedSaved.venue_id, customVenue.id)
    // The fixture observes the component draft before the real service whitelists the RPC DTO.
    // Existing venue identity wins even when that draft also retains its canonical display name.
    assert.ok(!reusedSaved.venue_name || reusedSaved.venue_name === customVenueName)
    assert.equal(reusedSaved.is_active, false)
    assert.equal(await page.evaluate(() => window.__coachFixture.venues.length), originalVenueCount + 1)
    record(width, 'reopened custom venue is selectable by existing ID without creating another dictionary entry', reusedSaved)

    await createTemplate.tap()
    await selectVenue('取消的場地')
    const savesBeforeCancel = (await templateCalls()).length
    await directTemplateDialog.getByRole('button', { name: '關閉', exact: true }).tap()
    await page.getByRole('dialog', { name: '未儲存的變更' }).getByRole('button', { name: '捨棄變更', exact: true }).tap()
    await directTemplateDialog.waitFor({ state: 'hidden' })
    assert.equal((await templateCalls()).length, savesBeforeCancel)
    assert.equal(await page.evaluate(() => window.__coachFixture.venues.some((row) => row.name === '取消的場地')), false)
    await openTemplateManager()
    await createTemplate.tap()
    await templateVenue.tap()
    await page.locator('.el-select-dropdown:visible').getByRole('option', { name: customVenueName, exact: true }).waitFor()
    assert.equal(await page.locator('.el-select-dropdown:visible').getByRole('option', { name: '取消的場地', exact: true }).count(), 0)
    await templateVenue.locator('.el-select__suffix').tap()
    await directTemplateDialog.getByRole('button', { name: '關閉', exact: true }).tap()
    await directTemplateDialog.waitFor({ state: 'hidden' })
    assert.equal(await page.evaluate(() => window.__coachFixture.calls.filter((call) => call.action === 'saveSchedule').length), scheduleWriteCount)
    record(width, 'cancelled custom venue leaves no dictionary entry or schedule changes')

    await openTemplateManager()
    await createTemplate.tap()
    await checkTemplateControls(directTemplateDialog, 'role-grouped coach selection')
    await templateCoaches.tap()
    await coachDropdown.getByRole('option', { name: '陳志豪', exact: true }).waitFor()
    await waitGroupLabels(['總教練', '教練'])
    assert.deepEqual(await groupLabels(), ['總教練', '教練'])
    assert.deepEqual(await coachDropdown.getByRole('option').allTextContents(), ['陳志豪', '王文豪', '張國強'])
    record(width, 'coach options group by loaded role metadata and sort names within each group')

    await page.evaluate(() => {
      window.__coachPermissions.roles = window.__coachPermissions.roles.map((role) => ({
        ...role, weight: role.role_key === 'COACH' ? 5 : role.role_key === 'HEAD_COACH' ? 30 : role.weight
      }))
    })
    await waitGroupLabels(['教練', '總教練'])
    assert.deepEqual(await coachDropdown.getByRole('option').allTextContents(), ['王文豪', '張國強', '陳志豪'])
    record(width, 'updated role weights reverse visible coach group order')

    await page.evaluate(() => {
      window.__coachPermissions.roles = window.__coachPermissions.roles.map((role) => ({
        ...role, role_name: role.role_key === 'HEAD_COACH' ? '總教練新名稱' : role.role_key === 'COACH' ? '教練新名稱' : role.role_name
      }))
    })
    await waitGroupLabels(['教練新名稱', '總教練新名稱'])
    record(width, 'coach group labels follow renamed role metadata')
    await capture('template-coach-role-groups')

    await templateCoaches.locator('input').fill('王')
    await coachDropdown.getByRole('option', { name: '王文豪', exact: true }).waitFor()
    await waitGroupLabels(['教練新名稱'])
    assert.equal(await coachDropdown.getByRole('option').count(), 1)
    await coachDropdown.getByRole('option', { name: '王文豪', exact: true }).tap()
    await templateCoaches.locator('input').fill('陳')
    await coachDropdown.getByRole('option', { name: '陳志豪', exact: true }).waitFor()
    await waitGroupLabels(['總教練新名稱'])
    assert.equal(await coachDropdown.getByRole('option').count(), 1)
    await coachDropdown.getByRole('option', { name: '陳志豪', exact: true }).tap()
    await templateCoaches.locator('.el-select__suffix').tap()
    assert.equal(await templateCoaches.locator('input').getAttribute('aria-expanded'), 'false')
    assert.deepEqual(await templateCoaches.locator('.el-tag__content').allTextContents(), ['王文豪', '陳志豪'])
    record(width, 'Chinese coach filtering hides empty role groups and preserves selections across groups')

    await selectVenue('河濱球場')
    await templateName.fill('跨組固定教練')
    await directTemplateDialog.getByTestId('template-enabled-switch').tap()
    await directTemplateDialog.locator('.el-dialog__body').evaluate((element) => { element.scrollTop = element.scrollHeight })
    await noOverflow('.el-dialog:visible .el-dialog__body')
    await capture('template-cross-role-selection')
    const groupedSaved = await saveTemplateOnce()
    assert.deepEqual(groupedSaved.coach_profile_ids, ['coach-a', 'coach-c'])
    assert.equal(groupedSaved.venue_id, 'venue-c')
    assert.equal(groupedSaved.name, '跨組固定教練')
    assert.equal(groupedSaved.is_active, false)
    await directTemplateDialog.getByRole('button', { name: '關閉', exact: true }).tap()
    await directTemplateDialog.waitFor({ state: 'hidden' })
    assert.equal(await page.evaluate(() => window.__coachFixture.calls.filter((call) => call.action === 'saveSchedule').length), scheduleWriteCount)
    record(width, 'first-touch template save preserves coach profile IDs across role groups without schedule writes', groupedSaved)

    await firstCoach.tap()
    await coachDropdown.getByRole('option', { name: '陳志豪', exact: true }).waitFor()
    await waitGroupLabels(['教練新名稱', '總教練新名稱'])
    assert.deepEqual(await coachDropdown.getByRole('option').allTextContents(), ['王文豪', '張國強', '陳志豪'])
    await capture('schedule-card-coach-role-groups')
    await firstCoach.locator('input').fill('陳')
    await waitGroupLabels(['總教練新名稱'])
    await coachDropdown.getByRole('option', { name: '陳志豪', exact: true }).tap()
    await firstCoach.locator('.el-select__suffix').tap()
    const cardSaveCount = await page.evaluate(() => window.__coachFixture.calls.filter((call) => call.action === 'saveSchedule').length)
    await first.getByRole('button', { name: '更新排班', exact: true }).tap()
    await page.waitForFunction((count) => window.__coachFixture.calls.filter((call) => call.action === 'saveSchedule').length === count + 1, cardSaveCount)
    const groupedCardSaved = await page.evaluate(() => window.__coachFixture.calls.filter((call) => call.action === 'saveSchedule').at(-1).data)
    assert.deepEqual(groupedCardSaved.coach_profile_ids, ['coach-a', 'coach-c'])
    await first.getByText('已指派教練：王文豪、陳志豪').waitFor()
    await noOverflow()
    record(width, 'card role metadata updates retain cross-group IDs and first-touch schedule save', groupedCardSaved)
    await verifyCoachMonthOverview({ page, width, checkDialog, capture, noOverflow, record, waitGroupLabels })
    await context.close()
  }
  assert.deepEqual(evidence.externalRequests, [])
  assert.deepEqual(evidence.consoleErrors, [])
  evidence.result = 'PASS'
  evidence.limits = 'Chromium simulated mobile widths with real Vue/Element Plus and isolated API fixtures; not physical iPhone, production RPC, push delivery or safe-area hardware validation.'
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ result: 'PASS', checks: evidence.checks.length, output }))
} catch (error) {
  if (browser) {
    const failedPage = browser.contexts().flatMap((context) => context.pages())[0]
    if (failedPage) {
      const path = resolve(output, 'failed-state.png')
      await failedPage.screenshot({ path }).catch(() => {})
      evidence.screenshots.push(path)
      evidence.failedBody = await failedPage.locator('body').innerText().catch(() => '')
      evidence.failedDropdowns = await failedPage.locator('.el-dropdown, .el-dropdown__popper').evaluateAll((elements) => elements.map((element) => element.outerHTML)).catch(() => [])
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
