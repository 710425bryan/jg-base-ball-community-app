import assert from 'node:assert/strict'
import { verifyCoachUnassignedFilter } from './coach-unassigned-filter.mjs'

/** This scenario starts only after the existing leave, template and schedule regression. */
export const verifyCoachMonthOverview = async ({ page, width, checkDialog, capture, noOverflow, record, waitGroupLabels }) => {
  await page.evaluate(() => window.__enableCoachMonthOverviewFixture())
  await page.locator('.app-page-header-actions').getByRole('button', { name: '更多', exact: true }).tap()
  await page.getByRole('menuitem', { name: '重新整理', exact: true }).tap()
  const cards = page.getByTestId('coach-schedule-event')
  await cards.filter({ hasText: '月初晨間訓練' }).waitFor()

  const schedulingCard = cards.filter({ hasText: '全月訓練 22 日' })
  const schedulingSelect = schedulingCard.getByTestId('card-coaches-select')
  await schedulingSelect.tap()
  const dropdown = page.locator('.el-select-dropdown:visible')
  await dropdown.getByRole('option', { name: '林排班', exact: true }).waitFor()
  await waitGroupLabels(['總教練', '排班教練', '教練'])
  assert.deepEqual(await dropdown.getByRole('option').allTextContents(), ['陳志豪', '林排班', '王文豪', '張國強'])
  await schedulingSelect.locator('input').fill('林')
  await waitGroupLabels(['排班教練'])
  await dropdown.getByRole('option', { name: '林排班', exact: true }).tap()
  await schedulingSelect.locator('.el-select__suffix').tap()
  await schedulingCard.getByRole('button', { name: '儲存排班', exact: true }).tap()
  await page.waitForFunction(() => window.__coachFixture.calls.some((call) => call.action === 'saveSchedule' && call.data.schedule_date === '2026-10-22' && call.data.coach_profile_ids.includes('coach-scheduling')))
  await schedulingCard.getByText('已指派教練：林排班').waitFor()
  const schedulingSaved = await page.evaluate(() => window.__coachFixture.calls.filter((call) => call.action === 'saveSchedule').at(-1).data)
  assert.deepEqual(schedulingSaved.coach_profile_ids, ['coach-scheduling'])
  record(width, 'verified SCHEDULINGCOACH candidate groups at weight 15 and saves exact coach ID on first touch', schedulingSaved)

  const expectedCount = await page.evaluate(() => window.__coachFixture.events.filter((event) => event.schedule_date.startsWith('2026-10-')).length)
  let writeCount = await page.evaluate(() => window.__coachFixture.calls.filter((call) => call.action === 'saveSchedule').length)
  const overviewButton = page.getByTestId('open-month-overview')
  const buttonBounds = await overviewButton.boundingBox()
  assert.ok(buttonBounds.width >= 44 && buttonBounds.height >= 44)
  record(width, 'month overview visible trigger has a 44px touch target', buttonBounds)
  const open = async () => {
    const previousReads = await page.evaluate(() => window.__coachFixture.calls.filter((call) => call.action === 'listScheduleMonth').length)
    await overviewButton.tap()
    const dialog = await checkDialog()
    await dialog.getByTestId('month-overview-event').filter({ hasText: '月初晨間訓練' }).waitFor()
    assert.equal(await dialog.getByRole('button', { name: '重新整理', exact: true }).count(), 0)
    assert.deepEqual(await dialog.locator('.el-dialog__footer').getByRole('button').allTextContents(), ['關閉'])
    assert.ok(await page.evaluate((count) => window.__coachFixture.calls.filter((call) => call.action === 'listScheduleMonth').length > count, previousReads))
    return dialog
  }
  const close = async (dialog) => {
    await dialog.getByRole('button', { name: '關閉', exact: true }).tap()
    await dialog.waitFor({ state: 'hidden' })
  }
  const verifyAllRows = async (dialog) => {
    assert.equal(await dialog.getByTestId('month-overview-event').count(), expectedCount)
    const dates = await dialog.getByTestId('month-overview-date-group').evaluateAll((groups) => groups.map((group) => group.dataset.date))
    assert.equal(dates[0], '2026-10-01')
    assert.equal(dates.at(-1), '2026-10-31')
    assert.deepEqual(dates, [...dates].sort())
    const sameDay = dialog.locator('[data-test="month-overview-date-group"][data-date="2026-10-15"]')
    assert.equal(await sameDay.getByTestId('month-overview-event').count(), 4)
    for (const title of ['十月友誼賽', '十月投捕特訓', '同日雙場地甲課', '同日雙場地乙課']) await sameDay.getByText(title, { exact: true }).waitFor()
    assert.match(await sameDay.innerText(), /市立棒球場/)
    assert.match(await sameDay.innerText(), /中港國小練習場/)
    const badgeColors = async (title) => sameDay.getByTestId('month-overview-event').filter({ hasText: title }).getByTestId('month-overview-source').evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor, text: getComputedStyle(element).color,
      rowBackground: getComputedStyle(element.closest('article')).backgroundColor,
      rowBorder: getComputedStyle(element.closest('article')).borderLeftColor,
      rowBorderWidth: getComputedStyle(element.closest('article')).borderLeftWidth
    }))
    const venueColor = await badgeColors('同日雙場地甲課')
    const matchColor = await badgeColors('十月友誼賽')
    assert.notEqual(venueColor.background, matchColor.background)
    assert.notEqual(venueColor.text, matchColor.text)
    assert.notEqual(venueColor.rowBackground, matchColor.rowBackground)
    assert.notEqual(venueColor.rowBorder, matchColor.rowBorder, JSON.stringify({ venueColor, matchColor }))
    assert.equal(venueColor.rowBorderWidth, '4px')
    assert.equal(matchColor.rowBorderWidth, '4px')
    assert.notEqual(venueColor.background, 'rgba(0, 0, 0, 0)')
    assert.notEqual(matchColor.background, 'rgba(0, 0, 0, 0)')
    const first = dialog.getByTestId('month-overview-event').filter({ hasText: '月初晨間訓練' })
    assert.match(await first.innerText(), /08:00[\s\S]*10:00/)
    assert.match(await first.innerText(), /林排班/)
    assert.match(await dialog.getByTestId('month-overview-event').filter({ hasText: '全月訓練 22 日' }).innerText(), /林排班/)
    assert.match(await dialog.getByTestId('month-overview-event').filter({ hasText: '全月訓練 28 日' }).innerText(), /未指派|尚未指派|待補/)
    assert.match(await dialog.getByTestId('month-overview-event').filter({ hasText: '月底取消訓練' }).innerText(), /取消/)
    assert.equal(await dialog.getByText('十一月獨立訓練', { exact: true }).count(), 0)
    return { venueColor, matchColor }
  }

  for (const label of ['全部', '場地訓練', '週六訓練', '比賽', '特訓課', '手動排班']) {
    const filter = page.locator('button[aria-pressed]').filter({ hasText: new RegExp(`^${label}`) })
    await filter.tap()
    assert.equal(await filter.getAttribute('aria-pressed'), 'true')
    const dialog = await open()
    const colors = await verifyAllRows(dialog)
    await noOverflow('.el-dialog:visible .el-dialog__body')
    record(width, 'overview reads all sources independently of card filter', { filter: label, events: expectedCount })
    if (label === '全部') {
      await capture('month-overview-start')
      const body = dialog.locator('.el-dialog__body')
      const bounds = await body.boundingBox()
      assert.ok(await body.evaluate((element) => element.scrollHeight > element.clientHeight))
      const touch = await page.context().newCDPSession(page)
      const point = { x: Math.floor(width / 2), y: Math.floor(bounds.y + bounds.height - 30) }
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
      for (let step = 1; step <= 6; step += 1) {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, y: Math.floor(point.y - step * (bounds.height - 60) / 6) }] })
        await new Promise((resolve) => setTimeout(resolve, 16))
      }
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForFunction(() => document.querySelector('.coach-month-overview-dialog .el-dialog__body')?.scrollTop > 0)
      await touch.detach()
      await body.evaluate((element) => { element.scrollTop = element.scrollHeight })
      await capture('month-overview-end')
      record(width, 'month overview supports internal touch scrolling through the final date with fixed footer')
      const sameDay = dialog.locator('[data-test="month-overview-date-group"][data-date="2026-10-15"]')
      await sameDay.scrollIntoViewIfNeeded()
      await capture('month-overview-source-colors')
      record(width, 'venue training and match source badges and rows have distinct colors with close-only footer', colors)
    }
    await close(dialog)
  }
  writeCount = await verifyCoachUnassignedFilter({ page, width, cards, expectedCount, open, close, verifyAllRows, noOverflow, record, capture })

  await page.locator('button[aria-pressed]').filter({ hasText: /^全部/ }).tap()
  const firstCard = cards.filter({ hasText: '月初晨間訓練' })
  const firstCoach = firstCard.getByTestId('card-coaches-select')
  await firstCoach.tap()
  await firstCoach.locator('input').fill('王')
  await dropdown.getByRole('option', { name: '王文豪', exact: true }).tap()
  await firstCoach.locator('.el-select__suffix').tap()
  await page.getByText('有未儲存的變更。', { exact: false }).waitFor()
  // Mutate the simulated backend only. The page keeps its independent dirty form and old event copy.
  await page.evaluate(() => {
    const event = window.__coachFixture.events.find((row) => row.id === 'overview-first')
    event.coach_profile_ids = ['coach-c']
    event.assignments = [{ coach_profile_id: 'coach-c', coach_name: '陳志豪', coach_nickname: null, coach_role: 'HEAD_COACH' }]
    event.updated_at = 'overview-v2'
  })
  const dirtyDialog = await open()
  await dirtyDialog.getByTestId('month-overview-dirty').waitFor()
  const freshFirst = dirtyDialog.getByTestId('month-overview-event').filter({ hasText: '月初晨間訓練' })
  assert.match(await freshFirst.innerText(), /陳志豪/)
  assert.doesNotMatch(await freshFirst.innerText(), /王文豪|林排班/)
  record(width, 'overview shows fresh saved coach data while dirty page draft remains separate')
  await capture('month-overview-dirty-snapshot', { directViewport: true })

  await page.evaluate(() => {
    const event = window.__coachFixture.events.find((row) => row.id === 'overview-last')
    event.title = '月底訓練已更新'
    event.status = 'scheduled'
    event.coach_profile_ids = ['coach-scheduling']
    event.assignments = [{ coach_profile_id: 'coach-scheduling', coach_name: '林排班', coach_nickname: null, coach_role: 'SCHEDULINGCOACH' }]
    event.updated_at = 'overview-v2'
  })
  const priorReads = await page.evaluate(() => window.__coachFixture.calls.filter((call) => call.action === 'listScheduleMonth').length)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  const refreshed = dirtyDialog.getByTestId('month-overview-event').filter({ hasText: '月底訓練已更新' })
  await refreshed.waitFor()
  assert.match(await refreshed.innerText(), /林排班/)
  assert.equal(await page.evaluate(() => window.__coachFixture.calls.filter((call) => call.action === 'listScheduleMonth').length), priorReads + 1)
  await dirtyDialog.getByTestId('month-overview-dirty').waitFor()
  await noOverflow('.el-dialog:visible .el-dialog__body')
  await page.evaluate(() => {
    window.__coachFixture.failNextMonthRead = true
    window.dispatchEvent(new Event('focus'))
  })
  await dirtyDialog.getByTestId('month-overview-error').getByText('Fixture 月份總覽讀取失敗', { exact: true }).waitFor()
  const errorLayout = await dirtyDialog.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const footer = element.querySelector('.el-dialog__footer').getBoundingClientRect()
    const header = element.querySelector('.el-dialog__header').getBoundingClientRect()
    const targets = [element.querySelector('.el-dialog__headerbtn'), element.querySelector('[data-test="close-month-overview"]')].map((button) => {
      const bounds = button.getBoundingClientRect()
      const style = getComputedStyle(button)
      return { name: button.getAttribute('data-test') || 'dialog-header-close', opacity: style.opacity, visibility: style.visibility,
        hit: button.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)) }
    })
    return { top: rect.top, height: rect.height, headerTop: header.top, footerTop: footer.top,
      footerBottom: footer.bottom, overlayScrollTop: element.closest('.el-overlay-dialog')?.scrollTop, targets }
  })
  record(width, 'error state preserves full mobile dialog geometry', errorLayout)
  assert.ok(errorLayout.targets.every((target) => target.hit && target.visibility === 'visible' && target.opacity === '1'), JSON.stringify(errorLayout))
  await checkDialog()
  assert.equal(await dirtyDialog.getByTestId('month-overview-event').count(), 0)
  await dirtyDialog.getByTestId('month-overview-dirty').waitFor()
  const failedReads = await page.evaluate(() => window.__coachFixture.calls.filter((call) => call.action === 'listScheduleMonth').length)
  const retry = dirtyDialog.getByTestId('month-overview-error').getByRole('button', { name: '重試', exact: true })
  assert.equal(await dirtyDialog.getByRole('button', { name: '重試', exact: true }).count(), 1)
  const retryBounds = await retry.boundingBox()
  assert.ok(retryBounds.width >= 44 && retryBounds.height >= 44)
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await capture('month-overview-error-retry', { directViewport: true })
  await retry.tap()
  await refreshed.waitFor()
  assert.equal(await dirtyDialog.getByTestId('month-overview-error').count(), 0)
  assert.equal(await page.evaluate(() => window.__coachFixture.calls.filter((call) => call.action === 'listScheduleMonth').length), failedReads + 1)
  record(width, 'failed overview read exposes error without stale rows and one error-only 44px retry with draft preserved', retryBounds)

  await page.evaluate(() => {
    const event = window.__coachFixture.events.find((row) => row.title === '全月訓練 20 日')
    event.title = '回到前景後的最新訓練'
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await dirtyDialog.getByText('回到前景後的最新訓練', { exact: true }).waitFor()
  await dirtyDialog.getByTestId('month-overview-dirty').waitFor()
  record(width, 'foreground refresh updates independent overview snapshot while card draft remains dirty')
  await close(dirtyDialog)
  assert.match(await firstCoach.innerText(), /林排班/)
  // A collapsed multi-select's middle contains its tag tooltip; open with its existing arrow.
  await firstCoach.locator('.el-select__suffix').tap()
  const draftCoach = dropdown.getByRole('option', { name: '王文豪', exact: true })
  await draftCoach.waitFor()
  assert.equal(await draftCoach.getAttribute('aria-selected'), 'true')
  assert.equal(await dropdown.getByRole('option', { name: '林排班', exact: true }).getAttribute('aria-selected'), 'true')
  assert.equal(await dropdown.getByRole('option', { name: '陳志豪', exact: true }).getAttribute('aria-selected'), 'false')
  await firstCoach.locator('.el-select__suffix').tap()
  assert.equal(await page.evaluate(() => window.__coachFixture.calls.filter((call) => call.action === 'saveSchedule').length), writeCount)
  record(width, 'automatic overview refresh reads once without writing schedules or replacing the unsaved card form')

  const month = page.locator('.el-form-item').filter({ hasText: '排班月份' }).locator('input')
  await month.tap()
  await page.locator('.el-month-table:visible td').nth(10).tap()
  await page.getByRole('dialog', { name: '未儲存的變更' }).getByRole('button', { name: '捨棄變更', exact: true }).tap()
  await page.waitForFunction(() => location.hash.includes('month=2026-11'))
  await cards.filter({ hasText: '十一月獨立訓練' }).waitFor()
  await page.getByRole('dialog', { name: '未儲存的變更' }).waitFor({ state: 'hidden' })
  // The async discard confirmation can leave the Element Plus month popover open.
  await page.getByRole('heading', { name: /^教練排班表/ }).tap()
  await page.locator('.el-month-table:visible').waitFor({ state: 'hidden' })
  await overviewButton.tap()
  const november = await checkDialog()
  await november.getByText('十一月獨立訓練', { exact: true }).waitFor()
  assert.equal(await november.getByTestId('month-overview-event').count(), 1)
  assert.equal(await november.getByTestId('month-overview-date-group').getAttribute('data-date'), '2026-11-01')
  assert.equal(await november.getByText('月初晨間訓練', { exact: true }).count(), 0)
  assert.equal(await november.getByTestId('month-overview-dirty').count(), 0)
  await capture('month-overview-next-month')
  await close(november)
  assert.equal(await page.evaluate(() => window.__coachFixture.calls.filter((call) => call.action === 'saveSchedule').length), writeCount)
  record(width, 'month change reads only the new month after explicit draft discard and does not write schedules')
}
