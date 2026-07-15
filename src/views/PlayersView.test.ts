import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./PlayersView.vue', import.meta.url), 'utf8')

describe('PlayersView new member notification ownership', () => {
  it('leaves new member notification delivery to the database outbox', () => {
    expect(source).not.toContain('notifyInsertedMembers')
    expect(source).not.toContain("buildPushEventKey('team_member'")
    expect(source).not.toContain('dispatchPushNotification')
    expect(source).not.toContain(".insert(dedupedInserts)\n        .select")
    expect(source).not.toContain(".insert(payload)\n        .select")
  })
})

describe('PlayersView mobile filters', () => {
  it('shows advanced selects only in the bottom sheet on narrow screens', () => {
    expect(source).toContain('players-toolbar-filters hidden')

    const narrowScreenStyles = source.slice(source.indexOf('@media (max-width: 639px)'))
    expect(narrowScreenStyles).toMatch(/\.players-toolbar-filters\s*\{\s*display:\s*none;/)
    expect(narrowScreenStyles).not.toMatch(/\.players-toolbar-filters\s*\{\s*display:\s*grid;/)
  })
})
