import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./MainLayout.vue', import.meta.url), 'utf8')

describe('MainLayout team member notification security', () => {
  it('does not subscribe to raw team member changes or dispatch member pushes in the browser', () => {
    expect(source).not.toContain("channel('team-members-channel')")
    expect(source).not.toContain("table: 'team_members' },\n          (payload)")
    expect(source).not.toContain("buildPushEventKey('team_member'")
    expect(source).not.toContain('收到 team_members 最新資料！Payload')
  })
})
