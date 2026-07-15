import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./AttendanceListView.vue', import.meta.url), 'utf8')

describe('AttendanceListView roster count query', () => {
  it('does not request restricted team member columns when only a count is needed', () => {
    expect(source).toContain(".select('id', { count: 'exact', head: true })")
    expect(source).not.toContain(".from('team_members')\n      .select('*', { count: 'exact', head: true })")
  })
})
