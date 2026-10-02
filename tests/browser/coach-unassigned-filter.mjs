import assert from 'node:assert/strict'

export const verifyCoachUnassignedFilter = async ({ page, width, cards, expectedCount, open, close, verifyAllRows, noOverflow, record, capture }) => {
  for (const label of ['候選活動', '已儲存', '已指派教練']) {
    assert.equal(await page.getByText(new RegExp(`^${label}\\s*\\d+$`)).count(), 0)
  }
  record(width, 'schedule page removes the three read-only statistics')
  const toggle = page.getByTestId('filter-unassigned')
  const bounds = await toggle.boundingBox()
  assert.ok(bounds.width >= 44 && bounds.height >= 44)
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false')
  record(width, 'unassigned coach filter has a 44px first-touch toggle', bounds)
  const types = { '全部': null, '場地訓練': 'training_location', '週六訓練': 'training_date', '比賽': 'match', '特訓課': 'training_class', '手動排班': 'manual' }
  const expectedUnassigned = (source) => page.evaluate((type) => window.__coachFixture.events
    .filter((event) => event.schedule_date.startsWith('2026-10-') && (!type || event.source_type === type) && !event.coach_profile_ids.length)
    .map((event) => event.title).sort(), source)
  const waitForTitles = (titles) => page.waitForFunction((expected) => {
    const actual = [...document.querySelectorAll('[data-test="coach-schedule-event"] h3')].map((element) => element.textContent.trim()).sort()
    return JSON.stringify(actual) === JSON.stringify(expected)
  }, titles)
  const initialWrites = await page.evaluate(() => window.__coachFixture.calls.filter((call) => call.action === 'saveSchedule').length)
  for (const [label, type] of Object.entries(types)) {
    await page.locator('button[aria-pressed]').filter({ hasText: new RegExp(`^${label}`) }).tap()
    if (await toggle.getAttribute('aria-pressed') === 'false') await toggle.tap()
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true')
    const expected = await expectedUnassigned(type)
    await waitForTitles(expected)
    assert.equal(await toggle.locator('span').innerText(), String(expected.length))
    if (label === '全部') {
      await page.getByRole('heading', { name: /^教練排班表/ }).scrollIntoViewIfNeeded()
      await capture('unassigned-filter-page')
    }
    if (!expected.length) await page.getByText('目前篩選條件下沒有未指派教練的活動。', { exact: true }).waitFor()
    if (label === '場地訓練') {
      await cards.filter({ hasText: '月底取消訓練' }).getByText('已取消', { exact: true }).waitFor()
      await capture('unassigned-cancelled-filter')
    }
    const dialog = await open()
    await verifyAllRows(dialog)
    assert.equal(await dialog.getByTestId('month-overview-event').count(), expectedCount)
    await close(dialog)
    await noOverflow()
    record(width, 'unassigned filter intersects each source and leaves the full month overview intact', { source: label, titles: expected })
  }
  assert.equal(await page.evaluate(() => window.__coachFixture.calls.filter((call) => call.action === 'saveSchedule').length), initialWrites)
  await page.locator('button[aria-pressed]').filter({ hasText: /^全部/ }).tap()
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true')
  const expected = await expectedUnassigned(null)
  await waitForTitles(expected)

  const draftCard = cards.filter({ hasText: '全月訓練 26 日' })
  const select = draftCard.getByTestId('card-coaches-select')
  await select.tap()
  await select.locator('input').fill('王')
  await page.locator('.el-select-dropdown:visible').getByRole('option', { name: '王文豪', exact: true }).tap()
  await select.locator('.el-select__suffix').tap()
  await waitForTitles(expected)
  await draftCard.waitFor()
  assert.match(await select.innerText(), /王文豪/)
  record(width, 'unassigned filter uses saved assignments and keeps an unsaved coach draft visible')
  await draftCard.getByRole('button', { name: '儲存排班', exact: true }).tap()
  await page.waitForFunction((count) => window.__coachFixture.calls.filter((call) => call.action === 'saveSchedule').length === count + 1, initialWrites)
  await draftCard.waitFor({ state: 'hidden' })
  const updated = await expectedUnassigned(null)
  await waitForTitles(updated)
  assert.equal(updated.length, expected.length - 1)
  assert.equal(await toggle.locator('span').innerText(), String(updated.length))
  const saved = await page.evaluate(() => window.__coachFixture.calls.filter((call) => call.action === 'saveSchedule').at(-1).data)
  assert.deepEqual(saved.coach_profile_ids, ['coach-a'])
  record(width, 'first-touch schedule save removes the newly assigned card from the active unassigned filter', saved)
  await toggle.tap()
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false')
  await page.waitForFunction((count) => document.querySelectorAll('[data-test="coach-schedule-event"]').length === count, expectedCount)
  await noOverflow()
  record(width, 'all-source selection preserves the unassigned toggle until explicit first-touch reset')
  return initialWrites + 1
}
